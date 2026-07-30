const JTA_FILE_MARK = 'yytou';
const JTA_VERSION = 102;
const JTA_DEFAULT_FPS = 24;

export interface RestorableMovieFrame {
	getRectX(): number;
	getRectY(): number;
	getRectWidth(): number;
	getRectHeight(): number;
	getAddDelay(): number;
	getSpriteId(): string;
}

interface RestorableMovieClipResource {
	getHeight?(): number;
	getInterval?(): number;
	getRepeatDelay?(): number;
	getSwing?(): boolean;
	getWidth?(): number;
}

function scaledFrameDelay(milliseconds: number): number {
	return milliseconds <= 0 ? 0 : Math.max(1, Math.round(milliseconds / (1000 / JTA_DEFAULT_FPS)));
}

function jtaSpeed(interval: number): number {
	return interval <= 0 ? 1 : Math.max(1, Math.round(interval / (1000 / JTA_DEFAULT_FPS)));
}

function writeInt16(value: number): Uint8Array {
	const data = new Uint8Array(2);
	new DataView(data.buffer).setInt16(0, value);
	return data;
}

function writeUint16(value: number): Uint8Array {
	const data = new Uint8Array(2);
	new DataView(data.buffer).setUint16(0, value);
	return data;
}

function writeInt32(value: number): Uint8Array {
	const data = new Uint8Array(4);
	new DataView(data.buffer).setInt32(0, value);
	return data;
}

function writeByte(value: number): Uint8Array {
	return new Uint8Array([value & 0xff]);
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
	const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
	const data = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		data.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return data;
}

function encodeJtaUtf(value: string): Uint8Array {
	const bytes = new TextEncoder().encode(value);
	return concatBytes([writeUint16(bytes.byteLength), bytes]);
}

export function serializeMovieClip(
	resource: RestorableMovieClipResource,
	frames: RestorableMovieFrame[],
	textures: Uint8Array[],
): Uint8Array {
	const chunks: Uint8Array[] = [
		encodeJtaUtf(JTA_FILE_MARK),
		writeInt32(JTA_VERSION),
		writeByte(0),
		writeByte(0),
		writeByte(0),
		writeByte(0),
		writeUint16(0),
		writeUint16(0),
		writeUint16(resource.getWidth?.() ?? 0),
		writeUint16(resource.getHeight?.() ?? 0),
		writeByte(jtaSpeed(resource.getInterval?.() ?? 0)),
		writeByte(scaledFrameDelay(resource.getRepeatDelay?.() ?? 0)),
		writeByte(resource.getSwing?.() ? 1 : 0),
		writeInt16(frames.length),
	];

	for (const [index, frame] of frames.entries()) {
		chunks.push(
			writeInt16(scaledFrameDelay(frame.getAddDelay())),
			writeInt16(frame.getRectX()),
			writeInt16(frame.getRectY()),
			writeInt16(frame.getRectWidth()),
			writeInt16(frame.getRectHeight()),
			writeInt16(textures[index]?.byteLength === 0 ? -1 : index),
		);
	}

	chunks.push(writeInt16(textures.length));
	for (const texture of textures) chunks.push(writeInt32(texture.byteLength), texture);
	return concatBytes(chunks);
}
