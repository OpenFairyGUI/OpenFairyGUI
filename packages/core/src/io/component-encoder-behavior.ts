import { ControllerActionType, } from '../constants.js';
import type { Component } from '../properties/component.js';
import type { Package } from '../properties/package.js';
import type {
	RelationOwner,
} from './component-encoder-shared.js';
import {
	getRuntimeChildren,
	remapLocalUiUrl,
} from './component-encoder-shared.js';
import type { WriteBuffer } from './write-buffer.js';

export function _writeComponentHeader(buf: WriteBuffer, comp: Component): void {
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

export function _writeControllers(buf: WriteBuffer, comp: Component): void {
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

export function _writeComponentRelations(buf: WriteBuffer, comp: Component): void {
	_writeRelations(buf, comp as RelationOwner, _createChildIndexMap(comp));
}

export function _writeRelations(
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

export function _createChildIndexMap(comp: Component): Map<string, number> {
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

export function _writeAdvancedProps(buf: WriteBuffer, comp: Component, version: number): void {
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

export function _writeExtensionDef(buf: WriteBuffer, comp: Component, pkg: Package, _version: number): void {
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


export function _writeComponentScrollPane(buf: WriteBuffer, comp: Component, pkg: Package): void {
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

