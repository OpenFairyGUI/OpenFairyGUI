import {
	deriveMovieClipModel,
	parseJta,
	probeRasterImage,
	type RasterImageFormat,
} from '@openfairygui/core';
import type { AtlasRasterBackend } from '../publish/contracts.js';

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
	meta: JtaMeta;
}

export interface PreparedJtaTexture {
	textureIndex: number;
	firstFrameIndex: number;
	/** PNG bytes validated during preflight and reused by atlas compositing. */
	buffer: Uint8Array;
	width: number;
	height: number;
}

export interface PreparedJtaData extends ExtractedJtaData {
	referencedTextures: PreparedJtaTexture[];
}

export function extractJtaFrames(data: Uint8Array): ExtractedJtaData {
	const parsed = parseJta(data);
	const derived = deriveMovieClipModel(parsed);
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
}

function detectSupportedRasterFormat(data: Uint8Array): RasterImageFormat | null {
	if (
		data.length >= 8 &&
		data[0] === 0x89 &&
		data[1] === 0x50 &&
		data[2] === 0x4e &&
		data[3] === 0x47 &&
		data[4] === 0x0d &&
		data[5] === 0x0a &&
		data[6] === 0x1a &&
		data[7] === 0x0a
	) {
		return 'png';
	}
	if (data.length >= 2 && data[0] === 0xff && data[1] === 0xd8) return 'jpeg';
	return null;
}

function couldNotDecode(filePath: string, frameIndex: number, textureIndex: number): Error {
	return new Error(
		`atlas: Could not decode MovieClip "${filePath}" frame ${frameIndex} (texture ${textureIndex}).`,
	);
}

export async function prepareJtaForPublish(
	data: Uint8Array,
	encoder: AtlasRasterBackend | undefined,
	filePath: string,
): Promise<PreparedJtaData> {
	const extracted = extractJtaFrames(data);
	const firstFrameIndexByTextureIndex = new Map<number, number>();

	for (let frameIndex = 0; frameIndex < extracted.meta.frames.length; frameIndex += 1) {
		const textureIndex = extracted.meta.frames[frameIndex]!.textureIndex;
		if (textureIndex >= 0 && !firstFrameIndexByTextureIndex.has(textureIndex)) {
			firstFrameIndexByTextureIndex.set(textureIndex, frameIndex);
		}
	}

	const referencedTextures: PreparedJtaTexture[] = [];
	for (let textureIndex = 0; textureIndex < extracted.frames.length; textureIndex += 1) {
		const firstFrameIndex = firstFrameIndexByTextureIndex.get(textureIndex);
		if (firstFrameIndex === undefined) continue;
		const raw = extracted.frames[textureIndex]!;
		if (raw.byteLength === 0) {
			throw new Error(
				`atlas: MovieClip "${filePath}" frame ${firstFrameIndex} references empty texture ${textureIndex}.`,
			);
		}
		const detectedFormat = detectSupportedRasterFormat(raw);
		if (!detectedFormat) {
			throw new Error(
				`atlas: MovieClip "${filePath}" frame ${firstFrameIndex} (texture ${textureIndex}) uses an unsupported ` +
					'raster format; only PNG and JPEG are supported.',
			);
		}
		const imageInfo = probeRasterImage(raw);
		if (!imageInfo || imageInfo.format !== detectedFormat) {
			throw couldNotDecode(filePath, firstFrameIndex, textureIndex);
		}

		let buffer = raw;
		if (encoder) {
			try {
				buffer = await encoder(raw).png().toBuffer();
			} catch {
				throw couldNotDecode(filePath, firstFrameIndex, textureIndex);
			}
			const normalizedInfo = probeRasterImage(buffer);
			if (
				!normalizedInfo ||
				normalizedInfo.format !== 'png' ||
				normalizedInfo.width !== imageInfo.width ||
				normalizedInfo.height !== imageInfo.height
			) {
				throw couldNotDecode(filePath, firstFrameIndex, textureIndex);
			}
		}

		referencedTextures.push({
			textureIndex,
			firstFrameIndex,
			buffer,
			width: imageInfo.width,
			height: imageInfo.height,
		});
	}

	return { ...extracted, referencedTextures };
}
