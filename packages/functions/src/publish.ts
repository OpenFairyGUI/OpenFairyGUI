import {
	type BinaryWriterOptions,
	BinaryWriter,
	type Component,
	type DragonBonesResource,
	type Document,
	type FileSystem,
	type FontResource,
	type ImageResource,
	type MiscResource,
	type MovieClipResource,
	type Package,
	ProjectType,
	type SpineResource,
	type SoundResource,
	type Transform,
} from '@openfairygui/core';
import { createTransform } from './utils.js';
import { atlas, type AtlasOptions } from './atlas.js';
import type {
	CliPublishSettings,
	HasOptionalFont,
	PackagePublishArtifactsExtras,
	PublishFileSystem,
	RootProjectSettings,
} from './shared-types.js';

export interface PublishOptions {
	/**
	 * Output directory for published files (.fui + atlas PNGs).
	 * Required.
	 */
	output: string;

	/**
	 * Compress the binary data with zlib raw deflate. Default: false.
	 */
	compressed?: boolean;

	/**
	 * File extension for the binary output. Default: 'fui'.
	 * Unity projects typically use 'bytes'.
	 */
	fileExtension?: string;

	/**
	 * Sharp module instance for atlas image compositing.
	 * If not provided, atlas packing only computes layout (no PNGs generated).
	 */
	encoder?: unknown;

	/**
	 * Base path for reading source images (project assets root).
	 * Required when encoder is provided.
	 */
	basePath?: string;

	/**
	 * Atlas packing options.
	 */
	atlas?: Omit<AtlasOptions, 'encoder' | 'basePath' | 'outputPath'>;

	/**
	 * Filter which packages to publish by name. If not set, all packages are published.
	 */
	packages?: string[];

	/**
	 * FileSystem abstraction for writing output files.
	 * Required for actual file output. Without it, only the Document model
	 * is updated (atlas layout computed, sprite nodes created).
	 */
	fs?: PublishFileSystem;

	/**
	 * Active branch name used when branchProcessing is "主干合并活跃分支".
	 * Empty or omitted means publishing the main branch.
	 */
	branch?: string;
}

export interface ResolvedPublishAtlasOptions extends Pick<AtlasOptions, 'maxSize' | 'fast' | 'allowRotation' | 'padding' | 'powerOfTwo' | 'square' | 'multiPage' | 'trimImage' | 'extractAlpha'> {}

export interface ResolvePublishOptionsOverrides {
	compressed?: boolean;
	fileExtension?: string;
	packages?: string[];
	atlas?: Partial<ResolvedPublishAtlasOptions>;
}

export interface ResolvedPublishOptions {
	compressed: boolean;
	fileExtension: string;
	packages?: string[];
	atlas: ResolvedPublishAtlasOptions;
}

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
	pixelHitTestImageIds: Set<string>;
	effectiveResourceIds: Map<string, string>;
	includeBranches: boolean;
}

interface ChildReferenceItem {
	icon?: string | null;
	url?: string | null;
}

interface GearWithPublishRefs {
	getValues?(): string;
	getDefaultValue?(): unknown;
}

interface TransitionItemWithPublishRefs {
	getStartValue?(): unknown;
	getEndValue?(): unknown;
}

interface TransitionWithPublishRefs {
	listItems?(): TransitionItemWithPublishRefs[];
}

interface ChildWithPublishRefs extends HasOptionalFont {
	getId?(): string;
	getSrc?(): string;
	getUrl?(): string;
	getDefaultItem?(): string;
	getIcon?(): string;
	getSelectedIcon?(): string;
	getDropdown?(): string;
	getSound?(): string;
	getText?(): string;
	getInstanceIcon?(): string;
	getInstanceSelectedIcon?(): string;
	getVtScrollBarRes?(): string;
	getHzScrollBarRes?(): string;
	getHeaderRes?(): string;
	getFooterRes?(): string;
	getInstanceComboItems?(): Array<{ icon: string | null }>;
	getListItems?(): ChildReferenceItem[];
	listGears?(): GearWithPublishRefs[];
}

interface ComponentWithPublishRefs {
	getId(): string;
	getExported(): boolean;
	listChildren(): ChildWithPublishRefs[];
	getHitTest?(): string;
	getDropdown?(): string;
	getHeaderRes?(): string;
	getFooterRes?(): string;
	getVtScrollBarRes?(): string;
	getHzScrollBarRes?(): string;
	getSound?(): string;
	getFont?(): string | string[] | null | undefined;
	listTransitions?(): TransitionWithPublishRefs[];
}

interface PublishEncoderMetadata {
	width?: number;
	height?: number;
	channels?: number;
}

interface PublishEncoderResolvedBuffer {
	data: Uint8Array;
	info: Required<Pick<PublishEncoderMetadata, 'width' | 'height' | 'channels'>> & PublishEncoderMetadata;
}

interface PublishEncoderPipeline {
	ensureAlpha(): PublishEncoderPipeline;
	resize(options: { width: number; height: number; fit: 'fill' }): PublishEncoderPipeline;
	raw(): PublishEncoderPipeline;
	toBuffer(options: { resolveWithObject: true }): Promise<PublishEncoderResolvedBuffer>;
	metadata(): Promise<PublishEncoderMetadata>;
}

type PublishEncoder = (input: string | Uint8Array) => PublishEncoderPipeline;

const UNITY_PROJECT_TYPE = ProjectType.Unity;

function resolveDefaultPublishFileExtension(projectType: number, publishSettings: CliPublishSettings): string {
	if (projectType === UNITY_PROJECT_TYPE) {
		return 'bytes';
	}
	// publish() is currently a binary forward-publish path. For non-Unity projects,
	// keep the emitted contract driven by the configured extension, falling back to
	// `fui`, which intentionally covers the editor-aligned Layabox binary contract.
	return publishSettings.fileExtension || 'fui';
}

export interface PublishAtlasRuntimeOptions {
	preserveInputOrderOnTie: boolean;
	directSingleImageOutput: boolean;
}

export function resolvePublishAtlasRuntimeOptions(fileExtension: string): PublishAtlasRuntimeOptions {
	return {
		preserveInputOrderOnTie: fileExtension === 'fui',
		directSingleImageOutput: fileExtension === 'bytes',
	};
}

function resolvePublishFileName(publishName: string, fileExtension: string): string {
	if (fileExtension === 'bytes') {
		return `${publishName}_fui.bytes`;
	}
	return `${publishName}.${fileExtension}`;
}

/**
 * Resolve publish defaults from the document's project settings.
 *
 * This keeps the editor-aligned publish rules reusable across environments,
 * while callers still provide environment-specific concerns such as fs/encoder/basePath.
 */
export function resolvePublishOptions(
	doc: Document,
	overrides: ResolvePublishOptionsOverrides = {},
): ResolvedPublishOptions {
	const root = doc.getRoot();
	const settings = (root.getSettings?.() ?? {}) as RootProjectSettings;
	const publishSettings: CliPublishSettings = settings.publish ?? {};
	const atlasSetting = publishSettings.atlasSetting ?? {};
	const projectType = root.getProjectType();

	const fileExtension = overrides.fileExtension
		?? resolveDefaultPublishFileExtension(projectType, publishSettings);

	let compressed = overrides.compressed ?? publishSettings.compressDesc ?? false;
	if (projectType === UNITY_PROJECT_TYPE) {
		compressed = overrides.compressed ?? false;
	}

	const atlasOptions: ResolvedPublishAtlasOptions = {
		maxSize: overrides.atlas?.maxSize ?? atlasSetting.maxSize ?? 2048,
		fast: overrides.atlas?.fast ?? atlasSetting.fast ?? true,
		allowRotation: overrides.atlas?.allowRotation ?? atlasSetting.allowRotation ?? false,
		padding: overrides.atlas?.padding ?? atlasSetting.padding ?? 2,
		powerOfTwo: overrides.atlas?.powerOfTwo ?? atlasSetting.sizeOption === 'pot',
		square: overrides.atlas?.square ?? atlasSetting.forceSquare ?? false,
		multiPage: overrides.atlas?.multiPage ?? atlasSetting.paging ?? true,
		trimImage: overrides.atlas?.trimImage ?? atlasSetting.trimImage ?? false,
		extractAlpha: overrides.atlas?.extractAlpha ?? atlasSetting.extractAlpha ?? false,
	};

	return {
		compressed,
		fileExtension,
		packages: overrides.packages,
		atlas: atlasOptions,
	};
}

function dirname(filePath: string): string {
	const trimmed = filePath.replace(/[/\\]+$/, '');
	const match = trimmed.match(/^(.*)[/\\][^/\\]+$/);
	return match?.[1] ?? '';
}

function createUnsupportedFsOperation(name: keyof FileSystem) {
	return async (): Promise<never> => {
		throw new Error(`publish: FileSystem.${name}() is not available in the publish writer adapter.`);
	};
}

function toBinaryWriterFileSystem(fs: PublishFileSystem): FileSystem {
	return {
		readFile: createUnsupportedFsOperation('readFile'),
		readFileRaw: createUnsupportedFsOperation('readFileRaw'),
		writeFile: createUnsupportedFsOperation('writeFile'),
		writeFileRaw: fs.writeFileRaw,
		mkdir: fs.mkdir,
		readdir: createUnsupportedFsOperation('readdir'),
		exists: createUnsupportedFsOperation('exists'),
		join: fs.join,
		dirname,
	};
}

function isComponentResource(resource: ReturnType<Package['listResources']>[number]): resource is Component {
	return resource.propertyType === 'Component';
}

function isImageResource(resource: ReturnType<Package['listResources']>[number]): resource is ImageResource {
	return resource.propertyType === 'ImageResource';
}

function isMovieClipResource(resource: ReturnType<Package['listResources']>[number]): resource is MovieClipResource {
	return resource.propertyType === 'MovieClipResource';
}

function isMiscResource(resource: ReturnType<Package['listResources']>[number]): resource is MiscResource {
	return resource.propertyType === 'MiscResource';
}

function isFontResource(resource: ReturnType<Package['listResources']>[number]): resource is FontResource {
	return resource.propertyType === 'FontResource';
}

function isSoundResource(resource: ReturnType<Package['listResources']>[number]): resource is SoundResource {
	return resource.propertyType === 'SoundResource';
}

function isSpineResource(resource: ReturnType<Package['listResources']>[number]): resource is SpineResource {
	return resource.propertyType === 'SpineResource';
}

function isDragonBonesResource(resource: ReturnType<Package['listResources']>[number]): resource is DragonBonesResource {
	return resource.propertyType === 'DragonBonesResource';
}

function isSkeletonResource(
	resource: ReturnType<Package['listResources']>[number],
): resource is SpineResource | DragonBonesResource {
	return isSpineResource(resource) || isDragonBonesResource(resource);
}

function addLocalUiResourceRef(target: Set<string>, pkgId: string, value: string | null | undefined): void {
	if (!value || typeof value !== 'string' || !value.startsWith(`ui://${pkgId}`) || value.length <= 13) return;
	target.add(value.slice(13));
}

function addLocalUiResourceRefsFromText(target: Set<string>, pkgId: string, value: string | null | undefined): void {
	if (!value || typeof value !== 'string') return;
	const prefix = `ui://${pkgId}`;
	let index = value.indexOf(prefix);
	while (index !== -1) {
		const start = index + prefix.length;
		let end = start;
		while (end < value.length && /[0-9a-z]/i.test(value[end] ?? '')) end++;
		if (end > start) target.add(value.slice(start, end));
		index = value.indexOf(prefix, end);
	}
}

function addLocalUiResourceRefsFromUnknown(target: Set<string>, pkgId: string, value: unknown): void {
	if (Array.isArray(value)) {
		for (const entry of value) addLocalUiResourceRefsFromUnknown(target, pkgId, entry);
		return;
	}
	if (typeof value === 'string') {
		addLocalUiResourceRef(target, pkgId, value);
		addLocalUiResourceRefsFromText(target, pkgId, value);
	}
}

function addLocalFontRef(target: Set<string>, pkgId: string, value: string | string[] | null | undefined): void {
	if (Array.isArray(value)) {
		for (const entry of value) addLocalUiResourceRef(target, pkgId, entry);
		return;
	}
	addLocalUiResourceRef(target, pkgId, value ?? undefined);
}

function resolvePackageAssetsBasePath(
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

function resolveImagePath(resource: ImageResource, pkg: Package, basePath: string): string {
	const fileName = resolveImageFileName(resource);
	const resourcePath = resource.getPath() ?? '/';
	const packageBasePath = resolvePackageAssetsBasePath(basePath, resource);
	return `${packageBasePath}/${pkg.getName()}${resourcePath}${fileName}`;
}

function resolveImageFileName(resource: ImageResource): string {
	const extras = (resource.getExtras() as ImageResourceExtras | undefined) ?? {};
	return resource.getFileName() || extras._fileName || resource.getName();
}

function resolveSoundPath(resource: SoundResource, pkg: Package, basePath: string): string {
	const resourcePath = resource.getPath() ?? '/';
	const packageBasePath = resolvePackageAssetsBasePath(basePath, resource);
	return `${packageBasePath}/${pkg.getName()}${resourcePath}${resource.getFile()}`;
}

function resolveGenericResourcePath(
	resource: { getPath(): string; getFile(): string; getBranch?(): string },
	pkg: Package,
	basePath: string,
): string {
	const resourcePath = resource.getPath() ?? '/';
	const packageBasePath = resolvePackageAssetsBasePath(basePath, resource);
	return `${packageBasePath}/${pkg.getName()}${resourcePath}${resource.getFile()}`;
}

function extname(fileName: string): string {
	const normalized = fileName.replace(/\\/g, '/');
	const lastSlash = normalized.lastIndexOf('/');
	const lastDot = normalized.lastIndexOf('.');
	if (lastDot <= lastSlash) return '';
	return normalized.slice(lastDot);
}

function resolvePublishedMiscFileName(resource: MiscResource): string {
	const file = resource.getFile();
	if (file.toLowerCase().endsWith('.atlas')) return `${file}.txt`;
	return file;
}

function resolvePublishedSkeletonFileName(resource: SpineResource | DragonBonesResource): string {
	if (isSpineResource(resource) && resource.getFile().toLowerCase().endsWith('.skel')) {
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
	resource: { getId(): string; getExtras(): Record<string, unknown> | undefined; setExtras(value: Record<string, unknown>): unknown },
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

function getPublishedId(resource: { getId(): string; getExtras(): Record<string, unknown> | undefined }): string {
	const extras = (resource.getExtras() as PublishFileExtras | undefined) ?? {};
	return extras._publishedId ?? resource.getId();
}

function getBranchName(resource: BranchAwarePublishedResource | undefined): string {
	return resource?.getBranch?.() ?? '';
}

function buildBranchResourceKey(resource: {
	propertyType: string;
	getPath(): string;
	getName(): string;
}): string {
	return `${resource.propertyType}|${resource.getPath() ?? ''}|${resource.getName() ?? ''}`;
}

function collectPackagePublishContext(
	pkg: Package,
	options: {
		includeBranches: boolean;
		activeBranch: string;
	},
): PackagePublishContext {
	const pkgId = pkg.getId();
	const resources = pkg.listResources();
	const resourceMap = new Map(resources.map((resource) => [resource.getId(), resource]));
	const referencedIds = new Set<string>();
	const pixelHitTestImageIds = new Set<string>();
	const spriteItemIds = new Set<string>();

	for (const atlas of pkg.listAtlases()) {
		for (const sprite of atlas.listSprites()) {
			spriteItemIds.add(sprite.getItemId());
		}
	}

	for (const resource of resources) {
		if (!isComponentResource(resource)) continue;
		const component = resource as ComponentWithPublishRefs;
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

		for (const child of children) {
			const src = child.getSrc?.();
			if (src) referencedIds.add(src);
			addLocalFontRef(referencedIds, pkgId, child.getFont?.());
			addLocalUiResourceRefsFromText(referencedIds, pkgId, child.getText?.());
			for (const ref of [
				child.getUrl?.(),
				child.getDefaultItem?.(),
				child.getIcon?.(),
				child.getSelectedIcon?.(),
				child.getDropdown?.(),
				child.getSound?.(),
				child.getInstanceIcon?.(),
				child.getInstanceSelectedIcon?.(),
				child.getVtScrollBarRes?.(),
				child.getHzScrollBarRes?.(),
				child.getHeaderRes?.(),
				child.getFooterRes?.(),
			]) {
				addLocalUiResourceRef(referencedIds, pkgId, ref);
			}
			for (const item of child.getInstanceComboItems?.() ?? []) {
				addLocalUiResourceRef(referencedIds, pkgId, item.icon ?? undefined);
			}
			for (const item of child.getListItems?.() ?? []) {
				addLocalUiResourceRef(referencedIds, pkgId, item.icon ?? undefined);
				addLocalUiResourceRef(referencedIds, pkgId, item.url ?? undefined);
			}
			for (const gear of child.listGears?.() ?? []) {
				addLocalUiResourceRefsFromUnknown(referencedIds, pkgId, gear.getValues?.());
				addLocalUiResourceRefsFromUnknown(referencedIds, pkgId, gear.getDefaultValue?.());
			}
		}

		addLocalFontRef(referencedIds, pkgId, component.getFont?.());
		for (const ref of [
			component.getDropdown?.(),
			component.getHeaderRes?.(),
			component.getFooterRes?.(),
			component.getVtScrollBarRes?.(),
			component.getHzScrollBarRes?.(),
			component.getSound?.(),
		]) {
			addLocalUiResourceRef(referencedIds, pkgId, ref);
		}
		for (const transition of component.listTransitions?.() ?? []) {
			for (const item of transition.listItems?.() ?? []) {
				addLocalUiResourceRefsFromUnknown(referencedIds, pkgId, item.getStartValue?.());
				addLocalUiResourceRefsFromUnknown(referencedIds, pkgId, item.getEndValue?.());
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
			if (resource.getExported() || referencedIds.has(resourceId) || spriteItemIds.has(resourceId) || pixelHitTestImageIds.has(resourceId)) {
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

	let changed = true;
	while (changed) {
		changed = false;
		for (const resource of resources) {
			if (!isSkeletonResource(resource)) continue;
			if (!publishedResourceIds.has(resource.getId())) continue;
			for (const requiredId of resource.getRequireIds()) {
				if (!requiredId || publishedResourceIds.has(requiredId)) continue;
				publishedResourceIds.add(requiredId);
				changed = true;
			}
		}
	}

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
			pixelHitTestImageIds,
			effectiveResourceIds,
			includeBranches: false,
		};
	}

	return {
		referencedIds,
		publishedResourceIds,
		pixelHitTestImageIds,
		effectiveResourceIds: new Map([...publishedResourceIds].map((resourceId) => [resourceId, resourceId])),
		includeBranches: true,
	};
}

async function applyPixelHitTests(
	pkg: Package,
	imageIds: Set<string>,
	basePath: string | undefined,
	encoder: PublishEncoder | undefined,
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

async function annotatePackagePublishArtifacts(
	pkg: Package,
	basePath: string | undefined,
	encoder: PublishEncoder | undefined,
	options: {
		includeBranches: boolean;
		activeBranch: string;
	},
): Promise<void> {
	const { publishedResourceIds, pixelHitTestImageIds, effectiveResourceIds, includeBranches } = collectPackagePublishContext(pkg, options);
	for (const resource of pkg.listResources()) {
		setPublishedIdExtra(resource, effectiveResourceIds.get(resource.getId()) ?? null);
	}
	await applyPixelHitTests(pkg, pixelHitTestImageIds, basePath, encoder);
	const extras = (pkg.getExtras() as PackagePublishArtifactsExtras | undefined) ?? {};
	pkg.setExtras({
		...extras,
		publishedResourceIds: [...publishedResourceIds].sort((a, b) => a.localeCompare(b)),
		publishedIncludeBranches: includeBranches,
		publishedEffectiveResourceIds: Object.fromEntries(effectiveResourceIds),
	});
	for (const resource of pkg.listResources()) {
		if (isMiscResource(resource)) {
			setPublishedFileExtra(resource, resolvePublishedMiscFileName(resource));
			continue;
		}
		if (isSkeletonResource(resource)) {
			setPublishedFileExtra(resource, resolvePublishedSkeletonFileName(resource));
		}
	}
}

function getAnnotatedPublishedResourceIds(pkg: Package): Set<string> {
	const extras = (pkg.getExtras() as PackagePublishArtifactsExtras | undefined) ?? {};
	return new Set(extras.publishedResourceIds ?? []);
}

function getPublishedSkeletonDependencyImageIds(
	pkg: Package,
	publishedResourceIds: Set<string>,
): Set<string> {
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

async function exportPackageSounds(
	pkg: Package,
	outputDir: string,
	basePath: string | undefined,
	fs: PublishFileSystem,
	readFileRaw: PublishFileSystem['readFileRaw'] | undefined,
	logger: Document['getLogger'] extends () => infer T ? T : never,
): Promise<void> {
	const publishedResourceIds = getAnnotatedPublishedResourceIds(pkg);
	if (publishedResourceIds.size === 0) return;
	if (!basePath || !readFileRaw) {
		const hasPublishedSound = pkg.listResources().some((resource) => {
			return isSoundResource(resource) && publishedResourceIds.has(resource.getId());
		});
		if (hasPublishedSound) {
			logger.warn(`publish: Sound resources in package "${pkg.getName()}" were not exported because basePath/readFileRaw is unavailable.`);
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
			logger.warn(`publish: Could not export sound "${resource.getId()}" from package "${pkg.getName()}".`);
		}
	}
}

async function exportPackageExternalResources(
	pkg: Package,
	outputDir: string,
	basePath: string | undefined,
	fs: PublishFileSystem,
	readFileRaw: PublishFileSystem['readFileRaw'] | undefined,
	logger: Document['getLogger'] extends () => infer T ? T : never,
): Promise<void> {
	const publishedResourceIds = getAnnotatedPublishedResourceIds(pkg);
	const skeletonDependencyImageIds = getPublishedSkeletonDependencyImageIds(pkg, publishedResourceIds);
	if (publishedResourceIds.size === 0) return;
	if (!basePath || !readFileRaw) {
		const hasPublishedExternal = pkg.listResources().some((resource) => {
			return (
				(isMiscResource(resource) || isSkeletonResource(resource))
				&& publishedResourceIds.has(resource.getId())
			) || skeletonDependencyImageIds.has(resource.getId());
		});
		if (hasPublishedExternal) {
			logger.warn(`publish: External resources in package "${pkg.getName()}" were not exported because basePath/readFileRaw is unavailable.`);
		}
		return;
	}

	for (const resource of pkg.listResources()) {
		const resourceId = resource.getId();
		const isSkeletonExternal = publishedResourceIds.has(resourceId) && (isMiscResource(resource) || isSkeletonResource(resource));
		const isSkeletonImageDependency = skeletonDependencyImageIds.has(resourceId) && isImageResource(resource);
		if (!isSkeletonExternal && !isSkeletonImageDependency) continue;

		let sourcePath: string;
		let targetName: string;
		if (isSkeletonImageDependency) {
			sourcePath = resolveImagePath(resource, pkg, basePath);
			targetName = resolveImageFileName(resource);
		} else if (isMiscResource(resource) || isSkeletonResource(resource)) {
			sourcePath = resolveGenericResourcePath(resource, pkg, basePath);
			targetName = ((resource.getExtras() as PublishFileExtras | undefined) ?? {})._publishedFile ?? resource.getFile();
		} else {
			continue;
		}
		const targetPath = fs.join(outputDir, targetName);

		try {
			const data = await readFileRaw(sourcePath);
			await fs.writeFileRaw(targetPath, data);
		} catch {
			logger.warn(`publish: Could not export external resource "${resource.getId()}" from package "${pkg.getName()}".`);
		}
	}
}

/**
 * Publishes a FairyGUI project.
 *
 * Orchestrates:
 * 1. Atlas packing (MaxRects layout + optional sharp compositing)
 * 2. Per-package .fui binary serialization
 * 3. File writing to the output directory
 *
 * ```ts
 * import sharp from 'sharp';
 * const io = new NodeIO();
 * const doc = await io.readProject('./project.fairy');
 *
 * await doc.transform(publish({
 *   output: './release/',
 *   compressed: true,
 *   encoder: sharp,
 *   basePath: './assets/',
 *   fileExtension: 'bytes',
 *   fs: io.createFileSystem(),
 * }));
 * ```
 */
export function publish(options: PublishOptions): Transform {
	return createTransform('publish', async (doc: Document): Promise<void> => {
		const root = doc.getRoot();
		const logger = doc.getLogger();
		const settings = (root.getSettings?.() ?? {}) as RootProjectSettings;
		const publishSettings: CliPublishSettings = settings.publish ?? {};
		const resolved = resolvePublishOptions(doc, {
			compressed: options.compressed,
			fileExtension: options.fileExtension,
			packages: options.packages,
			atlas: options.atlas,
		});
		const ext = resolved.fileExtension;

		// Step 1: Determine which packages to publish
		let allPackages = root.listPackages();
		if (resolved.packages && resolved.packages.length > 0) {
			const names = new Set(resolved.packages);
			allPackages = allPackages.filter((p) => names.has(p.getName()));
		}

		if (allPackages.length === 0) {
			logger.warn('publish: No packages to publish.');
			return;
		}

		const branchProcessing = publishSettings.branchProcessing ?? 0;
		const includeBranches = branchProcessing === 0;
		const activeBranch = includeBranches ? '' : (options.branch ?? '');
		const atlasRuntimeOptions = resolvePublishAtlasRuntimeOptions(ext);

		const allDocPackages = root.listPackages();
		// Build a pkgId→name map for dependency resolution
		const pkgMap = new Map<string, Package>();
		for (const p of allDocPackages) {
			pkgMap.set(p.getId(), p);
		}

		for (const pkg of allPackages) {
			// Compute dependency list and selected publish artifacts before atlas packing,
			// so merged-branch publishes can pack the overridden resources with main IDs.
			_computeDependencies(pkg, pkgMap);
			await annotatePackagePublishArtifacts(
				pkg,
				options.basePath,
				options.encoder as PublishEncoder | undefined,
				{
					includeBranches,
					activeBranch,
				},
			);
		}

		// Step 2: Atlas packing
		const atlasOpts: AtlasOptions = {
			...resolved.atlas,
			...(options.atlas ?? {}),
			separatedAtlasForBranch: includeBranches && publishSettings.seperatedAtlasForBranch === true,
			encoder: options.encoder,
			basePath: options.basePath,
			outputPath: options.fs ? options.output : undefined,
			mkdir: options.fs ? options.fs.mkdir : undefined,
			readFileRaw: options.atlas?.readFileRaw ?? options.fs?.readFileRaw,
			...atlasRuntimeOptions,
		};
		await atlas(atlasOpts)(doc);

		// Step 3: Write .fui binary per package
		if (!options.fs) {
			logger.info(`publish: No fs provided — layout computed for ${allPackages.length} package(s), skipping file output.`);
			return;
		}

		await options.fs.mkdir(options.output);

		const writerFs = toBinaryWriterFileSystem(options.fs);

		for (const pkg of allPackages) {
			const pkgIndex = allDocPackages.indexOf(pkg);
			const publishName = pkg.getPublishName() || pkg.getName();
			const fileName = resolvePublishFileName(publishName, ext);
			const filePath = options.fs.join(options.output, fileName);

			const bwOptions: BinaryWriterOptions = {
				compressed: resolved.compressed,
				packageIndex: pkgIndex,
			};

			const bw = new BinaryWriter(writerFs);
			await bw.write(doc, filePath, bwOptions);
			await exportPackageSounds(
				pkg,
				options.output,
				options.basePath,
				options.fs,
				options.atlas?.readFileRaw ?? options.fs.readFileRaw,
				logger,
			);
			await exportPackageExternalResources(
				pkg,
				options.output,
				options.basePath,
				options.fs,
				options.atlas?.readFileRaw ?? options.fs.readFileRaw,
				logger,
			);

			logger.info(`publish: Written ${fileName}`);
		}

		logger.info(`publish: Published ${allPackages.length} package(s) to ${options.output}`);
	});
}

/**
 * Scan component children for font="ui://..." references to build dependency list.
 * The editor only adds dependencies for packages referenced via bitmap font URLs.
 * @internal
 */
function _computeDependencies(pkg: Package, pkgMap: Map<string, Package>): void {
	const referencedPkgIds = new Set<string>();

	function scanFontUrl(font: string | string[] | null | undefined): void {
		if (!font) return;
		const fontStr = Array.isArray(font) ? font[0] : String(font);
		if (typeof fontStr !== 'string' || !fontStr.startsWith('ui://')) return;
		const rest = fontStr.slice(5);
		if (rest.length >= 8) {
			const depPkgId = rest.slice(0, 8);
			if (depPkgId !== pkg.getId()) referencedPkgIds.add(depPkgId);
		}
	}

	for (const res of pkg.listResources()) {
		if (res.propertyType !== 'Component') continue;
		for (const child of res.listChildren?.() ?? []) {
			// Only font="ui://..." references generate dependencies
			scanFontUrl((child as HasOptionalFont).getFont?.());
		}
	}

	for (const dep of pkg.listDependencies()) {
		pkg.removeDependency(dep);
	}

	if (referencedPkgIds.size > 0) {
		const sortedIds = [...referencedPkgIds].sort((a, b) => a.localeCompare(b));
		for (const refId of sortedIds) {
			const depPkg = pkgMap.get(refId);
			if (depPkg) {
				pkg.addDependency(depPkg);
			}
		}
	}
}
