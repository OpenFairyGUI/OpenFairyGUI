import type { BackendCapabilities, BackendFileSystem, ProjectOpenFailureReason } from './runtime.js';

/** A classified project-open failure whose message is safe to return to the caller. */
export class ProjectOpenError extends Error {
	public constructor(
		public readonly reason: ProjectOpenFailureReason,
		message: string,
	) {
		super(message);
	}
}

const OPEN_FAILURE_MESSAGES: Record<ProjectOpenFailureReason, string> = {
	project_not_found: 'Project path does not exist.',
	not_a_project_file: 'Project path is neither a .fairy file nor a directory.',
	no_project_file: 'Project directory contains no .fairy file.',
	multiple_project_files:
		'Project directory contains more than one .fairy file; open the intended .fairy file directly.',
	symbolic_link_unsupported: 'Project directory contains a symbolic link, which this host does not support.',
	access_denied: 'Project path could not be accessed.',
	project_read_failed: 'Project files could not be read.',
	unknown: 'Unable to open project.',
};

export function classifyProjectOpenFailure(error: unknown): { reason: ProjectOpenFailureReason; message: string } {
	if (error instanceof ProjectOpenError) return { reason: error.reason, message: error.message };
	const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
	const reason: ProjectOpenFailureReason =
		code === 'ENOENT' || code === 'ENOTDIR' || code === 'NotFoundError'
			? 'project_not_found'
			: code === 'ELOOP'
				? 'symbolic_link_unsupported'
				: code === 'EACCES' || code === 'EPERM' || code === 'NotAllowedError'
					? 'access_denied'
					: 'unknown';
	return { reason, message: OPEN_FAILURE_MESSAGES[reason] };
}

function openError(reason: ProjectOpenFailureReason, detail?: string): ProjectOpenError {
	return new ProjectOpenError(
		reason,
		detail ? `${OPEN_FAILURE_MESSAGES[reason]} ${detail}` : OPEN_FAILURE_MESSAGES[reason],
	);
}

export function createProjectReadFailure(detail?: string): ProjectOpenError {
	return openError('project_read_failed', detail);
}

export function normalizeComparablePath(value: string, caseSensitive = false): string {
	const normalized = value.replace(/[/\\]+$/, '').replace(/\\/g, '/');
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
	return caseSensitive ? comparable : comparable.toLowerCase();
}

export function createRuntimePathPolicy(caseSensitivePaths = false): BackendCapabilities['runtime']['pathPolicy'] {
	return {
		canonicalization: caseSensitivePaths ? 'realpath+normalized' : 'realpath+normalized-casefold',
		sessionIdentity: 'project-root',
		saveTarget: 'opened-project-only',
		outputTargets: 'deferred',
		workspaceBoundary: 'project-root-only',
	};
}

export async function assertProjectPathContained(
	fileSystem: BackendFileSystem,
	projectRoot: string,
	targetPath: string,
): Promise<void> {
	const [resolvedRoot, resolvedTarget] = await Promise.all([
		fileSystem.resolvePath(projectRoot),
		fileSystem.resolvePath(targetPath),
	]);
	const root = normalizeComparablePath(resolvedRoot, fileSystem.caseSensitivePaths);
	const target = normalizeComparablePath(resolvedTarget, fileSystem.caseSensitivePaths);
	if (root === '.' && !target.startsWith('/') && !/^[a-z]:\//i.test(target)) return;
	if (target === root || target.startsWith(`${root}/`)) return;
	const error = new Error(`Project path escapes the opened root: ${targetPath}`) as Error & { code: string };
	error.code = 'EACCES';
	throw error;
}

export async function resolveFairyPath(fileSystem: BackendFileSystem, input: string): Promise<string> {
	const resolvedInput = fileSystem.resolve(input);
	const stat = await fileSystem.stat(resolvedInput);

	if (stat.isFile() && resolvedInput.endsWith('.fairy')) {
		return await fileSystem.resolvePath(resolvedInput);
	}

	if (stat.isDirectory()) {
		const entries = await fileSystem.readdir(resolvedInput);
		const fairyFiles = entries.filter((entry) => entry.endsWith('.fairy'));
		if (fairyFiles.length === 1) {
			return await fileSystem.resolvePath(fileSystem.join(resolvedInput, fairyFiles[0]!));
		}
		if (fairyFiles.length > 1) throw openError('multiple_project_files', `Found: ${fairyFiles.join(', ')}`);
		throw openError('no_project_file');
	}

	throw openError('not_a_project_file');
}

export async function resolveCanonicalProjectRoot(
	fileSystem: BackendFileSystem,
	input: string,
): Promise<{
	fairyPath: string;
	canonicalProjectPath: string;
	canonicalPathKey: string;
}> {
	const fairyPath = await resolveFairyPath(fileSystem, input);
	const canonicalProjectPath = await fileSystem.resolvePath(fileSystem.dirname(fairyPath));
	return {
		fairyPath,
		canonicalProjectPath,
		canonicalPathKey: normalizeComparablePath(canonicalProjectPath, fileSystem.caseSensitivePaths),
	};
}

export interface PathPolicyViolationError {
	code: 'path_policy_violation';
	message: string;
	policy: 'save_target';
	attemptedPath: string;
	allowedPath: string;
}

export async function validateSaveTarget(
	fileSystem: BackendFileSystem,
	openedFairyPath: string,
	targetPath: string | undefined,
): Promise<PathPolicyViolationError | null> {
	if (!targetPath) return null;
	const attemptedPath = await fileSystem.resolvePath(fileSystem.resolve(targetPath));
	const allowedPath = await fileSystem.resolvePath(openedFairyPath);
	const caseSensitive = fileSystem.caseSensitivePaths;
	if (normalizeComparablePath(attemptedPath, caseSensitive) === normalizeComparablePath(allowedPath, caseSensitive))
		return null;
	return {
		code: 'path_policy_violation',
		message: `Save target is restricted to the originally opened project file: ${allowedPath}`,
		policy: 'save_target',
		attemptedPath,
		allowedPath,
	};
}
