import { deflateRaw } from 'pako';
import type { Document } from '../document.js';
import type { Atlas } from '../properties/atlas.js';
import type { Component } from '../properties/component.js';
import type { Package } from '../properties/package.js';
import type { ImageResource } from '../properties/image-resource.js';
import type { MiscResource } from '../properties/misc-resource.js';
import type { SoundResource } from '../properties/sound-resource.js';
import type { FontResource } from '../properties/font-resource.js';
import type { MovieClipResource } from '../properties/movie-clip-resource.js';
import type { SpineResource } from '../properties/spine-resource.js';
import type { DragonBonesResource } from '../properties/dragon-bones-resource.js';
import { FGUI_MAGIC } from '../constants.js';
import { WriteBuffer } from './write-buffer.js';
import { encodeComponent } from './component-encoder.js';
import type { FileSystem } from './project-reader.js';

/**
 * Binary item type codes matching the .fui format.
 * @internal
 */
const BinItemType = {
	Image: 0,
	MovieClip: 1,
	Sound: 2,
	Component: 3,
	Atlas: 4,
	Font: 5,
	Misc: 7,
	Spine: 8,
	DragonBones: 9,
} as const;

/**
 * Maps our PropertyType to the editor's type string used for sorting.
 * The editor sorts resources alphabetically by these type names.
 * @internal
 */
const EDITOR_TYPE_STRING: Record<string, string> = {
	ImageResource: 'image',
	MiscResource: 'misc',
	MovieClipResource: 'movieclip',
	SoundResource: 'sound',
	Component: 'component',
	FontResource: 'font',
	SpineResource: 'spine',
	DragonBonesResource: 'dragonbones',
};

type PackageResource = ReturnType<Package['listResources']>[number];

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
	offsetX?: number;
	offsetY?: number;
	originalWidth?: number;
	originalHeight?: number;
}

interface PackageBinaryExtras extends Record<string, unknown> {
	publishedResourceIds?: string[];
	sprites?: BinarySpriteEntry[];
}

interface MovieClipFrameData {
	interval: number;
	swing: boolean;
	repeatDelay: number;
	frames: Array<{
		x: number;
		y: number;
		width: number;
		height: number;
		addDelay: number;
		spriteId: string | null;
	}>;
}

interface FntGlyphData {
	charId: number;
	img: string | null;
	x: number;
	y: number;
	xoffset: number;
	yoffset: number;
	width: number;
	height: number;
	xadvance: number;
	channel: number;
}

interface FntData {
	hasFace: boolean;
	colored: boolean;
	resizable: boolean;
	hasChannel: boolean;
	fontSize: number;
	xadvance: number;
	lineHeight: number;
	glyphs: FntGlyphData[];
}

interface ComponentBinaryExtras extends Record<string, unknown> {
	_rawBinary?: RawBinarySlice;
	extensionType?: string;
}

interface PublishFileExtras extends Record<string, unknown> {
	_publishedFile?: string;
}

interface ComponentWithExtensionType {
	getExtensionType?(): string;
}

interface BinaryAtlasItem {
	propertyType: 'AtlasItem';
	getId(): string;
	getName(): string | null;
	getPath(): string | null;
	getFile(): string;
	getExported(): false;
	getWidth(): number;
	getHeight(): number;
}

type BinaryPackageItem = PackageResource | BinaryAtlasItem;

function getRuntimeAtlasFileName(file: string, index: number): string {
	if (!file) return `atlas${index}.png`;
	const markerIndex = file.lastIndexOf('_atlas');
	if (markerIndex >= 0) return file.slice(markerIndex + 1);
	return file;
}

interface ChildWithOptionalUrls {
	getSrc?(): string;
	getUrl?(): string;
	getDefaultItem?(): string;
	getIcon?(): string;
	getSelectedIcon?(): string;
	getDropdown?(): string;
	getSound?(): string;
	getInstanceIcon?(): string;
	getInstanceSelectedIcon?(): string;
	getInstanceComboItems?(): Array<{ icon: string | null }>;
	getListItems?(): Array<{ icon: string | null; url: string | null }>;
}

interface SizeLike {
	getWidth?(): number;
	getHeight?(): number;
}

interface PixelHitTestEntry {
	itemId: string;
	pixelWidth: number;
	scaleDenominator: number;
	pixels: Uint8Array;
}

interface BranchAwareBinaryItem {
	getPath?(): string;
	getBranch?(): string;
	getBranchItemIds?(): string[];
}

/**
 * Sort resources to match editor binary output order.
 * Editor sorts: non-exported first, then alphabetical by type, then by ID.
 * @internal
 */
function sortResources(resources: PackageResource[]): PackageResource[] {
	return [...resources].sort((a, b) => {
		const aExported = a.getExported?.() ?? false;
		const bExported = b.getExported?.() ?? false;
		if (aExported && !bExported) return 1;
		if (!aExported && bExported) return -1;
		const aType = EDITOR_TYPE_STRING[a.propertyType as string] ?? a.propertyType;
		const bType = EDITOR_TYPE_STRING[b.propertyType as string] ?? b.propertyType;
		const typeCmp = aType.localeCompare(bType);
		if (typeCmp !== 0) return typeCmp;
		const aId = a.getId?.() ?? '';
		const bId = b.getId?.() ?? '';
		return aId.localeCompare(bId);
	});
}

export interface BinaryWriterOptions {
	/** Whether to compress the data section with zlib raw deflate. Default: false. */
	compressed?: boolean;
	/** Binary format version. Default: 7. */
	version?: number;
	/** Index of the package to serialize (0-based). Default: 0. */
	packageIndex?: number;
}

/**
 * Serializes a {@link Document} (single package) into FairyGUI binary format (.fui).
 *
 * This is the reverse of {@link BinaryReader}. The output is compatible with
 * the FairyGUI runtime `UIPackage.LoadPackage()`.
 *
 * @category I/O
 */
export class BinaryWriter {
	private readonly _fs: FileSystem;

	constructor(fs: FileSystem) {
		this._fs = fs;
	}

	async write(doc: Document, filePath: string, options: BinaryWriterOptions = {}): Promise<void> {
		const packages = doc.getRoot().listPackages();
		if (packages.length === 0) throw new Error('Document has no packages to write.');

		const idx = options.packageIndex ?? 0;
		const pkg = packages[idx];
		if (!pkg) throw new Error(`Package index ${idx} out of range (${packages.length} packages).`);
		const data = this._serializePackage(doc, pkg, options);
		await this._fs.writeFileRaw(filePath, data);
	}

	private _serializePackage(doc: Document, pkg: Package, options: BinaryWriterOptions): Uint8Array {
		const version = options.version ?? 7;
		const compressed = options.compressed ?? false;
		const packageId = pkg.getId();
		const packageName = pkg.getName();

		// --- Phase 1: collect all strings and build blocks into a data buffer ---
		const data = new WriteBuffer(65536);

		// Pre-register all strings we'll need
		const extras = pkg.getExtras() as PackageBinaryExtras;
		const publishedResourceIds = Array.isArray(extras.publishedResourceIds)
			? new Set(extras.publishedResourceIds)
			: null;
		const resources = sortResources(
			publishedResourceIds
				? pkg.listResources().filter((resource) => publishedResourceIds.has(resource.getId()))
				: pkg.listResources(),
		);
		const dependencies: BinaryDependency[] = pkg
			.listDependencies()
			.map((dep) => ({
				id: dep.getId(),
				name: dep.getName(),
			}))
			.filter((dep) => !!dep.id);
		const branchNames = getPackageBranchNames(doc, pkg, resources);
		const branchItemIdsMap = buildBranchItemIdsMap(pkg, branchNames);

		// Collect sprites from Atlas/Sprite property nodes OR extras.sprites (BinaryReader round-trip)
		const sprites: BinarySpriteEntry[] = [];

		const atlases = pkg.listAtlases();
		if (atlases.length > 0) {
			// From Atlas/Sprite property nodes (created by atlas() transform)
			for (const atlas of atlases) {
				const atlasId = getAtlasId(atlas);
				for (const sprite of atlas.listSprites()) {
					sprites.push({
						itemId: sprite.getItemId(),
						atlasId,
						x: sprite.getRectX(),
						y: sprite.getRectY(),
						w: sprite.getRectWidth(),
						h: sprite.getRectHeight(),
						rotated: sprite.getRotated(),
						offsetX: sprite.getOffsetX(),
						offsetY: sprite.getOffsetY(),
						originalWidth: sprite.getOriginalWidth(),
						originalHeight: sprite.getOriginalHeight(),
					});
				}
			}
		} else if (extras.sprites) {
			// From extras.sprites (BinaryReader round-trip)
			sprites.push(...extras.sprites);
		}

		const pixelHitTests = resources
			.filter((resource) => resource.propertyType === 'ImageResource')
			.map((resource) => getPixelHitTestEntry(resource))
			.filter((entry): entry is PixelHitTestEntry => entry !== null);

		// String table is built lazily during encoding via writeS/writeSEx calls.
		// DO NOT pre-register strings — the editor adds strings in encoding order,
		// and pre-registration would produce different string indices.

		// --- Index table ---
		// 6 blocks, using uint32 offsets
		const indexTablePos = data.pos;
		data.writeUint8(6); // segCount
		data.writeUint8(0); // useShort = false (uint32 offsets)

		// Reserve 6 x uint32 for block offsets (fill in later)
		const offsetsPos = data.pos;
		for (let i = 0; i < 6; i++) data.writeUint32(0);

		// --- Block 0: Dependencies ---
		const block0Offset = data.pos - indexTablePos;
		data.writeInt16(dependencies.length);
		for (const dep of dependencies) {
			data.writeS(dep.id);
			data.writeS(dep.name);
		}
		if (version >= 2) {
			data.writeInt16(branchNames.length);
			for (const branchName of branchNames) {
				data.writeS(branchName);
			}
		}

		// --- Block 1: Package items ---
		const block1Offset = data.pos - indexTablePos;
		// Include atlas items in the total count (editor writes them as resources)
		const atlasItems: BinaryAtlasItem[] = atlases.map((atlas) => ({
			propertyType: 'AtlasItem',
			getId: () => getAtlasId(atlas),
			getName: () => null,
			getPath: () => null,
			getFile: () => getRuntimeAtlasFileName(atlas.getFile(), atlas.getIndex()),
			getExported: () => false,
			getWidth: () => atlas.getWidth?.() ?? 0,
			getHeight: () => atlas.getHeight?.() ?? 0,
		}));
		const allItems: BinaryPackageItem[] = [...resources, ...atlasItems];
		const packageItemIds = new Set(allItems.map((item) => item.getId()));
		data.writeUint16(allItems.length);

		for (const res of allItems) {
			const itemStartPos = data.pos;
			data.writeInt32(0); // placeholder for nextPos offset

			const type = res.propertyType;

			switch (type) {
				case 'ImageResource': {
					data.writeUint8(BinItemType.Image);
					data.writeS(res.getId());
					data.writeS(res.getName());
					data.writeS(res.getPath() ?? '/');
					data.writeS(null); // file: null for Image (editor behavior)
					data.writeBool(res.getExported());
					data.writeInt32(res.getWidth());
					data.writeInt32(res.getHeight());

					const scaleOpt = res.getScaleOption();
					data.writeUint8(scaleOpt);
					if (scaleOpt === 1) {
						const grid = res.getScale9Grid() ?? [0, 0, 0, 0];
						data.writeInt32(grid[0]);
						data.writeInt32(grid[1]);
						data.writeInt32(grid[2]);
						data.writeInt32(grid[3]);
						data.writeInt32(0); // tileGridIndice
					}
					data.writeBool(res.getSmoothing());
					break;
				}
				case 'MovieClipResource': {
					data.writeUint8(BinItemType.MovieClip);
					data.writeS(res.getId());
					data.writeS(res.getName());
					data.writeS(res.getPath() ?? '/');
					data.writeS(null); // file: null for MovieClip
					data.writeBool(res.getExported());
					data.writeInt32(getOptionalNumber(res, 'getWidth'));
					data.writeInt32(getOptionalNumber(res, 'getHeight'));
					data.writeBool(res.getSmoothing());
					const frameData = _encodeMovieClipFrames({
						interval: res.getInterval(),
						swing: res.getSwing(),
						repeatDelay: res.getRepeatDelay(),
						frames: res.listFrames().map((frame) => ({
							x: frame.getRectX(),
							y: frame.getRectY(),
							width: frame.getRectWidth(),
							height: frame.getRectHeight(),
							addDelay: frame.getAddDelay(),
							spriteId: frame.getSpriteId() || null,
						})),
					}, data);
					data.writeBuffer(frameData);
					break;
				}
				case 'SoundResource': {
					data.writeUint8(BinItemType.Sound);
					data.writeS(res.getId());
					data.writeS(res.getName());
					data.writeS(res.getPath());
					// Editor publishes sound file as {id}.{ext}
					const soundFile = res.getFile();
					const soundExt = soundFile.includes('.') ? soundFile.split('.').pop() : 'wav';
					data.writeS(`${res.getId()}.${soundExt}`);
					data.writeBool(res.getExported());
					data.writeInt32(0); // width
					data.writeInt32(0); // height
					break;
				}
				case 'MiscResource': {
					data.writeUint8(BinItemType.Misc);
					data.writeS(res.getId());
					data.writeS(res.getName());
					data.writeS(res.getPath());
					data.writeS(getPublishedFileName(res));
					data.writeBool(res.getExported());
					data.writeInt32(0);
					data.writeInt32(0);
					break;
				}
				case 'Component': {
					data.writeUint8(BinItemType.Component);
					data.writeS(res.getId());
					data.writeS(res.getName());
					data.writeS(res.getPath());
					data.writeS(null); // file: null for Component
					data.writeBool(res.getExported());
					data.writeInt32(res.getWidth());
					data.writeInt32(res.getHeight());
					// Extension type: 0=None, 11=Label, 12=Button, 13=ComboBox, 14=ProgressBar, 15=Slider, 16=ScrollBar
					const extTypeMap: Record<string, number> = {
						Label: 11, Button: 12, ComboBox: 13,
						ProgressBar: 14, Slider: 15, ScrollBar: 16,
					};
					const compExtras = res.getExtras() as ComponentBinaryExtras;
					const extType = (res as ComponentWithExtensionType).getExtensionType?.() ?? compExtras.extensionType;
					data.writeUint8(extType ? (extTypeMap[extType] ?? 0) : 0);
					if (compExtras?._rawBinary) {
						// From BinaryReader round-trip: use stored raw binary
						data.writeBuffer(toUint8Array(compExtras._rawBinary));
					} else {
						// From ProjectReader: encode property graph to binary
						const encoded = encodeComponent(res, doc, pkg, version, data);
						data.writeBuffer(encoded);
					}
					break;
				}
				case 'FontResource': {
					data.writeUint8(BinItemType.Font);
					data.writeS(res.getId());
					data.writeS(res.getName());
					data.writeS(res.getPath());
					data.writeS(null); // file: null for Font
					data.writeBool(res.getExported());
					data.writeInt32(0); // width
					data.writeInt32(0); // height
					const glyphData = _encodeFontGlyphs({
						hasFace: res.getTtf(),
						colored: res.getTint(),
						resizable: res.getAutoScale(),
						hasChannel: res.getHasChannel(),
						fontSize: res.getFontSize(),
						xadvance: res.getXAdvance(),
						lineHeight: res.getLineHeight(),
						glyphs: res.listGlyphs().map((glyph) => ({
							charId: glyph.getCharId() || glyph.getChar().codePointAt(0) || 0,
							img: glyph.getImg() || null,
							x: glyph.getX(),
							y: glyph.getY(),
							xoffset: glyph.getXOffset(),
							yoffset: glyph.getYOffset(),
							width: glyph.getWidth(),
							height: glyph.getHeight(),
							xadvance: glyph.getAdvance(),
							channel: glyph.getChannel(),
						})),
					}, data);
					data.writeBuffer(glyphData);
					break;
				}
				case 'SpineResource': {
					data.writeUint8(BinItemType.Spine);
					data.writeS(res.getId());
					data.writeS(res.getName());
					data.writeS(res.getPath());
					data.writeS(getPublishedFileName(res));
					data.writeBool(res.getExported());
					data.writeInt32(res.getWidth());
					data.writeInt32(res.getHeight());
					data.writeFloat32(res.getAnchorX());
					data.writeFloat32(res.getAnchorY());
					break;
				}
				case 'DragonBonesResource': {
					data.writeUint8(BinItemType.DragonBones);
					data.writeS(res.getId());
					data.writeS(res.getName());
					data.writeS(res.getPath());
					data.writeS(getPublishedFileName(res));
					data.writeBool(res.getExported());
					data.writeInt32(res.getWidth());
					data.writeInt32(res.getHeight());
					data.writeFloat32(res.getAnchorX());
					data.writeFloat32(res.getAnchorY());
					break;
				}
				default:
					if (type === 'AtlasItem') {
						// Atlas items
						const atlasItem = res as BinaryAtlasItem;
						data.writeUint8(BinItemType.Atlas);
						data.writeS(atlasItem.getId());
						data.writeS(atlasItem.getName());
						data.writeS(atlasItem.getPath());
						data.writeS(atlasItem.getFile());
						data.writeBool(false);
						data.writeInt32(atlasItem.getWidth());
						data.writeInt32(atlasItem.getHeight());
					} else {
						// Unknown type: write as Misc
						const miscItem = res as PackageResource;
						data.writeUint8(7); // BinItemType.Misc
						data.writeS(getOptionalStringId(miscItem));
						data.writeS(miscItem.getName());
						data.writeS('/');
						data.writeS('');
						data.writeBool(false);
						data.writeInt32(0);
						data.writeInt32(0);
					}
					break;
			}

			// v2 extra fields per item
			if (version >= 2) {
				const branchName = getItemBranchName(res);
				const branchItemIds = getItemBranchItemIds(res, branchNames, branchItemIdsMap);
				data.writeSEx(branchName || null);
				data.writeUint8(branchItemIds.length);
				for (const branchItemId of branchItemIds) {
					data.writeSEx(branchItemId || null);
				}
				data.writeUint8(0); // highResCount
			}

			// Patch nextPos offset
			const nextPos = data.pos;
			const savedPos = data.pos;
			data.pos = itemStartPos;
			data.writeInt32(nextPos - itemStartPos - 4);
			data.pos = savedPos;
		}

		// --- Block 2: Sprites ---
		const block2Offset = data.pos - indexTablePos;
		data.writeUint16(sprites.length);
		for (const sp of sprites) {
			const spriteStartPos = data.pos;
			data.writeUint16(0); // placeholder for nextPos offset

			data.writeS(sp.itemId);
			data.writeS(sp.atlasId);
			data.writeInt32(sp.x);
			data.writeInt32(sp.y);
			data.writeInt32(sp.w);
			data.writeInt32(sp.h);
			data.writeBool(sp.rotated);
			if (version >= 2) {
				const ox = sp.offsetX ?? 0;
				const oy = sp.offsetY ?? 0;
				const ow = sp.originalWidth ?? 0;
				const oh = sp.originalHeight ?? 0;
				const isPackageItemSprite = packageItemIds.has(sp.itemId);
				const isZeroSizedDirectOutput = isPackageItemSprite && sp.w === 0 && sp.h === 0;
				// Align with the Unity CLI writer:
				// - package item sprites keep their pre-rotation original size
				// - trimmed sprites keep offset + original size
				// - fully transparent direct-output package items keep a 0x0 rect with original size
				// - generated movieclip frame sprites only emit this payload when they carry trim offsets
				const hasOriginal = (isPackageItemSprite && sp.rotated) || ox !== 0 || oy !== 0 || isZeroSizedDirectOutput;
				data.writeBool(hasOriginal);
				if (hasOriginal) {
					data.writeInt32(ox);
					data.writeInt32(oy);
					data.writeInt32(ow || (sp.rotated ? sp.h : sp.w));
					data.writeInt32(oh || (sp.rotated ? sp.w : sp.h));
				}
			}

			const spriteNextPos = data.pos;
			const saved2 = data.pos;
			data.pos = spriteStartPos;
			data.writeUint16(spriteNextPos - spriteStartPos - 2);
			data.pos = saved2;
		}

		// --- Block 3: PixelHitTest ---
		let block3Offset = 0;
		if (pixelHitTests.length > 0) {
			block3Offset = data.pos - indexTablePos;
			data.writeInt16(pixelHitTests.length);
			for (const hitTest of pixelHitTests) {
				const hitStartPos = data.pos;
				data.writeInt32(0); // placeholder for nextPos offset
				data.writeS(hitTest.itemId);
				data.writeInt32(0); // deprecated byte offset in editor format
				data.writeInt32(hitTest.pixelWidth);
				data.writeUint8(hitTest.scaleDenominator);
				data.writeInt32(hitTest.pixels.byteLength);
				data.writeBytes(hitTest.pixels);

				const hitNextPos = data.pos;
				const saved3 = data.pos;
				data.pos = hitStartPos;
				data.writeInt32(hitNextPos - hitStartPos - 4);
				data.pos = saved3;
			}
		}

		// --- Block 4: String table ---
		// Editor behavior:
		// - normal strings are written directly with uint16 length + UTF-8 bytes
		// - strings that overflow writeUTF (length > 65535) are written as empty here
		//   and patched through block 5
		const block4Offset = data.pos - indexTablePos;
		const stringTable = data.getStringTable();
		const longStrings: Array<{ index: number; value: string }> = [];
		const encoder = new TextEncoder();
		data.writeInt32(stringTable.length);
		for (const [index, s] of stringTable.entries()) {
			const encoded = encoder.encode(s);
			if (encoded.byteLength > 0xffff) {
				data.writeUint16(0);
				longStrings.push({ index, value: s });
				continue;
			}
			data.writeUTFString(s);
		}

		// --- Block 5: Long string patches ---
		let block5Offset = 0;
		if (longStrings.length > 0) {
			block5Offset = data.pos - indexTablePos;
			data.writeInt32(longStrings.length);
			for (const entry of longStrings) {
				const encoded = encoder.encode(entry.value);
				data.writeUint16(entry.index);
				data.writeInt32(encoded.byteLength);
				data.writeBytes(encoded);
			}
		}

		// --- Patch index table offsets ---
		const savedPos = data.pos;
		data.pos = offsetsPos;
		data.writeUint32(block0Offset);
		data.writeUint32(block1Offset);
		data.writeUint32(block2Offset);
		data.writeUint32(block3Offset);
		data.writeUint32(block4Offset);
		data.writeUint32(block5Offset);
		data.pos = savedPos;

		// --- Build final output: header + data ---
		const dataBytes = data.toUint8Array();

		let bodyBytes: Uint8Array;
		if (compressed) {
			bodyBytes = deflateRaw(dataBytes);
		} else {
			bodyBytes = dataBytes;
		}

		// Header
		const header = new WriteBuffer(256);
		header.writeUint32(FGUI_MAGIC);
		header.writeInt32(version);
		header.writeBool(compressed);
		header.writeUTFString(packageId);
		header.writeUTFString(packageName);
		header.skip(20); // Reserved

		const headerBytes = header.toUint8Array();
		const result = new Uint8Array(headerBytes.byteLength + bodyBytes.byteLength);
		result.set(headerBytes, 0);
		result.set(bodyBytes, headerBytes.byteLength);

		return result;
	}
}

/**
 * Filter resources to only include those that are exported or referenced.
 * The editor prunes unreferenced COMPONENTS from the binary output.
 * Non-component resources (images, fonts, sounds, etc.) are always included.
 * @internal
 */
function _filterReferencedResources(resources: PackageResource[]): PackageResource[] {
	const referencedIds = new Set<string>();
	let hasAnyChildren = false;

	function scanUrl(url: string | null | undefined): void {
		if (!url || typeof url !== 'string' || !url.startsWith('ui://')) return;
		if (url.length > 13) referencedIds.add(url.slice(13));
	}

	for (const r of resources) {
		if (!isComponentResource(r)) continue;
		const children = r.listChildren();
		if (children.length > 0) hasAnyChildren = true;
		for (const child of children) {
			const refChild = child as ChildWithOptionalUrls;
			const src = refChild.getSrc?.();
			if (src) referencedIds.add(src);
			// GLoader url, GList defaultItem
			scanUrl(refChild.getUrl?.());
			scanUrl(refChild.getDefaultItem?.());
			for (const ref of [
				refChild.getIcon?.(),
				refChild.getSelectedIcon?.(),
				refChild.getDropdown?.(),
				refChild.getSound?.(),
				refChild.getInstanceIcon?.(),
				refChild.getInstanceSelectedIcon?.(),
			]) {
				scanUrl(ref);
			}
			for (const item of refChild.getInstanceComboItems?.() ?? []) scanUrl(item.icon);
			for (const item of refChild.getListItems?.() ?? []) {
				scanUrl(item.icon);
				scanUrl(item.url);
			}
		}
		// Component-level extension
		scanUrl(r.getDropdown?.());
	}

	if (!hasAnyChildren) return resources;

	return resources.filter((r) => {
		const type = r.propertyType;
		if (type !== 'Component') return true;
		if (r.getExported()) return true;
		const id = r.getId();
		return referencedIds.has(id);
	});
}

/**
 * Encode MovieClip frame data into the binary format.
 *
 * Format: 2-block structure with uint32 offsets
 * - Block 0: interval(int32) + swing(bool) + repeatDelay(int32)
 * - Block 1: frameCount(int16) + per-frame: chunkSize(int16) + x(int32) + y(int32) + w(int32) + h(int32) + addDelay(int32) + spriteId(string)
 *
 * @internal
 */
function _encodeMovieClipFrames(
	jtaData: MovieClipFrameData,
	parentBuf: WriteBuffer,
): Uint8Array {
	const buf = new WriteBuffer(1024, parentBuf);

	// Index table: 2 blocks, uint32 offsets
	const indexTablePos = buf.pos;
	buf.writeUint8(2);   // segCount
	buf.writeUint8(0);   // useShort = false (uint32 offsets)
	const offsetsPos = buf.pos;
	buf.writeUint32(0);  // block 0 offset placeholder
	buf.writeUint32(0);  // block 1 offset placeholder

	// Block 0: global animation settings
	const block0Offset = buf.pos - indexTablePos;
	buf.writeInt32(jtaData.interval);
	buf.writeBool(jtaData.swing);
	buf.writeInt32(jtaData.repeatDelay);

	// Block 1: frame list
	const block1Offset = buf.pos - indexTablePos;
	buf.writeInt16(jtaData.frames.length);

	for (const frame of jtaData.frames) {
		const frameStart = buf.pos;
		buf.writeInt16(0); // placeholder for chunk size

		buf.writeInt32(frame.x);
		buf.writeInt32(frame.y);
		buf.writeInt32(frame.width);
		buf.writeInt32(frame.height);
		buf.writeInt32(frame.addDelay);
		buf.writeS(frame.spriteId);

		// Patch chunk size
		const frameEnd = buf.pos;
		const saved = buf.pos;
		buf.pos = frameStart;
		buf.writeInt16(frameEnd - frameStart - 2);
		buf.pos = saved;
	}

	// Patch block offsets
	const savedPos = buf.pos;
	buf.pos = offsetsPos;
	buf.writeUint32(block0Offset);
	buf.writeUint32(block1Offset);
	buf.pos = savedPos;

	return buf.toUint8Array();
}

/**
 * Encode font glyph data into the binary format.
 *
 * Format: 2-block structure with uint32 offsets
 * - Block 0: hasFace(bool) + colored(bool) + resizable(bool) + hasChannel(bool) + fontSize(int32) + xadvance(int32) + lineHeight(int32)
 * - Block 1: glyphCount(int32) + per-glyph: chunkSize(int16) + charId(int16) + img(string) + x(int32) + y(int32) + xoffset(int32) + yoffset(int32) + width(int32) + height(int32) + xadvance(int32) + channel(byte)
 *
 * @internal
 */
function _encodeFontGlyphs(
	fntData: FntData,
	parentBuf: WriteBuffer,
): Uint8Array {
	const buf = new WriteBuffer(2048, parentBuf);

	// Index table: 2 blocks, uint32 offsets
	const indexTablePos = buf.pos;
	buf.writeUint8(2);
	buf.writeUint8(0); // useShort = false
	const offsetsPos = buf.pos;
	buf.writeUint32(0);
	buf.writeUint32(0);

	// Block 0: header
	const block0Offset = buf.pos - indexTablePos;
	buf.writeBool(fntData.hasFace);
	buf.writeBool(fntData.colored);
	buf.writeBool(fntData.resizable);
	buf.writeBool(fntData.hasChannel);
	buf.writeInt32(fntData.fontSize);
	buf.writeInt32(fntData.xadvance);
	buf.writeInt32(fntData.lineHeight);

	// Block 1: glyphs
	const block1Offset = buf.pos - indexTablePos;
	buf.writeInt32(fntData.glyphs.length);

	for (const glyph of fntData.glyphs) {
		const glyphStart = buf.pos;
		buf.writeInt16(0); // placeholder for chunk size

		buf.writeInt16(glyph.charId);
		buf.writeS(glyph.img);
		buf.writeInt32(glyph.x);
		buf.writeInt32(glyph.y);
		buf.writeInt32(glyph.xoffset);
		buf.writeInt32(glyph.yoffset);
		buf.writeInt32(glyph.width);
		buf.writeInt32(glyph.height);
		buf.writeInt32(glyph.xadvance);
		buf.writeUint8(glyph.channel);

		const glyphEnd = buf.pos;
		const saved = buf.pos;
		buf.pos = glyphStart;
		buf.writeInt16(glyphEnd - glyphStart - 2);
		buf.pos = saved;
	}

	// Patch offsets
	const savedPos = buf.pos;
	buf.pos = offsetsPos;
	buf.writeUint32(block0Offset);
	buf.writeUint32(block1Offset);
	buf.pos = savedPos;

	return buf.toUint8Array();
}

function isComponentResource(resource: PackageResource): resource is Component {
	return resource.propertyType === 'Component';
}

function getPublishedFileName(resource: {
	getFile(): string;
	getExtras?(): Record<string, unknown> | undefined;
}): string {
	const extras = (resource.getExtras?.() as PublishFileExtras | undefined) ?? {};
	return extras._publishedFile ?? resource.getFile();
}

function getItemBranchName(item: BinaryPackageItem): string {
	const branchAware = item as BranchAwareBinaryItem;
	return branchAware.getBranch?.() ?? '';
}

function getPackageBranchNames(doc: Document, pkg: Package, resources: PackageResource[]): string[] {
	const packageBranchSet = new Set(
		resources
			.map((resource) => getItemBranchName(resource))
			.filter((branchName) => !!branchName),
	);
	if (packageBranchSet.size === 0) {
		return [];
	}
	return doc.getRoot().listBranches().filter((branchName) => packageBranchSet.has(branchName));
}

function buildBranchResourceKey(resource: BinaryPackageItem): string {
	const path = (resource as BranchAwareBinaryItem).getPath?.() ?? '';
	const name = resource.getName?.() ?? '';
	return `${resource.propertyType}|${path}|${name}`;
}

function buildBranchItemIdsMap(pkg: Package, branchNames: string[]): Map<string, string[]> {
	if (branchNames.length === 0) {
		return new Map();
	}

	const branchSlotByName = new Map(branchNames.map((branchName, index) => [branchName, index] as const));
	const map = new Map<string, string[]>();

	for (const resource of pkg.listResources()) {
		const branchName = getItemBranchName(resource);
		if (!branchName) continue;
		const slotIndex = branchSlotByName.get(branchName);
		if (slotIndex === undefined) continue;

		const key = buildBranchResourceKey(resource);
		const branchIds = map.get(key) ?? Array(branchNames.length).fill('');
		branchIds[slotIndex] = resource.getId();
		map.set(key, branchIds);
	}

	return map;
}

function getItemBranchItemIds(
	item: BinaryPackageItem,
	branchNames: string[],
	branchItemIdsMap: Map<string, string[]>,
): string[] {
	if (branchNames.length === 0) return [];

	const branchAware = item as BranchAwareBinaryItem;
	const explicitBranchItemIds = branchAware.getBranchItemIds?.() ?? [];
	if (explicitBranchItemIds.length > 0) {
		const normalized = branchNames.map((_, index) => explicitBranchItemIds[index] ?? '');
		return normalized.some((value) => !!value) ? normalized : [];
	}

	if (getItemBranchName(item)) return [];

	const inferred = branchItemIdsMap.get(buildBranchResourceKey(item));
	if (!inferred) return [];
	return inferred.some((value) => !!value) ? [...inferred] : [];
}

function getAtlasId(atlas: Atlas): string {
	return `atlas${atlas.getIndex()}`;
}

function toUint8Array(raw: RawBinarySlice): Uint8Array {
	return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
}

function getOptionalNumber(
	value: SizeLike,
	key: 'getWidth' | 'getHeight',
): number {
	const getter = value[key];
	return getter?.call(value) ?? 0;
}

function getOptionalStringId(item: BinaryPackageItem): string {
	if ('getId' in item && typeof item.getId === 'function') {
		return item.getId();
	}
	return '';
}

function getPixelHitTestEntry(resource: PackageResource): PixelHitTestEntry | null {
	const payload = (resource as ImageResource).getPixelHitTestData();
	if (!payload) return null;
	return {
		itemId: resource.getId(),
		pixelWidth: payload.pixelWidth,
		scaleDenominator: payload.scaleDenominator,
		pixels: payload.pixels,
	};
}
