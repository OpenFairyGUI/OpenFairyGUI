import type { RelationDef } from '../constants.js';
import type { ByteBuffer } from './byte-buffer.js';
import type { Document } from '../document.js';

export const COMPONENT_EXTENSION_TYPE_NAMES: Record<number, string> = {
	11: 'Label',
	12: 'Button',
	13: 'ComboBox',
	14: 'ProgressBar',
	15: 'Slider',
	16: 'ScrollBar',
};

export type ComponentDisplayObject = ReturnType<Document['createComponent']> extends { listChildren(): infer T }
	? T extends Array<infer U> ? U : never
	: never;

export function remainingBytes(buf: ByteBuffer): number {
	return Math.max(0, buf.byteLength - buf.pos);
}

export function readColorValue(buf: ByteBuffer, hasAlpha: boolean, preserveAlpha = false): string {
	const r = buf.getUint8().toString(16).padStart(2, '0');
	const g = buf.getUint8().toString(16).padStart(2, '0');
	const b = buf.getUint8().toString(16).padStart(2, '0');
	const a = buf.getUint8().toString(16).padStart(2, '0');
	if (!hasAlpha || (!preserveAlpha && a === 'ff')) return `#${r}${g}${b}`.toUpperCase();
	return `#${a}${r}${g}${b}`.toUpperCase();
}

export function formatBinaryNumber(value: number): string {
	const normalized = Math.round((Object.is(value, -0) ? 0 : value) * 1_000_000) / 1_000_000;
	return Number.isInteger(normalized) ? `${normalized}` : `${normalized}`;
}

export function resolveRelationTarget(targetIndex: number, targetIds: string[]): string {
	if (targetIndex < 0) return '';
	return targetIds[targetIndex] ?? `${targetIndex}`;
}

export function decodeRelationBlock(
	buf: ByteBuffer,
	targetIds: string[],
	addRelation: (relation: RelationDef) => void,
): void {
	const targetCount = buf.getUint8();
	for (let targetIndex = 0; targetIndex < targetCount; targetIndex += 1) {
		if (remainingBytes(buf) < 3) return;
		const relationTarget = resolveRelationTarget(buf.getInt16(), targetIds);
		const pairCount = buf.getUint8();
		for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
			if (remainingBytes(buf) < 2) return;
			addRelation({
				target: relationTarget,
				type: buf.getUint8(),
				usePercent: buf.readBool(),
			});
		}
	}
}


