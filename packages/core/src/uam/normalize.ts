import type {
	UamAnimationGearBinding,
	UamAnimationGearValue,
	UamAssetResource,
	UamColorGearBinding,
	UamColorGearValue,
	UamComponentModel,
	UamComponentRefNode,
	UamComponentResource,
	UamControllerAction,
	UamControllerModel,
	UamControllerPage,
	UamDisplay2GearBinding,
	UamDisplayGearBinding,
	UamDisplayNode,
	UamFontSizeGearBinding,
	UamFontSizeGearValue,
	UamGearBinding,
	UamGearPageState,
	UamIconGearBinding,
	UamIconGearValue,
	UamImageNode,
	UamLookGearBinding,
	UamLookGearValue,
	UamPackage,
	UamPackagePublish,
	UamProject,
	UamRelation,
	UamResource,
	UamSizeGearBinding,
	UamSizeGearValue,
	UamTextGearBinding,
	UamTextGearValue,
	UamTextNode,
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
		position: {
			x: node.position?.x ?? 0,
			y: node.position?.y ?? 0,
		},
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
		case 'component':
			return {
				kind: 'component',
				...base,
				resource: {
					packageId: node.resource.packageId,
					resourceId: node.resource.resourceId,
				},
			} satisfies UamComponentRefNode;
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
