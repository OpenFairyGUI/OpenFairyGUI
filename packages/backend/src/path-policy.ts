import type { BackendCapabilities, BackendFileSystem } from './runtime.js';

export function normalizeComparablePath(value: string): string {
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
	return comparable.toLowerCase();
}

export function createRuntimePathPolicy(): BackendCapabilities['runtime']['pathPolicy'] {
	return {
		canonicalization: 'realpath+normalized-casefold',
		sessionIdentity: 'project-root',
		saveTarget: 'opened-project-only',
		outputTargets: 'deferred',
		workspaceBoundary: 'project-root-only',
	};
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
		if (fairyFiles.length > 1) {
			throw new Error(`Multiple .fairy files found in ${resolvedInput}: ${fairyFiles.join(', ')}`);
		}
		throw new Error(`No .fairy file found in ${resolvedInput}`);
	}

	throw new Error(`Input is not a .fairy file or directory: ${resolvedInput}`);
}

export async function resolveCanonicalProjectRoot(fileSystem: BackendFileSystem, input: string): Promise<{
	fairyPath: string;
	canonicalProjectPath: string;
	canonicalPathKey: string;
}> {
	const fairyPath = await resolveFairyPath(fileSystem, input);
	const canonicalProjectPath = await fileSystem.resolvePath(fileSystem.dirname(fairyPath));
	return {
		fairyPath,
		canonicalProjectPath,
		canonicalPathKey: normalizeComparablePath(canonicalProjectPath),
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
	if (normalizeComparablePath(attemptedPath) === normalizeComparablePath(allowedPath)) return null;
	return {
		code: 'path_policy_violation',
		message: `Save target is restricted to the originally opened project file: ${allowedPath}`,
		policy: 'save_target',
		attemptedPath,
		allowedPath,
	};
}
