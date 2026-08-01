import type { Document } from '../document.js';
import type { Component } from '../properties/component.js';
import type { Package, PackageResourceFolder } from '../properties/package.js';
import { resourceFolderName, resourceFolderParentPath } from '../utils/resource-folder.js';
import { renderXmlAttrs } from '../utils/xml-utils.js';
import { writeComponent } from './component-xml-writer.js';
import type { FileSystem } from './file-system.js';
import type { ProjectBranchDirectory, ProjectResourceFolder, ProjectSourceFile, ProjectWriteOptions } from './project-io-contracts.js';
import { PROJECT_XML_PROTOCOL, writeXmlAttr } from './project-xml-protocol.js';

export type { ProjectBranchDirectory, ProjectResourceFolder, ProjectSourceFile, ProjectWriteOptions } from './project-io-contracts.js';

type PackageResource = ReturnType<Package['listResources']>[number];

type WritableResource = PackageResource & {
	getId?(): string;
	getPath?(): string;
	getBranch?(): string;
	getBranchItemIds?(): string[];
	getExported?(): boolean;
	getFavorite?(): boolean;
	getExtras?(): Record<string, unknown>;
};

type WritableImageResource = WritableResource & {
	getFileName?(): string;
	getWidth?(): number;
	getHeight?(): number;
	getTextureSetMode?(): string;
	getQualityOption?(): string;
	getQuality?(): number;
	getScaleOption?(): number;
	getScale9Grid?(): [number, number, number, number] | null;
	getTileGridIndice?(): number;
	getSmoothing?(): boolean;
	getDuplicatePadding?(): boolean;
	getExtras?(): Record<string, unknown>;
};

type WritableFontResource = WritableResource & {
	getFileName?(): string;
	getTextureId?(): string;
	getRenderMode?(): string;
	getSamplePointSize?(): number;
};

type WritableMovieClipResource = WritableResource & {
	getFileName?(): string;
	getTextureSetMode?(): string;
	getSmoothing?(): boolean;
};

type WritableFileResource = WritableResource & {
	getFile?(): string;
};

type WritableSourceDataResource = WritableResource & {
	getSourceData?(): {
		getData(): Uint8Array | null;
	} | null;
};

type WritableSkeletonResource = WritableFileResource & {
	getWidth?(): number;
	getHeight?(): number;
	getRequireIds?(): string[];
	getAtlasNames?(): string[];
	getAnchorX?(): number;
	getAnchorY?(): number;
};

type WritableComponent = Component & {
	getPath?(): string;
};

function shouldWritePackageImageSize(resource: WritableImageResource): boolean {
	return resource.getExtras?.()?._suppressPackageSize !== true;
}

function compareResourceIdSequence(a: string, b: string): number {
	const left = a.toLowerCase();
	const right = b.toLowerCase();
	if (left.length !== right.length) return left.length - right.length;
	return left.localeCompare(right);
}

export class ProjectWriter {
	private readonly _fs: FileSystem;

	constructor(fs: FileSystem) {
		this._fs = fs;
	}

	async write(doc: Document, projectPath: string, options: ProjectWriteOptions = {}): Promise<void> {
		const fs = this._fs;
		const root = doc.getRoot();
		const basePath = fs.dirname(projectPath);
		const currentSourceFilePaths = new Set<string>();
		const currentResourceFolderPaths = new Set<string>();
		const currentBranchDirectoryPaths = new Set<string>();
		const staleSourceFilePaths = new Set(
			(options.staleSourceFiles ?? []).map((source) => this._projectSourceFilePath(basePath, source)),
		);
		const staleBranchDirectoryPaths = new Set(
			(options.staleBranchDirectories ?? []).map((directory) => this._projectBranchDirectoryPath(basePath, directory)),
		);
		if (staleBranchDirectoryPaths.size > 0 && !fs.rmdir) {
			throw new Error('Project branch cleanup requires a FileSystem.rmdir() implementation.');
		}
		for (const pkg of root.listPackages()) this._assertPackageOutputTargets(pkg);
		const settings = root.getSettings?.() ?? {};
		const settingsPath = fs.join(basePath, 'settings');
		const staleOptionalSettings: string[] = [];
		for (const [fileName, key] of [
			['CustomProperties.json', 'customProperties'],
			['i18n.json', 'i18n'],
		] as const) {
			const filePath = fs.join(settingsPath, fileName);
			if (settings[key] === undefined && await fs.exists(filePath)) staleOptionalSettings.push(filePath);
		}
		if (staleOptionalSettings.length > 0 && !fs.unlink) {
			throw new Error('Project settings cleanup requires a FileSystem.unlink() implementation.');
		}

		// 1. Write .fairy file
		const fairyXml = `<?xml version="1.0" encoding="utf-8"?>\n`
			+ `<projectDescription id="${root.getProjectId()}" type="${this._projectTypeName(root.getProjectType())}" version="${root.getVersion() || '3.0'}"/>\n`;
		await fs.writeFile(projectPath, fairyXml);

		// 2. Write settings
		await fs.mkdir(settingsPath);
		const settingFiles: Record<string, string> = {
			'Publish.json': 'publish',
			'Common.json': 'common',
			'Adaptation.json': 'adaptation',
			'CustomProperties.json': 'customProperties',
			'i18n.json': 'i18n',
		};
		for (const [fileName, key] of Object.entries(settingFiles)) {
			if (settings[key]) {
				await fs.writeFile(
					fs.join(settingsPath, fileName),
					JSON.stringify(settings[key], null, '\t'),
				);
			}
		}
		for (const filePath of staleOptionalSettings) await fs.unlink!(filePath);

		// 3. Write packages
		const assetsPath = fs.join(basePath, 'assets');
		await fs.mkdir(assetsPath);
		for (const branchName of root.listBranches()) {
			this._assertSafePathSegment(branchName, 'branch name');
			const branchPath = fs.join(basePath, `assets_${branchName}`);
			await fs.mkdir(branchPath);
			currentBranchDirectoryPaths.add(branchPath);
		}
		for (const pkg of root.listPackages()) {
			await this._writePackage(
				doc,
				pkg,
				assetsPath,
				currentSourceFilePaths,
				currentResourceFolderPaths,
				currentBranchDirectoryPaths,
			);
		}

		await this._removeStaleSourceFiles(currentSourceFilePaths, staleSourceFilePaths);
		await this._removeStaleResourceFolders(
			currentResourceFolderPaths,
			new Set((options.staleResourceFolders ?? []).map((folder) => this._projectResourceFolderPath(basePath, folder))),
		);
		await this._removeStaleBranchDirectories(currentBranchDirectoryPaths, staleBranchDirectoryPaths);
	}

	private async _writePackage(
		_doc: Document,
		pkg: Package,
		assetsPath: string,
		currentSourceFilePaths: Set<string>,
		currentResourceFolderPaths: Set<string>,
		currentBranchDirectoryPaths: Set<string>,
	): Promise<void> {
		const fs = this._fs;
		this._assertSafePathSegment(pkg.getName(), 'package name');
		const pkgDir = fs.join(assetsPath, pkg.getName());
		await fs.mkdir(pkgDir);
		const basePath = fs.dirname(assetsPath);
		const resourcesByBranch = new Map<string, PackageResource[]>();
		const foldersByBranch = new Map<string, PackageResourceFolder[]>();
		for (const res of pkg.listResources()) {
			const branchName = (res as WritableResource).getBranch?.() ?? '';
			const bucket = resourcesByBranch.get(branchName) ?? [];
			bucket.push(res);
			resourcesByBranch.set(branchName, bucket);
		}
		for (const folder of pkg.listResourceFolders()) {
			const bucket = foldersByBranch.get(folder.branch) ?? [];
			bucket.push(folder);
			foldersByBranch.set(folder.branch, bucket);
		}

		// Build package.xml object
		const mainResources = resourcesByBranch.get('') ?? [];
		const mainFolders = foldersByBranch.get('') ?? [];
		const publishName = pkg.getPublishName() || pkg.getName();
		const publishPath = pkg.getPublishPath();
		const publishBranchPath = pkg.getPublishBranchPath();
		const publishPackageCount = pkg.getPublishPackageCount();
		const genCode = pkg.getGenCode();
		const codePath = pkg.getCodePath();
		const packageDescriptionAttrs: Record<string, unknown> = {};
		writeXmlAttr(packageDescriptionAttrs, PROJECT_XML_PROTOCOL.packageDescription.attrs.id, pkg.getId());
		const packageBranchNames = pkg.listBranchNames();
		writeXmlAttr(
			packageDescriptionAttrs,
			PROJECT_XML_PROTOCOL.packageDescription.attrs.branchNames,
			packageBranchNames.length > 0 ? JSON.stringify(packageBranchNames) : undefined,
		);
		if (pkg.listResources().some((resource) => (resource as WritableResource).getFavorite?.())
			|| pkg.listResourceFolders().some((folder) => folder.favorite)
		) {
			writeXmlAttr(packageDescriptionAttrs, PROJECT_XML_PROTOCOL.packageDescription.attrs.hasFavorites, 'true');
		}
		const compressPNG = pkg.getCompressPNG();
		if (compressPNG !== null) {
			writeXmlAttr(packageDescriptionAttrs, PROJECT_XML_PROTOCOL.packageDescription.attrs.compressPNG, compressPNG ? 'true' : 'false');
		}
		const jpegQuality = pkg.getJpegQuality();
		if (jpegQuality !== null) {
			writeXmlAttr(packageDescriptionAttrs, PROJECT_XML_PROTOCOL.packageDescription.attrs.jpegQuality, String(jpegQuality));
		}
		const publishAttrs: Record<string, unknown> = {};
		writeXmlAttr(publishAttrs, PROJECT_XML_PROTOCOL.packagePublish.attrs.name, publishName);
		writeXmlAttr(
			publishAttrs,
			PROJECT_XML_PROTOCOL.packagePublish.attrs.path,
			publishPath || undefined,
		);
		writeXmlAttr(
			publishAttrs,
			PROJECT_XML_PROTOCOL.packagePublish.attrs.branchPath,
			publishBranchPath || undefined,
		);
		writeXmlAttr(
			publishAttrs,
			PROJECT_XML_PROTOCOL.packagePublish.attrs.packageCount,
			publishPackageCount > 0 ? publishPackageCount : undefined,
		);
		writeXmlAttr(
			publishAttrs,
			PROJECT_XML_PROTOCOL.packagePublish.attrs.genCode,
			genCode ? 'true' : undefined,
		);
		writeXmlAttr(
			publishAttrs,
			PROJECT_XML_PROTOCOL.packagePublish.attrs.codePath,
			codePath || undefined,
		);
		const sourceAtlasSettings = pkg.getSourceAtlasSettings();
		if (!sourceAtlasSettings.useGlobal) {
			writeXmlAttr(publishAttrs, PROJECT_XML_PROTOCOL.packagePublish.attrs.maxAtlasSize, String(sourceAtlasSettings.maxSize));
			writeXmlAttr(publishAttrs, PROJECT_XML_PROTOCOL.packagePublish.attrs.sizeOption, sourceAtlasSettings.sizeOption);
			writeXmlAttr(publishAttrs, PROJECT_XML_PROTOCOL.packagePublish.attrs.square, sourceAtlasSettings.forceSquare ? 'true' : 'false');
			writeXmlAttr(publishAttrs, PROJECT_XML_PROTOCOL.packagePublish.attrs.rotation, sourceAtlasSettings.allowRotation ? 'true' : 'false');
			writeXmlAttr(publishAttrs, PROJECT_XML_PROTOCOL.packagePublish.attrs.multiPage, sourceAtlasSettings.paging ? 'true' : 'false');
		}
		writeXmlAttr(
			publishAttrs,
			PROJECT_XML_PROTOCOL.packagePublish.attrs.extractAlpha,
			sourceAtlasSettings.extractAlpha ? 'true' : undefined,
		);
		writeXmlAttr(
			publishAttrs,
			PROJECT_XML_PROTOCOL.packagePublish.attrs.maxAtlasIndex,
			sourceAtlasSettings.maxIndex === 10 ? undefined : String(sourceAtlasSettings.maxIndex),
		);
		writeXmlAttr(
			publishAttrs,
			PROJECT_XML_PROTOCOL.packagePublish.attrs.excluded,
			sourceAtlasSettings.excludedResourceIds.length > 0
				? sourceAtlasSettings.excludedResourceIds.join(',')
				: undefined,
		);
		const publishAtlases = [...sourceAtlasSettings.atlases]
			.sort((left, right) => left.index - right.index)
			.map((atlas) => {
				const attrs: Record<string, unknown> = {};
				writeXmlAttr(
					attrs,
					PROJECT_XML_PROTOCOL.packagePublishAtlas.attrs.name,
					atlas.name || undefined,
				);
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packagePublishAtlas.attrs.index, String(atlas.index));
				writeXmlAttr(
					attrs,
					PROJECT_XML_PROTOCOL.packagePublishAtlas.attrs.compression,
					atlas.compression ? 'true' : undefined,
				);
				return attrs;
			});
		if (publishAtlases.length > 0) {
			publishAttrs.atlas = publishAtlases;
		}
		const preserveResourceOrder = pkg.getExtras()._preservePackageResourceOrder === true;
		const packageDescriptorPath = fs.join(pkgDir, 'package.xml');
		await fs.writeFile(
			packageDescriptorPath,
			this._renderPackageDescriptionXml(
				packageDescriptionAttrs,
				mainFolders,
				mainResources,
				publishAttrs,
				preserveResourceOrder,
			),
		);
		currentSourceFilePaths.add(packageDescriptorPath);
		await this._writeResourceFolders(mainFolders, pkgDir, currentResourceFolderPaths);

		// Write main-branch component XML files
		for (const comp of mainResources.filter((resource): resource is Component => resource.propertyType === 'Component')) {
			currentSourceFilePaths.add(fs.join(pkgDir, this._componentSourceRelativePath(comp)));
			await writeComponent(this._fs, comp, pkgDir, this._componentSourceRelativePath(comp));
		}
		await this._writeResourceSourceFiles(mainResources, pkgDir, currentSourceFilePaths);

		const branchNames = new Set([...pkg.listBranchNames(), ...resourcesByBranch.keys(), ...foldersByBranch.keys()]);
		for (const branchName of branchNames) {
			if (!branchName) continue;
			const branchResources = resourcesByBranch.get(branchName) ?? [];
			const branchFolders = foldersByBranch.get(branchName) ?? [];
			this._assertSafePathSegment(branchName, 'branch name');
			const branchPkgDir = fs.join(basePath, `assets_${branchName}`, pkg.getName());
			await fs.mkdir(branchPkgDir);
			currentBranchDirectoryPaths.add(branchPkgDir);
			const branchDescriptorPath = fs.join(branchPkgDir, 'package_branch.xml');
			await fs.writeFile(
				branchDescriptorPath,
				this._renderBranchDescriptionXml(branchFolders, branchResources, preserveResourceOrder),
			);
			currentSourceFilePaths.add(branchDescriptorPath);
			await this._writeResourceFolders(branchFolders, branchPkgDir, currentResourceFolderPaths);

			for (const comp of branchResources.filter((resource): resource is Component => resource.propertyType === 'Component')) {
				currentSourceFilePaths.add(fs.join(branchPkgDir, this._componentSourceRelativePath(comp)));
				await writeComponent(this._fs, comp, branchPkgDir, this._componentSourceRelativePath(comp));
			}
			await this._writeResourceSourceFiles(branchResources, branchPkgDir, currentSourceFilePaths);
		}
	}

	private async _writeResourceFolders(
		folders: PackageResourceFolder[],
		packageDir: string,
		currentResourceFolderPaths: Set<string>,
	): Promise<void> {
		for (const folder of folders) {
			const relativePath = this._normalizeSourceRelativePath(folder.path);
			const targetPath = this._fs.join(packageDir, relativePath);
			await this._fs.mkdir(targetPath);
			currentResourceFolderPaths.add(targetPath);
		}
	}

	private async _writeResourceSourceFiles(
		resources: PackageResource[],
		packageDir: string,
		currentSourceFilePaths: Set<string>,
	): Promise<void> {
		const fs = this._fs;
		for (const resource of resources) {
			if (resource.propertyType === 'Component') continue;
			const fileName = this._resourceFileName(resource as WritableResource);
			if (!fileName) continue;
			const relativePath = this._resourceSourceRelativePath(resource as WritableResource, fileName);
			const targetPath = fs.join(packageDir, relativePath);
			currentSourceFilePaths.add(targetPath);

			const sourceData = (resource as WritableSourceDataResource).getSourceData?.();
			if (!sourceData) continue;
			const data = sourceData.getData();
			if (!data) continue;
			await fs.mkdir(fs.dirname(targetPath));
			await fs.writeFileRaw(targetPath, new Uint8Array(data));
		}
	}

	private async _removeStaleSourceFiles(
		currentSourceFilePaths: Set<string>,
		staleSourceFilePaths: Set<string>,
	): Promise<void> {
		const fs = this._fs;
		const candidates = [...staleSourceFilePaths].filter((filePath) => !currentSourceFilePaths.has(filePath));
		if (candidates.length === 0) return;
		if (!fs.unlink) {
			throw new Error('Project source cleanup requires a FileSystem.unlink() implementation.');
		}
		for (const filePath of candidates) {
			if (!(await fs.exists(filePath))) continue;
			await fs.unlink(filePath);
		}
	}

	private async _removeStaleResourceFolders(
		currentResourceFolderPaths: Set<string>,
		staleResourceFolderPaths: Set<string>,
	): Promise<void> {
		const candidates = [...staleResourceFolderPaths]
			.filter((folderPath) => !currentResourceFolderPaths.has(folderPath))
			.sort((left, right) => right.length - left.length);
		if (candidates.length === 0) return;
		if (!this._fs.rmdir) {
			throw new Error('Project resource folder cleanup requires a FileSystem.rmdir() implementation.');
		}
		for (const folderPath of candidates) {
			if (!(await this._fs.exists(folderPath))) continue;
			await this._fs.rmdir(folderPath);
		}
	}

	private async _removeStaleBranchDirectories(
		currentBranchDirectoryPaths: Set<string>,
		staleBranchDirectoryPaths: Set<string>,
	): Promise<void> {
		const candidates = [...staleBranchDirectoryPaths]
			.filter((directoryPath) => !currentBranchDirectoryPaths.has(directoryPath))
			.sort((left, right) => right.length - left.length);
		for (const directoryPath of candidates) {
			if (!(await this._fs.exists(directoryPath))) continue;
			await this._fs.rmdir!(directoryPath);
		}
	}

	private _assertPackageOutputTargets(pkg: Package): void {
		this._assertSafePathSegment(pkg.getName(), 'package name');
		const resourcesByBranch = new Map<string, PackageResource[]>();
		const foldersByBranch = new Map<string, PackageResourceFolder[]>();
		for (const resource of pkg.listResources()) {
			const branchName = (resource as WritableResource).getBranch?.() ?? '';
			const bucket = resourcesByBranch.get(branchName) ?? [];
			bucket.push(resource);
			resourcesByBranch.set(branchName, bucket);
		}
		for (const folder of pkg.listResourceFolders()) {
			const bucket = foldersByBranch.get(folder.branch) ?? [];
			bucket.push(folder);
			foldersByBranch.set(folder.branch, bucket);
		}

		for (const branchName of new Set([...pkg.listBranchNames(), ...resourcesByBranch.keys(), ...foldersByBranch.keys()])) {
			const resources = resourcesByBranch.get(branchName) ?? [];
			if (branchName) this._assertSafePathSegment(branchName, 'branch name');
			const descriptorName = branchName ? 'package_branch.xml' : 'package.xml';
			const targets = new Map<string, string>([[descriptorName, 'package descriptor']]);
			for (const folder of foldersByBranch.get(branchName) ?? []) {
				const target = this._normalizeSourceRelativePath(folder.path);
				if (!target) throw new Error(`Package "${pkg.getName()}" cannot declare the resource root as a folder.`);
				const previous = targets.get(target);
				if (previous) {
					throw new Error(`Package "${pkg.getName()}" output "${target}" conflicts with ${previous}.`);
				}
				targets.set(target, `resource folder "${folder.path}"`);
			}
			for (const resource of resources) {
				const target = resource.propertyType === 'Component'
					? this._componentSourceRelativePath(resource as Component)
					: this._resourceSourceRelativePath(resource as WritableResource, this._resourceFileName(resource as WritableResource));
				if (!target) continue;
				const previous = targets.get(target);
				if (previous) {
					throw new Error(`Package "${pkg.getName()}" output "${target}" conflicts with ${previous}.`);
				}
				targets.set(target, `resource "${(resource as WritableResource).getId?.() ?? resource.getName()}"`);
			}
		}
	}

	private _projectSourceFilePath(basePath: string, source: ProjectSourceFile): string {
		this._assertSafePathSegment(source.packageName, 'stale source package name');
		if (source.branch) this._assertSafePathSegment(source.branch, 'stale source branch name');
		this._assertSafePathSegment(source.fileName, 'stale source file name');
		const relativePath = this._normalizeSourceRelativePath([source.path, source.fileName].filter(Boolean).join('/'));
		const assetRoot = source.branch ? `assets_${source.branch}` : 'assets';
		return this._fs.join(basePath, assetRoot, source.packageName, relativePath);
	}

	private _projectResourceFolderPath(basePath: string, folder: ProjectResourceFolder): string {
		this._assertSafePathSegment(folder.packageName, 'resource folder package name');
		if (folder.branch) this._assertSafePathSegment(folder.branch, 'resource folder branch name');
		const relativePath = this._normalizeSourceRelativePath(folder.path);
		const assetRoot = folder.branch ? `assets_${folder.branch}` : 'assets';
		return this._fs.join(basePath, assetRoot, folder.packageName, relativePath);
	}

	private _projectBranchDirectoryPath(basePath: string, directory: ProjectBranchDirectory): string {
		this._assertSafePathSegment(directory.branch, 'stale branch name');
		const branchRoot = this._fs.join(basePath, `assets_${directory.branch}`);
		if (!directory.packageName) return branchRoot;
		this._assertSafePathSegment(directory.packageName, 'stale branch package name');
		return this._fs.join(branchRoot, directory.packageName);
	}

	private _resourceSourceRelativePath(resource: WritableResource, fileName: string): string {
		if (!fileName) return '';
		this._assertSafePathSegment(fileName, 'resource file name');
		const resourcePath = resource.getPath?.() ?? '/';
		const normalizedPath = resourcePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
		return this._normalizeSourceRelativePath([normalizedPath, fileName].filter(Boolean).join('/'));
	}

	private _componentSourceRelativePath(component: Component): string {
		const typedComponent = component as WritableComponent;
		const name = component.getName();
		this._assertSafePathSegment(name, 'component name');
		const componentPath = typedComponent.getPath?.() ?? '/';
		return this._normalizeSourceRelativePath([componentPath, `${name}.xml`].filter(Boolean).join('/'));
	}

	private _assertSafePathSegment(value: string, label: string): void {
		if (!value
			|| value.trim() !== value
			|| value === '.'
			|| value === '..'
			|| /[\\/:]/.test(value)
			|| /[. ]$/.test(value)
			|| /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(value)
		) {
			throw new Error(`Invalid ${label} "${value}".`);
		}
	}

	private _normalizeSourceRelativePath(value: string): string {
		const segments = value.replace(/\\/g, '/').split('/').filter(Boolean);
		if (segments.some((segment) => segment === '.' || segment === '..' || segment.includes(':'))) {
			throw new Error(`Invalid project source path "${value}".`);
		}
		return segments.join('/');
	}

	private _renderPackageDescriptionXml(
		packageDescriptionAttrs: Record<string, unknown>,
		folders: PackageResourceFolder[],
		resources: PackageResource[],
		publishAttrs: Record<string, unknown>,
		preserveResourceOrder: boolean,
	): string {
		const publishNodeAttrs = Object.fromEntries(
			Object.entries(publishAttrs).filter(([key]) => key !== 'atlas'),
		);
		const lines = [
			'<?xml version="1.0" encoding="utf-8"?>',
			`<packageDescription${renderXmlAttrs(packageDescriptionAttrs)}>`,
			'  <resources>',
			...this._renderPackageResourceFolderLines(folders, '    '),
			...this._renderPackageResourceLines(resources, '    ', preserveResourceOrder),
			'  </resources>',
			`  <publish${renderXmlAttrs(publishNodeAttrs)}>`,
		];
		const publishAtlases = Array.isArray(publishAttrs.atlas) ? publishAttrs.atlas as Record<string, unknown>[] : [];
		for (const atlasAttrs of publishAtlases) {
			lines.push(`    <atlas${renderXmlAttrs(atlasAttrs)}/>`);
		}
		lines.push('  </publish>');
		lines.push('</packageDescription>');
		return `${lines.join('\n')}\n`;
	}

	private _renderBranchDescriptionXml(
		folders: PackageResourceFolder[],
		resources: PackageResource[],
		preserveResourceOrder: boolean,
	): string {
		const lines = [
			'<?xml version="1.0" encoding="utf-8"?>',
			'<branchDescription>',
			'  <resources>',
			...this._renderPackageResourceFolderLines(folders, '    '),
			...this._renderPackageResourceLines(resources, '    ', preserveResourceOrder),
			'  </resources>',
			'</branchDescription>',
		];
		return `${lines.join('\n')}\n`;
	}

	private _renderPackageResourceFolderLines(folders: PackageResourceFolder[], indent: string): string[] {
		return [...folders]
			.filter((folder) => folder.favorite || folder.atlas)
			.sort((left, right) => left.path.localeCompare(right.path))
			.map((folder) => {
				const attrs: Record<string, unknown> = {};
				const id = folder.branch ? `/:${folder.branch}${folder.path}` : folder.path;
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageResourceFolder.attrs.id, id);
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageResourceFolder.attrs.name, resourceFolderName(folder.path));
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageResourceFolder.attrs.path, resourceFolderParentPath(folder.path));
				if (folder.favorite) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageResourceFolder.attrs.favorite, 'true');
				if (folder.atlas) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageResourceFolder.attrs.atlas, folder.atlas);
				return `${indent}<folder${renderXmlAttrs(attrs)}/>`;
			});
	}

	private _renderPackageResourceLines(
		resources: PackageResource[],
		indent: string,
		preserveResourceOrder: boolean,
	): string[] {
		return this._orderedPackageResources(resources, preserveResourceOrder)
			.map((resource) => {
				const serialized = this._serializePackageResourceEntry(resource);
				if (!serialized) return null;
				return `${indent}<${serialized.tagName}${renderXmlAttrs(serialized.attrs)}/>`;
			})
			.filter((line): line is string => !!line);
	}

	private _orderedPackageResources(resources: PackageResource[], preserveResourceOrder: boolean): PackageResource[] {
		const original = preserveResourceOrder
			? [...resources]
			: [...resources].sort((a, b) => compareResourceIdSequence(
				(a as WritableResource).getId?.() ?? '',
				(b as WritableResource).getId?.() ?? '',
			));
		const syntheticAfter = new Map<string, Array<{ resource: PackageResource; weight: number }>>();
		const trailing: Array<{ resource: PackageResource; weight: number }> = [];

		for (const resource of original) {
			const extras = (resource as WritableResource).getExtras?.() ?? {};
			const afterId = typeof extras._packageOrderAfterId === 'string' ? extras._packageOrderAfterId : '';
			const weight = typeof extras._packageOrderWeight === 'number' ? extras._packageOrderWeight : 0;
			if (afterId) {
				const bucket = syntheticAfter.get(afterId) ?? [];
				bucket.push({ resource, weight });
				syntheticAfter.set(afterId, bucket);
				continue;
			}
			if (extras._syntheticFontGlyph === true || extras._syntheticFontTexture === true) {
				trailing.push({ resource, weight });
			}
		}

		const result: PackageResource[] = [];
		for (const resource of original) {
			const extras = (resource as WritableResource).getExtras?.() ?? {};
			if (extras._packageOrderAfterId || extras._syntheticFontGlyph === true || extras._syntheticFontTexture === true) {
				continue;
			}
			result.push(resource);
			const id = (resource as WritableResource).getId?.() ?? '';
			const bucket = syntheticAfter.get(id) ?? [];
			bucket.sort((a, b) =>
				a.weight - b.weight
				|| compareResourceIdSequence((a.resource as WritableResource).getId?.() ?? '', (b.resource as WritableResource).getId?.() ?? ''),
			);
			for (const entry of bucket) {
				result.push(entry.resource);
			}
		}

		trailing.sort((a, b) =>
			a.weight - b.weight
			|| compareResourceIdSequence((a.resource as WritableResource).getId?.() ?? '', (b.resource as WritableResource).getId?.() ?? ''),
		);
		for (const entry of trailing) {
			result.push(entry.resource);
		}

		return result;
	}

	private _serializePackageResourceEntry(resource: PackageResource): { tagName: string; attrs: Record<string, unknown> } | null {
		const serialized = this._serializePackageResources([resource]);
		const [tagName, entries] = Object.entries(serialized)[0] ?? [];
		if (!tagName || !entries || entries.length === 0) return null;
		return { tagName, attrs: entries[0] as Record<string, unknown> };
	}

	private _serializePackageResources(packageResources: PackageResource[]): Record<string, unknown[]> {
		const resources: Record<string, unknown[]> = {};

		for (const res of packageResources) {
			const tagName = this._resourceTag(res.propertyType as string);
			if (!tagName) continue;

			const typedRes = res as WritableResource;
			const attrs: Record<string, unknown> = {
			};
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageResource.attrs.id, typedRes.getId?.() ?? '');
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageResource.attrs.name, this._resourceFileName(res));
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageResource.attrs.path, typedRes.getPath?.() ?? '/');
			if (typedRes.getExported?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageResource.attrs.exported, 'true');
			if (typedRes.getFavorite?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageResource.attrs.favorite, 'true');

			// Image-specific
			if (res.propertyType === 'ImageResource') {
				const imgRes = res as WritableImageResource;
				const textureSetMode = imgRes.getTextureSetMode?.() ?? '';
				if (textureSetMode) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.atlas, textureSetMode);
				const scaleOpt = imgRes.getScaleOption?.() ?? 0;
				if (scaleOpt === 1) {
					writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.scale, '9grid');
					const g = imgRes.getScale9Grid?.();
					if (g) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.scale9grid, `${g[0]},${g[1]},${g[2]},${g[3]}`);
				} else if (scaleOpt === 2) {
					writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.scale, 'tile');
				}
				if (shouldWritePackageImageSize(imgRes)) {
					const width = imgRes.getWidth?.() ?? 0;
					if (width !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.width, String(width));
					const height = imgRes.getHeight?.() ?? 0;
					if (height !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.height, String(height));
				}
				const gridTile = imgRes.getTileGridIndice?.() ?? 0;
				if (gridTile !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.gridTile, String(gridTile));
				const qualityOption = imgRes.getQualityOption?.() ?? '';
				if (qualityOption) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.qualityOption, qualityOption);
				if (qualityOption === 'custom') {
					writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.quality, String(imgRes.getQuality?.() ?? 80));
				}
				if (imgRes.getDuplicatePadding?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.duplicatePadding, 'true');
				if (imgRes.getSmoothing?.() === false) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.smoothing, 'false');
			}

			// Font-specific: texture reference
			if (res.propertyType === 'FontResource') {
				const fontRes = res as WritableFontResource;
				const texture = fontRes.getTextureId?.() ?? '';
				if (texture) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageFontResource.attrs.texture, texture);
				const renderMode = fontRes.getRenderMode?.() ?? '';
				if (renderMode) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageFontResource.attrs.renderMode, renderMode);
				const samplePointSize = fontRes.getSamplePointSize?.() ?? 0;
				if (samplePointSize !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageFontResource.attrs.samplePointSize, String(samplePointSize));
			}

			if (res.propertyType === 'MovieClipResource') {
				const movieClipRes = res as WritableMovieClipResource;
				const textureSetMode = movieClipRes.getTextureSetMode?.() ?? '';
				if (textureSetMode) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageMovieClipResource.attrs.atlas, textureSetMode);
				if (movieClipRes.getSmoothing?.() === false) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageMovieClipResource.attrs.smoothing, 'false');
			}

			if (res.propertyType === 'SpineResource' || res.propertyType === 'DragonBonesResource') {
				const skeletonRes = res as WritableSkeletonResource;
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageSkeletonResource.attrs.width, String(skeletonRes.getWidth?.() ?? 0));
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageSkeletonResource.attrs.height, String(skeletonRes.getHeight?.() ?? 0));
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageSkeletonResource.attrs.require, (skeletonRes.getRequireIds?.() ?? []).join(',') || undefined);
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageSkeletonResource.attrs.atlasNames, (skeletonRes.getAtlasNames?.() ?? []).join(','));
				writeXmlAttr(
					attrs,
					PROJECT_XML_PROTOCOL.packageSkeletonResource.attrs.anchor,
					`${skeletonRes.getAnchorX?.() ?? 0},${skeletonRes.getAnchorY?.() ?? 0}`,
				);
			}

			if (!resources[tagName]) resources[tagName] = [];
			(resources[tagName] as Record<string, unknown>[]).push(attrs);
		}

		return resources;
	}

	private _resourceTag(propertyType: string): string | null {
		const map: Record<string, string> = {
			ImageResource: 'image',
			Component: 'component',
			MiscResource: 'misc',
			SoundResource: 'sound',
			FontResource: 'font',
			MovieClipResource: 'movieclip',
			SpineResource: 'spine',
			DragonBonesResource: 'dragonbones',
		};
		return map[propertyType] ?? null;
	}

	private _resourceFileName(res: WritableResource): string {
		const name = res.getName?.() ?? '';
		const type = res.propertyType as string;
		if (type === 'Component') return name + '.xml';
		if (type === 'ImageResource') {
			const fileName = (res as WritableImageResource).getFileName?.() ?? '';
			if (fileName) return fileName;
		}
		if (type === 'SoundResource' || type === 'MiscResource' || type === 'SpineResource' || type === 'DragonBonesResource') {
			const fileName = (res as WritableFileResource).getFile?.() ?? '';
			if (fileName) return fileName;
		}
		if (type === 'FontResource') {
			const fileName = (res as WritableFontResource).getFileName?.() ?? '';
			if (fileName) return fileName;
		}
		if (type === 'MovieClipResource') {
			const fileName = (res as WritableMovieClipResource).getFileName?.() ?? '';
			if (fileName) return fileName;
			return `${name}.jta`;
		}
		// For other types the name usually includes the extension already (stored from original)
		return name;
	}

	private _projectTypeName(type: number): string {
		const names: Record<number, string> = {
			0: 'Unity', 1: 'Flash', 2: 'Starling', 3: 'CocosCreator',
			4: 'Layabox', 5: 'Egret', 6: 'Haxe', 7: 'Pixi',
			8: 'LibGDX', 9: 'Unreal',
		};
		return names[type] ?? 'Unity';
	}
}
