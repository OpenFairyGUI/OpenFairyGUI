import type { UamPackage, UamProject } from '../model.js';
import { normalizeResourceFolderPath, resourceFolderParentPath } from '../../utils/resource-folder.js';
import type {
	UamResourceFolderSelector,
	UamTransactionOperation,
	UamTransactionSupportIssue,
} from '../transaction-contracts.js';
import { findPackageSpec } from '../transaction-shared.js';
import { pushSupportIssue } from './support.js';
import { isPlainRecord, isIntegerBetween, isSafePackageName } from './values.js';
import { primaryResourceFileName } from './resources.js';

export function isSafeResourceFolderPath(value: string, allowRoot = false): boolean {
	if (!value || value !== normalizeResourceFolderPath(value)) return false;
	if (value === '/') return allowRoot;
	return value.split('/').filter(Boolean).every(isSafePackageName);
}

export function folderBranch(selector: UamResourceFolderSelector): string {
	return selector.branch ?? '';
}

export function findResourceFolder(project: UamProject, selector: UamResourceFolderSelector) {
	const pkg = findPackageSpec(project, selector.packageId);
	const branch = folderBranch(selector);
	const folder = pkg?.folders.find((candidate) => candidate.branch === branch && candidate.path === selector.path);
	return pkg && folder ? { pkg, folder } : null;
}

export function folderContainsItems(pkg: UamPackage, branch: string, path: string): boolean {
	return pkg.folders.some((folder) => (
		folder.branch === branch && folder.path !== path && folder.path.startsWith(path)
	)) || pkg.resources.some((resource) => (
		resource.branch === branch && normalizeResourceFolderPath(resource.path).startsWith(path)
	));
}

export function folderPathConflictsWithResource(pkg: UamPackage, branch: string, path: string): boolean {
	const folderTarget = path.replace(/^\/+|\/+$/g, '');
	return pkg.resources.some((resource) => {
		if (resource.branch !== branch) return false;
		const fileName = resource.kind === 'component' ? `${resource.name}.xml` : primaryResourceFileName(resource);
		return normalizeResourceFolderPath(`${resource.path}/${fileName}`).slice(1, -1) === folderTarget;
	});
}

export function folderParentExists(pkg: UamPackage, branch: string, path: string): boolean {
	const parentPath = resourceFolderParentPath(path);
	return parentPath === '/' || pkg.folders.some((folder) => folder.branch === branch && folder.path === parentPath);
}

export function validateResourceFolderSelector(
	project: UamProject,
	selector: UamResourceFolderSelector,
	path: string,
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
) {
	if (!isSafeResourceFolderPath(selector.path)) {
		pushSupportIssue(
			issues,
			'invalid_resource_folder_selector',
			`${path}.path`,
			'Resource folder selector path must be canonical, non-root, and traversal-free.',
			{ operationKind },
		);
		return null;
	}
	const found = findResourceFolder(project, selector);
	if (!found) {
		pushSupportIssue(
			issues,
			'invalid_resource_folder_selector',
			path,
			`Resource folder "${folderBranch(selector)}:${selector.path}" was not found in package "${selector.packageId}".`,
			{ operationKind },
		);
	}
	return found;
}

export function resourceFolderMaxAtlasIndexAt(
	pkg: UamPackage,
	operations: UamTransactionOperation[],
	operationIndex: number,
): number {
	let maxAtlasIndex = pkg.publish?.maxAtlasIndex ?? 10;
	for (let index = 0; index < operationIndex; index += 1) {
		const operation = operations[index]!;
		if (operation.kind !== 'updatePackageSettings' || operation.selector.packageId !== pkg.id) continue;
		const settings = operation.settings as unknown;
		if (!isPlainRecord(settings) || !isPlainRecord(settings.publish)) continue;
		if (isIntegerBetween(settings.publish.maxAtlasIndex, 0, 255)) {
			maxAtlasIndex = settings.publish.maxAtlasIndex;
		}
	}
	return maxAtlasIndex;
}

export function validateResourceFolderAtlas(
	atlas: unknown,
	maxAtlasIndex: number,
	path: string,
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
): atlas is string {
	if (typeof atlas === 'string'
		&& (atlas === '' || (/^(0|[1-9]\d*)$/.test(atlas) && Number(atlas) <= maxAtlasIndex))
	) return true;
	pushSupportIssue(
		issues,
		'invalid_resource_folder_atlas',
		path,
		`Resource folder atlas must be empty or a canonical slot index from 0 to ${maxAtlasIndex}.`,
		{ operationKind },
	);
	return false;
}
