import { type Document, type FontResource, type FontGlyph, type ImageResource, GTextField, type Package, generateId, ProjectWriter } from '@openfairygui/core';
import { normalizeRestoreResourcePath } from '../path-utils.js';

const syntheticFontGlyphImages = new WeakSet<ImageResource>();

export function isSyntheticFontGlyphImage(image: ImageResource): boolean {
	return syntheticFontGlyphImages.has(image);
}

function resourceFileName(resource: FontResource | ReturnType<Package['listResources']>[number]): string {
	const file = 'getFileName' in resource ? resource.getFileName() : 'getFile' in resource ? resource.getFile() : '';
	return file || resource.getName();
}

function stripExtension(fileName: string): string {
	return fileName.split(/[\\/]/).pop()?.replace(/\.[^.]+$/u, '') ?? '';
}

function fontGlyphCharId(glyph: FontGlyph): number {
	const charId = glyph.getCharId();
	if (charId > 0) return charId;
	const char = glyph.getChar();
	return char ? (char.codePointAt(0) ?? 0) : 0;
}

function serializeTtfFontHeader(
	pkg: Package,
	resource: FontResource,
	glyphs: FontGlyph[],
): string[] {
	const fileName = resourceFileName(resource);
	const face = stripExtension(fileName) || resource.getName() || 'Font';
	const lineHeight = resource.getLineHeight() ?? 0;
	const fontSize = resource.getFontSize() ?? lineHeight;
	const textureId = resource.getTextureId() ?? '';
	const textureResource = textureId
		? pkg.listImageResources().find((image) => image.getId() === textureId) ?? null
		: null;
	const textureName = textureResource ? resourceFileName(textureResource) : `${face}_atlas.png`;
	const scaleW = textureResource?.getWidth() ?? 256;
	const scaleH = textureResource?.getHeight() ?? 256;
	const base = Math.max(Math.min(fontSize, lineHeight) - 6, 0);
	return [
		`info face="${face}" size=${fontSize} bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=1 aa=1 padding=0,0,0,0 spacing=1,1 outline=0`,
		`common lineHeight=${lineHeight} base=${base} scaleW=${scaleW} scaleH=${scaleH} pages=1 packed=0 alphaChnl=${resource.getTint() ? 1 : 0} redChnl=0 greenChnl=0 blueChnl=0`,
		`page id=0 file="${textureName}"`,
		`chars count=${glyphs.length}`,
	];
}

export function serializeFont(
	pkg: Package,
	resource: FontResource,
	glyphs: FontGlyph[],
): string {
	const isTtf = resource.getTtf() === true;
	const lines = isTtf
		? serializeTtfFontHeader(pkg, resource, glyphs)
		: ['info creator=UIBuilder', `common lineHeight=${resource.getLineHeight() ?? 0}`];

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

function syntheticFontGlyphFileName(glyphId: string): string {
	const id = Array.from(new TextEncoder().encode(glyphId), (byte) => byte.toString(16).padStart(2, '0')).join('');
	return `glyph-${id}.png`;
}

function syntheticFontTextureFileName(font: FontResource): string {
	return `${stripExtension(resourceFileName(font)) || font.getId() || 'font'}_atlas.png`;
}

export function initializeFontGlyphImageResources(doc: Document): void {
	for (const pkg of doc.getRoot().listPackages()) {
		for (const resource of [...pkg.listResources()]) {
			if (resource.propertyType !== 'FontResource') continue;
			const glyphIds = new Set(resource.listGlyphs().map((glyph) => glyph.getImg()).filter(Boolean));
			for (const glyphId of glyphIds) {
				if (pkg.getResourceById(glyphId)) continue;
				const image = doc.createImageResource(glyphId);
				image
					.setId(glyphId)
					.setPath('/images/')
					.setBranch(resource.getBranch() ?? '')
					.setFileName(syntheticFontGlyphFileName(glyphId));
				ProjectWriter.setImageWriteHints(image, { omitPackageSize: true, packageOrder: { afterId: resource.getId(), weight: 1 } });
				syntheticFontGlyphImages.add(image);
				pkg.addResource(image);
			}
		}
	}
}

export function initializeFontTextureImageResources(doc: Document): void {
	for (const pkg of doc.getRoot().listPackages()) {
		for (const resource of [...pkg.listResources()]) {
			if (resource.propertyType !== 'FontResource') continue;
			const textureId = resource.getTextureId() ?? '';
			if (!textureId || pkg.getResourceById(textureId)) continue;
			const image = doc.createImageResource(textureId);
			image
				.setId(textureId)
				.setPath(resource.getPath() ?? '/')
				.setBranch(resource.getBranch() ?? '')
				.setFileName(syntheticFontTextureFileName(resource));
			ProjectWriter.setImageWriteHints(image, { omitPackageSize: true, packageOrder: { afterId: resource.getId(), weight: 0 } });
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
			if (!resource.getRenderMode()) resource.setRenderMode('sdfaa');
			if (!resource.getSamplePointSize()) resource.setSamplePointSize(60);
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
			for (const text of component.listChildren()) {
				if (!(text instanceof GTextField)) continue;
				const font = text.getFont() ?? '';
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

				text.setFont(`ui://${pkg.getId()}${resource.getId() ?? ''}`);
			}
		}
	}
}

export function initializePublishedFontTextureIds(doc: Document): void {
	for (const pkg of doc.getRoot().listPackages()) {
		const resources = pkg.listResources();
		for (const resource of resources) {
			if (resource.propertyType !== 'FontResource') continue;
			if (resource.getTextureId()) continue;
			if (resource.getTtf() !== true) continue;
			const expectedFileName = syntheticFontTextureFileName(resource).toLowerCase();
			const texture = resources.find((candidate) => {
				return candidate.propertyType === 'ImageResource'
					&& normalizeRestoreResourcePath(resource.getPath()) === normalizeRestoreResourcePath(candidate.getPath())
					&& resourceFileName(candidate).split(/[\\/]/).pop()?.toLowerCase() === expectedFileName;
			});
			if (texture?.getId()) resource.setTextureId(texture.getId());
		}
	}
}
