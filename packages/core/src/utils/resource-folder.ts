export function normalizeResourceFolderPath(value: string): string {
	const segments = value.replace(/\\/g, '/').split('/').filter(Boolean);
	return segments.length > 0 ? `/${segments.join('/')}/` : '/';
}

export function resourceFolderParentPath(value: string): string {
	const segments = normalizeResourceFolderPath(value).split('/').filter(Boolean);
	segments.pop();
	return segments.length > 0 ? `/${segments.join('/')}/` : '/';
}

export function resourceFolderName(value: string): string {
	return normalizeResourceFolderPath(value).split('/').filter(Boolean).pop() ?? '';
}
