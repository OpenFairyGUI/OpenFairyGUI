import type {
	Document,
	FontResource,
	ILogger,
	ImageResource,
	MovieClipResource,
	Package,
} from '@openfairygui/core';
import type { AtlasOptions } from '../atlas.js';
import type {
	AtlasRasterBackend,
	AtlasRasterInput,
	AtlasRasterResolvedBuffer,
} from '../publish/contracts.js';
import {
	isFontResource,
	isImageResource,
	isMovieClipResource,
	resolveImageFileName,
	resolveImagePath,
} from '../publish/package-context.js';
import type { ExtrasMap } from '../shared-types.js';
import { parseFnt } from './font.js';
import { extractJtaFrames } from './jta.js';

/** Trim info for a single image. */
interface TrimInfo {
	/** Trimmed pixel data (PNG). */
	buffer: Uint8Array;
	/** Trimmed width. */
	width: number;
	/** Trimmed height. */
	height: number;
	/** Offset from original left edge. */
	offsetX: number;
	/** Offset from original top edge. */
	offsetY: number;
	/** Original width before trim. */
	originalWidth: number;
	/** Original height before trim. */
	originalHeight: number;
}

export type PackageResource = ReturnType<Package['listResources']>[number];
export type PackableResource = ImageResource | MovieClipResource | FontResource;
export type PackInputResource = ImageResource | MovieClipResource;

export function getPublishedItemId(resource: { getId(): string; getExtras(): ExtrasMap | undefined }): string {
	return ((resource.getExtras() as ImageResourceExtras | undefined) ?? {})._publishedId ?? resource.getId();
}

interface ImageResourceExtras extends ExtrasMap {
	_publishedId?: string;
}

interface FontSpriteAlias {
	fontId: string;
	textureId: string;
}

export interface FontResourceExtras extends ExtrasMap {
	_fontSpriteAlias?: FontSpriteAlias;
}

export function resolveFontFileName(fontName: string): string {
	return /\.fnt$/i.test(fontName) ? fontName : `${fontName}.fnt`;
}

/**
 * Trim transparent edges from an image using the host raster backend.
 * Returns the trimmed buffer, dimensions, and offsets.
 * Falls back to the original image if trim fails (e.g. no alpha channel, no transparent edges).
 */
async function _trimImage(
	encoder: AtlasRasterBackend,
	input: AtlasRasterInput,
	originalWidth: number,
	originalHeight: number,
): Promise<TrimInfo> {
	try {
		const trimResult = await encoder(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
		if (!isResolvedBuffer(trimResult)) {
			throw new Error('atlas: encoder raw alpha trim did not return resolved metadata.');
		}
		const { data, info } = trimResult;
		const width = info.width;
		const height = info.height;
		const channels = info.channels || 4;
		let minX = width;
		let minY = height;
		let maxX = -1;
		let maxY = -1;

		for (let y = 0; y < height; y += 1) {
			for (let x = 0; x < width; x += 1) {
				const alphaIndex = (y * width + x) * channels + 3;
				if ((data[alphaIndex] ?? 0) === 0) continue;
				if (x < minX) minX = x;
				if (y < minY) minY = y;
				if (x > maxX) maxX = x;
				if (y > maxY) maxY = y;
			}
		}

		if (maxX < minX || maxY < minY) {
			return {
				buffer: new Uint8Array(0),
				width: 0,
				height: 0,
				offsetX: 0,
				offsetY: 0,
				originalWidth,
				originalHeight,
			};
		}

		const trimmedWidth = maxX - minX + 1;
		const trimmedHeight = maxY - minY + 1;
		const buffer = await encoder(input)
			.extract({
				left: minX,
				top: minY,
				width: trimmedWidth,
				height: trimmedHeight,
			})
			.toBuffer();

		return {
			buffer,
			width: trimmedWidth,
			height: trimmedHeight,
			offsetX: minX,
			offsetY: minY,
			originalWidth,
			originalHeight,
		};
	} catch {
		// Trim failed (e.g. JPEG without alpha, nothing to trim) — return original
		const buf = await encoder(input).png().toBuffer();
		return {
			buffer: buf,
			width: originalWidth,
			height: originalHeight,
			offsetX: 0,
			offsetY: 0,
			originalWidth,
			originalHeight,
		};
	}
}

/**
 * Resolve an ImageResource to its actual file path on disk.
 */
export type InputItem = {
	id: string;
	width: number;
	height: number;
	originalWidth: number;
	originalHeight: number;
	offsetX: number;
	offsetY: number;
	resource: PackInputResource;
	trimBuffer?: Uint8Array;
	rasterizedBuffer?: Uint8Array;
	sourceKind: 'image' | 'movieclip-frame';
};

export interface StandaloneAtlasGroup {
	resource: PackInputResource;
	branchName: string;
	branchOrdinal: number;
	sizeMode: 'default' | 'npot' | 'multipleOf4';
	inputs: InputItem[];
}

export interface PagedAtlasGroup {
	pageIndex: number;
	branchName: string;
	branchOrdinal: number;
	inputs: InputItem[];
}

/** Collect a single ImageResource into the inputs array. */
export async function collectImage(
	resource: ImageResource,
	pkg: Package,
	inputs: InputItem[],
	encoder: AtlasRasterBackend | undefined,
	options: AtlasOptions,
	doTrim: boolean,
	logger: ILogger,
): Promise<void> {
	let origW = resource.getWidth() ?? 0;
	let origH = resource.getHeight() ?? 0;
	const declaredWidth = origW;
	const declaredHeight = origH;
	let sourceHasAlpha = false;
	let rasterizedBuffer: Uint8Array | undefined;

	if (encoder && options.basePath) {
		const filePath = resolveImagePath(resource, pkg, options.basePath);
		try {
			const metadata = await encoder(filePath).metadata();
			if (origW === 0 || origH === 0) {
				origW = metadata.width ?? 0;
				origH = metadata.height ?? 0;
				resource.setWidth(origW);
				resource.setHeight(origH);
			}
			sourceHasAlpha = metadata.hasAlpha === true || metadata.channels === 4;
			if (/\.svg$/i.test(resolveImageFileName(resource)) && declaredWidth > 0 && declaredHeight > 0) {
				rasterizedBuffer = await encoder(filePath)
					.resize({ width: declaredWidth, height: declaredHeight, fit: 'fill' })
					.png()
					.toBuffer();
				sourceHasAlpha = true;
			}
		} catch {
			if (options.strictOutput) {
				throw new Error(`atlas: Could not read image "${filePath}".`);
			}
			if (origW === 0 || origH === 0) {
				logger.warn(`atlas: Could not read image "${filePath}", skipping.`);
				return;
			}
		}
	}

	if (origW <= 0 || origH <= 0) return;

	let packW = origW,
		packH = origH,
		offX = 0,
		offY = 0;
	let trimBuf: Uint8Array | undefined;

	if (doTrim && sourceHasAlpha && options.basePath && encoder) {
		const filePath = resolveImagePath(resource, pkg, options.basePath);
		try {
			const trimResult = await _trimImage(encoder, rasterizedBuffer ?? filePath, origW, origH);
			packW = trimResult.width;
			packH = trimResult.height;
			offX = trimResult.offsetX;
			offY = trimResult.offsetY;
			trimBuf = trimResult.buffer;
		} catch {
			logger.warn(`atlas: Could not trim "${filePath}", using original.`);
		}
	}

	inputs.push({
		id: getPublishedItemId(resource),
		width: packW,
		height: packH,
		originalWidth: origW,
		originalHeight: origH,
		offsetX: offX,
		offsetY: offY,
		resource,
		trimBuffer: trimBuf,
		rasterizedBuffer,
		sourceKind: 'image',
	});
}

/** Collect MovieClip frame textures from a .jta file into the inputs array. */
export async function collectMovieClipFrames(
	doc: Document,
	resource: MovieClipResource,
	pkg: Package,
	inputs: InputItem[],
	encoder: AtlasRasterBackend | undefined,
	options: AtlasOptions,
	logger: ILogger,
): Promise<void> {
	if (!options.basePath || !options.readFileRaw) {
		if (options.strictOutput) {
			throw new Error(`atlas: MovieClip "${resource.getId()}" requires basePath and readFileRaw for complete raster output.`);
		}
		return;
	}
	if (!encoder && options.strictOutput) {
		throw new Error(`atlas: MovieClip "${resource.getId()}" requires an encoder for complete raster output.`);
	}

	const mcId = resource.getId();
	const mcName = resource.getName() + '.jta';
	const mcPath = resource.getPath() ?? '/';
	const filePath = `${options.basePath}/${pkg.getName()}${mcPath}${mcName}`;

	try {
		const raw = await options.readFileRaw(filePath);
		const jta = extractJtaFrames(raw);

		const frameMetas = jta.meta.frames;
		for (const frame of resource.listFrames()) {
			resource.removeFrame(frame);
		}
		resource
			.setInterval(jta.meta.interval)
			.setSwing(jta.meta.swing)
			.setRepeatDelay(jta.meta.repeatDelay);

		const firstFrameIndexByTextureIndex = new Map<number, number>();
		for (let frameIndex = 0; frameIndex < frameMetas.length; frameIndex += 1) {
			const textureIndex = frameMetas[frameIndex]!.textureIndex;
			if (textureIndex >= 0 && !firstFrameIndexByTextureIndex.has(textureIndex)) {
				firstFrameIndexByTextureIndex.set(textureIndex, frameIndex);
			}
		}

		const spriteIdByTextureIndex = new Map<number, string>();
		for (let textureIndex = 0; textureIndex < jta.frames.length; textureIndex += 1) {
			const exportFrameIndex = firstFrameIndexByTextureIndex.get(textureIndex);
			if (exportFrameIndex === undefined) continue;
			const itemId = `${mcId}_${exportFrameIndex}`;
			const input = await createMovieClipFrameInput(
				jta.frames[textureIndex],
				itemId,
				resource,
				encoder,
				options.strictOutput,
			);
			if (!input) continue;
			inputs.push(input);
			spriteIdByTextureIndex.set(textureIndex, itemId);
		}

		for (let frameIndex = 0; frameIndex < frameMetas.length; frameIndex += 1) {
			const meta = frameMetas[frameIndex]!;
			const frame = doc.createMovieFrame(`${mcId}_${frameIndex}`);
			frame
				.setRectX(meta.offsetX)
				.setRectY(meta.offsetY)
				.setRectWidth(meta.width)
				.setRectHeight(meta.height)
				.setAddDelay(meta.addDelay)
				.setSpriteId(meta.textureIndex === -1 ? '' : (spriteIdByTextureIndex.get(meta.textureIndex) ?? ''));
			resource.addFrame(frame);
		}

		if (jta.meta.width > 0 && jta.meta.height > 0) {
			resource.setWidth(jta.meta.width);
			resource.setHeight(jta.meta.height);
		}
	} catch {
		const message = `atlas: Could not parse MovieClip "${filePath}".`;
		if (options.strictOutput) throw new Error(message);
		logger.warn(`${message} Skipping frames.`);
	}
}

async function createMovieClipFrameInput(
	buffer: Uint8Array,
	itemId: string,
	resource: MovieClipResource,
	encoder: AtlasRasterBackend | undefined,
	strictOutput: boolean,
): Promise<InputItem | null> {
	if (!encoder || buffer.length === 0) return null;
	try {
		const meta = await encoder(buffer).metadata();
		const width = meta.width ?? 0;
		const height = meta.height ?? 0;
		if (width <= 0 || height <= 0) return null;
		return {
			id: itemId,
			width,
			height,
			originalWidth: width,
			originalHeight: height,
			offsetX: 0,
			offsetY: 0,
			resource,
			trimBuffer: buffer,
			sourceKind: 'movieclip-frame',
		};
	} catch {
		if (strictOutput) throw new Error(`atlas: Could not decode MovieClip frame "${itemId}".`);
		return null;
	}
}

/** Collect a Bitmap Font's texture image, packed under the font's ID. */
export async function collectFontTexture(
	doc: Document,
	fontRes: FontResource,
	pkg: Package,
	options: AtlasOptions,
): Promise<void> {
	const textureId = fontRes.getTextureId?.() ?? '';

	if (textureId) {
		// Record font→texture mapping so we can add a duplicate sprite entry
		// after atlas packing. The editor stores both the image ID (jb800) and
		// the font ID (wa8u2r) as separate sprites at the same atlas position.
		const fontId = fontRes.getId();
		fontRes.setExtras({ ...fontRes.getExtras(), _fontSpriteAlias: { fontId, textureId } });
	}

	// Parse .fnt file for glyph data (needed for binary encoding)
	// This applies to ALL fonts, not just those with a textureId
	if (options.readFileRaw && options.basePath) {
		const fontName = resolveFontFileName(fontRes.getName());
		const fontPath = fontRes.getPath() ?? '/';
		const pkgName = pkg.getName();
		const fntFile = `${options.basePath}/${pkgName}${fontPath}${fontName}`;
		try {
			const fntData = await options.readFileRaw(fntFile);
			const fntText = new TextDecoder().decode(fntData);
			const fntParsed = parseFnt(fntText);
			for (const glyph of fontRes.listGlyphs()) {
				fontRes.removeGlyph(glyph);
			}
			fontRes
				.setTtf(fntParsed.hasFace)
				.setTint(fntParsed.colored)
				.setAutoScale(fntParsed.resizable)
				.setHasChannel(fntParsed.hasChannel)
				.setFontSize(fntParsed.fontSize)
				.setXAdvance(fntParsed.xadvance)
				.setLineHeight(fntParsed.lineHeight);
			for (const item of fntParsed.glyphs) {
				const glyph = doc.createFontGlyph(`${fontRes.getId()}_${item.charId}`);
				glyph
					.setCharId(item.charId)
					.setChar(item.charId > 0 ? String.fromCodePoint(item.charId) : '')
					.setImg(item.img ?? '')
					.setX(item.x)
					.setY(item.y)
					.setXOffset(item.xoffset)
					.setYOffset(item.yoffset)
					.setWidth(item.width)
					.setHeight(item.height)
					.setAdvance(item.xadvance)
					.setLineHeight(fntParsed.lineHeight)
					.setChannel(item.channel);
				fontRes.addGlyph(glyph);
			}
		} catch {
			/* .fnt not found */
		}
	}
}

export function isPackableResource(resource: PackageResource): resource is PackableResource {
	return isImageResource(resource) || isMovieClipResource(resource) || isFontResource(resource);
}

function isResolvedBuffer(value: Uint8Array | AtlasRasterResolvedBuffer): value is AtlasRasterResolvedBuffer {
	return typeof value === 'object' && value !== null && 'data' in value && 'info' in value;
}
