import type { Transform } from '@openfairygui/core';

/**
 * Wraps a transform function, assigning it a name for the transform stack.
 */
export function createTransform(name: string, fn: Transform): Transform {
	Object.defineProperty(fn, 'name', { value: name });
	return fn;
}
