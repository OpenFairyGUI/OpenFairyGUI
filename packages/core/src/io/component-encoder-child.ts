import { ObjectType } from '../constants.js';
import type { Document } from '../document.js';
import type { Component } from '../properties/component.js';
import type { Package } from '../properties/package.js';
import { resolveTreeItemIsFolder } from './tree-item-hierarchy.js';
import type {
	EncoderChildLike,
} from './component-encoder-shared.js';
import {
	_boolVal,
	_numVal,
	_strVal,
	getChildExtras,
	getRuntimeChildIndexMap,
	getRuntimeChildren,
	remapLocalUiRefsInText,
	remapLocalUiUrl,
	resolveChildResourceRef,
} from './component-encoder-shared.js';
import {
	_createChildIndexMap,
	_writeRelations,
} from './component-encoder-behavior.js';
import { _writeGear } from './component-encoder-transition-gear.js';
import type { WriteBuffer } from './write-buffer.js';

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

export function _writeDisplayList(buf: WriteBuffer, comp: Component, _doc: Document, pkg: Package, version: number): void {
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
	for (const [index, item] of listItems.entries()) {
		const itemStart = buf.pos;
		buf.writeInt16(0); // placeholder
		buf.writeS(remapLocalUiUrl(pkg, item.url ?? null));
		if (isTree) {
			buf.writeBool(resolveTreeItemIsFolder(listItems, index));
			buf.writeUint8(Math.max(0, item.level ?? 0));
		}
		buf.writeSEx(item.title ?? null, true); // noCache
		buf.writeSEx(item.selectedTitle ?? null, true); // noCache
		buf.writeS(remapLocalUiUrl(pkg, item.icon ?? null));
		buf.writeS(remapLocalUiUrl(pkg, item.selectedIcon ?? null));
		buf.writeS(item.name ?? null);
		const controllerParts = item.controllers?.split(',') ?? [];
		const controllerCountPos = buf.pos;
		buf.writeInt16(0);
		let controllerCount = 0;
		for (let index = 0; index < controllerParts.length; index += 2) {
			const controllerName = controllerParts[index];
			if (!controllerName) continue;
			buf.writeS(controllerName);
			buf.writeS(controllerParts[index + 1] ?? '');
			controllerCount += 1;
		}
		const controllerEnd = buf.pos;
		buf.pos = controllerCountPos;
		buf.writeInt16(controllerCount);
		buf.pos = controllerEnd;
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

