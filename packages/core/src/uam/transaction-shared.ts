import { PropertyType } from '../constants.js';
import type { UamDisplayNode, UamProject } from './model.js';
import {
	UamTransactionError,
	type UamComponentSelector,
	type UamDisplayNodeSelector,
	type UamResourceSelector,
	type UamTransactionErrorCode,
	type UamTransactionOperation,
} from './transaction-contracts.js';

export type UamLifecycleOperation = Extract<
	UamTransactionOperation,
	{ kind: 'addPackage' | 'renamePackage' | 'removePackage' | 'addComponent' | 'removeComponent' | 'moveComponent' }
>;

export type UamDisplayListRewriteOperation = Extract<
	UamTransactionOperation,
	{ kind: 'attachDisplayNode' | 'detachDisplayNode' }
>;

export type UamResourceLifecycleOperation = Extract<
	UamTransactionOperation,
	{ kind: 'addResource' | 'removeResource' }
>;

export type UamResourceFolderLifecycleOperation = Extract<
	UamTransactionOperation,
	{ kind: 'addResourceFolder' | 'renameResourceFolder' | 'moveResourceFolder' | 'removeResourceFolder' }
>;

export function isLifecycleOperation(operation: UamTransactionOperation): operation is UamLifecycleOperation {
	return operation.kind === 'addPackage'
		|| operation.kind === 'renamePackage'
		|| operation.kind === 'removePackage'
		|| operation.kind === 'addComponent'
		|| operation.kind === 'removeComponent'
		|| operation.kind === 'moveComponent';
}

export function isDisplayListRewriteOperation(operation: UamTransactionOperation): operation is UamDisplayListRewriteOperation {
	return operation.kind === 'attachDisplayNode' || operation.kind === 'detachDisplayNode';
}

export function isResourceLifecycleOperation(operation: UamTransactionOperation): operation is UamResourceLifecycleOperation {
	return operation.kind === 'addResource' || operation.kind === 'removeResource';
}

export function isResourceFolderLifecycleOperation(
	operation: UamTransactionOperation,
): operation is UamResourceFolderLifecycleOperation {
	return operation.kind === 'addResourceFolder'
		|| operation.kind === 'renameResourceFolder'
		|| operation.kind === 'moveResourceFolder'
		|| operation.kind === 'removeResourceFolder';
}

export function isUamNativeOperation(operation: UamTransactionOperation): boolean {
	return operation.kind === 'updateProjectSettings'
		|| operation.kind === 'setComponentProps'
		|| operation.kind === 'setDisplayNodeProps'
		|| operation.kind === 'setResourceFavorite'
		|| operation.kind === 'setResourceFolderFavorite'
		|| operation.kind === 'setResourceExported'
		|| operation.kind === 'setImageResourceProps'
		|| isResourceFolderLifecycleOperation(operation)
		|| isResourceLifecycleOperation(operation)
		|| isLifecycleOperation(operation)
		|| isDisplayListRewriteOperation(operation);
}

export function renamedResourceFileName(previousFileName: string, requestedName: string): string {
	if (requestedName.includes('.')) return requestedName;
	const extensionIndex = previousFileName.lastIndexOf('.');
	return extensionIndex > 0 ? `${requestedName}${previousFileName.slice(extensionIndex)}` : requestedName;
}

export const TEXT_DISPLAY_NODE_KINDS = new Set<UamDisplayNode['kind']>(['text', 'richText', 'textInput']);

export const GROUPABLE_DISPLAY_NODE_KINDS = new Set<UamDisplayNode['kind']>([
	'image',
	'text',
	'richText',
	'textInput',
	'component',
	'list',
	'tree',
	'graph',
	'group',
	'movieClip',
	'button',
	'label',
	'comboBox',
	'progressBar',
	'slider',
	'scrollBar',
]);

export const GROUPABLE_DISPLAY_PROPERTY_TYPES = new Set<string>([
	PropertyType.G_IMAGE,
	PropertyType.G_TEXT_FIELD,
	PropertyType.G_RICH_TEXT_FIELD,
	PropertyType.G_TEXT_INPUT,
	PropertyType.G_COMPONENT,
	PropertyType.G_GRAPH,
	PropertyType.G_GROUP,
	PropertyType.G_LIST,
	PropertyType.G_TREE,
	PropertyType.G_MOVIE_CLIP,
	PropertyType.G_BUTTON,
	PropertyType.G_LABEL,
	PropertyType.G_COMBO_BOX,
	PropertyType.G_PROGRESS_BAR,
	PropertyType.G_SLIDER,
	PropertyType.G_SCROLL_BAR,
]);

export const TEXT_DISPLAY_PROPERTY_TYPES = new Set<string>([
	PropertyType.G_TEXT_FIELD,
	PropertyType.G_RICH_TEXT_FIELD,
	PropertyType.G_TEXT_INPUT,
]);

export const COMMON_DISPLAY_PROPERTY_TYPES = new Set<string>([
	PropertyType.G_IMAGE,
	PropertyType.G_TEXT_FIELD,
	PropertyType.G_RICH_TEXT_FIELD,
	PropertyType.G_TEXT_INPUT,
	PropertyType.G_COMPONENT,
	PropertyType.G_GRAPH,
	PropertyType.G_GROUP,
	PropertyType.G_LIST,
	PropertyType.G_LOADER,
	PropertyType.G_LOADER_3D,
	PropertyType.G_MOVIE_CLIP,
	PropertyType.G_TREE,
	PropertyType.G_BUTTON,
	PropertyType.G_LABEL,
	PropertyType.G_COMBO_BOX,
	PropertyType.G_PROGRESS_BAR,
	PropertyType.G_SLIDER,
	PropertyType.G_SCROLL_BAR,
]);

export function findPackageSpec(project: UamProject, packageId: string): UamProject['packages'][number] | null {
	return project.packages.find((pkg) => pkg.id === packageId) ?? null;
}

export function findResourceSpec(project: UamProject, selector: UamResourceSelector) {
	const pkg = findPackageSpec(project, selector.packageId);
	if (!pkg) return null;
	return pkg.resources.find((resource) => resource.id === selector.resourceId) ?? null;
}

export function findComponentSpec(project: UamProject, selector: UamComponentSelector) {
	const resource = findResourceSpec(project, {
		packageId: selector.packageId,
		resourceId: selector.componentResourceId,
	});
	return resource?.kind === 'component' ? resource : null;
}

export function findDisplayNodeSpec(project: UamProject, selector: UamDisplayNodeSelector) {
	const component = findComponentSpec(project, selector);
	return component?.component.displayList.find((node) => node.id === selector.displayNodeId) ?? null;
}

export function findResourceSpecWithPath(project: UamProject, selector: UamResourceSelector) {
	const packageIndex = project.packages.findIndex((pkg) => pkg.id === selector.packageId);
	if (packageIndex < 0) return null;
	const pkg = project.packages[packageIndex]!;
	const resourceIndex = pkg.resources.findIndex((resource) => resource.id === selector.resourceId);
	if (resourceIndex < 0) return null;
	return {
		pkg,
		resource: pkg.resources[resourceIndex]!,
		path: `packages[${packageIndex}].resources[${resourceIndex}]`,
	};
}

export function findProjectedResource(
	project: UamProject,
	operations: UamTransactionOperation[],
	operationIndex: number,
	selector: UamResourceSelector,
): UamProject['packages'][number]['resources'][number] | null {
	let resource = findResourceSpec(project, selector);
	for (let index = 0; index < operationIndex; index += 1) {
		const operation = operations[index]!;
		if (operation.kind === 'addResource') {
			if (operation.selector.packageId === selector.packageId && operation.resource.id === selector.resourceId) {
				resource = operation.resource;
			}
			continue;
		}
		if (!('selector' in operation) || operation.selector.packageId !== selector.packageId) continue;
		if ('resourceId' in operation.selector && operation.selector.resourceId === selector.resourceId) {
			if (operation.kind === 'removeResource') resource = null;
			if (operation.kind === 'replaceResourceBytes' && resource?.kind !== 'component') {
				resource = { ...resource, sourceBytes: operation.sourceBytes };
			}
			if (operation.kind === 'setImageResourceProps' && resource?.kind === 'image') {
				resource = { ...resource, image: structuredClone(operation.props) };
			}
		}
	}
	return resource;
}

export function findComponentSpecWithPath(project: UamProject, selector: UamComponentSelector) {
	const found = findResourceSpecWithPath(project, {
		packageId: selector.packageId,
		resourceId: selector.componentResourceId,
	});
	if (!found || found.resource.kind !== 'component') return null;
	return {
		pkg: found.pkg,
		resource: found.resource,
		path: found.path,
	};
}

export function findDisplayNodeSpecWithPath(project: UamProject, selector: UamDisplayNodeSelector) {
	const component = findComponentSpecWithPath(project, selector);
	if (!component) return null;
	const nodeIndex = component.resource.component.displayList.findIndex((node) => node.id === selector.displayNodeId);
	if (nodeIndex < 0) return null;
	return {
		pkg: component.pkg,
		component: component.resource,
		node: component.resource.component.displayList[nodeIndex]!,
		path: `${component.path}.component.displayList[${nodeIndex}]`,
	};
}


export function asTransactionError(
	error: unknown,
	defaults: {
		code: UamTransactionErrorCode;
		opIndex?: number;
		opId?: string;
		opKind?: UamTransactionOperation['kind'];
		selector?: Record<string, unknown>;
	},
): UamTransactionError {
	if (error instanceof UamTransactionError) {
		return new UamTransactionError(error.message, {
			code: error.code,
			opIndex: error.opIndex ?? defaults.opIndex,
			opId: error.opId ?? defaults.opId,
			opKind: error.opKind ?? defaults.opKind,
			selector: error.selector ?? defaults.selector,
			issues: error.issues,
			cause: error.cause ?? error,
		});
	}
	return new UamTransactionError(error instanceof Error ? error.message : String(error), {
		code: defaults.code,
		opIndex: defaults.opIndex,
		opId: defaults.opId,
		opKind: defaults.opKind,
		selector: defaults.selector,
		cause: error,
	});
}

export function selectorDetails(selector: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
	return selector;
}


export type UamAttachableDisplayNode = Extract<UamTransactionOperation, { kind: 'attachDisplayNode' }>['node'];

export function withDefaultOwnPackageRef(
	packageId: string,
	node: UamAttachableDisplayNode,
): UamAttachableDisplayNode {
	if ((node.kind === 'image' || node.kind === 'component') && !node.resource.packageId) {
		return {
			...node,
			resource: {
				...node.resource,
				packageId,
			},
		} as UamAttachableDisplayNode;
	}
	return node;
}
