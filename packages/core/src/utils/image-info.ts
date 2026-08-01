import { decode as decodeJpeg } from 'jpeg-js';
import { Inflate } from 'pako';

export type RasterImageFormat = 'png' | 'jpeg';

export interface RasterImageInfo {
	format: RasterImageFormat;
	width: number;
	height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// ponytail: synchronous CLI validation is capped; raise only with measured decoder limits.
const MAX_SYNC_RASTER_BYTES = 128 * 1024 * 1024;
const MAX_RASTER_PIXELS = 8 * 1024 * 1024;
const MAX_SYNC_JPEG_MEMORY_MB = 64;
const MAX_BROWSER_RASTER_SOURCE_BYTES = 8 * 1024 * 1024;
const BROWSER_RASTER_VALIDATION_TIMEOUT_MS = 10_000;
const MAX_RASTER_SEGMENTS = 16_384;
const asyncProbeResults = new WeakMap<Uint8Array, RasterImageInfo | null>();
const PNG_COLOR_DEPTHS: Record<number, readonly number[]> = {
	0: [1, 2, 4, 8, 16],
	2: [8, 16],
	3: [1, 2, 4, 8],
	4: [8, 16],
	6: [8, 16],
};
const PNG_CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const PNG_CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
	let crc = value;
	for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
	return crc >>> 0;
});

function pngChunkCrc(data: Uint8Array, offset: number, length: number): number {
	let crc = 0xffffffff;
	for (let index = offset; index < offset + length; index += 1) {
		crc = PNG_CRC_TABLE[(crc ^ data[index]!) & 0xff]! ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function pngScanlinePasses(
	width: number,
	height: number,
	bitsPerPixel: number,
	interlace: number,
): Array<{ rows: number; rowBytes: number }> {
	if (interlace === 0) return [{ rows: height, rowBytes: Math.ceil((width * bitsPerPixel) / 8) }];
	const startsX = [0, 4, 0, 2, 0, 1, 0];
	const startsY = [0, 0, 4, 0, 2, 0, 1];
	const stepsX = [8, 8, 4, 4, 2, 2, 1];
	const stepsY = [8, 8, 8, 4, 4, 2, 2];
	return startsX.flatMap((startX, index) => {
		const passWidth = width <= startX ? 0 : Math.ceil((width - startX) / stepsX[index]!);
		const passHeight = height <= startsY[index]! ? 0 : Math.ceil((height - startsY[index]!) / stepsY[index]!);
		return passWidth === 0 || passHeight === 0
			? []
			: [{ rows: passHeight, rowBytes: Math.ceil((passWidth * bitsPerPixel) / 8) }];
	});
}

function validatePngImageData(
	parts: Uint8Array[],
	width: number,
	height: number,
	bitDepth: number,
	colorType: number,
	interlace: number,
): boolean {
	let compressedLength = 0;
	for (const part of parts) {
		compressedLength += part.length;
		if (compressedLength > MAX_SYNC_RASTER_BYTES) return false;
	}
	if (compressedLength === 0) return false;
	const passes = pngScanlinePasses(width, height, PNG_CHANNELS[colorType]! * bitDepth, interlace);
	const expectedLength = passes.reduce((total, pass) => total + pass.rows * (pass.rowBytes + 1), 0);
	if (!Number.isSafeInteger(expectedLength) || expectedLength > MAX_SYNC_RASTER_BYTES) return false;
	let outputOffset = 0;
	let passIndex = 0;
	let passRow = 0;
	let nextFilterOffset = 0;
	try {
		const compressed = new Uint8Array(compressedLength);
		let compressedOffset = 0;
		for (const part of parts) {
			compressed.set(part, compressedOffset);
			compressedOffset += part.length;
		}
		const inflater = new Inflate({ windowBits: 15 });
		inflater.onData = (chunk) => {
			if (!(chunk instanceof Uint8Array)) throw new Error('PNG inflate returned non-binary data.');
			for (const byte of chunk) {
				if (outputOffset === nextFilterOffset) {
					if (byte > 4 || passIndex >= passes.length) throw new Error('Invalid PNG scanline filter.');
					const rowBytes = passes[passIndex]!.rowBytes;
					passRow += 1;
					if (passRow === passes[passIndex]!.rows) {
						passIndex += 1;
						passRow = 0;
					}
					nextFilterOffset = outputOffset + rowBytes + 1;
				}
				outputOffset += 1;
				if (outputOffset > expectedLength) throw new Error('PNG image data exceeds its declared dimensions.');
			}
		};
		inflater.push(compressed, true);
		return inflater.err === 0 && outputOffset === expectedLength && passIndex === passes.length;
	} catch {
		return false;
	}
}

function readPngInfo(data: Uint8Array, validateImageData: boolean): RasterImageInfo | null {
	if (data.length < (validateImageData ? 45 : 33) || PNG_SIGNATURE.some((byte, index) => data[index] !== byte))
		return null;
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	let offset = PNG_SIGNATURE.length;
	let width = 0;
	let height = 0;
	let bitDepth = 0;
	let colorType = 0;
	let interlace = 0;
	let sawHeader = false;
	let sawPalette = false;
	let sawImageData = false;
	let imageDataEnded = false;
	let segmentCount = 0;
	const imageDataParts: Uint8Array[] = [];
	while (offset + 12 <= data.length) {
		segmentCount += 1;
		if (segmentCount > MAX_RASTER_SEGMENTS) return null;
		const length = view.getUint32(offset);
		const chunkEnd = offset + 12 + length;
		if (chunkEnd > data.length) return null;
		const typeBytes = data.subarray(offset + 4, offset + 8);
		if (
			typeBytes.some((byte) => !((byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a))) ||
			(typeBytes[2]! & 0x20) !== 0
		)
			return null;
		const type = String.fromCharCode(data[offset + 4]!, data[offset + 5]!, data[offset + 6]!, data[offset + 7]!);
		if (pngChunkCrc(data, offset + 4, length + 4) !== view.getUint32(offset + 8 + length)) return null;
		if (!sawHeader) {
			if (type !== 'IHDR' || length !== 13) return null;
			width = view.getUint32(offset + 8);
			height = view.getUint32(offset + 12);
			bitDepth = data[offset + 16]!;
			colorType = data[offset + 17]!;
			interlace = data[offset + 20]!;
			if (width === 0 || height === 0 || width > 0x7fffffff || height > 0x7fffffff) return null;
			if (!PNG_COLOR_DEPTHS[colorType]?.includes(bitDepth)) return null;
			if (data[offset + 18] !== 0 || data[offset + 19] !== 0 || (interlace !== 0 && interlace !== 1)) return null;
			sawHeader = true;
			if (!validateImageData) return { format: 'png', width, height };
		} else if (type === 'IHDR') {
			return null;
		}
		const critical = (data[offset + 4]! & 0x20) === 0;
		if (critical && type !== 'IHDR' && type !== 'PLTE' && type !== 'IDAT' && type !== 'IEND') return null;
		if (type === 'PLTE') {
			if (
				sawPalette ||
				sawImageData ||
				colorType === 0 ||
				colorType === 4 ||
				length === 0 ||
				length % 3 !== 0 ||
				length > 768 ||
				(colorType === 3 && length / 3 > 2 ** bitDepth)
			)
				return null;
			sawPalette = true;
		}
		if (type === 'IDAT') {
			if (imageDataEnded || (colorType === 3 && !sawPalette)) return null;
			sawImageData = true;
			imageDataParts.push(data.subarray(offset + 8, offset + 8 + length));
		} else if (sawImageData && type !== 'IEND') {
			imageDataEnded = true;
		}
		if (type === 'IEND') {
			return length === 0 &&
				sawImageData &&
				(colorType !== 3 || sawPalette) &&
				chunkEnd === data.length &&
				(!validateImageData ||
					validatePngImageData(imageDataParts, width, height, bitDepth, colorType, interlace))
				? { format: 'png', width, height }
				: null;
		}
		offset = chunkEnd;
	}
	return null;
}

function isJpegStartOfFrame(marker: number): boolean {
	return marker === 0xc0 || marker === 0xc1 || marker === 0xc2;
}

function canDecodeJpeg(data: Uint8Array, width: number, height: number): boolean {
	if (width * height > MAX_RASTER_PIXELS) return false;
	try {
		const decoded = decodeJpeg(data, {
			useTArray: true,
			formatAsRGBA: false,
			tolerantDecoding: false,
			maxResolutionInMP: MAX_RASTER_PIXELS / 1_000_000,
			maxMemoryUsageInMB: MAX_SYNC_JPEG_MEMORY_MB,
		});
		return decoded.width === width && decoded.height === height;
	} catch {
		return false;
	}
}

function readJpegInfo(data: Uint8Array, decodePixels: boolean): RasterImageInfo | null {
	if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null;
	let offset = 2;
	let width = 0;
	let height = 0;
	let frameMarker = 0;
	let sawScan = false;
	let inScan = false;
	let scanHasData = false;
	let segmentCount = 0;
	const quantizationTables = new Set<number>();
	const huffmanTables = new Set<string>();
	const frameComponents = new Map<number, number>();
	const scannedComponents = new Set<number>();
	while (offset < data.length) {
		if (inScan) {
			if (data[offset] !== 0xff) {
				scanHasData = true;
				offset += 1;
				continue;
			}
			while (offset < data.length && data[offset] === 0xff) offset += 1;
			if (offset >= data.length) return null;
			const marker = data[offset]!;
			if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
				scanHasData = true;
				offset += 1;
				continue;
			}
			if (!scanHasData) return null;
			offset -= 1;
			inScan = false;
			continue;
		}

		if (data[offset] !== 0xff) return null;
		while (offset < data.length && data[offset] === 0xff) offset += 1;
		if (offset >= data.length) return null;
		const marker = data[offset++]!;
		segmentCount += 1;
		if (segmentCount > MAX_RASTER_SEGMENTS) return null;
		if (marker === 0xd9) {
			return frameMarker !== 0 &&
				sawScan &&
				scannedComponents.size === frameComponents.size &&
				[...frameComponents.values()].every((table) => quantizationTables.has(table)) &&
				(!decodePixels || canDecodeJpeg(data, width, height))
				? { format: 'jpeg', width, height }
				: null;
		}
		if (marker === 0x00 || marker === 0xd8) return null;
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
		if (offset + 2 > data.length) return null;
		const length = (data[offset]! << 8) | data[offset + 1]!;
		if (length < 2 || offset + length > data.length) return null;
		if (marker === 0xdb) {
			let cursor = offset + 2;
			while (cursor < offset + length) {
				const tableInfo = data[cursor++]!;
				const precision = tableInfo >> 4;
				const table = tableInfo & 0x0f;
				const tableLength = precision === 0 ? 64 : precision === 1 ? 128 : 0;
				if (table > 3 || tableLength === 0 || cursor + tableLength > offset + length) return null;
				for (let valueOffset = 0; valueOffset < tableLength; valueOffset += precision + 1) {
					const value =
						precision === 0
							? data[cursor + valueOffset]!
							: (data[cursor + valueOffset]! << 8) | data[cursor + valueOffset + 1]!;
					if (value === 0) return null;
				}
				quantizationTables.add(table);
				cursor += tableLength;
			}
			if (cursor !== offset + length) return null;
		}
		if (marker === 0xc4) {
			let cursor = offset + 2;
			while (cursor < offset + length) {
				const tableInfo = data[cursor++]!;
				const tableClass = tableInfo >> 4;
				const table = tableInfo & 0x0f;
				if (tableClass > 1 || table > 3 || cursor + 16 > offset + length) return null;
				let symbolCount = 0;
				let availableCodes = 1;
				for (let index = 0; index < 16; index += 1) {
					availableCodes = availableCodes * 2 - data[cursor + index]!;
					if (availableCodes < 0) return null;
					symbolCount += data[cursor + index]!;
				}
				cursor += 16;
				if (symbolCount === 0 || symbolCount > 256 || cursor + symbolCount > offset + length) return null;
				for (let symbol = 0; symbol < symbolCount; symbol += 1) {
					const value = data[cursor + symbol]!;
					const size = value & 0x0f;
					if (tableClass === 0 ? value > 11 : size > 10) return null;
				}
				huffmanTables.add(`${tableClass}:${table}`);
				cursor += symbolCount;
			}
			if (cursor !== offset + length) return null;
		}
		if (isJpegStartOfFrame(marker)) {
			if (frameMarker !== 0 || length < 11) return null;
			const precision = data[offset + 2]!;
			height = (data[offset + 3]! << 8) | data[offset + 4]!;
			width = (data[offset + 5]! << 8) | data[offset + 6]!;
			const componentCount = data[offset + 7]!;
			if (
				precision !== 8 ||
				width === 0 ||
				height === 0 ||
				componentCount === 0 ||
				componentCount > 4 ||
				length !== 8 + componentCount * 3
			)
				return null;
			for (let component = 0; component < componentCount; component += 1) {
				const componentId = data[offset + 8 + component * 3]!;
				const sampling = data[offset + 9 + component * 3]!;
				const horizontal = sampling >> 4;
				const vertical = sampling & 0x0f;
				const quantizationTable = data[offset + 10 + component * 3]!;
				if (
					frameComponents.has(componentId) ||
					horizontal < 1 ||
					horizontal > 4 ||
					vertical < 1 ||
					vertical > 4 ||
					quantizationTable > 3
				)
					return null;
				frameComponents.set(componentId, quantizationTable);
			}
			frameMarker = marker;
			if (!decodePixels) return { format: 'jpeg', width, height };
		}
		if (marker === 0xda) {
			if (frameMarker === 0 || length < 8) return null;
			const componentCount = data[offset + 2]!;
			if (componentCount === 0 || componentCount > frameComponents.size || length !== 6 + componentCount * 2)
				return null;
			const scanComponents = new Map<number, { dc: number; ac: number }>();
			for (let component = 0; component < componentCount; component += 1) {
				const componentId = data[offset + 3 + component * 2]!;
				const tableInfo = data[offset + 4 + component * 2]!;
				const dc = tableInfo >> 4;
				const ac = tableInfo & 0x0f;
				if (!frameComponents.has(componentId) || scanComponents.has(componentId) || dc > 3 || ac > 3)
					return null;
				scanComponents.set(componentId, { dc, ac });
			}
			const spectralStart = data[offset + 3 + componentCount * 2]!;
			const spectralEnd = data[offset + 4 + componentCount * 2]!;
			const approximation = data[offset + 5 + componentCount * 2]!;
			if (frameMarker === 0xc2) {
				const high = approximation >> 4;
				const low = approximation & 0x0f;
				if (
					spectralStart > spectralEnd ||
					spectralEnd > 63 ||
					high > 13 ||
					low > 13 ||
					(high !== 0 && high !== low + 1) ||
					(spectralStart === 0 && spectralEnd !== 0) ||
					(spectralStart !== 0 && componentCount !== 1)
				)
					return null;
				for (const { dc, ac } of scanComponents.values()) {
					if (spectralStart === 0 ? !huffmanTables.has(`0:${dc}`) : !huffmanTables.has(`1:${ac}`))
						return null;
				}
			} else {
				if (spectralStart !== 0 || spectralEnd !== 63 || approximation !== 0) return null;
				for (const { dc, ac } of scanComponents.values()) {
					if (!huffmanTables.has(`0:${dc}`) || !huffmanTables.has(`1:${ac}`)) return null;
				}
			}
			if (
				[...scanComponents.keys()].some(
					(componentId) => !quantizationTables.has(frameComponents.get(componentId)!),
				)
			)
				return null;
			for (const componentId of scanComponents.keys()) scannedComponents.add(componentId);
			sawScan = true;
			inScan = true;
			scanHasData = false;
		}
		offset += length;
	}
	return null;
}

/**
 * Strictly validate a complete PNG or JPEG source and return its decoded dimensions.
 *
 * Unlike `probeRasterImageDimensions`, this validates PNG image data and fully
 * decodes JPEG pixels. Unsupported formats and malformed inputs return `null`.
 */
export function probeRasterImage(data: Uint8Array): RasterImageInfo | null {
	if (asyncProbeResults.has(data)) return asyncProbeResults.get(data) ?? null;
	if (data.byteLength > MAX_SYNC_RASTER_BYTES) return null;
	return readPngInfo(data, true) ?? readJpegInfo(data, true);
}

export function probeRasterImageDimensions(data: Uint8Array): RasterImageInfo | null {
	if (asyncProbeResults.has(data)) return asyncProbeResults.get(data) ?? null;
	if (data.byteLength > MAX_SYNC_RASTER_BYTES) return null;
	return readPngInfo(data, false) ?? readJpegInfo(data, false);
}

export function browserRasterValidationRequired(data: Uint8Array): boolean {
	return typeof Worker === 'function' && !asyncProbeResults.has(data);
}

export async function prepareBrowserRasterValidation(data: Uint8Array): Promise<void> {
	if (typeof Worker !== 'function') return;
	if (data.byteLength > MAX_BROWSER_RASTER_SOURCE_BYTES) {
		asyncProbeResults.set(data, null);
		return;
	}
	let worker: Worker;
	try {
		worker = new Worker(new URL('./image-validation-worker.js', import.meta.url), { type: 'module' });
	} catch {
		return;
	}
	await new Promise<void>((resolve) => {
		let settled = false;
		let timeout: ReturnType<typeof setTimeout>;
		const finish = (): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			worker.terminate();
			resolve();
		};
		worker.onmessage = (event: MessageEvent<unknown>) => {
			const info = event.data;
			if (
				typeof info === 'object' &&
				info !== null &&
				'format' in info &&
				'width' in info &&
				'height' in info &&
				(info.format === 'png' || info.format === 'jpeg') &&
				typeof info.width === 'number' &&
				typeof info.height === 'number' &&
				Number.isInteger(info.width) &&
				Number.isInteger(info.height) &&
				info.width > 0 &&
				info.height > 0 &&
				info.width * info.height <= MAX_RASTER_PIXELS
			)
				asyncProbeResults.set(data, info as RasterImageInfo);
			else asyncProbeResults.set(data, null);
			finish();
		};
		worker.onerror = finish;
		worker.onmessageerror = finish;
		timeout = setTimeout(finish, BROWSER_RASTER_VALIDATION_TIMEOUT_MS);
		try {
			const copy = data.slice();
			worker.postMessage(copy.buffer, [copy.buffer]);
		} catch {
			finish();
		}
	});
}

export function clearBrowserRasterValidation(data: Uint8Array): void {
	asyncProbeResults.delete(data);
}

export function rasterImageFormatFromFileName(fileName: string): RasterImageFormat | null {
	const dotIndex = fileName.lastIndexOf('.');
	if (dotIndex <= 0 || dotIndex === fileName.length - 1) return null;
	const extension = fileName.slice(dotIndex + 1).toLowerCase();
	if (extension === 'png') return 'png';
	if (extension === 'jpg' || extension === 'jpeg') return 'jpeg';
	return null;
}
