export interface TestJtaFrame {
	delay?: number;
	rectX?: number;
	rectY?: number;
	rectWidth?: number;
	rectHeight?: number;
	textureIndex: number;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
	const output = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.byteLength, 0));
	let offset = 0;
	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return output;
}

function int16(value: number): Uint8Array {
	const bytes = new Uint8Array(2);
	new DataView(bytes.buffer).setInt16(0, value);
	return bytes;
}

function uint16(value: number): Uint8Array {
	const bytes = new Uint8Array(2);
	new DataView(bytes.buffer).setUint16(0, value);
	return bytes;
}

function int32(value: number): Uint8Array {
	const bytes = new Uint8Array(4);
	new DataView(bytes.buffer).setInt32(0, value);
	return bytes;
}

export function createTestJta(
	textures: Uint8Array[],
	frames: TestJtaFrame[],
	options: {
		fps?: number;
		speed?: number;
		repeatDelay?: number;
		swing?: boolean;
		width?: number;
		height?: number;
	} = {},
): Uint8Array {
	const mark = new TextEncoder().encode('yytou');
	const chunks: Uint8Array[] = [
		uint16(mark.byteLength),
		mark,
		int32(102),
		new Uint8Array([options.fps ?? 24, 0, 0, 0]),
		uint16(0),
		uint16(0),
		uint16(options.width ?? 32),
		uint16(options.height ?? 24),
		new Uint8Array([options.speed ?? 1, options.repeatDelay ?? 0, options.swing ? 1 : 0]),
		int16(frames.length),
	];

	for (const frame of frames) {
		chunks.push(
			int16(frame.delay ?? 0),
			int16(frame.rectX ?? 0),
			int16(frame.rectY ?? 0),
			int16(frame.rectWidth ?? 1),
			int16(frame.rectHeight ?? 1),
			int16(frame.textureIndex),
		);
	}

	chunks.push(int16(textures.length));
	for (const texture of textures) chunks.push(int32(texture.byteLength), texture);
	return concatBytes(chunks);
}
