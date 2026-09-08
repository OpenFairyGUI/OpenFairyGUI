import type { Document, Package, Sprite, ImageResource, FontResource, MovieClipResource } from '@openfairygui/core';
import type { RestoreFileSystem, RestoreExecutionOptions } from '../restore.js';
import { isSyntheticFontGlyphImage, serializeFont } from './font.js';
import { serializeMovieClip } from './movie-clip.js';
import {
	resourceFileName,
	resourcePublishedFileName,
	imageFileName,
	sourceFileCandidates,
	resolveSourceFile,
	resourceOutputPath,
} from './resource-paths.js';

interface SpriteLookupEntry {
	sourceAtlas: string;
	sprite: Sprite;
}

const TRANSPARENT_PNG_1X1 = Uint8Array.from([
	137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196,
	137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 96, 0, 0, 0, 2, 0, 1, 229, 39, 212, 138, 0, 0, 0, 0, 73, 69, 78, 68,
	174, 66, 96, 130,
]);

function findImageResource(pkg: Package, itemId: string): ImageResource | null {
	return pkg.listImageResources().find((resource) => resource.getId() === itemId) ?? null;
}

export async function restoreAssets(
	fs: RestoreFileSystem,
	doc: Document,
	options: RestoreExecutionOptions,
	warnings: string[],
): Promise<void> {
	for (const pkg of doc.getRoot().listPackages()) {
		await restoreAtlasImages(fs, pkg, options);
		await writeGeneratedResources(fs, pkg, options, warnings);
		await copyLooseResources(fs, pkg, options, warnings);
	}
}

async function restoreAtlasImages(
	fs: RestoreFileSystem,
	pkg: Package,
	options: RestoreExecutionOptions,
): Promise<void> {
	if (!options.cropImage) return;
	for (const atlas of pkg.listAtlases()) {
		const sourceAtlas = await resolveSourceFile(fs, options.sourceDir, sourceFileCandidates(pkg, atlas.getFile()));
		if (!sourceAtlas) {
			throw new Error(
				`Atlas image not found for package "${pkg.getName()}": ${sourceFileCandidates(pkg, atlas.getFile()).join(', ')}`,
			);
		}
		for (const sprite of atlas.listSprites()) {
			const image = findImageResource(pkg, sprite.getItemId());
			if (!image) continue;
			if (sprite.getRectWidth() <= 0 || sprite.getRectHeight() <= 0) continue;
			const outputPath = resourceOutputPath(fs, options.outputProjectPath, pkg, image, imageFileName(image));
			const imageWidth = image.getWidth() ?? 0;
			const imageHeight = image.getHeight() ?? 0;
			const spriteWidth = sprite.getRotated() ? sprite.getRectHeight() : sprite.getRectWidth();
			const spriteHeight = sprite.getRotated() ? sprite.getRectWidth() : sprite.getRectHeight();
			await fs.mkdir(fs.dirname(outputPath));
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

async function copyLooseResources(
	fs: RestoreFileSystem,
	pkg: Package,
	options: RestoreExecutionOptions,
	warnings: string[],
): Promise<void> {
	for (const resource of pkg.listResources()) {
		const restoreAsLooseImage = resource.getExtras()?._restoreAsLooseImage === true;
		if (
			!['SoundResource', 'MiscResource', 'SpineResource', 'DragonBonesResource'].includes(
				resource.propertyType,
			) &&
			!restoreAsLooseImage
		) {
			continue;
		}
		const fileName = resourceFileName(resource);
		if (!fileName) continue;
		const sourcePath = await resolveSourceFile(
			fs,
			options.sourceDir,
			sourceFileCandidates(pkg, resourcePublishedFileName(resource), fileName),
		);
		if (!sourcePath) {
			warnings.push(`Loose resource not found for package "${pkg.getName()}": ${fileName}`);
			continue;
		}
		const outputPath = resourceOutputPath(fs, options.outputProjectPath, pkg, resource, fileName);
		await fs.mkdir(fs.dirname(outputPath));
		await fs.writeFileRaw(outputPath, await fs.readFileRaw(sourcePath));
	}
}

async function writeGeneratedResources(
	fs: RestoreFileSystem,
	pkg: Package,
	options: RestoreExecutionOptions,
	warnings: string[],
): Promise<void> {
	for (const resource of pkg.listResources()) {
		if (resource.propertyType === 'FontResource') {
			await writeFontFile(fs, pkg, resource, options.outputProjectPath);
		} else if (resource.propertyType === 'MovieClipResource') {
			await writeMovieClipFile(fs, pkg, resource, options, warnings);
		}
	}
	await writeSyntheticFontGlyphImages(fs, pkg, options.outputProjectPath);
}

async function writeFontFile(
	fs: RestoreFileSystem,
	pkg: Package,
	resource: FontResource,
	outputProjectPath: string,
): Promise<void> {
	const fileName = resourceFileName(resource);
	if (!/\.fnt$/i.test(fileName)) return;
	const glyphs = resource.listGlyphs() ?? [];
	if (glyphs.length === 0) return;

	const outputPath = resourceOutputPath(fs, outputProjectPath, pkg, resource, fileName);
	await fs.mkdir(fs.dirname(outputPath));
	await fs.writeFile(outputPath, serializeFont(pkg, resource, glyphs));
}

async function writeMovieClipFile(
	fs: RestoreFileSystem,
	pkg: Package,
	resource: MovieClipResource,
	options: RestoreExecutionOptions,
	warnings: string[],
): Promise<void> {
	const fileName = resourceFileName(resource);
	if (!/\.jta$/i.test(fileName)) return;
	const frames = resource.listFrames() ?? [];
	if (frames.length === 0) return;
	if (!options.extractImage) {
		warnings.push(`MovieClip file not generated for package "${pkg.getName()}": ${fileName}`);
		return;
	}

	const sprites = await buildSpriteLookup(fs, pkg, options);
	const textures: Uint8Array[] = [];
	for (const [index, frame] of frames.entries()) {
		const spriteEntry = sprites.get(frame.getSpriteId());
		if (!spriteEntry) {
			warnings.push(
				`MovieClip frame sprite not found for package "${pkg.getName()}": ${fileName} frame ${index}`,
			);
			return;
		}
		const sprite = spriteEntry.sprite;
		if (sprite.getRectWidth() <= 0 || sprite.getRectHeight() <= 0) {
			textures.push(new Uint8Array(0));
			continue;
		}
		textures.push(
			await options.extractImage({
				sourcePath: spriteEntry.sourceAtlas,
				left: sprite.getRectX(),
				top: sprite.getRectY(),
				width: sprite.getRectWidth(),
				height: sprite.getRectHeight(),
				rotated: sprite.getRotated(),
				offsetX: 0,
				offsetY: 0,
				expectedWidth: sprite.getRotated() ? sprite.getRectHeight() : sprite.getRectWidth(),
				expectedHeight: sprite.getRotated() ? sprite.getRectWidth() : sprite.getRectHeight(),
			}),
		);
	}

	const outputPath = resourceOutputPath(fs, options.outputProjectPath, pkg, resource, fileName);
	await fs.mkdir(fs.dirname(outputPath));
	await fs.writeFileRaw(outputPath, serializeMovieClip(resource, frames, textures));
}

async function writeSyntheticFontGlyphImages(
	fs: RestoreFileSystem,
	pkg: Package,
	outputProjectPath: string,
): Promise<void> {
	for (const resource of pkg.listResources()) {
		if (resource.propertyType !== 'ImageResource' || !isSyntheticFontGlyphImage(resource)) continue;
		const fileName = resourceFileName(resource) || `${resource.getId() ?? 'glyph'}.png`;
		const outputPath = resourceOutputPath(fs, outputProjectPath, pkg, resource, fileName);
		await fs.mkdir(fs.dirname(outputPath));
		await fs.writeFileRaw(outputPath, TRANSPARENT_PNG_1X1);
	}
}

async function buildSpriteLookup(
	fs: RestoreFileSystem,
	pkg: Package,
	options: RestoreExecutionOptions,
): Promise<Map<string, SpriteLookupEntry>> {
	const sprites = new Map<string, SpriteLookupEntry>();
	for (const atlas of pkg.listAtlases()) {
		const sourceAtlas = await resolveSourceFile(fs, options.sourceDir, sourceFileCandidates(pkg, atlas.getFile()));
		if (!sourceAtlas) {
			throw new Error(
				`Atlas image not found for package "${pkg.getName()}": ${sourceFileCandidates(pkg, atlas.getFile()).join(', ')}`,
			);
		}
		for (const sprite of atlas.listSprites()) {
			sprites.set(sprite.getItemId(), { sourceAtlas, sprite });
		}
	}
	return sprites;
}
