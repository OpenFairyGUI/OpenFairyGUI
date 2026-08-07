import type { Package } from '@openfairygui/core';
import type { PublishFileSystem } from './contracts.js';
import {
	extname,
	getAnnotatedExportedResourceIds,
	getAnnotatedPublishedResourceIds,
	getPublishedId,
	getPublishedSkeletonDependencyImageIds,
	isImageResource,
	isMiscResource,
	isSkeletonResource,
	isSoundResource,
	resolveGenericResourcePath,
	resolveImageFileName,
	resolveImagePath,
	resolveSoundPath,
} from './package-context.js';

interface PublishFileExtras extends Record<string, unknown> {
	_publishedFile?: string;
}

export async function exportPackageSounds(
	pkg: Package,
	outputDir: string,
	basePath: string | undefined,
	fs: PublishFileSystem,
	readFileRaw: PublishFileSystem['readFileRaw'] | undefined,
): Promise<void> {
	const publishedResourceIds = getAnnotatedPublishedResourceIds(pkg);
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
		const targetName = `${pkg.getPublishName() || pkg.getName()}_${getPublishedId(resource)}${extname(resource.getFile() || '')}`;
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
	outputDir: string,
	basePath: string | undefined,
	fs: PublishFileSystem,
	readFileRaw: PublishFileSystem['readFileRaw'] | undefined,
): Promise<void> {
	const exportedResourceIds = getAnnotatedExportedResourceIds(pkg);
	const skeletonDependencyImageIds = getPublishedSkeletonDependencyImageIds(pkg, exportedResourceIds);
	if (exportedResourceIds.size === 0) return;
	if (!basePath || !readFileRaw) {
		const hasPublishedExternal = pkg.listResources().some((resource) => {
			return (
				((isMiscResource(resource) || isSkeletonResource(resource)) &&
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
		const isSkeletonExternal =
			exportedResourceIds.has(resourceId) && (isMiscResource(resource) || isSkeletonResource(resource));
		const isSkeletonImageDependency = skeletonDependencyImageIds.has(resourceId) && isImageResource(resource);
		if (!isSkeletonExternal && !isSkeletonImageDependency) continue;

		let sourcePath: string;
		let targetName: string;
		if (isSkeletonImageDependency) {
			sourcePath = resolveImagePath(resource, pkg, basePath);
			targetName = resolveImageFileName(resource);
		} else if (isMiscResource(resource) || isSkeletonResource(resource)) {
			sourcePath = resolveGenericResourcePath(resource, pkg, basePath);
			const publishedFile =
				((resource.getExtras() as PublishFileExtras | undefined) ?? {})._publishedFile ?? resource.getFile();
			targetName = isMiscResource(resource)
				? `${pkg.getPublishName() || pkg.getName()}_${publishedFile}`
				: publishedFile;
		} else {
			continue;
		}
		const targetPath = fs.join(outputDir, targetName);

		try {
			const data = await readFileRaw(sourcePath);
			await fs.writeFileRaw(targetPath, data);
		} catch {
			throw new Error(
				`publish: Could not export external resource "${resource.getId()}" from package "${pkg.getName()}".`,
			);
		}
	}
}
