import type { Document } from '@openfairygui/core';
import { type FileSystem, type ProjectSourceFile, ProjectWriter } from '@openfairygui/core/project-io';
import type { BackendFileSystem } from '../runtime.js';

function createWriterFileSystem(
	fileSystem: BackendFileSystem,
	writtenPaths: string[],
	failedPaths: string[],
): FileSystem {
	async function trackWrite<T>(targetPath: string, write: () => Promise<T>): Promise<T> {
		try {
			const result = await write();
			writtenPaths.push(targetPath);
			return result;
		} catch (error) {
			failedPaths.push(targetPath);
			throw error;
		}
	}

	return {
		readFile: (path) => fileSystem.readFile(path),
		readFileRaw: (path) => fileSystem.readFileRaw(path),
		writeFile: (path, content) =>
			trackWrite(path, async () => {
				await fileSystem.mkdir(fileSystem.dirname(path), { recursive: true });
				await fileSystem.writeFile(path, content);
			}),
		writeFileRaw: (path, data) =>
			trackWrite(path, async () => {
				await fileSystem.mkdir(fileSystem.dirname(path), { recursive: true });
				await fileSystem.writeFileRaw(path, data);
			}),
		mkdir: (path) => fileSystem.mkdir(path, { recursive: true }),
		readdir: (path) => fileSystem.readdir(path),
		async exists(path): Promise<boolean> {
			try {
				await fileSystem.stat(path);
				return true;
			} catch {
				return false;
			}
		},
		join: (...paths) => fileSystem.join(...paths),
		dirname: (path) => fileSystem.dirname(path),
		unlink: (path) => trackWrite(path, () => fileSystem.unlink(path)),
		rmdir: (path) => trackWrite(path, () => fileSystem.rmdir(path)),
	};
}

export async function writeSessionProject(input: {
	fileSystem: BackendFileSystem;
	document: Document;
	fairyPath: string;
	staleSourceFiles: ProjectSourceFile[];
	staleResourceFolders: import('@openfairygui/core/project-io').ProjectResourceFolder[];
	writtenPaths: string[];
	failedPaths: string[];
}): Promise<void> {
	const writer = new ProjectWriter(
		createWriterFileSystem(input.fileSystem, input.writtenPaths, input.failedPaths),
	);
	await writer.write(input.document, input.fairyPath, {
		staleSourceFiles: input.staleSourceFiles,
		staleResourceFolders: input.staleResourceFolders,
	});
}
