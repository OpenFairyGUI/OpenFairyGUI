import {
	type Component,
	type DragonBonesResource,
	type FontResource,
	type ImageResource,
	type MiscResource,
	type MovieClipResource,
	type Package,
	ProjectType,
	type SoundResource,
	type SpineResource,
} from '@openfairygui/core';
import type { AtlasRasterBackend } from './contracts.js';
import { collectPackageResourceReferences } from './resource-references.js';
import type { PackagePublishArtifactsExtras } from '../shared-types.js';

interface ImageResourceExtras extends Record<string, unknown> {
	_fileName?: string;
}

interface PublishFileExtras extends Record<string, unknown> {
	_publishedFile?: string;
	_publishedId?: string;
}

interface BranchAwarePublishedResource {
	getBranch?(): string;
}

interface PackagePublishContext {
	referencedIds: Set<string>;
	publishedResourceIds: Set<string>;
	exportedResourceIds: Set<string>;
	pixelHitTestImageIds: Set<string>;
	highResolutionItemIds: Map<string, Array<string | null>>;
	effectiveResourceIds: Map<string, string>;
	includeBranches: boolean;
}

const UNITY_PROJECT_TYPE = ProjectType.Unity;

function isComponentResource(resource: ReturnType<Package['listResources']>[number]): resource is Component {
	return resource.propertyType === 'Component';
}

export function isImageResource(resource: ReturnType<Package['listResources']>[number]): resource is ImageResource {
	return resource.propertyType === 'ImageResource';
}

function isMovieClipResource(resource: ReturnType<Package['listResources']>[number]): resource is MovieClipResource {
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

function isFontResource(resource: ReturnType<Package['listResources']>[number]): resource is FontResource {
	return resource.propertyType === 'FontResource';
}

export function isSoundResource(resource: ReturnType<Package['listResources']>[number]): resource is SoundResource {
	return resource.propertyType === 'SoundResource';
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

function resolvePackageAssetsBasePath(basePath: string, resource: BranchAwarePublishedResource | undefined): string {
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
	const extras = (resource.getExtras() as ImageResourceExtras | undefined) ?? {};
	return resource.getFileName() || extras._fileName || resource.getName();
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

function resolvePublishedMiscFileName(resource: MiscResource, projectType: number): string {
	const file = resource.getFile();
	if (projectType !== UNITY_PROJECT_TYPE) return file;
	if (file.toLowerCase().endsWith('.atlas')) return `${file}.txt`;
	return file;
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

function setPublishedFileExtra(
	resource: { getExtras(): Record<string, unknown> | undefined; setExtras(value: Record<string, unknown>): unknown },
	fileName: string,
): void {
	const extras = (resource.getExtras() as PublishFileExtras | undefined) ?? {};
	resource.setExtras({
		...extras,
		_publishedFile: fileName,
	});
}

function setPublishedIdExtra(
	resource: {
		getId(): string;
		getExtras(): Record<string, unknown> | undefined;
		setExtras(value: Record<string, unknown>): unknown;
	},
	effectiveId: string | null,
): void {
	const extras = (resource.getExtras() as PublishFileExtras | undefined) ?? {};
	if (!effectiveId || effectiveId === resource.getId()) {
		if (!('_publishedId' in extras)) return;
		const { _publishedId: _ignored, ...rest } = extras;
		resource.setExtras(rest);
		return;
	}
	resource.setExtras({
		...extras,
		_publishedId: effectiveId,
	});
}

export function getPublishedId(resource: { getId(): string; getExtras(): Record<string, unknown> | undefined }): string {
	const extras = (resource.getExtras() as PublishFileExtras | undefined) ?? {};
	return extras._publishedId ?? resource.getId();
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

function isHighResolutionVariantName(name: string): boolean {
	return /@(?:2|3|4)x(?:\.[^./\\]+)?$/iu.test(name);
}

function appendHighResolutionScaleToName(name: string, scale: number): string {
	const extensionIndex = name.lastIndexOf('.');
	if (extensionIndex > 0) {
		return `${name.slice(0, extensionIndex)}@${scale}x${name.slice(extensionIndex)}`;
	}
	return `${name}@${scale}x`;
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
): Map<string, Array<string | null>> {
	const result = new Map<string, Array<string | null>>();
	if (includeHighResolution <= 0) return result;

	const highResolutionResourceByKey = new Map<string, ImageResource | MovieClipResource>();
	for (const resource of resources) {
		if (!isHighResolutionResource(resource)) continue;
		highResolutionResourceByKey.set(buildHighResolutionResourceKey(resource), resource);
	}

	for (const resource of resources) {
		if (!isHighResolutionResource(resource)) continue;
		if (!publishedResourceIds.has(resource.getId())) continue;
		if (isHighResolutionVariantName(resource.getName())) continue;

		const ids: Array<string | null> = [];
		for (const level of HIGH_RESOLUTION_LEVELS) {
			if ((includeHighResolution & level.bit) === 0) {
				ids[level.slot] = null;
				continue;
			}

			const highResolutionResource = highResolutionResourceByKey.get(
				buildHighResolutionResourceKey(
					resource,
					appendHighResolutionScaleToName(resource.getName(), level.scale),
				),
			);
			if (!highResolutionResource) {
				ids[level.slot] = null;
				continue;
			}

			const highResolutionId = highResolutionResource.getId();
			publishedResourceIds.add(highResolutionId);
			ids[level.slot] = highResolutionId;
		}

		trimTrailingMissingHighResolutionIds(ids);
		if (ids.length > 0) result.set(resource.getId(), ids);
	}

	return result;
}

function collectPackagePublishContext(
	pkg: Package,
	options: {
		projectType: number;
		includeBranches: boolean;
		activeBranch: string;
		includeHighResolution: number;
	},
): PackagePublishContext {
	const resources = pkg.listResources();
	const resourceMap = new Map(resources.map((resource) => [resource.getId(), resource]));
	const referencedIds = collectPackageResourceReferences(pkg).localResourceIds;
	const pixelHitTestImageIds = new Set<string>();
	const spriteItemIds = new Set<string>();
	const collectExportedResourceIds = (
		sourceResources: ReturnType<Package['listResources']>,
		sourcePublishedResourceIds: Set<string>,
	): Set<string> => {
		const exportedResourceIds = new Set<string>(sourcePublishedResourceIds);
		const resourcesById = new Map(sourceResources.map((resource) => [resource.getId(), resource] as const));
		let changed = true;
		while (changed) {
			changed = false;
			for (const resourceId of [...exportedResourceIds]) {
				const resource = resourcesById.get(resourceId);
				if (!resource || !isSkeletonResource(resource)) continue;
				for (const requiredId of resource.getRequireIds()) {
					if (!requiredId || exportedResourceIds.has(requiredId)) continue;
					exportedResourceIds.add(requiredId);
					changed = true;
				}
			}
		}
		return exportedResourceIds;
	};

	for (const atlas of pkg.listAtlases()) {
		for (const sprite of atlas.listSprites()) {
			spriteItemIds.add(sprite.getItemId());
		}
	}

	for (const resource of resources) {
		if (!isComponentResource(resource)) continue;
		const component = resource;
		const children = component.listChildren();
		const childMap = new Map(children.map((child) => [child.getId?.() ?? '', child]));

		const hitTest = component.getHitTest?.()?.trim();
		if (hitTest && !hitTest.includes(',')) {
			const targetChild = childMap.get(hitTest);
			const sourceId = targetChild?.getSrc?.();
			if (sourceId) {
				const sourceResource = resourceMap.get(sourceId);
				if (sourceResource && isImageResource(sourceResource)) {
					pixelHitTestImageIds.add(sourceId);
				}
			}
		}
	}

	const publishedResourceIds = new Set<string>(spriteItemIds);
	for (const resource of resources) {
		const resourceId = resource.getId();
		if (!resourceId) continue;
		if (isComponentResource(resource)) {
			if (resource.getExported() || referencedIds.has(resourceId)) {
				publishedResourceIds.add(resourceId);
			}
			continue;
		}
		if (isImageResource(resource)) {
			if (
				resource.getExported() ||
				referencedIds.has(resourceId) ||
				spriteItemIds.has(resourceId) ||
				pixelHitTestImageIds.has(resourceId)
			) {
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
			if (resource.getExported() || referencedIds.has(resourceId)) {
				publishedResourceIds.add(resourceId);
			}
			continue;
		}
		const genericResource = resource as ReturnType<Package['listResources']>[number];
		if (genericResource.getExported() || referencedIds.has(resourceId)) {
			publishedResourceIds.add(resourceId);
		}
	}

	for (const resourceId of collectExportedResourceIds(resources, publishedResourceIds)) {
		publishedResourceIds.add(resourceId);
	}

	const highResolutionItemIds = collectHighResolutionItemIds(
		resources,
		publishedResourceIds,
		options.includeHighResolution,
	);

	if (!options.includeBranches) {
		const mainByKey = new Map<string, ReturnType<Package['listResources']>[number]>();
		const activeBranchByKey = new Map<string, ReturnType<Package['listResources']>[number]>();
		for (const resource of resources) {
			const branchName = getBranchName(resource);
			const key = buildBranchResourceKey(resource);
			if (!branchName) {
				mainByKey.set(key, resource);
			} else if (branchName === options.activeBranch) {
				activeBranchByKey.set(key, resource);
			}
		}

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
			if (override) {
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

		const mergedPixelHitTestImageIds = new Set<string>();
		for (const resource of resources) {
			if (!isImageResource(resource)) continue;
			const resourceId = resource.getId();
			if (!publishedResourceIds.has(resourceId)) continue;
			const effectiveId = effectiveResourceIds.get(resourceId) ?? resourceId;
			if (pixelHitTestImageIds.has(effectiveId)) {
				mergedPixelHitTestImageIds.add(resourceId);
			}
		}
		pixelHitTestImageIds.clear();
		for (const resourceId of mergedPixelHitTestImageIds) {
			pixelHitTestImageIds.add(resourceId);
		}

		return {
			referencedIds,
			publishedResourceIds,
			exportedResourceIds: collectExportedResourceIds(resources, publishedResourceIds),
			pixelHitTestImageIds,
			highResolutionItemIds,
			effectiveResourceIds,
			includeBranches: false,
		};
	}

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

export async function annotatePackagePublishArtifacts(
	pkg: Package,
	basePath: string | undefined,
	encoder: AtlasRasterBackend | undefined,
	options: {
		projectType: number;
		includeBranches: boolean;
		activeBranch: string;
		includeHighResolution: number;
	},
): Promise<void> {
	const {
		publishedResourceIds,
		exportedResourceIds,
		pixelHitTestImageIds,
		highResolutionItemIds,
		effectiveResourceIds,
		includeBranches,
	} = collectPackagePublishContext(pkg, options);
	for (const resource of pkg.listResources()) {
		setPublishedIdExtra(resource, effectiveResourceIds.get(resource.getId()) ?? null);
		if (isHighResolutionResource(resource)) {
			resource.setHighResolutionItemIds(highResolutionItemIds.get(resource.getId()) ?? []);
		}
	}
	await applyPixelHitTests(pkg, pixelHitTestImageIds, basePath, encoder);
	const extras = (pkg.getExtras() as PackagePublishArtifactsExtras | undefined) ?? {};
	pkg.setExtras({
		...extras,
		publishedResourceIds: [...publishedResourceIds].sort((a, b) => a.localeCompare(b)),
		exportedResourceIds: [...exportedResourceIds].sort((a, b) => a.localeCompare(b)),
		publishedIncludeBranches: includeBranches,
		publishedEffectiveResourceIds: Object.fromEntries(effectiveResourceIds),
	});
	for (const resource of pkg.listResources()) {
		if (isMiscResource(resource)) {
			setPublishedFileExtra(resource, resolvePublishedMiscFileName(resource, options.projectType));
			continue;
		}
		if (isSkeletonResource(resource)) {
			setPublishedFileExtra(resource, resolvePublishedSkeletonFileName(resource, options.projectType));
		}
	}
}

export function getAnnotatedPublishedResourceIds(pkg: Package): Set<string> {
	const extras = (pkg.getExtras() as PackagePublishArtifactsExtras | undefined) ?? {};
	return new Set(extras.publishedResourceIds ?? []);
}

export function getAnnotatedExportedResourceIds(pkg: Package): Set<string> {
	const extras = (pkg.getExtras() as PackagePublishArtifactsExtras | undefined) ?? {};
	return new Set(extras.exportedResourceIds ?? []);
}

export function getPublishedSkeletonDependencyImageIds(pkg: Package, publishedResourceIds: Set<string>): Set<string> {
	const imageIds = new Set<string>();
	const resourcesById = new Map(pkg.listResources().map((resource) => [resource.getId(), resource] as const));
	for (const resource of pkg.listResources()) {
		if (!isSkeletonResource(resource)) continue;
		if (!publishedResourceIds.has(resource.getId())) continue;
		for (const requiredId of resource.getRequireIds()) {
			if (!requiredId) continue;
			const required = resourcesById.get(requiredId);
			if (required && isImageResource(required)) imageIds.add(requiredId);
		}
	}
	return imageIds;
}
