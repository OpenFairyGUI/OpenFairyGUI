import { type FileSystem, ProjectWriter } from '@openfairygui/core/project-io';
import type { Document } from '@openfairygui/core';

export function createCaptureFileSystem(
	files: Map<string, string | Uint8Array>,
	directories: Set<string>,
): FileSystem {
	const normalize = (filePath: string): string => filePath.replace(/\\/g, '/').replace(/\/+/g, '/');
	return {
		async readFile(filePath: string): Promise<string> {
			const value = files.get(normalize(filePath));
			if (typeof value !== 'string') throw new Error(`Captured text file was not found: ${filePath}`);
			return value;
		},
		async readFileRaw(filePath: string): Promise<Uint8Array> {
			const value = files.get(normalize(filePath));
			if (!(value instanceof Uint8Array)) throw new Error(`Captured binary file was not found: ${filePath}`);
			return value.slice();
		},
		async writeFile(filePath: string, content: string): Promise<void> {
			files.set(normalize(filePath), content);
		},
		async writeFileRaw(filePath: string, data: Uint8Array): Promise<void> {
			files.set(normalize(filePath), data.slice());
		},
		async mkdir(dirPath: string): Promise<void> {
			directories.add(normalize(dirPath));
		},
		async readdir(): Promise<string[]> {
			return [];
		},
		async exists(filePath: string): Promise<boolean> {
			return files.has(normalize(filePath));
		},
		join(...paths: string[]): string {
			return normalize(paths.filter(Boolean).join('/'));
		},
		dirname(filePath: string): string {
			const normalized = normalize(filePath);
			const separator = normalized.lastIndexOf('/');
			return separator < 0 ? '' : normalized.slice(0, separator);
		},
		async unlink(filePath: string): Promise<void> {
			files.delete(normalize(filePath));
		},
	};
}

export function capturedFilesEqual(left: Map<string, string | Uint8Array>, right: Map<string, string | Uint8Array>): boolean {
	if (left.size !== right.size) return false;
	for (const [filePath, leftValue] of left) {
		const rightValue = right.get(filePath);
		if (typeof leftValue === 'string') {
			if (leftValue !== rightValue) return false;
			continue;
		}
		if (!(rightValue instanceof Uint8Array) || leftValue.length !== rightValue.length) return false;
		for (let index = 0; index < leftValue.length; index += 1) {
			if (leftValue[index] !== rightValue[index]) return false;
		}
	}
	return true;
}

export function capturedDirectoriesEqual(left: Set<string>, right: Set<string>): boolean {
	return left.size === right.size && [...left].every((directory) => right.has(directory));
}

/** Serialize only into memory. This is a model projection, not a disk inventory or write plan. */
export async function captureProject(document: Document, fairyFileName: string) {
	const files = new Map<string, string | Uint8Array>();
	const directories = new Set<string>();
	await new ProjectWriter(createCaptureFileSystem(files, directories)).write(document, fairyFileName);
	return { files, directories };
}
