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

export function normalizeComparablePath(value: string): string {
	const normalized = trimTrailingSlashes(value).replace(/\\/g, '/');
	const driveMatch = normalized.match(/^([a-z]:)(?:\/(.*))?$/i);
	const drivePrefix = driveMatch?.[1].toLowerCase() ?? '';
	const remainder = driveMatch ? (driveMatch[2] ?? '') : normalized;
	const hasRoot = driveMatch ? true : remainder.startsWith('/');
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
	const comparable = drivePrefix ? `${drivePrefix}/${joined}` : hasRoot ? `/${joined}` : joined || '.';
	return comparable.replace(/\/$/, '').toLowerCase();
}
