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
import { publishCodeGeneration } from './codegen.js';
import { formatPluginError, loadPlugins, type LoadedPlugin } from './plugins/loader.js';
import type {
	CliPublishSettings,
	HasOptionalFont,
	PackagePublishArtifactsExtras,
	PublishFileSystem,
	RootProjectSettings,
} from './shared-types.js';

export interface PublishOptions {
	/**
	 * Output directory override for published files (.fui + atlas PNGs).
	 * When omitted, publish uses package-level or project-level publish paths.
	 */
	output?: string;

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

interface ResolvedProjectPublishConfig extends ResolvedPublishOptions {
	projectType: number;
	includeBranches: boolean;
	activeBranch: string;
	includeHighResolution: number;
	separatedAtlasForBranch: boolean;
	globalOutputPath: string;
	globalBranchOutputPath: string;
}

interface ResolvedPackagePublishPlan {
	pkg: Package;
	outputDir?: string;
	publishName: string;
	fileName: string;
	compressed: boolean;
	fileExtension: string;
	includeBranches: boolean;
	activeBranch: string;
	includeHighResolution: number;
	separatedAtlasForBranch: boolean;
	atlas: ResolvedPublishAtlasOptions;
}

async function runPublishPluginHook(
	plugins: LoadedPlugin[],
	hook: 'onPublishStart' | 'onPublishEnd',
	doc: Document,
	options: PublishOptions,
): Promise<void> {
	const logger = doc.getLogger();
	for (const plugin of plugins) {
		const fn = plugin.plugin[hook];
		if (typeof fn !== 'function') continue;
		try {
			await fn(doc, options);
		} catch (error) {
			logger.warn(`publish: Plugin "${plugin.name}" ${hook} failed: ${formatPluginError(error)}`);
		}
	}
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
	exportedResourceIds: Set<string>;
	pixelHitTestImageIds: Set<string>;
	highResolutionItemIds: Map<string, Array<string | null>>;
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
	getPackageId?(): string;
	getSrc?(): string;
	getUrl?(): string;
	getInstanceSound?(): string;
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
const COCOS_CREATOR_PROJECT_TYPE = ProjectType.CocosCreator;

function resolveDefaultPublishFileExtension(projectType: number, publishSettings: CliPublishSettings): string {
	if (projectType === UNITY_PROJECT_TYPE) {
		return 'bytes';
	}
	if (projectType === COCOS_CREATOR_PROJECT_TYPE) {
		return publishSettings.fileExtension || 'bin';
	}
	// publish() is currently a binary forward-publish path. For non-Unity projects,
	// keep the emitted contract driven by the configured extension, falling back to
	// `fui`, which intentionally covers the shared generic binary contract outside
	// Unity and the Creator-specific default-to-bin rule.
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

function trimTrailingSlashes(value: string): string {
	return value.replace(/[/\\]+$/, '');
}

function isAbsolutePathLike(value: string): boolean {
	return /^(?:[a-zA-Z]:[/\\]|[/\\]{1,2})/u.test(value);
}

function joinPathSegments(left: string, right: string): string {
	const normalizedLeft = trimTrailingSlashes(left);
	const normalizedRight = right.replace(/^[/\\]+/, '');
	if (!normalizedLeft) return normalizedRight;
	if (!normalizedRight) return normalizedLeft;
	const separator = normalizedLeft.includes('\\') ? '\\' : '/';
	return `${normalizedLeft}${separator}${normalizedRight}`;
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

function isHighResolutionResource(resource: ReturnType<Package['listResources']>[number]): resource is ImageResource | MovieClipResource {
	return isImageResource(resource) || isMovieClipResource(resource);
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

function resolvePublishedMiscFileName(resource: MiscResource, projectType: number): string {
	const file = resource.getFile();
	if (projectType !== UNITY_PROJECT_TYPE) return file;
	if (file.toLowerCase().endsWith('.atlas')) return `${file}.txt`;
	return file;
}

function resolvePublishedSkeletonFileName(resource: SpineResource | DragonBonesResource, projectType: number): string {
	if (projectType === UNITY_PROJECT_TYPE && isSpineResource(resource) && resource.getFile().toLowerCase().endsWith('.skel')) {
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

const HIGH_RESOLUTION_LEVELS = [
	{ scale: 2, bit: 1, slot: 0 },
	{ scale: 3, bit: 2, slot: 1 },
	{ scale: 4, bit: 4, slot: 2 },
] as const;

function buildHighResolutionResourceKey(resource: {
	propertyType: string;
	getPath(): string;
	getName(): string;
	getBranch?(): string;
}, name = resource.getName()): string {
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
				buildHighResolutionResourceKey(resource, appendHighResolutionScaleToName(resource.getName(), level.scale)),
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
	const pkgId = pkg.getId();
	const resources = pkg.listResources();
	const resourceMap = new Map(resources.map((resource) => [resource.getId(), resource]));
	const referencedIds = new Set<string>();
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
				child.getInstanceSound?.(),
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

function getAnnotatedPublishedResourceIds(pkg: Package): Set<string> {
	const extras = (pkg.getExtras() as PackagePublishArtifactsExtras | undefined) ?? {};
	return new Set(extras.publishedResourceIds ?? []);
}

function getAnnotatedExportedResourceIds(pkg: Package): Set<string> {
	const extras = (pkg.getExtras() as PackagePublishArtifactsExtras | undefined) ?? {};
	return new Set(extras.exportedResourceIds ?? []);
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
	const exportedResourceIds = getAnnotatedExportedResourceIds(pkg);
	const skeletonDependencyImageIds = getPublishedSkeletonDependencyImageIds(pkg, exportedResourceIds);
	if (exportedResourceIds.size === 0) return;
	if (!basePath || !readFileRaw) {
		const hasPublishedExternal = pkg.listResources().some((resource) => {
			return (
				(isMiscResource(resource) || isSkeletonResource(resource))
				&& exportedResourceIds.has(resource.getId())
			) || skeletonDependencyImageIds.has(resource.getId());
		});
		if (hasPublishedExternal) {
			logger.warn(`publish: External resources in package "${pkg.getName()}" were not exported because basePath/readFileRaw is unavailable.`);
		}
		return;
	}

	for (const resource of pkg.listResources()) {
		const resourceId = resource.getId();
		const isSkeletonExternal = exportedResourceIds.has(resourceId) && (isMiscResource(resource) || isSkeletonResource(resource));
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
		const resolveProjectBasePath = (basePath?: string): string | undefined => {
			if (!basePath) return undefined;
			const normalized = trimTrailingSlashes(basePath);
			if (!normalized) return undefined;
			if (/[\\/]assets(?:_[^/\\]+)?$/iu.test(normalized)) {
				return normalized.replace(/[\\/]assets(?:_[^/\\]+)?$/iu, '');
			}
			const resolvedDir = dirname(normalized);
			return resolvedDir || undefined;
		};

		const resolveConfiguredOutputPath = (value?: string, projectBasePath?: string): string | undefined => {
			const trimmed = value?.trim();
			if (!trimmed) return undefined;
			if (isAbsolutePathLike(trimmed) || !projectBasePath) {
				return trimTrailingSlashes(trimmed);
			}
			return trimTrailingSlashes(options.fs ? options.fs.join(projectBasePath, trimmed) : joinPathSegments(projectBasePath, trimmed));
		};

		const resolveProjectPublishConfig = (): ResolvedProjectPublishConfig => {
			const settings = (doc.getRoot().getSettings?.() ?? {}) as RootProjectSettings;
			const publishSettings: CliPublishSettings = settings.publish ?? {};
			const resolved = resolvePublishOptions(doc, {
				compressed: options.compressed,
				fileExtension: options.fileExtension,
				packages: options.packages,
				atlas: options.atlas,
			});
			const branchProcessing = publishSettings.branchProcessing ?? 0;
			const includeBranches = branchProcessing === 0;

			return {
				...resolved,
				projectType: doc.getRoot().getProjectType(),
				includeBranches,
				activeBranch: includeBranches ? '' : (options.branch ?? ''),
				includeHighResolution: publishSettings.includeHighResolution ?? 0,
				separatedAtlasForBranch: includeBranches && publishSettings.seperatedAtlasForBranch === true,
				globalOutputPath: publishSettings.path?.trim() ?? '',
				globalBranchOutputPath: publishSettings.branchPath?.trim() ?? '',
			};
		};

		const resolvePackagePublishPlan = (pkg: Package, config: ResolvedProjectPublishConfig, projectBasePath?: string): ResolvedPackagePublishPlan => {
			let outputDir: string | undefined;

			if (options.output) {
				outputDir = trimTrailingSlashes(options.output);
			} else {
				const candidates: Array<string | undefined> = [];
				if (!config.includeBranches && config.activeBranch) {
					candidates.push(pkg.getPublishBranchPath(), config.globalBranchOutputPath);
				}
				candidates.push(pkg.getPublishPath(), config.globalOutputPath);

				for (const candidate of candidates) {
					const resolved = resolveConfiguredOutputPath(candidate, projectBasePath);
					if (!resolved) continue;
					outputDir = resolved;
					break;
				}
			}
			const publishName = pkg.getPublishName() || pkg.getName();

			return {
				pkg,
				outputDir,
				publishName,
				fileName: resolvePublishFileName(publishName, config.fileExtension),
				compressed: config.compressed,
				fileExtension: config.fileExtension,
				includeBranches: config.includeBranches,
				activeBranch: config.activeBranch,
				includeHighResolution: config.includeHighResolution,
				separatedAtlasForBranch: config.separatedAtlasForBranch,
				atlas: config.atlas,
			};
		};

		const createNoopPublishFs = (): PublishFileSystem => ({
			async writeFileRaw(): Promise<void> {
				// No-op for layout-only publish flows.
			},
			async mkdir(): Promise<void> {
				// No-op for layout-only publish flows.
			},
			join(...paths: string[]): string {
				return paths.join('/');
			},
		});

		const publishPackage = async ( plan: ResolvedPackagePublishPlan, writerFs: FileSystem, packageIndex: number) => {
			const atlasRuntimeOptions = resolvePublishAtlasRuntimeOptions(plan.fileExtension);
			await atlas({
				...plan.atlas,
				...(options.atlas ?? {}),
				separatedAtlasForBranch: plan.separatedAtlasForBranch,
				encoder: options.encoder,
				basePath: options.basePath,
				outputPath: options.fs ? plan.outputDir : undefined,
				mkdir: options.fs ? options.fs.mkdir : undefined,
				readFileRaw: options.atlas?.readFileRaw ?? options.fs?.readFileRaw,
				packages: [plan.pkg.getName()],
				...atlasRuntimeOptions,
			})(doc);

			if (!options.fs) return;
			if (!plan.outputDir) {
				throw new Error('publish: no output directory resolved. Provide --output, or configure global publish.path / package publishPath.');
			}

			await options.fs.mkdir(plan.outputDir);

			const filePath = options.fs.join(plan.outputDir, plan.fileName);
			const bwOptions: BinaryWriterOptions = {
				compressed: plan.compressed,
				packageIndex,
			};

			const bw = new BinaryWriter(writerFs);
			await bw.write(doc, filePath, bwOptions);
			await exportPackageSounds(
				plan.pkg,
				plan.outputDir,
				options.basePath,
				options.fs,
				options.atlas?.readFileRaw ?? options.fs.readFileRaw,
				logger,
			);
			await exportPackageExternalResources(
				plan.pkg,
				plan.outputDir,
				options.basePath,
				options.fs,
				options.atlas?.readFileRaw ?? options.fs.readFileRaw,
				logger,
			);

			logger.info(`publish: Written ${plan.fileName}`);
		};

		const root = doc.getRoot();
		const logger = doc.getLogger();
		const projectBasePath = resolveProjectBasePath(options.basePath);
		const pluginsDir = projectBasePath
			? (options.fs ? options.fs.join(projectBasePath, 'plugins') : joinPathSegments(projectBasePath, 'plugins'))
			: undefined;
		const plugins = pluginsDir ? await loadPlugins(doc, pluginsDir) : [];
		await runPublishPluginHook(plugins, 'onPublishStart', doc, options);

		const resolved = resolveProjectPublishConfig();

		// Step 1: Determine which packages to publish
		let allPackages = root.listPackages();
		if (resolved.packages && resolved.packages.length > 0) {
			const names = new Set(resolved.packages);
			allPackages = allPackages.filter((p) => names.has(p.getName()));
		}

		if (allPackages.length === 0) {
			logger.warn('publish: No packages to publish.');
			await runPublishPluginHook(plugins, 'onPublishEnd', doc, options);
			return;
		}

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
					projectType: resolved.projectType,
					includeBranches: resolved.includeBranches,
					activeBranch: resolved.activeBranch,
					includeHighResolution: resolved.includeHighResolution,
				},
			);
		}

		const plans = allPackages.map((pkg) => resolvePackagePublishPlan(pkg, resolved, projectBasePath));

		if (!options.fs) {
			logger.info(`publish: No fs provided — layout computed for ${allPackages.length} package(s), skipping file output.`);
			const noopWriterFs = toBinaryWriterFileSystem(createNoopPublishFs());
			for (const plan of plans) {
				await publishPackage(plan, noopWriterFs, allDocPackages.indexOf(plan.pkg));
			}
			await runPublishPluginHook(plugins, 'onPublishEnd', doc, options);
			return;
		}

		const unresolvedPlan = plans.find((plan) => !plan.outputDir);
		if (unresolvedPlan) {
			throw new Error(
				`publish: no output directory resolved for package "${unresolvedPlan.pkg.getName()}". ` +
					'Provide --output, or configure global publish.path / package publishPath.',
			);
		}

		const writerFs = toBinaryWriterFileSystem(options.fs);

		for (const plan of plans) {
			const pkgIndex = allDocPackages.indexOf(plan.pkg);
			await publishPackage(plan, writerFs, pkgIndex);
		}

		await publishCodeGeneration(doc, {
			basePath: options.basePath,
			fs: options.fs,
			packages: allPackages,
			plugins,
		});

		const publishedTargets = [...new Set(plans.map((plan) => plan.outputDir).filter((value): value is string => Boolean(value)))];
		logger.info(
			publishedTargets.length > 0
				? `publish: Published ${allPackages.length} package(s) to ${publishedTargets.join(', ')}`
				: `publish: Published ${allPackages.length} package(s)`,
		);
		await runPublishPluginHook(plugins, 'onPublishEnd', doc, options);
	});
}

/**
 * Scan component children for font="ui://..." references to build dependency list.
 * The editor only adds dependencies for packages referenced via bitmap font URLs.
 * @internal
 */
function _computeDependencies(pkg: Package, pkgMap: Map<string, Package>): void {
	const referencedPkgIds = new Set<string>();
	const pkgId = pkg.getId();
	const addDependencyPackageId = (dependencyPkgId: string | null | undefined): void => {
		const normalized = dependencyPkgId?.trim() ?? '';
		if (!normalized || normalized === pkgId) return;
		referencedPkgIds.add(normalized);
	};
	const extractPackageIdFromUiUrl = (value: string): string | null => {
		if (!value.startsWith('ui://')) return null;
		const rest = value.slice(5);
		if (!rest) return null;
		const slashIndex = rest.indexOf('/');
		if (slashIndex >= 0) {
			return rest.slice(0, slashIndex) || null;
		}
		if (rest.length >= 8) {
			return rest.slice(0, 8);
		}
		return null;
	};
	const addDependencyPackageIdFromUiValue = (value: string | null | undefined): void => {
		if (!value || typeof value !== 'string') return;
		addDependencyPackageId(extractPackageIdFromUiUrl(value));
	};
	const addDependencyPackageIdsFromText = (value: string | null | undefined): void => {
		if (!value || typeof value !== 'string') return;
		const matches = value.matchAll(/ui:\/\/([0-9a-z]{8})/giu);
		for (const match of matches) {
			addDependencyPackageId(match[1] ?? '');
		}
	};
	const addDependencyPackageIdsFromUnknown = (value: unknown): void => {
		if (Array.isArray(value)) {
			for (const entry of value) addDependencyPackageIdsFromUnknown(entry);
			return;
		}
		if (typeof value === 'string') {
			addDependencyPackageIdFromUiValue(value);
			addDependencyPackageIdsFromText(value);
		}
	};
	const addDependencyFontRef = (value: string | string[] | null | undefined): void => {
		if (Array.isArray(value)) {
			for (const entry of value) addDependencyPackageIdFromUiValue(entry);
			return;
		}
		addDependencyPackageIdFromUiValue(value ?? undefined);
	};

	for (const res of pkg.listResources()) {
		if (res.propertyType !== 'Component') continue;
		const component = res as ComponentWithPublishRefs;
		for (const child of component.listChildren?.() ?? []) {
			addDependencyPackageId(child.getPackageId?.());
			addDependencyFontRef(child.getFont?.());
			addDependencyPackageIdsFromText(child.getText?.());
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
				addDependencyPackageIdFromUiValue(ref);
			}
			for (const item of child.getInstanceComboItems?.() ?? []) {
				addDependencyPackageIdFromUiValue(item.icon ?? undefined);
			}
			for (const item of child.getListItems?.() ?? []) {
				addDependencyPackageIdFromUiValue(item.icon ?? undefined);
				addDependencyPackageIdFromUiValue(item.url ?? undefined);
			}
			for (const gear of child.listGears?.() ?? []) {
				addDependencyPackageIdsFromUnknown(gear.getValues?.());
				addDependencyPackageIdsFromUnknown(gear.getDefaultValue?.());
			}
		}
		addDependencyFontRef(component.getFont?.());
		for (const ref of [
			component.getDropdown?.(),
			component.getHeaderRes?.(),
			component.getFooterRes?.(),
			component.getVtScrollBarRes?.(),
			component.getHzScrollBarRes?.(),
			component.getSound?.(),
		]) {
			addDependencyPackageIdFromUiValue(ref);
		}
		for (const transition of component.listTransitions?.() ?? []) {
			for (const item of transition.listItems?.() ?? []) {
				addDependencyPackageIdsFromUnknown(item.getStartValue?.());
				addDependencyPackageIdsFromUnknown(item.getEndValue?.());
			}
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
