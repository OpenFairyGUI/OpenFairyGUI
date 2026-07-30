import { GearType, TransitionActionType } from '../constants.js';
import type { Document } from '../document.js';
import { ByteBuffer } from './byte-buffer.js';
import {
	decodeRelationBlock,
	formatBinaryNumber,
	readColorValue,
	remainingBytes,
	type ComponentDisplayObject,
} from './component-decoder-shared.js';

export function decodeGearStatus(buf: ByteBuffer, gearType: number, _version: number): string {
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

export function decodeChildBlock3(
	resource: ReturnType<Document['createComponent']>,
	child: ComponentDisplayObject,
	childBuf: ByteBuffer,
): void {
	if (!childBuf.seek(0, 3) || remainingBytes(childBuf) < 1) return;
	const childIds = resource.listChildren().map((entry) => entry.getId());
	decodeRelationBlock(childBuf, childIds, (relation) => child.addRelation(relation));
}


export function readPathData(buf: ByteBuffer): string {
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

export function decodeComponentTransitions(
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
