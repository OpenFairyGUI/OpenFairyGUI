import { inflateRaw } from 'pako';
import { Document } from '../document.js';
import { ControllerActionType, FGUI_MAGIC, GearType, TransitionActionType, type RelationDef } from '../constants.js';
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

interface BranchAwarePackageResource {
	setBranch(branch: string): unknown;
	setBranchItemIds(ids: string[]): unknown;
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

const COMPONENT_EXTENSION_TYPE_NAMES: Record<number, string> = {
	11: 'Label',
	12: 'Button',
	13: 'ComboBox',
	14: 'ProgressBar',
	15: 'Slider',
	16: 'ScrollBar',
};

interface PixelHitTestEntry {
	itemId: string;
	pixelWidth: number;
	scaleDenominator: number;
	pixels: Uint8Array;
}

type ComponentDisplayObject = ReturnType<Document['createComponent']> extends { listChildren(): infer T }
	? T extends Array<infer U> ? U : never
	: never;

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
		const charId = buf.getInt16();
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

function remainingBytes(buf: ByteBuffer): number {
	return Math.max(0, buf.byteLength - buf.pos);
}

function readColorValue(buf: ByteBuffer, hasAlpha: boolean): string {
	const r = buf.getUint8().toString(16).padStart(2, '0');
	const g = buf.getUint8().toString(16).padStart(2, '0');
	const b = buf.getUint8().toString(16).padStart(2, '0');
	const a = buf.getUint8().toString(16).padStart(2, '0');
	if (!hasAlpha || a === 'ff') return `#${r}${g}${b}`.toUpperCase();
	return `#${a}${r}${g}${b}`.toUpperCase();
}

function formatBinaryNumber(value: number): string {
	const normalized = Math.round((Object.is(value, -0) ? 0 : value) * 1_000_000) / 1_000_000;
	return Number.isInteger(normalized) ? `${normalized}` : `${normalized}`;
}

function resolveRelationTarget(targetIndex: number, targetIds: string[]): string {
	if (targetIndex < 0) return '';
	return targetIds[targetIndex] ?? `${targetIndex}`;
}

function decodeRelationBlock(
	buf: ByteBuffer,
	targetIds: string[],
	addRelation: (relation: RelationDef) => void,
): void {
	const targetCount = buf.getUint8();
	for (let targetIndex = 0; targetIndex < targetCount; targetIndex += 1) {
		if (remainingBytes(buf) < 3) return;
		const relationTarget = resolveRelationTarget(buf.getInt16(), targetIds);
		const pairCount = buf.getUint8();
		for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
			if (remainingBytes(buf) < 2) return;
			addRelation({
				target: relationTarget,
				type: buf.getUint8(),
				usePercent: buf.readBool(),
			});
		}
	}
}

function createDisplayObject(doc: Document, objectType: number, name: string): ComponentDisplayObject | null {
	switch (objectType) {
		case 0: return doc.createGImage(name);
		case 1: return doc.createGMovieClip(name);
		case 3: return doc.createGGraph(name);
		case 4: return doc.createGLoader(name);
		case 5: return doc.createGGroup(name);
		case 6: return doc.createGTextField(name);
		case 7: return doc.createGRichTextField(name);
		case 8: return doc.createGTextInput(name);
		case 9: return doc.createGComponent(name);
		case 10: return doc.createGList(name);
		case 11: return doc.createGLabel(name);
		case 12: return doc.createGButton(name);
		case 13: return doc.createGComboBox(name);
		case 14: return doc.createGProgressBar(name);
		case 15: return doc.createGSlider(name);
		case 16: return doc.createGScrollBar(name);
		case 17: return doc.createGTree(name);
		case 18: return doc.createGLoader3D(name);
		default: return null;
	}
}

function decodeChildBlock0(
	doc: Document,
	childBuf: ByteBuffer,
): ComponentDisplayObject | null {
	if (!childBuf.seek(0, 0) || remainingBytes(childBuf) < 33) return null;

	const objectType = childBuf.getUint8();
	const src = childBuf.readS() ?? '';
	childBuf.readS(); // pkgId
	const id = childBuf.readS() ?? '';
	const name = childBuf.readS() ?? '';
	const child = createDisplayObject(doc, objectType, name);
	if (!child) return null;

	child.setName(name);
	child.setId(id);
	if ('setSrc' in child && typeof child.setSrc === 'function') {
		(child as { setSrc(v: string): void }).setSrc(src);
	}

		if ('setXY' in child && typeof child.setXY === 'function') {
			(child as { setXY(x: number, y: number): void }).setXY(childBuf.getInt32(), childBuf.getInt32());
		} else {
			childBuf.skip(8);
		}

	if (childBuf.readBool() && remainingBytes(childBuf) >= 8) {
		if ('setSize' in child && typeof child.setSize === 'function') {
			(child as { setSize(w: number, h: number): void }).setSize(childBuf.getInt32(), childBuf.getInt32());
		} else {
			childBuf.skip(8);
		}
	}

	if (childBuf.readBool() && remainingBytes(childBuf) >= 16) {
		childBuf.skip(16);
	}

		if (childBuf.readBool() && remainingBytes(childBuf) >= 8) {
			if ('setScale' in child && typeof child.setScale === 'function') {
				(child as { setScale(x: number, y: number): void }).setScale(childBuf.getFloat32(), childBuf.getFloat32());
			} else {
				childBuf.skip(8);
			}
		}

	if (childBuf.readBool() && remainingBytes(childBuf) >= 8) {
		if ('setSkew' in child && typeof child.setSkew === 'function') {
			(child as { setSkew(x: number, y: number): void }).setSkew(childBuf.getFloat32(), childBuf.getFloat32());
		} else {
			childBuf.skip(8);
		}
	}

		if (childBuf.readBool() && remainingBytes(childBuf) >= 9) {
			const px = childBuf.getFloat32();
			const py = childBuf.getFloat32();
			const anchor = childBuf.readBool();
			if ('setPivot' in child && typeof child.setPivot === 'function') {
				(child as { setPivot(x: number, y: number, anchor?: boolean): void }).setPivot(px, py, anchor);
			}
		}

	if (remainingBytes(childBuf) < 15) return child;
	const alpha = childBuf.getFloat32();
	const rotation = childBuf.getFloat32();
	const visible = childBuf.readBool();
	const touchable = childBuf.readBool();
	const grayed = childBuf.readBool();
	if ('setAlpha' in child && typeof child.setAlpha === 'function') {
		(child as { setAlpha(v: number): void }).setAlpha(alpha);
	}
	if ('setRotation' in child && typeof child.setRotation === 'function') {
		(child as { setRotation(v: number): void }).setRotation(rotation);
	}
	if ('setVisible' in child && typeof child.setVisible === 'function') {
		(child as { setVisible(v: boolean): void }).setVisible(visible);
	}
	if ('setTouchable' in child && typeof child.setTouchable === 'function') {
		(child as { setTouchable(v: boolean): void }).setTouchable(touchable);
	}
	if ('setGrayed' in child && typeof child.setGrayed === 'function') {
		(child as { setGrayed(v: boolean): void }).setGrayed(grayed);
	}

	if (remainingBytes(childBuf) < 2) return child;
	childBuf.getUint8(); // blendMode
	childBuf.getUint8(); // filter
	if (remainingBytes(childBuf) >= 2) {
		if ('setCustomData' in child && typeof child.setCustomData === 'function') {
			(child as { setCustomData(v: string): void }).setCustomData(childBuf.readS() ?? '');
		} else {
			childBuf.readS();
		}
	}

	return child;
}

function decodeChildBlock1(
	child: ComponentDisplayObject,
	childBuf: ByteBuffer,
): number {
	if (!childBuf.seek(0, 1) || remainingBytes(childBuf) < 4) return -1;
	if ('setTooltips' in child && typeof child.setTooltips === 'function') {
		(child as { setTooltips(v: string): void }).setTooltips(childBuf.readS() ?? '');
	} else {
		childBuf.readS();
	}
	return childBuf.getInt16();
}

function decodeChildBlock4ComponentLike(
	resource: ReturnType<Document['createComponent']>,
	child: ComponentDisplayObject,
	childBuf: ByteBuffer,
): void {
	if (!childBuf.seek(0, 4) || remainingBytes(childBuf) < 4) return;
	const pageControllerIndex = childBuf.getInt16();
	const overrideCount = childBuf.getInt16();
	const overrides: string[] = [];
	for (let index = 0; index < overrideCount && remainingBytes(childBuf) >= 4; index += 1) {
		overrides.push(childBuf.readS() ?? '', childBuf.readS() ?? '');
	}
	if ('setControllerOverrides' in child && typeof child.setControllerOverrides === 'function') {
		(child as { setControllerOverrides(v: string): void }).setControllerOverrides(overrides.join(','));
	}
	if (pageControllerIndex >= 0) {
		const controller = resource.listControllers()[pageControllerIndex];
		if (controller && 'setPageController' in child && typeof child.setPageController === 'function') {
			(child as { setPageController(v: string): void }).setPageController(controller.getName());
		}
	}
}

function decodeChildBlock4TextInput(child: ComponentDisplayObject, childBuf: ByteBuffer): void {
	if (!childBuf.seek(0, 4) || remainingBytes(childBuf) < 10) return;
	(child as ReturnType<Document['createGTextInput']>)
		.setPromptText(childBuf.readS() ?? '')
		.setRestrict(childBuf.readS() ?? '')
		.setMaxLength(childBuf.getInt32())
		.setKeyboardType(childBuf.getInt32())
		.setPassword(childBuf.readBool());
}

function decodeTextChildSpecific(child: ComponentDisplayObject, childBuf: ByteBuffer): void {
	if (remainingBytes(childBuf) < 18) return;
	const textChild = child as
		| ReturnType<Document['createGTextField']>
		| ReturnType<Document['createGRichTextField']>
		| ReturnType<Document['createGTextInput']>;
	textChild
		.setFont(childBuf.readS() ?? '')
		.setFontSize(childBuf.getInt16())
		.setColor(readColorValue(childBuf, false))
		.setAlign(childBuf.getUint8())
		.setVAlign(childBuf.getUint8())
		.setLeading(childBuf.getInt16())
		.setLetterSpacing(childBuf.getInt16())
		.setUbbEnabled(childBuf.readBool())
		.setAutoSize(childBuf.getUint8())
		.setUnderline(childBuf.readBool())
		.setItalic(childBuf.readBool())
		.setBold(childBuf.readBool())
		.setSingleLine(childBuf.readBool());

	if (childBuf.readBool() && remainingBytes(childBuf) >= 8) {
		textChild
			.setStrokeColor(readColorValue(childBuf, true))
			.setStrokeSize(childBuf.getFloat32());
	}

	if (childBuf.readBool() && remainingBytes(childBuf) >= 12) {
		textChild
			.setShadowColor(readColorValue(childBuf, true))
			.setShadowOffset({
				x: childBuf.getFloat32(),
				y: childBuf.getFloat32(),
			});
	}

	if (childBuf.readBool()) {
		// template vars, current writer does not emit payload
	}

	if (childBuf.version >= 3 && remainingBytes(childBuf) >= 13) {
		textChild.setStrikethrough(childBuf.readBool());
		childBuf.skip(12);
	}
}

function decodeListScrollPane(child: ComponentDisplayObject, childBuf: ByteBuffer): void {
	if (!childBuf.seek(0, 7) || remainingBytes(childBuf) < 10) return;
	const listLike = child as ReturnType<Document['createGList']> | ReturnType<Document['createGTree']>;
	listLike
		.setScrollType(childBuf.getUint8());
	childBuf.getUint8(); // scrollBarDisplay
	listLike.setScrollBarFlags(childBuf.getInt32());
	if (childBuf.readBool() && remainingBytes(childBuf) >= 16) {
		listLike.setScrollBarMargin([
			childBuf.getInt32(),
			childBuf.getInt32(),
			childBuf.getInt32(),
			childBuf.getInt32(),
		]);
	}
	listLike
		.setVtScrollBarRes(childBuf.readS() ?? '')
		.setHzScrollBarRes(childBuf.readS() ?? '')
		.setHeaderRes(childBuf.readS() ?? '')
		.setFooterRes(childBuf.readS() ?? '');
}

function skipListItemOverrides(buf: ByteBuffer, version: number): void {
	if (remainingBytes(buf) < 2) return;
	const controllerOverrideCount = buf.getInt16();
	for (let index = 0; index < controllerOverrideCount && remainingBytes(buf) >= 4; index += 1) {
		buf.readS();
		buf.readS();
	}
	if (version >= 2 && remainingBytes(buf) >= 2) {
		const propertyOverrideCount = buf.getInt16();
		for (let index = 0; index < propertyOverrideCount && remainingBytes(buf) >= 6; index += 1) {
			buf.readS();
			buf.getInt16();
			buf.readS();
		}
	}
}

function decodeListItems(child: ComponentDisplayObject, childBuf: ByteBuffer): void {
	if (!childBuf.seek(0, 8) || remainingBytes(childBuf) < 4) return;
	const listLike = child as ReturnType<Document['createGList']> | ReturnType<Document['createGTree']>;
	const isTree = child.propertyType === 'GTree';
	listLike.setDefaultItem(childBuf.readS() ?? '');
	const itemCount = childBuf.getInt16();
	const items: Array<{
		title: string | null;
		icon: string | null;
		url: string | null;
		name: string | null;
		selectedTitle: string | null;
		selectedIcon: string | null;
		level: number;
		isFolder: boolean | null;
	}> = [];
	for (let index = 0; index < itemCount && remainingBytes(childBuf) >= 2; index += 1) {
		const chunkSize = childBuf.getInt16();
		const nextPos = childBuf.pos + chunkSize;
		const url = childBuf.readS();
		let isFolder: boolean | null = null;
		let level = 0;
		if (isTree && remainingBytes(childBuf) >= 2) {
			isFolder = childBuf.readBool();
			level = childBuf.getUint8();
		}
		items.push({
			url,
			title: childBuf.readS(),
			selectedTitle: childBuf.readS(),
			icon: childBuf.readS(),
			selectedIcon: childBuf.readS(),
			name: childBuf.readS(),
			level,
			isFolder,
		});
		skipListItemOverrides(childBuf, childBuf.version);
		childBuf.pos = nextPos;
	}
	listLike.setListItems(items);
}

function decodeTreeSettings(child: ComponentDisplayObject, childBuf: ByteBuffer): void {
	if (child.propertyType !== 'GTree') return;
	if (!childBuf.seek(0, 9) || remainingBytes(childBuf) < 5) return;
	(child as ReturnType<Document['createGTree']>)
		.setIndent(childBuf.getInt32())
		.setClickToExpand(childBuf.getUint8());
}

function decodeChildBlock5(child: ComponentDisplayObject, childBuf: ByteBuffer): void {
	if (!childBuf.seek(0, 5)) return;

	switch (child.propertyType) {
		case 'GImage': {
			if (remainingBytes(childBuf) < 3) return;
			if (childBuf.readBool()) {
				(child as ReturnType<Document['createGImage']>).setColor(readColorValue(childBuf, false));
			}
			const imageChild = child as ReturnType<Document['createGImage']>;
			imageChild
				.setFlip(childBuf.getUint8())
				.setFillMethod(childBuf.getUint8());
			if (imageChild.getFillMethod() !== 0 && remainingBytes(childBuf) >= 6) {
				imageChild
					.setFillOrigin(childBuf.getUint8())
					.setFillClockwise(childBuf.readBool())
					.setFillAmount(childBuf.getFloat32());
			}
			break;
		}
		case 'GTextField':
		case 'GRichTextField':
		case 'GTextInput':
			decodeTextChildSpecific(child, childBuf);
			break;
		case 'GGroup': {
			if (remainingBytes(childBuf) < 11) return;
			(child as ReturnType<Document['createGGroup']>)
				.setLayout(childBuf.getUint8())
				.setLineGap(childBuf.getInt32())
				.setColumnGap(childBuf.getInt32())
				.setExcludeInvisibles(childBuf.readBool())
				.setAutoSizeDisabled(childBuf.readBool())
				.setMainGridIndex(childBuf.getInt16());
			break;
		}
		case 'GLoader': {
			if (remainingBytes(childBuf) < 15) return;
			const loader = child as ReturnType<Document['createGLoader']>;
			loader
				.setUrl(childBuf.readS() ?? '')
				.setAlign(childBuf.getUint8())
				.setVAlign(childBuf.getUint8())
				.setFill(childBuf.getUint8())
				.setShrinkOnly(childBuf.readBool())
				.setAutoSize(childBuf.readBool());
			childBuf.readBool(); // showErrorSign
			loader
				.setPlaying(childBuf.readBool())
				.setFrame(childBuf.getInt32());
			if (childBuf.readBool()) {
				loader.setColor(readColorValue(childBuf, false));
			}
			loader.setFillMethod(childBuf.getUint8());
			if (loader.getFillMethod() !== 0 && remainingBytes(childBuf) >= 6) {
				loader
					.setFillOrigin(childBuf.getUint8())
					.setFillClockwise(childBuf.readBool())
					.setFillAmount(childBuf.getFloat32());
			}
			if (childBuf.version >= 7 && remainingBytes(childBuf) >= 1) {
				loader.setUseResize(childBuf.readBool());
			}
			break;
		}
		case 'GLoader3D': {
			if (remainingBytes(childBuf) < 18) return;
			const loader = child as ReturnType<Document['createGLoader3D']>;
			loader
				.setUrl(childBuf.readS() ?? '')
				.setAlign(childBuf.getUint8())
				.setVAlign(childBuf.getUint8())
				.setFill(childBuf.getUint8())
				.setShrinkOnly(childBuf.readBool())
				.setAutoSize(childBuf.readBool())
				.setAnimationName(childBuf.readS() ?? '')
				.setSkinName(childBuf.readS() ?? '')
				.setPlaying(childBuf.readBool())
				.setFrame(childBuf.getInt32())
				.setLoop(childBuf.readBool());
			if (childBuf.readBool()) {
				loader.setColor(readColorValue(childBuf, false));
			}
			break;
		}
		case 'GMovieClip': {
			if (remainingBytes(childBuf) < 7) return;
			const movieClip = child as ReturnType<Document['createGMovieClip']>;
			if (childBuf.readBool()) {
				movieClip.setColor(readColorValue(childBuf, false));
			}
			childBuf.getUint8(); // flip, current model has no formal field
			movieClip
				.setFrame(childBuf.getInt32())
				.setPlaying(childBuf.readBool());
			break;
		}
		case 'GList':
		case 'GTree': {
			if (remainingBytes(childBuf) < 18) return;
			const listLike = child as ReturnType<Document['createGList']> | ReturnType<Document['createGTree']>;
			listLike
				.setLayout(childBuf.getUint8())
				.setSelectionMode(childBuf.getUint8())
				.setAlign(childBuf.getUint8())
				.setVAlign(childBuf.getUint8())
				.setLineGap(childBuf.getInt16())
				.setColumnGap(childBuf.getInt16())
				.setLineCount(childBuf.getInt16())
				.setColumnCount(childBuf.getInt16())
				.setAutoResizeItem(childBuf.readBool())
				.setChildrenRenderOrder(childBuf.getUint8())
				.setApexIndex(childBuf.getInt16());
			if (childBuf.readBool() && remainingBytes(childBuf) >= 16) {
				listLike.setMargin([
					childBuf.getInt32(),
					childBuf.getInt32(),
					childBuf.getInt32(),
					childBuf.getInt32(),
				]);
			}
			const overflow = childBuf.getUint8();
			listLike.setOverflow(overflow);
			if (childBuf.readBool() && remainingBytes(childBuf) >= 8) {
				listLike.setClipSoftness([childBuf.getInt32(), childBuf.getInt32()]);
			}
			if (childBuf.version >= 2 && remainingBytes(childBuf) >= 2) {
				listLike
					.setScrollItemToViewOnClick(childBuf.readBool())
					.setFoldInvisibleItems(childBuf.readBool());
			}
			if (overflow === 2) {
				decodeListScrollPane(child, childBuf);
			}
			decodeListItems(child, childBuf);
			decodeTreeSettings(child, childBuf);
			break;
		}
		default:
			break;
	}
}

function decodeChildBlock6(
	resource: ReturnType<Document['createComponent']>,
	child: ComponentDisplayObject,
	childBuf: ByteBuffer,
): void {
	if (!childBuf.seek(0, 6)) return;

	switch (child.propertyType) {
		case 'GTextField':
		case 'GRichTextField':
		case 'GTextInput':
			if (remainingBytes(childBuf) >= 2) {
				(child as ReturnType<Document['createGTextField']>).setText(childBuf.readS() ?? '');
			}
			break;
		case 'GButton': {
			if (remainingBytes(childBuf) < 13) return;
			childBuf.getUint8(); // extType
			const button = child as ReturnType<Document['createGButton']>;
			button
				.setTitle(childBuf.readS() ?? '')
				.setSelectedTitle(childBuf.readS() ?? '')
				.setIcon(childBuf.readS() ?? '')
				.setSelectedIcon(childBuf.readS() ?? '');
			if (childBuf.readBool()) {
				button.setTitleColor(readColorValue(childBuf, true));
			}
			button.setTitleFontSize(childBuf.getInt32());
			childBuf.getInt16(); // relatedController index
			childBuf.readS(); // relatedPageId
			button.setSound(childBuf.readS() ?? '');
			if (childBuf.readBool() && remainingBytes(childBuf) >= 4) {
				button.setSoundVolumeScale(childBuf.getFloat32());
			}
			if (remainingBytes(childBuf) >= 1) {
				childBuf.readBool(); // selected
			}
			break;
		}
		case 'GLabel': {
			if (remainingBytes(childBuf) < 10) return;
			childBuf.getUint8(); // extType
			const label = child as ReturnType<Document['createGLabel']>;
			label
				.setTitle(childBuf.readS() ?? '')
				.setIcon(childBuf.readS() ?? '');
			if (childBuf.readBool()) {
				label.setTitleColor(readColorValue(childBuf, true));
			}
			label.setTitleFontSize(childBuf.getInt32());
			if (remainingBytes(childBuf) >= 1) {
				const hasInputSettings = childBuf.readBool();
				if (hasInputSettings) {
					// current writer does not emit this payload
				}
			}
			if (childBuf.version >= 5 && remainingBytes(childBuf) >= 6) {
				label
					.setSound(childBuf.readS() ?? '')
					.setSoundVolumeScale(childBuf.getFloat32());
			}
			break;
		}
		case 'GComboBox': {
			if (remainingBytes(childBuf) < 3) return;
			childBuf.getUint8(); // extType
			const comboBox = child as ReturnType<Document['createGComboBox']>;
			const itemCount = childBuf.getInt16();
			const items: string[] = [];
			const values: string[] = [];
			const icons: string[] = [];
			for (let index = 0; index < itemCount && remainingBytes(childBuf) >= 2; index += 1) {
				const chunkSize = childBuf.getInt16();
				const nextPos = childBuf.pos + chunkSize;
				items.push(childBuf.readS() ?? '');
				values.push(childBuf.readS() ?? '');
				icons.push(childBuf.readS() ?? '');
				childBuf.pos = nextPos;
			}
			comboBox
				.setItems(items)
				.setValues(values)
				.setIcons(icons)
				.setTitle(childBuf.readS() ?? '')
				.setIcon(childBuf.readS() ?? '');
			if (childBuf.readBool()) {
				comboBox.setTitleColor(readColorValue(childBuf, true));
			}
			comboBox
				.setVisibleItemCount(childBuf.getInt32())
				.setPopupDirection(childBuf.getUint8());
			childBuf.getInt16(); // selectionController index
			if (childBuf.version >= 5 && remainingBytes(childBuf) >= 6) {
				comboBox
					.setSound(childBuf.readS() ?? '')
					.setSoundVolumeScale(childBuf.getFloat32());
			}
			break;
		}
		case 'GProgressBar':
		case 'GSlider': {
			if (remainingBytes(childBuf) < 14) return;
			childBuf.getUint8(); // extType
			const sliderLike = child as
				| ReturnType<Document['createGProgressBar']>
				| ReturnType<Document['createGSlider']>;
			sliderLike
				.setValue(childBuf.getInt32())
				.setMax(childBuf.getInt32())
				.setMin(childBuf.getInt32());
			if (child.propertyType === 'GProgressBar' && childBuf.version >= 5 && remainingBytes(childBuf) >= 6) {
				(sliderLike as ReturnType<Document['createGProgressBar']>)
					.setSound(childBuf.readS() ?? '')
					.setSoundVolumeScale(childBuf.getFloat32());
			}
			break;
		}
		case 'GList':
		case 'GTree': {
			if (remainingBytes(childBuf) < 2) return;
			const controllerIndex = childBuf.getInt16();
			const controller = controllerIndex >= 0 ? resource.listControllers()[controllerIndex] : null;
			if (controller) {
				(child as ReturnType<Document['createGList']> | ReturnType<Document['createGTree']>)
					.setSelectionController(controller.getName());
			}
			break;
		}
		default:
			break;
	}
}

function decodeChildBlock2(
	doc: Document,
	resource: ReturnType<Document['createComponent']>,
	child: ComponentDisplayObject,
	childBuf: ByteBuffer,
): void {
	if (!childBuf.seek(0, 2) || remainingBytes(childBuf) < 2) return;
	const gearCount = childBuf.getInt16();
	for (let gearIndex = 0; gearIndex < gearCount && remainingBytes(childBuf) >= 2; gearIndex += 1) {
		const chunkSize = childBuf.getInt16();
		const nextPos = childBuf.pos + chunkSize;
		if (remainingBytes(childBuf) < 3) {
			childBuf.pos = nextPos;
			continue;
		}
		const gearType = childBuf.getUint8();
		const gear = doc.createGear(`${child.getId()}_gear${gearIndex}`);
		gear.setGearType(gearType);

		if (remainingBytes(childBuf) >= 2) {
			const controllerIndex = childBuf.getInt16();
			gear.setController(resource.listControllers()[controllerIndex] ?? null);
		}

		const pages: string[] = [];
		const values: string[] = [];
		let defaultValue: string | null = null;

		if (gearType === GearType.Display || gearType === GearType.Display2) {
			const pageCount = remainingBytes(childBuf) >= 2 ? childBuf.getInt16() : 0;
			for (let pageIndex = 0; pageIndex < pageCount && remainingBytes(childBuf) >= 2; pageIndex += 1) {
				pages.push(childBuf.readS() ?? '');
			}
		} else {
			const pageCount = remainingBytes(childBuf) >= 2 ? childBuf.getInt16() : 0;
			const controllerPages = gear.getController()?.listPages() ?? [];
			for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
				if (remainingBytes(childBuf) < 2) break;
				const rawPageId = childBuf.readS();
				const pageId = rawPageId ?? controllerPages[pageIndex]?.getId() ?? '';
				pages.push(pageId);
				if (rawPageId === null && gearType !== GearType.Text && gearType !== GearType.Icon) {
					values.push('-');
					continue;
				}
				values.push(decodeGearStatus(childBuf, gearType, childBuf.version));
			}
			if (remainingBytes(childBuf) >= 1 && childBuf.readBool()) {
				defaultValue = decodeGearStatus(childBuf, gearType, childBuf.version);
			}
		}

		if (remainingBytes(childBuf) >= 1) {
			const hasTween = childBuf.readBool();
			gear.setTween(hasTween);
			if (hasTween && remainingBytes(childBuf) >= 9) {
				gear
					.setEaseType(childBuf.getUint8())
					.setTweenDuration(childBuf.getFloat32())
					.setTweenDelay(childBuf.getFloat32());
				if (childBuf.version >= 4 && gear.getEaseType() === 31) {
					gear.setCustomEasePath(readPathData(childBuf));
				}
			}
		}

		if (childBuf.version >= 2 && gearType === GearType.XY && remainingBytes(childBuf) >= 1) {
			const positionsInPercent = childBuf.readBool();
			gear.setPositionsInPercent(positionsInPercent);
			if (positionsInPercent) {
				for (let pageIndex = 0; pageIndex < pages.length && remainingBytes(childBuf) >= 2; pageIndex += 1) {
					const rawPageId = childBuf.readS();
					const pageId = rawPageId ?? pages[pageIndex] ?? '';
					if (rawPageId === null || pageId === '') continue;
					const px = childBuf.getFloat32();
					const py = childBuf.getFloat32();
					values[pageIndex] = `${values[pageIndex] || '0,0'},${formatBinaryNumber(px)},${formatBinaryNumber(py)}`;
				}
				if (remainingBytes(childBuf) >= 1 && childBuf.readBool()) {
					const px = childBuf.getFloat32();
					const py = childBuf.getFloat32();
					defaultValue = `${defaultValue || '0,0'},${formatBinaryNumber(px)},${formatBinaryNumber(py)}`;
				}
			}
		}

		if (gearType === GearType.Display2 && remainingBytes(childBuf) >= 1) {
			gear.setCondition(`${childBuf.getUint8()}`);
		}

		if (childBuf.version >= 6 && gearType === GearType.Animation) {
			for (let pageIndex = 0; pageIndex < pages.length && remainingBytes(childBuf) >= 2; pageIndex += 1) {
				const rawPageId = childBuf.readS();
				if (rawPageId === null) continue;
				const animationName = childBuf.readS() ?? '';
				const skinName = childBuf.readS() ?? '';
				values[pageIndex] = `${values[pageIndex] || '0,p'},${animationName},${skinName}`;
			}
			if (remainingBytes(childBuf) >= 1 && childBuf.readBool()) {
				const animationName = childBuf.readS() ?? '';
				const skinName = childBuf.readS() ?? '';
				defaultValue = `${defaultValue || '0,p'},${animationName},${skinName}`;
			}
		}

		if (pages.length > 0) gear.setPages(pages.join(','));
		if (values.length > 0) gear.setValues(values.join('|'));
		gear.setDefaultValue(defaultValue);
		child.addGear(gear);
		childBuf.pos = nextPos;
	}
}

function decodeGearStatus(buf: ByteBuffer, gearType: number, version: number): string {
	switch (gearType) {
		case GearType.XY:
			return `${buf.getInt32()},${buf.getInt32()}`;
		case GearType.Size:
			return [
				formatBinaryNumber(buf.getInt32()),
				formatBinaryNumber(buf.getInt32()),
				formatBinaryNumber(buf.getFloat32()),
				formatBinaryNumber(buf.getFloat32()),
			].join(',');
		case GearType.Look:
			return [
				formatBinaryNumber(buf.getFloat32()),
				formatBinaryNumber(buf.getFloat32()),
				buf.readBool() ? 'true' : 'false',
				buf.readBool() ? 'true' : 'false',
			].join(',');
		case GearType.Color:
			return `${readColorValue(buf, true)},${readColorValue(buf, true)}`;
		case GearType.Animation: {
			const playing = buf.readBool() ? 'p' : 's';
			return `${buf.getInt32()},${playing}`;
		}
		case GearType.Text:
		case GearType.Icon:
			return buf.readS() ?? '';
		case GearType.FontSize:
			return `${buf.getInt32()}`;
		default:
			return '';
	}
}

function decodeChildBlock3(
	resource: ReturnType<Document['createComponent']>,
	child: ComponentDisplayObject,
	childBuf: ByteBuffer,
): void {
	if (!childBuf.seek(0, 3) || remainingBytes(childBuf) < 1) return;
	const childIds = resource.listChildren().map((entry) => entry.getId());
	decodeRelationBlock(childBuf, childIds, (relation) => child.addRelation(relation));
}

function decodeComponentControllers(
	doc: Document,
	resource: ReturnType<Document['createComponent']>,
	buf: ByteBuffer,
): void {
	if (!buf.seek(0, 1) || remainingBytes(buf) < 2) return;
	const controllerCount = buf.getInt16();
	for (let controllerIndex = 0; controllerIndex < controllerCount && remainingBytes(buf) >= 2; controllerIndex += 1) {
		const chunkSize = buf.getInt16();
		const nextPos = buf.pos + chunkSize;
		const controllerBuf = new ByteBuffer(buf.buffer, buf.byteOffset + buf.pos, chunkSize);
		controllerBuf.stringTable = buf.stringTable;
		controllerBuf.version = buf.version;
		const controller = doc.createController(`controller${controllerIndex}`);

		if (controllerBuf.seek(0, 0) && remainingBytes(controllerBuf) >= 2) {
			controller
				.setName(controllerBuf.readS() ?? `controller${controllerIndex}`)
				.setAutoRadioGroupDepth(remainingBytes(controllerBuf) >= 1 ? controllerBuf.readBool() : false);
		}

		if (controllerBuf.seek(0, 1) && remainingBytes(controllerBuf) >= 2) {
			const pageCount = controllerBuf.getInt16();
			for (let pageIndex = 0; pageIndex < pageCount && remainingBytes(controllerBuf) >= 4; pageIndex += 1) {
				const pageId = controllerBuf.readS() ?? `page${pageIndex}`;
				const pageName = controllerBuf.readS() ?? pageId;
				const page = doc.createControllerPage(pageName);
				page
					.setId(pageId)
					.setName(pageName);
				controller.addPage(page);
			}
			if (controller.listPages().length > 0) {
				controller.setSelectedIndex(0);
			}
		}

		if (controllerBuf.seek(0, 2) && remainingBytes(controllerBuf) >= 2) {
			const actionCount = controllerBuf.getInt16();
			for (let actionIndex = 0; actionIndex < actionCount && remainingBytes(controllerBuf) >= 2; actionIndex += 1) {
				const actionSize = controllerBuf.getInt16();
				const actionNextPos = controllerBuf.pos + actionSize;
				const actionBuf = new ByteBuffer(controllerBuf.buffer, controllerBuf.byteOffset + controllerBuf.pos, actionSize);
				actionBuf.stringTable = controllerBuf.stringTable;
				actionBuf.version = controllerBuf.version;
				const action = doc.createControllerAction(`${controller.getName()}_action${actionIndex}`);
				if (remainingBytes(actionBuf) >= 1) {
					const actionType = actionBuf.getUint8();
					action.setActionType(actionType);
					if (remainingBytes(actionBuf) >= 2) {
						action.setFromPage(actionBuf.readSArray(actionBuf.getInt16()).filter((pageId) => pageId !== ''));
					}
					if (remainingBytes(actionBuf) >= 2) {
						action.setToPage(actionBuf.readSArray(actionBuf.getInt16()).filter((pageId) => pageId !== ''));
					}
					switch (actionType) {
						case ControllerActionType.PlayTransition:
							if (remainingBytes(actionBuf) >= 11) {
								action
									.setTransitionName(actionBuf.readS() ?? '')
									.setPlayTimes(actionBuf.getInt32())
									.setDelay(actionBuf.getFloat32())
									.setStopOnExit(actionBuf.readBool());
							}
							break;
						case ControllerActionType.ChangePage:
							if (remainingBytes(actionBuf) >= 6) {
								action
									.setObjectId(actionBuf.readS() ?? '')
									.setControllerName(actionBuf.readS() ?? '')
									.setTargetPage(actionBuf.readS() ?? '');
							}
							break;
						default:
							break;
					}
				}
				controller.addAction(action);
				controllerBuf.pos = actionNextPos;
			}
		}

		resource.addController(controller);
		buf.pos = nextPos;
	}
}

function decodeComponentRelations(
	resource: ReturnType<Document['createComponent']>,
	buf: ByteBuffer,
): void {
	if (!buf.seek(0, 3) || remainingBytes(buf) < 1) return;
	const childIds = resource.listChildren().map((child) => child.getId());
	decodeRelationBlock(buf, childIds, (relation) => resource.addRelation(relation));
}

function readPathData(buf: ByteBuffer): string {
	if (remainingBytes(buf) < 4) return '';
	const pointCount = buf.getInt32();
	const parts: string[] = [];
	for (let pointIndex = 0; pointIndex < pointCount && remainingBytes(buf) >= 1; pointIndex += 1) {
		const curveType = buf.getUint8();
		parts.push(`${curveType}`);
		switch (curveType) {
			case 1:
				for (let valueIndex = 0; valueIndex < 4 && remainingBytes(buf) >= 4; valueIndex += 1) {
					parts.push(formatBinaryNumber(buf.getFloat32()));
				}
				break;
			case 2:
				for (let valueIndex = 0; valueIndex < 6 && remainingBytes(buf) >= 4; valueIndex += 1) {
					parts.push(formatBinaryNumber(buf.getFloat32()));
				}
				parts.push('0');
				break;
			default:
				for (let valueIndex = 0; valueIndex < 2 && remainingBytes(buf) >= 4; valueIndex += 1) {
					parts.push(formatBinaryNumber(buf.getFloat32()));
				}
				break;
		}
	}
	return parts.join(',');
}

function readTransitionValue(actionType: number, buf: ByteBuffer, version: number): string[] {
	switch (actionType) {
		case TransitionActionType.XY: {
			const hasX = buf.readBool();
			const hasY = buf.readBool();
			const value1 = buf.getFloat32();
			const value2 = buf.getFloat32();
			const positionsInPercent = buf.readBool();
			if (positionsInPercent) {
				return [
					hasX ? '0' : '-',
					hasY ? '0' : '-',
					formatBinaryNumber(value1),
					formatBinaryNumber(value2),
				];
			}
			return [
				hasX ? formatBinaryNumber(value1) : '-',
				hasY ? formatBinaryNumber(value2) : '-',
			];
		}
		case TransitionActionType.Size:
		case TransitionActionType.Pivot:
		case TransitionActionType.Skew: {
			const hasX = buf.readBool();
			const hasY = buf.readBool();
			const value1 = buf.getFloat32();
			const value2 = buf.getFloat32();
			return [
				hasX ? formatBinaryNumber(value1) : '-',
				hasY ? formatBinaryNumber(value2) : '-',
			];
		}
		case TransitionActionType.Scale:
			return [formatBinaryNumber(buf.getFloat32()), formatBinaryNumber(buf.getFloat32())];
		case TransitionActionType.Alpha:
		case TransitionActionType.Rotation:
			return [formatBinaryNumber(buf.getFloat32())];
		case TransitionActionType.Color:
			return [readColorValue(buf, false)];
		case TransitionActionType.Animation: {
			const playing = buf.readBool() ? 'p' : 's';
			const frame = `${buf.getInt32()}`;
			const result = [frame, playing];
			if (version >= 6) {
				const animationName = buf.readS() ?? '';
				const skinName = buf.readS() ?? '';
				if (animationName || skinName) {
					result.push(animationName, skinName);
				}
			}
			return result;
		}
		case TransitionActionType.Visible:
			return [buf.readBool() ? 'true' : 'false'];
		case TransitionActionType.Sound:
			return [buf.readS() ?? '', `${Math.round(buf.getFloat32() * 100)}`];
		case TransitionActionType.Transition:
			return [buf.readS() ?? '', `${buf.getInt32()}`];
		case TransitionActionType.Shake:
			return [formatBinaryNumber(buf.getFloat32()), formatBinaryNumber(buf.getFloat32())];
		case TransitionActionType.ColorFilter:
			return [
				formatBinaryNumber(buf.getFloat32()),
				formatBinaryNumber(buf.getFloat32()),
				formatBinaryNumber(buf.getFloat32()),
				formatBinaryNumber(buf.getFloat32()),
			];
		case TransitionActionType.Text:
		case TransitionActionType.Icon:
			return [buf.readS() ?? ''];
		default:
			return [];
	}
}

function decodeComponentTransitions(
	doc: Document,
	resource: ReturnType<Document['createComponent']>,
	buf: ByteBuffer,
): void {
	if (!buf.seek(0, 5) || remainingBytes(buf) < 2) return;
	const transitionCount = buf.getInt16();
	const childIds = resource.listChildren().map((child) => child.getId());
	for (let transitionIndex = 0; transitionIndex < transitionCount && remainingBytes(buf) >= 2; transitionIndex += 1) {
		const chunkSize = buf.getInt16();
		const nextPos = buf.pos + chunkSize;
		const transition = doc.createTransition(buf.readS() ?? `transition${transitionIndex}`);
		transition
			.setOptions(buf.getInt32())
			.setAutoPlay(buf.readBool())
			.setAutoPlayTimes(buf.getInt32())
			.setAutoPlayDelay(buf.getFloat32());

		const itemCount = buf.getInt16();
		for (let itemIndex = 0; itemIndex < itemCount && remainingBytes(buf) >= 2; itemIndex += 1) {
			const itemSize = buf.getInt16();
			const itemNextPos = buf.pos + itemSize;
			const itemBuf = new ByteBuffer(buf.buffer, buf.byteOffset + buf.pos, itemSize);
			itemBuf.stringTable = buf.stringTable;
			itemBuf.version = buf.version;
			const item = doc.createTransitionItem(`${transition.getName()}_${itemIndex}`);

			if (itemBuf.seek(0, 0) && remainingBytes(itemBuf) >= 10) {
				const actionType = itemBuf.getUint8();
				item
					.setActionType(actionType)
					.setTime(itemBuf.getFloat32() * transition.getFps())
					.setTargetId(childIds[itemBuf.getInt16()] ?? '')
					.setLabel(itemBuf.readS() ?? '')
					.setTween(itemBuf.readBool());
			}

			if (item.getTween() && itemBuf.seek(0, 1) && remainingBytes(itemBuf) >= 14) {
				item
					.setDuration(itemBuf.getFloat32() * transition.getFps())
					.setEaseType(itemBuf.getUint8())
					.setRepeat(itemBuf.getInt32())
					.setYoyo(itemBuf.readBool())
					.setEndLabel(itemBuf.readS() ?? '');
			}

			if (itemBuf.seek(0, 2)) {
				item.setStartValue(readTransitionValue(item.getActionType(), itemBuf, itemBuf.version));
			}

			if (item.getTween() && itemBuf.seek(0, 3)) {
				item.setEndValue(readTransitionValue(item.getActionType(), itemBuf, itemBuf.version));
				if (itemBuf.version >= 2) {
					item.setPath(readPathData(itemBuf));
				}
				if (itemBuf.version >= 4 && item.getEaseType() === 31) {
					item.setCustomEasePath(readPathData(itemBuf));
				}
			}

			transition.addItem(item);
			buf.pos = itemNextPos;
		}

		resource.addTransition(transition);
		buf.pos = nextPos;
	}
}

function decodeComponentDisplayList(
	doc: Document,
	resource: ReturnType<Document['createComponent']>,
	buf: ByteBuffer,
): void {
	if (!buf.seek(0, 2) || remainingBytes(buf) < 2) return;
	const childCount = buf.getInt16();
	const entries: Array<{ child: ComponentDisplayObject; groupIndex: number; childBuf: ByteBuffer }> = [];

	for (let index = 0; index < childCount && remainingBytes(buf) >= 2; index += 1) {
		const chunkSize = buf.getInt16();
		const nextPos = buf.pos + chunkSize;
		const childBuf = new ByteBuffer(buf.buffer, buf.byteOffset + buf.pos, chunkSize);
		childBuf.stringTable = buf.stringTable;
		childBuf.version = buf.version;

		const child = decodeChildBlock0(doc, childBuf);
		if (child) {
			const groupIndex = decodeChildBlock1(child, childBuf);
			resource.addChild(child);
			entries.push({ child, groupIndex, childBuf });
		}

		buf.pos = nextPos;
	}

	for (const entry of entries) {
		if (entry.groupIndex < 0) continue;
		const target = entries[entry.groupIndex]?.child;
		if (target) {
			if ('setGroup' in entry.child && typeof entry.child.setGroup === 'function') {
				(entry.child as { setGroup(v: string): void }).setGroup(target.getId());
			}
		}
	}

	for (const entry of entries) {
		decodeChildBlock2(doc, resource, entry.child, entry.childBuf);
		decodeChildBlock3(resource, entry.child, entry.childBuf);
		if (entry.child.propertyType === 'GTextInput') {
			decodeChildBlock4TextInput(entry.child, entry.childBuf);
		} else if (
			entry.child.propertyType === 'GComponent'
			|| entry.child.propertyType === 'GList'
			|| entry.child.propertyType === 'GTree'
			|| entry.child.propertyType === 'GButton'
			|| entry.child.propertyType === 'GLabel'
			|| entry.child.propertyType === 'GComboBox'
			|| entry.child.propertyType === 'GProgressBar'
			|| entry.child.propertyType === 'GSlider'
			|| entry.child.propertyType === 'GScrollBar'
		) {
			decodeChildBlock4ComponentLike(resource, entry.child, entry.childBuf);
		}
		decodeChildBlock5(entry.child, entry.childBuf);
		decodeChildBlock6(resource, entry.child, entry.childBuf);
	}
}

function decodeComponentHeader(resource: ReturnType<Document['createComponent']>, buf: ByteBuffer): void {
	if (!buf.seek(0, 0)) return;
	if (remainingBytes(buf) < 11) return;

	resource.setSize(buf.getInt32(), buf.getInt32());

	if (buf.readBool()) {
		resource
			.setMinWidth(buf.getInt32())
			.setMaxWidth(buf.getInt32())
			.setMinHeight(buf.getInt32())
			.setMaxHeight(buf.getInt32());
	}

	if (buf.readBool()) {
		resource
			.setPivotX(buf.getFloat32())
			.setPivotY(buf.getFloat32())
			.setPivotAsAnchor(buf.readBool());
	}

	if (buf.readBool()) {
		resource.setMargin([
			buf.getInt32(),
			buf.getInt32(),
			buf.getInt32(),
			buf.getInt32(),
		]);
	}

	resource.setOverflow(buf.getUint8());

	if (buf.readBool()) {
		resource.setClipSoftness([buf.getInt32(), buf.getInt32()]);
	}
}

function decodeComponentAdvancedProps(resource: ReturnType<Document['createComponent']>, buf: ByteBuffer): void {
	if (!buf.seek(0, 4)) return;
	if (remainingBytes(buf) < 15) return;

	resource
		.setCustomData(buf.readS() ?? '')
		.setOpaque(buf.readBool());

	const maskIndex = buf.getInt16();
	if (maskIndex >= 0) {
		resource.setMask(resource.listChildren()[maskIndex]?.getId() ?? '');
		resource.setReversedMask(buf.readBool());
	}

	const hitTestId = buf.readS();
	const hitTestArg1 = buf.getInt32();
	const hitTestArg2 = buf.getInt32();
	if (hitTestId) {
		resource.setHitTest(`${hitTestId},${hitTestArg1},${hitTestArg2}`);
	} else if (hitTestArg1 === 1 && hitTestArg2 >= 0) {
		resource.setHitTest(resource.listChildren()[hitTestArg2]?.getId() ?? '');
	}

	if (buf.version >= 5 && remainingBytes(buf) >= 4) {
		resource
			.setAddedToStageSound(buf.readS() ?? '')
			.setRemovedFromStageSound(buf.readS() ?? '');
	}
}

function decodeComponentExtensionDef(
	resource: ReturnType<Document['createComponent']>,
	buf: ByteBuffer,
	extensionType: string,
): void {
	if (!extensionType) return;
	if (!buf.seek(0, 6)) return;

	switch (extensionType) {
		case 'Button':
			if (remainingBytes(buf) < 12) return;
			resource
				.setButtonMode(buf.getUint8())
				.setSound(buf.readS() ?? '')
				.setSoundVolumeScale(buf.getFloat32())
				.setDownEffect(buf.getUint8())
				.setDownEffectValue(buf.getFloat32());
			break;
		case 'ComboBox':
			if (remainingBytes(buf) < 2) return;
			resource.setDropdown(buf.readS() ?? '');
			break;
		case 'ProgressBar':
			if (remainingBytes(buf) < 2) return;
			resource
				.setTitleType(buf.getUint8())
				.setReverse(buf.readBool());
			break;
		case 'Slider':
			if (remainingBytes(buf) < 4) return;
			resource
				.setTitleType(buf.getUint8())
				.setReverse(buf.readBool())
				.setWholeNumbers(buf.readBool())
				.setChangeOnClick(buf.readBool());
			break;
		case 'ScrollBar':
			if (remainingBytes(buf) < 1) return;
			resource.setFixedGripSize(buf.readBool());
			break;
		default:
			break;
	}
}

function decodeComponentScrollPane(resource: ReturnType<Document['createComponent']>, buf: ByteBuffer): void {
	if (!buf.seek(0, 7)) return;
	if (remainingBytes(buf) < 14) return;

	resource
		.setScrollType(buf.getUint8())
		.setScrollBarDisplay(buf.getUint8())
		.setScrollBarFlags(buf.getInt32());

	if (buf.readBool()) {
		resource.setScrollBarMargin([
			buf.getInt32(),
			buf.getInt32(),
			buf.getInt32(),
			buf.getInt32(),
		]);
	}

	resource
		.setVtScrollBarRes(buf.readS() ?? '')
		.setHzScrollBarRes(buf.readS() ?? '')
		.setHeaderRes(buf.readS() ?? '')
		.setFooterRes(buf.readS() ?? '');
}

function decodeComponentDefinition(
	resource: ReturnType<Document['createComponent']>,
	rawData: ByteBuffer,
	extensionType: string,
	doc: Document,
): void {
	if (rawData.byteLength === 0) return;

	const componentBuf = new ByteBuffer(rawData.buffer, rawData.byteOffset, rawData.byteLength);
	componentBuf.stringTable = rawData.stringTable;
	componentBuf.version = rawData.version;

	decodeComponentHeader(resource, componentBuf);
	decodeComponentControllers(doc, resource, componentBuf);
	decodeComponentDisplayList(doc, resource, componentBuf);
	decodeComponentRelations(resource, componentBuf);
	decodeComponentAdvancedProps(resource, componentBuf);
	decodeComponentTransitions(doc, resource, componentBuf);
	decodeComponentExtensionDef(resource, componentBuf, extensionType);
	decodeComponentScrollPane(resource, componentBuf);
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
		let packageBranches: string[] = [];
		if (ver2) {
			const branchCnt = buf.getInt16();
			if (branchCnt > 0) {
				packageBranches = buf.readSArray(branchCnt);
				branchIncluded = true;
			}
		}

		// --- Build document ---
		const doc = new Document();
		if (packageBranches.length > 0) {
			doc.getRoot().setBranches(packageBranches);
		}
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
			let createdResource: BranchAwarePackageResource | null = null;

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
					createdResource = res;
					break;
				}

				case BinItemType.MovieClip: {
					const res = doc.createMovieClipResource(itemName);
					res
						.setId(itemId)
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
					res.setId(itemId).setFile(itemFile).setExported(exported);
					pkg.addResource(res);
					createdResource = res;
					break;
				}

				case BinItemType.Misc: {
					const res = doc.createMiscResource(itemName);
					res.setId(itemId).setFile(itemFile).setExported(exported);
					pkg.addResource(res);
					createdResource = res;
					break;
				}

				case BinItemType.Component: {
					const res = doc.createComponent(itemName);
					res.setId(itemId).setExported(exported).setSize(width, height);
					const extensionType = COMPONENT_EXTENSION_TYPE_NAMES[buf.readByte()] ?? '';
					res.setExtensionType(extensionType);
					const rawData = buf.readBuffer();
					decodeComponentDefinition(res, rawData, extensionType, doc);
					res.setExtras({
						...getComponentExtras(res),
						_rawBinary: toRawBinarySlice(rawData),
					});
					pkg.addResource(res);
					createdResource = res;
					break;
				}

				case BinItemType.Font: {
					const res = doc.createFontResource(itemName);
					res.setId(itemId).setExported(exported);
					const rawGlyphs = buf.readBuffer();
					decodeFontGlyphs(doc, res, rawGlyphs);
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
						.setFile(itemFile)
						.setExported(exported)
						.setWidth(width)
						.setHeight(height)
						.setAnchor(buf.getFloat32(), buf.getFloat32());
					pkg.addResource(res);
					createdResource = res;
					break;
				}

				case BinItemType.DragonBones: {
					const res = doc.createDragonBonesResource(itemName);
					res
						.setId(itemId)
						.setFile(itemFile)
						.setExported(exported)
						.setWidth(width)
						.setHeight(height)
						.setAnchor(buf.getFloat32(), buf.getFloat32());
					pkg.addResource(res);
					createdResource = res;
					break;
				}

				default:
					// Swf — skip item data
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
				if (highResCnt > 0) buf.readSArray(highResCnt);
				if (createdResource) {
					createdResource.setBranch(branchName);
					createdResource.setBranchItemIds(branchItemIds);
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
