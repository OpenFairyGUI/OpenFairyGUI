import { inflateRaw } from 'pako';
import { Document } from '../document.js';
import { FGUI_MAGIC } from '../constants.js';
import type { ImageResource } from '../properties/image-resource.js';
import { ByteBuffer } from './byte-buffer.js';
import type { FileSystem } from './project-reader.js';

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
	Spine: 8,
	DragonBones: 9,
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

interface MovieClipBinaryExtras extends Record<string, unknown> {
	_rawBinaryFrames?: RawBinarySlice;
}

interface FontBinaryExtras extends Record<string, unknown> {
	_rawBinaryGlyphs?: RawBinarySlice;
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

function getMovieClipExtras(resource: { getExtras(): Record<string, unknown> }): MovieClipBinaryExtras {
	return resource.getExtras() as MovieClipBinaryExtras;
}

function getFontExtras(resource: { getExtras(): Record<string, unknown> }): FontBinaryExtras {
	return resource.getExtras() as FontBinaryExtras;
}

/**
 * Reads a published FairyGUI binary package (.fui / _fui.bytes) into a {@link Document}.
 *
 * Only the package structure (resource manifest and sprite atlas mappings) is parsed.
 * Component display lists are stored in their raw binary form and not yet expanded
 * into the property graph (that requires a separate component binary decoder).
 *
 * @category I/O
 */
export class BinaryReader {
	private readonly _fs: FileSystem;

	constructor(fs: FileSystem) {
		this._fs = fs;
	}

	async read(filePath: string): Promise<Document> {
		const raw = await this._fs.readFileRaw(filePath);
		const outer = new ByteBuffer(raw.buffer, raw.byteOffset, raw.byteLength);
		return this._parsePackage(outer);
	}

	private _parsePackage(outer: ByteBuffer): Document {
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
			const decompressed = inflateRaw(remaining);
			buf = new ByteBuffer(decompressed.buffer, 0, decompressed.byteLength);
		} else {
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
		if (ver2) {
			const branchCnt = buf.getInt16();
			if (branchCnt > 0) {
				buf.readSArray(branchCnt);
				branchIncluded = true;
			}
		}

		// --- Build document ---
		const doc = new Document();
		const pkg = doc.createPackage(packageName);
		pkg.setId(packageId);
		const atlasMap = new Map<string, ReturnType<Document['createAtlas']>>();

		for (const dep of dependencies) {
			if (!dep.id || dep.id === packageId) continue;
			const depPkg = doc.createPackage(dep.name || dep.id);
			depPkg.setId(dep.id);
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
			buf.readS(); // path (virtual folder)
			const itemFile = buf.readS() ?? '';
			const exported = buf.readBool();
			const width = buf.getInt32();
			const height = buf.getInt32();

			switch (itemType) {
				case BinItemType.Image: {
					const res = doc.createImageResource(itemName);
					res.setId(itemId).setExported(exported).setWidth(width).setHeight(height);
					const scaleOpt = buf.readByte();
					if (scaleOpt === 1) {
						const x = buf.getInt32(), y = buf.getInt32();
						const w = buf.getInt32(), h = buf.getInt32();
						buf.getInt32(); // tileGridIndice
						res.setScaleOption(1).setScale9Grid([x, y, w, h]);
					} else if (scaleOpt === 2) {
						res.setScaleOption(2);
					}
					res.setSmoothing(buf.readBool());
					pkg.addResource(res);
					break;
				}

				case BinItemType.MovieClip: {
					const res = doc.createMovieClipResource(itemName);
					res.setId(itemId).setExported(exported);
					res.setSmoothing(buf.readBool());
					const rawFrames = buf.readBuffer();
					res.setExtras({
						...getMovieClipExtras(res),
						_rawBinaryFrames: toRawBinarySlice(rawFrames),
					});
					pkg.addResource(res);
					break;
				}

				case BinItemType.Sound: {
					const res = doc.createSoundResource(itemName);
					res.setId(itemId).setFile(itemFile).setExported(exported);
					pkg.addResource(res);
					break;
				}

				case BinItemType.Component: {
					const res = doc.createComponent(itemName);
					res.setId(itemId).setExported(exported);
					buf.readByte(); // extension type
					const rawData = buf.readBuffer();
					// Store raw binary for future component decoding
					res.setExtras({
						...getComponentExtras(res),
						_rawBinary: toRawBinarySlice(rawData),
					});
					pkg.addResource(res);
					break;
				}

				case BinItemType.Font: {
					const res = doc.createFontResource(itemName);
					res.setId(itemId).setExported(exported);
					const rawGlyphs = buf.readBuffer();
					res.setExtras({
						...getFontExtras(res),
						_rawBinaryGlyphs: toRawBinarySlice(rawGlyphs),
					});
					pkg.addResource(res);
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

				default:
					// Swf, Misc, Spine, DragonBones — skip item data
					break;
			}

			// v2 extra fields per item
			if (ver2) {
				buf.readS(); // branch override name
				const branchCnt2 = buf.getUint8();
				if (branchCnt2 > 0) {
					if (branchIncluded) buf.readSArray(branchCnt2);
					else buf.readS(); // single branch item id
				}
				const highResCnt = buf.getUint8();
				if (highResCnt > 0) buf.readSArray(highResCnt);
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
			if (ver2 && buf.readBool()) {
				buf.skip(16); // offset + originalSize (4 x int32)
			}
			sprites.push({ itemId, atlasId, x, y, w, h, rotated });
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
					.setRotated(rotated);
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
