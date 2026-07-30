import { ControllerActionType } from '../constants.js';
import type { Document } from '../document.js';
import { ByteBuffer } from './byte-buffer.js';
import {
	decodeRelationBlock,
	remainingBytes,
} from './component-decoder-shared.js';

export function decodeComponentControllers(
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
			let homePageIndex = 0;
			if (controllerBuf.version >= 2 && remainingBytes(controllerBuf) >= 1) {
				const homePageType = controllerBuf.getUint8();
				switch (homePageType) {
					case 1:
						if (remainingBytes(controllerBuf) >= 2) homePageIndex = controllerBuf.getInt16();
						break;
					case 2:
						// branch homepage: current restore has no branch runtime context, fall back to first page
						homePageIndex = 0;
						break;
					case 3:
						// variable homepage: payload is a string key, but restore has no runtime variable context
						if (remainingBytes(controllerBuf) >= 2) controllerBuf.readS();
						homePageIndex = 0;
						break;
					default:
						homePageIndex = 0;
						break;
				}
			}
			if (controller.listPages().length > 0) {
				const maxIndex = controller.listPages().length - 1;
				controller.setSelectedIndex(Math.min(Math.max(homePageIndex, 0), maxIndex));
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

export function decodeComponentRelations(
	resource: ReturnType<Document['createComponent']>,
	buf: ByteBuffer,
): void {
	if (!buf.seek(0, 3) || remainingBytes(buf) < 1) return;
	const childIds = resource.listChildren().map((child) => child.getId());
	decodeRelationBlock(buf, childIds, (relation) => resource.addRelation(relation));
}


export function decodeComponentHeader(resource: ReturnType<Document['createComponent']>, buf: ByteBuffer): void {
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

export function decodeComponentAdvancedProps(resource: ReturnType<Document['createComponent']>, buf: ByteBuffer): void {
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

export function decodeComponentExtensionDef(
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

export function decodeComponentScrollPane(resource: ReturnType<Document['createComponent']>, buf: ByteBuffer): void {
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
