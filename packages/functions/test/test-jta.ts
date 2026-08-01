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

export const TEST_PNG = Uint8Array.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
	0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
	0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
	0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
	0x89, 0x00, 0x00, 0x00, 0x09, 0x70, 0x48, 0x59,
	0x73, 0x00, 0x00, 0x03, 0xe8, 0x00, 0x00, 0x03,
	0xe8, 0x01, 0xb5, 0x7b, 0x52, 0x6b, 0x00, 0x00,
	0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c,
	0x63, 0xf8, 0xff, 0xff, 0xff, 0x7f, 0x00, 0x09,
	0xfb, 0x03, 0xfd, 0x2a, 0x86, 0xe3, 0x8a, 0x00,
	0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
	0x42, 0x60, 0x82,
]);

function decodeBase64(value: string): Uint8Array {
	const binary = atob(value);
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export const TEST_JPEG = decodeBase64(
	'/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpAB//Z',
);

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
