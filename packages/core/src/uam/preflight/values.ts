export function hasExactKeys(value: object, keys: readonly string[]): boolean {
	const actual = Object.keys(value);
	return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

export function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

export function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
	if (isPlainRecord(value)) {
		return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
}

export function isIntegerBetween(value: unknown, minimum: number, maximum: number): value is number {
	return Number.isInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

export function isSafeResourceFileName(value: string): boolean {
	return value.length > 0
		&& !value.includes('/')
		&& !value.includes('\\')
		&& value !== '.'
		&& value !== '..';
}

export function isSafePackageName(value: string): boolean {
	return value.length > 0
		&& !/[\\/:]/.test(value)
		&& value !== '.'
		&& value !== '..';
}

export function isSafeBranchName(value: string): boolean {
	return isSafePackageName(value)
		&& value.trim() === value
		&& !/[. ]$/.test(value)
		&& !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(value);
}

export function isSafeResourcePath(value: string): boolean {
	if (!value) return false;
	const segments = value.replace(/\\/g, '/').split('/').filter(Boolean);
	return !segments.some((segment) => segment === '.' || segment === '..');
}
