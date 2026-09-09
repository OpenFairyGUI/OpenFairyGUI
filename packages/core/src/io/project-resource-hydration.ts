import type { Document } from '../document.js';
import type { Package } from '../properties/package.js';
import { probeRasterImageDimensions } from '../utils/image-info.js';
import { applyDerivedMovieClipModel, deriveMovieClipModelFromJta } from '../utils/jta-parser.js';
import type { FileSystem } from './file-system.js';
import type { ReaderContext } from './reader-context.js';

export async function hydratePackageImageSizes(
	fs: FileSystem,
	resources: Array<ReturnType<Package['listResources']>[number]>,
	packageDir: string,
): Promise<void> {
	for (const resource of resources) {
		if (resource.propertyType !== 'ImageResource') continue;
		const image = resource as ReturnType<Document['createImageResource']>;
		if ((image.getWidth?.() ?? 0) > 0 && (image.getHeight?.() ?? 0) > 0) continue;
		const fileName = image.getFileName?.() ?? '';
		if (!fileName) continue;
		const resourcePath = image.getPath?.() ?? '/';
		const sourcePath = _packageRelativeSourcePath(resourcePath, fileName);
		if (!sourcePath) continue;
		const filePath = fs.join(packageDir, sourcePath.replace(/^\/+/, ''));
		if (!(await fs.exists(filePath))) continue;
		try {
			const size = probeRasterImageDimensions(await fs.readFileRaw(filePath));
			if (!size) continue;
			if ((image.getWidth?.() ?? 0) === 0) image.setWidth?.(size.width);
			if ((image.getHeight?.() ?? 0) === 0) image.setHeight?.(size.height);
		} catch {
			// Ignore unreadable image files and keep XML-provided values only.
		}
	}
}

export async function hydratePackageResourceBytes(
	fs: FileSystem,
	ctx: ReaderContext,
	resources: Array<ReturnType<Package['listResources']>[number]>,
	packageDir: string,
	packageId: string,
): Promise<void> {
	const doc = ctx.document;
	for (const resource of resources) {
		const fileName = _primaryResourceFileName(resource);
		if (!fileName) continue;
		const resourcePath = (resource as { getPath?(): string }).getPath?.() ?? '/';
		const sourcePath = _packageRelativeSourcePath(resourcePath, fileName);
		if (!sourcePath) continue;
		const filePath = fs.join(packageDir, sourcePath.replace(/^\/+/, ''));
		if (!(await fs.exists(filePath))) {
			ctx.addDiagnostic({
				severity: 'error',
				code: 'missing_source',
				path: `packages.${packageId}.resources.${resource.getId()}`,
				message: `Declared source file is missing: ${sourcePath}`,
				packageId,
				resourceId: resource.getId(),
				sourcePath: filePath,
			});
			continue;
		}
		try {
			const data = new Uint8Array(await fs.readFileRaw(filePath));
			const buffer = doc.createBuffer().setURI(sourcePath).setData(data);
			(_asSourceDataResource(resource)).setSourceData(buffer);
			if (resource.propertyType === 'ImageResource') {
				const size = probeRasterImageDimensions(data);
				if (size) {
					const image = resource as ReturnType<Document['createImageResource']>;
					image.setWidth(size.width).setHeight(size.height);
				}
			} else if (resource.propertyType === 'MovieClipResource') {
				try {
					applyDerivedMovieClipModel(
						doc,
						resource as ReturnType<Document['createMovieClipResource']>,
						deriveMovieClipModelFromJta(data),
					);
				} catch (error) {
					// Preserve source bytes and XML-owned fields when a legacy or corrupt JTA cannot be derived.
					ctx.addDiagnostic({
						severity: 'error',
						code: 'corrupt_source',
						path: `packages.${packageId}.resources.${resource.getId()}`,
						message: `MovieClip source is invalid: ${error instanceof Error ? error.message : String(error)}`,
						packageId,
						resourceId: resource.getId(),
						sourcePath: filePath,
					});
				}
			}
		} catch (error) {
			// Keep resource metadata available when its primary source cannot be read.
			ctx.addDiagnostic({
				severity: 'error',
				code: 'unreadable_source',
				path: `packages.${packageId}.resources.${resource.getId()}`,
				message: `Declared source file cannot be read: ${error instanceof Error ? error.message : String(error)}`,
				packageId,
				resourceId: resource.getId(),
				sourcePath: filePath,
			});
		}
	}
}

function _primaryResourceFileName(resource: ReturnType<Package['listResources']>[number]): string {
	switch (resource.propertyType) {
		case 'ImageResource':
		case 'FontResource':
		case 'MovieClipResource':
			return (resource as { getFileName(): string }).getFileName();
		case 'SoundResource':
		case 'MiscResource':
		case 'SwfResource':
		case 'SpineResource':
		case 'DragonBonesResource':
			return (resource as { getFile(): string }).getFile();
		default:
			return '';
	}
}

function _packageRelativeSourcePath(resourcePath: string, fileName: string): string | null {
	if (!fileName || /[\\/:]/.test(fileName) || fileName === '.' || fileName === '..') return null;
	const segments = resourcePath.replace(/\\/g, '/').split('/').filter(Boolean);
	if (segments.some((segment) => segment === '.' || segment === '..' || segment.includes(':'))) return null;
	return `/${[...segments, fileName].join('/')}`;
}

function _asSourceDataResource(resource: ReturnType<Package['listResources']>[number]): {
	setSourceData(buffer: ReturnType<Document['createBuffer']>): unknown;
} {
	return resource as unknown as {
		setSourceData(buffer: ReturnType<Document['createBuffer']>): unknown;
	};
}

