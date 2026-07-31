import type { UamAssetResource, UamComponentResource, UamDisplayNode, UamPackage, UamProject } from './model.js';
import { normalizeUamProject } from './normalize.js';
import {
	UamTransactionError,
	type UamDisplayNodePropsUpdate,
	type UamTransactionOperation,
} from './transaction-contracts.js';
import {
	asTransactionError,
	findComponentSpec,
	findComponentSpecWithPath,
	findDisplayNodeSpecWithPath,
	findPackageSpec,
	findResourceSpecWithPath,
	isDisplayListRewriteOperation,
	isLifecycleOperation,
	isResourceLifecycleOperation,
	isUamNativeOperation,
	selectorDetails,
	TEXT_DISPLAY_NODE_KINDS,
	type UamDisplayListRewriteOperation,
	type UamLifecycleOperation,
	type UamResourceLifecycleOperation,
	withDefaultOwnPackageRef,
} from './transaction-shared.js';

function clonePackageSnapshot(project: UamProject, pkg: UamPackage): UamPackage {
	return normalizeUamProject({ ...project, packages: [pkg] }).packages[0]!;
}

function cloneComponentSnapshot(
	project: UamProject,
	pkg: UamPackage,
	component: UamComponentResource,
): UamComponentResource {
	const resource = normalizeUamProject({
		...project,
		packages: [{ ...pkg, resources: [component] }],
	}).packages[0]?.resources[0];
	if (!resource || resource.kind !== 'component') {
		throw new Error('Expected a component lifecycle payload.');
	}
	return resource;
}

function cloneAssetSnapshot(project: UamProject, pkg: UamPackage, resource: UamAssetResource): UamAssetResource {
	const cloned = normalizeUamProject({
		...project,
		packages: [{ ...pkg, resources: [resource] }],
	}).packages[0]?.resources[0];
	if (!cloned || cloned.kind === 'component') throw new Error('Expected a binary resource lifecycle payload.');
	return cloned;
}

function requirePackageSpec(project: UamProject, packageId: string): UamPackage {
	const pkg = findPackageSpec(project, packageId);
	if (!pkg) throw new Error(`Package "${packageId}" was not found.`);
	return pkg;
}

function assertInsertionIndex(index: number, length: number, label: string): void {
	if (!Number.isInteger(index) || index < 0 || index > length) {
		throw new Error(`${label} ${index} is out of bounds.`);
	}
}

export function applyUamLifecycleOperation(project: UamProject, operation: UamLifecycleOperation): void {
	switch (operation.kind) {
		case 'addPackage': {
			if (findPackageSpec(project, operation.package.id)) {
				throw new Error(`Package id "${operation.package.id}" already exists.`);
			}
			if (project.packages.some((pkg) => pkg.name === operation.package.name)) {
				throw new Error(`Package name "${operation.package.name}" already exists.`);
			}
			assertInsertionIndex(operation.atIndex, project.packages.length, 'addPackage.atIndex');
			project.packages.splice(operation.atIndex, 0, clonePackageSnapshot(project, operation.package));
			return;
		}
		case 'renamePackage': {
			const pkg = requirePackageSpec(project, operation.selector.packageId);
			if (project.packages.some((candidate) => candidate !== pkg && candidate.name === operation.newName)) {
				throw new Error(`Package name "${operation.newName}" already exists.`);
			}
			pkg.name = operation.newName;
			return;
		}
		case 'removePackage': {
			const index = project.packages.findIndex((pkg) => pkg.id === operation.selector.packageId);
			if (index < 0) throw new Error(`Package "${operation.selector.packageId}" was not found.`);
			project.packages.splice(index, 1);
			return;
		}
		case 'addComponent': {
			const pkg = requirePackageSpec(project, operation.selector.packageId);
			if (pkg.resources.some((resource) => resource.id === operation.component.id)) {
				throw new Error(`Resource id "${operation.component.id}" already exists in package "${pkg.id}".`);
			}
			assertInsertionIndex(operation.atIndex, pkg.resources.length, 'addComponent.atIndex');
			pkg.resources.splice(operation.atIndex, 0, cloneComponentSnapshot(project, pkg, operation.component));
			return;
		}
		case 'removeComponent': {
			const pkg = requirePackageSpec(project, operation.selector.packageId);
			const index = pkg.resources.findIndex((resource) => resource.id === operation.selector.componentResourceId);
			if (index < 0 || pkg.resources[index]?.kind !== 'component') {
				throw new Error(`Component "${operation.selector.componentResourceId}" was not found in package "${pkg.id}".`);
			}
			pkg.resources.splice(index, 1);
			return;
		}
		case 'moveComponent': {
			const source = requirePackageSpec(project, operation.selector.packageId);
			const target = requirePackageSpec(project, operation.toPackageId);
			if (source === target) throw new Error('moveComponent requires a different destination package.');
			const sourceIndex = source.resources.findIndex((resource) => resource.id === operation.selector.componentResourceId);
			const component = source.resources[sourceIndex];
			if (!component || component.kind !== 'component') {
				throw new Error(`Component "${operation.selector.componentResourceId}" was not found in package "${source.id}".`);
			}
			if (target.resources.some((resource) => resource.id === component.id)) {
				throw new Error(`Resource id "${component.id}" already exists in package "${target.id}".`);
			}
			assertInsertionIndex(operation.toIndex, target.resources.length, 'moveComponent.toIndex');
			source.resources.splice(sourceIndex, 1);
			target.resources.splice(operation.toIndex, 0, component);
			return;
		}
	}
}

export function applyUamDisplayListRewriteOperation(project: UamProject, operation: UamDisplayListRewriteOperation): void {
	switch (operation.kind) {
		case 'attachDisplayNode': {
			const component = findComponentSpec(project, operation.selector);
			if (!component) {
				throw new Error(`Component "${operation.selector.componentResourceId}" was not found in package "${operation.selector.packageId}".`);
			}
			if (component.component.displayList.some((node) => node.id === operation.node.id)) {
				throw new Error(`attachDisplayNode target component "${component.id}" already contains node id "${operation.node.id}".`);
			}
			assertInsertionIndex(operation.atIndex, component.component.displayList.length, 'attachDisplayNode.atIndex');
			component.component.displayList.splice(
				operation.atIndex,
				0,
				structuredClone(withDefaultOwnPackageRef(operation.selector.packageId, operation.node)),
			);
			return;
		}
		case 'detachDisplayNode': {
			const found = findDisplayNodeSpecWithPath(project, operation.selector);
			if (!found) {
				throw new Error(`Display node "${operation.selector.displayNodeId}" was not found in component "${operation.selector.componentResourceId}".`);
			}
			const nodeIndex = found.component.component.displayList.indexOf(found.node);
			found.component.component.displayList.splice(nodeIndex, 1);
			return;
		}
	}
}

export function applyUamResourceLifecycleOperation(
	project: UamProject,
	operation: UamResourceLifecycleOperation,
): void {
	const pkg = requirePackageSpec(project, operation.selector.packageId);
	switch (operation.kind) {
		case 'addResource':
			if (pkg.resources.some((resource) => resource.id === operation.resource.id)) {
				throw new Error(`Resource id "${operation.resource.id}" already exists in package "${pkg.id}".`);
			}
			pkg.resources.push(cloneAssetSnapshot(project, pkg, operation.resource));
			return;
		case 'removeResource': {
			const resourceIndex = pkg.resources.findIndex((resource) => resource.id === operation.selector.resourceId);
			const resource = pkg.resources[resourceIndex];
			if (!resource || resource.kind === 'component') {
				throw new Error(`Binary resource "${operation.selector.resourceId}" was not found in package "${pkg.id}".`);
			}
			pkg.resources.splice(resourceIndex, 1);
		}
	}
}


type UamTextLikeDisplayNode = Extract<UamDisplayNode, { kind: 'text' | 'richText' | 'textInput' }>;

function isTextLikeDisplayNode(node: UamDisplayNode): node is UamTextLikeDisplayNode {
	return TEXT_DISPLAY_NODE_KINDS.has(node.kind);
}

export function canApplyOperationsInUam(operations: UamTransactionOperation[]): boolean {
	return operations.every(isUamNativeOperation)
		&& (!operations.some(isDisplayListRewriteOperation)
			|| operations.some(isLifecycleOperation)
			|| operations.some(isResourceLifecycleOperation));
}

export function applyDisplayNodePropsUpdate(node: UamDisplayNode, props: UamDisplayNodePropsUpdate): void {
	if (props.position !== undefined) node.position = { ...props.position };
	if (props.size !== undefined) node.size = { ...props.size };
	if (props.locked !== undefined) node.locked = props.locked;
	if (props.aspect !== undefined) node.aspect = props.aspect;
	if (props.minSize !== undefined) node.minSize = { ...props.minSize };
	if (props.maxSize !== undefined) node.maxSize = { ...props.maxSize };
	if (props.pivot !== undefined) node.pivot = { ...props.pivot };
	if (props.pivotAsAnchor !== undefined) node.pivotAsAnchor = props.pivotAsAnchor;
	if (props.scale !== undefined) node.scale = { ...props.scale };
	if (props.skew !== undefined) node.skew = { ...props.skew };
	if (props.visible !== undefined) node.visible = props.visible;
	if (props.touchable !== undefined) node.touchable = props.touchable;
	if (props.grayed !== undefined) node.grayed = props.grayed;
	if (props.alpha !== undefined) node.alpha = props.alpha;
	if (props.rotation !== undefined) node.rotation = props.rotation;
	if (props.tooltips !== undefined) node.tooltips = props.tooltips;
	if (props.blendMode !== undefined) node.blendMode = props.blendMode;
	if (props.filter !== undefined) node.filter = props.filter;
	if (props.filterData !== undefined) node.filterData = props.filterData;
	if (props.customData !== undefined) node.customData = props.customData;
	if (props.group !== undefined) {
		if (!('group' in node)) {
			throw new Error(`Group references are not supported on display node kind "${node.kind}".`);
		}
		node.group = props.group;
	}

	if (props.textProperties !== undefined) {
		if (!isTextLikeDisplayNode(node)) {
			throw new Error(`Text display props are not supported on display node kind "${node.kind}".`);
		}
		Object.assign(node, structuredClone(props.textProperties));
	}
	const hasTextProps = props.text !== undefined
		|| props.font !== undefined
		|| props.fontSize !== undefined
		|| props.color !== undefined;
	if (hasTextProps) {
		if (!isTextLikeDisplayNode(node)) {
			throw new Error(`Text display props are not supported on display node kind "${node.kind}".`);
		}
		if (props.text !== undefined) node.text = props.text;
		if (props.font !== undefined) node.font = props.font;
		if (props.fontSize !== undefined) node.fontSize = props.fontSize;
		if (props.color !== undefined) node.color = props.color;
	}
	if (props.graphProperties !== undefined) {
		if (node.kind !== 'graph') {
			throw new Error(`Graph display props are not supported on display node kind "${node.kind}".`);
		}
		Object.assign(node, structuredClone(props.graphProperties));
	}
	if (props.groupProperties !== undefined) {
		if (node.kind !== 'group') {
			throw new Error(`Group display props are not supported on display node kind "${node.kind}".`);
		}
		Object.assign(node, structuredClone(props.groupProperties));
	}
	if (props.loaderProperties !== undefined) {
		if (node.kind !== 'loader') {
			throw new Error(`Loader display props are not supported on display node kind "${node.kind}".`);
		}
		Object.assign(node, structuredClone(props.loaderProperties));
	}
	if (props.listProperties !== undefined) {
		if (node.kind !== 'list' && node.kind !== 'tree') {
			throw new Error(`List display props are not supported on display node kind "${node.kind}".`);
		}
		Object.assign(node, structuredClone(props.listProperties));
	}
	if (props.loader3DProperties !== undefined) {
		if (node.kind !== 'loader3D') {
			throw new Error(`Loader3D display props are not supported on display node kind "${node.kind}".`);
		}
		const properties = props.loader3DProperties;
		Object.assign(node, {
			url: properties.url,
			fill: properties.fill,
			shrinkOnly: properties.shrinkOnly,
			autoSize: properties.autoSize,
			align: properties.align,
			vAlign: properties.vAlign,
			animationName: properties.animationName,
			skinName: properties.skinName,
			playing: properties.playing,
			frame: properties.frame,
			loop: properties.loop,
			color: properties.color,
			clearOnPublish: properties.clearOnPublish,
		});
	}
	if (props.componentInstanceProperties !== undefined) {
		if (node.kind !== 'component') {
			throw new Error(`Component instance props are not supported on display node kind "${node.kind}".`);
		}
		if (props.componentInstanceProperties === null) {
			delete node.instanceProperties;
		} else {
			node.instanceProperties = structuredClone(props.componentInstanceProperties);
		}
	}
}

function applyUamNativeOperation(project: UamProject, operation: UamTransactionOperation): void {
	switch (operation.kind) {
		case 'setComponentProps': {
			const found = findComponentSpecWithPath(project, operation.selector);
			if (!found) {
				throw new Error(`Component "${operation.selector.componentResourceId}" was not found in package "${operation.selector.packageId}".`);
			}
			if (operation.props.size !== undefined) {
				found.resource.component.size = { ...operation.props.size };
			}
			if (operation.props.properties !== undefined) {
				found.resource.component.properties = structuredClone(operation.props.properties);
			}
			return;
		}
		case 'setResourceFavorite': {
			const found = findResourceSpecWithPath(project, operation.selector);
			if (!found) {
				throw new Error(`Resource "${operation.selector.resourceId}" was not found in package "${operation.selector.packageId}".`);
			}
			found.resource.favorite = operation.favorite;
			return;
		}
		case 'setImageResourceProps': {
			const found = findResourceSpecWithPath(project, operation.selector);
			if (!found || found.resource.kind !== 'image') {
				throw new Error(`Image resource "${operation.selector.resourceId}" was not found in package "${operation.selector.packageId}".`);
			}
			found.resource.image = structuredClone(operation.props);
			return;
		}
		case 'setDisplayNodeProps': {
			const found = findDisplayNodeSpecWithPath(project, operation.selector);
			if (!found) {
				throw new Error(`Display node "${operation.selector.displayNodeId}" was not found in component "${operation.selector.componentResourceId}".`);
			}
			applyDisplayNodePropsUpdate(found.node, operation.props);
			return;
		}
		case 'addResource':
		case 'removeResource':
			applyUamResourceLifecycleOperation(project, operation);
			return;
		case 'addPackage':
		case 'renamePackage':
		case 'removePackage':
		case 'addComponent':
		case 'removeComponent':
		case 'moveComponent':
			applyUamLifecycleOperation(project, operation);
			return;
		case 'attachDisplayNode':
		case 'detachDisplayNode':
			applyUamDisplayListRewriteOperation(project, operation);
			return;
		default:
			throw new Error(`UAM-native transaction path does not support operation "${operation.kind}".`);
	}
}

export function applyUamNativeOperations(
	project: UamProject,
	operations: UamTransactionOperation[],
): UamProject {
	const result = normalizeUamProject(project);
	for (const [opIndex, operation] of operations.entries()) {
		try {
			applyUamNativeOperation(result, operation);
		} catch (error) {
			throw asTransactionError(error, {
				code: error instanceof UamTransactionError ? error.code : 'execution_failure',
				opIndex,
				opId: operation.opId,
				opKind: operation.kind,
				selector: 'selector' in operation ? selectorDetails(operation.selector as unknown as Record<string, unknown>) : undefined,
			});
		}
	}
	return normalizeUamProject(result);
}
