import type { Component } from '../properties/component.js';
import type {
	GearNode,
	TransitionItemNode,
} from './component-encoder-shared.js';
import {
	_numVal,
	_numberToken,
	_strVal,
	getRuntimeChildren,
} from './component-encoder-shared.js';
import type { WriteBuffer } from './write-buffer.js';

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

export function _writeTransitions(buf: WriteBuffer, comp: Component, version: number): void {
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

export function _writeGear(buf: WriteBuffer, gear: GearNode, gearType: number, comp: Component, version: number): void {
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


