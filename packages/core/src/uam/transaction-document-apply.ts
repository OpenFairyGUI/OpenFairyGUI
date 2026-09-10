import { applyDisplayNodePropsUpdate } from './property-updates.js';
import { liftDisplayNode } from './bridge-lift.js';
import { composeTransition } from '../authoring.js';
import { PropertyType } from '../constants.js';
import type { Document } from '../document.js';
import type { Component } from '../properties/component.js';
import type { Controller } from '../properties/controller.js';
import type { GObject } from '../properties/g-object.js';
import type { Package } from '../properties/package.js';
import type { Transition } from '../properties/transition.js';
import { probeRasterImageDimensions, rasterImageFormatFromFileName } from '../utils/image-info.js';
import {
	applyDerivedMovieClipModel,
	deriveMovieClipModelFromJta,
	type DerivedMovieClipModel,
} from '../utils/jta-parser.js';
import { normalizeResourceFolderPath, resourceFolderName, resourceFolderParentPath } from '../utils/resource-folder.js';
import {
	materializeAssetResource,
	materializeDisplayNode,
	materializeUamGear,
} from './bridge.js';
import {
	materializeDisplayNodeProperties,
	materializeUamController,
	gearTypeForKind,
	materializeUamComponentProperties,
	materializeUamImageResourceProperties,
} from './bridge-materialize.js';
import type {
	UamComponentModel,
	UamControllerModel,
	UamGearBinding,
} from './model.js';
import type {
	UamComponentSelector,
	UamControllerSelector,
	UamDisplayNodeSelector,
	UamGearSelector,
	UamResourceSelector,
	UamTransitionSelector,
	UamTransactionOperation,
} from './transaction-contracts.js';
import { UamTransactionError } from './transaction-contracts.js';
import {
	selectorDetails,
	renamedResourceFileName,
	type UamAttachableDisplayNode,
	withDefaultOwnPackageRef,
} from './transaction-shared.js';

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

function insertResourceAtIndex(
	pkg: Package,
	createResource: () => Parameters<Package['addResource']>[0],
	atIndex: number,
): void {
	const resources = pkg.listResources();
	if (!Number.isInteger(atIndex) || atIndex < 0 || atIndex > resources.length) {
		throw new Error(`addResource.atIndex ${atIndex} is out of bounds for package "${pkg.getId()}".`);
	}
	resources.splice(atIndex, 0, createResource());
	for (const current of pkg.listResources()) pkg.removeResource(current);
	for (const ordered of resources) pkg.addResource(ordered);
}

function replaceControllerModel(
	doc: Document,
	controller: Controller,
	model: UamControllerModel,
): void {
	controller.setName(model.name);
	controller.setAutoRadioGroupDepth(model.autoRadioGroupDepth);
	controller.setAlias(model.alias);
	controller.setExported(model.exported);
	controller.setHomePageType(model.homePageType);
	controller.setHomePage(model.homePage);
	controller.setSelectedIndex(model.selectedIndex);
	for (const action of [...controller.listActions()]) controller.removeAction(action);
	for (const page of [...controller.listPages()]) controller.removePage(page);
	for (const page of model.pages) {
		controller.addPage(doc.createControllerPage(page.name).setId(page.id).setRemark(page.remark));
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
	const transitions = component.listTransitions();
	const following = transitions.slice(transitions.indexOf(transition) + 1);
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
	// Composition appends; restore the original slot without replacing unrelated transitions.
	for (const sibling of following) { component.removeTransition(sibling); component.addTransition(sibling); }
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

function renameBinaryAssetResource(resource: MutableAssetResource, requestedName: string): void {
	const fileName = renamedResourceFileName(getAssetFileName(resource), requestedName);
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

// Payload invariants belong to the ordered preflight; this internal executor resolves live references.
export function applyDocumentOperation(doc: Document, operation: UamTransactionOperation): void {
	switch (operation.kind) {
		case 'updateProjectSettings':
			doc.getRoot().setSettings(structuredClone(operation.settings));
			return;
		case 'updatePackageSettings': {
			const pkg = resolvePackage(doc, operation.selector);
			pkg
				.setCompressPNG(operation.settings.compressPNG)
				.setJpegQuality(operation.settings.jpegQuality);
			if (!operation.settings.publish) {
				pkg
					.setPublishName('')
					.setPublishPath('')
					.setPublishBranchPath('')
					.setPublishPackageCount(0)
					.setGenCode(false)
					.setCodePath('')
					.setSourceAtlasSettings({
						useGlobal: true,
						maxSize: 2048,
						sizeOption: 'pot',
						forceSquare: false,
						allowRotation: false,
						paging: true,
						extractAlpha: false,
						maxIndex: 10,
						atlases: [],
						excludedResourceIds: [],
					});
				return;
			}
			const publish = operation.settings.publish;
			pkg
				.setPublishName(publish.name)
				.setPublishPath(publish.path)
				.setPublishBranchPath(publish.branchPath)
				.setPublishPackageCount(publish.packageCount)
				.setGenCode(publish.genCode)
				.setCodePath(publish.codePath)
				.setSourceAtlasSettings({
					useGlobal: publish.useGlobalAtlasSettings,
					maxSize: publish.maxAtlasSize,
					sizeOption: publish.sizeOption,
					forceSquare: publish.forceSquare,
					allowRotation: publish.allowRotation,
					paging: publish.paging,
					extractAlpha: publish.extractAlpha,
					maxIndex: publish.maxAtlasIndex,
					atlases: publish.atlases,
					excludedResourceIds: publish.excludedResourceIds,
				});
			return;
		}
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
		case 'setResourceFolderAtlas': {
			const pkg = resolvePackage(doc, operation.selector);
			const branch = operation.selector.branch ?? '';
			const folders = pkg.listResourceFolders();
			const folder = folders.find((candidate) => (
				candidate.branch === branch && candidate.path === operation.selector.path
			));
			if (!folder) throw new Error(`Resource folder "${branch}:${operation.selector.path}" was not found.`);
			folder.atlas = operation.atlas;
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
			insertResourceAtIndex(
				pkg,
				() => materializeAssetResource(doc, operation.resource),
				operation.atIndex === undefined ? pkg.listResources().length : operation.atIndex,
			);
			return;
		}
		case 'replaceResourceBytes': {
			const { resource } = resolveResource(doc, operation.selector);
			let imageInfo: ReturnType<typeof probeRasterImageDimensions> = null;
			let movieClipModel: DerivedMovieClipModel | null = null;
			if (resource.propertyType === PropertyType.IMAGE_RESOURCE) {
				const fileName = getAssetFileName(asMutableAssetResource(resource));
				const expectedFormat = rasterImageFormatFromFileName(fileName);
				imageInfo = probeRasterImageDimensions(operation.sourceBytes);
				if (!expectedFormat) {
					throw new Error(`Image resource "${resource.getName()}" uses an unsupported source format.`);
				}
				if (!imageInfo || imageInfo.format !== expectedFormat) {
					throw new Error(`Image replacement bytes do not match source file "${fileName}".`);
				}
			} else if (resource.propertyType === PropertyType.MOVIE_CLIP_RESOURCE) {
				movieClipModel = deriveMovieClipModelFromJta(operation.sourceBytes);
			}
			replaceBinaryAssetBytes(doc, asMutableAssetResource(resource), operation.sourceBytes);
			if (resource.propertyType === PropertyType.IMAGE_RESOURCE && imageInfo) {
				const image = resource as ReturnType<Document['createImageResource']>;
				image.setWidth(imageInfo.width).setHeight(imageInfo.height);
			} else if (resource.propertyType === PropertyType.MOVIE_CLIP_RESOURCE && movieClipModel) {
				applyDerivedMovieClipModel(
					doc,
					resource as ReturnType<Document['createMovieClipResource']>,
					movieClipModel,
				);
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
			const projected = liftDisplayNode(node);
			applyDisplayNodePropsUpdate(projected, operation.props);
			materializeDisplayNodeProperties(node, projected);
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
			if (component.listControllers().some((controller) => controller.getName() === operation.selector.controllerName)) {
				throw new Error(`Controller "${operation.selector.controllerName}" already exists in component "${operation.selector.componentResourceId}".`);
			}
			materializeUamController(doc, component, operation.controller);
			return;
		}
		case 'updateController': {
			const component = resolveComponent(doc, operation.selector);
			const controller = resolveUniqueController(component, operation.selector);
			replaceControllerModel(doc, controller, operation.controller);
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
