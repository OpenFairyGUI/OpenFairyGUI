import type { FileSystem as CoreProjectFileSystem } from '@openfairygui/core/project-io';
import type { BackendFileStat, BackendFileSystem, BackendSessionLock } from './runtime.js';

type StorageStatKind = 'file' | 'directory';

export interface BackendStorageStatLike {
	kind?: StorageStatKind;
	type?: StorageStatKind;
	isFile?(): boolean;
	isDirectory?(): boolean;
}

export interface BackendAsyncStorageAdapter {
	readFile(filePath: string): Promise<string>;
	readFileRaw(filePath: string): Promise<Uint8Array>;
	writeFile(filePath: string, content: string): Promise<void>;
	writeFileRaw(filePath: string, data: Uint8Array): Promise<void>;
	mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void>;
	readdir(dirPath: string): Promise<string[]>;
	exists?(filePath: string): Promise<boolean>;
	stat?(filePath: string): Promise<BackendStorageStatLike>;
	/** Stable cross-context path identity; also scopes the default Web Lock name. */
	resolvePath?(filePath: string): Promise<string>;
	/**
	 * Optional replacement for Web Locks. Acquisition must be atomic across browser contexts, remain held
	 * until release(), and recover automatically when the owning document terminates.
	 */
	acquireSessionLock?(lockPath: string): Promise<BackendSessionLock>;
	unlink(filePath: string): Promise<void>;
	rmdir(dirPath: string): Promise<void>;
	join?(...paths: string[]): string;
	dirname?(filePath: string): string;
	resolve?(...paths: string[]): string;
}

class StorageFileStat implements BackendFileStat {
	public constructor(private readonly kind: StorageStatKind) {}

	public isFile(): boolean {
		return this.kind === 'file';
	}

	public isDirectory(): boolean {
		return this.kind === 'directory';
	}
}

function createPathError(code: string, message: string): Error & { code: string } {
	const error = new Error(message) as Error & { code: string };
	error.code = code;
	return error;
}

function getWebLockManager(): LockManager | null {
	if (typeof navigator === 'undefined') return null;
	const lockManager = (navigator as Navigator & { locks?: LockManager }).locks;
	return lockManager && typeof lockManager.request === 'function' ? lockManager : null;
}

function acquireWebSessionLock(lockManager: LockManager, lockName: string): Promise<BackendSessionLock> {
	return new Promise((resolve, reject) => {
		let releasePlatformLock = (): void => undefined;
		const held = new Promise<void>((release) => {
			releasePlatformLock = release;
		});
		void lockManager
			.request(lockName, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
				if (!lock) {
					reject(createPathError('EEXIST', `Browser session lock is already held: ${lockName}`));
					return;
				}
				let released = false;
				resolve({
					// Web Locks are the authority; a persisted marker would survive abrupt document termination.
					writeMetadata(): Promise<void> {
						return Promise.resolve();
					},
					release(): Promise<void> {
						if (!released) {
							released = true;
							releasePlatformLock();
						}
						return Promise.resolve();
					},
				});
				await held;
			})
			.catch(reject);
	});
}

function normalizeStoragePath(value: string): string {
	const normalized = value.replace(/\\/g, '/').replace(/\/+/g, '/');
	const absolute = normalized.startsWith('/');
	const rawSegments = normalized.split('/').filter((segment) => segment.length > 0);
	const segments: string[] = [];

	for (const segment of rawSegments) {
		if (segment === '.') continue;
		if (segment === '..') {
			if (segments.length > 0) segments.pop();
			continue;
		}
		segments.push(segment);
	}

	const joined = segments.join('/');
	if (absolute) return joined ? `/${joined}` : '/';
	return joined || '.';
}

function joinStoragePath(...paths: string[]): string {
	return normalizeStoragePath(paths.filter((part) => part.length > 0).join('/'));
}

function dirnameStoragePath(filePath: string): string {
	const normalized = normalizeStoragePath(filePath);
	if (normalized === '/' || normalized === '.') return '.';
	const absolute = normalized.startsWith('/');
	const parts = normalized.split('/').filter((part) => part.length > 0);
	parts.pop();
	if (parts.length === 0) return absolute ? '/' : '.';
	return `${absolute ? '/' : ''}${parts.join('/')}`;
}

function statFromLike(stat: BackendStorageStatLike): BackendFileStat {
	if (typeof stat.isFile === 'function' && typeof stat.isDirectory === 'function') {
		return stat as BackendFileStat;
	}
	const kind = stat.kind ?? stat.type;
	if (kind === 'file' || kind === 'directory') return new StorageFileStat(kind);
	throw createPathError('EINVAL', 'Storage stat must provide kind/type or isFile()/isDirectory().');
}

async function inferStat(storage: BackendAsyncStorageAdapter, filePath: string): Promise<BackendFileStat> {
	if (storage.stat) return statFromLike(await storage.stat(filePath));

	try {
		await storage.readdir(filePath);
		return new StorageFileStat('directory');
	} catch {
		// Try file probes below.
	}

	try {
		await storage.readFileRaw(filePath);
		return new StorageFileStat('file');
	} catch {
		try {
			await storage.readFile(filePath);
			return new StorageFileStat('file');
		} catch {
			throw createPathError('ENOENT', `Storage path not found: ${filePath}`);
		}
	}
}

export type BackendStorageFileSystem = BackendFileSystem & CoreProjectFileSystem;

export function createBackendStorageFileSystem(storage: BackendAsyncStorageAdapter): BackendStorageFileSystem {
	if (typeof storage.unlink !== 'function') {
		throw createPathError('ENOTSUP', 'Storage adapter must provide unlink() for project resource lifecycle writes.');
	}
	if (typeof storage.rmdir !== 'function') {
		throw createPathError('ENOTSUP', 'Storage adapter must provide rmdir() for project resource folder lifecycle writes.');
	}
	const fileSystem: BackendStorageFileSystem = {
		stat(filePath: string): Promise<BackendFileStat> {
			return inferStat(storage, fileSystem.resolve(filePath));
		},
		readdir(dirPath: string): Promise<string[]> {
			return storage.readdir(fileSystem.resolve(dirPath));
		},
		readFile(filePath: string): Promise<string> {
			return storage.readFile(fileSystem.resolve(filePath));
		},
		readFileRaw(filePath: string): Promise<Uint8Array> {
			return storage.readFileRaw(fileSystem.resolve(filePath));
		},
		writeFile(filePath: string, content: string): Promise<void> {
			return storage.writeFile(fileSystem.resolve(filePath), content);
		},
		writeFileRaw(filePath: string, data: Uint8Array): Promise<void> {
			return storage.writeFileRaw(fileSystem.resolve(filePath), data);
		},
		mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
			return storage.mkdir(fileSystem.resolve(dirPath), options);
		},
		async exists(filePath: string): Promise<boolean> {
			if (storage.exists) return storage.exists(fileSystem.resolve(filePath));
			try {
				await fileSystem.stat(filePath);
				return true;
			} catch {
				return false;
			}
		},
		resolvePath(filePath: string): Promise<string> {
			const resolved = fileSystem.resolve(filePath);
			return storage.resolvePath ? storage.resolvePath(resolved) : Promise.resolve(resolved);
		},
		async acquireSessionLock(lockPath: string): Promise<BackendSessionLock> {
			const resolved = fileSystem.resolve(lockPath);
			if (storage.acquireSessionLock) return storage.acquireSessionLock(resolved);
			const lockManager = getWebLockManager();
			if (!lockManager) {
				throw createPathError(
					'ENOTSUP',
					'Browser openSession requires Web Locks or BackendAsyncStorageAdapter.acquireSessionLock().',
				);
			}
			return acquireWebSessionLock(lockManager, `@openfairygui/backend:${resolved}`);
		},
		unlink(filePath: string): Promise<void> {
			return storage.unlink(fileSystem.resolve(filePath));
		},
		rmdir(dirPath: string): Promise<void> {
			return storage.rmdir(fileSystem.resolve(dirPath));
		},
		join(...paths: string[]): string {
			return storage.join ? storage.join(...paths) : joinStoragePath(...paths);
		},
		dirname(filePath: string): string {
			return storage.dirname ? storage.dirname(filePath) : dirnameStoragePath(filePath);
		},
		resolve(...paths: string[]): string {
			return storage.resolve ? storage.resolve(...paths) : joinStoragePath(...paths);
		},
	};

	return fileSystem;
}
