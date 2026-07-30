/**
 * Parser for FairyGUI `.jta` animation files.
 *
 * Extracts individual frame textures (PNG/JPG byte arrays) from the binary format.
 * Used by the atlas packer to include MovieClip frames in texture atlases.
 *
 * @internal
 */

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

/**
 * Parse a `.jta` binary buffer into frame and texture data.
 */
export function parseJta(data: Uint8Array): JtaDef {
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	let pos = 0;

	// readUTF: uint16 length + UTF-8 string
	const markLen = view.getUint16(pos);
	pos += 2;
	if (pos + markLen > data.length) throw new Error('Invalid .jta file: truncated file mark');
	const mark = new TextDecoder('utf-8').decode(data.subarray(pos, pos + markLen));
	pos += markLen;

	if (mark !== FILE_MARK) {
		throw new Error(`Invalid .jta file: expected "${FILE_MARK}", got "${mark}"`);
	}

	const version = view.getInt32(pos); pos += 4;
	if (version < 100 || version > 102) {
		throw new Error(`Unsupported .jta version: ${version}`);
	}
	let fps = view.getInt8(pos); pos += 1;
	if (fps === 0) fps = 24;
	pos += 3; // 3 reserved bytes

	let boundsWidth = 0, boundsHeight = 0;

	if (version >= 102) {
		pos += 4; // bounds x/y
		boundsWidth = view.getUint16(pos); pos += 2;
		boundsHeight = view.getUint16(pos); pos += 2;
	}

	const speed = view.getUint8(pos); pos += 1;
	const repeatDelay = view.getUint8(pos); pos += 1;
	const swing = view.getInt8(pos) === 1; pos += 1;

	// Frames
	const frameCount = view.getInt16(pos); pos += 2;
	if (frameCount < 0) throw new Error('Invalid .jta file: negative frame count');
	const frames: JtaFrame[] = [];
	for (let i = 0; i < frameCount; i++) {
		const delay = view.getInt16(pos); pos += 2;
		const rectX = view.getInt16(pos); pos += 2;
		const rectY = view.getInt16(pos); pos += 2;
		const rectWidth = view.getInt16(pos); pos += 2;
		const rectHeight = view.getInt16(pos); pos += 2;
		const textureIndex = view.getInt16(pos); pos += 2;
		frames.push({ delay, rectX, rectY, rectWidth, rectHeight, textureIndex });
	}

	// Textures
	const textureCount = view.getInt16(pos); pos += 2;
	if (textureCount < 0) throw new Error('Invalid .jta file: negative texture count');
	const textures: JtaTexture[] = [];
	for (let i = 0; i < textureCount; i++) {
		const rawLen = view.getInt32(pos); pos += 4;
		if (rawLen < 0 || pos + rawLen > data.length) {
			throw new Error('Invalid .jta file: truncated texture data');
		}
		let raw: Uint8Array;
		if (rawLen > 0) {
			raw = data.subarray(pos, pos + rawLen);
			pos += rawLen;
		} else {
			raw = new Uint8Array(0);
		}
		textures.push({ raw });
	}

	if (version === 101) {
		pos += 4; // bounds x/y
		boundsWidth = view.getUint16(pos); pos += 2;
		boundsHeight = view.getUint16(pos); pos += 2;
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

	return {
		version, fps, speed, repeatDelay, swing,
		boundsWidth, boundsHeight,
		frames, textures,
	};
}

export function tryReadJtaSize(data: Uint8Array): { width: number; height: number } | null {
	try {
		const parsed = parseJta(data);
		return { width: parsed.boundsWidth, height: parsed.boundsHeight };
	} catch {
		return null;
	}
}
