import type { Document } from '../document.js';
import type { Package } from '../properties/package.js';
import { normalizeResourceFolderPath } from '../utils/resource-folder.js';
import { assertWellFormedXml, parseXML, parseXMLPreserveOrder, getXmlNode, parseScale9GridString, parseBool, parseFloat2, parseInt2, ensureArray } from '../utils/xml-utils.js';
import { PROJECT_XML_PROTOCOL, readXmlAttr } from './project-xml-protocol.js';
import type { FileSystem } from './file-system.js';
import type { ReaderContext } from './reader-context.js';
import { readProjectDirectory, readProjectSubdirectory } from './project-reader-discovery.js';

type XmlNode = Record<string, unknown>;
type OrderedXmlEntry = Record<string, unknown>;

interface PackagePublishNode extends XmlNode {
	name?: string;
	path?: string;
	branchPath?: string;
	packageCount?: string | number;
	genCode?: string | boolean;
	codePath?: string;
	atlas?: XmlNode | XmlNode[];
}

interface PackageResourcesNode extends Record<string, unknown> {}

interface PackageDescriptionNode extends XmlNode {
	id?: string;
	branchNames?: string;
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
	atlas?: string;
}

function getOrderedPackageResourceItems(xmlContent: string): Array<{ tagName: string; attrs: ResourceXmlAttrs }> {
	const ordered = parseXMLPreserveOrder(xmlContent);
	const descriptionEntry = ordered.find((entry) => 'packageDescription' in entry || 'branchDescription' in entry);
	if (!descriptionEntry) return [];
	const description = 'packageDescription' in descriptionEntry
		? descriptionEntry.packageDescription
		: descriptionEntry.branchDescription;
	const packageChildren = Array.isArray(description)
		? (description as OrderedXmlEntry[])
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

interface ProjectComponentExtras extends Record<string, unknown> {
	_filePath?: string;
}

export function getProjectComponentExtras(comp: { getExtras(): Record<string, unknown> }): ProjectComponentExtras {
	return comp.getExtras() as ProjectComponentExtras;
}

export function linkPackageBranchItems(doc: Document): void {
	for (const pkg of doc.getRoot().listPackages()) {
		const branchNames = pkg.listBranchNames();
		if (branchNames.length === 0) continue;
		const variants = new Map<string, string>();
		for (const resource of pkg.listResources()) {
			const branchName = resource.getBranch();
			if (!branchName) continue;
			variants.set(
				`${branchName}\0${resource.propertyType}\0${resource.getPath()}\0${resource.getName()}`,
				resource.getId(),
			);
		}
		for (const resource of pkg.listResources()) {
			if (resource.getBranch()) continue;
			resource.setBranchItemIds(branchNames.map((branchName) => variants.get(
				`${branchName}\0${resource.propertyType}\0${resource.getPath()}\0${resource.getName()}`,
			) ?? ''));
		}
	}
}

export async function readPackageDescription(
	fs: FileSystem,
	ctx: ReaderContext,
	dirName: string,
	pkgXmlPath: string,
	branchName = '',
	validateSyntax = false,
): Promise<{ pkg: Package; packageDir: string; resources: ReturnType<Package['listResources']> } | null> {
	const content = await fs.readFile(pkgXmlPath);
	if (validateSyntax) assertWellFormedXml(content);
	const xml = parseXML(content);
	const desc = branchName
		? getXmlNode<BranchDescriptionNode>(xml.branchDescription)
		: getXmlNode<PackageDescriptionNode>(xml.packageDescription);
	if (!desc) {
		if (validateSyntax) throw new Error(`Package XML must contain a ${branchName ? 'branchDescription' : 'packageDescription'} root element.`);
		return null;
	}

	let pkg = ctx.document.getRoot().getPackage(dirName);
	if (!pkg) {
		pkg = ctx.document.createPackage(dirName);
	}
	if (branchName) pkg.addBranchName(branchName);
	pkg.setExtras({ ...pkg.getExtras(), _preservePackageResourceOrder: true });

	if (!branchName) {
		const packageId = readXmlAttr<string>(desc, PROJECT_XML_PROTOCOL.packageDescription.attrs.id) || '';
		pkg.setId(packageId);
		const serializedBranchNames = readXmlAttr<string>(
			desc,
			PROJECT_XML_PROTOCOL.packageDescription.attrs.branchNames,
		);
		if (serializedBranchNames !== undefined) {
			let parsedBranchNames: unknown;
			try {
				parsedBranchNames = JSON.parse(serializedBranchNames);
			} catch {
				throw new Error(`Invalid package branchNames for "${dirName}".`);
			}
			if (!Array.isArray(parsedBranchNames)
				|| !parsedBranchNames.every((name): name is string => typeof name === 'string' && name.length > 0)
				|| new Set(parsedBranchNames).size !== parsedBranchNames.length
			) {
				throw new Error(`Invalid package branchNames for "${dirName}".`);
			}
			pkg.setBranchNames(parsedBranchNames);
		}
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

		const globalAtlas = ctx.settings.publish?.atlasSetting;
		const maxAtlasSize = readXmlAttr<string | number>(publish, PROJECT_XML_PROTOCOL.packagePublish.attrs.maxAtlasSize);
		const sizeOption = parseBool(readXmlAttr<string | boolean>(publish, PROJECT_XML_PROTOCOL.packagePublish.attrs.npot))
			? 'npot'
			: readXmlAttr<string>(publish, PROJECT_XML_PROTOCOL.packagePublish.attrs.sizeOption) || globalAtlas?.sizeOption || 'pot';
		const square = readXmlAttr<string | boolean>(publish, PROJECT_XML_PROTOCOL.packagePublish.attrs.square);
		const rotation = readXmlAttr<string | boolean>(publish, PROJECT_XML_PROTOCOL.packagePublish.attrs.rotation);
		const multiPage = readXmlAttr<string | boolean>(publish, PROJECT_XML_PROTOCOL.packagePublish.attrs.multiPage);
		pkg.setSourceAtlasSettings({
			useGlobal: maxAtlasSize === undefined,
			maxSize: parseInt2(maxAtlasSize, globalAtlas?.maxSize ?? 2048),
			sizeOption: sizeOption === 'npot' || sizeOption === 'mof' ? sizeOption : 'pot',
			forceSquare: square === undefined ? globalAtlas?.forceSquare ?? false : parseBool(square),
			allowRotation: rotation === undefined ? globalAtlas?.allowRotation ?? false : parseBool(rotation),
			paging: multiPage === undefined ? globalAtlas?.paging ?? true : parseBool(multiPage),
			extractAlpha: parseBool(readXmlAttr<string | boolean>(publish, PROJECT_XML_PROTOCOL.packagePublish.attrs.extractAlpha)),
			maxIndex: parseInt2(
				readXmlAttr<string | number>(publish, PROJECT_XML_PROTOCOL.packagePublish.attrs.maxAtlasIndex),
				10,
			),
			atlases: ensureArray(publish.atlas).flatMap((value) => {
				const atlas = getXmlNode<XmlNode>(value);
				if (!atlas) return [];
				return [{
					index: parseInt2(readXmlAttr<string | number>(atlas, PROJECT_XML_PROTOCOL.packagePublishAtlas.attrs.index)),
					name: readXmlAttr<string>(atlas, PROJECT_XML_PROTOCOL.packagePublishAtlas.attrs.name) || '',
					compression: parseBool(readXmlAttr<string | boolean>(atlas, PROJECT_XML_PROTOCOL.packagePublishAtlas.attrs.compression)),
				}];
			}),
			excludedResourceIds: (readXmlAttr<string>(publish, PROJECT_XML_PROTOCOL.packagePublish.attrs.excluded) || '')
				.split(',')
				.filter(Boolean),
		});
	}

	if (pkg.getId()) {
		ctx.packageMap.set(pkg.getId(), pkg);
	}

	const packageDir = branchName
		? fs.join(ctx.basePath, `assets_${branchName}`, dirName)
		: fs.join(ctx.basePath, 'assets', dirName);
	const resources = desc.resources;
	const orderedResources = getOrderedPackageResourceItems(content);
	const folderEntries = orderedResources.length > 0
		? orderedResources.filter((entry) => entry.tagName === 'folder').map((entry) => entry.attrs)
		: ensureArray(resources?.folder).map((entry) => getXmlNode<ResourceXmlAttrs>(entry)).filter((entry): entry is ResourceXmlAttrs => !!entry);
	await readPackageFolders(fs, ctx, pkg, packageDir, branchName, folderEntries, validateSyntax);
	if (!resources) return { pkg, packageDir, resources: [] };

	const createdResources: Array<ReturnType<Package['listResources']>[number]> = [];
	if (orderedResources.length > 0) {
		for (const { tagName, attrs } of orderedResources) {
			if (tagName === 'folder') continue;
			const resource = createResourceFromXML(fs, ctx, pkg, tagName, attrs, packageDir, branchName);
			if (resource) createdResources.push(resource);
		}
		return { pkg, packageDir, resources: createdResources };
	}

	// Fallback for non-standard XML parser output.
	for (const tagName of ['image', 'component', 'font', 'sound', 'movieclip', 'spine', 'dragonbones', 'swf', 'misc', 'atlas']) {
		const items = ensureArray(resources[tagName]);
		for (const item of items) {
			const attrs = getXmlNode<ResourceXmlAttrs>(item);
			if (!attrs) continue;
			const resource = createResourceFromXML(fs, ctx, pkg, tagName, attrs, packageDir, branchName);
			if (resource) createdResources.push(resource);
		}
	}
	return { pkg, packageDir, resources: createdResources };
}

async function readPackageFolders(
	fs: FileSystem,
	ctx: ReaderContext,
	pkg: Package,
	packageDir: string,
	branch: string,
	metadataEntries: ResourceXmlAttrs[],
	collectDiagnostics: boolean,
): Promise<void> {
	const metadata = new Map(metadataEntries.map((attrs) => {
		const path = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.packageResourceFolder.attrs.path) ?? '/';
		const name = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.packageResourceFolder.attrs.name) ?? '';
		return [normalizeResourceFolderPath(`${path}/${name}`), attrs] as const;
	}));
	const folders = pkg.listResourceFolders();
	const visit = async (directory: string, parentPath: string, entries?: string[]): Promise<void> => {
		const names = entries ?? await readProjectDirectory(fs, directory, { diagnostics: collectDiagnostics ? ctx.diagnostics : undefined }) ?? [];
		for (const name of [...names].sort((left, right) => left.localeCompare(right))) {
			const childDirectory = fs.join(directory, name);
			const childEntries = await readProjectSubdirectory(fs, childDirectory, collectDiagnostics ? ctx.diagnostics : undefined);
			if (childEntries === null) continue;
			const path = normalizeResourceFolderPath(`${parentPath}/${name}`);
			const attrs = metadata.get(path);
			folders.push({
				branch,
				path,
				favorite: parseBool(readXmlAttr<string | boolean>(attrs ?? {}, PROJECT_XML_PROTOCOL.packageResourceFolder.attrs.favorite)),
				atlas: readXmlAttr<string>(attrs ?? {}, PROJECT_XML_PROTOCOL.packageResourceFolder.attrs.atlas) ?? '',
			});
			await visit(childDirectory, path, childEntries);
		}
	};
	await visit(packageDir, '/');
	pkg.setResourceFolders(folders);
}

function createResourceFromXML(
	fs: FileSystem,
	ctx: ReaderContext,
	pkg: Package,
	tagName: string,
	attrs: ResourceXmlAttrs,
	packageDir: string,
	branchName = '',
): ReturnType<Package['listResources']>[number] | null {
	const doc = ctx.document;
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
		case 'swf': {
			const res = doc.createSwfResource(name.replace(/\.swf$/i, ''));
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
			const smoothing = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.packageMovieClipResource.attrs.smoothing);
			res.setSmoothing(smoothing !== 'false');
			pkg.addResource(res);
			ctx.registerResource(pkg.getId(), id, res);
			return res;
		}
		case 'atlas': {
			// Generated atlas entries are not source package resources.
			return null;
		}
		default: {
			ctx.addDiagnostic({
				severity: 'error',
				code: 'unsupported_resource_kind',
				path: `packages.${pkg.getId()}.resources.${id || name}`,
				message: `Unsupported declared resource kind "${tagName}".`,
				packageId: pkg.getId(),
				resourceId: id,
				sourcePath: fs.join(packageDir, path.replace(/^\//, ''), name),
			});
			return null;
		}
	}
}
