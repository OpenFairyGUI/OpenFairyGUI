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
export class GLabel extends GComponent<IGLabel, PropertyType.G_LABEL> {
	public declare propertyType: PropertyType.G_LABEL;

	protected init(): void {
		this.propertyType = PropertyType.G_LABEL;
	}

	protected getDefaults(): Nullable<IGLabel> {
		return Object.assign(super.getDefaults(), {
			title: '',
			icon: '',
			titleColor: '',
			titleFontSize: 0,
			sound: '',
			soundVolumeScale: 1,
			src: '',
		});
	}

	public getTitle(): string {
		return this.get('title');
	}
	public setTitle(v: string): this {
		return this.set('title', v);
	}

	public getIcon(): string {
		return this.get('icon');
	}
	public setIcon(v: string): this {
		return this.set('icon', v);
	}

	public getTitleColor(): string {
		return this.get('titleColor');
	}
	public setTitleColor(v: string): this {
		return this.set('titleColor', v);
	}

	public getTitleFontSize(): number {
		return this.get('titleFontSize');
	}
	public setTitleFontSize(v: number): this {
		return this.set('titleFontSize', v);
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
	public override getInstanceExtType(): string {
		return 'Label';
	}
	public override getInstanceTitle(): string {
		return this.getTitle();
	}
	public override setInstanceTitle(value: string): this {
		return this.setTitle(value);
	}
	public override getInstanceIcon(): string {
		return this.getIcon();
	}
	public override setInstanceIcon(value: string): this {
		return this.setIcon(value);
	}
	public override getInstanceTitleColor(): string {
		return this.getTitleColor();
	}
	public override setInstanceTitleColor(value: string): this {
		return this.setTitleColor(value);
	}
	public override getInstanceTitleFontSize(): number {
		return this.getTitleFontSize();
	}
	public override setInstanceTitleFontSize(value: number): this {
		return this.setTitleFontSize(value);
	}
	public override getInstanceSound(): string {
		return this.getSound();
	}
	public override setInstanceSound(value: string): this {
		return this.setSound(value);
	}
	public override getInstanceSoundVolumeScale(): number {
		return this.getSoundVolumeScale();
	}
	public override setInstanceSoundVolumeScale(value: number): this {
		return this.setSoundVolumeScale(value);
	}
}
