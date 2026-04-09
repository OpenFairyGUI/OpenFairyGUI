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
	const mark = new TextDecoder('utf-8').decode(data.subarray(pos, pos + markLen));
	pos += markLen;

	if (mark !== FILE_MARK) {
		throw new Error(`Invalid .jta file: expected "${FILE_MARK}", got "${mark}"`);
	}

	const version = view.getInt32(pos); pos += 4;
	let fps = view.getInt8(pos); pos += 1;
	if (fps === 0) fps = 24;
	pos += 3; // 3 reserved bytes

	let _boundsX = 0, _boundsY = 0, boundsWidth = 0, boundsHeight = 0;

	if (version >= 102) {
		_boundsX = view.getUint16(pos); pos += 2;
		_boundsY = view.getUint16(pos); pos += 2;
		boundsWidth = view.getUint16(pos); pos += 2;
		boundsHeight = view.getUint16(pos); pos += 2;
	}

	const speed = view.getUint8(pos); pos += 1;
	const repeatDelay = view.getUint8(pos); pos += 1;
	const swing = view.getInt8(pos) === 1; pos += 1;

	// Frames
	const frameCount = view.getInt16(pos); pos += 2;
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
	const textures: JtaTexture[] = [];
	for (let i = 0; i < textureCount; i++) {
		const rawLen = view.getInt32(pos); pos += 4;
		let raw: Uint8Array;
		if (rawLen > 0) {
			raw = data.subarray(pos, pos + rawLen);
			pos += rawLen;
		} else {
			raw = new Uint8Array(0);
		}
		textures.push({ raw });
	}

	return {
		version, fps, speed, repeatDelay, swing,
		boundsWidth, boundsHeight,
		frames, textures,
	};
}
