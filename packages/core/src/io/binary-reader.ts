import { Inflate } from 'pako';
import { Document } from '../document.js';
import { FGUI_MAGIC } from '../constants.js';
import type { ImageResource } from '../properties/image-resource.js';
import type { Package } from '../properties/package.js';
import { ByteBuffer } from './byte-buffer.js';
import { decodeComponentDefinition } from './component-decoder.js';
import type { FileSystem } from './file-system.js';

export interface BinaryReadLimits {
	maxCompressedBytes: number;
	maxDecompressedBytes: number;
	maxCompressionRatio: number;
}

export interface BinaryReaderOptions {
	limits?: Partial<BinaryReadLimits>;
}

const DEFAULT_BINARY_READ_LIMITS: BinaryReadLimits = {
	maxCompressedBytes: 64 * 1024 * 1024,
	maxDecompressedBytes: 256 * 1024 * 1024,
	maxCompressionRatio: 200,
};

function readLimits(options: BinaryReaderOptions): BinaryReadLimits {
	const limits = { ...DEFAULT_BINARY_READ_LIMITS, ...options.limits };
	for (const [name, value] of Object.entries(limits)) {
		if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a positive finite number.`);
	}
	return limits;
}

function inflateRawWithLimits(input: Uint8Array, limits: BinaryReadLimits): Uint8Array {
	if (input.byteLength > limits.maxCompressedBytes) {
		throw new Error(`FairyGUI binary compressed data exceeds ${limits.maxCompressedBytes} bytes.`);
	}
	const maxOutputBytes = Math.min(
		limits.maxDecompressedBytes,
		Math.floor(input.byteLength * limits.maxCompressionRatio),
	);
	const chunks: Uint8Array[] = [];
	let outputLength = 0;
	const inflater = new Inflate({ raw: true });
	inflater.onData = (chunk) => {
		if (!(chunk instanceof Uint8Array)) throw new Error('FairyGUI binary inflate returned non-binary data.');
		outputLength += chunk.byteLength;
		if (outputLength > maxOutputBytes) {
			throw new Error(`FairyGUI binary decompressed data exceeds the configured ${maxOutputBytes} byte budget.`);
		}
		chunks.push(chunk);
	};
	inflater.push(input, true);
	if (inflater.err !== 0) throw new Error(`Invalid compressed FairyGUI binary data: ${inflater.msg}`);
	const output = new Uint8Array(outputLength);
	let offset = 0;
	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return output;
}

/**
 * Binary item type codes as used in the .fui format.
 * @internal
 */
const BinItemType = {
	Image: 0,
	MovieClip: 1,
	Sound: 2,
	Component: 3,
	Atlas: 4,
	Font: 5,
	Swf: 6,
	Misc: 7,
	Unknown: 8,
	Spine: 9,
	DragonBones: 10,
} as const;

type BinItemType = (typeof BinItemType)[keyof typeof BinItemType];

interface BinaryDependency {
	id: string;
	name: string;
}

interface RawBinarySlice {
	buffer: ArrayBufferLike;
	byteOffset: number;
	byteLength: number;
}

interface BinarySpriteEntry {
	itemId: string;
	atlasId: string;
	x: number;
	y: number;
	w: number;
	h: number;
	rotated: boolean;
	offsetX: number;
	offsetY: number;
	originalWidth: number;
	originalHeight: number;
}

interface BranchAwarePackageResource {
	setPath(path: string): unknown;
	setBranch(branch: string): unknown;
	setBranchItemIds(ids: string[]): unknown;
}

interface HighResolutionAwarePackageResource {
	setHighResolutionItemIds?(ids: Array<string | null>): unknown;
}

function normalizePackageResourcePath(path: string): string {
	const normalized = path.replace(/\\/g, '/').trim();
	if (!normalized || normalized === '/') return '/';
	return `/${normalized.replace(/^\/+/, '').replace(/\/+$/, '')}/`;
}

function fileNameSuffix(fileName: string): string {
	const baseName = fileName.split(/[\\/]/).pop() ?? fileName;
	const suffixMatch = /((?:\.[^.\\/]+)+)$/u.exec(baseName);
	return suffixMatch?.[1] ?? '';
}

function normalizePublishedImageFileName(name: string): string {
	return `${name || 'image'}.png`;
}

function normalizePublishedSoundFileName(name: string, fileName: string): string {
	if (!name) return fileName;
	const suffix = fileNameSuffix(fileName) || '.wav';
	return `${name}${suffix}`;
}

function findPackageById(doc: Document, id: string): Package | null {
	if (!id) return null;
	return doc.getRoot().getPackageById(id);
}

function getOrCreatePackage(doc: Document, id: string, name: string): Package {
	const existing = findPackageById(doc, id);
	if (existing) {
		if (name) existing.setName(name);
		return existing;
	}
	const pkg = doc.createPackage(name);
	pkg.setId(id);
	return pkg;
}

function parseAtlasIndex(id: string): number {
	const match = /^atlas(\d+)$/.exec(id);
	return match ? Number.parseInt(match[1] ?? '0', 10) : 0;
}

interface BinaryPackageExtras extends Record<string, unknown> {
	sprites?: BinarySpriteEntry[];
}

interface ComponentBinaryExtras extends Record<string, unknown> {
	_rawBinary?: RawBinarySlice;
}

interface PixelHitTestEntry {
	itemId: string;
	pixelWidth: number;
	scaleDenominator: number;
	pixels: Uint8Array;
}

function toRawBinarySlice(buf: ByteBuffer): RawBinarySlice {
	return {
		buffer: buf.buffer,
		byteOffset: buf.byteOffset,
		byteLength: buf.byteLength,
	};
}

function getPackageExtras(pkg: { getExtras(): Record<string, unknown> }): BinaryPackageExtras {
	return pkg.getExtras() as BinaryPackageExtras;
}

function getComponentExtras(resource: { getExtras(): Record<string, unknown> }): ComponentBinaryExtras {
	return resource.getExtras() as ComponentBinaryExtras;
}

function decodeMovieClipFrames(doc: Document, resource: ReturnType<Document['createMovieClipResource']>, buf: ByteBuffer): void {
	if (buf.byteLength === 0) return;
	const indexTablePos = buf.pos;

	if (buf.seek(indexTablePos, 0)) {
		resource.setInterval(buf.getInt32());
		resource.setSwing(buf.readBool());
		resource.setRepeatDelay(buf.getInt32());
	}

	if (!buf.seek(indexTablePos, 1)) return;
	const frameCount = buf.getInt16();
	for (let index = 0; index < frameCount; index += 1) {
		const chunkSize = buf.getInt16();
		const nextPos = buf.pos + chunkSize;
		const frame = doc.createMovieFrame(`${resource.getId()}_${index}`);
		frame
			.setRectX(buf.getInt32())
			.setRectY(buf.getInt32())
			.setRectWidth(buf.getInt32())
			.setRectHeight(buf.getInt32())
			.setAddDelay(buf.getInt32())
			.setSpriteId(buf.readS() ?? '');
		resource.addFrame(frame);
		buf.pos = nextPos;
	}
}

function decodeChar(charId: number): string {
	if (charId <= 0) return '';
	try {
		return String.fromCodePoint(charId);
	} catch {
		return '';
	}
}

function decodeFontGlyphs(doc: Document, resource: ReturnType<Document['createFontResource']>, buf: ByteBuffer): void {
	if (buf.byteLength === 0) return;
	const indexTablePos = buf.pos;

	if (buf.seek(indexTablePos, 0)) {
		resource
			.setTtf(buf.readBool())
			.setTint(buf.readBool())
			.setAutoScale(buf.readBool())
			.setHasChannel(buf.readBool())
			.setFontSize(buf.getInt32())
			.setXAdvance(buf.getInt32())
			.setLineHeight(buf.getInt32());
	}

	if (!buf.seek(indexTablePos, 1)) return;
	const glyphCount = buf.getInt32();
	for (let index = 0; index < glyphCount; index += 1) {
		const chunkSize = buf.getInt16();
		const nextPos = buf.pos + chunkSize;
		const charId = buf.getUint16();
		const glyph = doc.createFontGlyph(`${resource.getId()}_${charId || index}`);
		glyph
			.setCharId(charId)
			.setChar(decodeChar(charId))
			.setImg(buf.readS() ?? '')
			.setX(buf.getInt32())
			.setY(buf.getInt32())
			.setXOffset(buf.getInt32())
			.setYOffset(buf.getInt32())
			.setWidth(buf.getInt32())
			.setHeight(buf.getInt32())
			.setAdvance(buf.getInt32())
			.setChannel(buf.getUint8());
		resource.addGlyph(glyph);
		buf.pos = nextPos;
	}
}

/**
 * Reads a published FairyGUI binary package (.fui / _fui.bytes) into a {@link Document}.
 *
 * Package items, sprite atlas mappings, and component structured data are parsed.
 * Component raw binary slices are still retained in extras for write-back, while the reader
 * now also expands controllers, transitions, gears, relations, and common display-list fields
 * into the formal property graph.
 *
 * @category I/O
 */
export class BinaryReader {
	private readonly _fs: FileSystem;
	private readonly _limits: BinaryReadLimits;

	constructor(fs: FileSystem, options: BinaryReaderOptions = {}) {
		this._fs = fs;
		this._limits = readLimits(options);
	}

	async read(filePath: string): Promise<Document> {
		const doc = new Document();
		await this.readIntoDocument(doc, filePath);
		return doc;
	}

	async readIntoDocument(doc: Document, filePath: string): Promise<Document> {
		const raw = await this._fs.readFileRaw(filePath);
		const outer = new ByteBuffer(raw.buffer, raw.byteOffset, raw.byteLength);
		return this._parsePackage(outer, doc);
	}

	async readMany(filePaths: string[]): Promise<Document> {
		const doc = new Document();
		for (const filePath of filePaths) {
			await this.readIntoDocument(doc, filePath);
		}
		return doc;
	}

	private _parsePackage(outer: ByteBuffer, doc: Document): Document {
		// --- Header (always uncompressed) ---
		if (outer.getUint32() !== FGUI_MAGIC) {
			throw new Error('Invalid FairyGUI binary file: bad magic');
		}

		outer.version = outer.getInt32();
		const compressed = outer.readBool();
		const packageId = outer.readUTFString();
		const packageName = outer.readUTFString();
		outer.skip(20); // Reserved

		// --- Decompress remainder if needed ---
		let buf: ByteBuffer;
		if (compressed) {
			const remaining = new Uint8Array(
				outer.buffer,
				outer.byteOffset + outer.pos,
				outer.byteLength - outer.pos,
			);
			const decompressed = inflateRawWithLimits(remaining, this._limits);
			buf = new ByteBuffer(decompressed.buffer, 0, decompressed.byteLength);
		} else {
			if (outer.byteLength - outer.pos > this._limits.maxDecompressedBytes) {
				throw new Error(`FairyGUI binary data exceeds ${this._limits.maxDecompressedBytes} bytes.`);
			}
			buf = outer;
		}
		buf.version = outer.version;

		const indexTablePos = buf.pos;
		const ver2 = buf.version >= 2;

		// --- String table (block 4) ---
		buf.seek(indexTablePos, 4);
		const strCnt = buf.getInt32();
		const stringTable: string[] = [];
		for (let i = 0; i < strCnt; i++) stringTable[i] = buf.readUTFString();
		buf.stringTable = stringTable;

		// Custom string overrides (block 5, optional)
		if (buf.seek(indexTablePos, 5)) {
			const cnt = buf.readInt32();
			for (let i = 0; i < cnt; i++) {
				const index = buf.readUint16();
				const len = buf.readInt32();
				stringTable[index] = buf.getCustomString(len);
			}
		}

		// --- Dependencies (block 0) ---
		buf.seek(indexTablePos, 0);
		const depCnt = buf.getInt16();
		const dependencies: BinaryDependency[] = [];
		for (let i = 0; i < depCnt; i++) {
			dependencies.push({ id: buf.readS() ?? '', name: buf.readS() ?? '' });
		}

		// v2 branches
		let branchIncluded = false;
		let packageBranches: string[] = [];
		if (ver2) {
			const branchCnt = buf.getInt16();
			if (branchCnt > 0) {
				packageBranches = buf.readSArray(branchCnt);
				branchIncluded = true;
			}
		}

		// --- Build document ---
		if (packageBranches.length > 0) {
			for (const branchName of packageBranches) {
				doc.getRoot().addBranch(branchName);
			}
		}
		const pkg = getOrCreatePackage(doc, packageId, packageName);
		if (pkg.listResources().length > 0 || pkg.listAtlases().length > 0) {
			throw new Error(`Package "${packageName}" (${packageId}) has already been read.`);
		}
		pkg.setBranchNames(packageBranches);
		const atlasMap = new Map<string, ReturnType<Document['createAtlas']>>();

		for (const dep of dependencies) {
			if (!dep.id || dep.id === packageId) continue;
			const depPkg = getOrCreatePackage(doc, dep.id, dep.name || dep.id);
			pkg.addDependency(depPkg);
		}

		// --- Package items (block 1) ---
		buf.seek(indexTablePos, 1);
		const itemCnt = buf.getUint16();

		for (let i = 0; i < itemCnt; i++) {
			const nextPos = buf.getInt32() + buf.pos;

			const itemType = buf.readByte() as BinItemType;
			const itemId = buf.readS() ?? '';
			const itemName = buf.readS() ?? '';
			const itemPath = normalizePackageResourcePath(buf.readS() ?? '');
			const itemFile = buf.readS() ?? '';
			const exported = buf.readBool();
			const width = buf.getInt32();
			const height = buf.getInt32();
			let createdResource: BranchAwarePackageResource | null = null;

			switch (itemType) {
				case BinItemType.Image: {
					const res = doc.createImageResource(itemName);
					res
						.setId(itemId)
						.setFileName(normalizePublishedImageFileName(itemName))
						.setPath(itemPath)
						.setExported(exported)
						.setWidth(width)
						.setHeight(height);
					const scaleOpt = buf.readByte();
					if (scaleOpt === 1) {
						const x = buf.getInt32(), y = buf.getInt32();
						const w = buf.getInt32(), h = buf.getInt32();
						const tileGridIndice = buf.getInt32();
						res.setScaleOption(1).setScale9Grid([x, y, w, h]).setTileGridIndice(tileGridIndice);
					} else if (scaleOpt === 2) {
						res.setScaleOption(2);
					}
					res.setSmoothing(buf.readBool());
					pkg.addResource(res);
					createdResource = res;
					break;
				}

				case BinItemType.MovieClip: {
					const res = doc.createMovieClipResource(itemName);
					res
						.setId(itemId)
						.setFileName(`${itemName}.jta`)
						.setPath(itemPath)
						.setExported(exported)
						.setWidth(width)
						.setHeight(height);
					res.setSmoothing(buf.readBool());
					const rawFrames = buf.readBuffer();
					decodeMovieClipFrames(doc, res, rawFrames);
					pkg.addResource(res);
					createdResource = res;
					break;
				}

				case BinItemType.Sound: {
					const res = doc.createSoundResource(itemName);
					res
						.setId(itemId)
						.setPath(itemPath)
						.setFile(normalizePublishedSoundFileName(itemName, itemFile))
						.setExported(exported);
					res.setExtras({ ...res.getExtras(), _publishedFile: itemFile });
					pkg.addResource(res);
					createdResource = res;
					break;
				}

				case BinItemType.Misc: {
					const res = doc.createMiscResource(itemName);
					res.setId(itemId).setPath(itemPath).setFile(itemFile).setExported(exported);
					res.setExtras({ ...res.getExtras(), _publishedFile: itemFile });
					pkg.addResource(res);
					createdResource = res;
					break;
				}

				case BinItemType.Swf: {
					const res = doc.createSwfResource(itemName);
					res.setId(itemId).setPath(itemPath).setFile(itemFile).setExported(exported);
					res.setExtras({ ...res.getExtras(), _publishedFile: itemFile });
					pkg.addResource(res);
					createdResource = res;
					break;
				}

				case BinItemType.Component: {
					const res = doc.createComponent(itemName);
					res.setId(itemId).setPath(itemPath).setExported(exported).setSize(width, height);
					const extensionTypeCode = buf.readByte();
					const rawData = buf.readBuffer();
					decodeComponentDefinition(res, rawData, extensionTypeCode, doc);
					res.setExtras({
						...getComponentExtras(res),
						_rawBinary: toRawBinarySlice(rawData),
					});
					res._markBinaryClean();
					doc._trackBinaryComponent();
					pkg.addResource(res);
					createdResource = res;
					break;
				}

				case BinItemType.Font: {
					const res = doc.createFontResource(itemName);
					res.setId(itemId).setPath(itemPath).setExported(exported);
					const rawGlyphs = buf.readBuffer();
					decodeFontGlyphs(doc, res, rawGlyphs);
					res.setFileName(`${itemName}${res.listGlyphs().length === 0 ? '.ttf' : '.fnt'}`);
					pkg.addResource(res);
					createdResource = res;
					break;
				}

				case BinItemType.Atlas: {
					const atlas = doc.createAtlas(itemId);
					atlas
						.setIndex(parseAtlasIndex(itemId))
						.setFile(itemFile)
						.setWidth(width)
						.setHeight(height);
					pkg.addAtlas(atlas);
					atlasMap.set(itemId, atlas);
					break;
				}

				case BinItemType.Spine: {
					const res = doc.createSpineResource(itemName);
					res
						.setId(itemId)
						.setPath(itemPath)
						.setFile(itemFile)
						.setExported(exported)
						.setWidth(width)
						.setHeight(height)
						.setAnchor(buf.getFloat32(), buf.getFloat32());
					res.setExtras({ ...res.getExtras(), _publishedFile: itemFile });
					pkg.addResource(res);
					createdResource = res;
					break;
				}

				case BinItemType.DragonBones: {
					const res = doc.createDragonBonesResource(itemName);
					res
						.setId(itemId)
						.setPath(itemPath)
						.setFile(itemFile)
						.setExported(exported)
						.setWidth(width)
						.setHeight(height)
						.setAnchor(buf.getFloat32(), buf.getFloat32());
					res.setExtras({ ...res.getExtras(), _publishedFile: itemFile });
					pkg.addResource(res);
					createdResource = res;
					break;
				}

				default:
					break;
			}

			// v2 extra fields per item
			if (ver2) {
				const branchName = buf.readS() ?? '';
				const branchCnt2 = buf.getUint8();
				let branchItemIds: string[] = [];
				if (branchCnt2 > 0) {
					if (branchIncluded) branchItemIds = buf.readSArray(branchCnt2);
					else branchItemIds = [buf.readS() ?? ''];
				}
				const highResCnt = buf.getUint8();
				const highResolutionItemIds: Array<string | null> = [];
				for (let highResIndex = 0; highResIndex < highResCnt; highResIndex++) {
					highResolutionItemIds.push(buf.readS());
				}
				if (createdResource) {
					createdResource.setPath(itemPath);
					createdResource.setBranch(branchName);
					createdResource.setBranchItemIds(branchItemIds);
					(createdResource as HighResolutionAwarePackageResource).setHighResolutionItemIds?.(highResolutionItemIds);
				}
			}

			buf.pos = nextPos;
		}

		// --- Sprite atlas mappings (block 2) ---
		buf.seek(indexTablePos, 2);
		const spriteCnt = buf.getUint16();
		const sprites: BinarySpriteEntry[] = [];

		for (let i = 0; i < spriteCnt; i++) {
			const nextPos = buf.getUint16() + buf.pos;
			const itemId = buf.readS() ?? '';
			const atlasId = buf.readS() ?? '';
			const x = buf.getInt32(), y = buf.getInt32();
			const w = buf.getInt32(), h = buf.getInt32();
			const rotated = buf.readBool();
			let offsetX = 0;
			let offsetY = 0;
			let originalWidth = rotated ? h : w;
			let originalHeight = rotated ? w : h;
			if (ver2 && buf.readBool()) {
				offsetX = buf.getInt32();
				offsetY = buf.getInt32();
				originalWidth = buf.getInt32();
				originalHeight = buf.getInt32();
			}
			sprites.push({ itemId, atlasId, x, y, w, h, rotated, offsetX, offsetY, originalWidth, originalHeight });
			const atlas = atlasMap.get(atlasId);
			if (atlas) {
				const sprite = doc.createSprite(itemId);
				sprite
					.setItemId(itemId)
					.setAtlas(atlas)
					.setRectX(x)
					.setRectY(y)
					.setRectWidth(w)
					.setRectHeight(h)
					.setRotated(rotated)
					.setOffsetX(offsetX)
					.setOffsetY(offsetY)
					.setOriginalWidth(originalWidth)
					.setOriginalHeight(originalHeight);
				atlas.addSprite(sprite);
			}
			buf.pos = nextPos;
		}

		// Attach sprite map to package extras for consumers
		pkg.setExtras({ ...getPackageExtras(pkg), sprites });

		// --- PixelHitTest (block 3) ---
		const pixelHitTests = new Map<string, PixelHitTestEntry>();
		if (buf.seek(indexTablePos, 3)) {
			const hitTestCnt = buf.getInt16();
			for (let i = 0; i < hitTestCnt; i++) {
				const nextPos = buf.getInt32() + buf.pos;
				const itemId = buf.readS() ?? '';
				buf.getInt32(); // deprecated offset field
				const pixelWidth = buf.getInt32();
				const scaleDenominator = buf.getUint8();
				const byteLength = buf.getInt32();
				const pixels = new Uint8Array(buf.buffer, buf.byteOffset + buf.pos, byteLength).slice();
				buf.skip(byteLength);
				if (itemId) {
					pixelHitTests.set(itemId, {
						itemId,
						pixelWidth,
						scaleDenominator,
						pixels,
					});
				}
				buf.pos = nextPos;
			}
		}

		for (const resource of pkg.listResources()) {
			if (resource.propertyType !== 'ImageResource') continue;
			const pixelHitTest = pixelHitTests.get(resource.getId());
			if (!pixelHitTest) continue;
			(resource as ImageResource).setPixelHitTestData({
				pixelWidth: pixelHitTest.pixelWidth,
				scaleDenominator: pixelHitTest.scaleDenominator,
				pixels: pixelHitTest.pixels,
			});
		}

		return doc;
	}
}
