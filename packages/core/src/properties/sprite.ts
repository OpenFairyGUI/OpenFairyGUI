import type { Ref } from 'property-graph';
import { type Nullable, PropertyType } from '../constants.js';
import { ExtensibleProperty, type IExtensibleProperty } from './extensible-property.js';
import type { Atlas } from './atlas.js';

interface ISprite extends IExtensibleProperty {
	itemId: string;
	atlas: Ref<Atlas>;
	rectX: number;
	rectY: number;
	rectWidth: number;
	rectHeight: number;
	rotated: boolean;
	offsetX: number;
	offsetY: number;
	originalWidth: number;
	originalHeight: number;
}

/**
 * A sprite entry within a texture atlas.
 * @category Properties
 */
export class Sprite extends ExtensibleProperty<ISprite> {
	public declare propertyType: PropertyType.SPRITE;

	protected init(): void {
		this.propertyType = PropertyType.SPRITE;
	}

	protected getDefaults(): Nullable<ISprite> {
		return Object.assign(super.getDefaults(), {
			itemId: '',
			atlas: null,
			rectX: 0,
			rectY: 0,
			rectWidth: 0,
			rectHeight: 0,
			rotated: false,
			offsetX: 0,
			offsetY: 0,
			originalWidth: 0,
			originalHeight: 0,
		});
	}

	public getItemId(): string { return this.get('itemId'); }
	public setItemId(v: string): this { return this.set('itemId', v); }

	public getAtlas(): Atlas | null { return this.getRef('atlas' as never) as Atlas | null; }
	public setAtlas(atlas: Atlas | null): this { return this.setRef('atlas' as never, atlas as never); }

	public getRectX(): number { return this.get('rectX'); }
	public setRectX(v: number): this { return this.set('rectX', v); }

	public getRectY(): number { return this.get('rectY'); }
	public setRectY(v: number): this { return this.set('rectY', v); }

	public getRectWidth(): number { return this.get('rectWidth'); }
	public setRectWidth(v: number): this { return this.set('rectWidth', v); }

	public getRectHeight(): number { return this.get('rectHeight'); }
	public setRectHeight(v: number): this { return this.set('rectHeight', v); }

	public getRotated(): boolean { return this.get('rotated'); }
	public setRotated(v: boolean): this { return this.set('rotated', v); }

	public getOffsetX(): number { return this.get('offsetX'); }
	public setOffsetX(v: number): this { return this.set('offsetX', v); }

	public getOffsetY(): number { return this.get('offsetY'); }
	public setOffsetY(v: number): this { return this.set('offsetY', v); }

	public getOriginalWidth(): number { return this.get('originalWidth'); }
	public setOriginalWidth(v: number): this { return this.set('originalWidth', v); }

	public getOriginalHeight(): number { return this.get('originalHeight'); }
	public setOriginalHeight(v: number): this { return this.set('originalHeight', v); }
}
