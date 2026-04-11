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
export class GProgressBar extends GComponent {
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

	public getTitleType(): number { return this.get('titleType' as any); }
	public setTitleType(v: number): this { return this.set('titleType' as any, v); }

	public getMin(): number { return this.get('min' as any); }
	public setMin(v: number): this { return this.set('min' as any, v); }

	public getMax(): number { return this.get('max' as any); }
	public setMax(v: number): this { return this.set('max' as any, v); }

	public getValue(): number { return this.get('value' as any); }
	public setValue(v: number): this { return this.set('value' as any, v); }

	public getReverse(): boolean { return this.get('reverse' as any); }
	public setReverse(v: boolean): this { return this.set('reverse' as any, v); }

	public getSound(): string { return this.get('sound' as any); }
	public setSound(v: string): this { return this.set('sound' as any, v); }

	public getSoundVolumeScale(): number { return this.get('soundVolumeScale' as any); }
	public setSoundVolumeScale(v: number): this { return this.set('soundVolumeScale' as any, v); }

	public getSrc(): string { return this.get('src' as any); }
	public setSrc(v: string): this { return this.set('src' as any, v); }
}
