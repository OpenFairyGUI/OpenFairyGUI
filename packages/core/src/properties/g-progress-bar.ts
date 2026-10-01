import { type Nullable, PropertyType, ProgressTitleType } from '../constants.js';
import { GComponent, type IGComponent } from './g-component.js';

interface IGProgressBar extends IGComponent {
	titleType: number;
	min: number;
	max: number;
	value: number;
	reverse: boolean;
	sound: string;
	soundVolumeScale: number;
	src: string;
}

/**
 * A progress bar display object.
 * @category Properties
 */
export class GProgressBar extends GComponent<IGProgressBar, PropertyType.G_PROGRESS_BAR> {
	public declare propertyType: PropertyType.G_PROGRESS_BAR;

	protected init(): void {
		this.propertyType = PropertyType.G_PROGRESS_BAR;
	}

	protected getDefaults(): Nullable<IGProgressBar> {
		return Object.assign(super.getDefaults(), {
			titleType: ProgressTitleType.Percent,
			min: 0,
			max: 100,
			value: 0,
			reverse: false,
			sound: '',
			soundVolumeScale: 1,
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

	public getReverse(): boolean {
		return this.get('reverse');
	}
	public setReverse(v: boolean): this {
		return this.set('reverse', v);
	}

	public getSound(): string {
		return this.get('sound');
	}
	public setSound(v: string): this {
		return this.set('sound', v);
	}

	public getSoundVolumeScale(): number {
		return this.get('soundVolumeScale');
	}
	public setSoundVolumeScale(v: number): this {
		return this.set('soundVolumeScale', v);
	}

	public getSrc(): string {
		return this.get('src');
	}
	public setSrc(v: string): this {
		return this.set('src', v);
	}
}
