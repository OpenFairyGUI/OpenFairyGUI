import { Document } from '../document.js';
import type { Component } from '../properties/component.js';
import type { Package } from '../properties/package.js';
import type { ProjectSettings } from '../types/settings.js';
import { tryReadJtaSize } from '../utils/jta-parser.js';
import {
	parseXML,
	parseXMLPreserveOrder,
	parseScale9GridString,
	parseBool,
	parseFloat2,
	parseInt2,
	ensureArray,
} from '../utils/xml-utils.js';
import { PROJECT_XML_PROTOCOL, readXmlAttr, } from './project-xml-protocol.js';
import { ReaderContext } from './reader-context.js';
import type { FileSystem } from './file-system.js';
import { readComponentXml } from './component-xml-reader.js';
import type { ProjectReadOptions } from './project-io-contracts.js';

export type { ProjectReadOptions } from './project-io-contracts.js';

/** Map ease type string to numeric code matching editor's EaseType.parseEaseType. */
function readPngSize(data: Uint8Array): { width: number; height: number } | null {
	if (data.length < 24) return null;
	const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
	for (let i = 0; i < signature.length; i++) {
		if (data[i] !== signature[i]) return null;
	}
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	return {
		width: view.getUint32(16),
		height: view.getUint32(20),
	};
}

function readJpegSize(data: Uint8Array): { width: number; height: number } | null {
	if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null;
	let offset = 2;
	while (offset + 9 < data.length) {
		if (data[offset] !== 0xff) {
			offset++;
			continue;
		}
		const marker = data[offset + 1];
		offset += 2;
		if (marker === 0xd8 || marker === 0xd9) continue;
		if (offset + 2 > data.length) return null;
		const length = (data[offset] << 8) | data[offset + 1];
		if (length < 2 || offset + length > data.length) return null;
		const isStartOfFrame = (
			(marker >= 0xc0 && marker <= 0xc3)
			|| (marker >= 0xc5 && marker <= 0xc7)
			|| (marker >= 0xc9 && marker <= 0xcb)
			|| (marker >= 0xcd && marker <= 0xcf)
		);
		if (isStartOfFrame) {
			if (offset + 7 > data.length) return null;
			return {
				height: (data[offset + 3] << 8) | data[offset + 4],
				width: (data[offset + 5] << 8) | data[offset + 6],
			};
		}
		offset += length;
	}
	return null;
}

function readImageSize(data: Uint8Array): { width: number; height: number } | null {
	return readPngSize(data) ?? readJpegSize(data);
}

// Maps XML tag names for display objects to factory method names.
type XmlNode = Record<string, unknown>;
type OrderedXmlEntry = Record<string, unknown>;

type ProjectSettingKey = 'publish' | 'common' | 'adaptation' | 'customProperties' | 'i18n';

interface FairyProjectDescriptionNode extends XmlNode {
	id?: string;
	type?: string;
	version?: string;
}

interface PackagePublishNode extends XmlNode {
	name?: string;
	path?: string;
	branchPath?: string;
	packageCount?: string | number;
	genCode?: string | boolean;
	codePath?: string;
}

interface PackageResourcesNode extends Record<string, unknown> {}

interface PackageDescriptionNode extends XmlNode {
	id?: string;
	publish?: PackagePublishNode;
	resources?: PackageResourcesNode;
}

interface BranchDescriptionNode extends XmlNode {
	resources?: PackageResourcesNode;
}

interface ResourceXmlAttrs extends XmlNode {
	id?: string;
	name?: string;
	path?: string;
	exported?: string | boolean;
	favorite?: string | boolean;
	scale?: string;
	scale9grid?: string;
	smoothing?: string | boolean;
	duplicatePadding?: string | boolean;
	texture?: string;
	width?: string | number;
	height?: string | number;
	qualityOption?: string;
	quality?: string | number;
	renderMode?: string;
	samplePointSize?: string | number;
	require?: string;
	atlasNames?: string;
	anchor?: string;
}

function getOrderedPackageResourceItems(xmlContent: string): Array<{ tagName: string; attrs: ResourceXmlAttrs }> {
	const ordered = parseXMLPreserveOrder(xmlContent);
	const packageEntry = ordered.find((entry) => 'packageDescription' in entry);
	if (!packageEntry) return [];
	const packageChildren = Array.isArray(packageEntry.packageDescription)
		? (packageEntry.packageDescription as OrderedXmlEntry[])
		: [];
	const resourcesEntry = packageChildren.find((entry) => 'resources' in entry);
	if (!resourcesEntry) return [];
	const resourcesChildren = Array.isArray(resourcesEntry.resources)
		? (resourcesEntry.resources as OrderedXmlEntry[])
		: [];

	return resourcesChildren.flatMap((entry) => {
		const tagName = Object.keys(entry).find((key) => key !== ':@' && key !== '#text');
		if (!tagName) return [];
		const attrs = (entry[':@'] as Record<string, unknown> | undefined) ?? {};
		return [{
			tagName,
			attrs: attrs as ResourceXmlAttrs,
		}];
	});
}

function getXmlNode<T extends XmlNode>(value: unknown): T | null {
	const node = Array.isArray(value) ? value[0] : value;
	if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
	return node as T;
}

function assignSetting(
	settings: ProjectSettings,
	key: ProjectSettingKey,
	value: unknown,
): void {
	switch (key) {
		case 'publish':
			settings.publish = value as ProjectSettings['publish'];
			break;
		case 'common':
			settings.common = value as ProjectSettings['common'];
			break;
		case 'adaptation':
			settings.adaptation = value as ProjectSettings['adaptation'];
			break;
		default:
			settings[key] = value;
			break;
	}
}

interface ProjectComponentExtras extends Record<string, unknown> {
	_filePath?: string;
}

function getProjectComponentExtras(comp: { getExtras(): Record<string, unknown> }): ProjectComponentExtras {
	return comp.getExtras() as ProjectComponentExtras;
}

function getProjectBasePath(fs: FileSystem, projectPath: string): string {
	const basePath = fs.dirname(projectPath);
	return basePath === '.' ? '' : basePath;
}

export class ProjectReader {
	private readonly _fs: FileSystem;

	constructor(fs: FileSystem) {
		this._fs = fs;
	}

	async read(projectPath: string, options: ProjectReadOptions = {}): Promise<Document> {
		const fs = this._fs;
		const doc = new Document();
		const basePath = getProjectBasePath(fs, projectPath);
		doc.setProjectDir(basePath);
		const ctx = new ReaderContext(doc, basePath);

		// 1. Parse .fairy file
		const fairyContent = await fs.readFile(projectPath);
		const fairyXML = parseXML(fairyContent);
		const projDesc = getXmlNode<FairyProjectDescriptionNode>(fairyXML.projectDescription);
		if (projDesc) {
			const root = doc.getRoot();
			root.setProjectId(projDesc.id ?? '');
			root.setProjectType(this._resolveProjectType(projDesc.type ?? ''));
			root.setVersion(projDesc.version ?? '');
		}

		// 2. Read settings
		await this._readSettings(ctx);

		// 3. Scan packages
		const assetsPath = fs.join(basePath, 'assets');
		let packageDirs: string[];
		try {
			packageDirs = await fs.readdir(assetsPath);
		} catch {
			packageDirs = [];
		}

		for (const dirName of packageDirs) {
			const pkgXmlPath = fs.join(assetsPath, dirName, 'package.xml');
			if (!(await fs.exists(pkgXmlPath))) continue;

			await this._readPackage(ctx, dirName, pkgXmlPath, '', options);
		}

		const branchNames = await this._readPackageBranches(ctx, options);
		if (branchNames.length > 0) {
			doc.getRoot().setBranches(branchNames);
		}

		// 4. Parse component XMLs (second pass, after all resources registered)
		for (const [_key, resource] of ctx.resourceMap) {
			if (resource.propertyType !== 'Component') continue;
			const comp = resource as Component;
			const compPath = getProjectComponentExtras(comp)._filePath;
			if (!compPath) continue;

			try {
				const compContent = await fs.readFile(compPath);
				readComponentXml(ctx, comp, compContent);
			} catch (err) {
				ctx.logger.warn(`Failed to parse component: ${compPath} — ${err}`);
			}
		}

		return doc;
	}

	private async _readPackageBranches(ctx: ReaderContext, options: ProjectReadOptions): Promise<string[]> {
		const fs = this._fs;
		let dirNames: string[] = [];
		try {
			dirNames = await fs.readdir(ctx.basePath);
		} catch {
			return [];
		}

		const branchNames = dirNames
			.filter((dirName) => dirName.startsWith('assets_') && dirName.length > 'assets_'.length)
			.map((dirName) => dirName.slice('assets_'.length))
			.sort((a, b) => a.localeCompare(b));

		for (const branchName of branchNames) {
			const branchAssetsPath = fs.join(ctx.basePath, `assets_${branchName}`);
			let packageDirs: string[] = [];
			try {
				packageDirs = await fs.readdir(branchAssetsPath);
			} catch {
				continue;
			}

			for (const dirName of packageDirs) {
				const pkgXmlPath = fs.join(branchAssetsPath, dirName, 'package_branch.xml');
				if (!(await fs.exists(pkgXmlPath))) continue;
				await this._readPackage(ctx, dirName, pkgXmlPath, branchName, options);
			}
		}

		return branchNames;
	}

	private async _readSettings(ctx: ReaderContext): Promise<void> {
		const fs = this._fs;
		const settingsPath = fs.join(ctx.basePath, 'settings');

		const settingFiles: Array<{ name: string; key: ProjectSettingKey }> = [
			{ name: 'Publish.json', key: 'publish' },
			{ name: 'Common.json', key: 'common' },
			{ name: 'Adaptation.json', key: 'adaptation' },
			{ name: 'CustomProperties.json', key: 'customProperties' },
			{ name: 'i18n.json', key: 'i18n' },
		];

		for (const { name, key } of settingFiles) {
			try {
				const filePath = fs.join(settingsPath, name);
				if (await fs.exists(filePath)) {
					const content = await fs.readFile(filePath);
					assignSetting(ctx.settings, key, JSON.parse(content));
				}
			} catch {
				// Skip missing/invalid settings files.
			}
		}

		ctx.document.getRoot().setSettings(ctx.settings);
	}

	private async _readPackage(
		ctx: ReaderContext,
		dirName: string,
		pkgXmlPath: string,
		branchName = '',
		options: ProjectReadOptions = {},
	): Promise<void> {
		const fs = this._fs;
		const content = await fs.readFile(pkgXmlPath);
		const xml = parseXML(content);
		const desc = branchName
			? getXmlNode<BranchDescriptionNode>(xml.branchDescription)
			: getXmlNode<PackageDescriptionNode>(xml.packageDescription);
		if (!desc) return;

		let pkg = ctx.document.getRoot().getPackage(dirName);
		if (!pkg) {
			pkg = ctx.document.createPackage(dirName);
		}

		if (!branchName) {
			const packageId = readXmlAttr<string>(desc, PROJECT_XML_PROTOCOL.packageDescription.attrs.id) || '';
			pkg.setId(packageId);
			const compressPNG = readXmlAttr<string | boolean>(desc, PROJECT_XML_PROTOCOL.packageDescription.attrs.compressPNG);
			if (compressPNG !== undefined) pkg.setCompressPNG(parseBool(compressPNG));
			const jpegQuality = readXmlAttr<string | number>(desc, PROJECT_XML_PROTOCOL.packageDescription.attrs.jpegQuality);
			if (jpegQuality !== undefined && jpegQuality !== null && jpegQuality !== '') {
				pkg.setJpegQuality(parseInt2(jpegQuality, 0));
			}
		}

		// Publish name
		const publish = !branchName ? (desc as PackageDescriptionNode).publish : undefined;
		if (publish) {
			const publishName = readXmlAttr<string>(publish, PROJECT_XML_PROTOCOL.packagePublish.attrs.name) || dirName;
			pkg.setPublishName(publishName);
			pkg.setPublishPath(
				readXmlAttr<string>(publish, PROJECT_XML_PROTOCOL.packagePublish.attrs.path) || '',
			);
			pkg.setPublishBranchPath(
				readXmlAttr<string>(publish, PROJECT_XML_PROTOCOL.packagePublish.attrs.branchPath) || '',
			);
			pkg.setPublishPackageCount(parseInt2(
				readXmlAttr<string | number>(publish, PROJECT_XML_PROTOCOL.packagePublish.attrs.packageCount),
				0,
			));
			pkg.setGenCode(parseBool(
				readXmlAttr<string | boolean>(publish, PROJECT_XML_PROTOCOL.packagePublish.attrs.genCode),
			));
			pkg.setCodePath(
				readXmlAttr<string>(publish, PROJECT_XML_PROTOCOL.packagePublish.attrs.codePath) || '',
			);
		}

		if (pkg.getId()) {
			ctx.packageMap.set(pkg.getId(), pkg);
		}

		// Parse resources
		const resources = desc.resources;
		if (!resources) return;

		const packageDir = branchName
			? fs.join(ctx.basePath, `assets_${branchName}`, dirName)
			: fs.join(ctx.basePath, 'assets', dirName);

		const createdResources: Array<ReturnType<Package['listResources']>[number]> = [];
		const orderedResources = getOrderedPackageResourceItems(content);
		if (orderedResources.length > 0) {
			for (const { tagName, attrs } of orderedResources) {
				const resource = this._createResourceFromXML(ctx, pkg, tagName, attrs, packageDir, branchName);
				if (resource) createdResources.push(resource);
			}
			await this._hydratePackageImageSizes(createdResources, packageDir);
			if (options.hydrateResourceBytes) {
				await this._hydratePackageResourceBytes(ctx.document, createdResources, packageDir);
			}
			return;
		}

		// Fallback for non-standard XML parser output.
		for (const tagName of ['image', 'component', 'font', 'sound', 'movieclip', 'spine', 'dragonbones', 'swf', 'misc', 'atlas']) {
			const items = ensureArray(resources[tagName]);
			for (const item of items) {
				const attrs = getXmlNode<ResourceXmlAttrs>(item);
				if (!attrs) continue;
				const resource = this._createResourceFromXML(ctx, pkg, tagName, attrs, packageDir, branchName);
				if (resource) createdResources.push(resource);
			}
		}
		await this._hydratePackageImageSizes(createdResources, packageDir);
		if (options.hydrateResourceBytes) {
			await this._hydratePackageResourceBytes(ctx.document, createdResources, packageDir);
		}
	}

	private async _hydratePackageImageSizes(
		resources: Array<ReturnType<Package['listResources']>[number]>,
		packageDir: string,
	): Promise<void> {
		const fs = this._fs;
		for (const resource of resources) {
			if (resource.propertyType !== 'ImageResource') continue;
			const image = resource as ReturnType<Document['createImageResource']>;
			if ((image.getWidth?.() ?? 0) > 0 && (image.getHeight?.() ?? 0) > 0) continue;
			const fileName = image.getFileName?.() ?? '';
			if (!fileName) continue;
			const resourcePath = image.getPath?.() ?? '/';
			const sourcePath = this._packageRelativeSourcePath(resourcePath, fileName);
			if (!sourcePath) continue;
			const filePath = fs.join(packageDir, sourcePath.replace(/^\/+/, ''));
			if (!(await fs.exists(filePath))) continue;
			try {
				const size = readImageSize(await fs.readFileRaw(filePath));
				if (!size) continue;
				if ((image.getWidth?.() ?? 0) === 0) image.setWidth?.(size.width);
				if ((image.getHeight?.() ?? 0) === 0) image.setHeight?.(size.height);
			} catch {
				// Ignore unreadable image files and keep XML-provided values only.
			}
		}
	}

	private async _hydratePackageResourceBytes(
		doc: Document,
		resources: Array<ReturnType<Package['listResources']>[number]>,
		packageDir: string,
	): Promise<void> {
		const fs = this._fs;
		for (const resource of resources) {
			const fileName = this._primaryResourceFileName(resource);
			if (!fileName) continue;
			const resourcePath = (resource as { getPath?(): string }).getPath?.() ?? '/';
			const sourcePath = this._packageRelativeSourcePath(resourcePath, fileName);
			if (!sourcePath) continue;
			const filePath = fs.join(packageDir, sourcePath.replace(/^\/+/, ''));
			if (!(await fs.exists(filePath))) continue;
			try {
				const data = new Uint8Array(await fs.readFileRaw(filePath));
				const buffer = doc.createBuffer().setURI(sourcePath).setData(data);
				(this._asSourceDataResource(resource)).setSourceData(buffer);
				if (resource.propertyType === 'MovieClipResource') {
					const size = tryReadJtaSize(data);
					if (size) {
						const movieClip = resource as ReturnType<Document['createMovieClipResource']>;
						movieClip.setWidth(size.width).setHeight(size.height);
					}
				}
			} catch {
				// Keep resource metadata available when its primary source cannot be read.
			}
		}
	}

	private _primaryResourceFileName(resource: ReturnType<Package['listResources']>[number]): string {
		switch (resource.propertyType) {
			case 'ImageResource':
			case 'FontResource':
			case 'MovieClipResource':
				return (resource as { getFileName(): string }).getFileName();
			case 'SoundResource':
			case 'MiscResource':
			case 'SpineResource':
			case 'DragonBonesResource':
				return (resource as { getFile(): string }).getFile();
			default:
				return '';
		}
	}

	private _packageRelativeSourcePath(resourcePath: string, fileName: string): string | null {
		if (!fileName || /[\\/:]/.test(fileName) || fileName === '.' || fileName === '..') return null;
		const segments = resourcePath.replace(/\\/g, '/').split('/').filter(Boolean);
		if (segments.some((segment) => segment === '.' || segment === '..' || segment.includes(':'))) return null;
		return `/${[...segments, fileName].join('/')}`;
	}

	private _asSourceDataResource(resource: ReturnType<Package['listResources']>[number]): {
		setSourceData(buffer: ReturnType<Document['createBuffer']>): unknown;
	} {
		return resource as unknown as {
			setSourceData(buffer: ReturnType<Document['createBuffer']>): unknown;
		};
	}

	private _createResourceFromXML(
		ctx: ReaderContext,
		pkg: Package,
		tagName: string,
		attrs: ResourceXmlAttrs,
		packageDir: string,
		branchName = '',
	): ReturnType<Package['listResources']>[number] | null {
		const doc = ctx.document;
		const fs = this._fs;
		const id = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.packageResource.attrs.id) ?? '';
		const name = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.packageResource.attrs.name) ?? '';
		const path = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.packageResource.attrs.path) ?? '/';
		const exported = parseBool(readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.packageResource.attrs.exported));
		const favorite = parseBool(readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.packageResource.attrs.favorite));

		switch (tagName) {
			case 'image': {
				const res = doc.createImageResource(name.replace(/\.\w+$/, ''));
				res.setId(id);
				res.setPath(path);
				res.setBranch(branchName);
				res.setExported(exported);
				res.setFavorite(favorite);
				res.setFileName(name);
				const textureSetMode = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.atlas);
				if (textureSetMode !== undefined) res.setTextureSetMode(textureSetMode);
				const scale = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.scale);
				const scale9grid = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.scale9grid);
				if (scale === '9grid' && scale9grid) {
					res.setScaleOption(1);
					res.setScale9Grid(parseScale9GridString(scale9grid));
				} else if (scale === 'tile') {
					res.setScaleOption(2);
				}
				const imageWidth = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.width);
				if (imageWidth !== undefined) res.setWidth(parseInt2(imageWidth));
				const imageHeight = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.height);
				if (imageHeight !== undefined) res.setHeight(parseInt2(imageHeight));
				const gridTile = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.gridTile);
				if (gridTile !== undefined) res.setTileGridIndice(parseInt2(gridTile));
				const qualityOption = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.qualityOption);
				if (qualityOption !== undefined) res.setQualityOption(qualityOption);
				const quality = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.quality);
				if (quality !== undefined) res.setQuality(parseInt2(quality));
				res.setDuplicatePadding(parseBool(readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.duplicatePadding)));
				res.setSmoothing(readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.smoothing) !== 'false');
				pkg.addResource(res);
				ctx.registerResource(pkg.getId(), id, res);
				return res;
			}
			case 'component': {
				const res = doc.createComponent(name.replace(/\.xml$/i, ''));
				res.setId(id);
				res.setPath(path);
				res.setBranch(branchName);
				res.setExported(exported);
				res.setFavorite(favorite);
				// Store file path for second-pass parsing
				const filePath = fs.join(packageDir, path.replace(/^\//, ''), name);
				res.setExtras({ ...res.getExtras(), _filePath: filePath });
				pkg.addResource(res);
				ctx.registerResource(pkg.getId(), id, res);
				return res;
			}
			case 'sound': {
				const res = doc.createSoundResource(name.replace(/\.\w+$/, ''));
				res.setId(id);
				res.setPath(path);
				res.setBranch(branchName);
				res.setFile(name);
				res.setExported(exported);
				res.setFavorite(favorite);
				pkg.addResource(res);
				ctx.registerResource(pkg.getId(), id, res);
				return res;
			}
			case 'misc': {
				const res = doc.createMiscResource(name.replace(/\.\w+$/, ''));
				res.setId(id);
				res.setPath(path);
				res.setBranch(branchName);
				res.setFile(name);
				res.setExported(exported);
				res.setFavorite(favorite);
				pkg.addResource(res);
				ctx.registerResource(pkg.getId(), id, res);
				return res;
			}
			case 'font': {
				const res = doc.createFontResource(name.replace(/\.\w+$/, ''));
				res.setId(id);
				res.setPath(path);
				res.setBranch(branchName);
				res.setFileName(name);
				res.setExported(exported);
				res.setFavorite(favorite);
				// Store texture reference for bitmap fonts.
				const texture = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.packageFontResource.attrs.texture);
				if (texture) {
					res.setTextureId(texture);
				}
				const renderMode = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.packageFontResource.attrs.renderMode);
				if (renderMode !== undefined) res.setRenderMode(renderMode);
				const samplePointSize = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.packageFontResource.attrs.samplePointSize);
				if (samplePointSize !== undefined) res.setSamplePointSize(parseInt2(samplePointSize));
				pkg.addResource(res);
				ctx.registerResource(pkg.getId(), id, res);
				return res;
			}
			case 'spine': {
				const res = doc.createSpineResource(name.replace(/\.\w+$/, ''));
				res.setId(id);
				res.setPath(path);
				res.setBranch(branchName);
				res.setFile(name);
				res.setExported(exported);
				res.setFavorite(favorite);
				res.setWidth(parseInt2(readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.packageSkeletonResource.attrs.width)));
				res.setHeight(parseInt2(readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.packageSkeletonResource.attrs.height)));
				const requireValue = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.packageSkeletonResource.attrs.require);
				res.setRequireIds(requireValue ? String(requireValue).split(',').filter(Boolean) : []);
				const atlasNamesValue = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.packageSkeletonResource.attrs.atlasNames);
				res.setAtlasNames(atlasNamesValue ? String(atlasNamesValue).split(',').filter(Boolean) : []);
				const anchorValue = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.packageSkeletonResource.attrs.anchor);
				if (anchorValue) {
					const [anchorX, anchorY] = anchorValue.split(',').map((part) => parseFloat2(part));
					res.setAnchor(anchorX, anchorY);
				}
				pkg.addResource(res);
				ctx.registerResource(pkg.getId(), id, res);
				return res;
			}
			case 'dragonbones': {
				const res = doc.createDragonBonesResource(name.replace(/\.\w+$/, ''));
				res.setId(id);
				res.setPath(path);
				res.setBranch(branchName);
				res.setFile(name);
				res.setExported(exported);
				res.setFavorite(favorite);
				res.setWidth(parseInt2(readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.packageSkeletonResource.attrs.width)));
				res.setHeight(parseInt2(readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.packageSkeletonResource.attrs.height)));
				const requireValue = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.packageSkeletonResource.attrs.require);
				res.setRequireIds(requireValue ? String(requireValue).split(',').filter(Boolean) : []);
				const atlasNamesValue = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.packageSkeletonResource.attrs.atlasNames);
				res.setAtlasNames(atlasNamesValue ? String(atlasNamesValue).split(',').filter(Boolean) : []);
				const anchorValue = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.packageSkeletonResource.attrs.anchor);
				if (anchorValue) {
					const [anchorX, anchorY] = anchorValue.split(',').map((part) => parseFloat2(part));
					res.setAnchor(anchorX, anchorY);
				}
				pkg.addResource(res);
				ctx.registerResource(pkg.getId(), id, res);
				return res;
			}
			case 'movieclip': {
				const res = doc.createMovieClipResource(name.replace(/\.\w+$/, ''));
				res.setId(id);
				res.setPath(path);
				res.setBranch(branchName);
				res.setFileName(name);
				res.setExported(exported);
				res.setFavorite(favorite);
				const textureSetMode = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.packageMovieClipResource.attrs.atlas);
				if (textureSetMode !== undefined) res.setTextureSetMode(textureSetMode);
				pkg.addResource(res);
				ctx.registerResource(pkg.getId(), id, res);
				return res;
			}
			default: {
				// swf, atlas — store as extras on package for now
				return null;
			}
		}
	}

	private _resolveProjectType(typeStr: string): number {
		const map: Record<string, number> = {
			Unity: 0, Flash: 1, Starling: 2, CocosCreator: 3,
			Layabox: 4, LayaBox: 4, Egret: 5, Haxe: 6, Pixi: 7,
			LibGDX: 8, Unreal: 9, CryEngine: 10, MonoGame: 11, Vision: 12,
		};
		return map[typeStr] ?? 0;
	}
}
