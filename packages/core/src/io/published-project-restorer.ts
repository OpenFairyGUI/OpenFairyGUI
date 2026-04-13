import { ProjectType } from '../constants.js';
import type { Document } from '../document.js';
import type { Package } from '../properties/package.js';
import { generateId } from '../utils/id-utils.js';
import { BinaryReader } from './binary-reader.js';
import { ProjectWriter } from './project-writer.js';
import type { FileSystem } from './project-reader.js';

export interface RestoreImageCropInput {
	sourcePath: string;
	outputPath: string;
	left: number;
	top: number;
	width: number;
	height: number;
	rotated: boolean;
	offsetX: number;
	offsetY: number;
	expectedWidth: number;
	expectedHeight: number;
}

export type RestoreImageCropper = (input: RestoreImageCropInput) => Promise<void>;

export interface RestorePublishedProjectOptions {
	binaryPaths: string[];
	sourceDir: string;
	outputProjectPath: string;
	cropImage?: RestoreImageCropper;
}

export interface RestorePublishedProjectResult {
	document: Document;
	projectPath: string;
	warnings: string[];
}

type RestorableResource = ReturnType<Package['listResources']>[number] & {
	getBranch?(): string;
	getExtras?(): Record<string, unknown>;
	getFile?(): string;
	getFileName?(): string;
	getId?(): string;
	getPath?(): string;
	getRenderMode?(): string;
	getSamplePointSize?(): number;
	setAtlasNames?(names: string[]): unknown;
	setFile?(file: string): unknown;
	getWidth?(): number;
	getHeight?(): number;
	setRenderMode?(renderMode: string): unknown;
	setRequireIds?(ids: string[]): unknown;
	setSamplePointSize?(size: number): unknown;
	setFileName?(fileName: string): unknown;
};

interface RestorableSprite {
	getItemId(): string;
	getRectX(): number;
	getRectY(): number;
	getRectWidth(): number;
	getRectHeight(): number;
	getRotated(): boolean;
	getOffsetX(): number;
	getOffsetY(): number;
	getOriginalWidth(): number;
	getOriginalHeight(): number;
}

function normalizeVirtualPath(path: string | undefined): string {
	const normalized = (path ?? '').replace(/\\/g, '/').trim();
	if (!normalized || normalized === '/') return '';
	return normalized.replace(/^\/+/, '').replace(/\/+$/, '');
}

function resourceFileName(resource: RestorableResource): string {
	return resource.getFileName?.() || resource.getFile?.() || resource.getName?.() || '';
}

function resourcePublishedFileName(resource: RestorableResource): string {
	const extras = resource.getExtras?.() ?? {};
	const publishedFile = extras._publishedFile;
	return typeof publishedFile === 'string' ? publishedFile : resourceFileName(resource);
}

function normalizePublishedLooseResourceFileName(resource: RestorableResource, fileName: string): string {
	if (resource.propertyType === 'MiscResource' && /\.atlas\.txt$/i.test(fileName)) {
		return fileName.replace(/\.atlas\.txt$/i, '.atlas');
	}
	if (resource.propertyType === 'SpineResource' && /\.skel\.bytes$/i.test(fileName)) {
		return fileName.replace(/\.skel\.bytes$/i, '.skel');
	}
	return fileName;
}

function fileBaseName(fileName: string): string {
	return fileName.split(/[\\/]/).pop() ?? fileName;
}

function stripExtension(fileName: string): string {
	return fileBaseName(fileName).replace(/\.[^.]+$/u, '');
}

function sameVirtualPath(a: RestorableResource, b: RestorableResource): boolean {
	return normalizeVirtualPath(a.getPath?.()) === normalizeVirtualPath(b.getPath?.());
}

function imageFileName(resource: RestorableResource): string {
	const current = resource.getFileName?.() ?? '';
	if (current) return current;
	const name = resource.getName?.() ?? resource.getId?.() ?? 'image';
	const fileName = /\.[a-z0-9]+$/i.test(name) ? name : `${name}.png`;
	resource.setFileName?.(fileName);
	return fileName;
}

function findImageResource(pkg: Package, itemId: string): RestorableResource | null {
	return (pkg.listResources() as RestorableResource[]).find((resource) => {
		return resource.propertyType === 'ImageResource' && resource.getId?.() === itemId;
	}) ?? null;
}

export class PublishedProjectRestorer {
	private readonly _fs: FileSystem;

	constructor(fs: FileSystem) {
		this._fs = fs;
	}

	async restore(options: RestorePublishedProjectOptions): Promise<RestorePublishedProjectResult> {
		const warnings: string[] = [];
		const reader = new BinaryReader(this._fs);
		const doc = await reader.readMany(options.binaryPaths);
		this._initializeProjectDefaults(doc);
		this._initializeImageFileNames(doc);
		this._initializeLooseResourceFileNames(doc);
		this._initializeRestoredResourceRelations(doc);
		this._initializePublishedFontDefaults(doc);

		const writer = new ProjectWriter(this._fs);
		await writer.write(doc, options.outputProjectPath);
		await this._restoreAssets(doc, options, warnings);

		return {
			document: doc,
			projectPath: options.outputProjectPath,
			warnings,
		};
	}

	private _initializeProjectDefaults(doc: Document): void {
		doc.getRoot()
			.setProjectId(generateId())
			.setProjectType(ProjectType.Unity)
			.setVersion('3.0')
			.setSettings({
				publish: {
					binaryFormat: true,
					fileExtension: 'bytes',
					compressDesc: false,
				},
				common: {},
				adaptation: {},
			});
	}

	private _initializeImageFileNames(doc: Document): void {
		for (const pkg of doc.getRoot().listPackages()) {
			for (const resource of pkg.listResources() as RestorableResource[]) {
				if (resource.propertyType === 'ImageResource') imageFileName(resource);
			}
		}
	}

	private _initializeLooseResourceFileNames(doc: Document): void {
		for (const pkg of doc.getRoot().listPackages()) {
			for (const resource of pkg.listResources() as RestorableResource[]) {
				if (!['MiscResource', 'SpineResource', 'DragonBonesResource'].includes(resource.propertyType)) continue;
				const current = resource.getFile?.() ?? '';
				if (!current) continue;
				const normalized = normalizePublishedLooseResourceFileName(resource, current);
				if (normalized !== current) resource.setFile?.(normalized);
			}
		}
	}

	private _initializeRestoredResourceRelations(doc: Document): void {
		for (const pkg of doc.getRoot().listPackages()) {
			const resources = pkg.listResources() as RestorableResource[];
			for (const resource of resources) {
				if (resource.propertyType === 'SpineResource') {
					this._initializeSpineResourceRelation(resource, resources);
				} else if (resource.propertyType === 'DragonBonesResource') {
					this._initializeDragonBonesResourceRelation(resource, resources);
				}
			}
		}
	}

	private _initializeSpineResourceRelation(resource: RestorableResource, resources: RestorableResource[]): void {
		const fileName = resourceFileName(resource);
		const skeletonBase = stripExtension(fileName);
		if (!skeletonBase) return;
		const atlasBase = skeletonBase.replace(/-(?:pro|ess)$/i, '-pma');
		const requireIds: string[] = [];

		const atlas = this._findResourceByFile(resources, resource, 'MiscResource', `${atlasBase}.atlas`);
		const texture = this._findResourceByFile(resources, resource, 'ImageResource', `${atlasBase}.png`);
		if (atlas?.getId?.()) requireIds.push(atlas.getId());
		if (texture?.getId?.()) requireIds.push(texture.getId());
		if (requireIds.length > 0) resource.setRequireIds?.(requireIds);
		if (atlas) resource.setAtlasNames?.([atlasBase]);
	}

	private _initializeDragonBonesResourceRelation(resource: RestorableResource, resources: RestorableResource[]): void {
		const fileName = resourceFileName(resource);
		const skeletonBase = stripExtension(fileName).replace(/_ske$/i, '');
		if (!skeletonBase) return;
		const requireIds: string[] = [];

		const textureJson = this._findResourceByFile(resources, resource, 'MiscResource', `${skeletonBase}_tex.json`);
		const textureImage = this._findResourceByFile(resources, resource, 'ImageResource', `${skeletonBase}.png`);
		if (textureJson?.getId?.()) requireIds.push(textureJson.getId());
		if (textureImage?.getId?.()) requireIds.push(textureImage.getId());
		if (requireIds.length > 0) resource.setRequireIds?.(requireIds);
	}

	private _findResourceByFile(
		resources: RestorableResource[],
		owner: RestorableResource,
		propertyType: string,
		fileName: string,
	): RestorableResource | null {
		const expected = fileName.toLowerCase();
		return resources.find((resource) => {
			return resource.propertyType === propertyType
				&& sameVirtualPath(owner, resource)
				&& fileBaseName(resourceFileName(resource)).toLowerCase() === expected;
		}) ?? null;
	}

	private _initializePublishedFontDefaults(doc: Document): void {
		for (const pkg of doc.getRoot().listPackages()) {
			for (const resource of pkg.listResources() as RestorableResource[]) {
				if (resource.propertyType !== 'FontResource') continue;
				const fileName = resourceFileName(resource);
				if (!/\bsdf\b/i.test(fileName)) continue;
				if (!resource.getRenderMode?.()) resource.setRenderMode?.('sdfaa');
				if (!resource.getSamplePointSize?.()) resource.setSamplePointSize?.(60);
			}
		}
	}

	private async _restoreAssets(
		doc: Document,
		options: RestorePublishedProjectOptions,
		warnings: string[],
	): Promise<void> {
		for (const pkg of doc.getRoot().listPackages()) {
			await this._restoreAtlasImages(pkg, options);
			await this._copyLooseResources(pkg, options, warnings);
		}
	}

	private async _restoreAtlasImages(pkg: Package, options: RestorePublishedProjectOptions): Promise<void> {
		if (!options.cropImage) return;
		for (const atlas of pkg.listAtlases()) {
			const sourceAtlas = await this._resolveSourceFile(options.sourceDir, this._sourceFileCandidates(pkg, atlas.getFile()));
			if (!sourceAtlas) {
				throw new Error(`Atlas image not found for package "${pkg.getName()}": ${this._sourceFileCandidates(pkg, atlas.getFile()).join(', ')}`);
			}
			for (const sprite of atlas.listSprites() as RestorableSprite[]) {
				const image = findImageResource(pkg, sprite.getItemId());
				if (!image) continue;
				if (sprite.getRectWidth() <= 0 || sprite.getRectHeight() <= 0) continue;
				const outputPath = this._resourceOutputPath(options.outputProjectPath, pkg, image, imageFileName(image));
				const imageWidth = image.getWidth?.() ?? 0;
				const imageHeight = image.getHeight?.() ?? 0;
				const spriteWidth = sprite.getRotated() ? sprite.getRectHeight() : sprite.getRectWidth();
				const spriteHeight = sprite.getRotated() ? sprite.getRectWidth() : sprite.getRectHeight();
				await this._mkdirForFile(outputPath);
				await options.cropImage({
					sourcePath: sourceAtlas,
					outputPath,
					left: sprite.getRectX(),
					top: sprite.getRectY(),
					width: sprite.getRectWidth(),
					height: sprite.getRectHeight(),
					rotated: sprite.getRotated(),
					offsetX: sprite.getOffsetX(),
					offsetY: sprite.getOffsetY(),
					expectedWidth: Math.max(imageWidth, sprite.getOriginalWidth(), spriteWidth),
					expectedHeight: Math.max(imageHeight, sprite.getOriginalHeight(), spriteHeight),
				});
			}
		}
	}

	private async _copyLooseResources(
		pkg: Package,
		options: RestorePublishedProjectOptions,
		warnings: string[],
	): Promise<void> {
		for (const resource of pkg.listResources() as RestorableResource[]) {
			if (!['SoundResource', 'MiscResource', 'SpineResource', 'DragonBonesResource'].includes(resource.propertyType)) {
				continue;
			}
			const fileName = resourceFileName(resource);
			if (!fileName) continue;
			const sourcePath = await this._resolveSourceFile(
				options.sourceDir,
				this._sourceFileCandidates(pkg, resourcePublishedFileName(resource), fileName),
			);
			if (!sourcePath) {
				warnings.push(`Loose resource not found for package "${pkg.getName()}": ${fileName}`);
				continue;
			}
			const outputPath = this._resourceOutputPath(options.outputProjectPath, pkg, resource, fileName);
			await this._mkdirForFile(outputPath);
			await this._fs.writeFileRaw(outputPath, await this._fs.readFileRaw(sourcePath));
		}
	}

	private _sourceFileCandidates(pkg: Package, fileName: string, outputFileName = fileName): string[] {
		const publishName = pkg.getPublishName() || pkg.getName();
		return Array.from(new Set([
			`${publishName}_${fileName}`,
			fileName,
			`${publishName}_${outputFileName}`,
			outputFileName,
		]));
	}

	private async _resolveSourceFile(sourceDir: string, candidates: string[]): Promise<string | null> {
		for (const candidate of candidates) {
			const sourcePath = this._fs.join(sourceDir, candidate);
			if (await this._fs.exists(sourcePath)) return sourcePath;
		}
		return null;
	}

	private _resourceOutputPath(
		outputProjectPath: string,
		pkg: Package,
		resource: RestorableResource,
		fileName: string,
	): string {
		const basePath = this._fs.dirname(outputProjectPath);
		const branch = resource.getBranch?.() ?? '';
		const assetsDir = branch ? `assets_${branch}` : 'assets';
		const virtualPath = normalizeVirtualPath(resource.getPath?.());
		const pkgDir = this._fs.join(basePath, assetsDir, pkg.getName());
		return virtualPath
			? this._fs.join(pkgDir, virtualPath, fileName)
			: this._fs.join(pkgDir, fileName);
	}

	private async _mkdirForFile(filePath: string): Promise<void> {
		await this._fs.mkdir(this._fs.dirname(filePath));
	}
}
