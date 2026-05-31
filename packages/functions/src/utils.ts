import type { Transform } from '@openfairygui/core';

export type TextureSetMode =
	| { kind: 'auto'; raw: string }
	| { kind: 'standalone'; raw: string; sizeMode: 'default' | 'npot' | 'multipleOf4' }
	| { kind: 'page'; raw: string; pageIndex: number };

/**
 * Wraps a transform function, assigning it a name for the transform stack.
 */
export function createTransform(name: string, fn: Transform): Transform {
	Object.defineProperty(fn, 'name', { value: name });
	return fn;
}

export function parseTextureSetMode(value: string | null | undefined): TextureSetMode {
	const raw = value?.trim() ?? '';
	if (!raw) {
		return { kind: 'auto', raw: '' };
	}
	if (raw === 'alone') {
		return { kind: 'standalone', raw, sizeMode: 'default' };
	}
	if (raw === 'alone_npot') {
		return { kind: 'standalone', raw, sizeMode: 'npot' };
	}
	if (raw === 'alone_mof') {
		return { kind: 'standalone', raw, sizeMode: 'multipleOf4' };
	}
	if (/^\d+$/.test(raw)) {
		const pageIndex = Number(raw);
		if (pageIndex >= 0 && pageIndex <= 10) {
			return { kind: 'page', raw, pageIndex };
		}
	}
	return { kind: 'auto', raw };
}
