import { type Nullable, PropertyType } from '../constants.js';
import { type IProperty, Property } from './property.js';

interface IFontGlyph extends IProperty {
	char: string;
	x: number;
	y: number;
	width: number;
	height: number;
	advance: number;
	lineHeight: number;
	channel: number;
	img: string;
}

/**
 * A single glyph entry in a bitmap font.
 * @category Properties
 */
export class FontGlyph extends Property<IFontGlyph> {
	public declare propertyType: PropertyType.FONT_GLYPH;

	protected init(): void {
		this.propertyType = PropertyType.FONT_GLYPH;
	}

	protected getDefaults(): Nullable<IFontGlyph> {
		return Object.assign(super.getDefaults(), {
			char: '',
			x: 0,
			y: 0,
			width: 0,
			height: 0,
			advance: 0,
			lineHeight: 0,
			channel: 0,
			img: '',
		});
	}

	public getChar(): string { return this.get('char'); }
	public setChar(v: string): this { return this.set('char', v); }

	public getX(): number { return this.get('x'); }
	public setX(v: number): this { return this.set('x', v); }

	public getY(): number { return this.get('y'); }
	public setY(v: number): this { return this.set('y', v); }

	public getWidth(): number { return this.get('width'); }
	public setWidth(v: number): this { return this.set('width', v); }

	public getHeight(): number { return this.get('height'); }
	public setHeight(v: number): this { return this.set('height', v); }

	public getAdvance(): number { return this.get('advance'); }
	public setAdvance(v: number): this { return this.set('advance', v); }

	public getLineHeight(): number { return this.get('lineHeight'); }
	public setLineHeight(v: number): this { return this.set('lineHeight', v); }

	public getChannel(): number { return this.get('channel'); }
	public setChannel(v: number): this { return this.set('channel', v); }

	public getImg(): string { return this.get('img'); }
	public setImg(v: string): this { return this.set('img', v); }
}
