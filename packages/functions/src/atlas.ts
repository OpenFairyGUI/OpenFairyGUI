import {
	GearType,
	TransitionActionType,
	type Component,
	type Document,
	type DragonBonesResource,
	type FontResource,
	type ILogger,
	type ImageResource,
	type MovieClipResource,
	type Package,
	type SpineResource,
	type Transform,
} from '@openfairygui/core';
import { COMPAT_NODE_RECT_FLAGS, type CompatNodeRect } from './max-rects-compat.js';
import { MaxRectsPackerCompat } from './max-rects-packer-compat.js';
import type { AtlasRasterBackend, AtlasRasterInput, AtlasRasterResolvedBuffer } from './publish/contracts.js';
import type { ExtrasMap, HasOptionalSrc, HasOptionalUrl } from './shared-types.js';
import { createTransform, parseTextureSetMode, type TextureSetMode } from './utils.js';

export interface AtlasOptions {
	/**
	 * Limit atlas generation to specific package names.
	 * When omitted, all packages are processed.
	 */
	packages?: string[];

	/**
	 * Raster backend, injected by the host adapter.
	 * Required for actual image compositing and trimImage.
	 *
	 * ```ts
	 * import sharp from 'sharp';
	 * await doc.transform(atlas({ encoder: sharp }));
	 * ```
	 */
	encoder?: AtlasRasterBackend;

	/** Maximum atlas texture size (width and height). Default: 2048. */
	maxSize?: number;

	/** Whether to use the fast editor-compatible packing heuristics. Default: true. */
	fast?: boolean;

	/** Allow rotating sprites 90° for better packing. Default: true. */
	allowRotation?: boolean;

	/** Pixel padding between sprites. Default: 1. */
	padding?: number;

	/** Constrain atlas dimensions to powers of two. Default: false. */
	powerOfTwo?: boolean;

	/** Force square atlas (width === height). Default: false. */
	square?: boolean;

	/** Allow spilling into multiple atlas pages. Default: true. */
	multiPage?: boolean;

	/**
	 * Trim transparent pixels from image edges before packing.
	 * Requires a raster backend. Stores offset/originalSize in Sprite nodes.
	 * Default: false.
	 */
	trimImage?: boolean;

	/**
	 * Base path for reading source images. If not set, images must have
	 * their pixel data stored in extras._imageData as Uint8Array.
	 */
	basePath?: string;

	/**
	 * Output directory for generated atlas PNGs.
	 * Required when encoder is provided.
	 */
	outputPath?: string;

	/**
	 * Optional mkdir function to ensure output directory exists.
	 * If not provided, the outputPath directory must already exist.
	 */
	mkdir?: (path: string) => Promise<void>;

	/**
	 * Optional raw file reader for reading .jta MovieClip files.
	 * Required for MovieClip frame atlas packing.
	 */
	readFileRaw?: (path: string) => Promise<Uint8Array>;

	/**
	 * Keep original input order when MaxRects tie-break scores are equal.
	 * This is an internal publish detail used to mirror editor/CLI behavior.
	 */
	preserveInputOrderOnTie?: boolean;

	/**
	 * Internal publish detail used by Unity binary output:
	 * allow single untrimmed PNG image packages to bypass the packer and
	 * write atlas0 directly, matching the reference CLI behavior.
	 */
	directSingleImageOutput?: boolean;

	/**
	 * Internal publish detail used by the direct-image-output path.
	 * When extractAlpha is enabled, the direct output shortcut must be disabled.
	 */
	extractAlpha?: boolean;

	/**
	 * When branchProcessing keeps branch resources, publish branch images into
	 * separate atlas pages/files per branch instead of mixing them with main.
	 */
	separatedAtlasForBranch?: boolean;
}

const ATLAS_DEFAULTS: Required<
	Omit<AtlasOptions, 'packages' | 'encoder' | 'basePath' | 'outputPath' | 'mkdir' | 'readFileRaw'>
> = {
	maxSize: 2048,
	fast: true,
	allowRotation: true,
	padding: 1,
	powerOfTwo: false,
	square: false,
	multiPage: true,
	trimImage: false,
	preserveInputOrderOnTie: false,
	directSingleImageOutput: false,
	extractAlpha: false,
	separatedAtlasForBranch: false,
};

/** Trim info for a single image. */
interface TrimInfo {
	/** Trimmed pixel data (PNG). */
	buffer: Uint8Array;
	/** Trimmed width. */
	width: number;
	/** Trimmed height. */
	height: number;
	/** Offset from original left edge. */
	offsetX: number;
	/** Offset from original top edge. */
	offsetY: number;
	/** Original width before trim. */
	originalWidth: number;
	/** Original height before trim. */
	originalHeight: number;
}

type PackageResource = ReturnType<Package['listResources']>[number];
type PackableResource = ImageResource | MovieClipResource | FontResource;
type PackInputResource = ImageResource | MovieClipResource;

function getPublishedItemId(resource: { getId(): string; getExtras(): ExtrasMap | undefined }): string {
	return ((resource.getExtras() as ImageResourceExtras | undefined) ?? {})._publishedId ?? resource.getId();
}

interface AtlasReferenceItem {
	icon?: string | null;
	url?: string | null;
}

interface GearWithAtlasRefs {
	getGearType?(): number;
	getValues?(): string;
	getDefaultValue?(): unknown;
}

interface TransitionItemWithAtlasRefs {
	getActionType?(): number;
	getStartValue?(): unknown;
	getEndValue?(): unknown;
}

interface TransitionWithAtlasRefs {
	listItems?(): TransitionItemWithAtlasRefs[];
}

interface ChildWithReferenceUrls extends HasOptionalSrc, HasOptionalUrl {
	getDefaultItem?(): string;
	getIcon?(): string;
	getSelectedIcon?(): string;
	getDropdown?(): string;
	getSound?(): string;
	getText?(): string;
	getFont?(): string;
	getInstanceIcon?(): string;
	getInstanceSelectedIcon?(): string;
	getVtScrollBarRes?(): string;
	getHzScrollBarRes?(): string;
	getHeaderRes?(): string;
	getFooterRes?(): string;
	getInstanceComboItems?(): Array<{ icon: string | null }>;
	getListItems?(): AtlasReferenceItem[];
	listGears?(): GearWithAtlasRefs[];
}

interface ImageResourceExtras extends ExtrasMap {
	_fileName?: string;
	_publishedId?: string;
}

interface FontSpriteAlias {
	fontId: string;
	textureId: string;
}

interface FontResourceExtras extends ExtrasMap {
	_fontSpriteAlias?: FontSpriteAlias;
}

interface PackageAtlasExtras extends ExtrasMap {
	publishedResourceIds?: string[];
}

interface BranchAtlasGroup {
	branchName: string;
	branchOrdinal: number;
	inputs: InputItem[];
}

function getSelectedSkeletonDependencyImageIds(resources: PackageResource[]): Set<string> {
	const imageIds = new Set<string>();
	const resourcesById = new Map(resources.map((resource) => [resource.getId(), resource] as const));
	for (const resource of resources) {
		if (!isSkeletonResource(resource)) continue;
		for (const requiredId of resource.getRequireIds()) {
			if (!requiredId) continue;
			const required = resourcesById.get(requiredId);
			if (required && isImageResource(required)) imageIds.add(requiredId);
		}
	}
	return imageIds;
}

function resolveFontFileName(fontName: string): string {
	return /\.fnt$/i.test(fontName) ? fontName : `${fontName}.fnt`;
}

async function resolveEditorCompatibleResourceOrder(
	pkg: Package,
	allResources: PackageResource[],
	options: AtlasOptions,
): Promise<PackageResource[]> {
	const pkgId = pkg.getId();
	const resourceMap = new Map(allResources.map((resource) => [resource.getId(), resource]));
	const ordered: PackageResource[] = [];
	const added = new Set<string>();
	const componentStack: Component[] = [];

	async function addResource(resource: PackageResource | undefined): Promise<void> {
		if (!resource) return;
		const resourceId = resource.getId();
		if (!resourceId || added.has(resourceId)) return;
		added.add(resourceId);
		ordered.push(resource);
		if (isFontResource(resource)) {
			await addResource(resourceMap.get(resource.getTextureId?.() ?? ''));
			if (options.readFileRaw && options.basePath) {
				const fontName = resolveFontFileName(resource.getName());
				const fontPath = resource.getPath() ?? '/';
				const fntFile = `${options.basePath}/${pkg.getName()}${fontPath}${fontName}`;
				try {
					const fntData = await options.readFileRaw(fntFile);
					const fntText = new TextDecoder().decode(fntData);
					for (const line of fntText.split(/\r?\n/)) {
						const imgMatch = line.match(/\bimg=(\w+)/);
						if (imgMatch) await addResource(resourceMap.get(imgMatch[1] ?? ''));
					}
				} catch {
					/* ignore */
				}
			}
		}
		if (isComponentResource(resource)) {
			componentStack.push(resource);
		}
	}

	async function addResourceByLocalUiUrl(value: string | null | undefined): Promise<void> {
		if (!value || typeof value !== 'string' || !value.startsWith('ui://')) return;
		const normalized = value.slice(5).split(',')[0] ?? '';
		if (!normalized) return;
		let resourceId = '';
		const slashIndex = normalized.indexOf('/');
		if (slashIndex >= 0) {
			const packageToken = normalized.slice(0, slashIndex);
			if (packageToken !== pkgId) return;
			resourceId = normalized.slice(slashIndex + 1);
		} else if (normalized.length > 8) {
			const packageToken = normalized.slice(0, 8);
			if (packageToken !== pkgId) return;
			resourceId = normalized.slice(8);
		}
		if (!resourceId) return;
		await addResource(resourceMap.get(resourceId));
	}

	async function addGearIconResources(gear: GearWithAtlasRefs): Promise<void> {
		if (gear.getGearType?.() !== GearType.Icon) return;
		const values = gear.getValues?.();
		if (typeof values === 'string' && values) {
			for (const value of values.split('|')) {
				await addResourceByLocalUiUrl(value.trim());
			}
		}
		const defaultValue = gear.getDefaultValue?.();
		if (typeof defaultValue === 'string') {
			await addResourceByLocalUiUrl(defaultValue);
		}
	}

	for (const resource of allResources) {
		if (resource.getExported()) await addResource(resource);
	}

	while (componentStack.length > 0) {
		const component = componentStack.pop();
		if (!component) continue;
		for (const child of component.listChildren()) {
			const refChild = child as ChildWithReferenceUrls;
			await addResource(resourceMap.get(refChild.getSrc?.() ?? ''));
			for (const ref of [
				refChild.getUrl?.(),
				refChild.getDefaultItem?.(),
				refChild.getIcon?.(),
				refChild.getSelectedIcon?.(),
				refChild.getFont?.(),
				refChild.getDropdown?.(),
				refChild.getVtScrollBarRes?.(),
				refChild.getHzScrollBarRes?.(),
				refChild.getHeaderRes?.(),
				refChild.getFooterRes?.(),
				refChild.getSound?.(),
				refChild.getInstanceIcon?.(),
				refChild.getInstanceSelectedIcon?.(),
			]) {
				await addResourceByLocalUiUrl(ref);
			}
			for (const item of refChild.getInstanceComboItems?.() ?? []) {
				await addResourceByLocalUiUrl(item.icon ?? undefined);
			}
			for (const item of refChild.getListItems?.() ?? []) {
				await addResourceByLocalUiUrl(item.icon ?? undefined);
				await addResourceByLocalUiUrl(item.url ?? undefined);
			}
			for (const gear of refChild.listGears?.() ?? []) {
				await addGearIconResources(gear);
			}
		}
		for (const ref of [
			(component as Component & ChildWithReferenceUrls).getDropdown?.(),
			(component as Component & ChildWithReferenceUrls).getVtScrollBarRes?.(),
			(component as Component & ChildWithReferenceUrls).getHzScrollBarRes?.(),
			(component as Component & ChildWithReferenceUrls).getHeaderRes?.(),
			(component as Component & ChildWithReferenceUrls).getFooterRes?.(),
			(component as Component & ChildWithReferenceUrls).getSound?.(),
		]) {
			await addResourceByLocalUiUrl(ref);
		}
		for (const transition of (
			component as Component & { listTransitions?(): TransitionWithAtlasRefs[] }
		).listTransitions?.() ?? []) {
			for (const item of transition.listItems?.() ?? []) {
				const actionType = item.getActionType?.();
				if (actionType !== TransitionActionType.Sound && actionType !== TransitionActionType.Icon) continue;
				for (const value of [item.getStartValue?.(), item.getEndValue?.()]) {
					if (Array.isArray(value)) {
						for (const entry of value) {
							if (typeof entry === 'string') await addResourceByLocalUiUrl(entry);
						}
					} else if (typeof value === 'string') {
						await addResourceByLocalUiUrl(value);
					}
				}
			}
		}
	}

	for (const resource of allResources) {
		await addResource(resource);
	}

	return ordered;
}

/**
 * Packs image resources into texture atlases.
 *
 * This transform performs MaxRects bin-packing on all ImageResource items
 * within each package, creating Atlas and Sprite property nodes. When an
 * a raster backend is provided, it also composites the actual PNG files.
 *
 * When `trimImage` is enabled and encoder is available, transparent pixels
 * at image edges are trimmed before packing. The trimmed offset and original
 * dimensions are stored in the Sprite nodes for runtime reconstruction.
 *
 * ```ts
 * import sharp from 'sharp';
 * await doc.transform(atlas({
 *   encoder: sharp,
 *   maxSize: 2048,
 *   trimImage: true,
 *   basePath: './assets/',
 *   outputPath: './dist/',
 * }));
 * ```
 */
export function atlas(_options: AtlasOptions = {}): Transform {
	const options = { ...ATLAS_DEFAULTS, ..._options };

	return createTransform('atlas', async (doc: Document): Promise<void> => {
		const root = doc.getRoot();
		const logger = doc.getLogger();
		const encoder = options.encoder;
		const doTrim = options.trimImage && !!encoder && !!options.basePath;
		const packageFilter = options.packages ? new Set(options.packages) : null;

		for (const pkg of root.listPackages()) {
			if (packageFilter && !packageFilter.has(pkg.getName())) continue;
			// Respect publish-selected resources when publish() precomputes a merged branch view.
			const selectedPublishIds = new Set(
				((pkg.getExtras() as PackageAtlasExtras | undefined) ?? {}).publishedResourceIds ?? [],
			);
			const allResources =
				selectedPublishIds.size > 0
					? pkg.listResources().filter((resource) => selectedPublishIds.has(resource.getId()))
					: pkg.listResources();
			const skeletonDependencyImageIds = getSelectedSkeletonDependencyImageIds(allResources);
			// Process resources in declaration order (matching editor behavior)
			const orderedResources = await resolveEditorCompatibleResourceOrder(pkg, allResources, options);
			const resourceOrder = new Map(orderedResources.map((resource, index) => [resource.getId(), index]));
			const inputOrder = new Map(allResources.map((resource, index) => [resource.getId(), index]));
			const orderedAllResources = sortResourcesByOrder(allResources, resourceOrder, inputOrder);
			const hasPackable = allResources.some((resource) => {
				if (isImageResource(resource) && skeletonDependencyImageIds.has(resource.getId())) return false;
				return isPackableResource(resource);
			});
			if (!hasPackable) continue;

			// Collect packable items in declaration order
			const inputs: InputItem[] = [];

			// Build set of referenced resource IDs (editor only packs referenced images)
			// Walk component tree recursively to find all image references
			const referencedIds = new Set<string>();
			const resourceMap = new Map<string, PackageResource>();
			for (const res of allResources) {
				const id = res.getId();
				if (id) resourceMap.set(id, res);
			}
			function collectRefs(component: Component, visited: Set<string>): void {
				for (const child of component.listChildren()) {
					const refChild = child as ChildWithReferenceUrls;
					const src = refChild.getSrc?.();
					if (src && !visited.has(src)) {
						referencedIds.add(src);
						visited.add(src);
						const srcRes = resourceMap.get(src);
						if (srcRes && isComponentResource(srcRes)) {
							collectRefs(srcRes, visited);
						}
					}
					for (const ref of [
						refChild.getIcon?.(),
						refChild.getSelectedIcon?.(),
						refChild.getFont?.(),
						refChild.getDropdown?.(),
						refChild.getInstanceIcon?.(),
						refChild.getInstanceSelectedIcon?.(),
						refChild.getVtScrollBarRes?.(),
						refChild.getHzScrollBarRes?.(),
						refChild.getHeaderRes?.(),
						refChild.getFooterRes?.(),
						refChild.getUrl?.(),
					]) {
						addUiResourceRef(referencedIds, ref);
					}
					addUiResourceRefsFromText(referencedIds, refChild.getText?.());
					for (const item of refChild.getInstanceComboItems?.() ?? []) {
						addUiResourceRef(referencedIds, item.icon ?? undefined);
					}
					for (const item of refChild.getListItems?.() ?? []) {
						addUiResourceRef(referencedIds, item.icon ?? undefined);
					}
					for (const gear of refChild.listGears?.() ?? []) {
						addUiResourceRefsFromUnknown(referencedIds, gear.getValues?.());
						addUiResourceRefsFromUnknown(referencedIds, gear.getDefaultValue?.());
					}
				}
				for (const transition of (
					component as Component & { listTransitions?(): TransitionWithAtlasRefs[] }
				).listTransitions?.() ?? []) {
					for (const item of transition.listItems?.() ?? []) {
						addUiResourceRefsFromUnknown(referencedIds, item.getStartValue?.());
						addUiResourceRefsFromUnknown(referencedIds, item.getEndValue?.());
					}
				}
			}
			for (const res of orderedAllResources) {
				if (isComponentResource(res)) {
					collectRefs(res, new Set());
				}
				if (isSkeletonResource(res) && referencedIds.has(res.getId())) {
					for (const requiredId of res.getRequireIds()) {
						if (requiredId) referencedIds.add(requiredId);
					}
				}
				// Font texture references and glyph image references
				if (isFontResource(res)) {
					const textureId = res.getTextureId?.() ?? '';
					if (textureId) referencedIds.add(textureId);
					// Parse .fnt file for glyph image references
					if (options.readFileRaw && options.basePath) {
						const fontName = resolveFontFileName(res.getName());
						const fontPath = res.getPath() ?? '/';
						const fntFile = `${options.basePath}/${pkg.getName()}${fontPath}${fontName}`;
						try {
							const fntData = await options.readFileRaw(fntFile);
							const fntText = new TextDecoder().decode(fntData);
							for (const line of fntText.split(/\r?\n/)) {
								const match = line.match(/img=(\w+)/);
								if (match) referencedIds.add(match[1]);
							}
						} catch {
							/* .fnt file not found — OK */
						}
					}
				}
			}

			for (const res of orderedAllResources) {
				if (isImageResource(res)) {
					// Pack referenced images, plus explicitly exported standalone images.
					const resId = res.getId();
					if (skeletonDependencyImageIds.has(resId)) continue;
					if (
						selectedPublishIds.size === 0 &&
						!res.getExported() &&
						referencedIds.size > 0 &&
						!referencedIds.has(resId)
					)
						continue;
					await _collectImage(res, pkg, inputs, encoder, options, doTrim, logger);
				} else if (isMovieClipResource(res)) {
					const resId = res.getId();
					if (
						selectedPublishIds.size === 0 &&
						!res.getExported() &&
						referencedIds.size > 0 &&
						!referencedIds.has(resId)
					)
						continue;
					await _collectMovieClipFrames(doc, res, pkg, inputs, encoder, options, logger);
				} else if (isFontResource(res)) {
					const resId = res.getId();
					if (
						selectedPublishIds.size === 0 &&
						!res.getExported() &&
						referencedIds.size > 0 &&
						!referencedIds.has(resId)
					)
						continue;
					await _collectFontTexture(doc, res, pkg, options);
				}
			}

			if (inputs.length === 0) continue;
			let totalPageCount = 0;
			let usedDirectOutput = false;
			const { autoInputs, fixedPageGroups, standaloneGroups, reservedPageIndexes } = groupStandaloneInputs(
				doc,
				inputs,
				options,
			);
			const branchGroups = buildBranchAtlasGroups(doc, autoInputs, options);
			const branchPageOffsets = new Map<number, number>();

			for (const group of branchGroups) {
				const directOutput =
					fixedPageGroups.length === 0 && standaloneGroups.length === 0
						? resolveDirectImageOutput(group.inputs, options)
						: null;
				if (directOutput) {
					await emitDirectImageOutput(
						doc,
						pkg,
						directOutput,
						encoder,
						options,
						logger,
						group.branchName,
						group.branchOrdinal,
					);
					usedDirectOutput = true;
					totalPageCount += 1;
					continue;
				}
				const pageStart = reserveAutoPageStart(branchPageOffsets, group.branchOrdinal, reservedPageIndexes);
				const emittedPageCount = await emitPagedAtlasGroup(doc, pkg, allResources, group.inputs, {
					branchName: group.branchName,
					branchOrdinal: group.branchOrdinal,
					pageStart,
					fileNameAt: (pageIndex) => resolveAtlasOutputFileName(pkg, pageIndex, group.branchName),
					options,
					encoder,
					logger,
				});
				totalPageCount += emittedPageCount;
				branchPageOffsets.set(group.branchOrdinal, pageStart + emittedPageCount);
			}

			for (const group of fixedPageGroups) {
				const emittedPageCount = await emitPagedAtlasGroup(doc, pkg, allResources, group.inputs, {
					branchName: group.branchName,
					branchOrdinal: group.branchOrdinal,
					pageStart: group.pageIndex,
					forceSinglePage: true,
					fileNameAt: () => resolveAtlasOutputFileName(pkg, group.pageIndex, group.branchName),
					options,
					encoder,
					logger,
				});
				totalPageCount += emittedPageCount;
			}

			const standalonePageOffsets = new Map(branchPageOffsets);
			for (const group of fixedPageGroups) {
				const nextPageIndex = group.pageIndex + 1;
				const current = standalonePageOffsets.get(group.branchOrdinal) ?? 0;
				if (nextPageIndex > current) standalonePageOffsets.set(group.branchOrdinal, nextPageIndex);
			}

			for (const group of standaloneGroups) {
				const emittedPageCount = await emitStandaloneAtlasGroup(doc, pkg, group, {
					atlasIndexStart: standalonePageOffsets.get(group.branchOrdinal) ?? 0,
					options,
					encoder,
					logger,
				});
				totalPageCount += emittedPageCount;
				standalonePageOffsets.set(
					group.branchOrdinal,
					(standalonePageOffsets.get(group.branchOrdinal) ?? 0) + emittedPageCount,
				);
			}

			if (usedDirectOutput) {
				logger.info(`atlas: Direct output for single image package "${pkg.getName()}".`);
			}
			logger.info(
				`atlas: Packed ${inputs.length} images into ${totalPageCount} atlas(es) for package "${pkg.getName()}".`,
			);
		}
	});
}

function buildBranchAtlasGroups(doc: Document, inputs: InputItem[], options: AtlasOptions): BranchAtlasGroup[] {
	if (!options.separatedAtlasForBranch) {
		return [{ branchName: '', branchOrdinal: 0, inputs }];
	}

	const discoveredBranchNames = [
		...new Set(inputs.map((input) => getInputBranchName(input)).filter((branchName) => !!branchName)),
	];
	if (discoveredBranchNames.length === 0) {
		return [{ branchName: '', branchOrdinal: 0, inputs }];
	}

	const orderedBranchNames = doc
		.getRoot()
		.listBranches()
		.filter((branchName) => discoveredBranchNames.includes(branchName));
	for (const branchName of discoveredBranchNames) {
		if (!orderedBranchNames.includes(branchName)) orderedBranchNames.push(branchName);
	}

	const groups = new Map<string, InputItem[]>();
	groups.set('', []);
	for (const branchName of orderedBranchNames) {
		groups.set(branchName, []);
	}

	for (const input of inputs) {
		const branchName = getInputBranchName(input);
		const key = groups.has(branchName) ? branchName : '';
		groups.get(key)!.push(input);
	}

	const orderedKeys = [''];
	for (const branchName of orderedBranchNames) {
		if ((groups.get(branchName)?.length ?? 0) > 0) orderedKeys.push(branchName);
	}

	return orderedKeys
		.filter((branchName) => (groups.get(branchName)?.length ?? 0) > 0)
		.map((branchName, index) => ({
			branchName,
			branchOrdinal: index,
			inputs: groups.get(branchName) ?? [],
		}));
}

function reserveAutoPageStart(
	branchPageOffsets: Map<number, number>,
	branchOrdinal: number,
	reservedPageIndexes: Set<number>,
): number {
	let pageIndex = branchPageOffsets.get(branchOrdinal) ?? 0;
	while (branchOrdinal === 0 && reservedPageIndexes.has(pageIndex)) {
		pageIndex += 1;
	}
	return pageIndex;
}

async function emitPagedAtlasGroup(
	doc: Document,
	pkg: Package,
	allResources: PackageResource[],
	inputs: InputItem[],
	context: {
		branchName: string;
		branchOrdinal: number;
		pageStart: number;
		fileNameAt: (pageIndex: number) => string;
		options: AtlasOptions;
		encoder: AtlasRasterBackend | undefined;
		logger: ILogger;
		forceSinglePage?: boolean;
	},
): Promise<number> {
	if (inputs.length === 0) return 0;
	const pages = packAtlasPages(inputs, context.options, context.forceSinglePage === true);
	if (pages.length === 0) return 0;

	for (let pageOffset = 0; pageOffset < pages.length; pageOffset += 1) {
		const page = pages[pageOffset];
		const pageIndex = context.pageStart + pageOffset;
		const atlasNode = doc.createAtlas(`atlas${resolveAtlasIndex(context.branchOrdinal, pageIndex)}`);
		atlasNode.setIndex(resolveAtlasIndex(context.branchOrdinal, pageIndex));
		atlasNode.setFile(context.fileNameAt(pageIndex));
		atlasNode.setWidth(page.width);
		atlasNode.setHeight(page.height);
		pkg.addAtlas(atlasNode);

		attachSpritesToAtlas(doc, allResources, inputs, page.outputRects, atlasNode);
		await writeAtlasPageImage(
			pkg,
			inputs,
			page,
			atlasNode.getFile(),
			context.encoder,
			context.options,
			context.logger,
		);
	}

	return pages.length;
}

async function emitStandaloneAtlasGroup(
	doc: Document,
	pkg: Package,
	group: StandaloneAtlasGroup,
	context: {
		atlasIndexStart: number;
		options: AtlasOptions;
		encoder: AtlasRasterBackend | undefined;
		logger: ILogger;
	},
): Promise<number> {
	if (group.inputs.length === 0) return 0;
	const pages = packAtlasPages(
		group.inputs,
		context.options,
		true,
		group.sizeMode === 'npot'
			? { powerOfTwo: false, multipleOfFour: false, square: false }
			: group.sizeMode === 'multipleOf4'
				? { powerOfTwo: false, multipleOfFour: true, square: false }
				: undefined,
	);
	if (pages.length === 0) return 0;

	for (let pageOffset = 0; pageOffset < pages.length; pageOffset += 1) {
		const page = pages[pageOffset];
		const baseFileName = resolveStandaloneAtlasOutputFileName(pkg, group.resource, group.branchName);
		const atlasFileName = pages.length <= 1 ? baseFileName : insertFileNameSuffix(baseFileName, `_${pageOffset}`);
		const atlasIndex = context.atlasIndexStart + pageOffset;
		const atlasNode = doc.createAtlas(`atlas${resolveAtlasIndex(group.branchOrdinal, atlasIndex)}`);
		atlasNode.setIndex(resolveAtlasIndex(group.branchOrdinal, atlasIndex));
		atlasNode.setFile(atlasFileName);
		const standaloneSize = resolveStandaloneAtlasSize(page.width, page.height, group.sizeMode, context.options);
		atlasNode.setWidth(standaloneSize.width);
		atlasNode.setHeight(standaloneSize.height);
		pkg.addAtlas(atlasNode);

		attachSpritesToAtlas(doc, [], group.inputs, page.outputRects, atlasNode);
		await writeAtlasPageImage(
			pkg,
			group.inputs,
			{ ...page, width: standaloneSize.width, height: standaloneSize.height },
			atlasFileName,
			context.encoder,
			context.options,
			context.logger,
		);
	}

	return pages.length;
}

function packAtlasPages(
	inputs: InputItem[],
	options: AtlasOptions,
	forceSinglePage: boolean,
	sizeOverrides?: {
		powerOfTwo: boolean;
		multipleOfFour: boolean;
		square: boolean;
	},
): ReturnType<MaxRectsPackerCompat['pack']> {
	const hasDuplicatePadding = inputs.some((input) => {
		return isImageResource(input.resource) && input.resource.getDuplicatePadding?.() === true;
	});
	const packer = new MaxRectsPackerCompat({
		pot: sizeOverrides?.powerOfTwo ?? options.powerOfTwo,
		mof: sizeOverrides?.multipleOfFour ?? !options.powerOfTwo,
		padding: options.padding,
		rotation: options.allowRotation,
		minWidth: 16,
		minHeight: 16,
		maxWidth: options.maxSize,
		maxHeight: options.maxSize,
		square: sizeOverrides?.square ?? options.square,
		fast: options.fast,
		edgePadding: false,
		duplicatePadding: hasDuplicatePadding,
		multiPage: forceSinglePage ? false : options.multiPage,
		preserveInputOrderOnTie: options.preserveInputOrderOnTie,
	});
	return packer.pack(inputs.map((input, index) => inputToCompatRect(input, index))) ?? [];
}

function attachSpritesToAtlas(
	doc: Document,
	allResources: PackageResource[],
	inputs: InputItem[],
	outputRects: Array<{ index: number; x: number; y: number; width: number; height: number; rotated: boolean }>,
	atlasNode: ReturnType<Document['createAtlas']>,
): void {
	for (const packedRect of outputRects) {
		const input = inputs[packedRect.index];
		if (!input) continue;
		const packedSize = resolvePackedRectSize(input, packedRect.width, packedRect.height, packedRect.rotated);
		const sprite = doc.createSprite();
		sprite.setItemId(input.id);
		sprite.setRectX(packedRect.x);
		sprite.setRectY(packedRect.y);
		sprite.setRectWidth(packedSize.width);
		sprite.setRectHeight(packedSize.height);
		sprite.setRotated(packedRect.rotated);
		sprite.setOffsetX(input.offsetX);
		sprite.setOffsetY(input.offsetY);
		sprite.setOriginalWidth(input.originalWidth);
		sprite.setOriginalHeight(input.originalHeight);
		sprite.setAtlas(atlasNode);
		atlasNode.addSprite(sprite);
	}

	for (const resource of allResources) {
		if (!isFontResource(resource)) continue;
		const extras = resource.getExtras() as FontResourceExtras;
		const alias = extras?._fontSpriteAlias;
		if (!alias) continue;
		const imageSprite = outputRects.find((result) => inputs[result.index]?.id === alias.textureId);
		if (!imageSprite) continue;
		const imageInput = inputs[imageSprite.index];
		const fontSprite = doc.createSprite();
		fontSprite.setItemId(alias.fontId);
		fontSprite.setRectX(imageSprite.x);
		fontSprite.setRectY(imageSprite.y);
		fontSprite.setRectWidth(imageSprite.width);
		fontSprite.setRectHeight(imageSprite.height);
		fontSprite.setRotated(imageSprite.rotated);
		if (imageInput) {
			fontSprite.setOffsetX(imageInput.offsetX);
			fontSprite.setOffsetY(imageInput.offsetY);
			fontSprite.setOriginalWidth(imageInput.originalWidth);
			fontSprite.setOriginalHeight(imageInput.originalHeight);
		}
		fontSprite.setAtlas(atlasNode);
		atlasNode.addSprite(fontSprite);
	}
}

async function writeAtlasPageImage(
	pkg: Package,
	inputs: InputItem[],
	page: {
		width: number;
		height: number;
		outputRects: Array<{ index: number; x: number; y: number; width: number; height: number; rotated: boolean }>;
	},
	atlasFileName: string,
	encoder: AtlasRasterBackend | undefined,
	options: AtlasOptions,
	logger: ILogger,
): Promise<void> {
	if (!encoder || !options.outputPath) return;
	if (options.mkdir) {
		await options.mkdir(options.outputPath);
	}

	const compositeInputs: Array<{ input: Uint8Array; left: number; top: number }> = [];
	for (const packedRect of page.outputRects) {
		const input = inputs[packedRect.index];
		if (!input) continue;
		if (packedRect.width <= 0 || packedRect.height <= 0 || input.width <= 0 || input.height <= 0) continue;
		try {
			let imageBuffer: Uint8Array;
			if (input.trimBuffer) {
				imageBuffer = input.trimBuffer;
				if (imageBuffer.length === 0) continue;
			} else if (input.rasterizedBuffer) {
				imageBuffer = input.rasterizedBuffer;
			} else {
				if (!isImageResource(input.resource)) {
					logger.warn(`atlas: Non-image input "${input.id}" is missing inline buffer, skipping compositing.`);
					continue;
				}
				const filePath = _resolveImagePath(input.resource, pkg, options.basePath!);
				imageBuffer = await encoder(filePath).toBuffer();
			}
			if (packedRect.rotated) imageBuffer = await encoder(imageBuffer).rotate(270).toBuffer();
			compositeInputs.push({
				input: imageBuffer,
				left: packedRect.x,
				top: packedRect.y,
			});
		} catch {
			logger.warn(`atlas: Could not read image "${input.id}" for compositing.`);
		}
	}

	const outputFile = `${options.outputPath}/${atlasFileName}`;
	await encoder({
		create: {
			width: page.width,
			height: page.height,
			channels: 4 as const,
			background: { r: 0, g: 0, b: 0, alpha: 0 },
		},
	})
		.composite(compositeInputs)
		.toFile(outputFile);

	logger.info(`atlas: Generated ${atlasFileName} (${page.width}x${page.height}, ${page.outputRects.length} sprites)`);
}

function inputToCompatRect(input: InputItem, index: number): CompatNodeRect {
	const duplicatePadding = isImageResource(input.resource) && input.resource.getDuplicatePadding?.() === true;
	return {
		x: 0,
		y: 0,
		width: input.width,
		height: input.height,
		rotated: false,
		index,
		subIndex: -1,
		flags: duplicatePadding ? COMPAT_NODE_RECT_FLAGS.DUPLICATE_PADDING : 0,
		score1: 0,
		score2: 0,
		sourceKind: input.sourceKind,
	};
}

function resolvePackedRectSize(
	input: InputItem,
	width: number,
	height: number,
	rectRotated: boolean,
): { width: number; height: number } {
	if (!rectRotated) return { width, height };
	return {
		width: input.height,
		height: input.width,
	};
}

function resolveDirectImageOutput(inputs: InputItem[], options: AtlasOptions): InputItem | null {
	if (!options.directSingleImageOutput || options.extractAlpha) return null;
	if (inputs.length !== 1) return null;
	const [input] = inputs;
	if (!input || input.sourceKind !== 'image' || !isImageResource(input.resource)) return null;
	if (input.resource.getDuplicatePadding?.() === true) return null;
	if (input.width !== input.originalWidth || input.height !== input.originalHeight) return null;
	const fileName = resolveImageFileName(input.resource).toLowerCase();
	if (!fileName.endsWith('.png')) return null;
	return input;
}

function resolveDirectOutputAtlasSize(
	width: number,
	height: number,
	options: AtlasOptions,
): { width: number; height: number } {
	let resolvedWidth = width;
	let resolvedHeight = height;
	if (options.square) {
		const side = Math.max(resolvedWidth, resolvedHeight);
		resolvedWidth = side;
		resolvedHeight = side;
	}
	if (options.powerOfTwo) {
		resolvedWidth = nextPow2(resolvedWidth);
		resolvedHeight = nextPow2(resolvedHeight);
	}
	return { width: resolvedWidth, height: resolvedHeight };
}

async function emitDirectImageOutput(
	doc: Document,
	pkg: Package,
	input: InputItem,
	encoder: AtlasRasterBackend | undefined,
	options: AtlasOptions,
	logger: ILogger,
	branchName: string = '',
	branchOrdinal: number = 0,
): Promise<void> {
	const atlasFileName = resolveAtlasOutputFileName(pkg, 0, branchName);
	const atlasSize = resolveDirectOutputAtlasSize(input.originalWidth, input.originalHeight, options);
	const atlasNode = doc.createAtlas(`atlas${resolveAtlasIndex(branchOrdinal, 0)}`);
	atlasNode.setIndex(resolveAtlasIndex(branchOrdinal, 0));
	atlasNode.setFile(atlasFileName);
	atlasNode.setWidth(atlasSize.width);
	atlasNode.setHeight(atlasSize.height);
	pkg.addAtlas(atlasNode);

	const sprite = doc.createSprite();
	sprite.setItemId(input.id);
	sprite.setRectX(0);
	sprite.setRectY(0);
	sprite.setRectWidth(input.originalWidth);
	sprite.setRectHeight(input.originalHeight);
	sprite.setRotated(false);
	sprite.setOffsetX(0);
	sprite.setOffsetY(0);
	sprite.setOriginalWidth(input.originalWidth);
	sprite.setOriginalHeight(input.originalHeight);
	sprite.setAtlas(atlasNode);
	atlasNode.addSprite(sprite);

	if (!encoder || !options.outputPath || !isImageResource(input.resource) || !options.basePath) return;
	if (options.mkdir) {
		await options.mkdir(options.outputPath);
	}

	const outputFile = `${options.outputPath}/${atlasFileName}`;
	const filePath = _resolveImagePath(input.resource, pkg, options.basePath);

	try {
		if (atlasSize.width === input.originalWidth && atlasSize.height === input.originalHeight) {
			await encoder(filePath).png().toFile(outputFile);
		} else {
			const imageBuffer = await encoder(filePath).png().toBuffer();
			await encoder({
				create: {
					width: atlasSize.width,
					height: atlasSize.height,
					channels: 4 as const,
					background: { r: 0, g: 0, b: 0, alpha: 0 },
				},
			})
				.composite([{ input: imageBuffer, left: 0, top: 0 }])
				.png()
				.toFile(outputFile);
		}
	} catch {
		logger.warn(`atlas: Could not write direct-output atlas "${atlasFileName}".`);
	}
}

function getInputBranchName(input: InputItem): string {
	return (input.resource as { getBranch?(): string }).getBranch?.() ?? '';
}

function resolveAtlasIndex(branchOrdinal: number, pageIndex: number): number {
	if (branchOrdinal <= 0) return pageIndex;
	return branchOrdinal * 100 + pageIndex;
}

function resolveAtlasOutputFileName(pkg: Package, pageIndex: number, branchName: string): string {
	const suffix = branchName ? `_${branchName}` : '';
	return `${pkg.getPublishName() || pkg.getName()}_atlas${pageIndex}${suffix}.png`;
}

function resolveStandaloneAtlasOutputFileName(pkg: Package, resource: PackInputResource, branchName: string): string {
	const baseName = `${pkg.getPublishName() || pkg.getName()}_atlas_${getPublishedItemId(resource)}`;
	const suffix = branchName ? `_${branchName}` : '';
	if (isImageResource(resource)) {
		const ext = extname(resolveImageFileName(resource)) || '.png';
		return `${baseName}${suffix}${ext}`;
	}
	return `${baseName}${suffix}.png`;
}

function resolveStandaloneAtlasSize(
	width: number,
	height: number,
	sizeMode: StandaloneAtlasGroup['sizeMode'],
	options: AtlasOptions,
): { width: number; height: number } {
	if (sizeMode === 'npot') {
		return { width, height };
	}
	if (sizeMode === 'multipleOf4') {
		return {
			width: roundUpToMultiple(width, 4),
			height: roundUpToMultiple(height, 4),
		};
	}
	return resolveDirectOutputAtlasSize(width, height, options);
}

function resolveImageFileName(resource: ImageResource): string {
	const extras = resource.getExtras() as ImageResourceExtras;
	return resource.getFileName() || extras._fileName || resource.getName();
}

function extname(fileName: string): string {
	const normalized = fileName.replace(/\\/g, '/');
	const lastSlash = normalized.lastIndexOf('/');
	const lastDot = normalized.lastIndexOf('.');
	if (lastDot <= lastSlash) return '';
	return normalized.slice(lastDot);
}

function insertFileNameSuffix(fileName: string, suffix: string): string {
	const extension = extname(fileName);
	if (!extension) return `${fileName}${suffix}`;
	return `${fileName.slice(0, -extension.length)}${suffix}${extension}`;
}

function nextPow2(value: number): number {
	if (value <= 1) return 1;
	return 2 ** Math.ceil(Math.log2(value));
}

function roundUpToMultiple(value: number, base: number): number {
	if (value <= 0) return 0;
	return Math.ceil(value / base) * base;
}

function sortResourcesByOrder(
	resources: PackageResource[],
	orderMap: Map<string, number>,
	inputOrderMap: Map<string, number>,
): PackageResource[] {
	const ordered = [...resources];
	ordered.sort((left, right) => {
		const leftId = left.getId();
		const rightId = right.getId();
		const leftOrder =
			leftId && orderMap.has(leftId)
				? (orderMap.get(leftId) ?? Number.MAX_SAFE_INTEGER)
				: Number.MAX_SAFE_INTEGER;
		const rightOrder =
			rightId && orderMap.has(rightId)
				? (orderMap.get(rightId) ?? Number.MAX_SAFE_INTEGER)
				: Number.MAX_SAFE_INTEGER;
		if (leftOrder !== rightOrder) return leftOrder - rightOrder;
		const leftInputOrder =
			leftId && inputOrderMap.has(leftId)
				? (inputOrderMap.get(leftId) ?? Number.MAX_SAFE_INTEGER)
				: Number.MAX_SAFE_INTEGER;
		const rightInputOrder =
			rightId && inputOrderMap.has(rightId)
				? (inputOrderMap.get(rightId) ?? Number.MAX_SAFE_INTEGER)
				: Number.MAX_SAFE_INTEGER;
		if (leftInputOrder !== rightInputOrder) return leftInputOrder - rightInputOrder;
		return (leftId ?? '').localeCompare(rightId ?? '');
	});
	return ordered;
}

interface ExtractedJtaFrameMeta {
	addDelay: number;
	offsetX: number;
	offsetY: number;
	width: number;
	height: number;
	textureIndex: number;
}

interface ExtractedJtaMeta {
	interval: number;
	repeatDelay: number;
	swing: boolean;
	width: number;
	height: number;
	frames: ExtractedJtaFrameMeta[];
}

interface ExtractedJtaData {
	frames: Uint8Array[];
	meta?: ExtractedJtaMeta;
}

function getResourceTextureSetMode(resource: PackInputResource): TextureSetMode {
	if (isImageResource(resource)) {
		return parseTextureSetMode(resource.getTextureSetMode?.());
	}
	return parseTextureSetMode(resource.getTextureSetMode?.());
}

function groupStandaloneInputs(
	doc: Document,
	inputs: InputItem[],
	options: AtlasOptions,
): {
	autoInputs: InputItem[];
	fixedPageGroups: PagedAtlasGroup[];
	standaloneGroups: StandaloneAtlasGroup[];
	reservedPageIndexes: Set<number>;
} {
	const autoInputs: InputItem[] = [];
	const fixedInputsByPage = new Map<string, PagedAtlasGroup>();
	const standaloneGroups = new Map<string, StandaloneAtlasGroup>();
	const reservedPageIndexes = new Set<number>();
	const discoveredBranchNames = [
		...new Set(inputs.map((input) => getInputBranchName(input)).filter((branchName) => !!branchName)),
	];
	const orderedBranchNames = doc
		.getRoot()
		.listBranches()
		.filter((branchName) => discoveredBranchNames.includes(branchName));
	for (const branchName of discoveredBranchNames) {
		if (!orderedBranchNames.includes(branchName)) orderedBranchNames.push(branchName);
	}
	const branchOrdinalByName = new Map<string, number>();
	branchOrdinalByName.set('', 0);
	if (options.separatedAtlasForBranch) {
		let ordinal = 1;
		for (const branchName of orderedBranchNames) {
			branchOrdinalByName.set(branchName, ordinal++);
		}
	} else {
		for (const branchName of orderedBranchNames) {
			branchOrdinalByName.set(branchName, 0);
		}
	}

	for (const input of inputs) {
		const branchName = getInputBranchName(input);
		const branchOrdinal = branchOrdinalByName.get(branchName) ?? 0;
		const mode = getResourceTextureSetMode(input.resource);
		if (mode.kind === 'standalone') {
			const resourceId = getPublishedItemId(input.resource);
			const key = `${branchName}\u0000${resourceId}`;
			const existing = standaloneGroups.get(key);
			if (existing) {
				existing.inputs.push(input);
			} else {
				standaloneGroups.set(key, {
					resource: input.resource,
					branchName,
					branchOrdinal,
					sizeMode: mode.sizeMode,
					inputs: [input],
				});
			}
			continue;
		}
		if (mode.kind === 'page') {
			reservedPageIndexes.add(mode.pageIndex);
			const key = `${branchName}\u0000${mode.pageIndex}`;
			const existing = fixedInputsByPage.get(key);
			if (existing) {
				existing.inputs.push(input);
			} else {
				fixedInputsByPage.set(key, {
					pageIndex: mode.pageIndex,
					branchName,
					branchOrdinal,
					inputs: [input],
				});
			}
			continue;
		}
		autoInputs.push(input);
	}

	return {
		autoInputs,
		fixedPageGroups: [...fixedInputsByPage.values()].sort(
			(left, right) => left.branchOrdinal - right.branchOrdinal || left.pageIndex - right.pageIndex,
		),
		standaloneGroups: [...standaloneGroups.values()].sort(
			(left, right) =>
				left.branchOrdinal - right.branchOrdinal ||
				getPublishedItemId(left.resource).localeCompare(getPublishedItemId(right.resource)),
		),
		reservedPageIndexes,
	};
}

/**
 * Trim transparent edges from an image using the host raster backend.
 * Returns the trimmed buffer, dimensions, and offsets.
 * Falls back to the original image if trim fails (e.g. no alpha channel, no transparent edges).
 */
async function _trimImage(
	encoder: AtlasRasterBackend,
	input: AtlasRasterInput,
	originalWidth: number,
	originalHeight: number,
): Promise<TrimInfo> {
	try {
		const trimResult = await encoder(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
		if (!isResolvedBuffer(trimResult)) {
			throw new Error('atlas: encoder raw alpha trim did not return resolved metadata.');
		}
		const { data, info } = trimResult;
		const width = info.width;
		const height = info.height;
		const channels = info.channels || 4;
		let minX = width;
		let minY = height;
		let maxX = -1;
		let maxY = -1;

		for (let y = 0; y < height; y += 1) {
			for (let x = 0; x < width; x += 1) {
				const alphaIndex = (y * width + x) * channels + 3;
				if ((data[alphaIndex] ?? 0) === 0) continue;
				if (x < minX) minX = x;
				if (y < minY) minY = y;
				if (x > maxX) maxX = x;
				if (y > maxY) maxY = y;
			}
		}

		if (maxX < minX || maxY < minY) {
			return {
				buffer: new Uint8Array(0),
				width: 0,
				height: 0,
				offsetX: 0,
				offsetY: 0,
				originalWidth,
				originalHeight,
			};
		}

		const trimmedWidth = maxX - minX + 1;
		const trimmedHeight = maxY - minY + 1;
		const buffer = await encoder(input)
			.extract({
				left: minX,
				top: minY,
				width: trimmedWidth,
				height: trimmedHeight,
			})
			.toBuffer();

		return {
			buffer,
			width: trimmedWidth,
			height: trimmedHeight,
			offsetX: minX,
			offsetY: minY,
			originalWidth,
			originalHeight,
		};
	} catch {
		// Trim failed (e.g. JPEG without alpha, nothing to trim) — return original
		const buf = await encoder(input).png().toBuffer();
		return {
			buffer: buf,
			width: originalWidth,
			height: originalHeight,
			offsetX: 0,
			offsetY: 0,
			originalWidth,
			originalHeight,
		};
	}
}

/**
 * Resolve an ImageResource to its actual file path on disk.
 */
function _resolveImagePath(resource: ImageResource, pkg: Package, basePath: string): string {
	const imgPath = resource.getPath() ?? '/';
	const fileName = resolveImageFileName(resource);
	const branchName = resource.getBranch?.() ?? '';
	const normalizedBasePath = basePath.replace(/[/\\]+$/, '');
	const packageBasePath = !branchName
		? normalizedBasePath
		: /[\\/]assets$/i.test(normalizedBasePath)
			? normalizedBasePath.replace(/([\\/])assets$/i, `$1assets_${branchName}`)
			: `${normalizedBasePath}_${branchName}`;
	return `${packageBasePath}/${pkg.getName()}${imgPath}${fileName}`;
}

type InputItem = {
	id: string;
	width: number;
	height: number;
	originalWidth: number;
	originalHeight: number;
	offsetX: number;
	offsetY: number;
	resource: PackInputResource;
	trimBuffer?: Uint8Array;
	rasterizedBuffer?: Uint8Array;
	sourceKind: 'image' | 'movieclip-frame';
};

interface StandaloneAtlasGroup {
	resource: PackInputResource;
	branchName: string;
	branchOrdinal: number;
	sizeMode: 'default' | 'npot' | 'multipleOf4';
	inputs: InputItem[];
}

interface PagedAtlasGroup {
	pageIndex: number;
	branchName: string;
	branchOrdinal: number;
	inputs: InputItem[];
}

/** Collect a single ImageResource into the inputs array. */
async function _collectImage(
	resource: ImageResource,
	pkg: Package,
	inputs: InputItem[],
	encoder: AtlasRasterBackend | undefined,
	options: AtlasOptions,
	doTrim: boolean,
	logger: ILogger,
): Promise<void> {
	let origW = resource.getWidth() ?? 0;
	let origH = resource.getHeight() ?? 0;
	const declaredWidth = origW;
	const declaredHeight = origH;
	let sourceHasAlpha = false;
	let rasterizedBuffer: Uint8Array | undefined;

	if (encoder && options.basePath) {
		const filePath = _resolveImagePath(resource, pkg, options.basePath);
		try {
			const metadata = await encoder(filePath).metadata();
			if (origW === 0 || origH === 0) {
				origW = metadata.width ?? 0;
				origH = metadata.height ?? 0;
				resource.setWidth(origW);
				resource.setHeight(origH);
			}
			sourceHasAlpha = metadata.hasAlpha === true || metadata.channels === 4;
			if (/\.svg$/i.test(resolveImageFileName(resource)) && declaredWidth > 0 && declaredHeight > 0) {
				rasterizedBuffer = await encoder(filePath)
					.resize({ width: declaredWidth, height: declaredHeight, fit: 'fill' })
					.png()
					.toBuffer();
				sourceHasAlpha = true;
			}
		} catch {
			if (origW === 0 || origH === 0) {
				logger.warn(`atlas: Could not read image "${filePath}", skipping.`);
				return;
			}
		}
	}

	if (origW <= 0 || origH <= 0) return;

	let packW = origW,
		packH = origH,
		offX = 0,
		offY = 0;
	let trimBuf: Uint8Array | undefined;

	if (doTrim && sourceHasAlpha && options.basePath && encoder) {
		const filePath = _resolveImagePath(resource, pkg, options.basePath);
		try {
			const trimResult = await _trimImage(encoder, rasterizedBuffer ?? filePath, origW, origH);
			packW = trimResult.width;
			packH = trimResult.height;
			offX = trimResult.offsetX;
			offY = trimResult.offsetY;
			trimBuf = trimResult.buffer;
		} catch {
			logger.warn(`atlas: Could not trim "${filePath}", using original.`);
		}
	}

	inputs.push({
		id: getPublishedItemId(resource),
		width: packW,
		height: packH,
		originalWidth: origW,
		originalHeight: origH,
		offsetX: offX,
		offsetY: offY,
		resource,
		trimBuffer: trimBuf,
		rasterizedBuffer,
		sourceKind: 'image',
	});
}

/** Collect MovieClip frame textures from a .jta file into the inputs array. */
async function _collectMovieClipFrames(
	doc: Document,
	resource: MovieClipResource,
	pkg: Package,
	inputs: InputItem[],
	encoder: AtlasRasterBackend | undefined,
	options: AtlasOptions,
	logger: ILogger,
): Promise<void> {
	if (!options.basePath || !options.readFileRaw) return;

	const mcId = resource.getId();
	const mcName = resource.getName() + '.jta';
	const mcPath = resource.getPath() ?? '/';
	const filePath = `${options.basePath}/${pkg.getName()}${mcPath}${mcName}`;

	try {
		const raw = await options.readFileRaw(filePath);
		const jta = _extractJtaFrames(raw);
		if (jta.frames.length === 0) return;

		const frameMetas = jta.meta?.frames ?? [];
		for (const frame of resource.listFrames()) {
			resource.removeFrame(frame);
		}
		resource
			.setInterval(jta.meta?.interval ?? 100)
			.setSwing(jta.meta?.swing ?? false)
			.setRepeatDelay(jta.meta?.repeatDelay ?? 0);

		if (frameMetas.length > 0) {
			const firstFrameIndexByTextureIndex = new Map<number, number>();
			for (let frameIndex = 0; frameIndex < frameMetas.length; frameIndex += 1) {
				const meta = frameMetas[frameIndex];
				const textureIndex = Number.isFinite(meta.textureIndex) ? meta.textureIndex : frameIndex;
				if (!firstFrameIndexByTextureIndex.has(textureIndex)) {
					firstFrameIndexByTextureIndex.set(textureIndex, frameIndex);
				}
			}

			const spriteIdByTextureIndex = new Map<number, string>();
			for (let textureIndex = 0; textureIndex < jta.frames.length; textureIndex += 1) {
				const exportFrameIndex = firstFrameIndexByTextureIndex.get(textureIndex);
				if (exportFrameIndex === undefined) continue;
				const itemId = `${mcId}_${exportFrameIndex}`;
				const input = await _createMovieClipFrameInput(jta.frames[textureIndex], itemId, resource, encoder);
				if (!input) continue;
				inputs.push(input);
				spriteIdByTextureIndex.set(textureIndex, itemId);
			}

			for (let frameIndex = 0; frameIndex < frameMetas.length; frameIndex += 1) {
				const meta = frameMetas[frameIndex];
				const textureIndex = Number.isFinite(meta.textureIndex) ? meta.textureIndex : frameIndex;
				const frame = doc.createMovieFrame(`${mcId}_${frameIndex}`);
				frame
					.setRectX(meta.offsetX)
					.setRectY(meta.offsetY)
					.setRectWidth(meta.width)
					.setRectHeight(meta.height)
					.setAddDelay(meta.addDelay)
					.setSpriteId(spriteIdByTextureIndex.get(textureIndex) ?? '');
				resource.addFrame(frame);
			}
		} else {
			for (let frameIndex = 0; frameIndex < jta.frames.length; frameIndex += 1) {
				const itemId = `${mcId}_${frameIndex}`;
				const input = await _createMovieClipFrameInput(jta.frames[frameIndex], itemId, resource, encoder);
				if (!input) continue;
				inputs.push(input);
				const frame = doc.createMovieFrame(itemId);
				frame
					.setRectX(0)
					.setRectY(0)
					.setRectWidth(input.originalWidth)
					.setRectHeight(input.originalHeight)
					.setAddDelay(0)
					.setSpriteId(itemId);
				resource.addFrame(frame);
			}
		}

		if ((jta.meta?.width ?? 0) > 0 && (jta.meta?.height ?? 0) > 0) {
			resource.setWidth(jta.meta?.width ?? 0);
			resource.setHeight(jta.meta?.height ?? 0);
		}
	} catch {
		logger.warn(`atlas: Could not parse MovieClip "${filePath}", skipping frames.`);
	}
}

async function _createMovieClipFrameInput(
	buffer: Uint8Array,
	itemId: string,
	resource: MovieClipResource,
	encoder: AtlasRasterBackend | undefined,
): Promise<InputItem | null> {
	if (!encoder || buffer.length === 0) return null;
	try {
		const meta = await encoder(buffer).metadata();
		const width = meta.width ?? 0;
		const height = meta.height ?? 0;
		if (width <= 0 || height <= 0) return null;
		return {
			id: itemId,
			width,
			height,
			originalWidth: width,
			originalHeight: height,
			offsetX: 0,
			offsetY: 0,
			resource,
			trimBuffer: buffer,
			sourceKind: 'movieclip-frame',
		};
	} catch {
		return null;
	}
}

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function _extractJtaFrames(data: Uint8Array): ExtractedJtaData {
	const frames: Uint8Array[] = [];
	let offset = 0;
	let firstPngOffset = -1;

	while (offset < data.length) {
		const sigIndex = _findPngSignature(data, offset);
		if (sigIndex === -1) break;
		if (firstPngOffset === -1) firstPngOffset = sigIndex;
		const end = _findPngEnd(data, sigIndex);
		if (end === -1) break;
		frames.push(data.subarray(sigIndex, end));
		offset = end;
	}

	if (firstPngOffset === -1 || frames.length === 0) {
		return { frames: [] };
	}

	return {
		frames,
		meta: _parseJtaHeader(data, firstPngOffset, frames.length),
	};
}

function _findPngSignature(data: Uint8Array, fromIndex: number): number {
	for (let index = fromIndex; index <= data.length - PNG_SIGNATURE.length; index += 1) {
		let matched = true;
		for (let sigIndex = 0; sigIndex < PNG_SIGNATURE.length; sigIndex += 1) {
			if (data[index + sigIndex] !== PNG_SIGNATURE[sigIndex]) {
				matched = false;
				break;
			}
		}
		if (matched) return index;
	}
	return -1;
}

function _findPngEnd(data: Uint8Array, start: number): number {
	let pos = start + PNG_SIGNATURE.length;
	while (pos + 8 <= data.length) {
		const length = _readUint32BE(data, pos);
		pos += 8;
		if (pos + length + 4 > data.length) return -1;
		const isIEND =
			data[pos - 4] === 0x49 && data[pos - 3] === 0x45 && data[pos - 2] === 0x4e && data[pos - 1] === 0x44;
		pos += length + 4;
		if (isIEND) return pos;
	}
	return -1;
}

function _parseJtaHeader(data: Uint8Array, firstPngOffset: number, frameCount: number): ExtractedJtaMeta | undefined {
	if (data.length < 10) return undefined;

	const state = { offset: 0 };
	const end = Math.min(firstPngOffset, data.length);
	const mark = _readUtfBE(data, state, end);
	if (!mark) return undefined;

	const version = _readInt32BEAt(data, state, end);
	if (version == null) return undefined;

	const fpsRaw = _readInt8At(data, state, end);
	if (fpsRaw == null) return undefined;
	const fps = fpsRaw > 0 ? fpsRaw : 24;

	if (state.offset + 3 > end) return undefined;
	state.offset += 3;

	if (version < 102) return undefined;

	_readUint16BEAt(data, state, end);
	_readUint16BEAt(data, state, end);
	const width = _readUint16BEAt(data, state, end);
	const height = _readUint16BEAt(data, state, end);
	if (width == null || height == null) return undefined;

	const speedRaw = _readUint8At(data, state, end);
	const repeatDelayRaw = _readUint8At(data, state, end);
	const swingRaw = _readInt8At(data, state, end);
	const frameTableCount = _readInt16BEAt(data, state, end);
	if (speedRaw == null || repeatDelayRaw == null || swingRaw == null || frameTableCount == null) return undefined;

	const frames: ExtractedJtaFrameMeta[] = [];
	for (let index = 0; index < frameTableCount; index += 1) {
		const delayRaw = _readInt16BEAt(data, state, end);
		const offsetX = _readInt16BEAt(data, state, end);
		const offsetY = _readInt16BEAt(data, state, end);
		const frameWidth = _readInt16BEAt(data, state, end);
		const frameHeight = _readInt16BEAt(data, state, end);
		const textureIndex = _readInt16BEAt(data, state, end);
		if (
			delayRaw == null ||
			offsetX == null ||
			offsetY == null ||
			frameWidth == null ||
			frameHeight == null ||
			textureIndex == null
		) {
			break;
		}
		frames.push({
			addDelay: Math.trunc((1000 / fps) * delayRaw),
			offsetX,
			offsetY,
			width: frameWidth,
			height: frameHeight,
			textureIndex,
		});
	}

	return {
		interval: Math.trunc((1000 / fps) * (speedRaw || 1)),
		repeatDelay: Math.trunc((1000 / fps) * repeatDelayRaw),
		swing: swingRaw === 1,
		width,
		height,
		frames: frames.length === 0 && frameCount > 0 ? [] : frames,
	};
}

function _readUtfBE(data: Uint8Array, state: { offset: number }, end: number): string | null {
	const length = _readUint16BEAt(data, state, end);
	if (length == null || state.offset + length > end) return null;
	const value = new TextDecoder().decode(data.subarray(state.offset, state.offset + length));
	state.offset += length;
	return value;
}

function _readUint8At(data: Uint8Array, state: { offset: number }, end: number): number | null {
	if (state.offset + 1 > end) return null;
	const value = data[state.offset];
	state.offset += 1;
	return value ?? 0;
}

function _readInt8At(data: Uint8Array, state: { offset: number }, end: number): number | null {
	if (state.offset + 1 > end) return null;
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const value = view.getInt8(state.offset);
	state.offset += 1;
	return value;
}

function _readUint16BEAt(data: Uint8Array, state: { offset: number }, end: number): number | null {
	if (state.offset + 2 > end) return null;
	const value = _readUint16BE(data, state.offset);
	state.offset += 2;
	return value;
}

function _readInt16BEAt(data: Uint8Array, state: { offset: number }, end: number): number | null {
	if (state.offset + 2 > end) return null;
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const value = view.getInt16(state.offset, false);
	state.offset += 2;
	return value;
}

function _readInt32BEAt(data: Uint8Array, state: { offset: number }, end: number): number | null {
	if (state.offset + 4 > end) return null;
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const value = view.getInt32(state.offset, false);
	state.offset += 4;
	return value;
}

function _readUint16BE(data: Uint8Array, offset: number): number {
	if (offset + 1 >= data.length) return 0;
	return (data[offset] << 8) | data[offset + 1];
}

function _readUint32BE(data: Uint8Array, offset: number): number {
	if (offset + 3 >= data.length) return 0;
	return (
		data[offset] * 0x1000000 +
		((data[offset + 1] ?? 0) << 16) +
		((data[offset + 2] ?? 0) << 8) +
		(data[offset + 3] ?? 0)
	);
}

/** Collect a Bitmap Font's texture image, packed under the font's ID. */
async function _collectFontTexture(
	doc: Document,
	fontRes: FontResource,
	pkg: Package,
	options: AtlasOptions,
): Promise<void> {
	const textureId = fontRes.getTextureId?.() ?? '';

	if (textureId) {
		// Record font→texture mapping so we can add a duplicate sprite entry
		// after atlas packing. The editor stores both the image ID (jb800) and
		// the font ID (wa8u2r) as separate sprites at the same atlas position.
		const fontId = fontRes.getId();
		fontRes.setExtras({ ...fontRes.getExtras(), _fontSpriteAlias: { fontId, textureId } });
	}

	// Parse .fnt file for glyph data (needed for binary encoding)
	// This applies to ALL fonts, not just those with a textureId
	if (options.readFileRaw && options.basePath) {
		const fontName = resolveFontFileName(fontRes.getName());
		const fontPath = fontRes.getPath() ?? '/';
		const pkgName = pkg.getName();
		const fntFile = `${options.basePath}/${pkgName}${fontPath}${fontName}`;
		try {
			const fntData = await options.readFileRaw(fntFile);
			const fntText = new TextDecoder().decode(fntData);
			const fntParsed = _parseFnt(fntText);
			for (const glyph of fontRes.listGlyphs()) {
				fontRes.removeGlyph(glyph);
			}
			fontRes
				.setTtf(fntParsed.hasFace)
				.setTint(fntParsed.colored)
				.setAutoScale(fntParsed.resizable)
				.setHasChannel(fntParsed.hasChannel)
				.setFontSize(fntParsed.fontSize)
				.setXAdvance(fntParsed.xadvance)
				.setLineHeight(fntParsed.lineHeight);
			for (const item of fntParsed.glyphs) {
				const glyph = doc.createFontGlyph(`${fontRes.getId()}_${item.charId}`);
				glyph
					.setCharId(item.charId)
					.setChar(item.charId > 0 ? String.fromCodePoint(item.charId) : '')
					.setImg(item.img ?? '')
					.setX(item.x)
					.setY(item.y)
					.setXOffset(item.xoffset)
					.setYOffset(item.yoffset)
					.setWidth(item.width)
					.setHeight(item.height)
					.setAdvance(item.xadvance)
					.setLineHeight(fntParsed.lineHeight)
					.setChannel(item.channel);
				fontRes.addGlyph(glyph);
			}
		} catch {
			/* .fnt not found */
		}
	}
}

/** Parse a BMFont .fnt text file into structured data for binary encoding. */
function _parseFnt(text: string): {
	hasFace: boolean;
	colored: boolean;
	resizable: boolean;
	hasChannel: boolean;
	fontSize: number;
	xadvance: number;
	lineHeight: number;
	glyphs: Array<{
		charId: number;
		img: string | null;
		x: number;
		y: number;
		xoffset: number;
		yoffset: number;
		width: number;
		height: number;
		xadvance: number;
		channel: number;
	}>;
} {
	const lines = text.split(/\r?\n/);
	let hasFace = false,
		colored = false,
		resizable = false,
		hasChannel = false;
	let fontSize = 0,
		globalXadvance = 0,
		lineHeight = 0;
	const glyphs: Array<{
		charId: number;
		img: string | null;
		x: number;
		y: number;
		xoffset: number;
		yoffset: number;
		width: number;
		height: number;
		xadvance: number;
		channel: number;
	}> = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const parts = trimmed.split(/\s+/);
		const attrs: Record<string, string> = {};
		for (let i = 1; i < parts.length; i++) {
			const eq = parts[i].split('=');
			if (eq.length === 2) attrs[eq[0]] = eq[1];
		}

		switch (parts[0]) {
			case 'info':
				hasFace = attrs.face != null;
				colored = hasFace;
				if (attrs.colored !== undefined) colored = attrs.colored === 'true';
				fontSize = parseInt(attrs.size, 10) || 0;
				resizable = attrs.resizable === 'true';
				break;
			case 'common':
				lineHeight = parseInt(attrs.lineHeight, 10) || 0;
				globalXadvance = parseInt(attrs.xadvance, 10) || 0;
				if (fontSize === 0) fontSize = lineHeight;
				else if (lineHeight === 0) lineHeight = fontSize;
				break;
			case 'char': {
				const charId = parseInt(attrs.id, 10) || 0;
				if (charId === 0) continue;
				const img = attrs.img || null;
				if (!hasFace && !img) continue;
				const chnl = parseInt(attrs.chnl, 10) || 0;
				if (chnl !== 0 && chnl !== 15) hasChannel = true;
				glyphs.push({
					charId,
					img,
					x: parseInt(attrs.x, 10) || 0,
					y: parseInt(attrs.y, 10) || 0,
					xoffset: parseInt(attrs.xoffset, 10) || 0,
					yoffset: parseInt(attrs.yoffset, 10) || 0,
					width: parseInt(attrs.width, 10) || 0,
					height: parseInt(attrs.height, 10) || 0,
					xadvance: parseInt(attrs.xadvance, 10) || 0,
					channel: chnl,
				});
				break;
			}
		}
	}

	return {
		hasFace,
		colored,
		resizable: fontSize > 0 ? resizable : false,
		hasChannel,
		fontSize,
		xadvance: globalXadvance,
		lineHeight,
		glyphs,
	};
}

function isComponentResource(resource: PackageResource): resource is Component {
	return resource.propertyType === 'Component';
}

function isImageResource(resource: PackageResource): resource is ImageResource {
	return resource.propertyType === 'ImageResource';
}

function isMovieClipResource(resource: PackageResource): resource is MovieClipResource {
	return resource.propertyType === 'MovieClipResource';
}

function isSkeletonResource(resource: PackageResource): resource is SpineResource | DragonBonesResource {
	return resource.propertyType === 'SpineResource' || resource.propertyType === 'DragonBonesResource';
}

function isFontResource(resource: PackageResource): resource is FontResource {
	return resource.propertyType === 'FontResource';
}

function isPackableResource(resource: PackageResource): resource is PackableResource {
	return isImageResource(resource) || isMovieClipResource(resource) || isFontResource(resource);
}

function addUiResourceRef(target: Set<string>, value: string | undefined | null): void {
	if (!value?.startsWith('ui://')) return;
	const refId = value.slice(5).slice(8);
	if (refId) target.add(refId);
}

function addUiResourceRefsFromText(target: Set<string>, value: string | undefined | null): void {
	if (!value || typeof value !== 'string') return;
	const matches = value.matchAll(/ui:\/\/[0-9a-z]{8}([0-9a-z]+)/gi);
	for (const match of matches) {
		const refId = match[1] ?? '';
		if (refId) target.add(refId);
	}
}

function addUiResourceRefsFromUnknown(target: Set<string>, value: unknown): void {
	if (Array.isArray(value)) {
		for (const entry of value) addUiResourceRefsFromUnknown(target, entry);
		return;
	}
	if (typeof value === 'string') {
		addUiResourceRef(target, value);
		addUiResourceRefsFromText(target, value);
	}
}

function isResolvedBuffer(value: Uint8Array | AtlasRasterResolvedBuffer): value is AtlasRasterResolvedBuffer {
	return typeof value === 'object' && value !== null && 'data' in value && 'info' in value;
}
