/** Substitute named project settings in a single pass without interpreting replacement-string tokens. */
export function expandPathVariables(value: string, variables: Record<string, unknown>): string {
	return value.replace(/\{([^{}]+)\}/gu, (match, name: string) =>
		Object.hasOwn(variables, name) ? String(variables[name]) : match,
	);
}

export function trimTrailingSlashes(value: string): string {
	return value.replace(/[/\\]+$/, '');
}

export function dirname(filePath: string): string {
	const match = trimTrailingSlashes(filePath).match(/^(.*)[/\\][^/\\]+$/);
	return match?.[1] ?? '';
}

export function basename(filePath: string): string {
	const match = trimTrailingSlashes(filePath).match(/([^/\\]+)$/);
	return match?.[1] ?? '';
}

export function isAbsolutePathLike(value: string): boolean {
	return /^(?:[a-zA-Z]:[/\\]|[/\\]{1,2})/u.test(value);
}

const DEFAULT_CASE_SENSITIVE_PATHS =
	typeof process !== 'undefined' && process.platform !== 'win32' && process.platform !== 'darwin';

export function normalizeComparablePath(value: string, caseSensitive = DEFAULT_CASE_SENSITIVE_PATHS): string {
	let normalized = value.replace(/\\/g, '/');
	if (normalized.startsWith('//?/UNC/') || normalized.startsWith('//?/unc/')) {
		normalized = `//${normalized.slice(8)}`;
	} else if (/^\/\/\?\/[a-z]:(?:\/|$)/i.test(normalized)) {
		normalized = normalized.slice(4);
	}
	const uncMatch = normalized.match(/^\/\/([^/]+)\/([^/]+)(?:\/(.*))?$/);
	const driveMatch = !uncMatch ? normalized.match(/^([a-z]:)(?:\/(.*))?$/i) : null;
	const uncPrefix = uncMatch ? `//${uncMatch[1]}/${uncMatch[2]}` : '';
	const drivePrefix = driveMatch ? driveMatch[1].toLowerCase() : '';
	const remainder = uncMatch ? (uncMatch[3] ?? '') : driveMatch ? (driveMatch[2] ?? '') : normalized;
	const hasRoot = Boolean(uncMatch || driveMatch || remainder.startsWith('/'));
	const segments: string[] = [];

	for (const segment of remainder.split('/').filter(Boolean)) {
		if (segment === '.') continue;
		if (segment === '..') {
			if (segments.length > 0 && segments.at(-1) !== '..') segments.pop();
			else if (!hasRoot) segments.push('..');
			continue;
		}
		segments.push(segment);
	}

	const joined = segments.join('/');
	const comparable = uncPrefix
		? joined
			? `${uncPrefix}/${joined}`
			: uncPrefix
		: drivePrefix
			? joined
				? `${drivePrefix}/${joined}`
				: `${drivePrefix}/`
			: hasRoot
				? joined
					? `/${joined}`
					: '/'
				: joined || '.';
	return caseSensitive ? comparable : comparable.toLowerCase();
}

/** Validate a single output filename segment so publish/codegen cannot escape its target directory. */
export function assertSafeOutputFileName(fileName: string, label: string): string {
	const trimmed = fileName.trim();
	if (!trimmed || trimmed === '.' || trimmed === '..' || /[\\/:\0]/u.test(trimmed) || trimmed !== fileName) {
		throw new Error(`Invalid ${label}: "${fileName}" must be a safe single filename.`);
	}
	return fileName;
}

export function normalizeRestoreResourcePath(path: string | undefined): string {
	const raw = (path ?? '').trim();
	if (!raw || raw === '/') return '';
	if (raw.includes('\0') || raw.startsWith('\\') || raw.startsWith('//') || /^[a-z]:/iu.test(raw)) {
		throw new Error(`restore: Invalid resource path "${raw}".`);
	}
	const segments = raw.replace(/\\/g, '/').split('/').filter(Boolean);
	if (segments.some((segment) => segment === '.' || segment === '..' || segment.includes(':'))) {
		throw new Error(`restore: Invalid resource path "${raw}".`);
	}
	return segments.join('/');
}
