import { type Nullable, PropertyType, FlipType, FillMethod, FillOrigin } from '../constants.js';
import { GObject, type IGObject } from './g-object.js';

export interface IGImage extends IGObject {
	src: string;
	flip: number;
	color: string;
	fillMethod: number;
	fillOrigin: number;
	fillClockwise: boolean;
	fillAmount: number;
}

/**
 * An image display object.
 * @category Properties
 */
export class GImage extends GObject<IGImage, PropertyType.G_IMAGE> {
	public declare propertyType: PropertyType.G_IMAGE;

	protected init(): void {
		this.propertyType = PropertyType.G_IMAGE;
	}

	protected getDefaults(): Nullable<IGImage> {
		return Object.assign(super.getDefaults(), {
			src: '',
			flip: FlipType.None,
			color: '#FFFFFF',
			fillMethod: FillMethod.None,
			fillOrigin: FillOrigin.Top,
			fillClockwise: true,
			fillAmount: 100,
		});
	}

	public getSrc(): string { return this.get('src'); }
	public setSrc(v: string): this { return this.set('src', v); }

	public getFlip(): number { return this.get('flip'); }
	public setFlip(v: number): this { return this.set('flip', v); }

	public getColor(): string { return this.get('color'); }
	public setColor(v: string): this { return this.set('color', v); }

	public getFillMethod(): number { return this.get('fillMethod'); }
	public setFillMethod(v: number): this { return this.set('fillMethod', v); }

	public getFillOrigin(): number { return this.get('fillOrigin'); }
	public setFillOrigin(v: number): this { return this.set('fillOrigin', v); }

	public getFillClockwise(): boolean { return this.get('fillClockwise'); }
	public setFillClockwise(v: boolean): this { return this.set('fillClockwise', v); }

	public getFillAmount(): number { return this.get('fillAmount'); }
	public setFillAmount(v: number): this { return this.set('fillAmount', v); }
}
