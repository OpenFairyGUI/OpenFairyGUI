/** Parser and canonical MovieClip-model derivation for FairyGUI `.jta` files. */

import type { Document } from '../document.js';
import type { MovieClipResource } from '../properties/movie-clip-resource.js';

const FILE_MARK = 'yytou';

export interface JtaFrame {
	delay: number;
	rectX: number;
	rectY: number;
	rectWidth: number;
	rectHeight: number;
	textureIndex: number;
}

export interface JtaTexture {
	/** Raw image data (PNG or JPG). */
	raw: Uint8Array;
}

export interface JtaDef {
	version: number;
	fps: number;
	speed: number;
	repeatDelay: number;
	swing: boolean;
	boundsWidth: number;
	boundsHeight: number;
	frames: JtaFrame[];
	textures: JtaTexture[];
}

export interface DerivedMovieClipFrame {
	rectX: number;
	rectY: number;
	rectWidth: number;
	rectHeight: number;
	addDelay: number;
	textureIndex: number;
}

export interface DerivedMovieClipModel {
	dimensions: { width: number; height: number };
	interval: number;
	repeatDelay: number;
	swing: boolean;
	frames: DerivedMovieClipFrame[];
}

class JtaCursor {
	public offset = 0;
	private readonly view: DataView;

	public constructor(private readonly data: Uint8Array) {
		this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	}

	public readUint8(label: string): number {
		this.ensure(1, label);
		return this.view.getUint8(this.offset++);
	}

	public readInt8(label: string): number {
		this.ensure(1, label);
		return this.view.getInt8(this.offset++);
	}

	public readUint16(label: string): number {
		this.ensure(2, label);
		const value = this.view.getUint16(this.offset, false);
		this.offset += 2;
		return value;
	}

	public readInt16(label: string): number {
		this.ensure(2, label);
		const value = this.view.getInt16(this.offset, false);
		this.offset += 2;
		return value;
	}

	public readInt32(label: string): number {
		this.ensure(4, label);
		const value = this.view.getInt32(this.offset, false);
		this.offset += 4;
		return value;
	}

	public readBytes(length: number, label: string): Uint8Array {
		if (!Number.isInteger(length) || length < 0) throw new Error(`Invalid .jta file: negative ${label} length`);
		this.ensure(length, label);
		const value = this.data.subarray(this.offset, this.offset + length);
		this.offset += length;
		return value;
	}

	public skip(length: number, label: string): void {
		this.ensure(length, label);
		this.offset += length;
	}

	private ensure(length: number, label: string): void {
		if (this.offset + length > this.data.byteLength) {
			throw new Error(`Invalid .jta file: truncated ${label}`);
		}
	}
}

/**
 * Parse a `.jta` binary buffer into frame and texture data.
 */
export function parseJta(data: Uint8Array): JtaDef {
	const cursor = new JtaCursor(data);
	const markLen = cursor.readUint16('file mark length');
	const mark = new TextDecoder('utf-8').decode(cursor.readBytes(markLen, 'file mark'));

	if (mark !== FILE_MARK) {
		throw new Error(`Invalid .jta file: expected "${FILE_MARK}", got "${mark}"`);
	}

	const version = cursor.readInt32('version');
	if (version < 100 || version > 102) {
		throw new Error(`Unsupported .jta version: ${version}`);
	}
	let fps = cursor.readInt8('fps');
	if (fps < 0) throw new Error(`Invalid .jta file: negative fps ${fps}`);
	if (fps === 0) fps = 24;
	cursor.skip(3, 'reserved header');

	let boundsWidth = 0, boundsHeight = 0;

	if (version >= 102) {
		cursor.skip(4, 'bounds origin');
		boundsWidth = cursor.readUint16('bounds width');
		boundsHeight = cursor.readUint16('bounds height');
	}

	const speed = cursor.readUint8('speed');
	const repeatDelay = cursor.readUint8('repeat delay');
	const swing = cursor.readInt8('swing') === 1;

	// Frames
	const frameCount = cursor.readInt16('frame count');
	if (frameCount < 0) throw new Error('Invalid .jta file: negative frame count');
	const frames: JtaFrame[] = [];
	for (let i = 0; i < frameCount; i++) {
		const delay = cursor.readInt16(`frame ${i} delay`);
		const rectX = cursor.readInt16(`frame ${i} rect x`);
		const rectY = cursor.readInt16(`frame ${i} rect y`);
		const rectWidth = cursor.readInt16(`frame ${i} rect width`);
		const rectHeight = cursor.readInt16(`frame ${i} rect height`);
		const textureIndex = cursor.readInt16(`frame ${i} texture index`);
		if (delay < 0 || rectWidth < 0 || rectHeight < 0) {
			throw new Error(`Invalid .jta file: frame ${i} has negative delay or dimensions`);
		}
		frames.push({ delay, rectX, rectY, rectWidth, rectHeight, textureIndex });
	}

	// Textures
	const textureCount = cursor.readInt16('texture count');
	if (textureCount < 0) throw new Error('Invalid .jta file: negative texture count');
	const textures: JtaTexture[] = [];
	for (let i = 0; i < textureCount; i++) {
		const rawLen = cursor.readInt32(`texture ${i} length`);
		textures.push({ raw: cursor.readBytes(rawLen, `texture ${i} data`) });
	}

	if (version === 101) {
		cursor.skip(4, 'bounds origin');
		boundsWidth = cursor.readUint16('bounds width');
		boundsHeight = cursor.readUint16('bounds height');
	} else if (version === 100) {
		let minX = Number.POSITIVE_INFINITY;
		let minY = Number.POSITIVE_INFINITY;
		let maxX = Number.NEGATIVE_INFINITY;
		let maxY = Number.NEGATIVE_INFINITY;
		for (const frame of frames) {
			if (frame.rectWidth <= 0 || frame.rectHeight <= 0) continue;
			minX = Math.min(minX, frame.rectX);
			minY = Math.min(minY, frame.rectY);
			maxX = Math.max(maxX, frame.rectX + frame.rectWidth);
			maxY = Math.max(maxY, frame.rectY + frame.rectHeight);
		}
		if (Number.isFinite(minX)) {
			boundsWidth = maxX - Math.min(minX, 0);
			boundsHeight = maxY - Math.min(minY, 0);
		}
	}
	for (let index = 0; index < frames.length; index += 1) {
		const textureIndex = frames[index]!.textureIndex;
		if (textureIndex < -1 || textureIndex >= textures.length) {
			throw new Error(
				`Invalid .jta file: frame ${index} texture index ${textureIndex} is outside -1..${textures.length - 1}`,
			);
		}
	}

	return {
		version, fps, speed, repeatDelay, swing,
		boundsWidth, boundsHeight,
		frames, textures,
	};
}

/** Converts parsed JTA frame units to the millisecond-based Document/UAM model. */
export function deriveMovieClipModel(parsed: JtaDef): DerivedMovieClipModel {
	const millisecondsPerFrame = 1000 / parsed.fps;
	return {
		dimensions: { width: parsed.boundsWidth, height: parsed.boundsHeight },
		interval: Math.trunc(millisecondsPerFrame * (parsed.speed || 1)),
		repeatDelay: Math.trunc(millisecondsPerFrame * parsed.repeatDelay),
		swing: parsed.swing,
		frames: parsed.frames.map((frame) => ({
			rectX: frame.rectX,
			rectY: frame.rectY,
			rectWidth: frame.rectWidth,
			rectHeight: frame.rectHeight,
			addDelay: Math.trunc(millisecondsPerFrame * frame.delay),
			textureIndex: frame.textureIndex,
		})),
	};
}

/** Parses JTA bytes and derives the Document/UAM MovieClip model. */
export function deriveMovieClipModelFromJta(data: Uint8Array): DerivedMovieClipModel {
	return deriveMovieClipModel(parseJta(data));
}

/** Applies a fully parsed JTA model without changing XML-owned MovieClip settings such as smoothing. */
export function applyDerivedMovieClipModel(
	doc: Document,
	resource: MovieClipResource,
	model: DerivedMovieClipModel,
): void {
	const frames = model.frames.map((frame, index) => doc.createMovieFrame(`${resource.getId()}_${index}`)
		.setRectX(frame.rectX)
		.setRectY(frame.rectY)
		.setRectWidth(frame.rectWidth)
		.setRectHeight(frame.rectHeight)
		.setAddDelay(frame.addDelay)
		.setSpriteId(''));

	for (const frame of resource.listFrames()) resource.removeFrame(frame);
	resource
		.setWidth(model.dimensions.width)
		.setHeight(model.dimensions.height)
		.setInterval(model.interval)
		.setRepeatDelay(model.repeatDelay)
		.setSwing(model.swing);
	for (const frame of frames) resource.addFrame(frame);
}
