import { generateId } from '@openfairygui/core';
import type { RestoreFileSystem } from '../restore.js';

export function trimTrailingSlashes(value: string): string {
	return value.replace(/[/\\]+$/, '');
}

function normalizeComparablePath(value: string): string {
	const normalized = trimTrailingSlashes(value).replace(/\\/g, '/');
	const driveMatch = normalized.match(/^([a-z]:)(?:\/(.*))?$/i);
	const drivePrefix = driveMatch?.[1].toLowerCase() ?? '';
	const remainder = driveMatch ? (driveMatch[2] ?? '') : normalized;
	const hasRoot = driveMatch ? true : remainder.startsWith('/');
	const rawSegments = remainder.split('/').filter((segment) => segment.length > 0);
	const segments: string[] = [];

	for (const segment of rawSegments) {
		if (segment === '.') continue;
		if (segment === '..') {
			if (segments.length > 0 && segments[segments.length - 1] !== '..') {
				segments.pop();
			} else if (!hasRoot) {
				segments.push('..');
			}
			continue;
		}
		segments.push(segment);
	}

	const joined = segments.join('/');
	const comparable = drivePrefix
		? `${drivePrefix}/${joined}`.replace(/\/$/, '')
		: hasRoot
			? `/${joined}`.replace(/\/$/, '')
			: joined || '.';
	// Restore prefers a conservative same-directory guard: false positives are safer than
	// missing a Windows-style case-only path alias and deleting the source publish dir.
	return comparable.toLowerCase();
}

export function isPathWithin(root: string, candidate: string): boolean {
	const normalizedRoot = normalizeComparablePath(root);
	const normalizedCandidate = normalizeComparablePath(candidate);
	return normalizedCandidate.startsWith(`${normalizedRoot}/`);
}

export function basename(filePath: string): string {
	const trimmed = trimTrailingSlashes(filePath);
	const match = trimmed.match(/([^/\\]+)$/);
	return match?.[1] ?? '';
}

export function normalizeRestoreOutputDir(output: string): string {
	const normalized = trimTrailingSlashes(output);
	const name = basename(normalized);
	if (!normalized || /\.fairy$/i.test(normalized) || !name || name === '.' || name === '..' || /^[a-z]:$/iu.test(name)) {
		throw new Error('restore: Output must be a non-root project directory, not a .fairy file.');
	}
	return normalized;
}

export function resolveOutputProjectPath(outputDir: string, fs: Pick<RestoreFileSystem, 'join'>): string {
	return fs.join(outputDir, `${basename(outputDir)}.fairy`);
}

async function resolvePathForContainment(filePath: string, fs: RestoreFileSystem): Promise<string> {
	const missingSegments: string[] = [];
	let existingPath = filePath;
	while (!(await fs.exists(existingPath))) {
		const parentPath = fs.dirname(existingPath);
		if (!parentPath || parentPath === existingPath) {
			return Promise.resolve(fs.resolvePath(filePath));
		}
		missingSegments.unshift(basename(existingPath));
		existingPath = parentPath;
	}

	const resolvedExistingPath = await Promise.resolve(fs.resolvePath(existingPath));
	return missingSegments.reduce((resolvedPath, segment) => fs.join(resolvedPath, segment), resolvedExistingPath);
}

export async function assertRestoreOutputDir(
	inputDir: string,
	outputDir: string,
	fs: RestoreFileSystem,
	force: boolean,
): Promise<void> {
	const [resolvedInputDir, resolvedOutputDir] = await Promise.all([
		resolvePathForContainment(inputDir, fs),
		resolvePathForContainment(outputDir, fs),
	]);
	const normalizedInputDir = normalizeComparablePath(resolvedInputDir);
	const normalizedOutputDir = normalizeComparablePath(resolvedOutputDir);
	if (
		normalizedInputDir === normalizedOutputDir ||
		isPathWithin(normalizedInputDir, normalizedOutputDir) ||
		isPathWithin(normalizedOutputDir, normalizedInputDir)
	) {
		throw new Error('Restore output directory must be independent from the published input directory.');
	}

	if (!(await fs.exists(outputDir))) return;

	let entries: string[];
	try {
		entries = await fs.readdir(outputDir);
	} catch {
		throw new Error(`Restore output path is not a directory: ${outputDir}`);
	}

	if (entries.length === 0) return;
	if (!force) {
		throw new Error(`Restore output directory is not empty: ${outputDir}. Use --force to overwrite it.`);
	}
}

export async function createRestoreStagingDir(outputDir: string, fs: RestoreFileSystem): Promise<string> {
	const parentDir = fs.dirname(outputDir) || '.';
	await fs.mkdir(parentDir);
	for (let attempt = 0; attempt < 8; attempt += 1) {
		const stagingDir = fs.join(parentDir, `.${basename(outputDir)}.restore-${generateId()}`);
		if (await fs.exists(stagingDir)) continue;
		await fs.mkdir(stagingDir);
		return stagingDir;
	}
	throw new Error(`restore: Could not allocate a staging directory beside ${outputDir}.`);
}

export async function commitRestoreOutput(
	stagingDir: string,
	outputDir: string,
	fs: RestoreFileSystem,
): Promise<string | null> {
	if (!(await fs.exists(outputDir))) {
		await fs.rename(stagingDir, outputDir);
		return null;
	}

	const parentDir = fs.dirname(outputDir) || '.';
	let backupDir = '';
	for (let attempt = 0; attempt < 8; attempt += 1) {
		const candidate = fs.join(parentDir, `.${basename(outputDir)}.restore-backup-${generateId()}`);
		if (!(await fs.exists(candidate))) {
			backupDir = candidate;
			break;
		}
	}
	if (!backupDir) throw new Error(`restore: Could not allocate a backup directory beside ${outputDir}.`);

	// ponytail: two-step rename preserves rollback; use a platform directory-exchange primitive if zero reader gap matters.
	await fs.rename(outputDir, backupDir);
	try {
		await fs.rename(stagingDir, outputDir);
	} catch (error) {
		await fs.rename(backupDir, outputDir);
		throw error;
	}
	try {
		await fs.rm(backupDir, { recursive: true, force: true });
		return null;
	} catch {
		return `restore: Previous output retained at ${backupDir}; remove it after checking the restored project.`;
	}
}
