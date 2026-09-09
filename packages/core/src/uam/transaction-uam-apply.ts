import { applyDisplayNodePropsUpdate } from './property-updates.js';
import type { UamAssetResource, UamComponentResource, UamPackage, UamProject } from './model.js';
import {
	normalizeResourceFolderPath,
	resourceFolderName,
	resourceFolderParentPath,
} from '../utils/resource-folder.js';
import { deriveMovieClipModelFromJta } from '../utils/jta-parser.js';
import { normalizeUamProject } from './normalize.js';
import {
	UamTransactionError,
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
	type UamDisplayListRewriteOperation,
	type UamLifecycleOperation,
	type UamResourceLifecycleOperation,
	type UamResourceFolderLifecycleOperation,
	withDefaultOwnPackageRef,
} from './transaction-shared.js';

function clonePackageSnapshot(project: UamProject, pkg: UamPackage): UamPackage {
	const cloned = normalizeUamProject({ ...project, packages: [pkg] }).packages[0]!;
	for (const resource of cloned.resources) if (resource.kind !== 'component') canonicalizeMovieClipSnapshot(resource);
	return cloned;
}

function canonicalizeMovieClipSnapshot(resource: UamAssetResource): UamAssetResource {
	if (resource.kind !== 'movieClip' || !(resource.sourceBytes instanceof Uint8Array)) return resource;
	const derived = deriveMovieClipModelFromJta(resource.sourceBytes);
	resource.dimensions = { ...derived.dimensions };
	resource.movieClip = {
		interval: derived.interval,
		repeatDelay: derived.repeatDelay,
		swing: derived.swing,
		smoothing: resource.movieClip.smoothing,
		frames: derived.frames.map(({ textureIndex: _textureIndex, ...frame }) => ({ ...frame, spriteId: '' })),
	};
	return resource;
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
	return canonicalizeMovieClipSnapshot(cloned);
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
		case 'addBranch':
			project.branches = [...project.branches, operation.branch].sort((left, right) => left.localeCompare(right));
			return;
		case 'renameBranch': {
			const previousName = operation.selector.branch;
			project.branches = project.branches
				.map((branch) => branch === previousName ? operation.newName : branch)
				.sort((left, right) => left.localeCompare(right));
			for (const pkg of project.packages) {
				pkg.branchNames = pkg.branchNames.map((branch) => branch === previousName ? operation.newName : branch);
				for (const folder of pkg.folders) if (folder.branch === previousName) folder.branch = operation.newName;
				for (const resource of pkg.resources) if (resource.branch === previousName) resource.branch = operation.newName;
			}
			return;
		}
		case 'removeBranch': {
			const branchName = operation.selector.branch;
			project.branches = project.branches.filter((branch) => branch !== branchName);
			for (const pkg of project.packages) {
				const slotIndex = pkg.branchNames.indexOf(branchName);
				if (slotIndex < 0) continue;
				pkg.branchNames.splice(slotIndex, 1);
				for (const resource of pkg.resources) resource.branchItemIds.splice(slotIndex, 1);
			}
			return;
		}
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
			assertInsertionIndex(
				operation.atIndex === undefined ? pkg.resources.length : operation.atIndex,
				pkg.resources.length,
				'addResource.atIndex',
			);
			pkg.resources.splice(
				operation.atIndex === undefined ? pkg.resources.length : operation.atIndex,
				0,
				cloneAssetSnapshot(project, pkg, operation.resource),
			);
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

export function applyUamResourceFolderLifecycleOperation(
	project: UamProject,
	operation: UamResourceFolderLifecycleOperation,
): void {
	const pkg = requirePackageSpec(project, operation.selector.packageId);
	if (operation.kind === 'addResourceFolder') {
		pkg.folders.push({
			branch: operation.branch ?? '',
			path: normalizeResourceFolderPath(operation.path),
			favorite: operation.favorite ?? false,
			atlas: operation.atlas ?? '',
		});
		return;
	}

	const branch = operation.selector.branch ?? '';
	const folderIndex = pkg.folders.findIndex((folder) => (
		folder.branch === branch && folder.path === operation.selector.path
	));
	const folder = pkg.folders[folderIndex];
	if (!folder) {
		throw new Error(`Resource folder "${branch}:${operation.selector.path}" was not found in package "${pkg.id}".`);
	}

	switch (operation.kind) {
		case 'renameResourceFolder':
			folder.path = normalizeResourceFolderPath(
				`${resourceFolderParentPath(folder.path)}/${operation.newName}`,
			);
			return;
		case 'moveResourceFolder':
			folder.path = normalizeResourceFolderPath(`${operation.toPath}/${resourceFolderName(folder.path)}`);
			return;
		case 'removeResourceFolder':
			pkg.folders.splice(folderIndex, 1);
	}
}


export function canApplyOperationsInUam(operations: UamTransactionOperation[]): boolean {
	return operations.every(isUamNativeOperation)
		&& (!operations.some(isDisplayListRewriteOperation)
			|| operations.some(isLifecycleOperation)
			|| operations.some(isResourceLifecycleOperation));
}


function applyUamNativeOperation(project: UamProject, operation: UamTransactionOperation): void {
	switch (operation.kind) {
		case 'updateProjectSettings':
			project.settings = structuredClone(operation.settings);
			return;
		case 'updatePackageSettings': {
			const pkg = requirePackageSpec(project, operation.selector.packageId);
			pkg.compressPNG = operation.settings.compressPNG;
			pkg.jpegQuality = operation.settings.jpegQuality;
			pkg.publish = structuredClone(operation.settings.publish);
			return;
		}
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
		case 'setResourceFolderFavorite': {
			const pkg = requirePackageSpec(project, operation.selector.packageId);
			const branch = operation.selector.branch ?? '';
			const folder = pkg.folders.find((candidate) => (
				candidate.branch === branch && candidate.path === operation.selector.path
			));
			if (!folder) {
				throw new Error(`Resource folder "${branch}:${operation.selector.path}" was not found in package "${pkg.id}".`);
			}
			folder.favorite = operation.favorite;
			return;
		}
		case 'setResourceFolderAtlas': {
			const pkg = requirePackageSpec(project, operation.selector.packageId);
			const branch = operation.selector.branch ?? '';
			const folder = pkg.folders.find((candidate) => (
				candidate.branch === branch && candidate.path === operation.selector.path
			));
			if (!folder) {
				throw new Error(`Resource folder "${branch}:${operation.selector.path}" was not found in package "${pkg.id}".`);
			}
			folder.atlas = operation.atlas;
			return;
		}
		case 'setResourceExported': {
			const found = findResourceSpecWithPath(project, operation.selector);
			if (!found) {
				throw new Error(`Resource "${operation.selector.resourceId}" was not found in package "${operation.selector.packageId}".`);
			}
			found.resource.exported = operation.exported;
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
		case 'addResourceFolder':
		case 'renameResourceFolder':
		case 'moveResourceFolder':
		case 'removeResourceFolder':
			applyUamResourceFolderLifecycleOperation(project, operation);
			return;
		case 'addBranch':
		case 'renameBranch':
		case 'removeBranch':
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
