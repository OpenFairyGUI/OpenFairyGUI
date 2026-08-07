import { GearType } from '../constants.js';
import type { Document } from '../document.js';
import type { GComponentPropertyOverride } from '../properties/g-component.js';
import { ByteBuffer } from './byte-buffer.js';
import {
	COMPONENT_EXTENSION_TYPE_NAMES,
	formatBinaryNumber,
	readColorValue,
	remainingBytes,
	type ComponentDisplayObject,
} from './component-decoder-shared.js';
import {
	decodeChildBlock3,
	decodeGearStatus,
	readPathData,
} from './component-decoder-transition-gear.js';

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
	const packageId = childBuf.readS();
	const id = childBuf.readS() ?? '';
	const name = childBuf.readS() ?? '';
	const child = createDisplayObject(doc, objectType, name);
	if (!child) return null;

	child.setName(name);
	child.setId(id);
	if ('setSrc' in child && typeof child.setSrc === 'function') {
		(child as { setSrc(v: string): void }).setSrc(src);
	}
	if (packageId !== null && 'setPackageId' in child && typeof child.setPackageId === 'function') {
		(child as { setPackageId(v: string): void }).setPackageId(packageId);
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
		const minWidth = childBuf.getInt32();
		const maxWidth = childBuf.getInt32();
		const minHeight = childBuf.getInt32();
		const maxHeight = childBuf.getInt32();
		child
			.setMinWidth(minWidth)
			.setMaxWidth(maxWidth)
			.setMinHeight(minHeight)
			.setMaxHeight(maxHeight);
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
	const blendModes = ['normal', 'none', 'add', 'multiply', 'screen', 'erase'] as const;
	child.setBlendMode(blendModes[childBuf.getUint8()] ?? 'normal');
	const filter = childBuf.getUint8();
	if (filter === 1 && remainingBytes(childBuf) >= 16) {
		const filterData = [
			childBuf.getFloat32(),
			childBuf.getFloat32(),
			childBuf.getFloat32(),
			childBuf.getFloat32(),
		].join(',');
		child.setFilter('color').setFilterData(filterData);
	}
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
	if (childBuf.version >= 2 && remainingBytes(childBuf) >= 2) {
		const propertyOverrides = decodePropertyOverrides(childBuf);
		if ('setPropertyOverrides' in child && typeof child.setPropertyOverrides === 'function') {
			(child as { setPropertyOverrides(v: GComponentPropertyOverride[]): void }).setPropertyOverrides(propertyOverrides);
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
		textChild
			.setStrikethrough(childBuf.readBool())
			.setFaceDilate(childBuf.getFloat32())
			.setOutlineSoftness(childBuf.getFloat32())
			.setUnderlaySoftness(childBuf.getFloat32());
	}
}

function decodeListScrollPane(child: ComponentDisplayObject, childBuf: ByteBuffer): void {
	if (!childBuf.seek(0, 7) || remainingBytes(childBuf) < 10) return;
	const listLike = child as ReturnType<Document['createGList']> | ReturnType<Document['createGTree']>;
	listLike
		.setScrollType(childBuf.getUint8())
		.setScrollBarDisplay(childBuf.getUint8());
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

function decodePropertyOverrides(buf: ByteBuffer): GComponentPropertyOverride[] {
	const count = buf.getInt16();
	const properties: GComponentPropertyOverride[] = [];
	for (let index = 0; index < count && remainingBytes(buf) >= 6; index += 1) {
		properties.push({
			target: buf.readS() ?? '',
			propertyId: buf.getInt16(),
			value: buf.readS() ?? '',
		});
	}
	return properties;
}

function decodeListItemOverrides(
	buf: ByteBuffer,
	version: number,
): { controllers?: string; propertyOverrides?: GComponentPropertyOverride[] } {
	if (remainingBytes(buf) < 2) return {};
	const controllerOverrideCount = buf.getInt16();
	const controllerParts: string[] = [];
	for (let index = 0; index < controllerOverrideCount && remainingBytes(buf) >= 4; index += 1) {
		controllerParts.push(buf.readS() ?? '', buf.readS() ?? '');
	}
	const propertyOverrides = version >= 2 && remainingBytes(buf) >= 2
		? decodePropertyOverrides(buf)
		: [];
	return {
		...(controllerParts.length > 0 ? { controllers: controllerParts.join(',') } : {}),
		...(propertyOverrides.length > 0 ? { propertyOverrides } : {}),
	};
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
		controllers?: string | null;
		propertyOverrides?: GComponentPropertyOverride[];
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
		const item = {
			url,
			title: childBuf.readS(),
			selectedTitle: childBuf.readS(),
			icon: childBuf.readS(),
			selectedIcon: childBuf.readS(),
			name: childBuf.readS(),
			level,
			isFolder,
		};
		items.push({ ...item, ...decodeListItemOverrides(childBuf, childBuf.version) });
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
		case 'GGraph': {
			if (remainingBytes(childBuf) < 13) return;
			const graph = child as ReturnType<Document['createGGraph']>;
			const graphType = remainingBytes(childBuf) >= 14 ? childBuf.getUint8() : 0;
			graph
				.setGraphType(graphType)
				.setLineSize(childBuf.getInt32())
				.setLineColor(readColorValue(childBuf, true, true))
				.setFillColor(readColorValue(childBuf, true, true));
			if (childBuf.readBool() && remainingBytes(childBuf) >= 16) {
				graph.setCornerRadius([
					childBuf.getFloat32(),
					childBuf.getFloat32(),
					childBuf.getFloat32(),
					childBuf.getFloat32(),
				]);
			}
			if (graphType === 3 && remainingBytes(childBuf) >= 2) {
				const pointCount = childBuf.getInt16();
				const points: number[] = [];
				for (let index = 0; index < pointCount && remainingBytes(childBuf) >= 4; index += 1) {
					points.push(childBuf.getFloat32());
				}
				graph.setPoints(points);
			} else if (graphType === 4 && remainingBytes(childBuf) >= 8) {
				graph
					.setSides(childBuf.getInt16())
					.setStartAngle(childBuf.getFloat32());
				const distanceCount = childBuf.getInt16();
				const distances: number[] = [];
				for (let index = 0; index < distanceCount && remainingBytes(childBuf) >= 4; index += 1) {
					distances.push(childBuf.getFloat32());
				}
				graph.setDistances(distances);
			}
			break;
		}
		case 'GGroup': {
			if (remainingBytes(childBuf) < 11) return;
			(child as ReturnType<Document['createGGroup']>)
				.setLayout(childBuf.getUint8())
				.setLineGap(childBuf.getInt32())
				.setColumnGap(childBuf.getInt32())
				.setExcludeInvisibles(childBuf.readBool())
				.setAutoSizeDisabled(childBuf.readBool())
				.setMainGridIndex(childBuf.getInt16());
			const group = child as ReturnType<Document['createGGroup']>;
			if (group.listGears().length > 0 || group.getRelations().length > 0) {
				group.setAdvanced(true);
			}
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
			loader.setShowErrorSign(childBuf.readBool());
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
		case 'GComponent': {
			if (remainingBytes(childBuf) < 1) return;
			const extType = childBuf.getUint8();
			const extTypeName = COMPONENT_EXTENSION_TYPE_NAMES[extType] ?? '';
			if (!extTypeName) return;
			const component = child as ReturnType<Document['createGComponent']>;
			component.setInstanceExtType(extTypeName);

			switch (extTypeName) {
				case 'Button':
					if (remainingBytes(childBuf) < 12) return;
					component
						.setInstanceTitle(childBuf.readS() ?? '')
						.setInstanceSelectedTitle(childBuf.readS() ?? '')
						.setInstanceIcon(childBuf.readS() ?? '')
						.setInstanceSelectedIcon(childBuf.readS() ?? '');
					if (childBuf.readBool()) {
						component.setInstanceTitleColor(readColorValue(childBuf, true));
					}
					component.setInstanceTitleFontSize(childBuf.getInt32());
					{
						const relatedControllerIndex = childBuf.getInt16();
						if (relatedControllerIndex >= 0) {
							component.setInstanceController(resource.listControllers()[relatedControllerIndex]?.getName() ?? '');
						}
					}
					component.setInstancePage(childBuf.readS() ?? '');
					component.setInstanceSound(childBuf.readS() ?? '');
					if (childBuf.readBool() && remainingBytes(childBuf) >= 4) {
						component.setInstanceSoundVolumeScale(childBuf.getFloat32());
					}
					if (remainingBytes(childBuf) >= 1) {
						component.setInstanceChecked(childBuf.readBool());
					}
					break;
				case 'Label':
					if (remainingBytes(childBuf) < 9) return;
					component
						.setInstanceTitle(childBuf.readS() ?? '')
						.setInstanceIcon(childBuf.readS() ?? '');
					if (childBuf.readBool()) {
						component.setInstanceTitleColor(readColorValue(childBuf, true));
					}
					component.setInstanceTitleFontSize(childBuf.getInt32());
					if (remainingBytes(childBuf) >= 1 && childBuf.readBool()) {
						component.setInstancePromptText(childBuf.readS() ?? '');
						childBuf.readS(); // restrict
						if (remainingBytes(childBuf) >= 9) {
							childBuf.getInt32(); // maxLength
							childBuf.getInt32(); // keyboardType
							childBuf.readBool(); // password
						}
					}
					if (childBuf.version >= 5 && remainingBytes(childBuf) >= 6) {
						component
							.setInstanceSound(childBuf.readS() ?? '')
							.setInstanceSoundVolumeScale(childBuf.getFloat32());
					}
					break;
				case 'ComboBox': {
					if (remainingBytes(childBuf) < 2) return;
					const itemCount = childBuf.getInt16();
					const items: Array<{ title: string | null; value: string | null; icon: string | null }> = [];
					for (let index = 0; index < itemCount && remainingBytes(childBuf) >= 2; index += 1) {
						const chunkSize = childBuf.getInt16();
						const nextPos = childBuf.pos + chunkSize;
						items.push({
							title: childBuf.readS(),
							value: childBuf.readS(),
							icon: childBuf.readS(),
						});
						childBuf.pos = nextPos;
					}
					component
						.setInstanceComboItems(items)
						.setInstanceTitle(childBuf.readS() ?? '')
						.setInstanceIcon(childBuf.readS() ?? '');
					if (childBuf.readBool()) {
						component.setInstanceTitleColor(readColorValue(childBuf, true));
					}
					component
						.setInstanceVisibleItemCount(childBuf.getInt32())
						.setInstancePopupDirection(childBuf.getUint8());
					const selectionControllerIndex = childBuf.getInt16();
					if (selectionControllerIndex >= 0) {
						component.setInstanceSelectionController(resource.listControllers()[selectionControllerIndex]?.getName() ?? '');
					}
					if (childBuf.version >= 5 && remainingBytes(childBuf) >= 6) {
						component
							.setInstanceSound(childBuf.readS() ?? '')
							.setInstanceSoundVolumeScale(childBuf.getFloat32());
					}
					break;
				}
				case 'ProgressBar':
				case 'Slider':
					if (remainingBytes(childBuf) < 12) return;
					component
						.setInstanceValue(childBuf.getInt32())
						.setInstanceMax(childBuf.getInt32())
						.setInstanceMin(childBuf.getInt32());
					if (extTypeName === 'ProgressBar' && childBuf.version >= 5 && remainingBytes(childBuf) >= 6) {
						component
							.setInstanceSound(childBuf.readS() ?? '')
							.setInstanceSoundVolumeScale(childBuf.getFloat32());
					}
					break;
				default:
					break;
			}
			break;
		}
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


export function decodeComponentDisplayList(
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
