import { RefSet } from 'property-graph';
import { type Nullable, PropertyType } from '../constants.js';
import { ExtensibleProperty, type IExtensibleProperty } from './extensible-property.js';
import type { Sprite } from './sprite.js';

interface IAtlas extends IExtensibleProperty {
	index: number;
	file: string;
	width: number;
	height: number;
	sprites: RefSet<Sprite>;
}

/**
 * A texture atlas (sprite sheet) within a FairyGUI package.
 * @category Properties
 */
export class Atlas extends ExtensibleProperty<IAtlas> {
	public declare propertyType: PropertyType.ATLAS;

	protected init(): void {
		this.propertyType = PropertyType.ATLAS;
	}

	protected getDefaults(): Nullable<IAtlas> {
		return Object.assign(super.getDefaults(), {
			index: 0,
			file: '',
			width: 0,
			height: 0,
			sprites: new RefSet<Sprite>(),
		});
	}

	public getIndex(): number { return this.get('index'); }
	public setIndex(v: number): this { return this.set('index', v); }

	public getFile(): string { return this.get('file'); }
	public setFile(v: string): this { return this.set('file', v); }

	public getWidth(): number { return this.get('width'); }
	public setWidth(v: number): this { return this.set('width', v); }

	public getHeight(): number { return this.get('height'); }
	public setHeight(v: number): this { return this.set('height', v); }

	public addSprite(sprite: Sprite): this { return this.addRef('sprites', sprite); }
	public removeSprite(sprite: Sprite): this { return this.removeRef('sprites', sprite); }
	public listSprites(): Sprite[] { return this.listRefs('sprites'); }
}
