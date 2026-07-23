import { RefList, type Ref } from 'property-graph';
import { type Nullable, PropertyType } from '../constants.js';
import { ExtensibleProperty, type IExtensibleProperty } from './extensible-property.js';
import type { FontGlyph } from './font-glyph.js';
import type { FairyBuffer } from './buffer.js';

interface IFontResource extends IExtensibleProperty {
	id: string;
	path: string;
	branch: string;
	branchItemIds: string[];
	fileName: string;
	textureId: string;
	exported: boolean;
	renderMode: string;
	samplePointSize: number;
	ttf: boolean;
	tint: boolean;
	autoScale: boolean;
	hasChannel: boolean;
	fontSize: number;
	xAdvance: number;
	lineHeight: number;
	glyphs: RefList<FontGlyph>;
	sourceData: Ref<FairyBuffer>;
}

/**
 * A bitmap font resource within a FairyGUI package.
 * @category Properties
 */
export class FontResource extends ExtensibleProperty<IFontResource> {
	public declare propertyType: PropertyType.FONT_RESOURCE;

	protected init(): void {
		this.propertyType = PropertyType.FONT_RESOURCE;
	}

	protected getDefaults(): Nullable<IFontResource> {
		return Object.assign(super.getDefaults(), {
			id: '',
			path: '',
			branch: '',
			branchItemIds: [],
			fileName: '',
			textureId: '',
			exported: false,
			renderMode: '',
			samplePointSize: 0,
			ttf: false,
			tint: false,
			autoScale: false,
			hasChannel: false,
			fontSize: 0,
			xAdvance: 0,
			lineHeight: 0,
			glyphs: new RefList<FontGlyph>(),
			sourceData: null,
		});
	}

	public getId(): string { return this.get('id'); }
	public setId(id: string): this { return this.set('id', id); }

	public getPath(): string { return this.get('path'); }
	public setPath(path: string): this { return this.set('path', path); }

	public getBranch(): string { return this.get('branch'); }
	public setBranch(branch: string): this { return this.set('branch', branch); }

	public getBranchItemIds(): string[] { return [...this.get('branchItemIds')]; }
	public setBranchItemIds(ids: string[]): this { return this.set('branchItemIds', [...ids]); }

	public getFileName(): string { return this.get('fileName'); }
	public setFileName(fileName: string): this { return this.set('fileName', fileName); }

	public getTextureId(): string { return this.get('textureId'); }
	public setTextureId(textureId: string): this { return this.set('textureId', textureId); }

	public getExported(): boolean { return this.get('exported'); }
	public setExported(v: boolean): this { return this.set('exported', v); }

	public getRenderMode(): string { return this.get('renderMode'); }
	public setRenderMode(v: string): this { return this.set('renderMode', v); }

	public getSamplePointSize(): number { return this.get('samplePointSize'); }
	public setSamplePointSize(v: number): this { return this.set('samplePointSize', v); }

	public getTtf(): boolean { return this.get('ttf'); }
	public setTtf(v: boolean): this { return this.set('ttf', v); }

	public getTint(): boolean { return this.get('tint'); }
	public setTint(v: boolean): this { return this.set('tint', v); }

	public getAutoScale(): boolean { return this.get('autoScale'); }
	public setAutoScale(v: boolean): this { return this.set('autoScale', v); }

	public getHasChannel(): boolean { return this.get('hasChannel'); }
	public setHasChannel(v: boolean): this { return this.set('hasChannel', v); }

	public getFontSize(): number { return this.get('fontSize'); }
	public setFontSize(v: number): this { return this.set('fontSize', v); }

	public getXAdvance(): number { return this.get('xAdvance'); }
	public setXAdvance(v: number): this { return this.set('xAdvance', v); }

	public getLineHeight(): number { return this.get('lineHeight'); }
	public setLineHeight(v: number): this { return this.set('lineHeight', v); }

	public addGlyph(glyph: FontGlyph): this { return this.addRef('glyphs', glyph); }
	public removeGlyph(glyph: FontGlyph): this { return this.removeRef('glyphs', glyph); }
	public listGlyphs(): FontGlyph[] { return this.listRefs('glyphs'); }

	/** Primary source-file bytes for this font resource. */
	public getSourceData(): FairyBuffer | null { return this.getRef('sourceData' as never) as FairyBuffer | null; }
	public setSourceData(buffer: FairyBuffer | null): this { return this.setRef('sourceData' as never, buffer as never); }
}
