import { RefList } from 'property-graph';
import { type Nullable, PropertyType } from '../constants.js';
import { ExtensibleProperty, type IExtensibleProperty } from './extensible-property.js';
import type { FontGlyph } from './font-glyph.js';

interface IFontResource extends IExtensibleProperty {
	id: string;
	path: string;
	exported: boolean;
	ttf: boolean;
	tint: boolean;
	autoScale: boolean;
	fontSize: number;
	glyphs: RefList<FontGlyph>;
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
			exported: false,
			ttf: false,
			tint: false,
			autoScale: false,
			fontSize: 0,
			glyphs: new RefList<FontGlyph>(),
		});
	}

	public getId(): string { return this.get('id'); }
	public setId(id: string): this { return this.set('id', id); }

	public getPath(): string { return this.get('path'); }
	public setPath(path: string): this { return this.set('path', path); }

	public getExported(): boolean { return this.get('exported'); }
	public setExported(v: boolean): this { return this.set('exported', v); }

	public getTtf(): boolean { return this.get('ttf'); }
	public setTtf(v: boolean): this { return this.set('ttf', v); }

	public getTint(): boolean { return this.get('tint'); }
	public setTint(v: boolean): this { return this.set('tint', v); }

	public getAutoScale(): boolean { return this.get('autoScale'); }
	public setAutoScale(v: boolean): this { return this.set('autoScale', v); }

	public getFontSize(): number { return this.get('fontSize'); }
	public setFontSize(v: number): this { return this.set('fontSize', v); }

	public addGlyph(glyph: FontGlyph): this { return this.addRef('glyphs', glyph); }
	public removeGlyph(glyph: FontGlyph): this { return this.removeRef('glyphs', glyph); }
	public listGlyphs(): FontGlyph[] { return this.listRefs('glyphs'); }
}
