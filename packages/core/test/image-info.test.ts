import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'ava';
import { deflate, gzip } from 'pako';
import {
	browserRasterValidationRequired,
	clearBrowserRasterValidation,
	prepareBrowserRasterValidation,
	probeRasterImage,
	probeRasterImageDimensions,
	rasterImageFormatFromFileName,
} from '../src/utils/image-info.js';

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function concat(...parts: Uint8Array[]): Uint8Array {
	const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		result.set(part, offset);
		offset += part.length;
	}
	return result;
}

function crc32(data: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of data) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, body: Uint8Array): Uint8Array {
	const typeBytes = Uint8Array.from(type, (character) => character.charCodeAt(0));
	const result = new Uint8Array(body.length + 12);
	const view = new DataView(result.buffer);
	view.setUint32(0, body.length);
	result.set(typeBytes, 4);
	result.set(body, 8);
	view.setUint32(body.length + 8, crc32(concat(typeBytes, body)));
	return result;
}

function indexedPng(
	imageData: Uint8Array = deflate(new Uint8Array([0, 0])),
	includePalette = true,
	width = 1,
	height = 1,
	interlace = 0,
): Uint8Array {
	const header = new Uint8Array(13);
	const view = new DataView(header.buffer);
	view.setUint32(0, width);
	view.setUint32(4, height);
	header[8] = 8;
	header[9] = 3;
	header[12] = interlace;
	return concat(
		PNG_SIGNATURE,
		pngChunk('IHDR', header),
		...(includePalette ? [pngChunk('PLTE', new Uint8Array([0, 0, 0]))] : []),
		pngChunk('IDAT', imageData),
		pngChunk('IEND', new Uint8Array()),
	);
}

function adam7EightByEight(): Uint8Array {
	const bytes: number[] = [];
	for (const [rows, rowBytes] of [
		[1, 1],
		[1, 1],
		[1, 2],
		[2, 2],
		[2, 4],
		[4, 4],
		[4, 8],
	]) {
		for (let row = 0; row < rows!; row += 1) bytes.push(0, ...new Array<number>(rowBytes).fill(0));
	}
	return deflate(Uint8Array.from(bytes));
}

const JPEG_DQT = new Uint8Array([0xff, 0xdb, 0x00, 0x43, 0x00, ...new Array<number>(64).fill(1)]);
const JPEG_DHT = new Uint8Array([
	0xff,
	0xc4,
	0x00,
	0x26,
	0x00,
	1,
	...new Array<number>(15).fill(0),
	0,
	0x10,
	1,
	...new Array<number>(15).fill(0),
	0,
]);
const JPEG_SOF = new Uint8Array([0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00]);
const JPEG_SOS = new Uint8Array([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]);
const JPEG_1X1 = concat(
	new Uint8Array([0xff, 0xd8]),
	JPEG_DQT,
	JPEG_SOF,
	JPEG_DHT,
	JPEG_SOS,
	new Uint8Array([0x3f, 0xff, 0xd9]),
);

test('raster probe rejects malformed PNG/JPEG containers and extension ambiguity', (t) => {
	const png = indexedPng();
	t.deepEqual(probeRasterImage(png), { format: 'png', width: 1, height: 1 });
	t.deepEqual(probeRasterImageDimensions(png.subarray(0, 33)), { format: 'png', width: 1, height: 1 });
	t.is(probeRasterImage(png.subarray(0, 33)), null);
	t.is(probeRasterImage(indexedPng(undefined, false)), null);
	t.is(probeRasterImage(indexedPng(new Uint8Array([1, 2, 3]))), null);
	t.is(probeRasterImage(indexedPng(deflate(new Uint8Array([5, 0])))), null);
	t.is(probeRasterImage(indexedPng(gzip(new Uint8Array([0, 0])))), null);
	t.deepEqual(probeRasterImage(indexedPng(adam7EightByEight(), true, 8, 8, 1)), {
		format: 'png',
		width: 8,
		height: 8,
	});
	t.is(probeRasterImage(indexedPng(undefined, true, 16384, 16384)), null);
	const badCrc = new Uint8Array(png);
	badCrc[badCrc.length - 1]! ^= 1;
	t.is(probeRasterImage(badCrc), null);
	for (const invalidType of ['t1XT', 'texT']) {
		t.is(
			probeRasterImage(concat(png.subarray(0, 33), pngChunk(invalidType, new Uint8Array()), png.subarray(33))),
			null,
		);
	}
	const emptyAncillary = pngChunk('tEXt', new Uint8Array());
	t.is(
		probeRasterImage(
			concat(png.subarray(0, 33), ...new Array<Uint8Array>(16_384).fill(emptyAncillary), png.subarray(33)),
		),
		null,
	);

	t.deepEqual(probeRasterImage(JPEG_1X1), { format: 'jpeg', width: 1, height: 1 });
	const jpegHeader = concat(new Uint8Array([0xff, 0xd8]), JPEG_SOF);
	t.deepEqual(probeRasterImageDimensions(jpegHeader), { format: 'jpeg', width: 1, height: 1 });
	t.is(probeRasterImage(jpegHeader), null);
	const progressive = new Uint8Array(
		readFileSync(
			fileURLToPath(
				new URL(
					'../../test-utils/test/fixtures/FairyGUI-unity/UIProject/assets/TurnPage/haibian.jpg',
					import.meta.url,
				),
			),
		),
	);
	t.deepEqual(probeRasterImage(progressive), { format: 'jpeg', width: 300, height: 400 });
	const badPrecision = new Uint8Array(JPEG_1X1);
	badPrecision[JPEG_DQT.length + 6] = 7;
	t.is(probeRasterImage(badPrecision), null);
	const badSampling = new Uint8Array(JPEG_1X1);
	badSampling[JPEG_DQT.length + 13] = 0;
	t.is(probeRasterImage(badSampling), null);
	const insufficientEntropy = new Uint8Array(JPEG_1X1);
	const frameOffset = 2 + JPEG_DQT.length;
	insufficientEntropy[frameOffset + 5] = 0;
	insufficientEntropy[frameOffset + 6] = 10;
	insufficientEntropy[frameOffset + 7] = 0;
	insufficientEntropy[frameOffset + 8] = 10;
	t.is(probeRasterImage(insufficientEntropy), null);
	t.is(
		probeRasterImage(
			concat(new Uint8Array([0xff, 0xd8]), JPEG_SOF, JPEG_DHT, JPEG_SOS, new Uint8Array([0x3f, 0xff, 0xd9])),
		),
		null,
	);
	t.is(
		probeRasterImage(
			concat(
				new Uint8Array([0xff, 0xd8]),
				JPEG_DQT,
				JPEG_DHT,
				JPEG_SOS,
				new Uint8Array([0x3f]),
				JPEG_SOF,
				new Uint8Array([0xff, 0xd9]),
			),
		),
		null,
	);

	t.is(rasterImageFormatFromFileName('asset.png'), 'png');
	t.is(rasterImageFormatFromFileName('asset.JPEG'), 'jpeg');
	t.is(rasterImageFormatFromFileName('png'), null);
	t.is(rasterImageFormatFromFileName('.png'), null);
});

test.serial('browser raster preparation caches strict worker results', async (t) => {
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
	const valid = indexedPng();
	const invalid = indexedPng(new Uint8Array([1, 2, 3]));
	const oversizedReply = new Uint8Array([0]);
	let terminateCount = 0;
	class FakeWorker {
		public onmessage: ((event: MessageEvent<ReturnType<typeof probeRasterImage>>) => void) | null = null;
		public onerror: (() => void) | null = null;

		public postMessage(message: ArrayBuffer): void {
			const result =
				message.byteLength === 1
					? { format: 'png' as const, width: 4096, height: 4096 }
					: probeRasterImage(new Uint8Array(message));
			queueMicrotask(() =>
				this.onmessage?.({ data: result } as MessageEvent<ReturnType<typeof probeRasterImage>>),
			);
		}

		public terminate(): void {
			terminateCount += 1;
		}
	}
	try {
		Object.defineProperty(globalThis, 'Worker', {
			configurable: true,
			value: FakeWorker,
		});
		t.true(browserRasterValidationRequired(valid));
		await prepareBrowserRasterValidation(valid);
		t.false(browserRasterValidationRequired(valid));
		t.deepEqual(probeRasterImage(valid), { format: 'png', width: 1, height: 1 });
		t.is(terminateCount, 1);

		await prepareBrowserRasterValidation(invalid);
		t.is(probeRasterImage(invalid), null);
		t.is(terminateCount, 2);

		await prepareBrowserRasterValidation(oversizedReply);
		t.false(browserRasterValidationRequired(oversizedReply));
		t.is(probeRasterImage(oversizedReply), null);
		t.is(terminateCount, 3);
	} finally {
		clearBrowserRasterValidation(valid);
		clearBrowserRasterValidation(invalid);
		clearBrowserRasterValidation(oversizedReply);
		if (descriptor) Object.defineProperty(globalThis, 'Worker', descriptor);
		else Reflect.deleteProperty(globalThis, 'Worker');
	}
});
