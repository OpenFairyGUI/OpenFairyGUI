import type {
	UamAnimationGearBinding,
	UamAnimationGearValue,
	UamAssetResource,
	UamButtonNode,
	UamColorGearBinding,
	UamColorGearValue,
	UamComboBoxNode,
	UamComponentInstanceProperties,
	UamComponentModel,
	UamComponentProperties,
	UamComponentRefNode,
	UamComponentResource,
	UamControllerAction,
	UamControllerModel,
	UamControllerPage,
	UamDisplay2GearBinding,
	UamDisplayGearBinding,
	UamDisplayNode,
	UamEdgeInsets,
	UamFontSizeGearBinding,
	UamFontSizeGearValue,
	UamGearBinding,
	UamGearPageState,
	UamGraphNode,
	UamGroupNode,
	UamIconGearBinding,
	UamIconGearValue,
	UamImageNode,
	UamImageResourceProperties,
	UamLabelNode,
	UamListItemData,
	UamListNode,
	UamLoader3DNode,
	UamLoaderNode,
	UamLookGearBinding,
	UamLookGearValue,
	UamMovieClipNode,
	UamMovieClipResourceProperties,
	UamPackage,
	UamPackagePublish,
	UamPlainTextProperties,
	UamProject,
	UamProgressBarNode,
	UamRelation,
	UamResource,
	UamResourceFolder,
	UamResourceRef,
	UamRichTextNode,
	UamScrollBarNode,
	UamSizeGearBinding,
	UamSizeGearValue,
	UamSliderNode,
	UamTextGearBinding,
	UamTextGearValue,
	UamTextInputNode,
	UamTextNode,
	UamTextProperties,
	UamTreeNode,
	UamTransitionItem,
	UamTransitionModel,
	UamXYGearBinding,
	UamXYGearValue,
} from './model.js';
import { normalizeResourceFolderPath } from '../utils/resource-folder.js';
import { cloneSettings } from './bridge-shared.js';

function normalizePackagePublish(publish: UamPackagePublish | null | undefined): UamPackagePublish | null {
	if (!publish) return null;
	return {
		name: publish.name ?? '',
		path: publish.path ?? '',
		branchPath: publish.branchPath ?? '',
		packageCount: publish.packageCount ?? 0,
		genCode: publish.genCode ?? false,
		codePath: publish.codePath ?? '',
		useGlobalAtlasSettings: publish.useGlobalAtlasSettings ?? true,
		maxAtlasSize: publish.maxAtlasSize ?? 2048,
		sizeOption: publish.sizeOption === 'npot' || publish.sizeOption === 'mof' ? publish.sizeOption : 'pot',
		forceSquare: publish.forceSquare ?? false,
		allowRotation: publish.allowRotation ?? false,
		paging: publish.paging ?? true,
		extractAlpha: publish.extractAlpha ?? false,
		maxAtlasIndex: publish.maxAtlasIndex ?? 10,
		atlases: (publish.atlases ?? [])
			.map((atlas) => ({
				index: atlas.index,
				name: atlas.name ?? '',
				compression: atlas.compression ?? false,
			}))
			.sort((left, right) => left.index - right.index),
		excludedResourceIds: [...(publish.excludedResourceIds ?? [])],
	};
}

function normalizeRelations(relations: UamRelation[] | undefined): UamRelation[] {
	return (relations ?? []).map((relation) => ({
		targetNodeId: relation.targetNodeId,
		type: relation.type,
		usePercent: relation.usePercent ?? false,
	}));
}

function normalizeResourceRef(ref: UamResourceRef): UamResourceRef {
	return {
		packageId: ref.packageId || undefined,
		resourceId: ref.resourceId,
	};
}

function normalizePoint(point: { x?: number; y?: number } | undefined): { x: number; y: number } {
	return {
		x: point?.x ?? 0,
		y: point?.y ?? 0,
	};
}

function normalizeEdgeInsets(edgeInsets: Partial<UamEdgeInsets> | undefined): UamEdgeInsets {
	return {
		top: edgeInsets?.top ?? 0,
		bottom: edgeInsets?.bottom ?? 0,
		left: edgeInsets?.left ?? 0,
		right: edgeInsets?.right ?? 0,
	};
}

function normalizeComponentInstanceProperties(
	properties: UamComponentInstanceProperties,
): UamComponentInstanceProperties {
	switch (properties.extensionType) {
		case 'Button':
			return {
				extensionType: 'Button',
				title: properties.title ?? '',
				selectedTitle: properties.selectedTitle ?? '',
				icon: properties.icon ?? '',
				selectedIcon: properties.selectedIcon ?? '',
				titleColor: properties.titleColor ?? '',
				titleFontSize: properties.titleFontSize ?? 0,
				controller: properties.controller ?? '',
				page: properties.page ?? '',
				checked: properties.checked ?? false,
				sound: properties.sound ?? '',
				soundVolumeScale: properties.soundVolumeScale ?? 1,
			};
		case 'Label':
			return {
				extensionType: 'Label',
				title: properties.title ?? '',
				icon: properties.icon ?? '',
				titleColor: properties.titleColor ?? '',
				titleFontSize: properties.titleFontSize ?? 0,
				promptText: properties.promptText ?? '',
				sound: properties.sound ?? '',
				soundVolumeScale: properties.soundVolumeScale ?? 1,
			};
		case 'ComboBox':
			return {
				extensionType: 'ComboBox',
				title: properties.title ?? '',
				icon: properties.icon ?? '',
				titleColor: properties.titleColor ?? '',
				popupDirection: properties.popupDirection ?? 0,
				sound: properties.sound ?? '',
				soundVolumeScale: properties.soundVolumeScale ?? 1,
				visibleItemCount: properties.visibleItemCount ?? 0,
				selectionController: properties.selectionController ?? '',
				autoClearItems: properties.autoClearItems ?? false,
				items: (properties.items ?? []).map((item) => ({
					title: item.title ?? null,
					value: item.value ?? null,
					icon: item.icon ?? null,
				})),
			};
		case 'ProgressBar':
			return {
				extensionType: 'ProgressBar',
				value: properties.value ?? 0,
				max: properties.max ?? 0,
				min: properties.min ?? 0,
				sound: properties.sound ?? '',
				soundVolumeScale: properties.soundVolumeScale ?? 1,
			};
		case 'Slider':
			return {
				extensionType: 'Slider',
				value: properties.value ?? 0,
				max: properties.max ?? 0,
				min: properties.min ?? 0,
			};
		case 'ScrollBar':
			return { extensionType: 'ScrollBar' };
	}
}

export function createDefaultUamComponentProperties(): UamComponentProperties {
	return {
		minSize: { width: 0, height: 0 },
		maxSize: { width: 0, height: 0 },
		pivot: { x: 0, y: 0 },
		pivotAsAnchor: false,
		overflow: 0,
		margin: { top: 0, bottom: 0, left: 0, right: 0 },
		clipSoftness: { x: 0, y: 0 },
		hitTest: '',
		mask: '',
		reversedMask: false,
		scrollType: 1,
		scrollBarDisplay: 0,
		scrollBarFlags: 0,
		scrollBarMargin: { top: 0, bottom: 0, left: 0, right: 0 },
		vtScrollBarRes: '',
		hzScrollBarRes: '',
		headerRes: '',
		footerRes: '',
		bgColor: '',
		bgColorEnabled: false,
		designImageAlpha: 50,
		designImageLayer: 0,
		designImageOffset: { x: 0, y: 0 },
		designImage: '',
		designImageForTest: false,
		pageController: '',
		showSound: '',
		hideSound: '',
		idNum: 0,
		initName: '',
		remark: '',
		extensionType: '',
		opaque: true,
		buttonMode: 0,
		sound: '',
		soundVolumeScale: 1,
		downEffect: 0,
		downEffectValue: 0.8,
		dropdown: '',
		promptText: '',
		selectionController: '',
		titleType: 0,
		reverse: false,
		wholeNumbers: false,
		changeOnClick: true,
		fixedGripSize: false,
		autoClearItems: false,
		customProperties: [],
	};
}

function normalizeComponentProperties(properties: UamComponentProperties): UamComponentProperties {
	return {
		minSize: {
			width: properties.minSize?.width ?? 0,
			height: properties.minSize?.height ?? 0,
		},
		maxSize: {
			width: properties.maxSize?.width ?? 0,
			height: properties.maxSize?.height ?? 0,
		},
		pivot: normalizePoint(properties.pivot),
		pivotAsAnchor: properties.pivotAsAnchor ?? false,
		overflow: properties.overflow ?? 0,
		margin: normalizeEdgeInsets(properties.margin),
		clipSoftness: normalizePoint(properties.clipSoftness),
		hitTest: properties.hitTest ?? '',
		mask: properties.mask ?? '',
		reversedMask: properties.reversedMask ?? false,
		scrollType: properties.scrollType ?? 1,
		scrollBarDisplay: properties.scrollBarDisplay ?? 0,
		scrollBarFlags: properties.scrollBarFlags ?? 0,
		scrollBarMargin: normalizeEdgeInsets(properties.scrollBarMargin),
		vtScrollBarRes: properties.vtScrollBarRes ?? '',
		hzScrollBarRes: properties.hzScrollBarRes ?? '',
		headerRes: properties.headerRes ?? '',
		footerRes: properties.footerRes ?? '',
		bgColor: properties.bgColor ?? '',
		bgColorEnabled: properties.bgColorEnabled ?? false,
		designImageAlpha: properties.designImageAlpha ?? 50,
		designImageLayer: properties.designImageLayer ?? 0,
		designImageOffset: normalizePoint(properties.designImageOffset),
		designImage: properties.designImage ?? '',
		designImageForTest: properties.designImageForTest ?? false,
		pageController: properties.pageController ?? '',
		showSound: properties.showSound ?? '',
		hideSound: properties.hideSound ?? '',
		idNum: properties.idNum ?? 0,
		initName: properties.initName ?? '',
		remark: properties.remark ?? '',
		extensionType: properties.extensionType ?? '',
		opaque: properties.opaque ?? true,
		buttonMode: properties.buttonMode ?? 0,
		sound: properties.sound ?? '',
		soundVolumeScale: properties.soundVolumeScale ?? 1,
		downEffect: properties.downEffect ?? 0,
		downEffectValue: properties.downEffectValue ?? 0.8,
		dropdown: properties.dropdown ?? '',
		promptText: properties.promptText ?? '',
		selectionController: properties.selectionController ?? '',
		titleType: properties.titleType ?? 0,
		reverse: properties.reverse ?? false,
		wholeNumbers: properties.wholeNumbers ?? false,
		changeOnClick: properties.changeOnClick ?? true,
		fixedGripSize: properties.fixedGripSize ?? false,
		autoClearItems: properties.autoClearItems ?? false,
		customProperties: (properties.customProperties ?? []).map((property) => ({ ...property })),
	};
}

function normalizeListItems(items: UamListItemData[] | undefined): UamListItemData[] {
	return (items ?? []).map((item) => ({
		title: item.title ?? null,
		icon: item.icon ?? null,
		url: item.url ?? null,
		name: item.name ?? null,
		selectedTitle: item.selectedTitle ?? null,
		selectedIcon: item.selectedIcon ?? null,
		level: item.level ?? 0,
		isFolder: item.isFolder ?? null,
		controllers: item.controllers ?? null,
		...(item.propertyOverrides?.length
			? { propertyOverrides: item.propertyOverrides.map((property) => ({ ...property })) }
			: {}),
	}));
}

function normalizeStates<TValue>(states: UamGearPageState<TValue>[] | undefined): UamGearPageState<TValue>[] {
	return (states ?? []).map((state) => ({
		pageId: state.pageId,
		value: state.value ?? null,
	}));
}

function normalizeLookValue(value: UamLookGearValue | null | undefined): UamLookGearValue | null {
	if (!value) return null;
	return {
		alpha: value.alpha ?? 1,
		rotation: value.rotation ?? 0,
		grayed: value.grayed ?? false,
		touchable: value.touchable ?? true,
	};
}

function normalizeXYValue(value: UamXYGearValue | null | undefined): UamXYGearValue | null {
	if (!value) return null;
	return {
		x: value.x ?? 0,
		y: value.y ?? 0,
	};
}

function normalizeSizeValue(value: UamSizeGearValue | null | undefined): UamSizeGearValue | null {
	if (!value) return null;
	return {
		width: value.width ?? 0,
		height: value.height ?? 0,
		scaleX: value.scaleX ?? 1,
		scaleY: value.scaleY ?? 1,
	};
}

function normalizeColorValue(value: UamColorGearValue | null | undefined): UamColorGearValue | null {
	if (!value) return null;
	return {
		color: value.color ?? '#ffffff',
		outlineColor: value.outlineColor ?? null,
	};
}

function normalizeAnimationValue(value: UamAnimationGearValue | null | undefined): UamAnimationGearValue | null {
	if (!value) return null;
	return {
		frame: value.frame ?? 0,
		playing: value.playing ?? true,
		animationName: value.animationName ?? '',
		skinName: value.skinName ?? '',
	};
}

function normalizeTextValue(value: UamTextGearValue | null | undefined): UamTextGearValue | null {
	if (!value) return null;
	return {
		text: value.text ?? '',
	};
}

function normalizeIconValue(value: UamIconGearValue | null | undefined): UamIconGearValue | null {
	if (!value) return null;
	return {
		icon: value.icon ?? '',
	};
}

function normalizeFontSizeValue(value: UamFontSizeGearValue | null | undefined): UamFontSizeGearValue | null {
	if (!value) return null;
	return {
		fontSize: value.fontSize ?? 0,
	};
}

function normalizeGearBinding(gear: UamGearBinding): UamGearBinding {
	switch (gear.kind) {
		case 'display':
			return {
				kind: 'display',
				name: gear.name ?? '',
				controllerName: gear.controllerName,
				visibleOnPageIds: [...(gear.visibleOnPageIds ?? [])],
			} satisfies UamDisplayGearBinding;
		case 'display2':
			return {
				kind: 'display2',
				name: gear.name ?? '',
				controllerName: gear.controllerName,
				visibleOnPageIds: [...(gear.visibleOnPageIds ?? [])],
				condition: gear.condition ?? '',
			} satisfies UamDisplay2GearBinding;
		case 'look':
			return {
				kind: 'look',
				name: gear.name ?? '',
				controllerName: gear.controllerName,
				states: normalizeStates(gear.states),
				defaultValue: normalizeLookValue(gear.defaultValue)!,
				condition: gear.condition ?? '',
				positionsInPercent: gear.positionsInPercent ?? false,
				tween: gear.tween ?? false,
				tweenDuration: gear.tweenDuration ?? 0.3,
				tweenDelay: gear.tweenDelay ?? 0,
				easeType: gear.easeType ?? 5,
				customEasePath: gear.customEasePath ?? '',
			} satisfies UamLookGearBinding;
		case 'xy':
			return {
				kind: 'xy',
				name: gear.name ?? '',
				controllerName: gear.controllerName,
				states: normalizeStates(gear.states),
				defaultValue: normalizeXYValue(gear.defaultValue)!,
				condition: gear.condition ?? '',
				positionsInPercent: gear.positionsInPercent ?? false,
				tween: gear.tween ?? false,
				tweenDuration: gear.tweenDuration ?? 0.3,
				tweenDelay: gear.tweenDelay ?? 0,
				easeType: gear.easeType ?? 5,
				customEasePath: gear.customEasePath ?? '',
			} satisfies UamXYGearBinding;
		case 'size':
			return {
				kind: 'size',
				name: gear.name ?? '',
				controllerName: gear.controllerName,
				states: normalizeStates(gear.states),
				defaultValue: normalizeSizeValue(gear.defaultValue)!,
				condition: gear.condition ?? '',
				positionsInPercent: gear.positionsInPercent ?? false,
				tween: gear.tween ?? false,
				tweenDuration: gear.tweenDuration ?? 0.3,
				tweenDelay: gear.tweenDelay ?? 0,
				easeType: gear.easeType ?? 5,
				customEasePath: gear.customEasePath ?? '',
			} satisfies UamSizeGearBinding;
		case 'color':
			return {
				kind: 'color',
				name: gear.name ?? '',
				controllerName: gear.controllerName,
				states: normalizeStates(gear.states),
				defaultValue: normalizeColorValue(gear.defaultValue)!,
				condition: gear.condition ?? '',
				positionsInPercent: gear.positionsInPercent ?? false,
				tween: gear.tween ?? false,
				tweenDuration: gear.tweenDuration ?? 0.3,
				tweenDelay: gear.tweenDelay ?? 0,
				easeType: gear.easeType ?? 5,
				customEasePath: gear.customEasePath ?? '',
			} satisfies UamColorGearBinding;
		case 'animation':
			return {
				kind: 'animation',
				name: gear.name ?? '',
				controllerName: gear.controllerName,
				states: normalizeStates(gear.states),
				defaultValue: normalizeAnimationValue(gear.defaultValue)!,
				condition: gear.condition ?? '',
				positionsInPercent: gear.positionsInPercent ?? false,
				tween: gear.tween ?? false,
				tweenDuration: gear.tweenDuration ?? 0.3,
				tweenDelay: gear.tweenDelay ?? 0,
				easeType: gear.easeType ?? 5,
				customEasePath: gear.customEasePath ?? '',
			} satisfies UamAnimationGearBinding;
		case 'text':
			return {
				kind: 'text',
				name: gear.name ?? '',
				controllerName: gear.controllerName,
				states: normalizeStates(gear.states),
				defaultValue: normalizeTextValue(gear.defaultValue)!,
				condition: gear.condition ?? '',
				positionsInPercent: gear.positionsInPercent ?? false,
				tween: gear.tween ?? false,
				tweenDuration: gear.tweenDuration ?? 0.3,
				tweenDelay: gear.tweenDelay ?? 0,
				easeType: gear.easeType ?? 5,
				customEasePath: gear.customEasePath ?? '',
			} satisfies UamTextGearBinding;
		case 'icon':
			return {
				kind: 'icon',
				name: gear.name ?? '',
				controllerName: gear.controllerName,
				states: normalizeStates(gear.states),
				defaultValue: normalizeIconValue(gear.defaultValue)!,
				condition: gear.condition ?? '',
				positionsInPercent: gear.positionsInPercent ?? false,
				tween: gear.tween ?? false,
				tweenDuration: gear.tweenDuration ?? 0.3,
				tweenDelay: gear.tweenDelay ?? 0,
				easeType: gear.easeType ?? 5,
				customEasePath: gear.customEasePath ?? '',
			} satisfies UamIconGearBinding;
		case 'fontSize':
			return {
				kind: 'fontSize',
				name: gear.name ?? '',
				controllerName: gear.controllerName,
				states: normalizeStates(gear.states),
				defaultValue: normalizeFontSizeValue(gear.defaultValue)!,
				condition: gear.condition ?? '',
				positionsInPercent: gear.positionsInPercent ?? false,
				tween: gear.tween ?? false,
				tweenDuration: gear.tweenDuration ?? 0.3,
				tweenDelay: gear.tweenDelay ?? 0,
				easeType: gear.easeType ?? 5,
				customEasePath: gear.customEasePath ?? '',
			} satisfies UamFontSizeGearBinding;
	}
}

export function createDefaultUamTextProperties(): UamTextProperties {
	return {
		text: '',
		font: '',
		fontSize: 12,
		color: '#000000',
		align: 0,
		vAlign: 0,
		leading: 3,
		letterSpacing: 0,
		autoSize: 1,
		singleLine: false,
		autoClearText: false,
		outlineSoftness: 0,
		underlaySoftness: 0,
		ubbEnabled: false,
		underline: false,
		italic: false,
		bold: false,
		strikethrough: false,
		strokeColor: null,
		strokeSize: 1,
		shadowColor: null,
		shadowOffset: { x: 0, y: 0 },
	};
}

export function createDefaultUamPlainTextProperties(): UamPlainTextProperties {
	return {
		...createDefaultUamTextProperties(),
		demoText: '',
		templateVarsEnabled: false,
		faceDilate: 0,
	};
}

function normalizeTextProperties(properties: UamTextProperties): UamTextProperties {
	const normalizeColor = (color: string) => {
		const normalized = color.toLowerCase();
		return normalized.startsWith('#ff') && normalized.length === 9
			? `#${normalized.slice(3)}`
			: normalized;
	};
	return {
		text: properties.text,
		font: properties.font,
		fontSize: properties.fontSize,
		color: normalizeColor(properties.color),
		align: properties.align,
		vAlign: properties.vAlign,
		leading: properties.leading,
		letterSpacing: properties.letterSpacing,
		autoSize: properties.autoSize,
		singleLine: properties.singleLine,
		autoClearText: properties.autoClearText,
		outlineSoftness: properties.outlineSoftness,
		underlaySoftness: properties.underlaySoftness,
		ubbEnabled: properties.ubbEnabled,
		underline: properties.underline,
		italic: properties.italic,
		bold: properties.bold,
		strikethrough: properties.strikethrough,
		strokeColor: properties.strokeColor === null ? null : normalizeColor(properties.strokeColor),
		strokeSize: properties.strokeSize,
		shadowColor: properties.shadowColor === null ? null : normalizeColor(properties.shadowColor),
		shadowOffset: properties.shadowOffset ? { ...properties.shadowOffset } : properties.shadowOffset,
	};
}

function normalizePlainTextProperties(properties: UamPlainTextProperties): UamPlainTextProperties {
	return {
		...normalizeTextProperties(properties),
		demoText: properties.demoText,
		templateVarsEnabled: properties.templateVarsEnabled,
		faceDilate: properties.faceDilate,
	};
}

function normalizeDisplayNode(node: UamDisplayNode): UamDisplayNode {
	const base = {
		id: node.id,
		name: node.name ?? '',
		position: normalizePoint(node.position),
		size: {
			width: node.size?.width ?? 0,
			height: node.size?.height ?? 0,
		},
		locked: node.locked ?? false,
		aspect: node.aspect ?? false,
		minSize: {
			width: node.minSize?.width ?? 0,
			height: node.minSize?.height ?? 0,
		},
		maxSize: {
			width: node.maxSize?.width ?? 0,
			height: node.maxSize?.height ?? 0,
		},
		pivot: normalizePoint(node.pivot),
		pivotAsAnchor: node.pivotAsAnchor ?? false,
		scale: { x: node.scale?.x ?? 1, y: node.scale?.y ?? 1 },
		skew: normalizePoint(node.skew),
		visible: node.visible ?? true,
		touchable: node.touchable ?? true,
		grayed: node.grayed ?? false,
		alpha: node.alpha ?? 1,
		rotation: node.rotation ?? 0,
		tooltips: node.tooltips ?? '',
		blendMode: node.blendMode ?? 'normal',
		filter: node.filter ?? '',
		filterData: node.filterData ?? '',
		customData: node.customData ?? '',
		relations: normalizeRelations(node.relations),
		gears: (node.gears ?? []).map((gear) => normalizeGearBinding(gear)),
	};

	switch (node.kind) {
		case 'image':
			return {
				kind: 'image',
				...base,
				group: node.group ?? '',
				resource: normalizeResourceRef(node.resource),
				color: node.color ?? '#FFFFFF',
				flip: node.flip ?? 0,
				fillMethod: node.fillMethod ?? 0,
				fillOrigin: node.fillOrigin ?? 0,
				fillClockwise: node.fillClockwise ?? true,
				fillAmount: node.fillAmount ?? 100,
			} satisfies UamImageNode;
		case 'text':
			return {
				kind: 'text',
				...base,
				group: node.group ?? '',
				...normalizePlainTextProperties(node),
			} satisfies UamTextNode;
		case 'richText':
			return {
				kind: 'richText',
				...base,
				group: node.group ?? '',
				...normalizeTextProperties(node),
			} satisfies UamRichTextNode;
		case 'textInput': {
			const input = node as UamTextInputNode;
			return {
				kind: 'textInput',
				...base,
				group: input.group ?? '',
				...normalizePlainTextProperties(input),
				promptText: input.promptText ?? '',
				maxLength: input.maxLength ?? 0,
				restrict: input.restrict ?? '',
				password: input.password ?? false,
				keyboardType: input.keyboardType ?? 0,
			} satisfies UamTextInputNode;
		}
		case 'component':
			return {
				kind: 'component',
				...base,
				group: node.group ?? '',
				resource: normalizeResourceRef(node.resource),
				...(node.propertyOverrides?.length
					? { propertyOverrides: node.propertyOverrides.map((property) => ({ ...property })) }
					: {}),
				...(node.instanceProperties
					? { instanceProperties: normalizeComponentInstanceProperties(node.instanceProperties) }
					: {}),
			} satisfies UamComponentRefNode;
		case 'list': {
			const list = node as UamListNode;
			return {
				kind: 'list',
				...base,
				group: list.group ?? '',
				layout: list.layout ?? 0,
				align: list.align ?? 0,
				vAlign: list.vAlign ?? 0,
				lineGap: list.lineGap ?? 0,
				columnGap: list.columnGap ?? 0,
				lineCount: list.lineCount ?? 0,
				columnCount: list.columnCount ?? 0,
				selectionMode: list.selectionMode ?? 0,
				defaultItem: list.defaultItem ?? '',
				autoResizeItem: list.autoResizeItem ?? true,
				childrenRenderOrder: list.childrenRenderOrder ?? 0,
				apexIndex: list.apexIndex ?? 0,
				src: list.src ?? '',
				overflow: list.overflow ?? 0,
				scrollType: list.scrollType ?? 1,
				scrollBarDisplay: list.scrollBarDisplay ?? 0,
				scrollBarFlags: list.scrollBarFlags ?? 0,
				scrollBarMargin: normalizeEdgeInsets(list.scrollBarMargin),
				vtScrollBarRes: list.vtScrollBarRes ?? '',
				hzScrollBarRes: list.hzScrollBarRes ?? '',
				headerRes: list.headerRes ?? '',
				footerRes: list.footerRes ?? '',
				margin: normalizeEdgeInsets(list.margin),
				clipSoftness: normalizePoint(list.clipSoftness),
				scrollItemToViewOnClick: list.scrollItemToViewOnClick ?? true,
				foldInvisibleItems: list.foldInvisibleItems ?? false,
				autoClearItems: list.autoClearItems ?? false,
				listItems: normalizeListItems(list.listItems),
				pageController: list.pageController ?? '',
				controllerOverrides: list.controllerOverrides ?? '',
				selectionController: list.selectionController ?? '',
			} satisfies UamListNode;
		}
		case 'tree': {
			const tree = node as UamTreeNode;
			const listBase = normalizeDisplayNode({ ...tree, kind: 'list' }) as UamListNode;
			return {
				...listBase,
				kind: 'tree',
				treeView: tree.treeView ?? true,
				indent: tree.indent ?? 30,
				clickToExpand: tree.clickToExpand ?? 0,
			} satisfies UamTreeNode;
		}
		case 'graph': {
			const graph = node as UamGraphNode;
			return {
				kind: 'graph',
				...base,
				pivot: normalizePoint(graph.pivot),
				pivotAsAnchor: graph.pivotAsAnchor ?? false,
				group: graph.group ?? '',
				graphType: graph.graphType ?? 0,
				lineSize: graph.lineSize ?? 1,
				lineColor: graph.lineColor ?? '#000000',
				fillColor: graph.fillColor ?? '#FFFFFF',
				cornerRadius: graph.cornerRadius ? [...graph.cornerRadius] as [number, number, number, number] : null,
				points: graph.points ? [...graph.points] : null,
				sides: graph.sides ?? 0,
				startAngle: graph.startAngle ?? 0,
				distances: graph.distances ? [...graph.distances] : null,
			} satisfies UamGraphNode;
		}
		case 'group': {
			const group = node as UamGroupNode;
			return {
				kind: 'group',
				...base,
				group: group.group ?? '',
				layout: group.layout ?? 0,
				lineGap: group.lineGap ?? 0,
				columnGap: group.columnGap ?? 0,
				advanced: group.advanced ?? false,
				excludeInvisibles: group.excludeInvisibles ?? false,
				autoSizeDisabled: group.autoSizeDisabled ?? false,
				mainGridIndex: group.mainGridIndex ?? -1,
			} satisfies UamGroupNode;
		}
		case 'loader': {
			const loader = node as UamLoaderNode;
			return {
				kind: 'loader',
				...base,
				pivot: normalizePoint(loader.pivot),
				url: loader.url ?? '',
				fill: loader.fill ?? 0,
				shrinkOnly: loader.shrinkOnly ?? false,
				autoSize: loader.autoSize ?? false,
				useResize: loader.useResize ?? false,
				align: loader.align ?? 0,
				vAlign: loader.vAlign ?? 0,
				frame: loader.frame ?? 0,
				playing: loader.playing ?? true,
				color: loader.color ?? '#FFFFFF',
				fillMethod: loader.fillMethod ?? 0,
				fillOrigin: loader.fillOrigin ?? 0,
				fillClockwise: loader.fillClockwise ?? true,
				fillAmount: loader.fillAmount ?? 100,
				clearOnPublish: loader.clearOnPublish ?? false,
			} satisfies UamLoaderNode;
		}
		case 'loader3D': {
			const loader = node as UamLoader3DNode;
			return {
				kind: 'loader3D',
				...base,
				url: loader.url ?? '',
				fill: loader.fill ?? 0,
				shrinkOnly: loader.shrinkOnly ?? false,
				autoSize: loader.autoSize ?? false,
				align: loader.align ?? 0,
				vAlign: loader.vAlign ?? 0,
				animationName: loader.animationName ?? '',
				skinName: loader.skinName ?? '',
				playing: loader.playing ?? true,
				frame: loader.frame ?? 0,
				loop: loader.loop ?? true,
				color: loader.color ?? '#FFFFFF',
				clearOnPublish: loader.clearOnPublish ?? false,
			} satisfies UamLoader3DNode;
		}
		case 'movieClip': {
			const movieClip = node as UamMovieClipNode;
			return {
				kind: 'movieClip',
				...base,
				group: movieClip.group ?? '',
				resource: normalizeResourceRef(movieClip.resource),
				fileName: movieClip.fileName ?? '',
				playing: movieClip.playing ?? true,
				frame: movieClip.frame ?? 0,
				color: movieClip.color ?? '#FFFFFF',
			} satisfies UamMovieClipNode;
		}
		case 'button': {
			const button = node as UamButtonNode;
			return {
				kind: 'button',
				...base,
				group: button.group ?? '',
				src: button.src ?? '',
				packageId: button.packageId ?? '',
				title: button.title ?? '',
				icon: button.icon ?? '',
				selectedTitle: button.selectedTitle ?? '',
				selectedIcon: button.selectedIcon ?? '',
				titleColor: button.titleColor ?? '#000000',
				titleFontSize: button.titleFontSize ?? 0,
				sound: button.sound ?? '',
				soundVolumeScale: button.soundVolumeScale ?? 1,
				mode: button.mode ?? 0,
				downEffect: button.downEffect ?? 0,
				downEffectValue: button.downEffectValue ?? 0.8,
			} satisfies UamButtonNode;
		}
		case 'label': {
			const label = node as UamLabelNode;
			return {
				kind: 'label',
				...base,
				group: label.group ?? '',
				src: label.src ?? '',
				packageId: label.packageId ?? '',
				title: label.title ?? '',
				icon: label.icon ?? '',
				titleColor: label.titleColor ?? '#000000',
				titleFontSize: label.titleFontSize ?? 0,
				sound: label.sound ?? '',
				soundVolumeScale: label.soundVolumeScale ?? 1,
			} satisfies UamLabelNode;
		}
		case 'comboBox': {
			const comboBox = node as UamComboBoxNode;
			return {
				kind: 'comboBox',
				...base,
				group: comboBox.group ?? '',
				src: comboBox.src ?? '',
				packageId: comboBox.packageId ?? '',
				title: comboBox.title ?? '',
				icon: comboBox.icon ?? '',
				titleColor: comboBox.titleColor ?? '#000000',
				titleFontSize: comboBox.titleFontSize ?? 0,
				items: [...(comboBox.items ?? [])],
				icons: [...(comboBox.icons ?? [])],
				values: [...(comboBox.values ?? [])],
				selectedIndex: comboBox.selectedIndex ?? -1,
				visibleItemCount: comboBox.visibleItemCount ?? 0,
				popupDirection: comboBox.popupDirection ?? 0,
				sound: comboBox.sound ?? '',
				soundVolumeScale: comboBox.soundVolumeScale ?? 1,
			} satisfies UamComboBoxNode;
		}
		case 'progressBar': {
			const progressBar = node as UamProgressBarNode;
			return {
				kind: 'progressBar',
				...base,
				group: progressBar.group ?? '',
				src: progressBar.src ?? '',
				packageId: progressBar.packageId ?? '',
				titleType: progressBar.titleType ?? 0,
				min: progressBar.min ?? 0,
				max: progressBar.max ?? 100,
				value: progressBar.value ?? 0,
				reverse: progressBar.reverse ?? false,
				sound: progressBar.sound ?? '',
				soundVolumeScale: progressBar.soundVolumeScale ?? 1,
			} satisfies UamProgressBarNode;
		}
		case 'slider': {
			const slider = node as UamSliderNode;
			return {
				kind: 'slider',
				...base,
				group: slider.group ?? '',
				src: slider.src ?? '',
				packageId: slider.packageId ?? '',
				titleType: slider.titleType ?? 0,
				min: slider.min ?? 0,
				max: slider.max ?? 100,
				value: slider.value ?? 0,
				wholeNumbers: slider.wholeNumbers ?? false,
			} satisfies UamSliderNode;
		}
		case 'scrollBar': {
			const scrollBar = node as UamScrollBarNode;
			return {
				kind: 'scrollBar',
				...base,
				group: scrollBar.group ?? '',
				src: scrollBar.src ?? '',
				packageId: scrollBar.packageId ?? '',
				fixedGripSize: scrollBar.fixedGripSize ?? false,
			} satisfies UamScrollBarNode;
		}
	}
}

function normalizeControllerPage(page: UamControllerPage): UamControllerPage {
	return {
		id: page.id,
		name: page.name ?? '',
	};
}

function normalizeControllerAction(action: UamControllerAction): UamControllerAction {
	return {
		name: action.name ?? '',
		actionType: action.actionType,
		fromPageIds: [...(action.fromPageIds ?? [])],
		toPageIds: [...(action.toPageIds ?? [])],
		transitionName: action.transitionName ?? '',
		playTimes: action.playTimes ?? 1,
		delay: action.delay ?? 0,
		stopOnExit: action.stopOnExit ?? false,
		targetNodeId: action.targetNodeId ?? '',
		controllerName: action.controllerName ?? '',
		targetPage: action.targetPage ?? '',
	};
}

function normalizeControllerModel(controller: UamControllerModel): UamControllerModel {
	const homePageType = controller.homePageType ?? 'default';
	return {
		name: controller.name,
		selectedIndex: controller.selectedIndex ?? 0,
		autoRadioGroupDepth: controller.autoRadioGroupDepth ?? false,
		alias: controller.alias ?? '',
		exported: controller.exported ?? false,
		homePageType,
		homePage: homePageType === 'specific' || homePageType === 'variable' ? controller.homePage ?? '' : '',
		pages: (controller.pages ?? []).map(normalizeControllerPage),
		actions: (controller.actions ?? []).map(normalizeControllerAction),
	};
}

function normalizeTransitionItem(item: UamTransitionItem): UamTransitionItem {
	return {
		name: item.name ?? '',
		time: item.time ?? 0,
		actionType: item.actionType,
		targetNodeId: item.targetNodeId ?? '',
		tween: item.tween ?? false,
		duration: item.duration ?? 0,
		startValue: [...(item.startValue ?? [])],
		endValue: [...(item.endValue ?? [])],
		easeType: item.easeType ?? 5,
		repeat: item.repeat ?? 0,
		yoyo: item.yoyo ?? false,
		label: item.label ?? '',
		endLabel: item.endLabel ?? '',
		path: item.path ?? '',
		customEasePath: item.customEasePath ?? '',
	};
}

function normalizeTransitionModel(transition: UamTransitionModel): UamTransitionModel {
	return {
		name: transition.name,
		autoPlay: transition.autoPlay ?? false,
		autoPlayTimes: transition.autoPlayTimes ?? 1,
		autoPlayDelay: transition.autoPlayDelay ?? 0,
		options: transition.options ?? 0,
		fps: transition.fps ?? 24,
		items: (transition.items ?? []).map(normalizeTransitionItem),
	};
}

function normalizeComponentModel(component: UamComponentModel): UamComponentModel {
	return {
		size: {
			width: component.size?.width ?? 0,
			height: component.size?.height ?? 0,
		},
		properties: normalizeComponentProperties(component.properties),
		customData: component.customData ?? '',
		displayList: (component.displayList ?? []).map(normalizeDisplayNode),
		controllers: (component.controllers ?? []).map(normalizeControllerModel),
		transitions: (component.transitions ?? []).map(normalizeTransitionModel),
	};
}

export function createDefaultUamImageResourceProperties(): UamImageResourceProperties {
	return {
		textureSetMode: '',
		qualityOption: '',
		quality: 80,
		smoothing: true,
		duplicatePadding: false,
		scaleOption: 0,
		scale9Grid: null,
		tileGridIndice: 0,
	};
}

export function createDefaultUamMovieClipResourceProperties(): UamMovieClipResourceProperties {
	return {
		interval: 0,
		repeatDelay: 0,
		swing: false,
		smoothing: true,
		frames: [],
	};
}

function normalizeImageResourceProperties(
	properties: UamImageResourceProperties,
): UamImageResourceProperties {
	if (!properties) return properties;
	return {
		textureSetMode: properties.textureSetMode,
		qualityOption: properties.qualityOption,
		quality: properties.quality,
		smoothing: properties.smoothing,
		duplicatePadding: properties.duplicatePadding,
		scaleOption: properties.scaleOption,
		scale9Grid: properties.scale9Grid ? [...properties.scale9Grid] : null,
		tileGridIndice: properties.tileGridIndice,
	};
}

function normalizeMovieClipResourceProperties(
	properties: UamMovieClipResourceProperties,
): UamMovieClipResourceProperties {
	if (!properties) return properties;
	return {
		interval: properties.interval,
		repeatDelay: properties.repeatDelay,
		swing: properties.swing,
		smoothing: properties.smoothing,
		frames: properties.frames.map((frame) => ({
			rectX: frame.rectX,
			rectY: frame.rectY,
			rectWidth: frame.rectWidth,
			rectHeight: frame.rectHeight,
			addDelay: frame.addDelay,
			spriteId: frame.spriteId,
		})),
	};
}

function normalizeAssetResource(resource: UamAssetResource): UamAssetResource {
	const sourceBytes = resource.sourceBytes;
	const base = {
		kind: resource.kind,
		id: resource.id,
		name: resource.name ?? '',
		path: resource.path ?? '/',
		exported: resource.exported ?? false,
		favorite: resource.favorite ?? false,
		branch: resource.branch ?? '',
		branchItemIds: [...(resource.branchItemIds ?? [])],
		...(sourceBytes === undefined ? {} : { sourceBytes: sourceBytes ? new Uint8Array(sourceBytes) : null }),
		...(resource.sourcePath ? { sourcePath: resource.sourcePath } : {}),
	};
	if (resource.kind === 'image') {
		return {
			...base,
			kind: 'image',
			fileName: resource.fileName,
			dimensions: resource.dimensions
				? { width: resource.dimensions.width ?? 0, height: resource.dimensions.height ?? 0 }
				: null,
			image: normalizeImageResourceProperties(resource.image),
		};
	}
	if (resource.kind === 'movieClip') {
		return {
			...base,
			kind: 'movieClip',
			fileName: resource.fileName,
			dimensions: {
				width: resource.dimensions?.width ?? 0,
				height: resource.dimensions?.height ?? 0,
			},
			movieClip: normalizeMovieClipResourceProperties(resource.movieClip),
		};
	}
	return {
		...base,
		kind: resource.kind,
		fileName: resource.fileName,
		file: resource.file,
		dimensions: resource.dimensions
			? { width: resource.dimensions.width ?? 0, height: resource.dimensions.height ?? 0 }
			: null,
		metadata: resource.metadata ?? null,
	};
}

function normalizeResource(resource: UamResource): UamResource {
	if (resource.kind === 'component') {
		return {
			kind: 'component',
			id: resource.id,
			name: resource.name ?? '',
			path: resource.path ?? '/',
			exported: resource.exported ?? false,
			favorite: resource.favorite ?? false,
			branch: resource.branch ?? '',
			branchItemIds: [...(resource.branchItemIds ?? [])],
			component: normalizeComponentModel(resource.component),
		} satisfies UamComponentResource;
	}
	return normalizeAssetResource(resource);
}

function normalizePackage(pkg: UamPackage): UamPackage {
	const resources = (pkg.resources ?? []).map(normalizeResource);
	const folders = (pkg.folders ?? []).map((folder): UamResourceFolder => ({
		branch: folder.branch ?? '',
		path: normalizeResourceFolderPath(folder.path),
		favorite: folder.favorite ?? false,
		atlas: folder.atlas ?? '',
	}));
	const folderKeys = new Set(folders.map((folder) => `${folder.branch}\0${folder.path}`));
	for (const resource of resources) {
		const segments = normalizeResourceFolderPath(resource.path).split('/').filter(Boolean);
		let path = '/';
		for (const segment of segments) {
			path = `${path}${segment}/`;
			const key = `${resource.branch}\0${path}`;
			if (folderKeys.has(key)) continue;
			folderKeys.add(key);
			folders.push({ branch: resource.branch, path, favorite: false, atlas: '' });
		}
	}
	return {
		id: pkg.id,
		name: pkg.name,
		compressPNG: pkg.compressPNG ?? null,
		jpegQuality: pkg.jpegQuality ?? null,
		publish: normalizePackagePublish(pkg.publish),
		branchNames: [...(pkg.branchNames ?? [])],
		folders,
		resources,
	};
}

export function normalizeUamProject(project: UamProject): UamProject {
	const settings = project.settings ?? {};
	return {
		projectId: project.projectId,
		projectType: project.projectType ?? 0,
		version: project.version || '3.0',
		branches: [...new Set(project.branches ?? [])].sort((left, right) => left.localeCompare(right)),
		settings: cloneSettings({
			...settings,
			publish: settings.publish ?? {},
			common: settings.common ?? {},
			adaptation: settings.adaptation ?? {},
		}),
		packages: (project.packages ?? []).map(normalizePackage),
	};
}
