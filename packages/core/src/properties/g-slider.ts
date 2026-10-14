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
export class GSlider extends GComponent<IGSlider, PropertyType.G_SLIDER> {
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

	public getTitleType(): number {
		return this.get('titleType');
	}
	public setTitleType(v: number): this {
		return this.set('titleType', v);
	}

	public getMin(): number {
		return this.get('min');
	}
	public setMin(v: number): this {
		return this.set('min', v);
	}

	public getMax(): number {
		return this.get('max');
	}
	public setMax(v: number): this {
		return this.set('max', v);
	}

	public getValue(): number {
		return this.get('value');
	}
	public setValue(v: number): this {
		return this.set('value', v);
	}

	public getWholeNumbers(): boolean {
		return this.get('wholeNumbers');
	}
	public setWholeNumbers(v: boolean): this {
		return this.set('wholeNumbers', v);
	}

	public getSrc(): string {
		return this.get('src');
	}
	public setSrc(v: string): this {
		return this.set('src', v);
	}
}
