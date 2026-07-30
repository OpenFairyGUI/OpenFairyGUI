import type { Document } from '../document.js';
import type { FileSystem } from './file-system.js';
import { ProjectReader, type ProjectReadOptions } from './project-reader.js';
import { ProjectWriter, type ProjectWriteOptions } from './project-writer.js';

export interface FileSystemAccessFileLike {
	text(): Promise<string>;
	arrayBuffer(): Promise<ArrayBuffer>;
}

export interface FileSystemAccessWritableFileStreamLike {
	write(data: string | Uint8Array): Promise<void>;
	close(): Promise<void>;
}

export interface FileSystemAccessFileHandleLike {
	readonly name?: string;
	readonly kind?: 'file';
	getFile(): Promise<FileSystemAccessFileLike>;
	createWritable(): Promise<FileSystemAccessWritableFileStreamLike>;
}

export interface FileSystemAccessDirectoryHandleLike {
	readonly name?: string;
	readonly kind?: 'directory';
	getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemAccessFileHandleLike>;
	getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemAccessDirectoryHandleLike>;
	removeEntry?(name: string, options?: { recursive?: boolean }): Promise<void>;
	entries?(): AsyncIterableIterator<[string, FileSystemAccessDirectoryHandleLike | FileSystemAccessFileHandleLike]>;
	values?(): AsyncIterableIterator<FileSystemAccessDirectoryHandleLike | FileSystemAccessFileHandleLike>;
}

export interface WebIOOptions {
	root: FileSystemAccessDirectoryHandleLike;
}

function isCoreFileSystem(value: FileSystem | WebIOOptions): value is FileSystem {
	return typeof (value as FileSystem).readFile === 'function';
}

function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '').replace(/\/+$/, '');
}

function splitPath(path: string): string[] {
	const normalized = normalizePath(path);
	return normalized ? normalized.split('/').filter(Boolean) : [];
}

function joinPath(...paths: string[]): string {
	return normalizePath(paths.filter((part) => part !== '').join('/'));
}

function dirname(path: string): string {
	const parts = splitPath(path);
	parts.pop();
	return parts.join('/');
}

function missingPathError(path: string): Error {
	return new Error(`File system path not found: ${path || '.'}`);
}

async function getDirectory(
	root: FileSystemAccessDirectoryHandleLike,
	path: string,
	options: { create?: boolean } = {},
): Promise<FileSystemAccessDirectoryHandleLike> {
	let current = root;
	for (const part of splitPath(path)) {
		current = await current.getDirectoryHandle(part, options);
	}
	return current;
}

async function getFile(
	root: FileSystemAccessDirectoryHandleLike,
	path: string,
	options: { create?: boolean } = {},
): Promise<FileSystemAccessFileHandleLike> {
	const fileName = splitPath(path).pop();
	if (!fileName) throw missingPathError(path);
	const parent = await getDirectory(root, dirname(path), options.create ? { create: true } : {});
	return parent.getFileHandle(fileName, options);
}

export function createFileSystemAccessFileSystem(root: FileSystemAccessDirectoryHandleLike): FileSystem {
	return {
		async readFile(path: string): Promise<string> {
			const file = await (await getFile(root, path)).getFile();
			return file.text();
		},
		async readFileRaw(path: string): Promise<Uint8Array> {
			const file = await (await getFile(root, path)).getFile();
			return new Uint8Array(await file.arrayBuffer());
		},
		async writeFile(path: string, content: string): Promise<void> {
			const writable = await (await getFile(root, path, { create: true })).createWritable();
			await writable.write(content);
			await writable.close();
		},
		async writeFileRaw(path: string, data: Uint8Array): Promise<void> {
			const writable = await (await getFile(root, path, { create: true })).createWritable();
			await writable.write(data);
			await writable.close();
		},
		async mkdir(path: string): Promise<void> {
			await getDirectory(root, path, { create: true });
		},
		async readdir(path: string): Promise<string[]> {
			const dir = await getDirectory(root, path);
			if (dir.entries) {
				const names: string[] = [];
				for await (const [name, handle] of dir.entries()) {
					if (handle.kind === 'directory') names.push(name);
				}
				return names;
			}
			if (dir.values) {
				const names: string[] = [];
				for await (const handle of dir.values()) {
					if (handle.kind === 'directory' && 'name' in handle && typeof handle.name === 'string') {
						names.push(handle.name);
					}
				}
				return names;
			}
			throw new Error('FileSystemDirectoryHandle-like object must provide entries() or values() for readdir().');
		},
		async exists(path: string): Promise<boolean> {
			try {
				const parts = splitPath(path);
				if (parts.length === 0) return true;
				const parent = await getDirectory(root, dirname(path));
				const name = parts[parts.length - 1];
				try {
					await parent.getFileHandle(name);
					return true;
				} catch {
					await parent.getDirectoryHandle(name);
					return true;
				}
			} catch {
				return false;
			}
		},
		async unlink(path: string): Promise<void> {
			const fileName = splitPath(path).pop();
			if (!fileName) throw missingPathError(path);
			const parent = await getDirectory(root, dirname(path));
			if (!parent.removeEntry) {
				throw new Error('FileSystemDirectoryHandle-like object must provide removeEntry() for source cleanup.');
			}
			await parent.removeEntry(fileName);
		},
		join: joinPath,
		dirname,
	};
}

/**
 * Browser-safe I/O implementation for reading and writing FairyGUI projects.
 *
 * WebIO performs project read/write only. Browser artifact publish is exposed
 * by `@openfairygui/functions/web`; binary package I/O is intentionally not
 * exposed from this browser entrypoint.
 *
 * @category I/O
 */
export class WebIO {
	private readonly _fs: FileSystem;

	constructor(fileSystemOrOptions: FileSystem | WebIOOptions) {
		this._fs = isCoreFileSystem(fileSystemOrOptions)
			? fileSystemOrOptions
			: createFileSystemAccessFileSystem(fileSystemOrOptions.root);
	}

	public async readProject(projectPath: string, options?: ProjectReadOptions): Promise<Document> {
		return new ProjectReader(this._fs).read(projectPath, options);
	}

	public async writeProject(doc: Document, projectPath: string, options?: ProjectWriteOptions): Promise<void> {
		await new ProjectWriter(this._fs).write(doc, projectPath, options);
	}
}
