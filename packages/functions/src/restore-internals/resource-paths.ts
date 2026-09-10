import type { Document, Package, ImageResource } from '@openfairygui/core';
import { normalizeRestoreResourcePath } from '../path-utils.js';
import type { RestoreFileSystem } from '../restore.js';
import { isPathWithin } from './output-transaction.js';

export type RestoreResource = ReturnType<Package['listResources']>[number];

export function assertSafeRestoreSegment(value: string, label: string): void {
	if (!value || value === '.' || value === '..' || value.includes('\0') || /[\\/:]/u.test(value)) {
		throw new Error(`restore: Invalid ${label} "${value}".`);
	}
}

export function resourceFileName(resource: RestoreResource): string {
	const file = 'getFileName' in resource ? resource.getFileName() : 'getFile' in resource ? resource.getFile() : '';
	return file || resource.getName();
}

export function resourcePublishedFileName(resource: RestoreResource): string {
	const extras = resource.getExtras() ?? {};
	const publishedFile = extras._publishedFile;
	return typeof publishedFile === 'string' ? publishedFile : resourceFileName(resource);
}

function normalizePublishedLooseResourceFileName(resource: RestoreResource, fileName: string): string {
	if (resource.propertyType === 'MiscResource' && /\.atlas\.txt$/i.test(fileName)) {
		return fileName.replace(/\.atlas\.txt$/i, '.atlas');
	}
	if (resource.propertyType === 'SpineResource' && /\.skel\.bytes$/i.test(fileName)) {
		return fileName.replace(/\.skel\.bytes$/i, '.skel');
	}
	return fileName;
}

export function replaceLooseResourceBaseName(resource: RestoreResource, fileName: string): string {
	const normalized = normalizePublishedLooseResourceFileName(resource, fileName);
	const displayName = resource.getName() ?? '';
	if (!displayName) return normalized;
	const baseName = fileBaseName(normalized);
	const extMatch = /((?:\.[^.\\/]+)+)$/u.exec(baseName);
	const ext = extMatch?.[1] ?? '';
	const currentBaseName = ext ? baseName.slice(0, -ext.length) : baseName;
	const resourceId = resource.getId() ?? '';
	if (!resourceId || currentBaseName.toLowerCase() !== resourceId.toLowerCase()) return normalized;
	const dir = normalized.slice(0, normalized.length - baseName.length);
	return `${dir}${displayName}${ext}`;
}

export function fileBaseName(fileName: string): string {
	return fileName.split(/[\\/]/).pop() ?? fileName;
}

export function stripExtension(fileName: string): string {
	return fileBaseName(fileName).replace(/\.[^.]+$/u, '');
}

export function resourceInstanceFileName(resource: RestoreResource): string {
	const rawFileName =
		resource.propertyType === 'Component'
			? `${resource.getName() ?? resource.getId() ?? 'component'}.xml`
			: resourceFileName(resource);
	const fileName = rawFileName.replace(/\\/g, '/').replace(/^\/+/, '');
	if (!fileName) return '';
	if (fileName.includes('/')) return fileName;
	const virtualPath = normalizeRestoreResourcePath(resource.getPath());
	return virtualPath ? `${virtualPath}/${fileName}` : fileName;
}

export function sameVirtualPath(a: RestoreResource, b: RestoreResource): boolean {
	return normalizeRestoreResourcePath(a.getPath()) === normalizeRestoreResourcePath(b.getPath());
}

export function imageFileName(resource: ImageResource): string {
	const current = resource.getFileName() ?? '';
	if (current) return current;
	const name = resource.getName() ?? resource.getId() ?? 'image';
	const fileName = /\.[a-z0-9]+$/i.test(name) ? name : `${name}.png`;
	resource.setFileName(fileName);
	return fileName;
}

export function assertDocumentPaths(doc: Document): void {
	for (const pkg of doc.getRoot().listPackages()) {
		assertSafeRestoreSegment(pkg.getName(), 'package name');
		assertSafeRestoreSegment(pkg.getPublishName() || pkg.getName(), 'package publish name');
		for (const resource of pkg.listResources()) {
			normalizeRestoreResourcePath(resource.getPath());
			const branch = resource.getBranch() ?? '';
			if (branch) assertSafeRestoreSegment(branch, 'branch name');
			const fileName = resourceFileName(resource);
			if (fileName) assertSafeRestoreSegment(fileName, 'resource file name');
			const publishedFileName = resourcePublishedFileName(resource);
			if (publishedFileName) assertSafeRestoreSegment(publishedFileName, 'published resource file name');
		}
	}
}

export function sourceFileCandidates(pkg: Package, fileName: string, outputFileName = fileName): string[] {
	const publishName = pkg.getPublishName() || pkg.getName();
	assertSafeRestoreSegment(publishName, 'package publish name');
	assertSafeRestoreSegment(fileName, 'published source file name');
	assertSafeRestoreSegment(outputFileName, 'published source file name');
	const candidates = Array.from(
		new Set([`${publishName}_${fileName}`, fileName, `${publishName}_${outputFileName}`, outputFileName]),
	);
	for (const candidate of candidates) assertSafeRestoreSegment(candidate, 'published source file name');
	return candidates;
}

export async function resolveLooseSourceFile(
	fs: RestoreFileSystem,
	pkg: Package,
	sourceDir: string,
	outputFileName: string,
): Promise<string | null> {
	const candidates = outputFileName.endsWith('.atlas')
		? sourceFileCandidates(pkg, `${outputFileName}.txt`, outputFileName)
		: outputFileName.endsWith('.skel')
			? sourceFileCandidates(pkg, `${outputFileName}.bytes`, outputFileName)
			: sourceFileCandidates(pkg, outputFileName);
	return resolveSourceFile(fs, sourceDir, candidates);
}

export async function resolveSourceFile(
	fs: RestoreFileSystem,
	sourceDir: string,
	candidates: string[],
): Promise<string | null> {
	const resolvedSourceDir = await Promise.resolve(fs.resolvePath(sourceDir));
	for (const candidate of candidates) {
		assertSafeRestoreSegment(candidate, 'published source file name');
		const sourcePath = fs.join(sourceDir, candidate);
		if (!(await fs.isFile(sourcePath))) continue;
		const resolvedSourcePath = await Promise.resolve(fs.resolvePath(sourcePath));
		if (!isPathWithin(resolvedSourceDir, resolvedSourcePath)) {
			throw new Error(`restore: Published source file resolves outside the input directory: ${candidate}.`);
		}
		return resolvedSourcePath;
	}
	return null;
}

export function resourceOutputPath(
	fs: RestoreFileSystem,
	outputProjectPath: string,
	pkg: Package,
	resource: RestoreResource,
	fileName: string,
): string {
	const basePath = fs.dirname(outputProjectPath);
	const branch = resource.getBranch() ?? '';
	assertSafeRestoreSegment(pkg.getName(), 'package name');
	if (branch) assertSafeRestoreSegment(branch, 'branch name');
	assertSafeRestoreSegment(fileName, 'resource file name');
	const assetsDir = branch ? `assets_${branch}` : 'assets';
	const virtualPath = normalizeRestoreResourcePath(resource.getPath());
	const pkgDir = fs.join(basePath, assetsDir, pkg.getName());
	return virtualPath ? fs.join(pkgDir, virtualPath, fileName) : fs.join(pkgDir, fileName);
}
