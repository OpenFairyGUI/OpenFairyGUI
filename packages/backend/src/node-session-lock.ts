import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { BackendSessionLock } from './runtime/contracts.js';

const PROCESS_START_TIME = Math.trunc(Date.now() - process.uptime() * 1000);

async function retryLockIo(operation: () => Promise<void>): Promise<void> {
	for (let attempt = 0; ; attempt++) {
		try {
			await operation();
			return;
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (process.platform !== 'win32' || attempt >= 7 || !['EPERM', 'EACCES', 'EBUSY'].includes(code ?? ''))
				throw error;
			await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** attempt));
		}
	}
}
interface NodeLockMetadata {
	schemaVersion: 2;
	processIdentity: string;
	pid: number;
	processStartTime: number;
	hostname: string;
	token: string;
}

function parseLockMetadata(content: string): NodeLockMetadata | null {
	try {
		const value = JSON.parse(content) as Partial<NodeLockMetadata>;
		if (
			value.schemaVersion !== 2 ||
			typeof value.processIdentity !== 'string' ||
			!value.processIdentity ||
			!Number.isSafeInteger(value.pid) ||
			value.pid! <= 0 ||
			!Number.isFinite(value.processStartTime) ||
			typeof value.hostname !== 'string' ||
			typeof value.token !== 'string' ||
			!/^[a-zA-Z0-9_-]+$/.test(value.token)
		)
			return null;
		return value as NodeLockMetadata;
	} catch {
		return null;
	}
}

const execute = promisify(execFile);

/** OS creation identity distinguishes a live process from a later process reusing its PID. */
async function processIdentity(pid: number): Promise<string | null> {
	try {
		if (process.platform === 'linux') {
			const [stat, boot] = await Promise.all([
				fs.readFile(`/proc/${pid}/stat`, 'utf8'),
				fs.readFile('/proc/sys/kernel/random/boot_id', 'utf8'),
			]);
			const start = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
			return start ? `linux:${boot.trim()}:${start}` : null;
		}
		if (process.platform === 'win32') {
			// Query the process directly: do not depend on Get-Process cmdlet/module loading in MCP hosts.
			const pending = execute(
				'powershell.exe',
				[
					'-NoProfile',
					'-NonInteractive',
					'-Command',
					`[System.Diagnostics.Process]::GetProcessById(${pid}).StartTime.ToUniversalTime().Ticks`,
				],
				// Windows PowerShell cold startup can exceed five seconds on hosted runners.
				{ windowsHide: true, timeout: 15_000 },
			);
			// This command never reads input. Close the pipe so Windows PowerShell cannot wait for EOF.
			pending.child?.stdin?.end();
			const { stdout } = await pending;
			return /^\d+$/.test(stdout.trim()) ? `win32:${stdout.trim()}` : null;
		}
		const { stdout } = await execute('ps', ['-p', String(pid), '-o', 'lstart='], {
			env: { ...process.env, LC_ALL: 'C' },
			timeout: 5000,
		});
		return stdout.trim() ? `unix:${stdout.trim()}` : null;
	} catch {
		return null;
	}
}
let ownIdentity: Promise<string | null> | undefined;

async function getOwnIdentity(): Promise<string | null> {
	const pending = (ownIdentity ??= processIdentity(process.pid));
	const identity = await pending;
	// Coalesce concurrent probes, but a transient failure must not poison the process forever.
	if (identity === null && ownIdentity === pending) ownIdentity = undefined;
	return identity;
}

async function isProcessAlive(metadata: NodeLockMetadata): Promise<boolean> {
	if (metadata.hostname !== os.hostname()) return true;
	try {
		process.kill(metadata.pid, 0);
	} catch (error) {
		return (error as NodeJS.ErrnoException).code !== 'ESRCH';
	}
	const identity = metadata.pid === process.pid ? await getOwnIdentity() : await processIdentity(metadata.pid);
	// Permission failures and unavailable OS probes never authorize reclaiming a live PID.
	return identity === null || identity === metadata.processIdentity;
}

/** Lamport's bakery doorway serializes short lock-file operations across processes.
 * Each contender owns a unique file, so removing a dead contender cannot remove a newer owner.
 * The directory is retained: deleting it while another contender enters would split the doorway.
 */
async function coordinateLock<T>(filePath: string, action: () => Promise<T>): Promise<T> {
	const directory = `${filePath}.coordination`;
	await fs.mkdir(directory, { recursive: true });
	const identity = await getOwnIdentity();
	if (!identity) throw new Error('Unable to determine lock coordination owner identity.');
	const token = randomUUID();
	const candidate = path.join(directory, token);
	const temporary = path.join(directory, `.${token}.tmp`);
	const ticketPath = path.join(directory, `.ticket-${token}`);
	const owner: NodeLockMetadata & { ticket: number } = {
		schemaVersion: 2,
		pid: process.pid,
		processStartTime: PROCESS_START_TIME,
		processIdentity: identity,
		hostname: os.hostname(),
		token,
		ticket: 0,
	};
	const publish = async (): Promise<void> => {
		await fs.writeFile(temporary, JSON.stringify(owner));
		await retryLockIo(() => fs.link(temporary, candidate));
		await retryLockIo(() => fs.unlink(temporary));
	};
	const readContender = async (name: string): Promise<(NodeLockMetadata & { ticket: number }) | null> => {
		try {
			const content = await fs.readFile(path.join(directory, name), 'utf8');
			const metadata = parseLockMetadata(content);
			const ticketFile = path.join(directory, `.ticket-${name}`);
			const ticket: number = await fs
				.readFile(ticketFile, 'utf8')
				.then(Number, (error: NodeJS.ErrnoException) => {
					if (error.code === 'ENOENT') return 0;
					throw error;
				});
			if (!metadata || !Number.isSafeInteger(ticket) || (ticket as number) < 0)
				throw new Error('Invalid lock coordination record.');
			if (!(await isProcessAlive(metadata))) {
				await retryLockIo(() => fs.unlink(path.join(directory, name))).catch(() => undefined);
				await retryLockIo(() => fs.unlink(ticketFile)).catch(() => undefined);
				return null;
			}
			return { ...metadata, ticket: ticket as number };
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
			throw error;
		}
	};
	try {
		await publish();
		let maximum = 0;
		for (const name of await fs.readdir(directory)) {
			if (name.startsWith('.') || name === token) continue;
			maximum = Math.max(maximum, (await readContender(name))?.ticket ?? 0);
		}
		owner.ticket = maximum + 1;
		await fs.writeFile(temporary, String(owner.ticket), { flag: 'wx' });
		await retryLockIo(() => fs.link(temporary, ticketPath));
		await retryLockIo(() => fs.unlink(temporary));
		const deadline = Date.now() + 15_000;
		for (;;) {
			let waiting = false;
			for (const name of await fs.readdir(directory)) {
				if (name.startsWith('.') || name === token) continue;
				const other = await readContender(name);
				if (
					other &&
					(other.ticket === 0 ||
						other.ticket < owner.ticket ||
						(other.ticket === owner.ticket && name < token))
				) {
					waiting = true;
					break;
				}
			}
			if (!waiting) return await action();
			if (Date.now() >= deadline)
				throw Object.assign(new Error('Lock coordination is busy.'), { code: 'EEXIST' });
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
	} finally {
		await retryLockIo(() => fs.unlink(candidate)).catch(() => undefined);
		await retryLockIo(() => fs.unlink(ticketPath)).catch(() => undefined);
		await retryLockIo(() => fs.unlink(temporary)).catch(() => undefined);
	}
}

/** A creator writes metadata right after creating the lock; an unwritten lock this old was left by a crash. */
const UNWRITTEN_LOCK_STALE_MS = 30_000;

function isUnwrittenLock(content: string): boolean {
	if (!content.trim()) return true;
	try {
		JSON.parse(content);
		return false;
	} catch {
		return true;
	}
}

async function readLockFile(filePath: string): Promise<{ content: string; modifiedAt: number } | null> {
	try {
		const [content, stat] = await Promise.all([fs.readFile(filePath, 'utf-8'), fs.stat(filePath)]);
		return { content, modifiedAt: stat.mtimeMs };
	} catch {
		return null;
	}
}

async function recoverStaleLock(filePath: string): Promise<boolean> {
	const before = await readLockFile(filePath);
	if (!before) return false;
	const metadata = parseLockMetadata(before.content);
	const stale = metadata
		? !(await isProcessAlive(metadata))
		: isUnwrittenLock(before.content) && Date.now() - before.modifiedAt > UNWRITTEN_LOCK_STALE_MS;
	if (!stale) return false;
	// Move the lock aside atomically, then confirm it is the one judged stale; another process may have replaced it.
	const claimed = `${filePath}.stale-${randomUUID()}`;
	try {
		await retryLockIo(() => fs.rename(filePath, claimed));
	} catch {
		return false;
	}
	const moved = await readLockFile(claimed);
	if (moved?.content === before.content) {
		if (metadata)
			await retryLockIo(() => fs.unlink(path.join(`${filePath}.coordination`, `.host-${metadata.token}`))).catch(
				() => undefined,
			);
		await fs.unlink(claimed).catch(() => undefined);
		return true;
	}
	// A fresh lock was moved by mistake: put it back unless a newer lock already exists.
	await fs.link(claimed, filePath).catch(() => undefined);
	await fs.unlink(claimed).catch(() => undefined);
	return false;
}

export async function acquireNodeSessionLock(filePath: string): Promise<BackendSessionLock> {
	const identity = await getOwnIdentity();
	if (!identity) throw new Error('Unable to determine the Node lock owner creation identity.');
	const owner: NodeLockMetadata = {
		schemaVersion: 2,
		pid: process.pid,
		processStartTime: PROCESS_START_TIME,
		processIdentity: identity,
		hostname: os.hostname(),
		token: randomUUID(),
	};
	await coordinateLock(filePath, async () => {
		const prepared = `${filePath}.owner-${owner.token}`;
		await fs.writeFile(prepared, JSON.stringify(owner), { flag: 'wx' });
		try {
			try {
				await retryLockIo(() => fs.link(prepared, filePath));
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !(await recoverStaleLock(filePath)))
					throw error;
				await retryLockIo(() => fs.link(prepared, filePath));
			}
		} finally {
			await retryLockIo(() => fs.unlink(prepared));
		}
	});
	let released = false;
	const hostMetadataPath = path.join(`${filePath}.coordination`, `.host-${owner.token}`);
	const assertOwner = async (): Promise<void> => {
		const current = parseLockMetadata(await fs.readFile(filePath, 'utf8'));
		if (!current || current.token !== owner.token)
			throw new Error('Cannot release session lock: invalid or changed ownership metadata');
	};
	return {
		async writeMetadata(content): Promise<void> {
			await coordinateLock(filePath, async () => {
				await assertOwner();
				let supplied: Record<string, unknown> = {};
				try {
					const value: unknown = JSON.parse(content);
					if (value && typeof value === 'object' && !Array.isArray(value))
						supplied = value as Record<string, unknown>;
				} catch {
					/* Optional host metadata never changes ownership. */
				}
				// Ownership stays immutable; optional host data cannot tear or replace the lock record.
				await fs.writeFile(hostMetadataPath, JSON.stringify(supplied));
			});
		},
		async release(): Promise<void> {
			if (released) return;
			await coordinateLock(filePath, async () => {
				try {
					await assertOwner();
					await retryLockIo(() => fs.unlink(filePath));
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
				}
				await retryLockIo(() => fs.unlink(hostMetadataPath)).catch(() => undefined);
				released = true;
			});
		},
	};
}
