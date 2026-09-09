import {
	generateId,
	ProjectWriter,
	type Document,
	type Package,
	type ImageResource,
	type MiscResource,
	type SpineResource,
	type DragonBonesResource,
} from '@openfairygui/core';
import type { RestoreFileSystem } from '../restore.js';
import {
	resourceFileName,
	fileBaseName,
	stripExtension,
	sameVirtualPath,
	resolveLooseSourceFile,
	type RestoreResource,
} from './resource-paths.js';

export async function synthesizeLooseSkeletonResources(
	fs: RestoreFileSystem,
	doc: Document,
	sourceDir: string,
): Promise<void> {
	for (const pkg of doc.getRoot().listPackages()) {
		for (const resource of [...pkg.listResources()]) {
			let current = resource;
			if (resource.propertyType === 'DragonBonesResource' && /\.skel\.bytes$/i.test(resourceFileName(resource))) {
				const normalizedFile = resourceFileName(resource).replace(/\.skel\.bytes$/i, '.skel');
				const skeletonBase = stripExtension(normalizedFile);
				const atlasBase = skeletonBase.replace(/-(?:pro|ess)$/i, '-pma');
				const atlasSource = await resolveLooseSourceFile(fs, pkg, sourceDir, `${atlasBase}.atlas`);
				if (atlasSource)
					current = replaceSkeletonResourceType(doc, pkg, resource, 'SpineResource', normalizedFile);
			}

			if (current.propertyType === 'SpineResource') {
				await ensureSpineSidecarResources(fs, doc, pkg, current, sourceDir);
			} else if (current.propertyType === 'DragonBonesResource') {
				await ensureDragonBonesSidecarResources(fs, doc, pkg, current, sourceDir);
			}
		}
	}
}

export function initializeRestoredResourceRelations(doc: Document): void {
	for (const pkg of doc.getRoot().listPackages()) {
		const resources = pkg.listResources();
		for (const resource of resources) {
			if (resource.propertyType === 'SpineResource') {
				initializeSpineResourceRelation(resource, resources);
			} else if (resource.propertyType === 'DragonBonesResource') {
				initializeDragonBonesResourceRelation(resource, resources);
			}
		}
	}
}

function replaceSkeletonResourceType(
	doc: Document,
	pkg: Package,
	resource: SpineResource | DragonBonesResource,
	targetType: 'SpineResource' | 'DragonBonesResource',
	fileName: string,
): SpineResource | DragonBonesResource {
	const replacement =
		targetType === 'SpineResource'
			? doc.createSpineResource(resource.getName() ?? '')
			: doc.createDragonBonesResource(resource.getName() ?? '');

	replacement
		.setId(resource.getId() ?? '')
		.setPath(resource.getPath() ?? '/')
		.setFile(fileName)
		.setExported(resource.getExported() ?? false)
		.setWidth(resource.getWidth() ?? 0)
		.setHeight(resource.getHeight() ?? 0)
		.setRequireIds(resource.getRequireIds() ?? [])
		.setAtlasNames(resource.getAtlasNames() ?? [])
		.setAnchor(resource.getAnchorX() ?? 0, resource.getAnchorY() ?? 0)
		.setBranch(resource.getBranch() ?? '')
		.setBranchItemIds(resource.getBranchItemIds() ?? []);
	replacement.setExtras({ ...(resource.getExtras() ?? {}) });

	pkg.removeResource(resource);
	pkg.addResource(replacement);
	return replacement;
}

async function ensureSpineSidecarResources(
	fs: RestoreFileSystem,
	doc: Document,
	pkg: Package,
	resource: SpineResource,
	sourceDir: string,
): Promise<void> {
	const fileName = resourceFileName(resource).replace(/\.skel\.bytes$/i, '.skel');
	const skeletonBase = stripExtension(fileName);
	if (!skeletonBase) return;
	const atlasBase = skeletonBase.replace(/-(?:pro|ess)$/i, '-pma');
	const atlas = await ensureLooseMiscResource(fs, doc, pkg, resource, sourceDir, `${atlasBase}.atlas`);
	const texture = await ensureLooseImageResource(fs, doc, pkg, resource, sourceDir, `${atlasBase}.png`);
	const requireIds = [atlas?.getId(), texture?.getId()].filter((id): id is string => !!id);
	if (requireIds.length > 0) resource.setRequireIds(requireIds);
	if (atlas) resource.setAtlasNames([atlasBase]);
}

async function ensureDragonBonesSidecarResources(
	fs: RestoreFileSystem,
	doc: Document,
	pkg: Package,
	resource: DragonBonesResource,
	sourceDir: string,
): Promise<void> {
	const skeletonBase = stripExtension(resourceFileName(resource)).replace(/_ske$/i, '');
	if (!skeletonBase) return;
	const textureJson = await ensureLooseMiscResource(fs, doc, pkg, resource, sourceDir, `${skeletonBase}_tex.json`);
	const textureImage = await ensureLooseImageResource(fs, doc, pkg, resource, sourceDir, `${skeletonBase}.png`);
	const requireIds = [textureJson?.getId(), textureImage?.getId()].filter((id): id is string => !!id);
	if (requireIds.length > 0) resource.setRequireIds(requireIds);
}

async function ensureLooseMiscResource(
	fs: RestoreFileSystem,
	doc: Document,
	pkg: Package,
	owner: RestoreResource,
	sourceDir: string,
	fileName: string,
): Promise<MiscResource | null> {
	const resources = pkg.listResources();
	const existing = findResourceByFile(
		resources.filter((entry) => entry.propertyType === 'MiscResource'),
		owner,
		fileName,
	);
	if (existing) return existing;
	const sourcePath = await resolveLooseSourceFile(fs, pkg, sourceDir, fileName);
	if (!sourcePath) return null;
	const resource = doc.createMiscResource(stripExtension(fileName));
	resource
		.setId(generateId())
		.setPath(owner.getPath() ?? '/')
		.setBranch(owner.getBranch() ?? '')
		.setBranchItemIds(owner.getBranchItemIds() ?? [])
		.setExported(false)
		.setFile(fileName);
	resource.setExtras({ ...(resource.getExtras() ?? {}), _publishedFile: fileBaseName(sourcePath) });
	pkg.addResource(resource);
	return resource;
}

async function ensureLooseImageResource(
	fs: RestoreFileSystem,
	doc: Document,
	pkg: Package,
	owner: RestoreResource,
	sourceDir: string,
	fileName: string,
): Promise<ImageResource | null> {
	const resources = pkg.listResources();
	const existing = findResourceByFile(
		resources.filter((entry) => entry.propertyType === 'ImageResource'),
		owner,
		fileName,
	);
	const sourcePath = await resolveLooseSourceFile(fs, pkg, sourceDir, fileName);
	if (!sourcePath) return existing ?? null;
	if (existing) {
		existing.setExtras({
			...(existing.getExtras() ?? {}),
			_publishedFile: fileBaseName(sourcePath),
			_restoreAsLooseImage: true,
		});
		return existing;
	}
	const resource = doc.createImageResource(stripExtension(fileName));
	resource
		.setId(generateId())
		.setPath(owner.getPath() ?? '/')
		.setBranch(owner.getBranch() ?? '')
		.setBranchItemIds(owner.getBranchItemIds() ?? [])
		.setExported(false)
		.setFileName(fileName);
	resource.setExtras({
		...(resource.getExtras() ?? {}),
		_publishedFile: fileBaseName(sourcePath),
		_restoreAsLooseImage: true,
	});
	ProjectWriter.setImageWriteHints(resource, { omitPackageSize: true });
	pkg.addResource(resource);
	return resource;
}

function initializeSpineResourceRelation(resource: SpineResource, resources: RestoreResource[]): void {
	const fileName = resourceFileName(resource);
	const skeletonBase = stripExtension(fileName);
	if (!skeletonBase) return;
	const atlasBase = skeletonBase.replace(/-(?:pro|ess)$/i, '-pma');
	const requireIds: string[] = [];

	const atlas = findResourceByFile(
		resources.filter((entry) => entry.propertyType === 'MiscResource'),
		resource,
		`${atlasBase}.atlas`,
	);
	const texture = findResourceByFile(
		resources.filter((entry) => entry.propertyType === 'ImageResource'),
		resource,
		`${atlasBase}.png`,
	);
	if (atlas?.getId()) requireIds.push(atlas.getId());
	if (texture?.getId()) requireIds.push(texture.getId());
	if (requireIds.length > 0) resource.setRequireIds(requireIds);
	if (atlas) resource.setAtlasNames([atlasBase]);
}

function initializeDragonBonesResourceRelation(resource: DragonBonesResource, resources: RestoreResource[]): void {
	const fileName = resourceFileName(resource);
	const skeletonBase = stripExtension(fileName).replace(/_ske$/i, '');
	if (!skeletonBase) return;
	const requireIds: string[] = [];

	const textureJson = findResourceByFile(
		resources.filter((entry) => entry.propertyType === 'MiscResource'),
		resource,
		`${skeletonBase}_tex.json`,
	);
	const textureImage = findResourceByFile(
		resources.filter((entry) => entry.propertyType === 'ImageResource'),
		resource,
		`${skeletonBase}.png`,
	);
	if (textureJson?.getId()) requireIds.push(textureJson.getId());
	if (textureImage?.getId()) requireIds.push(textureImage.getId());
	if (requireIds.length > 0) resource.setRequireIds(requireIds);
}

function findResourceByFile<T extends RestoreResource>(
	resources: T[],
	owner: RestoreResource,
	fileName: string,
): T | null {
	const expected = fileName.toLowerCase();
	return (
		resources.find((resource) => {
			return (
				sameVirtualPath(owner, resource) && fileBaseName(resourceFileName(resource)).toLowerCase() === expected
			);
		}) ?? null
	);
}
