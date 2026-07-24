/**
 * Encodes a Component property graph into the binary format used inside .fui files.
 *
 * This is the reverse of the runtime's `GComponent.constructFromResource2()` parser.
 * The output is a self-contained ByteBuffer with 6 blocks:
 *   0: Component header (size, pivot, margin, overflow)
 *   1: Controllers
 *   2: Display list (children)
 *   3: Component-level relations
 *   4: Advanced properties (opaque, mask, hitTest)
 *   5: Transitions
 *
 * @internal
 */

import type { Document } from '../document.js';
import { ControllerActionType, ObjectType, type RelationDef } from '../constants.js';
import type { Component } from '../properties/component.js';
import type { Package } from '../properties/package.js';
import { WriteBuffer } from './write-buffer.js';

const BLOCK_COUNT = 8;

type ChildNode = ReturnType<Component['listChildren']>[number];
type TransitionNode = ReturnType<Component['listTransitions']>[number];
type TransitionItemNode = ReturnType<TransitionNode['listItems']>[number];
type GearNode = ReturnType<ChildNode['listGears']>[number];

type EncoderChildLike = ChildNode & {
	getSrc?(): string;
	getPackageId?(): string;
	getX?(): number;
	getY?(): number;
	getWidth?(): number;
	getHeight?(): number;
	getColor?(): string;
	getPivotX?(): number;
	getPivotY?(): number;
	getPivotAsAnchor?(): boolean;
	getScaleX?(): number;
	getScaleY?(): number;
	getSkewX?(): number;
	getSkewY?(): number;
	getAlpha?(): number;
	getRotation?(): number;
	getVisible?(): boolean;
	getTouchable?(): boolean;
	getGrayed?(): boolean;
	getBlendMode?(): number;
	getFlip?(): number;
	getFillMethod?(): number;
	getFillOrigin?(): number;
	getFillClockwise?(): boolean;
	getFillAmount?(): number;
	getFont?(): string | null;
	getFontSize?(): number;
	getAlign?(): number;
	getVAlign?(): number;
	getLeading?(): number;
	getLetterSpacing?(): number;
	getUbbEnabled?(): boolean;
	getAutoSize?(): boolean | number;
	getUnderline?(): boolean;
	getItalic?(): boolean;
	getBold?(): boolean;
	getStrikethrough?(): boolean;
	getSingleLine?(): boolean;
	getStrokeColor?(): string | null;
	getStrokeSize?(): number;
	getShadowColor?(): string | null;
	getShadowOffsetX?(): number;
	getShadowOffsetY?(): number;
	getGraphType?(): number;
	getLineSize?(): number;
	getLineColor?(): string;
	getFillColor?(): string;
	getCornerRadius?(): [number, number, number, number] | null;
	getPoints?(): number[] | null;
	getSides?(): number;
	getStartAngle?(): number;
	getDistances?(): number[] | null;
	getLayout?(): number;
	getLineGap?(): number;
	getColumnGap?(): number;
	getExcludeInvisibles?(): boolean;
	getAutoSizeDisabled?(): boolean;
	getMainGridIndex?(): number;
	getUrl?(): string;
	getFill?(): number;
	getShrinkOnly?(): boolean;
	getPlaying?(): boolean;
	getFrame?(): number;
	getUseResize?(): boolean;
	getAnimationName?(): string;
	getSkinName?(): string;
	getLoop?(): boolean;
	getSelectionMode?(): number;
	getLineCount?(): number;
	getColumnCount?(): number;
	getAutoResizeItem?(): boolean;
	getChildrenRenderOrder?(): number;
	getApexIndex?(): number;
	getGroup?(): string;
	getAdvanced?(): boolean;
	getMargin?(): EdgeInsetsLike | [number, number, number, number];
	getClipSoftness?(): XYLike;
	getOverflow?(): number;
	getScrollItemToViewOnClick?(): boolean;
	getFoldInvisibleItems?(): boolean;
	getText?(): string;
	getTitle?(): string;
	getSelectedTitle?(): string;
	getIcon?(): string;
	getSelectedIcon?(): string;
	getTitleColor?(): string;
	getTitleFontSize?(): number;
	getSound?(): string;
	getSoundVolumeScale?(): number;
	getSelected?(): boolean;
	getItems?(): Array<string | null>;
	getValues?(): Array<string | null>;
	getIcons?(): Array<string | null>;
	getVisibleItemCount?(): number;
	getPopupDirection?(): number;
	getValue?(): number;
	getMax?(): number;
	getMin?(): number;
	getDefaultItem?(): string;
	getListItems?(): ListItemLike[];
	getIndent?(): number;
	getClickToExpand?(): number;
	getPromptText?(): string;
	getPrompt?(): string;
	getRestrict?(): string;
	getMaxLength?(): number;
	getKeyboardType?(): number;
	getPassword?(): boolean;
	getScrollType?(): number;
	getScrollBarFlags?(): number;
	getScrollBarMargin?(): EdgeInsetsLike | null;
	getVtScrollBarRes?(): string;
	getHzScrollBarRes?(): string;
	getHeaderRes?(): string;
	getFooterRes?(): string;
	getPageController?(): string;
	getControllerOverrides?(): string;
	getInstanceExtType?(): string;
	getInstanceTitle?(): string;
	getInstanceSelectedTitle?(): string;
	getInstanceIcon?(): string;
	getInstanceSelectedIcon?(): string;
	getInstanceTitleColor?(): string;
	getInstanceTitleFontSize?(): number;
	getInstanceController?(): string;
	getInstancePage?(): string;
	getInstanceChecked?(): boolean;
	getInstanceSound?(): string;
	getInstanceSoundVolumeScale?(): number;
	getInstanceVisibleItemCount?(): number;
	getInstanceValue?(): number;
	getInstanceMax?(): number;
	getInstanceMin?(): number;
	getInstanceComboItems?(): ComboItemLike[];
	getSelectionController?(): string;
	getCustomData?(): string;
	getTooltips?(): string;
};

function getRuntimeChildren(comp: Component): EncoderChildLike[] {
	return comp
		.listChildren()
		.filter((child) => {
			const typedChild = child as EncoderChildLike;
			return typedChild.propertyType !== 'GGroup' || typedChild.getAdvanced?.() === true;
		}) as EncoderChildLike[];
}

function getRuntimeChildIndexMap(comp: Component): Map<string, number> {
	const children = getRuntimeChildren(comp);
	const map = new Map<string, number>();
	for (let i = 0; i < children.length; i++) {
		const id = children[i].getId?.();
		if (id) map.set(id, i);
	}
	return map;
}

interface XYLike {
	x?: number;
	y?: number;
}

interface EdgeInsetsLike {
	top?: number;
	bottom?: number;
	left?: number;
	right?: number;
}

type MarginLike = [number, number, number, number] | EdgeInsetsLike;

interface ComboItemLike {
	title?: string | null;
	value?: string | null;
	icon?: string | null;
}

interface ListItemLike {
	url?: string | null;
	title?: string | null;
	selectedTitle?: string | null;
	icon?: string | null;
	selectedIcon?: string | null;
	name?: string | null;
	level?: number;
	isFolder?: boolean | null;
}

interface ChildEncoderExtras extends Record<string, unknown> {
	_clipSoftness?: XYLike;
	controller?: string;
	page?: string;
	sound?: string;
	volume?: string | number;
	checked?: string | boolean;
	scrollBarDisplay?: number;
}

interface PackagePublishExtras extends Record<string, unknown> {
	publishedEffectiveResourceIds?: Record<string, string>;
}

interface RelationOwner {
	getRelations?(): RelationDef[];
}

function getChildExtras(child: { getExtras?(): Record<string, unknown> }): ChildEncoderExtras {
	return (child.getExtras?.() as ChildEncoderExtras | undefined) ?? {};
}

function getPublishedResourceIdMap(pkg: Package): Record<string, string> {
	return ((pkg.getExtras?.() as PackagePublishExtras | undefined) ?? {}).publishedEffectiveResourceIds ?? {};
}

function remapLocalResourceId(pkg: Package, value: string | null | undefined): string | null {
	if (!value) return null;
	return getPublishedResourceIdMap(pkg)[value] ?? value;
}

function resolveChildResourceRef(
	pkg: Package,
	child: Pick<EncoderChildLike, 'getSrc' | 'getPackageId'>,
): { src: string | null; packageId: string | null } {
	const src = child.getSrc?.() ?? null;
	const packageId = child.getPackageId?.() ?? '';
	if (!packageId || packageId === pkg.getId()) {
		return {
			src: remapLocalResourceId(pkg, src),
			packageId: null,
		};
	}
	return {
		src,
		packageId,
	};
}

function remapLocalUiUrl(pkg: Package, value: string | null | undefined): string | null {
	if (!value || !value.startsWith('ui://')) return value ?? null;
	const pkgId = pkg.getId();
	const raw = value.slice(5);
	if (raw.startsWith(`${pkgId}/`)) return value;
	if (!raw.startsWith(pkgId) || raw.length <= pkgId.length) return value;
	const resourceId = raw.slice(pkgId.length);
	const mappedResourceId = remapLocalResourceId(pkg, resourceId);
	if (!mappedResourceId) return value;
	return `ui://${pkgId}${mappedResourceId}`;
}

function remapLocalUiRefsInText(pkg: Package, value: string | null | undefined): string | null {
	if (!value) return value ?? null;
	const pkgId = pkg.getId();
	return value.replace(new RegExp(`ui://${pkgId}([0-9a-z]+)`, 'gi'), (_match, resourceId: string) => {
		const mapped = remapLocalResourceId(pkg, resourceId);
		return `ui://${pkgId}${mapped ?? resourceId}`;
	});
}

/** Safely extract a string value — handles arrays returned by property-graph getters. */
function _strVal(v: unknown): string | null {
	if (v === null || v === undefined) return null;
	if (Array.isArray(v)) return v[0] ?? null;
	return String(v);
}

function _numVal(v: unknown, fallback = 0): number {
	if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
	if (typeof v === 'boolean') return v ? 1 : 0;
	if (typeof v === 'string') {
		const parsed = Number(v);
		return Number.isFinite(parsed) ? parsed : fallback;
	}
	return fallback;
}

function _numberToken(value: string | undefined, fallback: number): number {
	if (value === undefined || value.trim() === '') return fallback;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function _boolVal(v: unknown, fallback = false): boolean {
	if (typeof v === 'boolean') return v;
	if (typeof v === 'number') return v !== 0;
	if (typeof v === 'string') {
		const normalized = v.trim().toLowerCase();
		if (normalized === 'true' || normalized === '1') return true;
		if (normalized === 'false' || normalized === '0' || normalized === '') return false;
	}
	return fallback;
}

/**
 * Encode a Component into binary format compatible with FairyGUI runtime.
 *
 * @param comp - Component property node
 * @param doc - Parent document
 * @param pkg - Parent package
 * @param parentBuf - Parent WriteBuffer (shares string table for writeS calls)
 * @returns Uint8Array of the encoded component data
 */
export function encodeComponent(
	comp: Component,
	doc: Document,
	pkg: Package,
	version = 2,
	parentBuf?: WriteBuffer,
): Uint8Array {
	const buf = parentBuf ? new WriteBuffer(4096, parentBuf) : new WriteBuffer(4096);

	// Write index table header: 8 blocks, uint32 offsets (matches editor format)
	const indexTablePos = buf.pos;
	buf.writeUint8(BLOCK_COUNT);
	buf.writeUint8(0); // useShort = false (uint32 offsets, matches editor)

	// Reserve space for 8 x uint32 offsets
	const offsetsPos = buf.pos;
	for (let i = 0; i < BLOCK_COUNT; i++) buf.writeUint32(0);

	// --- Block 0: Component header ---
	const block0Offset = buf.pos - indexTablePos;
	_writeComponentHeader(buf, comp);

	// --- Block 1: Controllers ---
	const block1Offset = buf.pos - indexTablePos;
	_writeControllers(buf, comp);

	// --- Block 2: Display list ---
	const block2Offset = buf.pos - indexTablePos;
	_writeDisplayList(buf, comp, doc, pkg, version);

	// --- Block 3: Component-level relations ---
	const block3Offset = buf.pos - indexTablePos;
	_writeComponentRelations(buf, comp);

	// --- Block 4: Advanced properties ---
	const block4Offset = buf.pos - indexTablePos;
	_writeAdvancedProps(buf, comp, version);

	// --- Block 5: Transitions ---
	const block5Offset = buf.pos - indexTablePos;
	_writeTransitions(buf, comp, version);

	// --- Block 6: Extension definition (Button/Label/ComboBox/etc.) ---
	const block6Start = buf.pos;
	_writeExtensionDef(buf, comp, pkg, version);
	const block6Offset = buf.pos > block6Start ? block6Start - indexTablePos : 0;

	// Block 7: ScrollPane (when component has overflow=scroll)
	let block7Offset = 0;
	const compOverflow = comp.getOverflow?.() ?? 0;
	if (compOverflow === 2) { // scroll
		block7Offset = buf.pos - indexTablePos;
		_writeComponentScrollPane(buf, comp, pkg);
	}

	// Patch offsets (uint32)
	const savedPos = buf.pos;
	buf.pos = offsetsPos;
	buf.writeUint32(block0Offset);
	buf.writeUint32(block1Offset);
	buf.writeUint32(block2Offset);
	buf.writeUint32(block3Offset);
	buf.writeUint32(block4Offset);
	buf.writeUint32(block5Offset);
	buf.writeUint32(block6Offset);
	buf.writeUint32(block7Offset);
	buf.pos = savedPos;

	return buf.toUint8Array();
}

// ─── Block 0: Component header ───────────────────────────────────────────

function _writeComponentHeader(buf: WriteBuffer, comp: Component): void {
	const w = comp.getWidth?.() ?? 0;
	const h = comp.getHeight?.() ?? 0;
	buf.writeInt32(w);  // sourceWidth
	buf.writeInt32(h);  // sourceHeight

	// Restrict size
	const minW = comp.getMinWidth?.() ?? 0;
	const maxW = comp.getMaxWidth?.() ?? 0;
	const minH = comp.getMinHeight?.() ?? 0;
	const maxH = comp.getMaxHeight?.() ?? 0;
	const hasRestrict = minW > 0 || maxW > 0 || minH > 0 || maxH > 0;
	buf.writeBool(hasRestrict);
	if (hasRestrict) {
		buf.writeInt32(minW);
		buf.writeInt32(maxW);
		buf.writeInt32(minH);
		buf.writeInt32(maxH);
	}

	// Pivot
	const pivotX = comp.getPivotX?.() ?? 0;
	const pivotY = comp.getPivotY?.() ?? 0;
	const hasPivot = pivotX !== 0 || pivotY !== 0;
	buf.writeBool(hasPivot);
	if (hasPivot) {
		buf.writeFloat32(pivotX);
		buf.writeFloat32(pivotY);
		buf.writeBool(comp.getPivotAsAnchor?.() ?? false);
	}

	// Margin — only write if component has an explicitly set margin
	// The margin is stored as [top, bottom, left, right] array in the property graph
	// or as {top, bottom, left, right} from the getter result.
	// Check if any value is non-zero to determine if margin was explicitly set.
	const margin = (comp.getMargin?.() ?? null) as MarginLike | null;
	let hasMargin = false;
	if (margin) {
		if (Array.isArray(margin)) {
			hasMargin = margin.some((v: number) => v !== 0);
		} else {
			hasMargin = !!(margin.top || margin.bottom || margin.left || margin.right);
		}
	}
	buf.writeBool(hasMargin);
	if (hasMargin) {
		const resolvedMargin = margin!;
		if (Array.isArray(resolvedMargin)) {
			buf.writeInt32(resolvedMargin[0] ?? 0);
			buf.writeInt32(resolvedMargin[1] ?? 0);
			buf.writeInt32(resolvedMargin[2] ?? 0);
			buf.writeInt32(resolvedMargin[3] ?? 0);
		} else {
			buf.writeInt32(resolvedMargin.top ?? 0);
			buf.writeInt32(resolvedMargin.bottom ?? 0);
			buf.writeInt32(resolvedMargin.left ?? 0);
			buf.writeInt32(resolvedMargin.right ?? 0);
		}
	}

	// Overflow
	buf.writeUint8(comp.getOverflow?.() ?? 0);

	// ClipSoftness
	const clipSoft = comp.getClipSoftness?.();
	const hasClipSoftness = !!clipSoft && !!((clipSoft.x ?? 0) || (clipSoft.y ?? 0));
	if (hasClipSoftness) {
		buf.writeBool(true);
		buf.writeInt32(clipSoft.x ?? 0);
		buf.writeInt32(clipSoft.y ?? 0);
	} else {
		buf.writeBool(false);
	}
}

// ─── Block 1: Controllers ────────────────────────────────────────────────

function _writeControllers(buf: WriteBuffer, comp: Component): void {
	const controllers = comp.listControllers();
	buf.writeInt16(controllers.length);

	for (const ctrl of controllers) {
		const ctrlStartPos = buf.pos;
		buf.writeInt16(0); // placeholder for nextPos offset

		// Controller has its own index table (3 blocks)
		const ctrlIndexPos = buf.pos;
		buf.writeUint8(3);
		buf.writeUint8(1); // useShort
		const ctrlOffsetsPos = buf.pos;
		buf.writeUint16(0); buf.writeUint16(0); buf.writeUint16(0);

		// Controller Block 0: name
		const cb0 = buf.pos - ctrlIndexPos;
		buf.writeS(ctrl.getName?.() ?? '');
		buf.writeBool(ctrl.getAutoRadioGroupDepth?.() ?? false);

		// Controller Block 1: pages
		const cb1 = buf.pos - ctrlIndexPos;
		const pages = ctrl.listPages?.() ?? [];
		buf.writeInt16(pages.length);
		for (const page of pages) {
			buf.writeSEx(page.getId?.() ?? '', false, false); // cache, empty≠null
			buf.writeSEx(page.getName?.() ?? '', false, false); // cache, empty≠null
		}
		// v2: homePageType
		buf.writeUint8(0); // default

		// Controller Block 2: actions
		const cb2 = buf.pos - ctrlIndexPos;
		const actions = ctrl.listActions?.() ?? [];
		buf.writeInt16(actions.length);
		for (const action of actions) {
			const actionStart = buf.pos;
			buf.writeInt16(0); // placeholder
			const actionType = action.getActionType?.() ?? 0;
			buf.writeUint8(actionType);
			const fromPage = action.getFromPage?.() ?? [];
			buf.writeInt16(fromPage.length);
			for (const pageId of fromPage) {
				buf.writeS(pageId);
			}
			const toPage = action.getToPage?.() ?? [];
			buf.writeInt16(toPage.length);
			for (const pageId of toPage) {
				buf.writeS(pageId);
			}
			switch (actionType) {
				case ControllerActionType.PlayTransition:
					buf.writeS(action.getTransitionName?.() ?? '');
					buf.writeInt32(action.getPlayTimes?.() ?? 1);
					buf.writeFloat32(action.getDelay?.() ?? 0);
					buf.writeBool(action.getStopOnExit?.() ?? false);
					break;
				case ControllerActionType.ChangePage:
					buf.writeS(action.getObjectId?.() ?? '');
					buf.writeS(action.getControllerName?.() ?? '');
					buf.writeS(action.getTargetPage?.() ?? '');
					break;
				default:
					break;
			}
			const actionEnd = buf.pos;
			const saved = buf.pos;
			buf.pos = actionStart;
			buf.writeInt16(actionEnd - actionStart - 2);
			buf.pos = saved;
		}

		// Patch controller block offsets
		const ctrlSaved = buf.pos;
		buf.pos = ctrlOffsetsPos;
		buf.writeUint16(cb0); buf.writeUint16(cb1); buf.writeUint16(cb2);
		buf.pos = ctrlSaved;

		// Patch controller nextPos
		const ctrlEnd = buf.pos;
		buf.pos = ctrlStartPos;
		buf.writeInt16(ctrlEnd - ctrlStartPos - 2);
		buf.pos = ctrlEnd;
	}
}

// ─── Block 2: Display list ───────────────────────────────────────────────

/** Map property type to GObject type index used in binary format. */
const OBJECT_TYPE_MAP: Record<string, number> = {
	GImage: 0,
	GMovieClip: 1,
	GGraph: 3,
	GLoader: 4,
	GGroup: 5,
	GTextField: 6,
	GRichTextField: 7,
	GTextInput: 8,
	GComponent: 9,
	GList: 10,
	GLabel: 11,
	GButton: 12,
	GComboBox: 13,
	GProgressBar: 14,
	GSlider: 15,
	GScrollBar: 16,
	GTree: 17,
	GLoader3D: 18,
};

function _resolveChildObjectType(child: EncoderChildLike): number {
	return OBJECT_TYPE_MAP[child.propertyType as string] ?? 2;
}

function _writeDisplayList(buf: WriteBuffer, comp: Component, _doc: Document, pkg: Package, version: number): void {
	const children = getRuntimeChildren(comp);
	const childIndexMap = getRuntimeChildIndexMap(comp);
	buf.writeInt16(children.length);

	for (const rawChild of children) {
		const child = rawChild as EncoderChildLike;
		const childStartPos = buf.pos;
		buf.writeInt16(0); // placeholder for dataLen

		// Child has its own index table
		const childType = child.propertyType as string;
		const objType = _resolveChildObjectType(child);
		const isTree = childType === 'GTree' || objType === ObjectType.Tree;
		const isListLike = childType === 'GList' || childType === 'GTree';
		// GList needs up to 9 blocks; tree needs 10; others need 7
		const CHILD_BLOCKS = isListLike ? (isTree ? 10 : 9) : 7;
		const childIndexPos = buf.pos;
		buf.writeUint8(CHILD_BLOCKS);
		buf.writeUint8(1);
		const childOffsetsPos = buf.pos;
		for (let i = 0; i < CHILD_BLOCKS; i++) buf.writeUint16(0);

		// --- Child Block 0: beforeAdd ---
		const cb0 = buf.pos - childIndexPos;
		const resourceRef = resolveChildResourceRef(pkg, child);
		buf.writeUint8(objType);
		buf.writeS(resourceRef.src);
		buf.writeS(resourceRef.packageId);

		buf.writeS(child.getId?.() ?? '');
		buf.writeS(child.getName?.() ?? '');

		const x = child.getX?.() ?? 0;
		const y = child.getY?.() ?? 0;
		buf.writeInt32(x);
		buf.writeInt32(y);

		// Size
		const w = child.getWidth?.() ?? 0;
		const h = child.getHeight?.() ?? 0;
		const hasSize = w > 0 || h > 0;
		buf.writeBool(hasSize);
		if (hasSize) {
			buf.writeInt32(w);
			buf.writeInt32(h);
		}

		// Restrict size
		buf.writeBool(false); // hasRestrictSize

		// Scale
		const sx = child.getScaleX?.() ?? 1;
		const sy = child.getScaleY?.() ?? 1;
		const hasScale = sx !== 1 || sy !== 1;
		buf.writeBool(hasScale);
		if (hasScale) {
			buf.writeFloat32(sx);
			buf.writeFloat32(sy);
		}

		// Skew
		const skewX = child.getSkewX?.() ?? 0;
		const skewY = child.getSkewY?.() ?? 0;
		const hasSkew = skewX !== 0 || skewY !== 0;
		buf.writeBool(hasSkew);
		if (hasSkew) {
			buf.writeFloat32(skewX);
			buf.writeFloat32(skewY);
		}

		// Pivot
		const px = child.getPivotX?.() ?? 0;
		const py = child.getPivotY?.() ?? 0;
		const hasPivot = px !== 0 || py !== 0;
		buf.writeBool(hasPivot);
		if (hasPivot) {
			buf.writeFloat32(px);
			buf.writeFloat32(py);
			buf.writeBool(child.getPivotAsAnchor?.() ?? false);
		}

		// Alpha, rotation, visible, touchable, grayed
		buf.writeFloat32(child.getAlpha?.() ?? 1);
		buf.writeFloat32(child.getRotation?.() ?? 0);
		buf.writeBool(child.getVisible?.() ?? true);
		buf.writeBool(child.getTouchable?.() ?? true);
		buf.writeBool(child.getGrayed?.() ?? false);

		// BlendMode
		buf.writeUint8(child.getBlendMode?.() ?? 0);

		// Filter
		buf.writeUint8(0); // no filter

		// CustomData — editor writes with noCache=true
		buf.writeSEx(child.getCustomData?.() ?? null, true);

		// --- Child Block 1: afterAdd ---
		const cb1 = buf.pos - childIndexPos;
		buf.writeSEx(child.getTooltips?.() ?? null, true); // tooltips — noCache
		const groupId = child.getGroup?.() ? (childIndexMap.get(child.getGroup?.() ?? '') ?? -1) : -1;
		buf.writeInt16(groupId);

		// --- Child Block 2: gears ---
		const cb2 = buf.pos - childIndexPos;
		const gears = child.listGears?.() ?? [];
		buf.writeInt16(gears.length);
		for (const gear of gears) {
			const gearStart = buf.pos;
			buf.writeInt16(0); // placeholder for nextPos

			const gearType = gear.getGearType?.() ?? 0;
			buf.writeUint8(gearType);
			_writeGear(buf, gear, gearType, comp, version);

			const gearEnd = buf.pos;
			const saved = buf.pos;
			buf.pos = gearStart;
			buf.writeInt16(gearEnd - gearStart - 2);
			buf.pos = saved;
		}

		// --- Child Block 3: relations ---
		const cb3 = buf.pos - childIndexPos;
		_writeRelations(buf, child, _createChildIndexMap(comp));

		// --- Child Block 4: page controller (for GComponent/GList children only) ---
		let cb4 = 0;
		const isCompOrList = childType === 'GComponent' || childType === 'GList' || childType === 'GTree' ||
			childType === 'GButton' || childType === 'GLabel' ||
			childType === 'GComboBox' || childType === 'GProgressBar' ||
			childType === 'GSlider' || childType === 'GScrollBar';
		const isTextInput = childType === 'GTextInput';
		if (isCompOrList) {
			cb4 = buf.pos - childIndexPos;
			_writeChildBlock4Component(buf, child, comp, pkg);
		} else if (isTextInput) {
			cb4 = buf.pos - childIndexPos;
			_writeChildBlock4TextInput(buf, child);
		}
		// For other types (GImage, GGraph, GGroup, GMovieClip, GTextField, GRichTextField),
		// block 4 offset stays 0 (editor does not set it)

		// --- Child Block 5: child-type-specific extension ---
		const cb5 = buf.pos - childIndexPos;
		_writeChildSpecific(buf, child, pkg, version);

		// --- Child Block 6: afterAdd text/icon (for GTextField, GButton, etc.) ---
		const cb6 = buf.pos - childIndexPos;
			_writeChildAfterAdd(buf, child, comp, pkg, version);

		// --- GList extra blocks ---
		let cb7 = 0, cb8 = 0, cb9 = 0;
		if (isListLike) {
			// Block 7: scroll pane (when overflow=scroll)
			const overflow = child.getOverflow?.() ?? 0;
			if (overflow === 2) { // Scroll
				cb7 = buf.pos - childIndexPos;
				_writeScrollPane(buf, child, pkg);
			}

			// Block 8: static list items
			cb8 = buf.pos - childIndexPos;
			_writeListItems(buf, child, pkg, version);

			if (isTree) {
				cb9 = buf.pos - childIndexPos;
				_writeTreeSettings(buf, child);
			}
		}

		// Patch child block offsets
		const childSaved = buf.pos;
		buf.pos = childOffsetsPos;
		buf.writeUint16(cb0); buf.writeUint16(cb1); buf.writeUint16(cb2);
		buf.writeUint16(cb3); buf.writeUint16(cb4); buf.writeUint16(cb5);
		buf.writeUint16(cb6);
		if (isListLike) {
			buf.writeUint16(cb7); buf.writeUint16(cb8);
			if (isTree) buf.writeUint16(cb9);
		}
		buf.pos = childSaved;

		// Patch dataLen
		const childEnd = buf.pos;
		buf.pos = childStartPos;
		buf.writeInt16(childEnd - childStartPos - 2);
		buf.pos = childEnd;
	}
}

// ─── Block 3: Component relations ────────────────────────────────────────

function _writeComponentRelations(buf: WriteBuffer, comp: Component): void {
	_writeRelations(buf, comp as RelationOwner, _createChildIndexMap(comp));
}

function _writeRelations(
	buf: WriteBuffer,
	obj: RelationOwner,
	childIndexById?: ReadonlyMap<string, number>,
): void {
	const relationDefs: Array<{ target: string; type: number; usePercent: boolean }>
		= obj.getRelations?.() ?? [];

	// Group by target
	const grouped = new Map<string, Array<{ type: number; usePercent: boolean }>>();
	for (const rel of relationDefs) {
		const key = rel.target ?? '';
		if (!grouped.has(key)) grouped.set(key, []);
		grouped.get(key)!.push({ type: rel.type, usePercent: rel.usePercent });
	}

	buf.writeUint8(grouped.size);
	for (const [target, pairs] of grouped) {
		const targetIdx = _resolveRelationTargetIndex(target, childIndexById);
		buf.writeInt16(targetIdx);
		buf.writeUint8(pairs.length);
		for (const sp of pairs) {
			buf.writeUint8(sp.type);
			buf.writeBool(sp.usePercent);
		}
	}
}

function _createChildIndexMap(comp: Component): Map<string, number> {
	const childIndexById = new Map<string, number>();
	const children = comp.listChildren();
	for (const [index, child] of children.entries()) {
		const childId = child.getId?.();
		if (childId) childIndexById.set(childId, index);
	}
	return childIndexById;
}

function _resolveRelationTargetIndex(
	target: string,
	childIndexById?: ReadonlyMap<string, number>,
): number {
	if (!target) return -1;
	const mappedIndex = childIndexById?.get(target);
	if (mappedIndex !== undefined) return mappedIndex;
	const numericIndex = Number.parseInt(target, 10);
	return Number.isNaN(numericIndex) ? -1 : numericIndex;
}

// ─── Block 4: Advanced properties ────────────────────────────────────────

function _writeAdvancedProps(buf: WriteBuffer, comp: Component, version: number): void {
	// customData — noCache
	buf.writeSEx(comp.getCustomData?.() ?? null, true);
	buf.writeBool(comp.getOpaque?.() ?? true); // opaque
	// mask
	const maskId = comp.getMask?.();
	if (maskId !== undefined && maskId !== null) {
		// Need to resolve mask ID to display list index
		const children = getRuntimeChildren(comp);
		const maskIdx = children.findIndex((c) => c.getId() === maskId);
		if (maskIdx >= 0) {
			buf.writeInt16(maskIdx);
			buf.writeBool(comp.getReversedMask?.() ?? false);
		} else {
			buf.writeInt16(-1);
		}
	} else {
		buf.writeInt16(-1); // maskId (-1 = no mask)
	}
	// hitTest
	const hitTest = comp.getHitTest?.();
	if (hitTest) {
		const parts = hitTest.split(',');
		if (parts.length === 1) {
			buf.writeS(null);
			buf.writeInt32(1);
			const children = getRuntimeChildren(comp);
			const htIdx = children.findIndex((c) => c.getId() === parts[0]);
			buf.writeInt32(htIdx >= 0 ? htIdx : -1);
		} else {
			buf.writeS(parts[0]);
			buf.writeInt32(parseInt(parts[1], 10) || 0);
			buf.writeInt32(parseInt(parts[2], 10) || 0);
		}
	} else {
		buf.writeS(null); // hitTestId
		buf.writeInt32(0); // i1
		buf.writeInt32(0); // i2
	}
	if (version >= 5) {
		buf.writeS(comp.getAddedToStageSound?.() ?? null);
		buf.writeS(comp.getRemovedFromStageSound?.() ?? null);
	}
}

// ─── Block 6: Extension definition ───────────────────────────────────────

function _writeExtensionDef(buf: WriteBuffer, comp: Component, pkg: Package, _version: number): void {
	const extType = comp.getExtensionType?.() ?? '';
	if (!extType) return;

	switch (extType) {
		case 'Button': {
			buf.writeUint8(comp.getButtonMode?.() ?? 0); // mode
			buf.writeS(remapLocalUiUrl(pkg, comp.getSound?.() ?? null)); // sound
			buf.writeFloat32(comp.getSoundVolumeScale?.() ?? 1); // soundVolumeScale
			buf.writeUint8(comp.getDownEffect?.() ?? 0); // downEffect
			buf.writeFloat32(comp.getDownEffectValue?.() ?? 0.8); // downEffectValue
			break;
		}
		case 'Label':
			// No definition data
			break;
		case 'ComboBox': {
			buf.writeS(remapLocalUiUrl(pkg, comp.getDropdown?.() ?? null)); // dropdown resource URL
			break;
		}
		case 'ProgressBar': {
			buf.writeUint8(comp.getTitleType?.() ?? 0); // titleType
			buf.writeBool(comp.getReverse?.() ?? false); // reverse
			break;
		}
		case 'Slider': {
			buf.writeUint8(comp.getTitleType?.() ?? 0); // titleType
			buf.writeBool(comp.getReverse?.() ?? false); // reverse
			// v2
			buf.writeBool(comp.getWholeNumbers?.() ?? false);
			buf.writeBool(comp.getChangeOnClick?.() ?? true);
			break;
		}
		case 'ScrollBar': {
			buf.writeBool(comp.getFixedGripSize?.() ?? false);
			break;
		}
		default:
			break;
	}
}

// ─── Block 5: Transitions ───────────────────────────────────────────────

function _writeTransitions(buf: WriteBuffer, comp: Component, version: number): void {
	const transitions = comp.listTransitions();
	buf.writeInt16(transitions.length);

	for (const trans of transitions) {
		const fps = trans.getFps?.() ?? 24;
		const secondsPerFrame = fps > 0 ? 1 / fps : 1 / 24;
		const transStartPos = buf.pos;
		buf.writeInt16(0); // placeholder

		buf.writeS(trans.getName?.() ?? '');
		buf.writeInt32(trans.getOptions?.() ?? 0);
		buf.writeBool(trans.getAutoPlay?.() ?? false);
		buf.writeInt32(trans.getAutoPlayTimes?.() ?? 1);
		buf.writeFloat32(trans.getAutoPlayDelay?.() ?? 0);

		// Build displayList ID→index map for target resolution
		const displayList: Record<string, number> = {};
		const children = getRuntimeChildren(comp);
		for (let ci = 0; ci < children.length; ci++) {
			const childId = children[ci].getId();
			if (childId) displayList[childId] = ci;
		}

		const items = (trans.listItems?.() ?? []).filter((item) => {
			const targetId = item.getTargetId?.() ?? '';
			return !targetId || displayList[targetId] !== undefined;
		});
		buf.writeInt16(items.length);

		for (const item of items) {
			const itemStartPos = buf.pos;
			buf.writeInt16(0); // placeholder for dataLen

			// Transition item has its own index table
			const itemIndexPos = buf.pos;
			const hasTween = item.getTween?.() ?? false;
			const blockCount = 4;
			buf.writeUint8(blockCount);
			buf.writeUint8(1);
			const itemOffsetsPos = buf.pos;
			for (let i = 0; i < blockCount; i++) buf.writeUint16(0);

			// Item Block 0: header
			const ib0 = buf.pos - itemIndexPos;
			buf.writeUint8(item.getActionType?.() ?? 0);
			buf.writeFloat32((item.getTime?.() ?? 0) * secondsPerFrame);
			// Resolve target ID to display list index
			const targetStr = item.getTargetId?.() ?? '';
			const targetIdx = targetStr ? (displayList[targetStr] ?? -1) : -1;
			buf.writeInt16(targetIdx);
			buf.writeSEx(item.getLabel?.() ?? null);
			buf.writeBool(hasTween);

			if (hasTween) {
				// Item Block 1: tween params
				const ib1 = buf.pos - itemIndexPos;
				buf.writeFloat32((item.getDuration?.() ?? 0) * secondsPerFrame);
				buf.writeUint8(item.getEaseType?.() ?? 5); // QuadOut default
				buf.writeInt32(item.getRepeat?.() ?? 1);
				buf.writeBool(item.getYoyo?.() ?? false);
				buf.writeSEx(item.getEndLabel?.() ?? null);

				// Item Block 2: start value
				const ib2 = buf.pos - itemIndexPos;
				_writeTransitionValue(buf, item, item.getStartValue?.(), version);

				// Item Block 3: end value
				const ib3 = buf.pos - itemIndexPos;
				_writeTransitionValue(buf, item, item.getEndValue?.(), version);
				if (version >= 2) {
					_writePathData(buf, item.getPath?.() ?? null);
				}
				if (version >= 4 && (item.getEaseType?.() ?? 5) === 31) {
					_writePathData(buf, item.getCustomEasePath?.() ?? null);
				}

				// Patch item offsets
				const itemSaved = buf.pos;
				buf.pos = itemOffsetsPos;
				buf.writeUint16(ib0); buf.writeUint16(ib1);
				buf.writeUint16(ib2); buf.writeUint16(ib3);
				buf.pos = itemSaved;
			} else {
				// Editor export still reserves 4 offset slots for non-tween items.
				const ib1 = 0;
				const ib2 = buf.pos - itemIndexPos;
				_writeTransitionValue(buf, item, item.getStartValue?.(), version);
				const ib3 = 0;

				const itemSaved = buf.pos;
				buf.pos = itemOffsetsPos;
				buf.writeUint16(ib0); buf.writeUint16(ib1); buf.writeUint16(ib2); buf.writeUint16(ib3);
				buf.pos = itemSaved;
			}

			// Patch item dataLen
			const itemEnd = buf.pos;
			buf.pos = itemStartPos;
			buf.writeInt16(itemEnd - itemStartPos - 2);
			buf.pos = itemEnd;
		}

		// Patch transition nextPos
		const transEnd = buf.pos;
		buf.pos = transStartPos;
		buf.writeInt16(transEnd - transStartPos - 2);
		buf.pos = transEnd;
	}
}

/**
 * Write transition path/curve data.
 * Format: int32 count, then per-point: byte curveType + floats
 */
function _writePathData(buf: WriteBuffer, path: unknown): void {
	if (!path || (typeof path === 'string' && path.length === 0)) {
		buf.writeInt32(0);
		return;
	}

	const pathStr = Array.isArray(path) ? path.join(',') : String(path);
	if (!pathStr) {
		buf.writeInt32(0);
		return;
	}

	const parts = pathStr.split(',');
	const countPos = buf.pos;
	buf.writeInt32(0); // placeholder for point count
	let count = 0;
	let i = 0;
	while (i < parts.length) {
		count++;
		const curveType = parseInt(parts[i++], 10) || 0;
		buf.writeUint8(curveType);
		switch (curveType) {
			case 1: // Bezier: 4 floats
				buf.writeFloat32(parseFloat(parts[i++]) || 0);
				buf.writeFloat32(parseFloat(parts[i++]) || 0);
				buf.writeFloat32(parseFloat(parts[i++]) || 0);
				buf.writeFloat32(parseFloat(parts[i++]) || 0);
				break;
			case 2: // CubicBezier: 6 floats + skip 1
				buf.writeFloat32(parseFloat(parts[i++]) || 0);
				buf.writeFloat32(parseFloat(parts[i++]) || 0);
				buf.writeFloat32(parseFloat(parts[i++]) || 0);
				buf.writeFloat32(parseFloat(parts[i++]) || 0);
				buf.writeFloat32(parseFloat(parts[i++]) || 0);
				buf.writeFloat32(parseFloat(parts[i++]) || 0);
				i++; // skip one value
				break;
			default: // Linear or other: 2 floats
				buf.writeFloat32(parseFloat(parts[i++]) || 0);
				buf.writeFloat32(parseFloat(parts[i++]) || 0);
				break;
		}
	}
	// Patch count
	const saved = buf.pos;
	buf.pos = countPos;
	buf.writeInt32(count);
	buf.pos = saved;
}

function _writeTransitionValue(buf: WriteBuffer, item: TransitionItemNode, value: unknown, version: number): void {
	// Value can be: string array ['10','20'], comma-separated string, or object
	const type = item.getActionType?.() ?? 0;
	const parts: string[] = !value ? [] :
		Array.isArray(value) ? value.map(String) :
		typeof value === 'string' ? value.split(',') : [];

	const ACTION_TYPE_NAMES = ['XY','Size','Scale','Pivot','Alpha','Rotation','Color','Animation','Visible','Sound','Transition','Shake','ColorFilter','Skew','Text','Icon'];
	const typeName = ACTION_TYPE_NAMES[type] ?? 'XY';

	switch (typeName) {
		case 'XY': {
			const b1 = parts[0] !== '-' && parts[0] !== undefined;
			const b2 = parts.length > 1 && parts[1] !== '-';
			const hasPercent = parts.length > 2;
			buf.writeBool(b1);
			buf.writeBool(b2);
			if (hasPercent) {
				buf.writeFloat32(parseFloat(parts[2]) || 0);
				buf.writeFloat32(parseFloat(parts[3]) || 0);
			} else {
				buf.writeFloat32(b1 ? (parseFloat(parts[0]) || 0) : 0);
				buf.writeFloat32(b2 ? (parseFloat(parts[1]) || 0) : 0);
			}
			buf.writeBool(hasPercent);
			break;
		}
		case 'Size':
		case 'Pivot':
		case 'Skew': {
			const b1 = parts[0] !== '-' && parts[0] !== undefined;
			const b2 = parts.length > 1 && parts[1] !== '-';
			buf.writeBool(b1);
			buf.writeBool(b2);
			buf.writeFloat32(b1 ? (parseFloat(parts[0]) || 0) : 0);
			buf.writeFloat32(b2 ? (parseFloat(parts[1]) || 0) : 0);
			break;
		}
		case 'Scale': {
			buf.writeFloat32(parseFloat(parts[0]) || 1);
			buf.writeFloat32(parseFloat(parts[1]) || 1);
			break;
		}
		case 'Alpha':
		case 'Rotation': {
			buf.writeFloat32(parseFloat(parts[0]) || 0);
			break;
		}
		case 'Color': {
			const colorStr = parts[0] || '#000000';
			buf.writeColor(colorStr, false);
			break;
		}
		case 'Animation': {
			const frame = parts[0] !== '-' ? parseInt(parts[0], 10) || 0 : -1;
			const playing = parts.length <= 1 || parts[1] === 'p';
			buf.writeBool(playing);
			buf.writeInt32(frame);
			if (version >= 6) {
				buf.writeS(parts[2] || null);
				buf.writeS(parts[3] || null);
			}
			break;
		}
		case 'Visible': {
			buf.writeBool(parts[0] === 'true');
			break;
		}
		case 'Sound': {
			buf.writeSEx(parts[0] || null, false, false);
			buf.writeFloat32((parseInt(parts[1], 10) || 100) / 100);
			break;
		}
		case 'Transition': {
			buf.writeSEx(parts[0] || null, false, false);
			buf.writeInt32(parseInt(parts[1], 10) || 1);
			break;
		}
		case 'Shake': {
			buf.writeFloat32(parseFloat(parts[0]) || 0);
			buf.writeFloat32(parseFloat(parts[1]) || 0.3);
			break;
		}
		case 'ColorFilter': {
			buf.writeFloat32(parseFloat(parts[0]) || 0);
			buf.writeFloat32(parseFloat(parts[1]) || 0);
			buf.writeFloat32(parseFloat(parts[2]) || 0);
			buf.writeFloat32(parseFloat(parts[3]) || 0);
			break;
		}
		case 'Text': {
			buf.writeSEx(parts.join(',') || null, true);
			break;
		}
		case 'Icon': {
			buf.writeS(parts[0] || null);
			break;
		}
		default: {
			buf.writeBool(true);
			buf.writeBool(true);
			buf.writeFloat32(0);
			buf.writeFloat32(0);
		}
	}
}

// ─── Gear encoding ───────────────────────────────────────────────────────

function _writeGear(buf: WriteBuffer, gear: GearNode, gearType: number, comp: Component, version: number): void {
	// Controller index
	const ctrl = gear.getController?.();
	const controllers = comp.listControllers();
	const ctrlIndex = ctrl ? controllers.indexOf(ctrl) : -1;
	buf.writeInt16(ctrlIndex >= 0 ? ctrlIndex : 0);

	// Parse page values from formal gear fields.
	const pagesStr = _strVal(gear.getPages?.()) ?? '';
	const valuesStr = _strVal(gear.getValues?.()) ?? '';
	const defaultStr = _strVal(gear.getDefaultValue?.()) ?? '';

	const pages = pagesStr ? pagesStr.split(',') : [];
	const values = valuesStr ? valuesStr.split('|') : [];
	const pageCount = pages.length;

	if (gearType === 0 || gearType === 8) {
		// GearDisplay / GearDisplay2: just page IDs
		buf.writeInt16(pages.length);
		if (pages.length > 0) {
			for (const p of pages) buf.writeS(p);
		}
	} else {
		// Other gears: write one page entry per declared page.
		// Editor writes S(null) when the page has no explicit state
		// (or '-' for non-text/icon gears), and omits the status payload.
		buf.writeInt16(pageCount);
		for (let i = 0; i < pageCount; i++) {
			const value = values[i] ?? '';
			if (_shouldWriteNullGearPage(gearType, value)) {
				buf.writeS(null);
				continue;
			}

			buf.writeS(pages[i] ?? null);
			_writeGearStatus(buf, gearType, value, version);
		}
		// Default value
		const hasDefault = defaultStr !== '';
		buf.writeBool(hasDefault);
		if (hasDefault) {
			_writeGearStatus(buf, gearType, defaultStr, version);
		}
	}

	// Tween footer.
	// Unity runtime GearBase.Setup always reads this bool for every gear type.
	// Only XY/Size/Look/Color may actually carry tween config payload.
	const supportsTween = gearType >= 1 && gearType <= 4;
	const hasTween = supportsTween && (gear.getTween?.() ?? false);
	buf.writeBool(hasTween);
	if (hasTween) {
		buf.writeUint8(gear.getEaseType?.() ?? 5);
		buf.writeFloat32(gear.getTweenDuration?.() ?? 0.3);
		buf.writeFloat32(gear.getTweenDelay?.() ?? 0);
	}
	if (version >= 4 && hasTween && (gear.getEaseType?.() ?? 5) === 31) {
		_writePathData(buf, gear.getCustomEasePath?.() ?? null);
	}

	if (version >= 2 && gearType === 1) {
		const positionsInPercent = gear.getPositionsInPercent?.() ?? false;
		buf.writeBool(positionsInPercent);
		if (positionsInPercent) {
			for (let i = 0; i < pageCount; i++) {
				const value = values[i] ?? '';
				if (_shouldWriteNullGearPage(gearType, value)) {
					buf.writeS(null);
					continue;
				}

				buf.writeS(pages[i] ?? null);
				_writeGearXYExtStatus(buf, value);
			}
			const hasDefault = defaultStr !== '';
			buf.writeBool(hasDefault);
			if (hasDefault) {
				_writeGearXYExtStatus(buf, defaultStr);
			}
		}
	}

	// GearDisplay2 condition
	if (gearType === 8) {
		const condition = gear.getCondition?.() ?? 0;
		buf.writeUint8(_numVal(condition, 0));
	}

	if (version >= 6 && gearType === 5) {
		for (let i = 0; i < pageCount; i++) {
			const value = values[i] ?? '';
			if (!_hasGearAnimationExtStatus(value)) {
				buf.writeS(null);
				continue;
			}

			buf.writeS(pages[i] ?? null);
			_writeGearAnimationExtStatus(buf, value);
		}
		const hasDefaultExt = _hasGearAnimationExtStatus(defaultStr);
		buf.writeBool(hasDefaultExt);
		if (hasDefaultExt) {
			_writeGearAnimationExtStatus(buf, defaultStr);
		}
	}
}

function _shouldWriteNullGearPage(gearType: number, valueStr: string): boolean {
	return gearType !== 6 && gearType !== 7 && (!valueStr || valueStr === '-');
}

function _writeGearStatus(buf: WriteBuffer, gearType: number, valueStr: string, _version: number): void {
	const parts = valueStr.split(',');
	switch (gearType) {
		case 1: // GearXY: x,y
			buf.writeInt32(parseInt(parts[0], 10) || 0);
			buf.writeInt32(parseInt(parts[1], 10) || 0);
			break;
		case 2: // GearSize: w,h,sx,sy
			buf.writeInt32(parseInt(parts[0], 10) || 0);
			buf.writeInt32(parseInt(parts[1], 10) || 0);
			buf.writeFloat32(parseFloat(parts[2]) || 1);
			buf.writeFloat32(parseFloat(parts[3]) || 1);
			break;
		case 3: // GearLook: alpha,rotation,grayed,touchable
			buf.writeFloat32(_numberToken(parts[0], 1));
			buf.writeFloat32(parseFloat(parts[1]) || 0);
			buf.writeBool(parts[2] === 'true' || parts[2] === '1');
			buf.writeBool(parts.length < 4 || parts[3] === 'true' || parts[3] === '1');
			break;
		case 4: // GearColor: color,strokeColor
			_writeColorForGear(buf, parts[0] ?? '#ffffff');
			_writeColorForGear(buf, parts.length < 2 ? '#000000' : (parts[1] ?? '#000000'));
			break;
		case 5: // GearAnimation: playing,frame
			buf.writeBool(parts[1] !== 's'); // 'p'=playing, 's'=stopped
			buf.writeInt32(parseInt(parts[0], 10) || 0);
			break;
		case 6: // GearText
			buf.writeS(valueStr);
			break;
		case 7: // GearIcon
			buf.writeS(valueStr);
			break;
		case 9: // GearFontSize
			buf.writeInt32(parseInt(valueStr, 10) || 12);
			break;
		default:
			break;
	}
}

function _writeGearXYExtStatus(buf: WriteBuffer, valueStr: string): void {
	const parts = valueStr.split(',');
	buf.writeFloat32(parseFloat(parts[2]) || 0);
	buf.writeFloat32(parseFloat(parts[3]) || 0);
}

/** Write a color string like "#ffffff" or "#rrggbbaa" as readColorS format. */
function _writeColorForGear(buf: WriteBuffer, colorStr: string, defaultColor: number = 0xff000000): void {
	buf.writeColor(colorStr || null, true, defaultColor);
}

// ─── Child-specific extensions ───────────────────────────────────────────

function _writeChildSpecific(buf: WriteBuffer, child: EncoderChildLike, pkg: Package, version: number): void {
	const type = child.propertyType as string;

	switch (type) {
		case 'GImage': {
			const color = child.getColor?.() ?? null;
			const colorLower = color?.toLowerCase?.() ?? '';
			const hasColor = color && colorLower !== '#ffffff' && colorLower !== '#ffffffff';
			buf.writeBool(!!hasColor);
			if (hasColor) buf.writeColor(color, false);
			buf.writeUint8(child.getFlip?.() ?? 0);
			const fillMethod = child.getFillMethod?.() ?? 0;
			buf.writeUint8(fillMethod);
			if (fillMethod !== 0) {
				buf.writeUint8(child.getFillOrigin?.() ?? 0);
				buf.writeBool(child.getFillClockwise?.() ?? true);
				buf.writeFloat32(child.getFillAmount?.() ?? 0);
			}
			break;
		}

		case 'GTextField':
		case 'GRichTextField':
		case 'GTextInput': {
			buf.writeS(child.getFont?.() || null);
			buf.writeInt16(child.getFontSize?.() ?? 12);
			buf.writeColor(child.getColor?.() ?? '#000000', false);
			buf.writeUint8(child.getAlign?.() ?? 0);
			buf.writeUint8(child.getVAlign?.() ?? 0);
			buf.writeInt16(child.getLeading?.() ?? 3);
			buf.writeInt16(child.getLetterSpacing?.() ?? 0);
			buf.writeBool(child.getUbbEnabled?.() ?? false);
			buf.writeUint8(_numVal(child.getAutoSize?.(), 1));
			buf.writeBool(child.getUnderline?.() ?? false);
			buf.writeBool(child.getItalic?.() ?? false);
			buf.writeBool(child.getBold?.() ?? false);
			buf.writeBool(child.getSingleLine?.() ?? false);
			// Stroke — editor detects via strokeColor attribute existence
			const strokeColor = child.getStrokeColor?.() ?? null;
			const hasStroke = !!strokeColor;
			buf.writeBool(hasStroke);
			if (hasStroke) {
				buf.writeColor(strokeColor, true);
				buf.writeFloat32(child.getStrokeSize?.() ?? 1);
			}
			// Shadow
			const shadowColor = child.getShadowColor?.() ?? null;
			if (shadowColor) {
				buf.writeBool(true);
				buf.writeColor(shadowColor, true);
				buf.writeFloat32(child.getShadowOffsetX?.() ?? 1);
				buf.writeFloat32(child.getShadowOffsetY?.() ?? 1);
			} else {
				buf.writeBool(false);
			}
			// Template vars
			buf.writeBool(false);
			if (version >= 3) {
				buf.writeBool(child.getStrikethrough?.() ?? false);
				buf.writeFloat32(0);
				buf.writeFloat32(0);
				buf.writeFloat32(0);
			}
			break;
		}

		case 'GGraph': {
			const graphType = child.getGraphType?.() ?? 0;
			// Editor output keeps a 13-byte default graph payload even when graphType is empty.
			// The Unity runtime reads the first byte as type=0 and ignores the trailing defaults,
			// but the payload is still part of the binary layout and must be preserved.
			if (graphType === 0) {
				buf.writeInt32(child.getLineSize?.() ?? 1);
				buf.writeColor(child.getLineColor?.() ?? '#000000ff', true);
				buf.writeColor(child.getFillColor?.() ?? '#ffffffff', true, 0xFFFFFFFF);
				buf.writeBool(false);
			} else {
				buf.writeUint8(graphType);
				buf.writeInt32(child.getLineSize?.() ?? 1);
				buf.writeColor(child.getLineColor?.() ?? '#000000ff', true);
				buf.writeColor(child.getFillColor?.() ?? '#ffffffff', true, 0xFFFFFFFF);
				// Corner radius
				const corner = child.getCornerRadius?.();
				if (corner) {
					buf.writeBool(true);
					buf.writeFloat32(corner[0] ?? 0);
					buf.writeFloat32(corner[1] ?? corner[0] ?? 0);
					buf.writeFloat32(corner[2] ?? corner[0] ?? 0);
					buf.writeFloat32(corner[3] ?? corner[0] ?? 0);
				} else {
					buf.writeBool(false);
				}
				// Polygon points (type=3)
				if (graphType === 3) {
					const points = child.getPoints?.();
					if (points) {
						buf.writeInt16(points.length);
						for (const point of points) buf.writeFloat32(point ?? 0);
					} else {
						buf.writeInt16(0);
					}
				}
				// Regular polygon (type=4)
				if (graphType === 4) {
					buf.writeInt16(child.getSides?.() ?? 3);
					buf.writeFloat32(child.getStartAngle?.() ?? 0);
					const distances = child.getDistances?.();
					if (distances) {
						buf.writeInt16(distances.length);
						for (const distance of distances) buf.writeFloat32(distance ?? 1);
					} else {
						buf.writeInt16(0);
					}
				}
			}
			break;
		}

		case 'GGroup':
			buf.writeUint8(child.getLayout?.() ?? 0);
			buf.writeInt32(child.getLineGap?.() ?? 0);
			buf.writeInt32(child.getColumnGap?.() ?? 0);
			// v2
			buf.writeBool(child.getExcludeInvisibles?.() ?? false);
			buf.writeBool(child.getAutoSizeDisabled?.() ?? false);
			buf.writeInt16(child.getMainGridIndex?.() ?? -1);
			break;

		case 'GLoader': {
			buf.writeS(remapLocalUiUrl(pkg, child.getUrl?.() ?? null));
			buf.writeUint8(child.getAlign?.() ?? 0);
			buf.writeUint8(child.getVAlign?.() ?? 0);
			buf.writeUint8(child.getFill?.() ?? 0);
			buf.writeBool(child.getShrinkOnly?.() ?? false);
			buf.writeBool(_boolVal(child.getAutoSize?.(), false));
			buf.writeBool(false); // showErrorSign
			buf.writeBool(child.getPlaying?.() ?? true);
			buf.writeInt32(child.getFrame?.() ?? 0);
			const loaderColor = child.getColor?.() ?? null;
			const loaderColorLower = loaderColor?.toLowerCase?.() ?? '';
			const hasLoaderColor = loaderColor && loaderColorLower !== '#ffffff' && loaderColorLower !== '#ffffffff';
			buf.writeBool(!!hasLoaderColor);
			if (hasLoaderColor) buf.writeColor(loaderColor, false);
			const loaderFill = child.getFillMethod?.() ?? 0;
			buf.writeUint8(loaderFill);
			if (loaderFill !== 0) {
				buf.writeUint8(child.getFillOrigin?.() ?? 0);
				buf.writeBool(child.getFillClockwise?.() ?? true);
				buf.writeFloat32(child.getFillAmount?.() ?? 0);
			}
			if (version >= 7) {
				buf.writeBool(child.getUseResize?.() ?? false);
			}
			break;
		}

		case 'GLoader3D': {
			buf.writeS(remapLocalUiUrl(pkg, child.getUrl?.() ?? null));
			buf.writeUint8(child.getAlign?.() ?? 0);
			buf.writeUint8(child.getVAlign?.() ?? 0);
			buf.writeUint8(child.getFill?.() ?? 0);
			buf.writeBool(child.getShrinkOnly?.() ?? false);
			buf.writeBool(_boolVal(child.getAutoSize?.(), false));
			buf.writeS(child.getAnimationName?.() ?? null);
			buf.writeS(child.getSkinName?.() ?? null);
			buf.writeBool(child.getPlaying?.() ?? true);
			buf.writeInt32(child.getFrame?.() ?? 0);
			buf.writeBool(child.getLoop?.() ?? true);
			const loader3DColor = child.getColor?.() ?? null;
			const loader3DColorLower = loader3DColor?.toLowerCase?.() ?? '';
			const hasLoader3DColor = loader3DColor && loader3DColorLower !== '#ffffff' && loader3DColorLower !== '#ffffffff';
			buf.writeBool(!!hasLoader3DColor);
			if (hasLoader3DColor) buf.writeColor(loader3DColor, false);
			break;
		}

		case 'GMovieClip': {
			const mcColor = child.getColor?.() ?? null;
			const mcColorLower = mcColor?.toLowerCase?.() ?? '';
			const hasMcColor = mcColor && mcColorLower !== '#ffffff' && mcColorLower !== '#ffffffff';
			buf.writeBool(!!hasMcColor);
			if (hasMcColor) buf.writeColor(mcColor, false);
			buf.writeUint8(0); // flip
			buf.writeInt32(child.getFrame?.() ?? 0);
			buf.writeBool(child.getPlaying?.() ?? true);
			break;
		}

		case 'GList':
		case 'GTree': {
			// GList.setup_beforeAdd block 5: layout, selection, scroll, items
			const overflow = child.getOverflow?.() ?? 0;
			buf.writeUint8(child.getLayout?.() ?? 0); // layout
			buf.writeUint8(child.getSelectionMode?.() ?? 0); // selectionMode
			buf.writeUint8(child.getAlign?.() ?? 0); // align
			buf.writeUint8(child.getVAlign?.() ?? 0); // verticalAlign
			buf.writeInt16(child.getLineGap?.() ?? 0); // lineGap
			buf.writeInt16(child.getColumnGap?.() ?? 0); // columnGap
			buf.writeInt16(child.getLineCount?.() ?? 0); // lineCount
			buf.writeInt16(child.getColumnCount?.() ?? 0); // columnCount
			buf.writeBool(child.getAutoResizeItem?.() ?? true); // autoResizeItem
			buf.writeUint8(child.getChildrenRenderOrder?.() ?? 0); // childrenRenderOrder
			buf.writeInt16(child.getApexIndex?.() ?? 0); // apexIndex
			// margin
			const listMargin = child.getMargin?.();
			const hasListMargin = !!listMargin && (
				overflow === 2 ||
				(Array.isArray(listMargin)
					? !!(listMargin[0] || listMargin[1] || listMargin[2] || listMargin[3])
					: !!(listMargin.top || listMargin.bottom || listMargin.left || listMargin.right))
			);
			buf.writeBool(hasListMargin);
			if (hasListMargin && listMargin) {
				if (Array.isArray(listMargin)) {
					buf.writeInt32(listMargin[0] ?? 0);
					buf.writeInt32(listMargin[1] ?? 0);
					buf.writeInt32(listMargin[2] ?? 0);
					buf.writeInt32(listMargin[3] ?? 0);
				} else {
					buf.writeInt32(listMargin.top ?? 0);
					buf.writeInt32(listMargin.bottom ?? 0);
					buf.writeInt32(listMargin.left ?? 0);
					buf.writeInt32(listMargin.right ?? 0);
				}
			}
			// overflow
			buf.writeUint8(overflow);
			// clipSoftness
			const clipSoft = child.getClipSoftness?.();
			const hasClipSoftness = !!clipSoft && !!((clipSoft.x ?? 0) || (clipSoft.y ?? 0));
			if (hasClipSoftness) {
				buf.writeBool(true);
				buf.writeInt32(clipSoft.x ?? 0);
				buf.writeInt32(clipSoft.y ?? 0);
			} else {
				buf.writeBool(false);
			}
			// v2 fields
			buf.writeBool(child.getScrollItemToViewOnClick?.() ?? true);
			buf.writeBool(child.getFoldInvisibleItems?.() ?? false);
			break;
		}

		default:
			// GComponent, GButton, GLabel, etc. — no block 5 data
			break;
	}
}

/**
 * Write child afterAdd data (block 6).
 * Must match the runtime's setup_afterAdd binary format exactly.
 */
function _writeChildAfterAdd(buf: WriteBuffer, child: EncoderChildLike, comp: Component, pkg: Package, version: number): void {
	const type = child.propertyType as string;

	switch (type) {
		case 'GTextField':
		case 'GRichTextField':
		case 'GTextInput':
			// GTextField.setup_afterAdd: readS() → text — noCache
			buf.writeSEx(remapLocalUiRefsInText(pkg, child.getText?.() ?? null), true);
			break;

		case 'GButton': {
			// GButton.setup_afterAdd: block 6
			buf.writeUint8(12); // EXT_BUTTON
			buf.writeSEx(child.getTitle?.() ?? null, true); // noCache
			buf.writeSEx(child.getSelectedTitle?.() ?? null, true); // noCache
			buf.writeS(remapLocalUiUrl(pkg, child.getIcon?.() ?? null));
			buf.writeS(remapLocalUiUrl(pkg, child.getSelectedIcon?.() ?? null));
			// titleColor
			const titleColor = child.getTitleColor?.() ?? null;
			const hasTitleColor = titleColor && titleColor !== '#000000';
			buf.writeBool(!!hasTitleColor);
			if (hasTitleColor) buf.writeColor(titleColor, true);
			// titleFontSize
			buf.writeInt32(child.getTitleFontSize?.() ?? 0);
			// relatedController — resolve name to index
			const btnExtras = getChildExtras(child);
			const relCtrlName = btnExtras?.controller ?? null;
			if (relCtrlName) {
				const controllers = comp.listControllers();
				const ctrlIdx = controllers.findIndex((c) => c.getName() === relCtrlName);
				buf.writeInt16(ctrlIdx >= 0 ? ctrlIdx : -1);
			} else {
				buf.writeInt16(-1);
			}
			// relatedPageId
			buf.writeS(btnExtras?.page ?? null);
			// sound override
			buf.writeSEx(remapLocalUiUrl(pkg, _strVal(btnExtras?.sound)) ?? null, false, false);
			// soundVolume override
			const btnVolume = btnExtras?.volume;
			if (btnVolume !== undefined && btnVolume !== null) {
				buf.writeBool(true);
				buf.writeFloat32(_numVal(btnVolume, 0) / 100);
			} else {
				buf.writeBool(false);
			}
			// selected
			buf.writeBool(child.getSelected?.() ?? _boolVal(btnExtras?.checked, false));
			break;
		}

		case 'GLabel': {
			// GLabel.setup_afterAdd: block 6
			buf.writeUint8(11); // EXT_LABEL
			buf.writeSEx(child.getTitle?.() ?? null, true); // noCache
			buf.writeS(remapLocalUiUrl(pkg, child.getIcon?.() ?? null));
			// titleColor
			const labelTitleColor = child.getTitleColor?.() ?? null;
			const hasLabelColor = labelTitleColor && labelTitleColor !== '#000000';
			buf.writeBool(!!hasLabelColor);
			if (hasLabelColor) buf.writeColor(labelTitleColor, true);
			// titleFontSize
			buf.writeInt32(child.getTitleFontSize?.() ?? 0);
			// input settings flag
			buf.writeBool(false);
			if (version >= 5) {
				buf.writeS(remapLocalUiUrl(pkg, child.getSound?.() ?? null));
				buf.writeFloat32(child.getSoundVolumeScale?.() ?? 1);
			}
			break;
		}

		case 'GComboBox': {
			// GComboBox.setup_afterAdd: block 6
			buf.writeUint8(13); // EXT_COMBOBOX
			const items = child.getItems?.() ?? [];
			const values = child.getValues?.() ?? [];
			const icons = child.getIcons?.() ?? [];
			buf.writeInt16(items.length);
			for (let i = 0; i < items.length; i++) {
				const itemStart = buf.pos;
				buf.writeInt16(0); // placeholder
				buf.writeSEx(items[i] ?? null, true, false); // noCache, empty≠null
				buf.writeSEx(values[i] ?? null, false, false); // cache, empty≠null
				buf.writeS(remapLocalUiUrl(pkg, icons[i] ?? null));
				const itemEnd = buf.pos;
				const saved = buf.pos;
				buf.pos = itemStart;
				buf.writeInt16(itemEnd - itemStart - 2);
				buf.pos = saved;
			}
			buf.writeSEx(child.getTitle?.() ?? null, true); // noCache
			buf.writeS(remapLocalUiUrl(pkg, child.getIcon?.() ?? null));
			// titleColor
			buf.writeBool(false);
			// visibleItemCount
			buf.writeInt32(child.getVisibleItemCount?.() ?? 10);
			// popupDirection
			buf.writeUint8(child.getPopupDirection?.() ?? 0);
			// selectionController
			buf.writeInt16(-1);
			if (version >= 5) {
				buf.writeS(remapLocalUiUrl(pkg, child.getSound?.() ?? null));
				buf.writeFloat32(child.getSoundVolumeScale?.() ?? 1);
			}
			break;
		}

		case 'GProgressBar':
		case 'GSlider': {
			// GProgressBar/GSlider.setup_afterAdd: block 6
			buf.writeUint8(child.propertyType === 'GSlider' ? 15 : 14); // EXT_SLIDER or EXT_PROGRESS_BAR
			buf.writeInt32(child.getValue?.() ?? 0);
			buf.writeInt32(child.getMax?.() ?? 100);
			// v2: min
			buf.writeInt32(child.getMin?.() ?? 0);
			if (version >= 5 && child.propertyType === 'GProgressBar') {
				buf.writeS(remapLocalUiUrl(pkg, child.getSound?.() ?? null));
				buf.writeFloat32(child.getSoundVolumeScale?.() ?? 1);
			}
			break;
		}

		case 'GList':
		case 'GTree': {
			// GList.setup_afterAdd: block 6
			const selectionController = child.getSelectionController?.() ?? '';
			if (selectionController) {
				const ctrlIdx = comp.listControllers().findIndex((controller) => controller.getName() === selectionController);
				buf.writeInt16(ctrlIdx >= 0 ? ctrlIdx : -1);
			} else {
				buf.writeInt16(-1);
			}
			break;
		}

		default: {
			// Check for extension instance data on GComponent children
			// e.g. <component><Button title="点我" icon="ui://..."/></component>
			const instExtType = child.getInstanceExtType?.() ?? null;
			if (instExtType && extTypeCodeMap[instExtType]) {
				_writeExtensionInstanceData(buf, instExtType, child, comp, pkg, version);
			}
			break;
		}
	}
}

// ─── Extension instance data ─────────────────────────────────────────────

const extTypeCodeMap: Record<string, number> = {
	Label: 11, Button: 12, ComboBox: 13,
	ProgressBar: 14, Slider: 15, ScrollBar: 16,
};

function _writeExtensionInstanceData(
	buf: WriteBuffer,
	extType: string,
	child: EncoderChildLike,
	comp: Component,
	pkg: Package,
	version: number,
): void {
	buf.writeUint8(extTypeCodeMap[extType] ?? 0);
	switch (extType) {
		case 'Button': {
			buf.writeSEx(child.getInstanceTitle?.() ?? null, true); // noCache
			buf.writeSEx(child.getInstanceSelectedTitle?.() ?? null, true); // noCache
			buf.writeS(remapLocalUiUrl(pkg, child.getInstanceIcon?.() ?? null));
			buf.writeS(remapLocalUiUrl(pkg, child.getInstanceSelectedIcon?.() ?? null));
			const titleColor = child.getInstanceTitleColor?.() ?? null;
			buf.writeBool(!!titleColor);
			if (titleColor) buf.writeColor(titleColor, true);
			buf.writeInt32(child.getInstanceTitleFontSize?.() ?? 0);
			const relatedController = child.getInstanceController?.() ?? '';
			if (relatedController) {
				const ctrlIdx = comp.listControllers().findIndex((c) => c.getName() === relatedController);
				buf.writeInt16(ctrlIdx >= 0 ? ctrlIdx : -1);
			} else {
				buf.writeInt16(-1);
			}
			buf.writeS(child.getInstancePage?.() ?? null); // relatedPageId
			const sound = child.getInstanceSound?.() ?? null;
			buf.writeSEx(remapLocalUiUrl(pkg, sound) ?? null, false, false);
			const soundVolume = child.getInstanceSoundVolumeScale?.();
			if (soundVolume !== undefined && soundVolume !== null && soundVolume !== 1) {
				buf.writeBool(true);
				buf.writeFloat32(soundVolume);
			} else {
				buf.writeBool(false);
			}
			buf.writeBool(child.getInstanceChecked?.() ?? false); // selected
			break;
		}
		case 'Label': {
			buf.writeSEx(child.getInstanceTitle?.() ?? null, true); // noCache
			buf.writeS(remapLocalUiUrl(pkg, child.getInstanceIcon?.() ?? null));
			const labelTitleColor = child.getInstanceTitleColor?.() ?? null;
			buf.writeBool(!!labelTitleColor);
			if (labelTitleColor) buf.writeColor(labelTitleColor, true);
			buf.writeInt32(child.getInstanceTitleFontSize?.() ?? 0);
			buf.writeBool(false); // no input settings
			if (version >= 5) {
				buf.writeS(null);
				buf.writeFloat32(1);
			}
			break;
		}
		case 'ComboBox': {
			const comboItems: ComboItemLike[] = child.getInstanceComboItems?.() ?? [];
			buf.writeInt16(comboItems.length);
			for (const item of comboItems) {
				const itemStart = buf.pos;
				buf.writeInt16(0); // placeholder
				buf.writeSEx(item.title ?? null, true, false); // noCache, empty≠null
				buf.writeSEx(item.value ?? null, false, false); // cache, empty≠null
				buf.writeS(remapLocalUiUrl(pkg, item.icon ?? null));
				const itemEnd = buf.pos;
				const saved = buf.pos;
				buf.pos = itemStart;
				buf.writeInt16(itemEnd - itemStart - 2);
				buf.pos = saved;
			}
			buf.writeSEx(child.getInstanceTitle?.() ?? null, true); // noCache
			buf.writeS(remapLocalUiUrl(pkg, child.getInstanceIcon?.() ?? null));
			const comboTitleColor = child.getInstanceTitleColor?.() ?? null;
			buf.writeBool(!!comboTitleColor);
			if (comboTitleColor) buf.writeColor(comboTitleColor, true);
			buf.writeInt32(child.getInstanceVisibleItemCount?.() ?? 10);
			buf.writeUint8(0); // popupDirection
			buf.writeInt16(-1); // selectionController
			if (version >= 5) {
				buf.writeS(null);
				buf.writeFloat32(1);
			}
			break;
		}
		case 'ProgressBar':
		case 'Slider':
			buf.writeInt32(child.getInstanceValue?.() ?? 0);
			buf.writeInt32(child.getInstanceMax?.() ?? 100);
			buf.writeInt32(child.getInstanceMin?.() ?? 0);
			if (version >= 5 && extType === 'ProgressBar') {
				buf.writeS(null);
				buf.writeFloat32(1);
			}
			break;
		default:
			break;
	}
}

function _writeGearAnimationExtStatus(buf: WriteBuffer, valueStr: string): void {
	const parts = valueStr.split(',');
	buf.writeS(parts[2] || null);
	buf.writeS(parts[3] || null);
}

function _hasGearAnimationExtStatus(valueStr: string | null | undefined): boolean {
	if (!valueStr) return false;
	const parts = valueStr.split(',');
	return parts.length > 2 && (!!parts[2] || !!parts[3]);
}

// ─── ScrollPane (block 7) ────────────────────────────────────────────────

function _writeScrollPane(buf: WriteBuffer, child: EncoderChildLike, pkg: Package): void {
	buf.writeUint8(child.getScrollType?.() ?? 1); // scrollType
	buf.writeUint8(0); // scrollBarDisplay
	buf.writeInt32(child.getScrollBarFlags?.() ?? 0); // flags
	// scrollBar margin
	const sbMargin = child.getScrollBarMargin?.();
	buf.writeBool(!!sbMargin);
	if (sbMargin) {
		buf.writeInt32(sbMargin.top ?? 0);
		buf.writeInt32(sbMargin.bottom ?? 0);
		buf.writeInt32(sbMargin.left ?? 0);
		buf.writeInt32(sbMargin.right ?? 0);
	}
	buf.writeSEx(remapLocalUiUrl(pkg, child.getVtScrollBarRes?.() ?? null)); // vtScrollBarRes
	buf.writeSEx(remapLocalUiUrl(pkg, child.getHzScrollBarRes?.() ?? null)); // hzScrollBarRes
	buf.writeSEx(remapLocalUiUrl(pkg, child.getHeaderRes?.() ?? null)); // headerRes
	buf.writeSEx(remapLocalUiUrl(pkg, child.getFooterRes?.() ?? null)); // footerRes
}

// ─── GList items (block 8) ───────────────────────────────────────────────

function _writeListItems(buf: WriteBuffer, child: EncoderChildLike, pkg: Package, version: number): void {
	buf.writeS(remapLocalUiUrl(pkg, child.getDefaultItem?.() ?? null));

	const isTree = child.propertyType === 'GTree';
	const listItems: ListItemLike[] = child.getListItems?.() ?? [];
	buf.writeInt16(listItems.length);
	for (const item of listItems) {
		const itemStart = buf.pos;
		buf.writeInt16(0); // placeholder
		buf.writeS(remapLocalUiUrl(pkg, item.url ?? null));
		if (isTree) {
			const explicitFolder = item.isFolder;
			const isFolder = explicitFolder ?? (!(item.icon ?? null) && !(item.url ?? null));
			buf.writeBool(isFolder);
			buf.writeUint8(Math.max(0, item.level ?? 0));
		}
		buf.writeSEx(item.title ?? null, true); // noCache
		buf.writeSEx(item.selectedTitle ?? null, true); // noCache
		buf.writeS(remapLocalUiUrl(pkg, item.icon ?? null));
		buf.writeS(remapLocalUiUrl(pkg, item.selectedIcon ?? null));
		buf.writeS(item.name ?? null);
		buf.writeInt16(0); // no controller overrides
		if (version >= 2) {
			buf.writeInt16(0); // no property overrides
		}

		const itemEnd = buf.pos;
		const saved = buf.pos;
		buf.pos = itemStart;
		buf.writeInt16(itemEnd - itemStart - 2);
		buf.pos = saved;
	}
}

function _writeTreeSettings(buf: WriteBuffer, child: EncoderChildLike): void {
	buf.writeInt32(child.getIndent?.() ?? 0);
	buf.writeUint8(child.getClickToExpand?.() ?? 0);
}

// ─── Block 4: Component/List child controller overrides ──────────────────

function _writeChildBlock4Component(buf: WriteBuffer, child: EncoderChildLike, comp: Component, _pkg: Package): void {
	// 1. pageController index
	const pageCtrlName = child.getPageController?.() ?? null;
	if (pageCtrlName) {
		const controllers = comp.listControllers();
		const ctrlIdx = controllers.findIndex((c) => c.getName() === pageCtrlName);
		buf.writeInt16(ctrlIdx >= 0 ? ctrlIdx : -1);
	} else {
		buf.writeInt16(-1);
	}

	// 2. Controller overrides: "name1,value1,name2,value2,..."
	const ctrlStr = child.getControllerOverrides?.() ?? '';
	if (ctrlStr) {
		const parts = ctrlStr.split(',');
		const cntPos = buf.pos;
		buf.writeInt16(0); // placeholder for count
		let count = 0;
		for (let i = 0; i < parts.length; i += 2) {
			if (parts[i]) {
				buf.writeS(parts[i]);
				buf.writeS(parts[i + 1] ?? '');
				count++;
			}
		}
		// Patch count
		const saved = buf.pos;
		buf.pos = cntPos;
		buf.writeInt16(count);
		buf.pos = saved;
	} else {
		buf.writeInt16(0);
	}

	// 3. Property overrides (§_-55§)
	buf.writeInt16(0); // no property overrides in current project data
}

function _writeChildBlock4TextInput(buf: WriteBuffer, child: EncoderChildLike): void {
	buf.writeSEx(child.getPromptText?.() ?? child.getPrompt?.() ?? null);
	buf.writeSEx(child.getRestrict?.() ?? null);
	buf.writeInt32(child.getMaxLength?.() ?? 0);
	buf.writeInt32(child.getKeyboardType?.() ?? 0);
	buf.writeBool(child.getPassword?.() ?? false);
}

// ─── Block 7: Component-level ScrollPane ─────────────────────────────────

function _writeComponentScrollPane(buf: WriteBuffer, comp: Component, pkg: Package): void {
	// scrollType: horizontal=0, vertical=1, both=2
	buf.writeUint8(comp.getScrollType?.() ?? 1);
	// scrollBarDisplay: default=0, visible=1, auto=2, hidden=3
	buf.writeUint8(comp.getScrollBarDisplay?.() ?? 0);
	// scrollBarFlags
	buf.writeInt32(comp.getScrollBarFlags?.() ?? 0);
	// scrollBarMargin
	const sbMargin = comp.getScrollBarMargin?.() ?? null;
	buf.writeBool(!!sbMargin);
	if (sbMargin) {
		buf.writeInt32(sbMargin.top ?? 0);
		buf.writeInt32(sbMargin.bottom ?? 0);
		buf.writeInt32(sbMargin.left ?? 0);
		buf.writeInt32(sbMargin.right ?? 0);
	}
	// vtScrollBarRes, hzScrollBarRes
	buf.writeSEx(remapLocalUiUrl(pkg, comp.getVtScrollBarRes?.() ?? null));
	buf.writeSEx(remapLocalUiUrl(pkg, comp.getHzScrollBarRes?.() ?? null));
	// headerRes, footerRes (ptrRes in XML)
	buf.writeSEx(remapLocalUiUrl(pkg, comp.getHeaderRes?.() ?? null));
	buf.writeSEx(remapLocalUiUrl(pkg, comp.getFooterRes?.() ?? null));
}
