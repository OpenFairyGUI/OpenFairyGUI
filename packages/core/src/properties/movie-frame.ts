import { type Nullable, PropertyType } from '../constants.js';
import { type IProperty, Property } from './property.js';

interface IMovieFrame extends IProperty {
	rectX: number;
	rectY: number;
	rectWidth: number;
	rectHeight: number;
	addDelay: number;
	spriteId: string;
}

/**
 * A single frame in a movie clip animation.
 * @category Properties
 */
export class MovieFrame extends Property<IMovieFrame> {
	public declare propertyType: PropertyType.MOVIE_FRAME;

	protected init(): void {
		this.propertyType = PropertyType.MOVIE_FRAME;
	}

	protected getDefaults(): Nullable<IMovieFrame> {
		return Object.assign(super.getDefaults(), {
			rectX: 0,
			rectY: 0,
			rectWidth: 0,
			rectHeight: 0,
			addDelay: 0,
			spriteId: '',
		});
	}

	public getRectX(): number { return this.get('rectX'); }
	public setRectX(v: number): this { return this.set('rectX', v); }

	public getRectY(): number { return this.get('rectY'); }
	public setRectY(v: number): this { return this.set('rectY', v); }

	public getRectWidth(): number { return this.get('rectWidth'); }
	public setRectWidth(v: number): this { return this.set('rectWidth', v); }

	public getRectHeight(): number { return this.get('rectHeight'); }
	public setRectHeight(v: number): this { return this.set('rectHeight', v); }

	public getAddDelay(): number { return this.get('addDelay'); }
	public setAddDelay(v: number): this { return this.set('addDelay', v); }

	public getSpriteId(): string { return this.get('spriteId'); }
	public setSpriteId(v: string): this { return this.set('spriteId', v); }
}
