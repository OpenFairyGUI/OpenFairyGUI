import fs from 'node:fs/promises';
import path from 'node:path';
import {
	BackendRuntime,
	type BackendFileHandle,
	type BackendFileStat,
	type BackendFileSystem,
	type BackendHostAdapter,
	type BackendRuntimeOptions,
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
		async openExclusive(filePath: string): Promise<BackendFileHandle> {
			const handle = await fs.open(filePath, 'wx');
			return {
				writeFile(content: string): Promise<void> {
					return handle.writeFile(content, 'utf-8');
				},
				close(): Promise<void> {
					return handle.close();
				},
			};
		},
		unlink(filePath: string): Promise<void> {
			return fs.unlink(filePath);
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

export { BackendRuntime };
export type {
	BackendFileHandle,
	BackendFileStat,
	BackendFileSystem,
	BackendHostAdapter,
	BackendRuntimeOptions,
} from './runtime.js';
