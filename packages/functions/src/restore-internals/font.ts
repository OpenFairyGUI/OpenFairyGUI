import type { Package } from '@openfairygui/core';

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
