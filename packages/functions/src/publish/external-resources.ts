import type { Package } from '@openfairygui/core';
import type { PublishFileSystem } from './contracts.js';
import {
	extname,
	type PackagePublishContext,
	getPublishedId,
	isImageResource,
	isMiscResource,
	isSkeletonResource,
	isSoundResource,
	isSwfResource,
	resolveGenericResourcePath,
	resolveImageFileName,
	resolveImagePath,
	resolvePublishedSkeletonDependencyMiscFileName,
	resolveSoundPath,
} from './package-context.js';

export async function exportPackageSounds(
	pkg: Package,
	context: PackagePublishContext,
	outputDir: string,
	basePath: string | undefined,
	fs: PublishFileSystem,
	readFileRaw: PublishFileSystem['readFileRaw'] | undefined,
): Promise<void> {
	const { publishedResourceIds } = context;
	if (publishedResourceIds.size === 0) return;
	if (!basePath || !readFileRaw) {
		const hasPublishedSound = pkg.listResources().some((resource) => {
			return isSoundResource(resource) && publishedResourceIds.has(resource.getId());
		});
		if (hasPublishedSound) {
			throw new Error(
				`publish: Sound resources in package "${pkg.getName()}" require basePath and readFileRaw for output.`,
			);
		}
		return;
	}

	for (const resource of pkg.listResources()) {
		if (!isSoundResource(resource)) continue;
		if (!publishedResourceIds.has(resource.getId())) continue;

		const sourcePath = resolveSoundPath(resource, pkg, basePath);
		const targetName = `${pkg.getPublishName() || pkg.getName()}_${getPublishedId(resource, context.effectiveResourceIds)}${extname(resource.getFile() || '')}`;
		const targetPath = fs.join(outputDir, targetName);

		try {
			const data = await readFileRaw(sourcePath);
			await fs.writeFileRaw(targetPath, data);
		} catch {
			throw new Error(`publish: Could not export sound "${resource.getId()}" from package "${pkg.getName()}".`);
		}
	}
}

export async function exportPackageExternalResources(
	pkg: Package,
	context: PackagePublishContext,
	outputDir: string,
	basePath: string | undefined,
	fs: PublishFileSystem,
	readFileRaw: PublishFileSystem['readFileRaw'] | undefined,
	projectType: number,
): Promise<void> {
	const { exportedResourceIds, publishedResourceIds, skeletonDependencyImageIds, skeletonDependencyMiscIds } =
		context;
	if (exportedResourceIds.size === 0) return;
	if (!basePath || !readFileRaw) {
		const hasPublishedExternal = pkg.listResources().some((resource) => {
			return (
				((isMiscResource(resource) || isSwfResource(resource) || isSkeletonResource(resource)) &&
					exportedResourceIds.has(resource.getId())) ||
				skeletonDependencyImageIds.has(resource.getId())
			);
		});
		if (hasPublishedExternal) {
			throw new Error(
				`publish: External resources in package "${pkg.getName()}" require basePath and readFileRaw for output.`,
			);
		}
		return;
	}

	for (const resource of pkg.listResources()) {
		const resourceId = resource.getId();
		const isSkeletonImageDependency = skeletonDependencyImageIds.has(resourceId) && isImageResource(resource);
		const isSkeletonMiscDependency = skeletonDependencyMiscIds.has(resourceId) && isMiscResource(resource);
		const isPublishedExternal =
			publishedResourceIds.has(resourceId) &&
			(isMiscResource(resource) || isSwfResource(resource) || isSkeletonResource(resource));
		if (!isPublishedExternal && !isSkeletonImageDependency && !isSkeletonMiscDependency) continue;

		const writes: Array<{ sourcePath: string; targetName: string }> = [];
		if (isSkeletonImageDependency) {
			writes.push({
				sourcePath: resolveImagePath(resource, pkg, basePath),
				targetName: resolveImageFileName(resource),
			});
		}
		if (isSkeletonMiscDependency) {
			writes.push({
				sourcePath: resolveGenericResourcePath(resource, pkg, basePath),
				targetName: resolvePublishedSkeletonDependencyMiscFileName(resource, projectType),
			});
		}
		if (
			isPublishedExternal &&
			(isMiscResource(resource) || isSwfResource(resource) || isSkeletonResource(resource))
		) {
			const sourcePath = resolveGenericResourcePath(resource, pkg, basePath);
			const publishedFile = context.publishedFiles.get(resource.getId()) ?? resource.getFile();
			const targetName =
				isMiscResource(resource) || isSwfResource(resource)
					? `${pkg.getPublishName() || pkg.getName()}_${publishedFile}`
					: publishedFile;
			if (!writes.some((entry) => entry.targetName === targetName)) {
				writes.push({ sourcePath, targetName });
			}
		}

		for (const write of writes) {
			const targetPath = fs.join(outputDir, write.targetName);
			try {
				const data = await readFileRaw(write.sourcePath);
				await fs.writeFileRaw(targetPath, data);
			} catch {
				throw new Error(
					`publish: Could not export external resource "${resource.getId()}" from package "${pkg.getName()}".`,
				);
			}
		}
	}
}
