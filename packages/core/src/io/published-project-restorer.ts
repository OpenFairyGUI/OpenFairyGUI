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
	getFile?(): string;
	getFileName?(): string;
	getId?(): string;
	getPath?(): string;
	getWidth?(): number;
	getHeight?(): number;
	setFileName?(fileName: string): unknown;
};

interface RestorableSprite {
	getItemId(): string;
	getRectX(): number;
	getRectY(): number;
	getRectWidth(): number;
	getRectHeight(): number;
	getRotated(): boolean;
}

function normalizeVirtualPath(path: string | undefined): string {
	const normalized = (path ?? '').replace(/\\/g, '/').trim();
	if (!normalized || normalized === '/') return '';
	return normalized.replace(/^\/+/, '').replace(/\/+$/, '');
}

function resourceFileName(resource: RestorableResource): string {
	return resource.getFileName?.() || resource.getFile?.() || resource.getName?.() || '';
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
				await this._mkdirForFile(outputPath);
				await options.cropImage({
					sourcePath: sourceAtlas,
					outputPath,
					left: sprite.getRectX(),
					top: sprite.getRectY(),
					width: sprite.getRectWidth(),
					height: sprite.getRectHeight(),
					rotated: sprite.getRotated(),
					expectedWidth: image.getWidth?.() ?? sprite.getRectWidth(),
					expectedHeight: image.getHeight?.() ?? sprite.getRectHeight(),
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
			const sourcePath = await this._resolveSourceFile(options.sourceDir, this._sourceFileCandidates(pkg, fileName));
			if (!sourcePath) {
				warnings.push(`Loose resource not found for package "${pkg.getName()}": ${fileName}`);
				continue;
			}
			const outputPath = this._resourceOutputPath(options.outputProjectPath, pkg, resource, fileName);
			await this._mkdirForFile(outputPath);
			await this._fs.writeFileRaw(outputPath, await this._fs.readFileRaw(sourcePath));
		}
	}

	private _sourceFileCandidates(pkg: Package, fileName: string): string[] {
		const publishName = pkg.getPublishName() || pkg.getName();
		return [`${publishName}_${fileName}`, fileName];
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
