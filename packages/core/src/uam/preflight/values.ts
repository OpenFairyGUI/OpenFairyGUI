export { describeValue, hasExactKeys } from '../property-rules/values.js';

export function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function isArrayOf<T>(value: unknown, predicate: (entry: unknown) => entry is T): value is T[] {
	if (!Array.isArray(value)) return false;
	// Indexed reads also reject holes, which every() would skip.
	for (let index = 0; index < value.length; index += 1) {
		if (!predicate(value[index])) return false;
	}
	return true;
}

export function isRecordArray(value: unknown): value is Record<string, unknown>[] {
	return isArrayOf(value, isPlainRecord);
}

export function isStringArray(value: unknown): value is string[] {
	return isArrayOf(value, (entry): entry is string => typeof entry === 'string');
}

export function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
	if (isPlainRecord(value)) {
		return `{${Object.keys(value)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
			.join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
}

export function isIntegerBetween(value: unknown, minimum: number, maximum: number): value is number {
	return Number.isInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

export function isSafeResourceFileName(value: unknown): boolean {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		!value.includes('/') &&
		!value.includes('\\') &&
		value !== '.' &&
		value !== '..'
	);
}

export function isSafePackageName(value: unknown): boolean {
	return typeof value === 'string' && value.length > 0 && !/[\\/:]/.test(value) && value !== '.' && value !== '..';
}

export function isSafeBranchName(value: unknown): boolean {
	return (
		typeof value === 'string' &&
		isSafePackageName(value) &&
		value.trim() === value &&
		!/[. ]$/.test(value) &&
		!/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(value)
	);
}

export function isSafeResourcePath(value: unknown): boolean {
	if (typeof value !== 'string' || !value) return false;
	const segments = value.replace(/\\/g, '/').split('/').filter(Boolean);
	return !segments.some((segment) => segment === '.' || segment === '..');
}
