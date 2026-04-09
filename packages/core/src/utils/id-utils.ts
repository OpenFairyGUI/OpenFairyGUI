/**
 * Generates an 8-character alphanumeric ID compatible with FairyGUI conventions.
 */
export function generateId(length = 8): string {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	let result = '';
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
}

/**
 * Parses a FairyGUI URL: `ui://[packageId][resourceId]`.
 */
export function parseURL(url: string): { packageId: string; resourceId: string } | null {
	if (!url.startsWith('ui://')) return null;
	const body = url.substring(5);
	if (body.length < 8) return null;
	return {
		packageId: body.substring(0, 8),
		resourceId: body.substring(8),
	};
}

/**
 * Builds a FairyGUI URL from package and resource IDs.
 */
export function buildURL(packageId: string, resourceId: string): string {
	return `ui://${packageId}${resourceId}`;
}
