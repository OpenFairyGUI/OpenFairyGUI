import { type Nullable, PropertyType, ProgressTitleType } from '../constants.js';
import { GComponent, type IGComponent } from './g-component.js';

interface IGSlider extends IGComponent {
	titleType: number;
	min: number;
	max: number;
	value: number;
	wholeNumbers: boolean;
	reverse: boolean;
	changeOnClick: boolean;
	canDrag: boolean;
	src: string;
}

/**
 * A slider display object.
 * @category Properties
 */
export class GSlider extends GComponent {
	public declare propertyType: PropertyType.G_SLIDER;

	protected init(): void {
		this.propertyType = PropertyType.G_SLIDER;
	}

	protected getDefaults(): Nullable<IGSlider> {
		return Object.assign(super.getDefaults(), {
			titleType: ProgressTitleType.Percent,
			min: 0,
			max: 100,
			value: 0,
			wholeNumbers: false,
			reverse: false,
			changeOnClick: true,
			canDrag: true,
			src: '',
		});
	}

	public getTitleType(): number { return this.get('titleType' as any); }
	public setTitleType(v: number): this { return this.set('titleType' as any, v); }

	public getMin(): number { return this.get('min' as any); }
	public setMin(v: number): this { return this.set('min' as any, v); }

	public getMax(): number { return this.get('max' as any); }
	public setMax(v: number): this { return this.set('max' as any, v); }

	public getValue(): number { return this.get('value' as any); }
	public setValue(v: number): this { return this.set('value' as any, v); }

	public getWholeNumbers(): boolean { return this.get('wholeNumbers' as any); }
	public setWholeNumbers(v: boolean): this { return this.set('wholeNumbers' as any, v); }

	public getSrc(): string { return this.get('src' as any); }
	public setSrc(v: string): this { return this.set('src' as any, v); }
}
