import { composeController, composeTransition } from '../authoring.js';
import { GearType, PropertyType } from '../constants.js';
import type { Document } from '../document.js';
import type { Component } from '../properties/component.js';
import type { Controller } from '../properties/controller.js';
import type { GObject } from '../properties/g-object.js';
import type { GLoader3D } from '../properties/g-loader-3d.js';
import type { GTextField } from '../properties/g-text-field.js';
import type { Package } from '../properties/package.js';
import type { Transition } from '../properties/transition.js';
import { tryReadJtaSize } from '../utils/jta-parser.js';
import { normalizeResourceFolderPath, resourceFolderName, resourceFolderParentPath } from '../utils/resource-folder.js';
import {
	materializeAssetResource,
	materializeDisplayNode,
	materializeUamGear,
} from './bridge.js';
import {
	materializeUamComponentInstanceProperties,
	materializeUamComponentProperties,
	materializeUamGraphProperties,
	materializeUamGroupProperties,
	materializeUamImageResourceProperties,
	materializeUamListProperties,
	materializeUamLoaderProperties,
	materializeUamTextProperties,
} from './bridge-materialize.js';
import type {
	UamComponentModel,
	UamControllerModel,
	UamGearBinding,
} from './model.js';
import type {
	UamComponentSelector,
	UamDisplayNodeSelector,
	UamResourceSelector,
	UamTransactionOperation,
} from './transaction-contracts.js';
import {
	COMMON_DISPLAY_PROPERTY_TYPES,
	GROUPABLE_DISPLAY_PROPERTY_TYPES,
	TEXT_DISPLAY_PROPERTY_TYPES,
	type UamAttachableDisplayNode,
	withDefaultOwnPackageRef,
} from './transaction-shared.js';

type CommonDisplayPropTarget = GObject & {
	setXY(x: number, y: number): unknown;
	setSize(width: number, height: number): unknown;
	setVisible(visible: boolean): unknown;
	setTouchable(touchable: boolean): unknown;
	setGrayed(grayed: boolean): unknown;
	setAlpha(alpha: number): unknown;
	setRotation(rotation: number): unknown;
	setCustomData(customData: string): unknown;
	setGroup(group: string): unknown;
};


function resolvePackage(doc: Document, selector: { packageId: string }): Package {
	const pkg = doc.getRoot().getPackageById(selector.packageId);
	if (!pkg) {
		throw new Error(`Package "${selector.packageId}" was not found.`);
	}
	return pkg;
}

function resolveResource(doc: Document, selector: UamResourceSelector) {
	const pkg = resolvePackage(doc, selector);
	const resource = pkg.getResourceById(selector.resourceId);
	if (!resource) {
		throw new Error(`Resource "${selector.resourceId}" was not found in package "${selector.packageId}".`);
	}
	return { pkg, resource };
}

function resolveComponent(doc: Document, selector: UamComponentSelector): Component {
	const { resource } = resolveResource(doc, {
		packageId: selector.packageId,
		resourceId: selector.componentResourceId,
	});
	if (resource.propertyType !== 'Component') {
		throw new Error(`Resource "${selector.componentResourceId}" is not a component.`);
	}
	return resource as Component;
}

function resolveDisplayNode(doc: Document, selector: UamDisplayNodeSelector): GObject {
	const component = resolveComponent(doc, selector);
	const node = component.getChildById(selector.displayNodeId);
	if (!node) {
		throw new Error(`Display node "${selector.displayNodeId}" was not found in component "${selector.componentResourceId}".`);
	}
	return node;
}

function resolveUniqueController(component: Component, selector: UamControllerSelector): Controller {
	const matches = component.listControllers().filter((controller) => controller.getName() === selector.controllerName);
	if (matches.length === 0) {
		throw new Error(`Controller "${selector.controllerName}" was not found in component "${selector.componentResourceId}".`);
	}
		if (matches.length > 1) {
			throw new UamTransactionError(
				`Controller selector "${selector.controllerName}" is ambiguous in component "${selector.componentResourceId}".`,
				{
					code: 'selector_ambiguity',
					selector: selectorDetails(selector as unknown as Record<string, unknown>),
				},
			);
		}
	return matches[0]!;
}

function resolveUniqueTransition(component: Component, selector: UamTransitionSelector): Transition {
	const matches = component.listTransitions().filter((transition) => transition.getName() === selector.transitionName);
	if (matches.length === 0) {
		throw new Error(`Transition "${selector.transitionName}" was not found in component "${selector.componentResourceId}".`);
	}
		if (matches.length > 1) {
			throw new UamTransactionError(
				`Transition selector "${selector.transitionName}" is ambiguous in component "${selector.componentResourceId}".`,
				{
					code: 'selector_ambiguity',
					selector: selectorDetails(selector as unknown as Record<string, unknown>),
				},
			);
		}
	return matches[0]!;
}

function gearTypeForKind(kind: UamGearBinding['kind']): GearType {
	switch (kind) {
		case 'display': return GearType.Display;
		case 'display2': return GearType.Display2;
		case 'xy': return GearType.XY;
		case 'size': return GearType.Size;
		case 'look': return GearType.Look;
		case 'color': return GearType.Color;
		case 'animation': return GearType.Animation;
		case 'text': return GearType.Text;
		case 'icon': return GearType.Icon;
		case 'fontSize': return GearType.FontSize;
	}
}

function hasControllerGear(node: GObject, selector: UamGearSelector): boolean {
	return node.listGears().some((gear) => (
		gear.getGearType() === gearTypeForKind(selector.kind)
		&& gear.getController()?.getName() === selector.controllerName
	));
}

function resolveUniqueGear(node: GObject, selector: UamGearSelector) {
	const matches = node.listGears().filter((gear) => (
		gear.getGearType() === gearTypeForKind(selector.kind)
		&& gear.getController()?.getName() === selector.controllerName
	));
	if (matches.length === 0) {
		throw new Error(`${selector.kind} gear for controller "${selector.controllerName}" was not found on node "${selector.displayNodeId}".`);
	}
	if (matches.length > 1) {
		throw new UamTransactionError(
			`${selector.kind} gear selector is ambiguous on node "${selector.displayNodeId}" for controller "${selector.controllerName}".`,
			{
				code: 'selector_ambiguity',
				selector: selectorDetails(selector as unknown as Record<string, unknown>),
			},
		);
	}
	return matches[0]!;
}

function applyCommonDisplayProps(target: CommonDisplayPropTarget, props: UamDisplayNodePropsUpdate): void {
	if (props.position) target.setXY(props.position.x, props.position.y);
	if (props.size) target.setSize(props.size.width, props.size.height);
	if (props.locked !== undefined) target.setLocked(props.locked);
	if (props.aspect !== undefined) target.setAspect(props.aspect);
	if (props.minSize !== undefined) target.setMinWidth(props.minSize.width).setMinHeight(props.minSize.height);
	if (props.maxSize !== undefined) target.setMaxWidth(props.maxSize.width).setMaxHeight(props.maxSize.height);
	if (props.pivot !== undefined || props.pivotAsAnchor !== undefined) {
		const pivotTarget = target as CommonDisplayPropTarget & {
			getPivotX(): number;
			getPivotY(): number;
			getPivotAsAnchor?(): boolean;
			setPivot(x: number, y: number, anchor?: boolean): unknown;
		};
		if (
			typeof pivotTarget.getPivotX !== 'function'
			|| typeof pivotTarget.getPivotY !== 'function'
			|| typeof pivotTarget.setPivot !== 'function'
		) {
			throw new Error(`Display node type "${target.propertyType}" does not support pivot.`);
		}
		pivotTarget.setPivot(
			props.pivot?.x ?? pivotTarget.getPivotX(),
			props.pivot?.y ?? pivotTarget.getPivotY(),
			props.pivotAsAnchor ?? pivotTarget.getPivotAsAnchor?.() ?? false,
		);
	}
	if (props.scale !== undefined) target.setScale(props.scale.x, props.scale.y);
	if (props.skew !== undefined) target.setSkew(props.skew.x, props.skew.y);
	if (props.visible !== undefined) target.setVisible(props.visible);
	if (props.touchable !== undefined) target.setTouchable(props.touchable);
	if (props.grayed !== undefined) target.setGrayed(props.grayed);
	if (props.alpha !== undefined) target.setAlpha(props.alpha);
	if (props.rotation !== undefined) target.setRotation(props.rotation);
	if (props.tooltips !== undefined) target.setTooltips(props.tooltips);
	if (props.blendMode !== undefined) target.setBlendMode(props.blendMode);
	if (props.filter !== undefined) target.setFilter(props.filter);
	if (props.filterData !== undefined) target.setFilterData(props.filterData);
	if (props.customData !== undefined) target.setCustomData(props.customData);
}

function createAttachableNode(doc: Document, packageId: string, node: UamAttachableDisplayNode): GObject {
	return materializeDisplayNode(doc, withDefaultOwnPackageRef(packageId, node));
}

function reorderChildren(component: Component, orderedChildren: GObject[]): void {
	const currentChildren = [...component.listChildren()];
	for (const child of currentChildren) component.removeChild(child);
	for (const child of orderedChildren) component.addChild(child);
}

function insertChildAtIndex(component: Component, child: GObject, atIndex: number): void {
	const children = [...component.listChildren()];
	if (atIndex < 0 || atIndex > children.length) {
		throw new Error(`attachDisplayNode.atIndex ${atIndex} is out of bounds for component "${component.getId()}".`);
	}
	const orderedChildren = [...children];
	orderedChildren.splice(atIndex, 0, child);
	reorderChildren(component, orderedChildren);
}

function validateControllerModelAgainstComponent(component: Component, model: UamControllerModel, owner: string): void {
	if (model.pages.length === 0) {
		throw new Error(`${owner}: controller "${model.name}" must define at least one page.`);
	}
	const seen = new Set<string>();
	for (const page of model.pages) {
		if (!page.id) {
			throw new Error(`${owner}: controller "${model.name}" has a page with an empty id.`);
		}
		if (seen.has(page.id)) {
			throw new Error(`${owner}: controller "${model.name}" has duplicate page id "${page.id}".`);
		}
		seen.add(page.id);
	}
	if (model.selectedIndex < 0 || model.selectedIndex >= model.pages.length) {
		throw new Error(`${owner}: controller "${model.name}" selectedIndex is out of range.`);
	}
	const pageIds = new Set(model.pages.map((page) => page.id));
	for (const action of model.actions) {
		for (const pageId of action.fromPageIds) {
			if (!pageIds.has(pageId)) throw new Error(`${owner}: controller "${model.name}" action references unknown fromPage id "${pageId}".`);
		}
		for (const pageId of action.toPageIds) {
			if (!pageIds.has(pageId)) throw new Error(`${owner}: controller "${model.name}" action references unknown toPage id "${pageId}".`);
		}
		if (action.targetNodeId && !component.getChildById(action.targetNodeId)) {
			throw new Error(`${owner}: controller "${model.name}" action references unknown target node "${action.targetNodeId}".`);
		}
	}
}

function replaceControllerModel(
	doc: Document,
	component: Component,
	controller: Controller,
	model: UamControllerModel,
): void {
	validateControllerModelAgainstComponent(component, model, 'updateController');
	controller.setName(model.name);
	controller.setAutoRadioGroupDepth(model.autoRadioGroupDepth);
	controller.setSelectedIndex(model.selectedIndex);
	for (const action of [...controller.listActions()]) controller.removeAction(action);
	for (const page of [...controller.listPages()]) controller.removePage(page);
	for (const page of model.pages) {
		controller.addPage(doc.createControllerPage(page.name).setId(page.id));
	}
	for (const actionModel of model.actions) {
		controller.addAction(
			doc.createControllerAction(actionModel.name)
				.setActionType(actionModel.actionType)
				.setFromPage([...actionModel.fromPageIds])
				.setToPage([...actionModel.toPageIds])
				.setTransitionName(actionModel.transitionName)
				.setPlayTimes(actionModel.playTimes)
				.setDelay(actionModel.delay)
				.setStopOnExit(actionModel.stopOnExit)
				.setObjectId(actionModel.targetNodeId)
				.setControllerName(actionModel.controllerName)
				.setTargetPage(actionModel.targetPage),
		);
	}
}

function replaceTransitionModel(
	doc: Document,
	component: Component,
	transition: Transition,
	model: UamComponentModel['transitions'][number],
): void {
	component.removeTransition(transition);
	composeTransition(doc, component, {
		name: model.name,
		autoPlay: model.autoPlay,
		autoPlayTimes: model.autoPlayTimes,
		autoPlayDelay: model.autoPlayDelay,
		options: model.options,
		fps: model.fps,
		items: model.items.map((item) => ({
			name: item.name,
			time: item.time,
			target: item.targetNodeId || null,
			actionType: item.actionType,
			tween: item.tween,
			duration: item.duration,
			startValue: [...item.startValue],
			endValue: [...item.endValue],
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

type ResourceSourceData = {
	getURI(): string;
	getData(): Uint8Array | null;
};

type MutableAssetResource = {
	propertyType: string;
	getName(): string;
	setName(name: string): unknown;
	getPath(): string;
	setPath(path: string): unknown;
	getFileName?(): string;
	setFileName?(fileName: string): unknown;
	getFile?(): string;
	setFile?(file: string): unknown;
	getSourceData(): ResourceSourceData | null;
	setSourceData(buffer: ReturnType<Document['createBuffer']> | null): unknown;
};

function asMutableAssetResource(resource: ReturnType<Package['getResourceById']>): MutableAssetResource {
	if (!resource || resource.propertyType === PropertyType.COMPONENT) {
		throw new Error('Expected a binary package resource.');
	}
	return resource as unknown as MutableAssetResource;
}

function getAssetFileName(resource: MutableAssetResource): string {
	return resource.getFileName?.() ?? resource.getFile?.() ?? '';
}

function setAssetFileName(resource: MutableAssetResource, fileName: string): void {
	if (resource.setFileName) {
		resource.setFileName(fileName);
		return;
	}
	if (resource.setFile) {
		resource.setFile(fileName);
		return;
	}
	throw new Error(`Resource "${resource.getName()}" does not expose a primary source file name.`);
}

function resourceNameFromFileName(fileName: string): string {
	const extensionIndex = fileName.lastIndexOf('.');
	return extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
}

function renamedAssetFileName(resource: MutableAssetResource, requestedName: string): string {
	if (requestedName.includes('.')) return requestedName;
	const previousFileName = getAssetFileName(resource);
	const extensionIndex = previousFileName.lastIndexOf('.');
	return extensionIndex > 0 ? `${requestedName}${previousFileName.slice(extensionIndex)}` : requestedName;
}

function renameBinaryAssetResource(resource: MutableAssetResource, requestedName: string): void {
	const fileName = renamedAssetFileName(resource, requestedName);
	if (!fileName) throw new Error(`Resource "${resource.getName()}" does not define a primary source file.`);
	setAssetFileName(resource, fileName);
	resource.setName(resourceNameFromFileName(fileName));
}

function replaceBinaryAssetBytes(doc: Document, resource: MutableAssetResource, sourceBytes: Uint8Array): void {
	const previousSource = resource.getSourceData();
	if (!previousSource) {
		throw new Error(`Resource "${resource.getName()}" has no hydrated primary source bytes.`);
	}
	const sourcePath = previousSource.getURI() || `/${[resource.getPath(), getAssetFileName(resource)].filter(Boolean).join('/')}`;
	resource.setSourceData(doc.createBuffer()
		.setURI(sourcePath)
		.setData(new Uint8Array(sourceBytes)));
}

function addGearToDisplayNode(
	doc: Document,
	component: Component,
	node: GObject,
	selector: UamGearSelector,
	gear: UamGearBinding,
): void {
	if (hasControllerGear(node, selector)) {
		throw new UamTransactionError(
			`${selector.kind} gear for controller "${selector.controllerName}" already exists on node "${selector.displayNodeId}".`,
			{
				code: 'selector_ambiguity',
				selector: selectorDetails(selector as unknown as Record<string, unknown>),
			},
		);
	}
	resolveUniqueController(component, {
		packageId: selector.packageId,
		componentResourceId: selector.componentResourceId,
		controllerName: selector.controllerName,
	});
	materializeUamGear(doc, component, node, gear);
}

function replaceGearOnDisplayNode(
	doc: Document,
	component: Component,
	node: GObject,
	selector: UamGearSelector,
	gear: UamGearBinding,
): void {
	node.removeGear(resolveUniqueGear(node, selector));
	resolveUniqueController(component, {
		packageId: selector.packageId,
		componentResourceId: selector.componentResourceId,
		controllerName: selector.controllerName,
	});
	materializeUamGear(doc, component, node, gear);
}

export function applyDocumentOperation(doc: Document, operation: UamTransactionOperation): void {
	switch (operation.kind) {
		case 'renameResource': {
			const { resource } = resolveResource(doc, operation.selector);
			if (resource.propertyType === PropertyType.COMPONENT) {
				resource.setName(operation.newName);
				return;
			}
			renameBinaryAssetResource(asMutableAssetResource(resource), operation.newName);
			return;
		}
		case 'moveResource': {
			const { resource } = resolveResource(doc, operation.selector);
			resource.setPath(operation.toPath);
			return;
		}
		case 'setResourceFavorite': {
			resolveResource(doc, operation.selector).resource.setFavorite(operation.favorite);
			return;
		}
		case 'setResourceFolderFavorite': {
			const pkg = resolvePackage(doc, operation.selector);
			const branch = operation.selector.branch ?? '';
			const folders = pkg.listResourceFolders();
			const folder = folders.find((candidate) => (
				candidate.branch === branch && candidate.path === operation.selector.path
			));
			if (!folder) throw new Error(`Resource folder "${branch}:${operation.selector.path}" was not found.`);
			folder.favorite = operation.favorite;
			pkg.setResourceFolders(folders);
			return;
		}
		case 'setResourceExported': {
			resolveResource(doc, operation.selector).resource.setExported(operation.exported);
			return;
		}
		case 'addResourceFolder': {
			const pkg = resolvePackage(doc, operation.selector);
			pkg.setResourceFolders([...pkg.listResourceFolders(), {
				branch: operation.branch ?? '',
				path: operation.path,
				favorite: operation.favorite ?? false,
				atlas: operation.atlas ?? '',
			}]);
			return;
		}
		case 'renameResourceFolder':
		case 'moveResourceFolder':
		case 'removeResourceFolder': {
			const pkg = resolvePackage(doc, operation.selector);
			const branch = operation.selector.branch ?? '';
			const folders = pkg.listResourceFolders();
			const index = folders.findIndex((folder) => (
				folder.branch === branch && folder.path === operation.selector.path
			));
			if (index < 0) throw new Error(`Resource folder "${branch}:${operation.selector.path}" was not found.`);
			if (operation.kind === 'removeResourceFolder') {
				folders.splice(index, 1);
			} else if (operation.kind === 'renameResourceFolder') {
				folders[index]!.path = normalizeResourceFolderPath(
					`${resourceFolderParentPath(folders[index]!.path)}/${operation.newName}`,
				);
			} else {
				folders[index]!.path = normalizeResourceFolderPath(
					`${operation.toPath}/${resourceFolderName(folders[index]!.path)}`,
				);
			}
			pkg.setResourceFolders(folders);
			return;
		}
		case 'setImageResourceProps': {
			const { resource } = resolveResource(doc, operation.selector);
			if (resource.propertyType !== PropertyType.IMAGE_RESOURCE) {
				throw new Error(`setImageResourceProps requires an image resource, received "${resource.propertyType}".`);
			}
			materializeUamImageResourceProperties(
				resource as ReturnType<Document['createImageResource']>,
				operation.props,
			);
			return;
		}
		case 'addResource': {
			const pkg = resolvePackage(doc, operation.selector);
			if (pkg.getResourceById(operation.resource.id)) {
				throw new Error(`Resource "${operation.resource.id}" already exists in package "${operation.selector.packageId}".`);
			}
			pkg.addResource(materializeAssetResource(doc, operation.resource));
			return;
		}
		case 'replaceResourceBytes': {
			const { resource } = resolveResource(doc, operation.selector);
			replaceBinaryAssetBytes(doc, asMutableAssetResource(resource), operation.sourceBytes);
			if (resource.propertyType === PropertyType.MOVIE_CLIP_RESOURCE) {
				const size = tryReadJtaSize(operation.sourceBytes);
				if (size) {
					const movieClip = resource as ReturnType<Document['createMovieClipResource']>;
					movieClip.setWidth(size.width).setHeight(size.height);
				}
			}
			return;
		}
		case 'removeResource': {
			const { pkg, resource } = resolveResource(doc, operation.selector);
			if (resource.propertyType === PropertyType.COMPONENT) {
				throw new Error('removeResource only supports binary package resources.');
			}
			pkg.removeResource(resource);
			return;
		}
		case 'setComponentProps': {
			const component = resolveComponent(doc, operation.selector);
			if (operation.props.size !== undefined) {
				component.setSize(operation.props.size.width, operation.props.size.height);
			}
			if (operation.props.properties !== undefined) {
				materializeUamComponentProperties(component, operation.props.properties);
			}
			return;
		}
		case 'setDisplayNodeProps': {
			const node = resolveDisplayNode(doc, operation.selector);
			if (!COMMON_DISPLAY_PROPERTY_TYPES.has(node.propertyType)) {
				throw new Error(`setDisplayNodeProps does not support display node type "${node.propertyType}" in Phase A.`);
			}
			applyCommonDisplayProps(node as CommonDisplayPropTarget, operation.props);
			if (operation.props.group !== undefined) {
				if (!GROUPABLE_DISPLAY_PROPERTY_TYPES.has(node.propertyType)) {
					throw new Error(`Group references are not supported on display node type "${node.propertyType}".`);
				}
				(node as CommonDisplayPropTarget).setGroup(operation.props.group);
			}
			if (TEXT_DISPLAY_PROPERTY_TYPES.has(node.propertyType)) {
				const textNode = node as GTextField;
				if (operation.props.textProperties !== undefined) {
					materializeUamTextProperties(textNode, operation.props.textProperties);
				}
				if (operation.props.text !== undefined) textNode.setText(operation.props.text);
				if (operation.props.font !== undefined) textNode.setFont(operation.props.font);
				if (operation.props.fontSize !== undefined) textNode.setFontSize(operation.props.fontSize);
				if (operation.props.color !== undefined) textNode.setColor(operation.props.color);
			}
			if (operation.props.graphProperties !== undefined) {
				if (node.propertyType !== PropertyType.G_GRAPH) {
					throw new Error(`Graph display props are not supported on display node type "${node.propertyType}".`);
				}
				materializeUamGraphProperties(
					node as ReturnType<Document['createGGraph']>,
					operation.props.graphProperties,
				);
			}
			if (operation.props.groupProperties !== undefined) {
				if (node.propertyType !== PropertyType.G_GROUP) {
					throw new Error(`Group display props are not supported on display node type "${node.propertyType}".`);
				}
				materializeUamGroupProperties(
					node as ReturnType<Document['createGGroup']>,
					operation.props.groupProperties,
				);
			}
			if (operation.props.loaderProperties !== undefined) {
				if (node.propertyType !== PropertyType.G_LOADER) {
					throw new Error(`Loader display props are not supported on display node type "${node.propertyType}".`);
				}
				materializeUamLoaderProperties(
					node as ReturnType<Document['createGLoader']>,
					operation.props.loaderProperties,
				);
			}
			if (operation.props.listProperties !== undefined) {
				if (node.propertyType !== PropertyType.G_LIST && node.propertyType !== PropertyType.G_TREE) {
					throw new Error(`List display props are not supported on display node type "${node.propertyType}".`);
				}
				materializeUamListProperties(
					node as ReturnType<Document['createGList']> | ReturnType<Document['createGTree']>,
					operation.props.listProperties,
				);
			}
			if (operation.props.loader3DProperties !== undefined) {
				if (node.propertyType !== PropertyType.G_LOADER_3D) {
					throw new Error(`Loader3D display props are not supported on display node type "${node.propertyType}".`);
				}
				const properties = operation.props.loader3DProperties;
				(node as GLoader3D)
					.setUrl(properties.url)
					.setFill(properties.fill)
					.setShrinkOnly(properties.shrinkOnly)
					.setAutoSize(properties.autoSize)
					.setAlign(properties.align)
					.setVAlign(properties.vAlign)
					.setAnimationName(properties.animationName)
					.setSkinName(properties.skinName)
					.setPlaying(properties.playing)
					.setFrame(properties.frame)
					.setLoop(properties.loop)
					.setColor(properties.color)
					.setClearOnPublish(properties.clearOnPublish);
			}
			if (operation.props.componentInstanceProperties !== undefined) {
				if (node.propertyType !== PropertyType.G_COMPONENT) {
					throw new Error(`Component instance props are not supported on display node type "${node.propertyType}".`);
				}
				materializeUamComponentInstanceProperties(
					node as ReturnType<Document['createGComponent']>,
					operation.props.componentInstanceProperties,
				);
			}
			return;
		}
		case 'attachDisplayNode': {
			const component = resolveComponent(doc, operation.selector);
			if (component.getChildById(operation.node.id)) {
				throw new Error(`attachDisplayNode target component "${component.getId()}" already contains node id "${operation.node.id}".`);
			}
			const child = createAttachableNode(doc, operation.selector.packageId, operation.node);
			insertChildAtIndex(component, child, operation.atIndex);
			for (const gear of operation.node.gears) {
				addGearToDisplayNode(doc, component, child, {
					packageId: operation.selector.packageId,
					componentResourceId: operation.selector.componentResourceId,
					displayNodeId: operation.node.id,
					kind: gear.kind,
					controllerName: gear.controllerName,
				}, gear);
			}
			return;
		}
		case 'detachDisplayNode': {
			const component = resolveComponent(doc, operation.selector);
			const node = component.getChildById(operation.selector.displayNodeId);
			if (!node) {
				throw new Error(`Display node "${operation.selector.displayNodeId}" was not found in component "${operation.selector.componentResourceId}".`);
			}
			component.removeChild(node);
			return;
		}
		case 'addController': {
			const component = resolveComponent(doc, operation.selector);
			validateControllerModelAgainstComponent(component, operation.controller, 'addController');
			if (component.listControllers().some((controller) => controller.getName() === operation.selector.controllerName)) {
				throw new Error(`Controller "${operation.selector.controllerName}" already exists in component "${operation.selector.componentResourceId}".`);
			}
			composeController(doc, component, {
				name: operation.controller.name,
				selectedIndex: operation.controller.selectedIndex,
				autoRadioGroupDepth: operation.controller.autoRadioGroupDepth,
				pages: operation.controller.pages.map((page) => ({ id: page.id, name: page.name })),
				actions: operation.controller.actions.map((action) => ({
					name: action.name,
					actionType: action.actionType,
					fromPage: [...action.fromPageIds],
					toPage: [...action.toPageIds],
					transitionName: action.transitionName,
					playTimes: action.playTimes,
					delay: action.delay,
					stopOnExit: action.stopOnExit,
					object: action.targetNodeId || null,
					controllerName: action.controllerName,
					targetPage: action.targetPage,
				})),
			});
			return;
		}
		case 'updateController': {
			const component = resolveComponent(doc, operation.selector);
			validateControllerModelAgainstComponent(component, operation.controller, 'updateController');
			const controller = resolveUniqueController(component, operation.selector);
			replaceControllerModel(doc, component, controller, operation.controller);
			return;
		}
		case 'removeController': {
			const component = resolveComponent(doc, operation.selector);
			const controller = resolveUniqueController(component, operation.selector);
			for (const child of component.listChildren()) {
				if (child.listGears().some((gear) => gear.getController() === controller)) {
					throw new Error(`Cannot remove controller "${controller.getName()}" while a child gear still references it.`);
				}
			}
			component.removeController(controller);
			return;
		}
		case 'addTransition': {
			const component = resolveComponent(doc, operation.selector);
			if (component.listTransitions().some((transition) => transition.getName() === operation.selector.transitionName)) {
				throw new Error(`Transition "${operation.selector.transitionName}" already exists in component "${operation.selector.componentResourceId}".`);
			}
			composeTransition(doc, component, {
				name: operation.transition.name,
				autoPlay: operation.transition.autoPlay,
				autoPlayTimes: operation.transition.autoPlayTimes,
				autoPlayDelay: operation.transition.autoPlayDelay,
				options: operation.transition.options,
				fps: operation.transition.fps,
				items: operation.transition.items.map((item) => ({
					name: item.name,
					time: item.time,
					target: item.targetNodeId || null,
					actionType: item.actionType,
					tween: item.tween,
					duration: item.duration,
					startValue: [...item.startValue],
					endValue: [...item.endValue],
					easeType: item.easeType,
					repeat: item.repeat,
					yoyo: item.yoyo,
					label: item.label,
					endLabel: item.endLabel,
					path: item.path,
					customEasePath: item.customEasePath,
				})),
			});
			return;
		}
		case 'updateTransition': {
			const component = resolveComponent(doc, operation.selector);
			const transition = resolveUniqueTransition(component, operation.selector);
			replaceTransitionModel(doc, component, transition, operation.transition);
			return;
		}
		case 'removeTransition': {
			const component = resolveComponent(doc, operation.selector);
			const transition = resolveUniqueTransition(component, operation.selector);
			component.removeTransition(transition);
			return;
		}
		case 'addLookGear':
		case 'addGear': {
			const component = resolveComponent(doc, operation.selector);
			const node = resolveDisplayNode(doc, operation.selector);
			addGearToDisplayNode(doc, component, node, operation.selector, operation.gear);
			return;
		}
		case 'updateLookGear':
		case 'updateGear': {
			const component = resolveComponent(doc, operation.selector);
			const node = resolveDisplayNode(doc, operation.selector);
			replaceGearOnDisplayNode(doc, component, node, operation.selector, operation.gear);
			return;
		}
		case 'removeLookGear':
		case 'removeGear': {
			const node = resolveDisplayNode(doc, operation.selector);
			node.removeGear(resolveUniqueGear(node, operation.selector));
			return;
		}
		default:
			throw new Error(`Document transaction path does not support operation "${operation.kind}".`);
	}
}
