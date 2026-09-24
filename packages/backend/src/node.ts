import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { acquireNodeSessionLock } from './node-session-lock.js';
import { resolveFairyPath } from './path-policy.js';
import {
	BackendRuntime,
	ProjectWriteTransactionError,
	type BackendFileStat,
	type BackendFileSystem,
	type BackendHostAdapter,
	type BackendRuntimeOptions,
	type ProjectWriteTransactionResult,
} from './runtime.js';

async function canonicalExistingPath(filePath: string): Promise<string> {
	const resolved = await fs.realpath(filePath);
	const parent = path.dirname(resolved);
	if (parent === resolved) return resolved;
	const canonicalParent = await canonicalExistingPath(parent);
	const name = path.basename(resolved);
	const entries = await fs.readdir(canonicalParent);
	if (entries.includes(name)) return path.join(canonicalParent, name);
	const target = await fs.stat(resolved, { bigint: true });
	for (const entry of entries) {
		if (entry.toLowerCase() !== name.toLowerCase()) continue;
		const candidate = await fs.stat(path.join(canonicalParent, entry), { bigint: true });
		if (candidate.dev === target.dev && candidate.ino === target.ino) return path.join(canonicalParent, entry);
	}
	throw Object.assign(new Error('Unable to establish canonical path identity.'), { code: 'EACCES' });
}

async function resolvePathThroughExistingAncestor(filePath: string): Promise<string> {
	const missing: string[] = [];
	let candidate = path.resolve(filePath);
	for (;;) {
		try {
			const resolved = await canonicalExistingPath(candidate);
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

function isProjectEntry(name: string): boolean {
	return name.endsWith('.fairy') || name === 'settings' || name === 'assets' || name.startsWith('assets_');
}

async function projectEntries(root: string): Promise<Set<string>> {
	const names = await fs.readdir(root);
	const owned = new Set(names.filter(isProjectEntry));
	for (const fixed of ['assets', 'settings']) {
		if (owned.has(fixed)) continue;
		const aliases = names.filter((name) => name.toLowerCase() === fixed);
		if (!aliases.length) continue;
		let actual;
		try {
			actual = await fs.lstat(path.join(root, fixed), { bigint: true });
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
			throw error;
		}
		for (const alias of aliases) {
			const entry = await fs.lstat(path.join(root, alias), { bigint: true });
			if (entry.dev === actual.dev && entry.ino === actual.ino) owned.add(alias);
		}
	}
	return owned;
}

async function assertNoSymlinks(dirPath: string, projectRoot = false): Promise<void> {
	const owned = projectRoot ? await projectEntries(dirPath) : null;
	for (const entry of await fs.readdir(dirPath, { withFileTypes: true })) {
		if (owned && !owned.has(entry.name)) continue;
		const entryPath = path.join(dirPath, entry.name);
		if (entry.isSymbolicLink()) {
			const error = new Error(
				`Symbolic links are not supported in project directories: ${entryPath}`,
			) as Error & { code: string };
			error.code = 'ELOOP';
			throw error;
		}
		if (entry.isDirectory()) await assertNoSymlinks(entryPath);
	}
}

function createStagedNodeFileSystem(projectRoot: string, stagingRoot: string): BackendFileSystem {
	const { runProjectWriteTransaction: _, ...base } = createNodeBackendFileSystem();
	const translate = (filePath: string): string => {
		const relative = path.relative(projectRoot, path.resolve(filePath));
		if (
			relative === '..' ||
			relative.startsWith(`..${path.sep}`) ||
			path.isAbsolute(relative) ||
			(relative && !isProjectEntry(relative.split(path.sep)[0]!))
		) {
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
			if (symlink)
				throw new Error(
					`Symbolic links are not supported in project directories: ${path.join(dirPath, symlink.name)}`,
				);
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
): Promise<ProjectWriteTransactionResult> {
	const root = path.resolve(projectRoot);
	const parent = path.dirname(root);
	const name = path.basename(root);
	const staging = path.join(parent, `.${name}.save-${randomUUID()}`);
	const backup = path.join(parent, `.${name}.save-backup-${randomUUID()}`);
	const existed = await pathExists(root);
	const changes: Array<{ name: string; backedUp: boolean; installed: boolean }> = [];
	try {
		await fs.mkdir(staging, { recursive: true });
		await fs.mkdir(backup);
		const original = existed ? [...(await projectEntries(root))] : [];
		if (existed) {
			await assertNoSymlinks(root, true);
			for (const entry of original) {
				await fs.cp(path.join(root, entry), path.join(staging, entry), {
					recursive: true,
					errorOnExist: true,
					force: false,
				});
			}
		}
		await write(createStagedNodeFileSystem(root, staging));
		await assertNoSymlinks(root, true).catch((error: NodeJS.ErrnoException) => {
			if (error.code !== 'ENOENT') throw error;
		});
		const entries = new Set([...original, ...(await fs.readdir(staging))]);
		if (!existed) await fs.mkdir(root, { recursive: true });
		try {
			for (const entry of entries) {
				const change = { name: entry, backedUp: false, installed: false };
				changes.push(change);
				if (await pathExists(path.join(root, entry))) {
					await fs.rename(path.join(root, entry), path.join(backup, entry));
					change.backedUp = true;
				}
				if (await pathExists(path.join(staging, entry))) {
					await fs.rename(path.join(staging, entry), path.join(root, entry));
					change.installed = true;
				}
			}
		} catch (commitError) {
			const errors: unknown[] = [commitError];
			for (const change of changes.reverse()) {
				try {
					if (change.installed)
						await fs.rename(path.join(root, change.name), path.join(staging, change.name));
					if (change.backedUp) await fs.rename(path.join(backup, change.name), path.join(root, change.name));
				} catch (error) {
					errors.push(error);
				}
			}
			if (errors.length > 1)
				throw new ProjectWriteTransactionError(
					new AggregateError(errors, 'Project commit and rollback both failed.'),
					true,
					[backup, staging],
				);
			if (!existed) await fs.rmdir(root);
			throw commitError;
		}
	} catch (error) {
		if (ProjectWriteTransactionError.is(error)) throw error;
		await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
		await fs.rm(backup, { recursive: true, force: true }).catch(() => undefined);
		throw new ProjectWriteTransactionError(error, false);
	}
	const retainedBackupPaths: string[] = [];
	for (const directory of [backup, staging]) {
		try {
			await fs.rm(directory, { recursive: true, force: true });
		} catch {
			retainedBackupPaths.push(directory);
		}
	}
	return { retainedBackupPaths };
}

export function createNodeBackendFileSystem(): BackendFileSystem {
	return {
		stat(filePath: string): Promise<BackendFileStat> {
			return fs.stat(filePath);
		},
		async readdir(dirPath: string): Promise<string[]> {
			const entries = await fs.readdir(dirPath, { withFileTypes: true });
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
		caseSensitivePaths: true,
		validateProjectRoot: (root) => assertNoSymlinks(root, true),
		getSessionLockPath(canonicalProjectPath: string): string {
			return path.join(
				path.dirname(canonicalProjectPath),
				`.${path.basename(canonicalProjectPath)}.openfairygui.backend.lock`,
			);
		},
		runProjectWriteTransaction: runNodeProjectWriteTransaction,
		acquireSessionLock: acquireNodeSessionLock,
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

/** Resolve a CLI/SDK project input using the same rules as Node sessions. */
export function resolveNodeFairyPath(input: string): Promise<string> {
	return resolveFairyPath(createNodeBackendFileSystem(), input);
}
