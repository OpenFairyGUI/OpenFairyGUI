import type { ProjectDiagnostic } from '../validation.js';
import type { FileSystem } from './file-system.js';

type DirectoryProbe =
	| { kind: 'directory'; entries: string[] }
	| { kind: 'failure'; error: unknown; notDirectory: boolean; missing: boolean };

/** Probe results retain the original error; callers decide whether absence or a file is acceptable. */
export async function probeProjectDirectory(fs: Pick<FileSystem, 'readdir'>, path: string): Promise<DirectoryProbe> {
	try {
		return { kind: 'directory', entries: await fs.readdir(path) };
	} catch (error) {
		const failure = error as { code?: string; name?: string } | null;
		return {
			kind: 'failure', error,
			notDirectory: failure?.code === 'ENOTDIR' || failure?.name === 'TypeMismatchError',
			missing: failure?.code === 'ENOENT' || failure?.name === 'NotFoundError',
		};
	}
}

export async function readProjectDirectory(
	fs: Pick<FileSystem, 'readdir'>, path: string,
	options: { diagnostics?: ProjectDiagnostic[]; optional?: boolean; probe?: boolean } = {},
): Promise<string[] | null> {
	const result = await probeProjectDirectory(fs, path);
	if (result.kind === 'directory') return result.entries;
	if (options.probe && result.notDirectory) return null;
	if (options.optional && result.missing) return [];
	const { error } = result;
	if (!options.diagnostics) throw error;
	options.diagnostics.push({
		severity: 'error', code: 'unreadable_source', path: 'packages',
		message: `Failed to enumerate project directory: ${error instanceof Error ? error.message : String(error)}`,
		sourcePath: path,
	});
	return null;
}

export async function readProjectSubdirectory(
	fs: Pick<FileSystem, 'readdir' | 'stat'>, path: string, diagnostics?: ProjectDiagnostic[],
): Promise<string[] | null> {
	if (fs.stat && !(await fs.stat(path)).isDirectory()) return null;
	return readProjectDirectory(fs, path, { diagnostics, probe: !fs.stat });
}
