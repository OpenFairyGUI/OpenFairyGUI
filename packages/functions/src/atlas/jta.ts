import { deriveMovieClipModelFromJta, parseJta } from '@openfairygui/core';

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
	try {
		const parsed = parseJta(data);
		const derived = deriveMovieClipModelFromJta(data);
		return {
			frames: parsed.textures.map((texture) => texture.raw),
			meta: {
				interval: derived.interval,
				repeatDelay: derived.repeatDelay,
				swing: derived.swing,
				width: derived.dimensions.width,
				height: derived.dimensions.height,
				frames: derived.frames.map((frame) => ({
					addDelay: frame.addDelay,
					offsetX: frame.rectX,
					offsetY: frame.rectY,
					width: frame.rectWidth,
					height: frame.rectHeight,
					textureIndex: frame.textureIndex,
				})),
			},
		};
	} catch {
		// Preserve the historical loose-PNG fallback for codec callers.
	}

	const frames: Uint8Array[] = [];
	let offset = 0;

	while (offset < data.length) {
		const signatureIndex = findPngSignature(data, offset);
		if (signatureIndex === -1) break;
		const end = findPngEnd(data, signatureIndex);
		if (end === -1) break;
		frames.push(data.subarray(signatureIndex, end));
		offset = end;
	}

	return { frames };
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

function readUint32BE(data: Uint8Array, offset: number): number {
	if (offset + 3 >= data.length) return 0;
	return (
		data[offset] * 0x1000000 +
		((data[offset + 1] ?? 0) << 16) +
		((data[offset + 2] ?? 0) << 8) +
		(data[offset + 3] ?? 0)
	);
}
