export function isFiniteUamPoint(value: unknown): boolean {
	if (typeof value !== 'object' || value === null) return false;
	const point = value as { x?: unknown; y?: unknown };
	return typeof point.x === 'number'
		&& Number.isFinite(point.x)
		&& typeof point.y === 'number'
		&& Number.isFinite(point.y);
}

export function hasExactKeys(value: object, keys: readonly string[]): boolean {
	const actual = Object.keys(value);
	return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

export function isUamColor(value: unknown): value is string {
	return typeof value === 'string' && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value);
}

export function isUiResourceReference(value: unknown): value is string {
	return typeof value === 'string'
		&& (value === '' || (value.startsWith('ui://') && value.length > 5 && !/\s/.test(value)));
}
