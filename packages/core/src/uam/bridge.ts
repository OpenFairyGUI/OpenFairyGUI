import { bindLookGear, composeController, composeTransition } from '../authoring.js';
import { GearType, PropertyType } from '../constants.js';
import { Document } from '../document.js';
import type { PlatformIO } from '../io/platform-io.js';
import type { ProjectSettings } from '../types/settings.js';
import type {
	UamAssetResource,
	UamComponentRefNode,
	UamComponentModel,
	UamComponentResource,
	UamControllerModel,
	UamDisplayNode,
	UamGearBinding,
	UamImageNode,
	UamLookGearBinding,
	UamProject,
	UamRelation,
	UamTextNode,
} from './model.js';
import { UAM_SUPPORTED_MATERIALIZATION_SCOPE } from './model.js';
import { assertValidUamProject } from './validate.js';

function cloneSettings(settings: ProjectSettings): ProjectSettings {
	return {
		publish: { ...(settings.publish ?? {}) },
		common: { ...(settings.common ?? {}) },
		adaptation: { ...(settings.adaptation ?? {}) },
	};
}

function ensureSupportedResourceKind(kind: string): void {
	if (!UAM_SUPPORTED_MATERIALIZATION_SCOPE.resourceKinds.includes(kind as never)) {
		throw new Error(`UAM materialization does not support resource kind "${kind}" in Gate A.`);
	}
}

function ensureSupportedNodeKind(kind: string): void {
	if (!UAM_SUPPORTED_MATERIALIZATION_SCOPE.nodeKinds.includes(kind as never)) {
		throw new Error(`UAM materialization does not support display node kind "${kind}" in Gate A.`);
	}
}

function ensureSupportedGearKind(kind: string): void {
	if (!UAM_SUPPORTED_MATERIALIZATION_SCOPE.gearKinds.includes(kind as never)) {
		throw new Error(`UAM materialization does not support gear kind "${kind}" in Gate A.`);
	}
}

function materializeRelations(relations: UamRelation[]): Array<{ target: string; type: number; usePercent: boolean }> {
	return relations.map((relation) => ({
		target: relation.targetNodeId,
		type: relation.type,
		usePercent: relation.usePercent,
	}));
}

function liftRelations(relations: Array<{ target: string; type: number; usePercent: boolean }>): UamRelation[] {
	return relations.map((relation) => ({
		targetNodeId: relation.target,
		type: relation.type,
		usePercent: relation.usePercent,
	}));
}

function materializeAssetResource(doc: Document, resource: UamAssetResource): ReturnType<Document['createImageResource']> {
	ensureSupportedResourceKind(resource.kind);
	const image = doc.createImageResource(resource.name);
	image
		.setId(resource.id)
		.setPath(resource.path)
		.setBranch(resource.branch)
		.setBranchItemIds(resource.branchItemIds)
		.setExported(resource.exported)
		.setWidth(resource.dimensions?.width ?? 0)
		.setHeight(resource.dimensions?.height ?? 0);
	if (resource.fileName) image.setFileName(resource.fileName);
	return image;
}

function materializeDisplayNode(
	doc: Document,
	node: UamDisplayNode,
): ReturnType<Document['createGImage']> | ReturnType<Document['createGTextField']> | ReturnType<Document['createGComponent']> {
	ensureSupportedNodeKind(node.kind);

	if (node.kind === 'image') {
		const imageNode = node as UamImageNode;
		const image = doc.createGImage(node.name)
			.setId(node.id)
			.setXY(node.position.x, node.position.y)
			.setSize(node.size.width, node.size.height)
			.setVisible(node.visible)
			.setTouchable(node.touchable)
			.setGrayed(node.grayed)
			.setAlpha(node.alpha)
			.setRotation(node.rotation)
			.setCustomData(node.customData)
			.setSrc(imageNode.resource.resourceId);
		image.setRelations(materializeRelations(node.relations));
		return image;
	}

	if (node.kind === 'text') {
		const textNode = node as UamTextNode;
		const text = doc.createGTextField(node.name)
			.setId(node.id)
			.setXY(node.position.x, node.position.y)
			.setSize(node.size.width, node.size.height)
			.setVisible(node.visible)
			.setTouchable(node.touchable)
			.setGrayed(node.grayed)
			.setAlpha(node.alpha)
			.setRotation(node.rotation)
			.setCustomData(node.customData)
			.setText(textNode.text)
			.setFont(textNode.font)
			.setFontSize(textNode.fontSize)
			.setColor(textNode.color);
		text.setRelations(materializeRelations(node.relations));
		return text;
	}

	const componentNode = node as UamComponentRefNode;
	const component = doc.createGComponent(node.name)
		.setId(node.id)
		.setXY(node.position.x, node.position.y)
		.setSize(node.size.width, node.size.height)
		.setVisible(node.visible)
		.setTouchable(node.touchable)
		.setGrayed(node.grayed)
		.setAlpha(node.alpha)
		.setRotation(node.rotation)
		.setCustomData(node.customData)
		.setSrc(componentNode.resource.resourceId)
		.setPackageId(componentNode.resource.packageId ?? '');
	component.setRelations(materializeRelations(node.relations));
	return component;
}

function composeControllers(doc: Document, component: ReturnType<Document['createComponent']>, controllers: UamControllerModel[]): void {
	for (const controller of controllers) {
		composeController(doc, component, {
			name: controller.name,
			selectedIndex: controller.selectedIndex,
			autoRadioGroupDepth: controller.autoRadioGroupDepth,
			pages: controller.pages.map((page) => ({ id: page.id, name: page.name })),
			actions: controller.actions.map((action) => ({
				name: action.name,
				actionType: action.actionType,
				fromPage: action.fromPageIds,
				toPage: action.toPageIds,
				transitionName: action.transitionName,
				playTimes: action.playTimes,
				delay: action.delay,
				stopOnExit: action.stopOnExit,
				object: action.targetNodeId || null,
				controllerName: action.controllerName,
				targetPage: action.targetPage,
			})),
		});
	}
}

function composeTransitions(doc: Document, component: ReturnType<Document['createComponent']>, transitions: UamComponentModel['transitions']): void {
	for (const transition of transitions) {
		composeTransition(doc, component, {
			name: transition.name,
			autoPlay: transition.autoPlay,
			autoPlayTimes: transition.autoPlayTimes,
			autoPlayDelay: transition.autoPlayDelay,
			options: transition.options,
			fps: transition.fps,
			items: transition.items.map((item) => ({
				name: item.name,
				time: item.time,
				target: item.targetNodeId || null,
				actionType: item.actionType,
				tween: item.tween,
				duration: item.duration,
				startValue: item.startValue,
				endValue: item.endValue,
				easeType: item.easeType,
				repeat: item.repeat,
				yoyo: item.yoyo,
				label: item.label,
				endLabel: item.endLabel,
				path: item.path,
				customEasePath: item.customEasePath,
			})),
		});
	}
}

function materializeLookGear(
	doc: Document,
	component: ReturnType<Document['createComponent']>,
	target: ReturnType<Document['createGImage']> | ReturnType<Document['createGTextField']> | ReturnType<Document['createGComponent']>,
	gear: UamLookGearBinding,
): void {
	const controller = component.getController(gear.controllerName);
	if (!controller) {
		throw new Error(`UAM materialization expected controller "${gear.controllerName}" to exist on component "${component.getName()}".`);
	}

	bindLookGear(doc, component, target, {
		name: gear.name,
		controller,
		states: gear.states.map((state) => ({
			pageId: state.pageId,
			value: state.value,
		})),
		defaultValue: gear.defaultValue,
		condition: gear.condition,
		positionsInPercent: gear.positionsInPercent,
		tween: gear.tween,
		tweenDuration: gear.tweenDuration,
		tweenDelay: gear.tweenDelay,
		easeType: gear.easeType,
		customEasePath: gear.customEasePath,
	});
}

function materializeGears(
	doc: Document,
	component: ReturnType<Document['createComponent']>,
	target: ReturnType<Document['createGImage']> | ReturnType<Document['createGTextField']> | ReturnType<Document['createGComponent']>,
	gears: UamGearBinding[],
): void {
	for (const gear of gears) {
		ensureSupportedGearKind(gear.kind);
		materializeLookGear(doc, component, target, gear as UamLookGearBinding);
	}
}

function materializeComponentResource(doc: Document, resource: UamComponentResource): ReturnType<Document['createComponent']> {
	const component = doc.createComponent(resource.name)
		.setId(resource.id)
		.setPath(resource.path)
		.setBranch(resource.branch)
		.setBranchItemIds(resource.branchItemIds)
		.setExported(resource.exported)
		.setSize(resource.component.size.width, resource.component.size.height)
		.setCustomData(resource.component.customData);

	for (const node of resource.component.displayList) {
		component.addChild(materializeDisplayNode(doc, node));
	}
	composeControllers(doc, component, resource.component.controllers);
	composeTransitions(doc, component, resource.component.transitions);
	for (const node of resource.component.displayList) {
		const target = component.getChildById(node.id);
		if (target) {
			materializeGears(doc, component, target as ReturnType<Document['createGImage']>, node.gears);
		}
	}

	return component;
}

export function materializeUamProject(project: UamProject): Document {
	assertValidUamProject(project);
	const doc = new Document();
	doc.getRoot()
		.setProjectId(project.projectId)
		.setProjectType(project.projectType)
		.setVersion(project.version)
		.setBranches(project.branches)
		.setSettings(cloneSettings(project.settings));

	for (const pkgSpec of project.packages) {
		const pkg = doc.createPackage(pkgSpec.name).setId(pkgSpec.id);
		if (pkgSpec.publish) {
			pkg
				.setPublishName(pkgSpec.publish.name)
				.setPublishPath(pkgSpec.publish.path)
				.setPublishBranchPath(pkgSpec.publish.branchPath)
				.setPublishPackageCount(pkgSpec.publish.packageCount)
				.setGenCode(pkgSpec.publish.genCode)
				.setCodePath(pkgSpec.publish.codePath);
		}
		for (const resource of pkgSpec.resources) {
			if (resource.kind === 'component') {
				pkg.addResource(materializeComponentResource(doc, resource));
			} else {
				pkg.addResource(materializeAssetResource(doc, resource));
			}
		}
	}

	return doc;
}

function liftAssetResource(resource: ReturnType<Document['createImageResource']>): UamAssetResource {
	return {
		kind: 'image',
		id: resource.getId(),
		name: resource.getName(),
		path: resource.getPath(),
		exported: resource.getExported(),
		branch: resource.getBranch(),
		branchItemIds: resource.getBranchItemIds(),
		fileName: resource.getFileName(),
		dimensions: {
			width: resource.getWidth(),
			height: resource.getHeight(),
		},
		metadata: {
			textureSetMode: resource.getTextureSetMode(),
		},
	};
}

function liftGears(gears: ReturnType<ReturnType<Document['createGImage']>['listGears']>): UamGearBinding[] {
	return gears.map((gear) => {
		if (gear.getGearType() !== GearType.Look) {
			throw new Error(`UAM lift does not support gear type "${gear.getGearType()}" in Gate A.`);
		}
		const pages = gear.getPages() ? gear.getPages().split(',') : [];
		const values = gear.getValues() ? gear.getValues().split('|') : [];
		const defaultValue = `${gear.getDefaultValue() ?? ''}`;

		const parseLookValue = (value: string | null) => {
			if (!value || value === '-') return null;
			const parts = value.split(',');
			const parseBool = (raw: string | undefined, fallback: boolean): boolean => {
				if (raw === undefined || raw === '') return fallback;
				const normalized = raw.toLowerCase();
				if (normalized === '1' || normalized === 'true') return true;
				if (normalized === '0' || normalized === 'false') return false;
				return fallback;
			};
			return {
				alpha: Number(parts[0] ?? 1),
				rotation: Number(parts[1] ?? 0),
				grayed: parseBool(parts[2], false),
				touchable: parseBool(parts[3], true),
			};
		};

		return {
			kind: 'look',
			name: gear.getName(),
			controllerName: gear.getController()?.getName() ?? '',
			states: pages.map((pageId, index) => ({
				pageId,
				value: parseLookValue(values[index] ?? null),
			})),
			defaultValue: parseLookValue(defaultValue)!,
			condition: gear.getCondition(),
			positionsInPercent: gear.getPositionsInPercent(),
			tween: gear.getTween(),
			tweenDuration: gear.getTweenDuration(),
			tweenDelay: gear.getTweenDelay(),
			easeType: gear.getEaseType(),
			customEasePath: gear.getCustomEasePath(),
		} satisfies UamLookGearBinding;
	});
}

function liftDisplayNode(
	child: ReturnType<Document['createGImage']> | ReturnType<Document['createGTextField']> | ReturnType<Document['createGComponent']>,
): UamDisplayNode {
	if (child.propertyType === PropertyType.G_IMAGE) {
		const image = child as ReturnType<Document['createGImage']>;
		return {
			kind: 'image',
			id: image.getId(),
			name: image.getName(),
			position: { x: image.getX(), y: image.getY() },
			size: { width: image.getWidth(), height: image.getHeight() },
			visible: image.getVisible(),
			touchable: image.getTouchable(),
			grayed: image.getGrayed(),
			alpha: image.getAlpha(),
			rotation: image.getRotation(),
			customData: image.getCustomData(),
			relations: liftRelations(image.getRelations()),
			gears: liftGears(image.listGears()),
			resource: { resourceId: image.getSrc() },
		};
	}
	if (child.propertyType === PropertyType.G_TEXT_FIELD) {
		const text = child as ReturnType<Document['createGTextField']>;
		return {
			kind: 'text',
			id: text.getId(),
			name: text.getName(),
			position: { x: text.getX(), y: text.getY() },
			size: { width: text.getWidth(), height: text.getHeight() },
			visible: text.getVisible(),
			touchable: text.getTouchable(),
			grayed: text.getGrayed(),
			alpha: text.getAlpha(),
			rotation: text.getRotation(),
			customData: text.getCustomData(),
			relations: liftRelations(text.getRelations()),
			gears: liftGears(text.listGears()),
			text: text.getText(),
			font: text.getFont(),
			fontSize: text.getFontSize(),
			color: text.getColor(),
		};
	}
	if (child.propertyType === PropertyType.G_COMPONENT) {
		const component = child as ReturnType<Document['createGComponent']>;
		return {
			kind: 'component',
			id: component.getId(),
			name: component.getName(),
			position: { x: component.getX(), y: component.getY() },
			size: { width: component.getWidth(), height: component.getHeight() },
			visible: component.getVisible(),
			touchable: component.getTouchable(),
			grayed: component.getGrayed(),
			alpha: component.getAlpha(),
			rotation: component.getRotation(),
			customData: component.getCustomData(),
			relations: liftRelations(component.getRelations()),
			gears: liftGears(component.listGears()),
			resource: { packageId: component.getPackageId(), resourceId: component.getSrc() },
		};
	}

	throw new Error(`UAM lift does not support display node type "${child.propertyType}" in Gate A.`);
}

function liftControllers(component: ReturnType<Document['createComponent']>): UamControllerModel[] {
	return component.listControllers().map((controller) => ({
		name: controller.getName(),
		selectedIndex: controller.getSelectedIndex(),
		autoRadioGroupDepth: controller.getAutoRadioGroupDepth(),
		pages: controller.listPages().map((page) => ({
			id: page.getId(),
			name: page.getName(),
		})),
		actions: controller.listActions().map((action) => ({
			name: action.getName(),
			actionType: action.getActionType(),
			fromPageIds: action.getFromPage(),
			toPageIds: action.getToPage(),
			transitionName: action.getTransitionName(),
			playTimes: action.getPlayTimes(),
			delay: action.getDelay(),
			stopOnExit: action.getStopOnExit(),
			targetNodeId: action.getObjectId(),
			controllerName: action.getControllerName(),
			targetPage: action.getTargetPage(),
		})),
	}));
}

function liftTransitions(component: ReturnType<Document['createComponent']>): UamComponentModel['transitions'] {
	return component.listTransitions().map((transition) => ({
		name: transition.getName(),
		autoPlay: transition.getAutoPlay(),
		autoPlayTimes: transition.getAutoPlayTimes(),
		autoPlayDelay: transition.getAutoPlayDelay(),
		options: transition.getOptions(),
		fps: transition.getFps(),
		items: transition.listItems().map((item) => ({
			name: item.getName(),
			time: item.getTime(),
			actionType: item.getActionType(),
			targetNodeId: item.getTargetId(),
			tween: item.getTween(),
			duration: item.getDuration(),
			startValue: item.getStartValue(),
			endValue: item.getEndValue(),
			easeType: item.getEaseType(),
			repeat: item.getRepeat(),
			yoyo: item.getYoyo(),
			label: item.getLabel(),
			endLabel: item.getEndLabel(),
			path: item.getPath(),
			customEasePath: item.getCustomEasePath(),
		})),
	}));
}

function liftComponentResource(resource: ReturnType<Document['createComponent']>): UamComponentResource {
	return {
		kind: 'component',
		id: resource.getId(),
		name: resource.getName(),
		path: resource.getPath(),
		exported: resource.getExported(),
		branch: resource.getBranch(),
		branchItemIds: resource.getBranchItemIds(),
		component: {
			size: { width: resource.getWidth(), height: resource.getHeight() },
			customData: resource.getCustomData(),
			displayList: resource.listChildren().map((child) => liftDisplayNode(child as ReturnType<Document['createGImage']>)),
			controllers: liftControllers(resource),
			transitions: liftTransitions(resource),
		},
	};
}

export function liftDocumentToUamProject(doc: Document): UamProject {
	const root = doc.getRoot();
	return {
		projectId: root.getProjectId(),
		projectType: root.getProjectType(),
		version: root.getVersion(),
		branches: root.listBranches(),
		settings: cloneSettings(root.getSettings()),
		packages: root.listPackages().map((pkg) => ({
			id: pkg.getId(),
			name: pkg.getName(),
			publish: {
				name: pkg.getPublishName(),
				path: pkg.getPublishPath(),
				branchPath: pkg.getPublishBranchPath(),
				packageCount: pkg.getPublishPackageCount(),
				genCode: pkg.getGenCode(),
				codePath: pkg.getCodePath(),
			},
			resources: pkg.listResources().map((resource) => {
				if (resource.propertyType === 'Component') {
					return liftComponentResource(resource as ReturnType<Document['createComponent']>);
				}
				if (resource.propertyType === 'ImageResource') {
					return liftAssetResource(resource as ReturnType<Document['createImageResource']>);
				}
				throw new Error(`UAM lift does not support resource type "${resource.propertyType}" in Gate A.`);
			}),
		})),
	};
}

export async function writeProjectFromUam(
	io: Pick<PlatformIO, 'writeProject'>,
	project: UamProject,
	projectPath: string,
): Promise<void> {
	await io.writeProject(materializeUamProject(project), projectPath);
}

export async function readProjectAsUam(
	io: Pick<PlatformIO, 'readProject'>,
	projectPath: string,
): Promise<UamProject> {
	return liftDocumentToUamProject(await io.readProject(projectPath));
}
