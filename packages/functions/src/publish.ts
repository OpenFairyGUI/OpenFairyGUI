import {
	type BinaryWriterOptions,
	BinaryWriter,
	type Component,
	type Document,
	type FileSystem,
	type FontResource,
	type ImageResource,
	type MovieClipResource,
	type Package,
	type SoundResource,
	type Transform,
} from '@openfairygui/core';
import { createTransform } from './utils.js';
import { atlas, type AtlasOptions } from './atlas.js';
import type {
	CliPublishSettings,
	HasOptionalFont,
	PackageDependenciesExtras,
	PackagePublishArtifactsExtras,
	PublishDependency,
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

interface FontResourceExtras extends Record<string, unknown> {
	_rawBinaryGlyphs?: unknown;
	_fntData?: unknown;
}

interface PackagePublishContext {
	referencedIds: Set<string>;
	publishedResourceIds: Set<string>;
	pixelHitTestImageIds: Set<string>;
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

const UNITY_PROJECT_TYPE = 0;

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
		?? (projectType === UNITY_PROJECT_TYPE ? 'bytes' : publishSettings.fileExtension || 'fui');

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

function isFontResource(resource: ReturnType<Package['listResources']>[number]): resource is FontResource {
	return resource.propertyType === 'FontResource';
}

function isSoundResource(resource: ReturnType<Package['listResources']>[number]): resource is SoundResource {
	return resource.propertyType === 'SoundResource';
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

function resolveImagePath(resource: ImageResource, pkg: Package, basePath: string): string {
	const extras = (resource.getExtras() as ImageResourceExtras | undefined) ?? {};
	const fileName = extras._fileName ?? resource.getName();
	const resourcePath = resource.getPath() ?? '/';
	return `${basePath}/${pkg.getName()}${resourcePath}${fileName}`;
}

function resolveSoundPath(resource: SoundResource, pkg: Package, basePath: string): string {
	const resourcePath = resource.getPath() ?? '/';
	return `${basePath}/${pkg.getName()}${resourcePath}${resource.getFile()}`;
}

function resolvePublishedSoundFileName(pkg: Package, resource: SoundResource): string {
	const publishName = pkg.getPublishName() || pkg.getName();
	const ext = extname(resource.getFile() || '');
	return `${publishName}_${resource.getId()}${ext}`;
}

function extname(fileName: string): string {
	const normalized = fileName.replace(/\\/g, '/');
	const lastSlash = normalized.lastIndexOf('/');
	const lastDot = normalized.lastIndexOf('.');
	if (lastDot <= lastSlash) return '';
	return normalized.slice(lastDot);
}

function collectPackagePublishContext(pkg: Package): {
	referencedIds: Set<string>;
	publishedResourceIds: Set<string>;
	pixelHitTestImageIds: Set<string>;
} {
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
			if (resource.getExported() || spriteItemIds.has(resourceId) || pixelHitTestImageIds.has(resourceId)) {
				publishedResourceIds.add(resourceId);
			}
			continue;
		}
		if (isMovieClipResource(resource) || isSoundResource(resource)) {
			if (resource.getExported() || referencedIds.has(resourceId)) publishedResourceIds.add(resourceId);
			continue;
		}
		if (isFontResource(resource)) {
			const extras = (resource.getExtras() as FontResourceExtras | undefined) ?? {};
			if ((resource.getExported() || referencedIds.has(resourceId)) && (extras._rawBinaryGlyphs || extras._fntData)) {
				publishedResourceIds.add(resourceId);
			}
			continue;
		}
		const genericResource = resource as ReturnType<Package['listResources']>[number];
		if (genericResource.getExported() || referencedIds.has(resourceId)) {
			publishedResourceIds.add(resourceId);
		}
	}

	return {
		referencedIds,
		publishedResourceIds,
		pixelHitTestImageIds,
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
): Promise<void> {
	const { publishedResourceIds, pixelHitTestImageIds } = collectPackagePublishContext(pkg);
	await applyPixelHitTests(pkg, pixelHitTestImageIds, basePath, encoder);
	const extras = (pkg.getExtras() as PackagePublishArtifactsExtras | undefined) ?? {};
	pkg.setExtras({
		...extras,
		publishedResourceIds: [...publishedResourceIds].sort((a, b) => a.localeCompare(b)),
	});
}

function getAnnotatedPublishedResourceIds(pkg: Package): Set<string> {
	const extras = (pkg.getExtras() as PackagePublishArtifactsExtras | undefined) ?? {};
	return new Set(extras.publishedResourceIds ?? []);
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
		const targetName = resolvePublishedSoundFileName(pkg, resource);
		const targetPath = fs.join(outputDir, targetName);

		try {
			const data = await readFileRaw(sourcePath);
			await fs.writeFileRaw(targetPath, data);
		} catch {
			logger.warn(`publish: Could not export sound "${resource.getId()}" from package "${pkg.getName()}".`);
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
		const resolved = resolvePublishOptions(doc, {
			compressed: options.compressed,
			fileExtension: options.fileExtension,
			packages: options.packages,
			atlas: options.atlas,
		});
		const ext = resolved.fileExtension;

		// Step 1: Atlas packing
		const atlasOpts: AtlasOptions = {
			...resolved.atlas,
			...(options.atlas ?? {}),
			encoder: options.encoder,
			basePath: options.basePath,
			outputPath: options.fs ? options.output : undefined,
			mkdir: options.fs ? options.fs.mkdir : undefined,
			readFileRaw: options.atlas?.readFileRaw ?? options.fs?.readFileRaw,
			preserveInputOrderOnTie: ext === 'fui',
			directSingleImageOutput: ext === 'bytes',
		};
		await atlas(atlasOpts)(doc);

		// Step 2: Determine which packages to publish
		let allPackages = root.listPackages();
		if (resolved.packages && resolved.packages.length > 0) {
			const names = new Set(resolved.packages);
			allPackages = allPackages.filter((p) => names.has(p.getName()));
		}

		if (allPackages.length === 0) {
			logger.warn('publish: No packages to publish.');
			return;
		}

		// Step 3: Write .fui binary per package
		if (!options.fs) {
			logger.info(`publish: No fs provided — layout computed for ${allPackages.length} package(s), skipping file output.`);
			return;
		}

		await options.fs.mkdir(options.output);

		const allDocPackages = root.listPackages();
		// Build a pkgId→name map for dependency resolution
		const pkgMap = new Map<string, string>();
		for (const p of allDocPackages) {
			pkgMap.set(p.getId(), p.getName());
		}

		const writerFs = toBinaryWriterFileSystem(options.fs);

		for (const pkg of allPackages) {
			// Compute dependency list: scan font="ui://..." references in text children
			_computeDependencies(pkg, pkgMap);
			await annotatePackagePublishArtifacts(
				pkg,
				options.basePath,
				options.encoder as PublishEncoder | undefined,
			);

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
function _computeDependencies(pkg: Package, pkgMap: Map<string, string>): void {
	const existingExtras = pkg.getExtras() as PackageDependenciesExtras;
	if (existingExtras.dependencies && existingExtras.dependencies.length > 0) return;

	const referencedPkgIds = new Set<string>();

	function scanFontUrl(font: string | string[] | null | undefined): void {
		if (!font) return;
		const fontStr = Array.isArray(font) ? font[0] : String(font);
		if (typeof fontStr !== 'string' || !fontStr.startsWith('ui://')) return;
		const rest = fontStr.slice(5);
		if (rest.length >= 8) {
			referencedPkgIds.add(rest.slice(0, 8));
		}
	}

	for (const res of pkg.listResources()) {
		if (res.propertyType !== 'Component') continue;
		for (const child of res.listChildren?.() ?? []) {
			// Only font="ui://..." references generate dependencies
			scanFontUrl((child as HasOptionalFont).getFont?.());
		}
	}

	if (referencedPkgIds.size > 0) {
		const deps: PublishDependency[] = [];
		const sortedIds = [...referencedPkgIds].sort((a, b) => a.localeCompare(b));
		for (const refId of sortedIds) {
			deps.push({ id: refId, name: pkgMap.get(refId) ?? refId });
		}
		pkg.setExtras({ ...pkg.getExtras(), dependencies: deps });
	}
}
