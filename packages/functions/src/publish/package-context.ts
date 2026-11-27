import {
	type Component,
	type Document,
	type DragonBonesResource,
	type FontResource,
	type ImageResource,
	type MiscResource,
	type MovieClipResource,
	type Package,
	ProjectType,
	type SoundResource,
	type SpineResource,
	type SwfResource,
} from '@openfairygui/core';
import type { AtlasRasterBackend } from './contracts.js';
import { collectPackageResourceReferences } from './resource-references.js';

interface BranchAwarePublishedResource {
	getBranch?(): string;
}

export interface PackagePublishContext {
	publishedFiles: Map<string, string>;
	referencedIds: Set<string>;
	publishedResourceIds: Set<string>;
	exportedResourceIds: Set<string>;
	pixelHitTestImageIds: Set<string>;
	highResolutionItemIds: Map<string, Array<string | null>>;
	effectiveResourceIds: Map<string, string>;
	includeBranches: boolean;
}

const UNITY_PROJECT_TYPE = ProjectType.Unity;

export function isComponentResource(resource: ReturnType<Package['listResources']>[number]): resource is Component {
	return resource.propertyType === 'Component';
}

export function isImageResource(resource: ReturnType<Package['listResources']>[number]): resource is ImageResource {
	return resource.propertyType === 'ImageResource';
}

export function isMovieClipResource(
	resource: ReturnType<Package['listResources']>[number],
): resource is MovieClipResource {
	return resource.propertyType === 'MovieClipResource';
}

function isHighResolutionResource(
	resource: ReturnType<Package['listResources']>[number],
): resource is ImageResource | MovieClipResource {
	return isImageResource(resource) || isMovieClipResource(resource);
}

export function isMiscResource(resource: ReturnType<Package['listResources']>[number]): resource is MiscResource {
	return resource.propertyType === 'MiscResource';
}

export function isFontResource(resource: ReturnType<Package['listResources']>[number]): resource is FontResource {
	return resource.propertyType === 'FontResource';
}

export function getFontDependencyImageIds(font: FontResource): string[] {
	return [font.getTextureId(), ...font.listGlyphs().map((glyph) => glyph.getImg())].filter(Boolean);
}

export function isSoundResource(resource: ReturnType<Package['listResources']>[number]): resource is SoundResource {
	return resource.propertyType === 'SoundResource';
}

export function isSwfResource(resource: ReturnType<Package['listResources']>[number]): resource is SwfResource {
	return resource.propertyType === 'SwfResource';
}

function isSpineResource(resource: ReturnType<Package['listResources']>[number]): resource is SpineResource {
	return resource.propertyType === 'SpineResource';
}

function isDragonBonesResource(
	resource: ReturnType<Package['listResources']>[number],
): resource is DragonBonesResource {
	return resource.propertyType === 'DragonBonesResource';
}

export function isSkeletonResource(
	resource: ReturnType<Package['listResources']>[number],
): resource is SpineResource | DragonBonesResource {
	return isSpineResource(resource) || isDragonBonesResource(resource);
}

export function resolvePackageAssetsBasePath(
	basePath: string,
	resource: BranchAwarePublishedResource | undefined,
): string {
	const branchName = resource?.getBranch?.() ?? '';
	if (!branchName) return basePath;
	const normalized = basePath.replace(/[/\\]+$/, '');
	if (/[\\/]assets$/i.test(normalized)) {
		return normalized.replace(/([\\/])assets$/i, `$1assets_${branchName}`);
	}
	return `${normalized}_${branchName}`;
}

export function resolveImagePath(resource: ImageResource, pkg: Package, basePath: string): string {
	const fileName = resolveImageFileName(resource);
	const resourcePath = resource.getPath() ?? '/';
	const packageBasePath = resolvePackageAssetsBasePath(basePath, resource);
	return `${packageBasePath}/${pkg.getName()}${resourcePath}${fileName}`;
}

export function resolveImageFileName(resource: ImageResource): string {
	return resource.getFileName() || resource.getName();
}

export function resolveFontPath(resource: FontResource, pkg: Package, basePath: string): string {
	const fileName =
		resource.getFileName() ||
		(/\.fnt$/i.test(resource.getName()) ? resource.getName() : `${resource.getName()}.fnt`);
	return `${resolvePackageAssetsBasePath(basePath, resource)}/${pkg.getName()}${resource.getPath() || '/'}${fileName}`;
}

export function resolveMovieClipPath(resource: MovieClipResource, pkg: Package, basePath: string): string {
	const fileName =
		resource.getFileName() ||
		(/\.jta$/i.test(resource.getName()) ? resource.getName() : `${resource.getName()}.jta`);
	const resourcePath = resource.getPath() ?? '/';
	const packageBasePath = resolvePackageAssetsBasePath(basePath, resource);
	return `${packageBasePath}/${pkg.getName()}${resourcePath}${fileName}`;
}

export function resolveSoundPath(resource: SoundResource, pkg: Package, basePath: string): string {
	const resourcePath = resource.getPath() ?? '/';
	const packageBasePath = resolvePackageAssetsBasePath(basePath, resource);
	return `${packageBasePath}/${pkg.getName()}${resourcePath}${resource.getFile()}`;
}

export function resolveGenericResourcePath(
	resource: { getPath(): string; getFile(): string; getBranch?(): string },
	pkg: Package,
	basePath: string,
): string {
	const resourcePath = resource.getPath() ?? '/';
	const packageBasePath = resolvePackageAssetsBasePath(basePath, resource);
	return `${packageBasePath}/${pkg.getName()}${resourcePath}${resource.getFile()}`;
}

export function extname(fileName: string): string {
	const normalized = fileName.replace(/\\/g, '/');
	const lastSlash = normalized.lastIndexOf('/');
	const lastDot = normalized.lastIndexOf('.');
	if (lastDot <= lastSlash) return '';
	return normalized.slice(lastDot);
}

function resolvePublishedMiscFileName(
	resource: MiscResource,
	projectType: number,
	effectiveResourceIds: ReadonlyMap<string, string>,
): string {
	const fileName = `${getPublishedId(resource, effectiveResourceIds)}${extname(resource.getFile())}`;
	if (projectType === UNITY_PROJECT_TYPE && fileName.toLowerCase().endsWith('.atlas')) {
		return `${fileName}.txt`;
	}
	return fileName;
}

export function resolvePublishedSkeletonDependencyMiscFileName(resource: MiscResource, projectType: number): string {
	const fileName = resource.getFile();
	if (projectType === UNITY_PROJECT_TYPE && fileName.toLowerCase().endsWith('.atlas')) {
		return `${fileName}.txt`;
	}
	return fileName;
}

function resolvePublishedSwfFileName(resource: SwfResource, effectiveResourceIds: ReadonlyMap<string, string>): string {
	return `${getPublishedId(resource, effectiveResourceIds)}${extname(resource.getFile()) || '.swf'}`;
}

function resolvePublishedSkeletonFileName(resource: SpineResource | DragonBonesResource, projectType: number): string {
	if (
		projectType === UNITY_PROJECT_TYPE &&
		isSpineResource(resource) &&
		resource.getFile().toLowerCase().endsWith('.skel')
	) {
		return `${resource.getFile()}.bytes`;
	}
	return resource.getFile();
}

export function getPublishedId(
	resource: { getId(): string },
	effectiveResourceIds: ReadonlyMap<string, string>,
): string {
	return effectiveResourceIds.get(resource.getId()) ?? resource.getId();
}

function getBranchName(resource: BranchAwarePublishedResource | undefined): string {
	return resource?.getBranch?.() ?? '';
}

function buildBranchResourceKey(resource: { propertyType: string; getPath(): string; getName(): string }): string {
	return `${resource.propertyType}|${resource.getPath() ?? ''}|${resource.getName() ?? ''}`;
}

const HIGH_RESOLUTION_LEVELS = [
	{ scale: 2, bit: 1, slot: 0 },
	{ scale: 3, bit: 2, slot: 1 },
	{ scale: 4, bit: 4, slot: 2 },
] as const;

function buildHighResolutionResourceKey(
	resource: {
		propertyType: string;
		getPath(): string;
		getName(): string;
		getBranch?(): string;
	},
	name = resource.getName(),
): string {
	return `${resource.propertyType}|${resource.getBranch?.() ?? ''}|${resource.getPath() ?? ''}|${name}`;
}

const HIGH_RESOLUTION_MEDIA_EXT_RE = /\.(?:png|jpe?g|gif|webp|bmp|svg|psd|jta)$/iu;

function isHighResolutionVariantName(name: string): boolean {
	return /@(?:2|3|4)x(?:\.(?:png|jpe?g|gif|webp|bmp|svg|psd|jta))?$/iu.test(name);
}

function getHighResolutionCandidateNames(name: string, scale: number): string[] {
	const direct = `${name}@${scale}x`;
	const extMatch = HIGH_RESOLUTION_MEDIA_EXT_RE.exec(name);
	if (extMatch && extMatch.index > 0) {
		const beforeExt = `${name.slice(0, extMatch.index)}@${scale}x${extMatch[0]}`;
		return [direct, beforeExt];
	}
	return [direct];
}

function trimTrailingMissingHighResolutionIds(ids: Array<string | null>): Array<string | null> {
	while (ids.length > 0 && !ids[ids.length - 1]) {
		ids.pop();
	}
	return ids;
}

function collectHighResolutionItemIds(
	resources: ReturnType<Package['listResources']>,
	publishedResourceIds: Set<string>,
	includeHighResolution: number,
	excludedResourceIds: Set<string>,
	options: {
		includeBranches: boolean;
		activeBranch: string;
		mainByKey?: ReadonlyMap<string, ReturnType<Package['listResources']>[number]>;
		effectiveResourceIds?: Map<string, string>;
	},
): Map<string, Array<string | null>> {
	const result = new Map<string, Array<string | null>>();
	if (includeHighResolution <= 0) return result;

	const highResolutionResourceByKey = new Map<string, ImageResource | MovieClipResource>();
	if (options.includeBranches) {
		for (const resource of resources) {
			if (!isHighResolutionResource(resource) || excludedResourceIds.has(resource.getId())) continue;
			highResolutionResourceByKey.set(buildHighResolutionResourceKey(resource), resource);
		}
	} else {
		// In merged-branch mode, active branch high-res variants override main high-res variants.
		for (const resource of resources) {
			if (!isHighResolutionResource(resource) || excludedResourceIds.has(resource.getId())) continue;
			const branchName = getBranchName(resource);
			if (branchName) continue;
			highResolutionResourceByKey.set(buildBranchResourceKey(resource), resource);
		}
		if (options.activeBranch) {
			for (const resource of resources) {
				if (!isHighResolutionResource(resource) || excludedResourceIds.has(resource.getId())) continue;
				if (getBranchName(resource) !== options.activeBranch) continue;
				highResolutionResourceByKey.set(buildBranchResourceKey(resource), resource);
			}
		}
	}

	for (const resource of resources) {
		if (!isHighResolutionResource(resource) || excludedResourceIds.has(resource.getId())) continue;
		if (!publishedResourceIds.has(resource.getId())) continue;
		if (isHighResolutionVariantName(resource.getName())) continue;

		const ids: Array<string | null> = [];
		for (const level of HIGH_RESOLUTION_LEVELS) {
			if ((includeHighResolution & level.bit) === 0) {
				ids[level.slot] = null;
				continue;
			}

			let highResolutionResource: ImageResource | MovieClipResource | undefined;
			for (const candidateName of getHighResolutionCandidateNames(resource.getName(), level.scale)) {
				const lookupKey = options.includeBranches
					? buildHighResolutionResourceKey(resource, candidateName)
					: `${resource.propertyType}|${resource.getPath() ?? ''}|${candidateName}`;
				const found = highResolutionResourceByKey.get(lookupKey);
				if (found) {
					highResolutionResource = found;
					break;
				}
			}
			if (!highResolutionResource) {
				ids[level.slot] = null;
				continue;
			}

			const highResolutionId = highResolutionResource.getId();
			publishedResourceIds.add(highResolutionId);
			if (
				!options.includeBranches &&
				options.effectiveResourceIds &&
				!options.effectiveResourceIds.has(highResolutionId)
			) {
				const branchName = getBranchName(highResolutionResource);
				const mainVariant = branchName
					? options.mainByKey?.get(buildBranchResourceKey(highResolutionResource))
					: undefined;
				options.effectiveResourceIds.set(highResolutionId, mainVariant?.getId() ?? highResolutionId);
			}
			ids[level.slot] = highResolutionId;
		}

		trimTrailingMissingHighResolutionIds(ids);
		if (ids.length > 0) result.set(resource.getId(), ids);
	}

	return result;
}

export function collectPackagePublishContext(
	pkg: Package,
	options: {
		doc?: Document;
		projectType: number;
		includeBranches: boolean;
		activeBranch: string;
		includeHighResolution: number;
	},
): Omit<PackagePublishContext, 'publishedFiles'> {
	const resources = pkg.listResources();
	const excludedResourceIds = new Set(pkg.getSourceAtlasSettings().excludedResourceIds);
	const resourceMap = new Map(resources.map((resource) => [resource.getId(), resource]));
	const referencedIds = collectPackageResourceReferences(pkg, options.doc, {
		exportedOnly: true,
		includeBranches: options.includeBranches,
		activeBranch: options.activeBranch,
	}).localResourceIds;

	const collectFontDependencyIds = (
		sourceResources: ReturnType<Package['listResources']>,
		sourcePublishedResourceIds: Set<string>,
	): void => {
		const resourcesById = new Map(sourceResources.map((resource) => [resource.getId(), resource] as const));
		let changed = true;
		while (changed) {
			changed = false;
			for (const resourceId of [...sourcePublishedResourceIds]) {
				if (excludedResourceIds.has(resourceId)) {
					sourcePublishedResourceIds.delete(resourceId);
					changed = true;
					continue;
				}
				const resource = resourcesById.get(resourceId);
				if (!resource || !isFontResource(resource)) continue;
				for (const requiredId of getFontDependencyImageIds(resource)) {
					if (
						!requiredId ||
						excludedResourceIds.has(requiredId) ||
						sourcePublishedResourceIds.has(requiredId)
					)
						continue;
					sourcePublishedResourceIds.add(requiredId);
					changed = true;
				}
			}
		}
	};

	const collectExportedResourceIds = (
		sourceResources: ReturnType<Package['listResources']>,
		sourcePublishedResourceIds: Set<string>,
		activeBranchByKey?: ReadonlyMap<string, ReturnType<Package['listResources']>[number]>,
	): Set<string> => {
		const exportedResourceIds = new Set<string>(sourcePublishedResourceIds);
		const resourcesById = new Map(sourceResources.map((resource) => [resource.getId(), resource] as const));
		let changed = true;
		while (changed) {
			changed = false;
			for (const resourceId of [...exportedResourceIds]) {
				if (excludedResourceIds.has(resourceId)) {
					exportedResourceIds.delete(resourceId);
					changed = true;
					continue;
				}
				const resource = resourcesById.get(resourceId);
				if (!resource) continue;
				const requiredIds = isSkeletonResource(resource)
					? resource.getRequireIds()
					: isFontResource(resource)
						? getFontDependencyImageIds(resource)
						: [];
				for (const rawRequiredId of requiredIds) {
					if (!rawRequiredId || excludedResourceIds.has(rawRequiredId)) continue;
					let resolvedRequiredId = rawRequiredId;
					if (activeBranchByKey) {
						const rawTarget = resourcesById.get(rawRequiredId);
						if (rawTarget && !getBranchName(rawTarget)) {
							const override = activeBranchByKey.get(buildBranchResourceKey(rawTarget));
							if (override && !excludedResourceIds.has(override.getId())) {
								resolvedRequiredId = override.getId();
							}
						}
					}
					if (exportedResourceIds.has(resolvedRequiredId)) continue;
					exportedResourceIds.add(resolvedRequiredId);
					changed = true;
				}
			}
		}
		return exportedResourceIds;
	};

	const mainByKey = new Map<string, ReturnType<Package['listResources']>[number]>();
	const activeBranchByKey = new Map<string, ReturnType<Package['listResources']>[number]>();
	const branchVariantsByKey = new Map<string, Array<ReturnType<Package['listResources']>[number]>>();
	for (const resource of resources) {
		const branchName = getBranchName(resource);
		const key = buildBranchResourceKey(resource);
		if (!branchName) {
			mainByKey.set(key, resource);
		} else {
			const list = branchVariantsByKey.get(key) ?? [];
			list.push(resource);
			branchVariantsByKey.set(key, list);
			if (branchName === options.activeBranch) {
				activeBranchByKey.set(key, resource);
			}
		}
	}

	const publishedResourceIds = new Set<string>();
	for (const resource of resources) {
		const resourceId = resource.getId();
		if (!resourceId || excludedResourceIds.has(resourceId)) continue;
		if (isComponentResource(resource)) {
			if (resource.getExported() || referencedIds.has(resourceId)) {
				publishedResourceIds.add(resourceId);
			}
			continue;
		}
		if (isImageResource(resource)) {
			if (resource.getExported() || referencedIds.has(resourceId)) {
				publishedResourceIds.add(resourceId);
			}
			continue;
		}
		if (isMovieClipResource(resource) || isSoundResource(resource)) {
			if (resource.getExported() || referencedIds.has(resourceId)) publishedResourceIds.add(resourceId);
			continue;
		}
		if (isMiscResource(resource) || isSkeletonResource(resource)) {
			if (resource.getExported() || referencedIds.has(resourceId)) publishedResourceIds.add(resourceId);
			continue;
		}
		if (isFontResource(resource)) {
			if (!resource.isExternalFont() && (resource.getExported() || referencedIds.has(resourceId))) {
				publishedResourceIds.add(resourceId);
			}
			continue;
		}
		const genericResource = resource as ReturnType<Package['listResources']>[number];
		if (genericResource.getExported() || referencedIds.has(resourceId)) {
			publishedResourceIds.add(resourceId);
		}
	}

	// Only expand font image dependencies into Block 1 publishedResourceIds;
	// skeleton requireIds stay sidecar-only in exportedResourceIds.
	collectFontDependencyIds(resources, publishedResourceIds);

	if (options.includeBranches) {
		// Ensure branch variants of published main resources are also included (matching FPackageItem branch publish).
		for (const resourceId of [...publishedResourceIds]) {
			const resource = resourceMap.get(resourceId);
			if (!resource || getBranchName(resource)) continue;
			for (const variant of branchVariantsByKey.get(buildBranchResourceKey(resource)) ?? []) {
				const variantId = variant.getId();
				if (variantId && !excludedResourceIds.has(variantId)) {
					publishedResourceIds.add(variantId);
				}
			}
		}
		collectFontDependencyIds(resources, publishedResourceIds);
	}

	const collectPixelHitTestImages = (activeResourceIds: Set<string>): Set<string> => {
		const imageIds = new Set<string>();
		for (const resource of resources) {
			if (!isComponentResource(resource)) continue;
			if (!activeResourceIds.has(resource.getId())) continue;
			const children = resource.listChildren();
			const childMap = new Map(children.map((child) => [child.getId?.() ?? '', child]));

			const hitTest = resource.getHitTest?.()?.trim();
			if (hitTest && !hitTest.includes(',')) {
				const targetChild = childMap.get(hitTest);
				const sourceId = (targetChild as { getSrc?(): string } | undefined)?.getSrc?.();
				if (sourceId && !excludedResourceIds.has(sourceId)) {
					const sourceResource = resourceMap.get(sourceId);
					if (sourceResource && isImageResource(sourceResource)) {
						imageIds.add(sourceId);
					}
				}
			}
		}
		return imageIds;
	};

	if (!options.includeBranches) {
		const mergedPublishedResourceIds = new Set<string>();
		const effectiveResourceIds = new Map<string, string>();
		for (const resource of resources) {
			const resourceId = resource.getId();
			if (!publishedResourceIds.has(resourceId)) continue;

			const branchName = getBranchName(resource);
			const key = buildBranchResourceKey(resource);
			if (branchName) {
				if (branchName !== options.activeBranch) continue;
				const mainResource = mainByKey.get(key);
				mergedPublishedResourceIds.add(resourceId);
				effectiveResourceIds.set(resourceId, mainResource?.getId() ?? resourceId);
				continue;
			}

			const override = activeBranchByKey.get(key);
			if (override && !excludedResourceIds.has(override.getId())) {
				mergedPublishedResourceIds.add(override.getId());
				effectiveResourceIds.set(override.getId(), resourceId);
				continue;
			}

			mergedPublishedResourceIds.add(resourceId);
			effectiveResourceIds.set(resourceId, resourceId);
		}

		publishedResourceIds.clear();
		for (const resourceId of mergedPublishedResourceIds) {
			publishedResourceIds.add(resourceId);
		}

		// Expand font dependencies of any merged active-branch fonts and resolve their effective IDs.
		const beforeFontDepIds = new Set(publishedResourceIds);
		collectFontDependencyIds(resources, publishedResourceIds);
		for (const resourceId of [...publishedResourceIds]) {
			if (beforeFontDepIds.has(resourceId)) continue;
			const resource = resourceMap.get(resourceId);
			if (!resource) continue;
			const branchName = getBranchName(resource);
			const key = buildBranchResourceKey(resource);
			if (!branchName) {
				const override = activeBranchByKey.get(key);
				if (override && !excludedResourceIds.has(override.getId())) {
					publishedResourceIds.delete(resourceId);
					publishedResourceIds.add(override.getId());
					effectiveResourceIds.set(override.getId(), resourceId);
					continue;
				}
				effectiveResourceIds.set(resourceId, resourceId);
			} else if (branchName === options.activeBranch) {
				const mainResource = mainByKey.get(key);
				effectiveResourceIds.set(resourceId, mainResource?.getId() ?? resourceId);
			}
		}

		const highResolutionItemIds = collectHighResolutionItemIds(
			resources,
			publishedResourceIds,
			options.includeHighResolution,
			excludedResourceIds,
			{
				includeBranches: false,
				activeBranch: options.activeBranch,
				mainByKey,
				effectiveResourceIds,
			},
		);

		const rawPixelHitTestImageIds = collectPixelHitTestImages(publishedResourceIds);
		const pixelHitTestImageIds = new Set<string>();
		for (const resource of resources) {
			if (!isImageResource(resource)) continue;
			const resourceId = resource.getId();
			if (!publishedResourceIds.has(resourceId)) continue;
			const effectiveId = effectiveResourceIds.get(resourceId) ?? resourceId;
			if (rawPixelHitTestImageIds.has(resourceId) || rawPixelHitTestImageIds.has(effectiveId)) {
				pixelHitTestImageIds.add(resourceId);
			}
		}

		return {
			referencedIds,
			publishedResourceIds,
			exportedResourceIds: collectExportedResourceIds(
				resources,
				publishedResourceIds,
				options.activeBranch ? activeBranchByKey : undefined,
			),
			pixelHitTestImageIds,
			highResolutionItemIds,
			effectiveResourceIds,
			includeBranches: false,
		};
	}

	const highResolutionItemIds = collectHighResolutionItemIds(
		resources,
		publishedResourceIds,
		options.includeHighResolution,
		excludedResourceIds,
		{
			includeBranches: true,
			activeBranch: '',
		},
	);
	const pixelHitTestImageIds = collectPixelHitTestImages(publishedResourceIds);

	return {
		referencedIds,
		publishedResourceIds,
		exportedResourceIds: collectExportedResourceIds(resources, publishedResourceIds),
		pixelHitTestImageIds,
		highResolutionItemIds,
		effectiveResourceIds: new Map([...publishedResourceIds].map((resourceId) => [resourceId, resourceId])),
		includeBranches: true,
	};
}

async function applyPixelHitTests(
	pkg: Package,
	imageIds: Set<string>,
	basePath: string | undefined,
	encoder: AtlasRasterBackend | undefined,
): Promise<void> {
	const images = pkg.listImageResources();
	for (const image of images) {
		image.setPixelHitTestData(null);
	}
	if (!basePath || !encoder || imageIds.size === 0) return;

	for (const image of images) {
		const imageId = image.getId();
		if (!imageIds.has(imageId)) continue;
		try {
			const sourcePath = resolveImagePath(image, pkg, basePath);
			const metadata = await encoder(sourcePath).metadata();
			if (!metadata.width || !metadata.height) continue;

			const resizedWidth = Math.max(1, Math.floor(metadata.width / 2));
			const resizedHeight = Math.max(1, Math.floor(metadata.height / 2));
			const { data, info } = await encoder(sourcePath)
				.ensureAlpha()
				.resize({
					width: resizedWidth,
					height: resizedHeight,
					fit: 'fill',
				})
				.raw()
				.toBuffer({ resolveWithObject: true });

			const pixelCount = info.width * info.height;
			const maskBytes = new Uint8Array(Math.ceil(pixelCount / 8));
			let byteValue = 0;
			let bitIndex = 0;
			let maskIndex = 0;

			for (let pixel = 0; pixel < pixelCount; pixel++) {
				const alpha = data[pixel * info.channels + 3];
				if (alpha > 10) byteValue |= 1 << bitIndex;
				bitIndex++;
				if (bitIndex === 8) {
					maskBytes[maskIndex++] = byteValue;
					bitIndex = 0;
					byteValue = 0;
				}
			}
			if (bitIndex !== 0) {
				maskBytes[maskIndex] = byteValue;
			}

			image.setPixelHitTestData({
				pixelWidth: info.width,
				scaleDenominator: 2,
				pixels: maskBytes,
			});
		} catch {
			image.setPixelHitTestData(null);
		}
	}
}

export async function preparePackagePublishContext(
	pkg: Package,
	basePath: string | undefined,
	encoder: AtlasRasterBackend | undefined,
	options: {
		doc?: Document;
		projectType: number;
		includeBranches: boolean;
		activeBranch: string;
		includeHighResolution: number;
	},
): Promise<PackagePublishContext> {
	const context = collectPackagePublishContext(pkg, options);
	for (const resource of pkg.listResources()) {
		if (isHighResolutionResource(resource)) {
			resource.setHighResolutionItemIds(context.highResolutionItemIds.get(resource.getId()) ?? []);
		}
	}
	await applyPixelHitTests(pkg, context.pixelHitTestImageIds, basePath, encoder);
	const publishedFiles = new Map<string, string>();
	for (const resource of pkg.listResources()) {
		if (isMiscResource(resource)) {
			publishedFiles.set(
				resource.getId(),
				resolvePublishedMiscFileName(resource, options.projectType, context.effectiveResourceIds),
			);
		} else if (isSwfResource(resource)) {
			publishedFiles.set(resource.getId(), resolvePublishedSwfFileName(resource, context.effectiveResourceIds));
		} else if (isSkeletonResource(resource)) {
			publishedFiles.set(resource.getId(), resolvePublishedSkeletonFileName(resource, options.projectType));
		}
	}
	return { ...context, publishedFiles };
}

export function getPublishedSkeletonDependencyImageIds(pkg: Package, exportedResourceIds: Set<string>): Set<string> {
	const imageIds = new Set<string>();
	const resourcesById = new Map(pkg.listResources().map((resource) => [resource.getId(), resource] as const));
	for (const resource of pkg.listResources()) {
		if (!isSkeletonResource(resource)) continue;
		if (!exportedResourceIds.has(resource.getId())) continue;
		for (const requiredId of resource.getRequireIds()) {
			if (!requiredId) continue;
			const required = resourcesById.get(requiredId);
			if (required && isImageResource(required) && exportedResourceIds.has(requiredId)) imageIds.add(requiredId);
		}
	}
	return imageIds;
}

export function getPublishedSkeletonDependencyMiscIds(pkg: Package, exportedResourceIds: Set<string>): Set<string> {
	const miscIds = new Set<string>();
	const resourcesById = new Map(pkg.listResources().map((resource) => [resource.getId(), resource] as const));
	for (const resource of pkg.listResources()) {
		if (!isSkeletonResource(resource)) continue;
		if (!exportedResourceIds.has(resource.getId())) continue;
		for (const requiredId of resource.getRequireIds()) {
			if (!requiredId) continue;
			const required = resourcesById.get(requiredId);
			if (required && isMiscResource(required) && exportedResourceIds.has(requiredId)) miscIds.add(requiredId);
		}
	}
	return miscIds;
}
