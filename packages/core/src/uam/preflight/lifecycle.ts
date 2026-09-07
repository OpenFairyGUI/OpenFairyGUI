import type { UamComponentResource, UamDisplayNode, UamPackage, UamProject } from '../model.js';
import { deriveMovieClipModelFromJta } from '../../utils/jta-parser.js';
import {
	normalizeResourceFolderPath,
	resourceFolderName,
	resourceFolderParentPath,
} from '../../utils/resource-folder.js';
import { normalizeUamProject } from '../normalize.js';
import { validateUamProject } from '../validate.js';
import type { UamTransactionOperation, UamTransactionSupportIssue } from '../transaction-contracts.js';
import {
	findComponentSpec,
	findDisplayNodeSpec,
	findPackageSpec,
	findProjectedResource,
	isDisplayListRewriteOperation,
	isLifecycleOperation,
	isResourceLifecycleOperation,
	isResourceFolderLifecycleOperation,
} from '../transaction-shared.js';
import {
	applyDisplayNodePropsUpdate,
	applyUamDisplayListRewriteOperation,
	applyUamLifecycleOperation,
	applyUamResourceLifecycleOperation,
	applyUamResourceFolderLifecycleOperation,
} from '../transaction-uam-apply.js';
import {
	pushSupportIssue,
	validateSupportedDisplayNode,
	validateTouchedDisplayNodeKind,
	validateLifecyclePackageSelector,
	validateLifecycleComponentSelector,
} from './support.js';
import { validateDisplayPropsPayload } from './display.js';
import { isSafePackageName, isSafeBranchName } from './values.js';
import { validatePackageSettingsPayload } from './settings.js';
import {
	isSafeResourceFolderPath,
	folderBranch,
	findResourceFolder,
	folderContainsItems,
	folderPathConflictsWithResource,
	folderParentExists,
	validateResourceFolderSelector,
	resourceFolderMaxAtlasIndexAt,
	validateResourceFolderAtlas,
} from './resource-folders.js';
import { validateAssetResourcePayload } from './resources.js';

function validatePackagePayload(
	project: UamProject,
	pkg: UamPackage,
	path: string,
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
): void {
	if (!pkg.id) {
		pushSupportIssue(issues, 'invalid_package_payload', `${path}.id`, 'Package id must not be empty.', { operationKind });
	}
	if (!isSafePackageName(pkg.name)) {
		pushSupportIssue(issues, 'invalid_package_payload', `${path}.name`, 'Package name must be a safe output path segment.', { operationKind });
	}
	validatePackageSettingsPayload({
		compressPNG: pkg.compressPNG,
		jpegQuality: pkg.jpegQuality,
		publish: pkg.publish,
	}, path, issues, operationKind);

	const standalone = normalizeUamProject({ ...project, packages: [pkg] });
	for (const issue of validateUamProject(standalone)) {
		const suffix = issue.path.startsWith('packages[0]') ? issue.path.slice('packages[0]'.length) : `.${issue.path}`;
		pushSupportIssue(issues, 'invalid_package_payload', `${path}${suffix}`, issue.message, { operationKind });
	}

	for (const [resourceIndex, resource] of pkg.resources.entries()) {
		const resourcePath = `${path}.resources[${resourceIndex}]`;
		if (resource.kind !== 'component' && !(resource.sourceBytes instanceof Uint8Array)) {
			pushSupportIssue(
				issues,
				'unavailable_resource_source_bytes',
				`${resourcePath}.sourceBytes`,
				'Added package assets must provide primary source bytes.',
				{ operationKind, resourceKind: resource.kind },
			);
		}
		if (resource.kind === 'movieClip' && resource.sourceBytes instanceof Uint8Array) {
			try {
				deriveMovieClipModelFromJta(resource.sourceBytes);
			} catch (error) {
				pushSupportIssue(
					issues,
					'invalid_movie_clip_jta',
					`${resourcePath}.sourceBytes`,
					`MovieClip source bytes must contain a valid JTA payload: ${error instanceof Error ? error.message : String(error)}`,
					{ operationKind, resourceKind: resource.kind },
				);
			}
		}
		if (resource.kind !== 'component') continue;
		for (const [nodeIndex, node] of resource.component.displayList.entries()) {
			validateSupportedDisplayNode(node, pkg.id, `${resourcePath}.component.displayList[${nodeIndex}]`, issues, {
				operationKind,
			});
		}
	}
}

function validateComponentPayload(
	project: UamProject,
	pkg: UamPackage,
	component: UamComponentResource,
	path: string,
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
): void {
	if (!component.id) {
		pushSupportIssue(issues, 'invalid_component_payload', `${path}.id`, 'Component id must not be empty.', { operationKind });
	}
	const standalone = normalizeUamProject({
		...project,
		packages: [{ ...pkg, resources: [component] }],
	});
	for (const issue of validateUamProject(standalone)) {
		const prefix = 'packages[0].resources[0]';
		const suffix = issue.path.startsWith(prefix) ? issue.path.slice(prefix.length) : `.${issue.path}`;
		pushSupportIssue(issues, 'invalid_component_payload', `${path}${suffix}`, issue.message, { operationKind });
	}
	for (const [nodeIndex, node] of component.component.displayList.entries()) {
		validateSupportedDisplayNode(node, pkg.id, `${path}.component.displayList[${nodeIndex}]`, issues, {
			operationKind,
		});
	}
}

function validateLifecycleInsertionIndex(
	index: number,
	maximum: number,
	path: string,
	code: 'invalid_package_index' | 'invalid_component_index' | 'invalid_resource_index',
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
): void {
	if (Number.isInteger(index) && index >= 0 && index <= maximum) return;
	pushSupportIssue(
		issues,
		code,
		path,
		`Insertion index must be an integer between 0 and ${maximum}.`,
		{ operationKind },
	);
}

function nodeReferencesPackage(node: UamDisplayNode, ownerPackageId: string, packageId: string): boolean {
	const resourceNode = node as UamDisplayNode & { resource?: { packageId?: string; resourceId?: string } };
	if (resourceNode.resource?.resourceId && (resourceNode.resource.packageId || ownerPackageId) === packageId) {
		return true;
	}
	const derivedNode = node as UamDisplayNode & { packageId?: string; src?: string };
	return !!derivedNode.src && (derivedNode.packageId || ownerPackageId) === packageId;
}

function getComponentReference(
	node: UamDisplayNode,
	ownerPackageId: string,
): { packageId: string; componentId: string } | null {
	if (node.kind === 'component') {
		return {
			packageId: node.resource.packageId || ownerPackageId,
			componentId: node.resource.resourceId,
		};
	}
	const derivedNode = node as UamDisplayNode & { packageId?: string; src?: string };
	if (!derivedNode.src) return null;
	return {
		packageId: derivedNode.packageId || ownerPackageId,
		componentId: derivedNode.src,
	};
}

function nodeReferencesComponent(
	node: UamDisplayNode,
	ownerPackageId: string,
	packageId: string,
	componentId: string,
): boolean {
	const reference = getComponentReference(node, ownerPackageId);
	return reference?.packageId === packageId && reference.componentId === componentId;
}

function findExternalPackageReference(project: UamProject, packageId: string): string | null {
	for (const [packageIndex, pkg] of project.packages.entries()) {
		if (pkg.id === packageId) continue;
		for (const [resourceIndex, resource] of pkg.resources.entries()) {
			if (resource.kind !== 'component') continue;
			for (const [nodeIndex, node] of resource.component.displayList.entries()) {
				if (nodeReferencesPackage(node, pkg.id, packageId)) {
					return `packages[${packageIndex}].resources[${resourceIndex}].component.displayList[${nodeIndex}]`;
				}
			}
		}
	}
	return null;
}

function findExternalComponentReference(project: UamProject, packageId: string, componentId: string): string | null {
	for (const [packageIndex, pkg] of project.packages.entries()) {
		for (const [resourceIndex, resource] of pkg.resources.entries()) {
			if (resource.kind !== 'component') continue;
			if (pkg.id === packageId && resource.id === componentId) continue;
			for (const [nodeIndex, node] of resource.component.displayList.entries()) {
				if (nodeReferencesComponent(node, pkg.id, packageId, componentId)) {
					return `packages[${packageIndex}].resources[${resourceIndex}].component.displayList[${nodeIndex}]`;
				}
			}
		}
	}
	return null;
}

function findComponentPackageDependency(
	component: UamComponentResource,
	ownerPackageId: string,
	dependencyPackageId: string,
	path: string,
): string | null {
	for (const [nodeIndex, node] of component.component.displayList.entries()) {
		if (nodeReferencesPackage(node, ownerPackageId, dependencyPackageId)) {
			return `${path}.component.displayList[${nodeIndex}]`;
		}
	}
	return null;
}

function findComponentPackageByIdentity(project: UamProject, component: UamComponentResource): UamPackage | null {
	return project.packages.find((pkg) => pkg.resources.some((resource) => resource === component)) ?? null;
}

function projectContainsDisplayNode(project: UamProject, target: UamDisplayNode): boolean {
	return project.packages.some((pkg) => pkg.resources.some((resource) => (
		resource.kind === 'component' && resource.component.displayList.includes(target)
	)));
}

type UamLifecycleReferenceCheck =
	| {
		kind: 'removePackage';
		packageId: string;
		path: string;
		operationKind: 'removePackage';
	}
	| {
		kind: 'removeComponent';
		packageId: string;
		componentId: string;
		path: string;
		operationKind: 'removeComponent';
	}
	| {
		kind: 'moveComponent';
		component: UamComponentResource;
		sourcePackageId: string;
		path: string;
		operationKind: 'moveComponent';
	}
	| {
		kind: 'attachDisplayNode';
		node: UamDisplayNode;
		ownerPackageId: string;
		path: string;
		operationKind: 'attachDisplayNode';
	};

function validateLifecycleReferenceChecks(
	project: UamProject,
	checks: UamLifecycleReferenceCheck[],
	issues: UamTransactionSupportIssue[],
): void {
	for (const check of checks) {
		switch (check.kind) {
			case 'removePackage': {
				const referencePath = findExternalPackageReference(project, check.packageId);
				if (referencePath) {
					pushSupportIssue(issues, 'package_referenced', check.path, `Package "${check.packageId}" is still referenced by ${referencePath}.`, { operationKind: check.operationKind });
				}
				break;
			}
			case 'removeComponent': {
				const referencePath = findExternalComponentReference(project, check.packageId, check.componentId);
				if (referencePath) {
					pushSupportIssue(issues, 'component_referenced', check.path, `Component "${check.componentId}" is still referenced by ${referencePath}.`, { operationKind: check.operationKind });
				}
				break;
			}
			case 'moveComponent': {
				const finalPackage = findComponentPackageByIdentity(project, check.component);
				if (!finalPackage || finalPackage.id === check.sourcePackageId) break;
				const referencePath = findExternalComponentReference(project, check.sourcePackageId, check.component.id);
				if (referencePath) {
					pushSupportIssue(issues, 'component_referenced', check.path, `Component "${check.component.id}" is still referenced by ${referencePath}.`, { operationKind: check.operationKind });
				}
				const dependencyPath = findComponentPackageDependency(
					check.component,
					finalPackage.id,
					check.sourcePackageId,
					check.path,
				);
				if (dependencyPath) {
					pushSupportIssue(issues, 'component_has_package_dependencies', dependencyPath, `Component "${check.component.id}" still resolves display resources from package "${check.sourcePackageId}".`, { operationKind: check.operationKind });
				}
				break;
			}
			case 'attachDisplayNode': {
				if (!projectContainsDisplayNode(project, check.node)) break;
				const reference = getComponentReference(check.node, check.ownerPackageId);
				if (!reference || findComponentSpec(project, {
					packageId: reference.packageId,
					componentResourceId: reference.componentId,
				})) break;
				const referencePath = check.node.kind === 'component'
					? `${check.path}.resource.resourceId`
					: `${check.path}.src`;
				pushSupportIssue(
					issues,
					'invalid_component_reference',
					referencePath,
					`Display node "${check.node.id}" references missing component "${reference.packageId}/${reference.componentId}".`,
					{ operationKind: check.operationKind },
				);
				break;
			}
		}
	}
}

export function validateLifecycleOperationPayloads(
	project: UamProject,
	operations: UamTransactionOperation[],
	issues: UamTransactionSupportIssue[],
): void {
	const projected = normalizeUamProject(project);
	const referenceChecks: UamLifecycleReferenceCheck[] = [];
	const initialIssueCount = issues.length;
	for (const [operationIndex, operation] of operations.entries()) {
		if (
			!isLifecycleOperation(operation)
			&& !isResourceLifecycleOperation(operation)
			&& !isResourceFolderLifecycleOperation(operation)
			&& !isDisplayListRewriteOperation(operation)
			&& operation.kind !== 'setDisplayNodeProps'
			&& operation.kind !== 'setResourceFolderFavorite'
			&& operation.kind !== 'setResourceFolderAtlas'
		) continue;
		const operationPath = `operations[${operationIndex}]`;
		const issueCount = issues.length;
		switch (operation.kind) {
			case 'addBranch':
				if (!isSafeBranchName(operation.branch)) {
					pushSupportIssue(issues, 'invalid_branch_name', `${operationPath}.branch`, 'Branch must be a safe non-reserved output path segment.', { operationKind: operation.kind });
				}
				if (projected.branches.includes(operation.branch)) {
					pushSupportIssue(issues, 'duplicate_branch_name', `${operationPath}.branch`, `Branch "${operation.branch}" already exists.`, { operationKind: operation.kind });
				}
				break;
			case 'renameBranch': {
				const branchName = operation.selector.branch;
				if (!projected.branches.includes(branchName)) {
					pushSupportIssue(issues, 'invalid_branch_selector', `${operationPath}.selector.branch`, `Branch "${branchName}" was not found.`, { operationKind: operation.kind });
				}
				if (!isSafeBranchName(operation.newName)) {
					pushSupportIssue(issues, 'invalid_branch_name', `${operationPath}.newName`, 'Branch must be a safe non-reserved output path segment.', { operationKind: operation.kind });
				}
				if (projected.branches.includes(operation.newName)) {
					pushSupportIssue(issues, 'duplicate_branch_name', `${operationPath}.newName`, `Branch "${operation.newName}" already exists.`, { operationKind: operation.kind });
				}
				break;
			}
			case 'removeBranch': {
				const branchName = operation.selector.branch;
				if (!projected.branches.includes(branchName)) {
					pushSupportIssue(issues, 'invalid_branch_selector', `${operationPath}.selector.branch`, `Branch "${branchName}" was not found.`, { operationKind: operation.kind });
					break;
				}
				if (projected.packages.some((pkg) => (
					pkg.folders.some((folder) => folder.branch === branchName)
					|| pkg.resources.some((resource) => resource.branch === branchName)
				))) {
					pushSupportIssue(issues, 'branch_not_empty', `${operationPath}.selector.branch`, `Branch "${branchName}" still contains resources or folders.`, { operationKind: operation.kind });
				}
				if (projected.packages.some((pkg) => {
					const slotIndex = pkg.branchNames.indexOf(branchName);
					return slotIndex >= 0 && pkg.resources.some((resource) => !!resource.branchItemIds[slotIndex]);
				})) {
					pushSupportIssue(issues, 'branch_referenced', `${operationPath}.selector.branch`, `Branch "${branchName}" still has mapped variant ids.`, { operationKind: operation.kind });
				}
				break;
			}
			case 'addPackage': {
				validatePackagePayload(projected, operation.package, `${operationPath}.package`, issues, operation.kind);
				if (findPackageSpec(projected, operation.package.id)) {
					pushSupportIssue(issues, 'duplicate_package_id', `${operationPath}.package.id`, `Package id "${operation.package.id}" already exists.`, { operationKind: operation.kind });
				}
				if (projected.packages.some((pkg) => pkg.name === operation.package.name)) {
					pushSupportIssue(issues, 'duplicate_package_name', `${operationPath}.package.name`, `Package name "${operation.package.name}" already exists.`, { operationKind: operation.kind });
				}
				validateLifecycleInsertionIndex(operation.atIndex, projected.packages.length, `${operationPath}.atIndex`, 'invalid_package_index', issues, operation.kind);
				break;
			}
			case 'renamePackage': {
				const pkg = validateLifecyclePackageSelector(projected, operation.selector, `${operationPath}.selector`, issues, operation.kind);
				if (!isSafePackageName(operation.newName)) {
					pushSupportIssue(issues, 'invalid_package_payload', `${operationPath}.newName`, 'Package name must be a safe output path segment.', { operationKind: operation.kind });
				}
				if (pkg && projected.packages.some((candidate) => candidate !== pkg && candidate.name === operation.newName)) {
					pushSupportIssue(issues, 'duplicate_package_name', `${operationPath}.newName`, `Package name "${operation.newName}" already exists.`, { operationKind: operation.kind });
				}
				break;
			}
			case 'removePackage': {
				validateLifecyclePackageSelector(projected, operation.selector, `${operationPath}.selector`, issues, operation.kind);
				break;
			}
			case 'addComponent': {
				const pkg = validateLifecyclePackageSelector(projected, operation.selector, `${operationPath}.selector`, issues, operation.kind);
				if (pkg) {
					validateComponentPayload(projected, pkg, operation.component, `${operationPath}.component`, issues, operation.kind);
					if (pkg.resources.some((resource) => resource.id === operation.component.id)) {
						pushSupportIssue(issues, 'duplicate_component_id', `${operationPath}.component.id`, `Resource id "${operation.component.id}" already exists in package "${pkg.id}".`, { operationKind: operation.kind });
					}
					validateLifecycleInsertionIndex(operation.atIndex, pkg.resources.length, `${operationPath}.atIndex`, 'invalid_component_index', issues, operation.kind);
				}
				break;
			}
			case 'removeComponent': {
				validateLifecycleComponentSelector(projected, operation.selector, `${operationPath}.selector`, issues, operation.kind);
				break;
			}
			case 'moveComponent': {
				const component = validateLifecycleComponentSelector(projected, operation.selector, `${operationPath}.selector`, issues, operation.kind);
				const target = findPackageSpec(projected, operation.toPackageId);
				if (!target) {
					pushSupportIssue(issues, 'invalid_package_selector', `${operationPath}.toPackageId`, `Package "${operation.toPackageId}" was not found.`, { operationKind: operation.kind });
				}
				if (operation.selector.packageId === operation.toPackageId) {
					pushSupportIssue(issues, 'invalid_component_move', `${operationPath}.toPackageId`, 'moveComponent requires a different destination package.', { operationKind: operation.kind });
				}
				if (component && target) {
					if (target.resources.some((resource) => resource.id === component.id)) {
						pushSupportIssue(issues, 'duplicate_component_id', `${operationPath}.selector.componentResourceId`, `Resource id "${component.id}" already exists in package "${target.id}".`, { operationKind: operation.kind });
					}
					validateLifecycleInsertionIndex(operation.toIndex, target.resources.length, `${operationPath}.toIndex`, 'invalid_component_index', issues, operation.kind);
				}
				break;
			}
			case 'addResource': {
				const pkg = validateLifecyclePackageSelector(projected, operation.selector, `${operationPath}.selector`, issues, operation.kind);
				if (pkg) {
					validateAssetResourcePayload(
						projected,
						[operation],
						0,
						operation.selector,
						operation.resource,
						operationPath,
						issues,
						operation.kind,
					);
					validateLifecycleInsertionIndex(
						operation.atIndex === undefined ? pkg.resources.length : operation.atIndex,
						pkg.resources.length,
						`${operationPath}.atIndex`,
						'invalid_resource_index',
						issues,
						operation.kind,
					);
				}
				break;
			}
			case 'removeResource': {
				const resource = findProjectedResource(projected, [operation], 0, operation.selector);
				if (!resource || resource.kind === 'component') {
					pushSupportIssue(
						issues,
						'invalid_resource_selector',
						`${operationPath}.selector.resourceId`,
						`Binary resource "${operation.selector.resourceId}" was not found in package "${operation.selector.packageId}".`,
						{ operationKind: operation.kind },
					);
				}
				break;
			}
			case 'addResourceFolder': {
				const pkg = validateLifecyclePackageSelector(projected, operation.selector, `${operationPath}.selector`, issues, operation.kind);
				const branch = operation.branch ?? '';
				if (!isSafeResourceFolderPath(operation.path)) {
					pushSupportIssue(issues, 'invalid_resource_folder_path', `${operationPath}.path`, 'Resource folder path must be canonical, non-root, and traversal-free.', { operationKind: operation.kind });
				}
				if (branch && (!isSafePackageName(branch) || !projected.branches.includes(branch))) {
					pushSupportIssue(issues, 'invalid_resource_folder_path', `${operationPath}.branch`, `Resource folder branch "${branch}" is not defined by the project.`, { operationKind: operation.kind });
				}
				if (operation.favorite !== undefined && typeof operation.favorite !== 'boolean') {
					pushSupportIssue(issues, 'invalid_resource_payload', `${operationPath}.favorite`, 'addResourceFolder.favorite must be boolean.', { operationKind: operation.kind });
				}
				validateResourceFolderAtlas(
					operation.atlas === undefined ? '' : operation.atlas,
					pkg ? resourceFolderMaxAtlasIndexAt(pkg, operations, operationIndex) : 10,
					`${operationPath}.atlas`,
					issues,
					operation.kind,
				);
				if (pkg && isSafeResourceFolderPath(operation.path)) {
					if (!folderParentExists(pkg, branch, operation.path)) {
						pushSupportIssue(issues, 'invalid_resource_folder_path', `${operationPath}.path`, `Parent folder "${resourceFolderParentPath(operation.path)}" does not exist.`, { operationKind: operation.kind });
					}
					if (pkg.folders.some((folder) => folder.branch === branch && folder.path === operation.path)
						|| folderPathConflictsWithResource(pkg, branch, operation.path)
					) {
						pushSupportIssue(issues, 'resource_folder_conflict', `${operationPath}.path`, `Resource folder path "${operation.path}" already exists or conflicts with a resource.`, { operationKind: operation.kind });
					}
				}
				break;
			}
			case 'renameResourceFolder': {
				const found = validateResourceFolderSelector(projected, operation.selector, `${operationPath}.selector`, issues, operation.kind);
				if (!isSafePackageName(operation.newName)) {
					pushSupportIssue(issues, 'invalid_resource_folder_path', `${operationPath}.newName`, 'renameResourceFolder.newName must be a safe folder name.', { operationKind: operation.kind });
				}
				if (found) {
					const branch = folderBranch(operation.selector);
					if (folderContainsItems(found.pkg, branch, found.folder.path)) {
						pushSupportIssue(issues, 'resource_folder_not_empty', `${operationPath}.selector`, 'renameResourceFolder only supports empty folders.', { operationKind: operation.kind });
					}
					if (isSafePackageName(operation.newName)) {
						const destination = normalizeResourceFolderPath(`${resourceFolderParentPath(found.folder.path)}/${operation.newName}`);
						if (destination === found.folder.path
							|| found.pkg.folders.some((folder) => folder.branch === branch && folder.path === destination)
							|| folderPathConflictsWithResource(found.pkg, branch, destination)
						) {
							pushSupportIssue(issues, 'resource_folder_conflict', `${operationPath}.newName`, `Resource folder path "${destination}" already exists or conflicts with a resource.`, { operationKind: operation.kind });
						}
					}
				}
				break;
			}
			case 'moveResourceFolder': {
				const found = validateResourceFolderSelector(projected, operation.selector, `${operationPath}.selector`, issues, operation.kind);
				const branch = folderBranch(operation.selector);
				if (!isSafeResourceFolderPath(operation.toPath, true)) {
					pushSupportIssue(issues, 'invalid_resource_folder_path', `${operationPath}.toPath`, 'moveResourceFolder.toPath must be a canonical folder path or root.', { operationKind: operation.kind });
				}
				if (found && isSafeResourceFolderPath(operation.toPath, true)) {
					if (operation.toPath !== '/' && !found.pkg.folders.some((folder) => folder.branch === branch && folder.path === operation.toPath)) {
						pushSupportIssue(issues, 'invalid_resource_folder_path', `${operationPath}.toPath`, `Destination parent folder "${operation.toPath}" does not exist.`, { operationKind: operation.kind });
					}
					if (operation.toPath.startsWith(found.folder.path)) {
						pushSupportIssue(issues, 'invalid_resource_folder_path', `${operationPath}.toPath`, 'A resource folder cannot be moved into itself.', { operationKind: operation.kind });
					}
					if (folderContainsItems(found.pkg, branch, found.folder.path)) {
						pushSupportIssue(issues, 'resource_folder_not_empty', `${operationPath}.selector`, 'moveResourceFolder only supports empty folders.', { operationKind: operation.kind });
					}
					const destination = normalizeResourceFolderPath(`${operation.toPath}/${resourceFolderName(found.folder.path)}`);
					if (destination === found.folder.path
						|| found.pkg.folders.some((folder) => folder.branch === branch && folder.path === destination)
						|| folderPathConflictsWithResource(found.pkg, branch, destination)
					) {
						pushSupportIssue(issues, 'resource_folder_conflict', `${operationPath}.toPath`, `Resource folder path "${destination}" already exists or conflicts with a resource.`, { operationKind: operation.kind });
					}
				}
				break;
			}
			case 'removeResourceFolder': {
				const found = validateResourceFolderSelector(projected, operation.selector, `${operationPath}.selector`, issues, operation.kind);
				if (found && folderContainsItems(found.pkg, folderBranch(operation.selector), found.folder.path)) {
					pushSupportIssue(issues, 'resource_folder_not_empty', `${operationPath}.selector`, 'removeResourceFolder only supports empty folders.', { operationKind: operation.kind });
				}
				break;
			}
			case 'attachDisplayNode': {
				const component = validateLifecycleComponentSelector(projected, operation.selector, `${operationPath}.selector`, issues, operation.kind);
				if (!Number.isInteger(operation.atIndex) || operation.atIndex < 0) {
					pushSupportIssue(
						issues,
						'invalid_attach_index',
						`${operationPath}.atIndex`,
						'attachDisplayNode.atIndex must be a non-negative integer.',
						{ operationKind: operation.kind },
					);
				}
				validateSupportedDisplayNode(operation.node, operation.selector.packageId, `${operationPath}.node`, issues, {
					operationKind: operation.kind,
				});
				if (component && Number.isInteger(operation.atIndex) && operation.atIndex >= 0) {
					if (component.component.displayList.some((node) => node.id === operation.node.id)) {
						pushSupportIssue(issues, 'invalid_display_node_selector', `${operationPath}.node.id`, `Component "${component.id}" already contains display node id "${operation.node.id}".`, { operationKind: operation.kind });
					} else if (operation.atIndex > component.component.displayList.length) {
						pushSupportIssue(issues, 'invalid_attach_index', `${operationPath}.atIndex`, `attachDisplayNode.atIndex must be between 0 and ${component.component.displayList.length}.`, { operationKind: operation.kind });
					}
				}
				break;
			}
			case 'detachDisplayNode':
				validateTouchedDisplayNodeKind(projected, operation.selector, `${operationPath}.selector.displayNodeId`, issues, operation.kind);
				break;
			case 'setDisplayNodeProps':
				validateTouchedDisplayNodeKind(projected, operation.selector, `${operationPath}.selector.displayNodeId`, issues, operation.kind);
				validateDisplayPropsPayload(operation, projected, operationPath, issues);
				break;
			case 'setResourceFolderFavorite':
				validateResourceFolderSelector(projected, operation.selector, `${operationPath}.selector`, issues, operation.kind);
				break;
			case 'setResourceFolderAtlas': {
				const found = validateResourceFolderSelector(projected, operation.selector, `${operationPath}.selector`, issues, operation.kind);
				const validAtlas = validateResourceFolderAtlas(
					operation.atlas,
					found ? resourceFolderMaxAtlasIndexAt(found.pkg, operations, operationIndex) : 10,
					`${operationPath}.atlas`,
					issues,
					operation.kind,
				);
				if (found && validAtlas && found.folder.atlas === operation.atlas) {
					pushSupportIssue(
						issues,
						'resource_folder_atlas_unchanged',
						`${operationPath}.atlas`,
						'setResourceFolderAtlas must change the selected folder atlas.',
						{ operationKind: operation.kind },
					);
				}
				break;
			}
		}
		if (issues.length !== issueCount) continue;
		if (isLifecycleOperation(operation)) {
			applyUamLifecycleOperation(projected, operation);
		} else if (isResourceLifecycleOperation(operation)) {
			applyUamResourceLifecycleOperation(projected, operation);
		} else if (isResourceFolderLifecycleOperation(operation)) {
			applyUamResourceFolderLifecycleOperation(projected, operation);
		} else if (operation.kind === 'setDisplayNodeProps') {
			applyDisplayNodePropsUpdate(findDisplayNodeSpec(projected, operation.selector)!, operation.props);
		} else if (operation.kind === 'setResourceFolderFavorite') {
			findResourceFolder(projected, operation.selector)!.folder.favorite = operation.favorite;
		} else if (operation.kind === 'setResourceFolderAtlas') {
			findResourceFolder(projected, operation.selector)!.folder.atlas = operation.atlas;
		} else {
			applyUamDisplayListRewriteOperation(projected, operation);
		}
		switch (operation.kind) {
			case 'removePackage':
				referenceChecks.push({
					kind: 'removePackage',
					packageId: operation.selector.packageId,
					path: `${operationPath}.selector`,
					operationKind: operation.kind,
				});
				break;
			case 'removeComponent':
				referenceChecks.push({
					kind: 'removeComponent',
					packageId: operation.selector.packageId,
					componentId: operation.selector.componentResourceId,
					path: `${operationPath}.selector`,
					operationKind: operation.kind,
				});
				break;
			case 'moveComponent': {
				const component = findComponentSpec(projected, {
					packageId: operation.toPackageId,
					componentResourceId: operation.selector.componentResourceId,
				});
				if (component) {
					referenceChecks.push({
						kind: 'moveComponent',
						component,
						sourcePackageId: operation.selector.packageId,
						path: `${operationPath}.selector`,
						operationKind: operation.kind,
					});
				}
				break;
			}
			case 'attachDisplayNode': {
				const component = findComponentSpec(projected, operation.selector);
				const node = component?.component.displayList.find((candidate) => candidate.id === operation.node.id);
				if (node) {
					referenceChecks.push({
						kind: 'attachDisplayNode',
						node,
						ownerPackageId: operation.selector.packageId,
						path: `${operationPath}.node`,
						operationKind: operation.kind,
					});
				}
				break;
			}
		}
	}
	if (issues.length === initialIssueCount) {
		validateLifecycleReferenceChecks(projected, referenceChecks, issues);
	}
}

export function validateLifecycleBatchCompatibility(
	operations: UamTransactionOperation[],
	issues: UamTransactionSupportIssue[],
): boolean {
	if (!operations.some(isLifecycleOperation)) return true;
	const nonLifecycleIndex = operations.findIndex((operation) => (
		!isLifecycleOperation(operation)
		&& !isResourceLifecycleOperation(operation)
		&& !isResourceFolderLifecycleOperation(operation)
		&& !isDisplayListRewriteOperation(operation)
		&& operation.kind !== 'setDisplayNodeProps'
	));
	if (nonLifecycleIndex < 0) return true;
	const operation = operations[nonLifecycleIndex]!;
	pushSupportIssue(
		issues,
		'unsupported_operation_batch',
		`operations[${nonLifecycleIndex}].kind`,
		`Lifecycle operations may only be batched with resource lifecycle operations, display-list rewrites, or display-node property updates; "${operation.kind}" must be committed separately.`,
		{ operationKind: operation.kind },
	);
	return false;
}

export function requiresSequentialDisplayProjection(operations: UamTransactionOperation[]): boolean {
	const hasDisplayListRewrite = operations.some(isDisplayListRewriteOperation);
	return operations.some((operation) => operation.kind === 'setDisplayNodeProps')
		|| operations.some(isLifecycleOperation)
		|| operations.some(isResourceLifecycleOperation)
		|| operations.some(isResourceFolderLifecycleOperation)
		|| operations.some((operation) => operation.kind === 'setResourceFolderAtlas')
		|| (
			hasDisplayListRewrite
			&& (
				operations.some(isResourceLifecycleOperation)
				|| operations.some((operation) => operation.kind === 'setDisplayNodeProps')
			)
		);
}
