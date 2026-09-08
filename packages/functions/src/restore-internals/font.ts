import { type Document, type FontResource, type GTextField, type Package, generateId } from '@openfairygui/core';
import { normalizeRestoreResourcePath } from '../path-utils.js';

export interface RestorableFontGlyph {
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

interface RestorableFontResource {
	getFile?(): string;
	getFileName?(): string;
	getFontSize?(): number;
	getLineHeight?(): number;
	getName?(): string;
	getTextureId?(): string;
	getTtf?(): boolean;
	getTint?(): boolean;
}

interface RestorableTextureResource {
	getFile?(): string;
	getFileName?(): string;
	getHeight?(): number;
	getName?(): string;
	getWidth?(): number;
}

function resourceFileName(resource: RestorableFontResource | RestorableTextureResource): string {
	return resource.getFileName?.() || resource.getFile?.() || resource.getName?.() || '';
}

function stripExtension(fileName: string): string {
	return fileName.split(/[\\/]/).pop()?.replace(/\.[^.]+$/u, '') ?? '';
}

function fontGlyphCharId(glyph: RestorableFontGlyph): number {
	const charId = glyph.getCharId();
	if (charId > 0) return charId;
	const char = glyph.getChar();
	return char ? (char.codePointAt(0) ?? 0) : 0;
}

function serializeTtfFontHeader(
	pkg: Package,
	resource: RestorableFontResource,
	glyphs: RestorableFontGlyph[],
): string[] {
	const fileName = resourceFileName(resource);
	const face = stripExtension(fileName) || resource.getName?.() || 'Font';
	const lineHeight = resource.getLineHeight?.() ?? 0;
	const fontSize = resource.getFontSize?.() ?? lineHeight;
	const textureId = resource.getTextureId?.() ?? '';
	const textureResource = textureId
		? (pkg.getResourceById(textureId) as RestorableTextureResource | null)
		: null;
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

export function serializeFont(
	pkg: Package,
	resource: RestorableFontResource,
	glyphs: RestorableFontGlyph[],
): string {
	const isTtf = resource.getTtf?.() === true;
	const lines = isTtf
		? serializeTtfFontHeader(pkg, resource, glyphs)
		: ['info creator=UIBuilder', `common lineHeight=${resource.getLineHeight?.() ?? 0}`];

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

function syntheticFontGlyphVirtualPath(pkg: Package, font: FontResource): string {
	const pkgName = pkg.getName?.() ?? '';
	const fontBase = stripExtension(resourceFileName(font)).toLowerCase();
	if (pkgName === 'EmitNumbers') return '/';
	if (pkgName === 'Transition' && fontBase === 'number3') return '/';
	return '/images/';
}

function syntheticFontGlyphFileName(
	pkg: Package,
	font: FontResource,
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

function syntheticFontTextureFileName(font: FontResource): string {
	return `${stripExtension(resourceFileName(font)) || font.getId?.() || 'font'}_atlas.png`;
}

export function initializeFontGlyphImageResources(doc: Document): void {
	for (const pkg of doc.getRoot().listPackages()) {
		for (const resource of [...pkg.listResources()]) {
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

export function initializeFontTextureImageResources(doc: Document): void {
	for (const pkg of doc.getRoot().listPackages()) {
		for (const resource of [...pkg.listResources()]) {
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

export function initializePublishedFontDefaults(doc: Document): void {
	for (const pkg of doc.getRoot().listPackages()) {
		for (const resource of pkg.listResources()) {
			if (resource.propertyType !== 'FontResource') continue;
			const fileName = resourceFileName(resource);
			if (!/\bsdf\b/i.test(fileName)) continue;
			if (!resource.getRenderMode?.()) resource.setRenderMode?.('sdfaa');
			if (!resource.getSamplePointSize?.()) resource.setSamplePointSize?.(60);
		}
	}
}

export function initializePublishedTextFontResources(doc: Document): void {
	for (const pkg of doc.getRoot().listPackages()) {
		const fontResources = pkg.listResources().filter((resource) => resource.propertyType === 'FontResource');
		const fontByFileName = new Map(
			fontResources.map((resource) => [resourceFileName(resource).toLowerCase(), resource] as const),
		);
		const fontByDisplayName = new Map(
			fontResources.map((resource) => [stripExtension(resourceFileName(resource)).toLowerCase(), resource] as const),
		);

		for (const component of pkg.listComponents()) {
			for (const child of component.listChildren()) {
				const text = child as GTextField;
				const font = text.getFont?.() ?? '';
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
					pkg.addResource(resource);
					fontByDisplayName.set(normalized, resource);
					fontByFileName.set(`${normalized}.ttf`, resource);
				}

				text.setFont?.(`ui://${pkg.getId()}${resource.getId?.() ?? ''}`);
			}
		}
	}
}

export function initializePublishedFontTextureIds(doc: Document): void {
	for (const pkg of doc.getRoot().listPackages()) {
		const resources = pkg.listResources();
		for (const resource of resources) {
			if (resource.propertyType !== 'FontResource') continue;
			if (resource.getTextureId?.()) continue;
			if (resource.getTtf?.() !== true) continue;
			const expectedFileName = syntheticFontTextureFileName(resource).toLowerCase();
			const texture = resources.find((candidate) => {
				return candidate.propertyType === 'ImageResource'
					&& normalizeRestoreResourcePath(resource.getPath()) === normalizeRestoreResourcePath(candidate.getPath())
					&& resourceFileName(candidate).split(/[\\/]/).pop()?.toLowerCase() === expectedFileName;
			});
			if (texture?.getId?.()) resource.setTextureId?.(texture.getId());
		}
	}
}
