import type { Nullable } from '../constants.js';
import { PropertyType } from '../constants.js';
import { GComponent, type IGComponent } from './g-component.js';

interface IGLabel extends IGComponent {
	title: string;
	icon: string;
	titleColor: string;
	titleFontSize: number;
	sound: string;
	soundVolumeScale: number;
	src: string;
}

/**
 * A label display object with title and icon.
 * @category Properties
 */
export class GLabel extends GComponent {
	public declare propertyType: PropertyType.G_LABEL;

	protected init(): void {
		this.propertyType = PropertyType.G_LABEL;
	}

	protected getDefaults(): Nullable<IGLabel> {
		return Object.assign(super.getDefaults(), {
			title: '',
			icon: '',
			titleColor: '#000000',
			titleFontSize: 0,
			sound: '',
			soundVolumeScale: 1,
			src: '',
		});
	}

	public getTitle(): string { return this.get('title' as any); }
	public setTitle(v: string): this { return this.set('title' as any, v); }

	public getIcon(): string { return this.get('icon' as any); }
	public setIcon(v: string): this { return this.set('icon' as any, v); }

	public getTitleColor(): string { return this.get('titleColor' as any); }
	public setTitleColor(v: string): this { return this.set('titleColor' as any, v); }

	public getTitleFontSize(): number { return this.get('titleFontSize' as any); }
	public setTitleFontSize(v: number): this { return this.set('titleFontSize' as any, v); }

	public getSound(): string { return this.get('sound' as any); }
	public setSound(v: string): this { return this.set('sound' as any, v); }

	public getSoundVolumeScale(): number { return this.get('soundVolumeScale' as any); }
	public setSoundVolumeScale(v: number): this { return this.set('soundVolumeScale' as any, v); }

	public getSrc(): string { return this.get('src' as any); }
	public setSrc(v: string): this { return this.set('src' as any, v); }
}
