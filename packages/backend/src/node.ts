import fs from 'node:fs/promises';
import path from 'node:path';
import {
	BackendRuntime,
	type BackendFileStat,
	type BackendFileSystem,
	type BackendHostAdapter,
	type BackendRuntimeOptions,
	type BackendSessionLock,
} from './runtime.js';

export function createNodeBackendFileSystem(): BackendFileSystem {
	return {
		stat(filePath: string): Promise<BackendFileStat> {
			return fs.stat(filePath);
		},
		readdir(dirPath: string): Promise<string[]> {
			return fs.readdir(dirPath);
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
			try {
				return await fs.realpath(filePath);
			} catch {
				return path.resolve(filePath);
			}
		},
		async acquireSessionLock(filePath: string): Promise<BackendSessionLock> {
			const handle = await fs.open(filePath, 'wx');
			let closed = false;
			let released = false;
			const closeHandle = async (): Promise<void> => {
				if (closed) return;
				await handle.close();
				closed = true;
			};
			return {
				async writeMetadata(content: string): Promise<void> {
					await handle.writeFile(content, 'utf-8');
					await closeHandle();
				},
				async release(): Promise<void> {
					if (released) return;
					await closeHandle();
					await fs.unlink(filePath).catch((error: NodeJS.ErrnoException) => {
						if (error.code !== 'ENOENT') throw error;
					});
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
				pid: process.pid,
				createdAt: new Date().toISOString(),
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
