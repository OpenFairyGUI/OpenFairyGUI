import {
	type Component,
	type Document,
	GearType,
	type Package,
	type MovieClipResource,
	type Transform,
	TransitionActionType,
} from '@openfairygui/core';
import type { AtlasRasterBackend } from './publish/contracts.js';
import {
	isComponentResource,
	isFontResource,
	isImageResource,
	isMovieClipResource,
	isSkeletonResource,
} from './publish/package-context.js';
import { collectPackageResourceReferences } from './publish/resource-references.js';
import type { ExtrasMap, HasOptionalSrc, HasOptionalUrl } from './shared-types.js';
import { createTransform } from './utils.js';
import {
	collectFontTexture,
	collectImage,
	collectMovieClipFrames,
	isPackableResource,
	resolveFontFileName,
	type InputItem,
	type PackageResource,
} from './atlas/inputs.js';
import { emitAtlasInputs, sortResourcesByOrder } from './atlas/packing.js';
import type { PreparedJtaData } from './atlas/jta.js';

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
	 * Require a complete raster artifact when there are packable inputs.
	 * This is used by publish() so a runtime package cannot contain atlas
	 * references without the matching PNG output.
	 * @internal
	 */
	strictOutput?: boolean;

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
	 * MovieClip parse/decode results prepared by publish() before output begins.
	 * @internal
	 */
	preparedMovieClips?: ReadonlyMap<MovieClipResource, PreparedJtaData>;

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
	Omit<
		AtlasOptions,
		'packages' | 'encoder' | 'basePath' | 'outputPath' | 'mkdir' | 'readFileRaw' | 'preparedMovieClips'
	>
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
	strictOutput: false,
};

interface AtlasReferenceItem {
	icon?: string | null;
	selectedIcon?: string | null;
	url?: string | null;
	propertyOverrides?: Array<{ value: string }>;
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
	getPropertyOverrides?(): Array<{ value: string }>;
	listGears?(): GearWithAtlasRefs[];
}

interface PackageAtlasExtras extends ExtrasMap {
	publishedResourceIds?: string[];
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
				await addResourceByLocalUiUrl(item.selectedIcon ?? undefined);
				await addResourceByLocalUiUrl(item.url ?? undefined);
				for (const property of item.propertyOverrides ?? []) {
					await addResourceByLocalUiUrl(property.value);
				}
			}
			for (const property of refChild.getPropertyOverrides?.() ?? []) {
				await addResourceByLocalUiUrl(property.value);
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
			// Publish annotations select merged resources; only strict output treats an empty selection as explicit.
			const publishedResourceIds = (pkg.getExtras() as PackageAtlasExtras | undefined)?.publishedResourceIds;
			const selectedPublishIds = new Set(publishedResourceIds);
			const hasPublishSelection =
				publishedResourceIds !== undefined && (options.strictOutput || selectedPublishIds.size > 0);
			const allResources =
				hasPublishSelection
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
			const referencedIds = collectPackageResourceReferences(pkg).localResourceIds;
			for (const res of orderedAllResources) {
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
					await collectImage(res, pkg, inputs, encoder, options, doTrim, logger);
				} else if (isMovieClipResource(res)) {
					const resId = res.getId();
					if (
						selectedPublishIds.size === 0 &&
						!res.getExported() &&
						referencedIds.size > 0 &&
						!referencedIds.has(resId)
					)
						continue;
					await collectMovieClipFrames(doc, res, pkg, inputs, encoder, options, logger);
				} else if (isFontResource(res)) {
					const resId = res.getId();
					if (
						selectedPublishIds.size === 0 &&
						!res.getExported() &&
						referencedIds.size > 0 &&
						!referencedIds.has(resId)
					)
						continue;
					await collectFontTexture(doc, res, pkg, options);
				}
			}

			if (inputs.length === 0) continue;
			if (options.strictOutput && (!encoder || !options.basePath || !options.outputPath)) {
				throw new Error(
					`atlas: Package "${pkg.getName()}" requires encoder, basePath, and outputPath for complete raster output.`,
				);
			}
			await emitAtlasInputs({ doc, pkg, allResources, inputs, options, encoder, logger });
		}
	});
}
