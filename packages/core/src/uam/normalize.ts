import type {
	UamAnimationGearBinding,
	UamAnimationGearValue,
	UamAssetResource,
	UamButtonNode,
	UamColorGearBinding,
	UamColorGearValue,
	UamComboBoxNode,
	UamComponentModel,
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
	UamLabelNode,
	UamListItemData,
	UamListNode,
	UamLoader3DNode,
	UamLoaderNode,
	UamLookGearBinding,
	UamLookGearValue,
	UamMovieClipNode,
	UamPackage,
	UamPackagePublish,
	UamProject,
	UamProgressBarNode,
	UamRelation,
	UamResource,
	UamRichTextNode,
	UamScrollBarNode,
	UamSizeGearBinding,
	UamSizeGearValue,
	UamSliderNode,
	UamTextGearBinding,
	UamTextGearValue,
	UamTextInputNode,
	UamTextNode,
	UamTreeNode,
	UamTransitionItem,
	UamTransitionModel,
	UamXYGearBinding,
	UamXYGearValue,
} from './model.js';

function normalizePackagePublish(publish: UamPackagePublish | null | undefined): UamPackagePublish | null {
	if (!publish) return null;
	return {
		name: publish.name ?? '',
		path: publish.path ?? '',
		branchPath: publish.branchPath ?? '',
		packageCount: publish.packageCount ?? 0,
		genCode: publish.genCode ?? false,
		codePath: publish.codePath ?? '',
	};
}

function normalizeRelations(relations: UamRelation[] | undefined): UamRelation[] {
	return (relations ?? []).map((relation) => ({
		targetNodeId: relation.targetNodeId,
		type: relation.type,
		usePercent: relation.usePercent ?? false,
	}));
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

function normalizeDisplayNode(node: UamDisplayNode): UamDisplayNode {
	const base = {
		id: node.id,
		name: node.name ?? '',
		position: normalizePoint(node.position),
		size: {
			width: node.size?.width ?? 0,
			height: node.size?.height ?? 0,
		},
		visible: node.visible ?? true,
		touchable: node.touchable ?? true,
		grayed: node.grayed ?? false,
		alpha: node.alpha ?? 1,
		rotation: node.rotation ?? 0,
		customData: node.customData ?? '',
		relations: normalizeRelations(node.relations),
		gears: (node.gears ?? []).map((gear) => normalizeGearBinding(gear)),
	};

	switch (node.kind) {
		case 'image':
			return {
				kind: 'image',
				...base,
				resource: {
					packageId: node.resource.packageId,
					resourceId: node.resource.resourceId,
				},
			} satisfies UamImageNode;
		case 'text':
			return {
				kind: 'text',
				...base,
				text: node.text ?? '',
				font: node.font ?? '',
				fontSize: node.fontSize ?? 12,
				color: node.color ?? '#000000',
			} satisfies UamTextNode;
		case 'richText':
			return {
				kind: 'richText',
				...base,
				text: node.text ?? '',
				font: node.font ?? '',
				fontSize: node.fontSize ?? 12,
				color: node.color ?? '#000000',
			} satisfies UamRichTextNode;
		case 'textInput': {
			const input = node as UamTextInputNode;
			return {
				kind: 'textInput',
				...base,
				text: input.text ?? '',
				font: input.font ?? '',
				fontSize: input.fontSize ?? 12,
				color: input.color ?? '#000000',
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
				resource: {
					packageId: node.resource.packageId,
					resourceId: node.resource.resourceId,
				},
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
				locked: graph.locked ?? false,
				minWidth: graph.minWidth ?? 0,
				maxWidth: graph.maxWidth ?? 0,
				minHeight: graph.minHeight ?? 0,
				maxHeight: graph.maxHeight ?? 0,
				pivot: normalizePoint(graph.pivot),
				pivotAsAnchor: graph.pivotAsAnchor ?? false,
				group: graph.group ?? '',
				skew: normalizePoint(graph.skew),
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
				locked: group.locked ?? false,
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
				scale: { x: loader.scale?.x ?? 1, y: loader.scale?.y ?? 1 },
				url: loader.url ?? '',
				filter: loader.filter ?? '',
				filterData: loader.filterData ?? '',
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
			} satisfies UamLoader3DNode;
		}
		case 'movieClip': {
			const movieClip = node as UamMovieClipNode;
			return {
				kind: 'movieClip',
				...base,
				resource: {
					packageId: movieClip.resource.packageId,
					resourceId: movieClip.resource.resourceId,
				},
				fileName: movieClip.fileName ?? '',
				filter: movieClip.filter ?? '',
				filterData: movieClip.filterData ?? '',
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
	return {
		name: controller.name,
		selectedIndex: controller.selectedIndex ?? 0,
		autoRadioGroupDepth: controller.autoRadioGroupDepth ?? false,
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
		customData: component.customData ?? '',
		displayList: (component.displayList ?? []).map(normalizeDisplayNode),
		controllers: (component.controllers ?? []).map(normalizeControllerModel),
		transitions: (component.transitions ?? []).map(normalizeTransitionModel),
	};
}

function normalizeAssetResource(resource: UamAssetResource): UamAssetResource {
	return {
		kind: resource.kind,
		id: resource.id,
		name: resource.name ?? '',
		path: resource.path ?? '/',
		exported: resource.exported ?? false,
		branch: resource.branch ?? '',
		branchItemIds: [...(resource.branchItemIds ?? [])],
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
			branch: resource.branch ?? '',
			branchItemIds: [...(resource.branchItemIds ?? [])],
			component: normalizeComponentModel(resource.component),
		} satisfies UamComponentResource;
	}
	return normalizeAssetResource(resource);
}

function normalizePackage(pkg: UamPackage): UamPackage {
	return {
		id: pkg.id,
		name: pkg.name,
		publish: normalizePackagePublish(pkg.publish),
		resources: (pkg.resources ?? []).map(normalizeResource),
	};
}

export function normalizeUamProject(project: UamProject): UamProject {
	return {
		projectId: project.projectId,
		projectType: project.projectType ?? 0,
		version: project.version || '3.0',
		branches: [...(project.branches ?? [])],
		settings: {
			publish: project.settings?.publish ?? {},
			common: project.settings?.common ?? {},
			adaptation: project.settings?.adaptation ?? {},
		},
		packages: (project.packages ?? []).map(normalizePackage),
	};
}
