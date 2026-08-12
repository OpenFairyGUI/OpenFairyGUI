import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
	BackendRuntime,
	type BackendFileStat,
	type BackendFileSystem,
	type BackendHostAdapter,
	type BackendRuntimeOptions,
	type BackendSessionLock,
} from './runtime.js';

const PROCESS_START_TIME = Math.trunc(Date.now() - process.uptime() * 1000);

interface NodeLockMetadata {
	schemaVersion: 1;
	pid: number;
	processStartTime: number;
	hostname: string;
	token: string;
}

function parseLockMetadata(content: string): NodeLockMetadata | null {
	try {
		const value = JSON.parse(content) as Partial<NodeLockMetadata>;
		if (
			value.schemaVersion !== 1
			|| !Number.isSafeInteger(value.pid)
			|| !Number.isFinite(value.processStartTime)
			|| typeof value.hostname !== 'string'
			|| typeof value.token !== 'string'
		) return null;
		return value as NodeLockMetadata;
	} catch {
		return null;
	}
}

function isProcessAlive(metadata: NodeLockMetadata): boolean {
	if (metadata.hostname !== os.hostname()) return true;
	if (metadata.pid === process.pid) return Math.abs(metadata.processStartTime - PROCESS_START_TIME) < 1000;
	try {
		process.kill(metadata.pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code !== 'ESRCH';
	}
}

async function recoverStaleLock(filePath: string): Promise<boolean> {
	let before: string;
	try {
		before = await fs.readFile(filePath, 'utf-8');
	} catch {
		return false;
	}
	const metadata = parseLockMetadata(before);
	if (!metadata || isProcessAlive(metadata)) return false;
	const current = parseLockMetadata(await fs.readFile(filePath, 'utf-8').catch(() => ''));
	if (!current || current.token !== metadata.token) return false;
	await fs.unlink(filePath);
	return true;
}

async function resolvePathThroughExistingAncestor(filePath: string): Promise<string> {
	const missing: string[] = [];
	let candidate = path.resolve(filePath);
	for (;;) {
		try {
			const resolved = await fs.realpath(candidate);
			return path.join(resolved, ...missing);
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error;
			const parent = path.dirname(candidate);
			if (parent === candidate) return path.resolve(filePath);
			missing.unshift(path.basename(candidate));
			candidate = parent;
		}
	}
}

async function pathExists(filePath: string): Promise<boolean> {
	return fs.stat(filePath).then(
		() => true,
		(error: NodeJS.ErrnoException) => {
			if (error.code === 'ENOENT') return false;
			throw error;
		},
	);
}

async function assertNoSymlinks(dirPath: string): Promise<void> {
	for (const entry of await fs.readdir(dirPath, { withFileTypes: true })) {
		const entryPath = path.join(dirPath, entry.name);
		if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not supported in project directories: ${entryPath}`);
		if (entry.isDirectory()) await assertNoSymlinks(entryPath);
	}
}

function createStagedNodeFileSystem(projectRoot: string, stagingRoot: string): BackendFileSystem {
	const { runProjectWriteTransaction: _, ...base } = createNodeBackendFileSystem();
	const translate = (filePath: string): string => {
		const relative = path.relative(projectRoot, path.resolve(filePath));
		if (relative.startsWith('..') || path.isAbsolute(relative)) {
			const error = new Error(`Project path escapes the staged root: ${filePath}`) as Error & { code: string };
			error.code = 'EACCES';
			throw error;
		}
		return path.join(stagingRoot, relative);
	};
	return {
		...base,
		stat: (filePath) => fs.stat(translate(filePath)),
		async readdir(dirPath) {
			const entries = await fs.readdir(translate(dirPath), { withFileTypes: true });
			const symlink = entries.find((entry) => entry.isSymbolicLink());
			if (symlink) throw new Error(`Symbolic links are not supported in project directories: ${path.join(dirPath, symlink.name)}`);
			return entries.map((entry) => entry.name);
		},
		readFile: (filePath) => fs.readFile(translate(filePath), 'utf-8'),
		async readFileRaw(filePath) {
			const buffer = await fs.readFile(translate(filePath));
			return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
		},
		writeFile: (filePath, content) => fs.writeFile(translate(filePath), content, 'utf-8'),
		writeFileRaw: (filePath, data) => fs.writeFile(translate(filePath), data),
		async mkdir(dirPath, options) {
			await fs.mkdir(translate(dirPath), { recursive: options?.recursive ?? false });
		},
		resolvePath: (filePath) => resolvePathThroughExistingAncestor(translate(filePath)),
		unlink: (filePath) => fs.unlink(translate(filePath)),
		rmdir: (dirPath) => fs.rmdir(translate(dirPath)),
	};
}

async function runNodeProjectWriteTransaction(
	projectRoot: string,
	write: (stagedFileSystem: BackendFileSystem) => Promise<void>,
): Promise<void> {
	const root = path.resolve(projectRoot);
	const parent = path.dirname(root);
	const name = path.basename(root);
	const staging = path.join(parent, `.${name}.save-${randomUUID()}`);
	const backup = path.join(parent, `.${name}.save-backup-${randomUUID()}`);
	const existed = await pathExists(root);
	if (existed) {
		await assertNoSymlinks(root);
		await fs.cp(root, staging, { recursive: true, errorOnExist: true, force: false });
	} else {
		await fs.mkdir(staging, { recursive: true });
	}
	try {
		await write(createStagedNodeFileSystem(root, staging));
	} catch (error) {
		await fs.rm(staging, { recursive: true, force: true });
		throw error;
	}
	if (!existed) {
		await fs.rename(staging, root);
		return;
	}

	// ponytail: two-step rename preserves rollback; use directory exchange if zero reader gap becomes required.
	await fs.rename(root, backup);
	try {
		await fs.rename(staging, root);
	} catch (error) {
		await fs.rename(backup, root);
		await fs.rm(staging, { recursive: true, force: true });
		throw error;
	}
	await fs.rm(backup, { recursive: true, force: true }).catch(() => undefined);
}

export function createNodeBackendFileSystem(): BackendFileSystem {
	return {
		stat(filePath: string): Promise<BackendFileStat> {
			return fs.stat(filePath);
		},
		async readdir(dirPath: string): Promise<string[]> {
			const entries = await fs.readdir(dirPath, { withFileTypes: true });
			const symlink = entries.find((entry) => entry.isSymbolicLink());
			if (symlink) {
				const error = new Error(`Symbolic links are not supported in project directories: ${path.join(dirPath, symlink.name)}`) as Error & { code: string };
				error.code = 'ELOOP';
				throw error;
			}
			return entries.map((entry) => entry.name);
		},
		readFile(filePath: string): Promise<string> {
			return fs.readFile(filePath, 'utf-8');
		},
		async readFileRaw(filePath: string): Promise<Uint8Array> {
			const buffer = await fs.readFile(filePath);
			return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
		},
		writeFile(filePath: string, content: string): Promise<void> {
			return fs.writeFile(filePath, content, 'utf-8');
		},
		writeFileRaw(filePath: string, data: Uint8Array): Promise<void> {
			return fs.writeFile(filePath, data);
		},
		async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
			await fs.mkdir(dirPath, { recursive: options?.recursive ?? false });
		},
		async resolvePath(filePath: string): Promise<string> {
			return resolvePathThroughExistingAncestor(filePath);
		},
		getSessionLockPath(canonicalProjectPath: string): string {
			return path.join(path.dirname(canonicalProjectPath), `.${path.basename(canonicalProjectPath)}.openfairygui.backend.lock`);
		},
		runProjectWriteTransaction: runNodeProjectWriteTransaction,
		async acquireSessionLock(filePath: string): Promise<BackendSessionLock> {
			let handle: Awaited<ReturnType<typeof fs.open>>;
			try {
				handle = await fs.open(filePath, 'wx');
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !(await recoverStaleLock(filePath))) throw error;
				handle = await fs.open(filePath, 'wx');
			}
			const owner = {
				schemaVersion: 1 as const,
				pid: process.pid,
				processStartTime: PROCESS_START_TIME,
				hostname: os.hostname(),
				token: randomUUID(),
				createdAt: new Date().toISOString(),
			};
			let closed = false;
			let released = false;
			let metadataWritten = false;
			const closeHandle = async (): Promise<void> => {
				if (closed) return;
				await handle.close();
				closed = true;
			};
			return {
				async writeMetadata(content: string): Promise<void> {
					let supplied: Record<string, unknown> = {};
					try {
						const parsed = JSON.parse(content) as unknown;
						if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) supplied = parsed as Record<string, unknown>;
					} catch {
						// Host metadata is optional; ownership metadata remains authoritative.
					}
					await handle.writeFile(JSON.stringify({ ...supplied, ...owner }, null, 2), 'utf-8');
					metadataWritten = true;
					await closeHandle();
				},
				async release(): Promise<void> {
					if (released) return;
					await closeHandle();
					const current = metadataWritten
						? parseLockMetadata(await fs.readFile(filePath, 'utf-8').catch(() => ''))
						: null;
					if (!metadataWritten || current?.token === owner.token) {
						await fs.unlink(filePath).catch((error: NodeJS.ErrnoException) => {
							if (error.code !== 'ENOENT') throw error;
						});
					}
					released = true;
				},
			};
		},
		unlink(filePath: string): Promise<void> {
			return fs.unlink(filePath);
		},
		rmdir(dirPath: string): Promise<void> {
			return fs.rmdir(dirPath);
		},
		join(...paths: string[]): string {
			return path.join(...paths);
		},
		dirname(filePath: string): string {
			return path.dirname(filePath);
		},
		resolve(...paths: string[]): string {
			return path.resolve(...paths);
		},
	};
}

export function createNodeBackendHostAdapter(): BackendHostAdapter {
	return {
		lockMetadata(input) {
			return {
				canonicalPathKey: input.canonicalPathKey,
			};
		},
	};
}

export function createNodeBackendRuntime(options: BackendRuntimeOptions = {}): BackendRuntime {
	return new BackendRuntime({
		...options,
		fileSystem: options.fileSystem ?? createNodeBackendFileSystem(),
		host: options.host ?? createNodeBackendHostAdapter(),
	});
}

export type {
	BackendFileStat,
	BackendFileSystem,
	BackendHostAdapter,
	BackendRuntimeOptions,
	BackendSessionLock,
} from './runtime.js';
export { BackendRuntime };
