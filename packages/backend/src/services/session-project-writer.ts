import type { Document } from '@openfairygui/core';
import {
	type FileSystem,
	type ProjectBranchDirectory,
	type ProjectSourceFile,
	ProjectWriter,
} from '@openfairygui/core/project-io';
import type { BackendMessage } from '../contracts.js';
import type { BackendFileSystem } from '../runtime.js';
import { ProjectWriteTransactionError } from '../runtime/contracts.js';
import { assertProjectPathContained } from '../path-policy.js';

function createWriterFileSystem(
	fileSystem: BackendFileSystem,
	projectRoot: string,
	writtenPaths: string[],
	failedPaths: string[],
): FileSystem {
	const contained = async <T>(targetPath: string, operation: () => Promise<T>): Promise<T> => {
		await assertProjectPathContained(fileSystem, projectRoot, targetPath);
		return operation();
	};
	async function trackWrite<T>(targetPath: string, write: () => Promise<T>): Promise<T> {
		try {
			const result = await contained(targetPath, write);
			writtenPaths.push(targetPath);
			return result;
		} catch (error) {
			failedPaths.push(targetPath);
			throw error;
		}
	}

	return {
		resolvePath: (path) => contained(path, () => fileSystem.resolvePath(path)),
		readFile: (path) => contained(path, () => fileSystem.readFile(path)),
		readFileRaw: (path) => contained(path, () => fileSystem.readFileRaw(path)),
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
		mkdir: (path) => contained(path, () => fileSystem.mkdir(path, { recursive: true })),
		readdir: (path) => contained(path, () => fileSystem.readdir(path)),
		async exists(path): Promise<boolean> {
			await assertProjectPathContained(fileSystem, projectRoot, path);
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
	staleBranchDirectories: ProjectBranchDirectory[];
	writtenPaths: string[];
	failedPaths: string[];
}): Promise<BackendMessage[]> {
	const projectRoot = input.fileSystem.dirname(input.fairyPath);
	const write = async (fileSystem: BackendFileSystem): Promise<void> => {
		const writer = new ProjectWriter(
			createWriterFileSystem(fileSystem, projectRoot, input.writtenPaths, input.failedPaths),
		);
		await writer.write(input.document, input.fairyPath, {
			staleSourceFiles: input.staleSourceFiles,
			staleResourceFolders: input.staleResourceFolders,
			staleBranchDirectories: input.staleBranchDirectories,
		});
	};

	if (!input.fileSystem.runProjectWriteTransaction) {
		await write(input.fileSystem);
		return [];
	}
	try {
		const result = await input.fileSystem.runProjectWriteTransaction(projectRoot, write);
		return (result.retainedBackupPaths ?? []).map((backupPath) => ({
			code: 'save_backup_retained',
			message: `The project was saved, but the previous project copy could not be removed: ${backupPath}`,
		}));
	} catch (error) {
		if (ProjectWriteTransactionError.is(error) && !error.diskMayBePartiallyUpdated) input.writtenPaths.length = 0;
		throw error;
	}
}
