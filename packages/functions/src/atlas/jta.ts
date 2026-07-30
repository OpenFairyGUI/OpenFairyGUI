export interface JtaFrameMeta {
	addDelay: number;
	offsetX: number;
	offsetY: number;
	width: number;
	height: number;
	textureIndex: number;
}

export interface JtaMeta {
	interval: number;
	repeatDelay: number;
	swing: boolean;
	width: number;
	height: number;
	frames: JtaFrameMeta[];
}

export interface ExtractedJtaData {
	frames: Uint8Array[];
	meta?: JtaMeta;
}

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function extractJtaFrames(data: Uint8Array): ExtractedJtaData {
	const frames: Uint8Array[] = [];
	let offset = 0;
	let firstPngOffset = -1;

	while (offset < data.length) {
		const signatureIndex = findPngSignature(data, offset);
		if (signatureIndex === -1) break;
		if (firstPngOffset === -1) firstPngOffset = signatureIndex;
		const end = findPngEnd(data, signatureIndex);
		if (end === -1) break;
		frames.push(data.subarray(signatureIndex, end));
		offset = end;
	}

	if (firstPngOffset === -1 || frames.length === 0) {
		return { frames: [] };
	}

	return {
		frames,
		meta: parseJtaHeader(data, firstPngOffset, frames.length),
	};
}

function findPngSignature(data: Uint8Array, fromIndex: number): number {
	for (let index = fromIndex; index <= data.length - PNG_SIGNATURE.length; index += 1) {
		let matched = true;
		for (let signatureIndex = 0; signatureIndex < PNG_SIGNATURE.length; signatureIndex += 1) {
			if (data[index + signatureIndex] !== PNG_SIGNATURE[signatureIndex]) {
				matched = false;
				break;
			}
		}
		if (matched) return index;
	}
	return -1;
}

function findPngEnd(data: Uint8Array, start: number): number {
	let position = start + PNG_SIGNATURE.length;
	while (position + 8 <= data.length) {
		const length = readUint32BE(data, position);
		position += 8;
		if (position + length + 4 > data.length) return -1;
		const isEnd =
			data[position - 4] === 0x49 &&
			data[position - 3] === 0x45 &&
			data[position - 2] === 0x4e &&
			data[position - 1] === 0x44;
		position += length + 4;
		if (isEnd) return position;
	}
	return -1;
}

function parseJtaHeader(data: Uint8Array, firstPngOffset: number, frameCount: number): JtaMeta | undefined {
	if (data.length < 10) return undefined;

	const state = { offset: 0 };
	const end = Math.min(firstPngOffset, data.length);
	const mark = readUtfBE(data, state, end);
	if (!mark) return undefined;

	const version = readInt32BEAt(data, state, end);
	if (version == null) return undefined;

	const fpsRaw = readInt8At(data, state, end);
	if (fpsRaw == null) return undefined;
	const fps = fpsRaw > 0 ? fpsRaw : 24;

	if (state.offset + 3 > end) return undefined;
	state.offset += 3;

	if (version < 102) return undefined;

	readUint16BEAt(data, state, end);
	readUint16BEAt(data, state, end);
	const width = readUint16BEAt(data, state, end);
	const height = readUint16BEAt(data, state, end);
	if (width == null || height == null) return undefined;

	const speedRaw = readUint8At(data, state, end);
	const repeatDelayRaw = readUint8At(data, state, end);
	const swingRaw = readInt8At(data, state, end);
	const frameTableCount = readInt16BEAt(data, state, end);
	if (speedRaw == null || repeatDelayRaw == null || swingRaw == null || frameTableCount == null) return undefined;

	const frames: JtaFrameMeta[] = [];
	for (let index = 0; index < frameTableCount; index += 1) {
		const delayRaw = readInt16BEAt(data, state, end);
		const offsetX = readInt16BEAt(data, state, end);
		const offsetY = readInt16BEAt(data, state, end);
		const frameWidth = readInt16BEAt(data, state, end);
		const frameHeight = readInt16BEAt(data, state, end);
		const textureIndex = readInt16BEAt(data, state, end);
		if (
			delayRaw == null ||
			offsetX == null ||
			offsetY == null ||
			frameWidth == null ||
			frameHeight == null ||
			textureIndex == null
		) {
			break;
		}
		frames.push({
			addDelay: Math.trunc((1000 / fps) * delayRaw),
			offsetX,
			offsetY,
			width: frameWidth,
			height: frameHeight,
			textureIndex,
		});
	}

	return {
		interval: Math.trunc((1000 / fps) * (speedRaw || 1)),
		repeatDelay: Math.trunc((1000 / fps) * repeatDelayRaw),
		swing: swingRaw === 1,
		width,
		height,
		frames: frames.length === 0 && frameCount > 0 ? [] : frames,
	};
}

function readUtfBE(data: Uint8Array, state: { offset: number }, end: number): string | null {
	const length = readUint16BEAt(data, state, end);
	if (length == null || state.offset + length > end) return null;
	const value = new TextDecoder().decode(data.subarray(state.offset, state.offset + length));
	state.offset += length;
	return value;
}

function readUint8At(data: Uint8Array, state: { offset: number }, end: number): number | null {
	if (state.offset + 1 > end) return null;
	const value = data[state.offset];
	state.offset += 1;
	return value ?? 0;
}

function readInt8At(data: Uint8Array, state: { offset: number }, end: number): number | null {
	if (state.offset + 1 > end) return null;
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const value = view.getInt8(state.offset);
	state.offset += 1;
	return value;
}

function readUint16BEAt(data: Uint8Array, state: { offset: number }, end: number): number | null {
	if (state.offset + 2 > end) return null;
	const value = readUint16BE(data, state.offset);
	state.offset += 2;
	return value;
}

function readInt16BEAt(data: Uint8Array, state: { offset: number }, end: number): number | null {
	if (state.offset + 2 > end) return null;
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const value = view.getInt16(state.offset, false);
	state.offset += 2;
	return value;
}

function readInt32BEAt(data: Uint8Array, state: { offset: number }, end: number): number | null {
	if (state.offset + 4 > end) return null;
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const value = view.getInt32(state.offset, false);
	state.offset += 4;
	return value;
}

function readUint16BE(data: Uint8Array, offset: number): number {
	if (offset + 1 >= data.length) return 0;
	return (data[offset] << 8) | data[offset + 1];
}

function readUint32BE(data: Uint8Array, offset: number): number {
	if (offset + 3 >= data.length) return 0;
	return (
		data[offset] * 0x1000000 +
		((data[offset + 1] ?? 0) << 16) +
		((data[offset + 2] ?? 0) << 8) +
		(data[offset + 3] ?? 0)
	);
}
