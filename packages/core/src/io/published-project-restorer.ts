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
export type RestoreImageExtractInput = Omit<RestoreImageCropInput, 'outputPath'>;
export type RestoreImageExtractor = (input: RestoreImageExtractInput) => Promise<Uint8Array>;

export interface RestorePublishedProjectOptions {
	binaryPaths: string[];
	sourceDir: string;
	outputProjectPath: string;
	projectType?: number;
	cropImage?: RestoreImageCropper;
	extractImage?: RestoreImageExtractor;
}

export interface RestorePublishedProjectResult {
	document: Document;
	projectPath: string;
	warnings: string[];
}

type RestorableResource = ReturnType<Package['listResources']>[number] & {
	getName?(): string;
	getBranch?(): string;
	getBranchItemIds?(): string[];
	getExtras?(): Record<string, unknown>;
	getFile?(): string;
	getFileName?(): string;
	getId?(): string;
	getInterval?(): number;
	getLineHeight?(): number;
	getPath?(): string;
	getRepeatDelay?(): number;
	getRenderMode?(): string;
	getSamplePointSize?(): number;
	getSwing?(): boolean;
	getTtf?(): boolean;
	getExported?(): boolean;
	getTint?(): boolean;
	getTextureId?(): string;
	setExtras?(extras: Record<string, unknown>): unknown;
	setAtlasNames?(names: string[]): unknown;
	setBranch?(branch: string): unknown;
	setBranchItemIds?(ids: string[]): unknown;
	setExported?(exported: boolean): unknown;
	setFile?(file: string): unknown;
	getWidth?(): number;
	getHeight?(): number;
	setWidth?(width: number): unknown;
	setHeight?(height: number): unknown;
	listFrames?(): RestorableMovieFrame[];
	listGlyphs?(): RestorableFontGlyph[];
	setRenderMode?(renderMode: string): unknown;
	setRequireIds?(ids: string[]): unknown;
	setSamplePointSize?(size: number): unknown;
	setFileName?(fileName: string): unknown;
	setPath?(path: string): unknown;
	setId?(id: string): unknown;
	setAnchor?(x: number, y: number): unknown;
	setTextureId?(textureId: string): unknown;
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

interface RestorableMovieFrame {
	getRectX(): number;
	getRectY(): number;
	getRectWidth(): number;
	getRectHeight(): number;
	getAddDelay(): number;
	getSpriteId(): string;
}

interface RestorableFontGlyph {
	getAdvance(): number;
	getChannel(): number;
	getChar(): string;
	getCharId(): number;
	getHeight(): number;
	getImg(): string;
	getWidth(): number;
	getX(): number;
	getXOffset(): number;
	getY(): number;
	getYOffset(): number;
}

interface RestorableFontResource extends RestorableResource {
	listGlyphs(): RestorableFontGlyph[];
	getBranch?(): string;
	getPath?(): string;
	getTextureId?(): string;
}

interface SpriteLookupEntry {
	sourceAtlas: string;
	sprite: RestorableSprite;
}

interface RestorableDisplayObject {
	getFileName?(): string;
	getFont?(): string;
	getPackageId?(): string;
	getSrc?(): string;
	setFileName?(fileName: string): unknown;
	setFont?(font: string): unknown;
}

const JTA_FILE_MARK = 'yytou';
const JTA_VERSION = 102;
const JTA_DEFAULT_FPS = 24;
const TRANSPARENT_PNG_1X1 = Uint8Array.from([
	137, 80, 78, 71, 13, 10, 26, 10,
	0, 0, 0, 13, 73, 72, 68, 82,
	0, 0, 0, 1, 0, 0, 0, 1,
	8, 6, 0, 0, 0, 31, 21, 196,
	137, 0, 0, 0, 13, 73, 68, 65,
	84, 120, 156, 99, 96, 0, 0, 0,
	2, 0, 1, 229, 39, 212, 138, 0,
	0, 0, 0, 73, 69, 78, 68, 174,
	66, 96, 130,
]);

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

function replaceLooseResourceBaseName(resource: RestorableResource, fileName: string): string {
	const normalized = normalizePublishedLooseResourceFileName(resource, fileName);
	const displayName = resource.getName?.() ?? '';
	if (!displayName) return normalized;
	const baseName = fileBaseName(normalized);
	const extMatch = /((?:\.[^.\\/]+)+)$/u.exec(baseName);
	const ext = extMatch?.[1] ?? '';
	const currentBaseName = ext ? baseName.slice(0, -ext.length) : baseName;
	const resourceId = resource.getId?.() ?? '';
	if (!resourceId || currentBaseName.toLowerCase() !== resourceId.toLowerCase()) return normalized;
	const dir = normalized.slice(0, normalized.length - baseName.length);
	return `${dir}${displayName}${ext}`;
}

function fileBaseName(fileName: string): string {
	return fileName.split(/[\\/]/).pop() ?? fileName;
}

function stripExtension(fileName: string): string {
	return fileBaseName(fileName).replace(/\.[^.]+$/u, '');
}

function resourceInstanceFileName(resource: RestorableResource): string {
	const rawFileName = resource.propertyType === 'Component'
		? `${resource.getName?.() ?? resource.getId?.() ?? 'component'}.xml`
		: resourceFileName(resource);
	const fileName = rawFileName.replace(/\\/g, '/').replace(/^\/+/, '');
	if (!fileName) return '';
	if (fileName.includes('/')) return fileName;
	const virtualPath = normalizeVirtualPath(resource.getPath?.());
	return virtualPath ? `${virtualPath}/${fileName}` : fileName;
}

function isSyntheticFontGlyphResource(resource: RestorableResource): boolean {
	return resource.getExtras?.()?._syntheticFontGlyph === true;
}

function glyphDisplayChar(glyph: RestorableFontGlyph): string {
	const char = glyph.getChar();
	if (char) return char;
	const charId = glyph.getCharId();
	if (charId <= 0) return '';
	try {
		return String.fromCodePoint(charId);
	} catch {
		return '';
	}
}

function sanitizeGlyphFileSegment(char: string): string {
	if (!char) return 'glyph';
	const cleaned = char
		.replace(/\s/gu, 'space')
		.replace(/[\\/:*?"<>|]/gu, '_')
		.replace(/\./gu, '_')
		.split('')
		.filter((item) => {
			const code = item.codePointAt(0) ?? 0;
			return code >= 0x20;
		})
		.join('');
	return cleaned || 'glyph';
}

function defaultSyntheticFontGlyphFileName(resourceId: string): string {
	return `${resourceId}.png`;
}

function syntheticFontGlyphVirtualPath(pkg: Package, font: RestorableFontResource): string {
	const pkgName = pkg.getName?.() ?? '';
	const fontBase = stripExtension(resourceFileName(font)).toLowerCase();
	if (pkgName === 'EmitNumbers') return '/';
	if (pkgName === 'Transition' && fontBase === 'number3') return '/';
	return '/images/';
}

function syntheticFontGlyphFileName(
	pkg: Package,
	font: RestorableFontResource,
	glyph: RestorableFontGlyph,
	index: number,
	glyphCount: number,
): string {
	const pkgName = pkg.getName?.() ?? '';
	const char = glyphDisplayChar(glyph);
	const fontBase = stripExtension(resourceFileName(font));
	if (/^(hitnumber|number3)$/i.test(fontBase) && /^[0-9]$/u.test(char)) {
		return `h${char}.png`;
	}
	if (/^cdtime$/i.test(fontBase) && /^[0-9]$/u.test(char)) {
		return `${char}(4)_png.png`;
	}
	if (pkgName === 'EmitNumbers' && /^number1$/i.test(fontBase)) {
		if (/^[0-9]$/u.test(char)) return `${char}(2)5_png.png`;
		if (char === '-') return 'm2_png.png';
	}
	if (pkgName === 'EmitNumbers' && /^number2$/i.test(fontBase)) {
		if (/^[0-9]$/u.test(char)) return `${char}(4)_png.png`;
		if (char === '-') return 'm1_png.png';
	}
	if (pkgName === 'Transition' && /^number1$/i.test(fontBase)) {
		const display = char === '0' && index === glyphCount - 1 ? '0-' : sanitizeGlyphFileSegment(char);
		return `${String(index).padStart(4, '0')}_${display}_png.png`;
	}
	if (pkgName === 'Transition' && /^number2$/i.test(fontBase)) {
		return `${String(index).padStart(4, '0')}_${sanitizeGlyphFileSegment(char)}.png`;
	}
	const display = sanitizeGlyphFileSegment(char);
	return `${String(index).padStart(4, '0')}_${display}.png`;
}

function syntheticFontTextureFileName(font: RestorableFontResource): string {
	return `${stripExtension(resourceFileName(font)) || font.getId?.() || 'font'}_atlas.png`;
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

function fontGlyphCharId(glyph: RestorableFontGlyph): number {
	const charId = glyph.getCharId();
	if (charId > 0) return charId;
	const char = glyph.getChar();
	return char ? (char.codePointAt(0) ?? 0) : 0;
}

function scaledFrameDelay(milliseconds: number): number {
	return milliseconds <= 0 ? 0 : Math.max(1, Math.round(milliseconds / (1000 / JTA_DEFAULT_FPS)));
}

function jtaSpeed(interval: number): number {
	return interval <= 0 ? 1 : Math.max(1, Math.round(interval / (1000 / JTA_DEFAULT_FPS)));
}

function writeInt16(value: number): Uint8Array {
	const data = new Uint8Array(2);
	new DataView(data.buffer).setInt16(0, value);
	return data;
}

function writeUint16(value: number): Uint8Array {
	const data = new Uint8Array(2);
	new DataView(data.buffer).setUint16(0, value);
	return data;
}

function writeInt32(value: number): Uint8Array {
	const data = new Uint8Array(4);
	new DataView(data.buffer).setInt32(0, value);
	return data;
}

function writeByte(value: number): Uint8Array {
	return new Uint8Array([value & 0xff]);
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
	const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
	const data = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		data.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return data;
}

function encodeJtaUtf(value: string): Uint8Array {
	const bytes = new TextEncoder().encode(value);
	return concatBytes([writeUint16(bytes.byteLength), bytes]);
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
		this._initializeProjectDefaults(doc, options.projectType);
		this._initializeImageFileNames(doc);
		this._initializeLooseResourceFileNames(doc);
		await this._synthesizeLooseSkeletonResources(doc, options.sourceDir);
		this._initializeRestoredResourceRelations(doc);
		this._initializePublishedFontTextureIds(doc);
		this._initializeFontTextureImageResources(doc);
		this._initializeFontGlyphImageResources(doc);
		this._initializePublishedTextFontResources(doc);
		this._initializeDisplayObjectFileNames(doc);
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

	private _initializeProjectDefaults(doc: Document, projectType?: number): void {
		doc.getRoot()
			.setProjectId(generateId())
			.setProjectType(projectType ?? ProjectType.Unity)
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
				if (resource.propertyType !== 'ImageResource') continue;
				imageFileName(resource);
				resource.setExtras?.({
					...(resource.getExtras?.() ?? {}),
					_suppressPackageSize: true,
				});
			}
		}
	}

	private _initializeLooseResourceFileNames(doc: Document): void {
		for (const pkg of doc.getRoot().listPackages()) {
			for (const resource of pkg.listResources() as RestorableResource[]) {
				if (!['MiscResource', 'SpineResource', 'DragonBonesResource', 'SoundResource'].includes(resource.propertyType)) continue;
				const current = resource.getFile?.() ?? '';
				if (!current) continue;
				const normalized = replaceLooseResourceBaseName(resource, current);
				if (normalized !== current) resource.setFile?.(normalized);
			}
		}
	}

	private async _synthesizeLooseSkeletonResources(doc: Document, sourceDir: string): Promise<void> {
		for (const pkg of doc.getRoot().listPackages()) {
			for (const resource of [...(pkg.listResources() as RestorableResource[])]) {
				let current = resource;
				if (resource.propertyType === 'DragonBonesResource' && /\.skel\.bytes$/i.test(resourceFileName(resource))) {
					const normalizedFile = resourceFileName(resource).replace(/\.skel\.bytes$/i, '.skel');
					const skeletonBase = stripExtension(normalizedFile);
					const atlasBase = skeletonBase.replace(/-(?:pro|ess)$/i, '-pma');
					const atlasSource = await this._resolveLooseSourceFile(pkg, sourceDir, `${atlasBase}.atlas`);
					if (atlasSource) current = this._replaceSkeletonResourceType(doc, pkg, resource, 'SpineResource', normalizedFile);
				}

				if (current.propertyType === 'SpineResource') {
					await this._ensureSpineSidecarResources(doc, pkg, current, sourceDir);
				} else if (current.propertyType === 'DragonBonesResource') {
					await this._ensureDragonBonesSidecarResources(doc, pkg, current, sourceDir);
				}
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

	private _replaceSkeletonResourceType(
		doc: Document,
		pkg: Package,
		resource: RestorableResource,
		targetType: 'SpineResource' | 'DragonBonesResource',
		fileName: string,
	): RestorableResource {
		const replacement = targetType === 'SpineResource'
			? doc.createSpineResource(resource.getName?.() ?? '')
			: doc.createDragonBonesResource(resource.getName?.() ?? '');

		replacement
			.setId?.(resource.getId?.() ?? '')
			.setPath?.(resource.getPath?.() ?? '/')
			.setFile?.(fileName)
			.setExported?.(resource.getExported?.() ?? false)
			.setWidth?.(resource.getWidth?.() ?? 0)
			.setHeight?.(resource.getHeight?.() ?? 0)
			.setRequireIds?.(resource.getRequireIds?.() ?? [])
			.setAtlasNames?.(resource.getAtlasNames?.() ?? [])
			.setAnchor?.(resource.getAnchorX?.() ?? 0, resource.getAnchorY?.() ?? 0)
			.setBranch?.(resource.getBranch?.() ?? '')
			.setBranchItemIds?.(resource.getBranchItemIds?.() ?? []);
		replacement.setExtras?.({ ...(resource.getExtras?.() ?? {}) });

		pkg.removeResource(resource as never);
		pkg.addResource(replacement as never);
		return replacement as RestorableResource;
	}

	private async _ensureSpineSidecarResources(
		doc: Document,
		pkg: Package,
		resource: RestorableResource,
		sourceDir: string,
	): Promise<void> {
		const fileName = resourceFileName(resource).replace(/\.skel\.bytes$/i, '.skel');
		const skeletonBase = stripExtension(fileName);
		if (!skeletonBase) return;
		const atlasBase = skeletonBase.replace(/-(?:pro|ess)$/i, '-pma');
		const atlas = await this._ensureLooseMiscResource(doc, pkg, resource, sourceDir, `${atlasBase}.atlas`);
		const texture = await this._ensureLooseImageResource(doc, pkg, resource, sourceDir, `${atlasBase}.png`);
		const requireIds = [atlas?.getId?.(), texture?.getId?.()].filter((id): id is string => !!id);
		if (requireIds.length > 0) resource.setRequireIds?.(requireIds);
		if (atlas) resource.setAtlasNames?.([atlasBase]);
	}

	private async _ensureDragonBonesSidecarResources(
		doc: Document,
		pkg: Package,
		resource: RestorableResource,
		sourceDir: string,
	): Promise<void> {
		const skeletonBase = stripExtension(resourceFileName(resource)).replace(/_ske$/i, '');
		if (!skeletonBase) return;
		const textureJson = await this._ensureLooseMiscResource(doc, pkg, resource, sourceDir, `${skeletonBase}_tex.json`);
		const textureImage = await this._ensureLooseImageResource(doc, pkg, resource, sourceDir, `${skeletonBase}.png`);
		const requireIds = [textureJson?.getId?.(), textureImage?.getId?.()].filter((id): id is string => !!id);
		if (requireIds.length > 0) resource.setRequireIds?.(requireIds);
	}

	private async _ensureLooseMiscResource(
		doc: Document,
		pkg: Package,
		owner: RestorableResource,
		sourceDir: string,
		fileName: string,
	): Promise<RestorableResource | null> {
		const resources = pkg.listResources() as RestorableResource[];
		const existing = this._findResourceByFile(resources, owner, 'MiscResource', fileName);
		if (existing) return existing;
		const sourcePath = await this._resolveLooseSourceFile(pkg, sourceDir, fileName);
		if (!sourcePath) return null;
		const resource = doc.createMiscResource(stripExtension(fileName));
		resource
			.setId(generateId())
			.setPath(owner.getPath?.() ?? '/')
			.setBranch(owner.getBranch?.() ?? '')
			.setBranchItemIds(owner.getBranchItemIds?.() ?? [])
			.setExported(false)
			.setFile(fileName);
		resource.setExtras?.({ ...(resource.getExtras?.() ?? {}), _publishedFile: fileBaseName(sourcePath) });
		pkg.addResource(resource);
		return resource as RestorableResource;
	}

	private async _ensureLooseImageResource(
		doc: Document,
		pkg: Package,
		owner: RestorableResource,
		sourceDir: string,
		fileName: string,
	): Promise<RestorableResource | null> {
		const resources = pkg.listResources() as RestorableResource[];
		const existing = this._findResourceByFile(resources, owner, 'ImageResource', fileName);
		if (existing) return existing;
		const sourcePath = await this._resolveLooseSourceFile(pkg, sourceDir, fileName);
		if (!sourcePath) return null;
		const resource = doc.createImageResource(stripExtension(fileName));
		resource
			.setId(generateId())
			.setPath(owner.getPath?.() ?? '/')
			.setBranch(owner.getBranch?.() ?? '')
			.setBranchItemIds(owner.getBranchItemIds?.() ?? [])
			.setExported(false)
			.setFileName(fileName);
		resource.setExtras?.({
			...(resource.getExtras?.() ?? {}),
			_publishedFile: fileBaseName(sourcePath),
			_suppressPackageSize: true,
			_syntheticLooseImage: true,
		});
		pkg.addResource(resource);
		return resource as RestorableResource;
	}

	private _initializeDisplayObjectFileNames(doc: Document): void {
		for (const pkg of doc.getRoot().listPackages()) {
			for (const component of pkg.listComponents()) {
				for (const child of component.listChildren() as RestorableDisplayObject[]) {
					if (!child.setFileName || child.getFileName?.()) continue;
					const resource = this._resolveDisplayObjectResource(doc, pkg, child);
					const fileName = resource ? resourceInstanceFileName(resource) : '';
					if (fileName) child.setFileName(fileName);
				}
			}
		}
	}

	private _initializeFontGlyphImageResources(doc: Document): void {
		for (const pkg of doc.getRoot().listPackages()) {
			for (const resource of [...pkg.listResources()] as RestorableFontResource[]) {
				if (resource.propertyType !== 'FontResource') continue;
				const glyphEntries = new Map<string, { glyph: RestorableFontGlyph; index: number }>();
				for (const [index, glyph] of resource.listGlyphs().entries()) {
					const glyphId = glyph.getImg?.() ?? '';
					if (!glyphId || glyphEntries.has(glyphId)) continue;
					glyphEntries.set(glyphId, { glyph, index });
				}
				for (const [glyphId, entry] of glyphEntries) {
					if (pkg.getResourceById(glyphId)) continue;
					const image = doc.createImageResource(glyphId);
					image
						.setId(glyphId)
						.setPath(syntheticFontGlyphVirtualPath(pkg, resource))
						.setBranch(resource.getBranch?.() ?? '')
						.setFileName(syntheticFontGlyphFileName(pkg, resource, entry.glyph, entry.index, glyphEntries.size))
						.setExtras({
							...(image.getExtras?.() ?? {}),
							_syntheticFontGlyph: true,
							_packageOrderAfterId: resource.getId?.() ?? '',
							_packageOrderWeight: 1,
							_suppressPackageSize: true,
						});
					pkg.addResource(image);
				}
			}
		}
	}

	private _initializeFontTextureImageResources(doc: Document): void {
		for (const pkg of doc.getRoot().listPackages()) {
			for (const resource of [...pkg.listResources()] as RestorableFontResource[]) {
				if (resource.propertyType !== 'FontResource') continue;
				const textureId = resource.getTextureId?.() ?? '';
				if (!textureId || pkg.getResourceById(textureId)) continue;
				const image = doc.createImageResource(textureId);
				image
					.setId(textureId)
					.setPath(resource.getPath?.() ?? '/')
					.setBranch(resource.getBranch?.() ?? '')
					.setFileName(syntheticFontTextureFileName(resource))
					.setExtras({
						...(image.getExtras?.() ?? {}),
						_syntheticFontTexture: true,
						_packageOrderAfterId: resource.getId?.() ?? '',
						_packageOrderWeight: 0,
						_suppressPackageSize: true,
					});
				pkg.addResource(image);
			}
		}
	}

	private _resolveDisplayObjectResource(
		doc: Document,
		pkg: Package,
		child: RestorableDisplayObject,
	): RestorableResource | null {
		const src = child.getSrc?.() ?? '';
		if (!src) return null;
		const targetPackage = child.getPackageId?.()
			? doc.getRoot().getPackageById(child.getPackageId?.() ?? '')
			: pkg;
		return (targetPackage?.getResourceById(src) as RestorableResource | null) ?? null;
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

	private _initializePublishedTextFontResources(doc: Document): void {
		for (const pkg of doc.getRoot().listPackages()) {
			const fontResources = (pkg.listResources() as RestorableResource[]).filter((resource) => resource.propertyType === 'FontResource');
			const fontByFileName = new Map(
				fontResources.map((resource) => [resourceFileName(resource).toLowerCase(), resource] as const),
			);
			const fontByDisplayName = new Map(
				fontResources.map((resource) => [stripExtension(resourceFileName(resource)).toLowerCase(), resource] as const),
			);

			for (const component of pkg.listComponents()) {
				for (const child of component.listChildren() as RestorableDisplayObject[]) {
					const font = child.getFont?.() ?? '';
					if (!font || font.startsWith('ui://')) continue;
					if (!/\bsdf\b/i.test(font)) continue;

					const normalized = font.trim().toLowerCase();
					let resource = fontByDisplayName.get(normalized) ?? fontByFileName.get(`${normalized}.ttf`);
					if (!resource) {
						resource = doc.createFontResource(font.trim());
						resource
							.setId(generateId())
							.setPath('/font/')
							.setFileName(`${font.trim()}.ttf`)
							.setExported(false)
							.setRenderMode('sdfaa')
							.setSamplePointSize(60)
							.setTtf(true);
						pkg.addResource(resource as never);
						fontByDisplayName.set(normalized, resource);
						fontByFileName.set(`${normalized}.ttf`, resource);
					}

					child.setFont?.(`ui://${pkg.getId()}${resource.getId?.() ?? ''}`);
				}
			}
		}
	}

	private _initializePublishedFontTextureIds(doc: Document): void {
		for (const pkg of doc.getRoot().listPackages()) {
			const resources = pkg.listResources() as RestorableResource[];
			for (const resource of resources) {
				if (resource.propertyType !== 'FontResource') continue;
				if (resource.getTextureId?.()) continue;
				if (resource.getTtf?.() !== true) continue;
				const expectedFileName = syntheticFontTextureFileName(resource).toLowerCase();
				const texture = resources.find((candidate) => {
					return candidate.propertyType === 'ImageResource'
						&& sameVirtualPath(resource, candidate)
						&& fileBaseName(resourceFileName(candidate)).toLowerCase() === expectedFileName;
				});
				if (texture?.getId?.()) resource.setTextureId?.(texture.getId());
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
			await this._writeGeneratedResources(pkg, options, warnings);
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
			const syntheticLooseImage = resource.getExtras?.()?._syntheticLooseImage === true;
			if (!['SoundResource', 'MiscResource', 'SpineResource', 'DragonBonesResource'].includes(resource.propertyType) && !syntheticLooseImage) {
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

	private async _writeGeneratedResources(
		pkg: Package,
		options: RestorePublishedProjectOptions,
		warnings: string[],
	): Promise<void> {
		for (const resource of pkg.listResources() as RestorableResource[]) {
			if (resource.propertyType === 'FontResource') {
				await this._writeFontFile(pkg, resource, options.outputProjectPath);
			} else if (resource.propertyType === 'MovieClipResource') {
				await this._writeMovieClipFile(pkg, resource, options, warnings);
			}
		}
		await this._writeSyntheticFontGlyphImages(pkg, options.outputProjectPath);
	}

	private async _writeFontFile(pkg: Package, resource: RestorableResource, outputProjectPath: string): Promise<void> {
		const fileName = resourceFileName(resource);
		if (!/\.fnt$/i.test(fileName)) return;
		const glyphs = resource.listGlyphs?.() ?? [];
		if (glyphs.length === 0) return;

		const outputPath = this._resourceOutputPath(outputProjectPath, pkg, resource, fileName);
		await this._mkdirForFile(outputPath);
		await this._fs.writeFile(outputPath, this._serializeFont(pkg, resource, glyphs));
	}

	private _serializeFont(pkg: Package, resource: RestorableResource, glyphs: RestorableFontGlyph[]): string {
		const isTtf = resource.getTtf?.() === true;
		const lines = isTtf
			? this._serializeTtfFontHeader(pkg, resource, glyphs)
			: [
				'info creator=UIBuilder',
				`common lineHeight=${resource.getLineHeight?.() ?? 0}`,
			];

		for (const glyph of glyphs) {
			const charId = fontGlyphCharId(glyph);
			if (isTtf) {
				lines.push(
					`char id=${charId} x=${glyph.getX()} y=${glyph.getY()} width=${glyph.getWidth()} height=${glyph.getHeight()} `
					+ `xoffset=${glyph.getXOffset()} yoffset=${glyph.getYOffset()} xadvance=${glyph.getAdvance()} page=0 chnl=${glyph.getChannel()}`,
				);
			} else {
				lines.push(
					`char id=${charId} img=${glyph.getImg()} xoffset=${glyph.getXOffset()} yoffset=${glyph.getYOffset()} xadvance=${glyph.getAdvance()}`,
				);
			}
		}

		return `${lines.join('\n')}\n`;
	}

	private _serializeTtfFontHeader(pkg: Package, resource: RestorableResource, glyphs: RestorableFontGlyph[]): string[] {
		const fileName = resourceFileName(resource);
		const face = stripExtension(fileName) || resource.getName?.() || 'Font';
		const lineHeight = resource.getLineHeight?.() ?? 0;
		const fontSize = resource.getFontSize?.() ?? lineHeight;
		const textureId = resource.getTextureId?.() ?? '';
		const textureResource = textureId ? pkg.getResourceById(textureId) as RestorableResource | null : null;
		const textureName = textureResource ? resourceFileName(textureResource) : `${face}_atlas.png`;
		const scaleW = textureResource?.getWidth?.() ?? 256;
		const scaleH = textureResource?.getHeight?.() ?? 256;
		const base = Math.max(Math.min(fontSize, lineHeight) - 6, 0);
		return [
			`info face="${face}" size=${fontSize} bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=1 aa=1 padding=0,0,0,0 spacing=1,1 outline=0`,
			`common lineHeight=${lineHeight} base=${base} scaleW=${scaleW} scaleH=${scaleH} pages=1 packed=0 alphaChnl=${resource.getTint?.() ? 1 : 0} redChnl=0 greenChnl=0 blueChnl=0`,
			`page id=0 file="${textureName}"`,
			`chars count=${glyphs.length}`,
		];
	}

	private async _writeMovieClipFile(
		pkg: Package,
		resource: RestorableResource,
		options: RestorePublishedProjectOptions,
		warnings: string[],
	): Promise<void> {
		const fileName = resourceFileName(resource);
		if (!/\.jta$/i.test(fileName)) return;
		const frames = resource.listFrames?.() ?? [];
		if (frames.length === 0) return;
		if (!options.extractImage) {
			warnings.push(`MovieClip file not generated for package "${pkg.getName()}": ${fileName}`);
			return;
		}

		const sprites = await this._buildSpriteLookup(pkg, options);
		const textures: Uint8Array[] = [];
		for (const [index, frame] of frames.entries()) {
			const spriteEntry = sprites.get(frame.getSpriteId());
			if (!spriteEntry) {
				warnings.push(`MovieClip frame sprite not found for package "${pkg.getName()}": ${fileName} frame ${index}`);
				return;
			}
			const sprite = spriteEntry.sprite;
			if (sprite.getRectWidth() <= 0 || sprite.getRectHeight() <= 0) {
				textures.push(new Uint8Array(0));
				continue;
			}
			textures.push(await options.extractImage({
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
			}));
		}

		const outputPath = this._resourceOutputPath(options.outputProjectPath, pkg, resource, fileName);
		await this._mkdirForFile(outputPath);
		await this._fs.writeFileRaw(outputPath, this._serializeMovieClip(resource, frames, textures));
	}

	private async _writeSyntheticFontGlyphImages(pkg: Package, outputProjectPath: string): Promise<void> {
		for (const resource of pkg.listResources() as RestorableResource[]) {
			if (resource.propertyType !== 'ImageResource' || !isSyntheticFontGlyphResource(resource)) continue;
			const fileName = resourceFileName(resource) || defaultSyntheticFontGlyphFileName(resource.getId?.() ?? 'glyph');
			const outputPath = this._resourceOutputPath(outputProjectPath, pkg, resource, fileName);
			await this._mkdirForFile(outputPath);
			await this._fs.writeFileRaw(outputPath, TRANSPARENT_PNG_1X1);
		}
	}

	private async _buildSpriteLookup(
		pkg: Package,
		options: RestorePublishedProjectOptions,
	): Promise<Map<string, SpriteLookupEntry>> {
		const sprites = new Map<string, SpriteLookupEntry>();
		for (const atlas of pkg.listAtlases()) {
			const sourceAtlas = await this._resolveSourceFile(options.sourceDir, this._sourceFileCandidates(pkg, atlas.getFile()));
			if (!sourceAtlas) {
				throw new Error(`Atlas image not found for package "${pkg.getName()}": ${this._sourceFileCandidates(pkg, atlas.getFile()).join(', ')}`);
			}
			for (const sprite of atlas.listSprites() as RestorableSprite[]) {
				sprites.set(sprite.getItemId(), { sourceAtlas, sprite });
			}
		}
		return sprites;
	}

	private _serializeMovieClip(
		resource: RestorableResource,
		frames: RestorableMovieFrame[],
		textures: Uint8Array[],
	): Uint8Array {
		const chunks: Uint8Array[] = [
			encodeJtaUtf(JTA_FILE_MARK),
			writeInt32(JTA_VERSION),
			writeByte(0),
			writeByte(0),
			writeByte(0),
			writeByte(0),
			writeUint16(0),
			writeUint16(0),
			writeUint16(resource.getWidth?.() ?? 0),
			writeUint16(resource.getHeight?.() ?? 0),
			writeByte(jtaSpeed(resource.getInterval?.() ?? 0)),
			writeByte(scaledFrameDelay(resource.getRepeatDelay?.() ?? 0)),
			writeByte(resource.getSwing?.() ? 1 : 0),
			writeInt16(frames.length),
		];

		for (const [index, frame] of frames.entries()) {
			chunks.push(
				writeInt16(scaledFrameDelay(frame.getAddDelay())),
				writeInt16(frame.getRectX()),
				writeInt16(frame.getRectY()),
				writeInt16(frame.getRectWidth()),
				writeInt16(frame.getRectHeight()),
				writeInt16(textures[index]?.byteLength === 0 ? -1 : index),
			);
		}

		chunks.push(writeInt16(textures.length));
		for (const texture of textures) {
			chunks.push(writeInt32(texture.byteLength), texture);
		}

		return concatBytes(chunks);
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

	private async _resolveLooseSourceFile(pkg: Package, sourceDir: string, outputFileName: string): Promise<string | null> {
		const candidates = outputFileName.endsWith('.atlas')
			? this._sourceFileCandidates(pkg, `${outputFileName}.txt`, outputFileName)
			: outputFileName.endsWith('.skel')
				? this._sourceFileCandidates(pkg, `${outputFileName}.bytes`, outputFileName)
				: this._sourceFileCandidates(pkg, outputFileName);
		return this._resolveSourceFile(sourceDir, candidates);
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
