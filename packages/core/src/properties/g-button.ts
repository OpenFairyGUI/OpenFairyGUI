import { type Nullable, PropertyType, ButtonMode } from '../constants.js';
import { GComponent, type IGComponent } from './g-component.js';

interface IGButton extends IGComponent {
	title: string;
	icon: string;
	selectedTitle: string;
	selectedIcon: string;
	titleColor: string;
	titleFontSize: number;
	sound: string;
	soundVolumeScale: number;
	mode: number;
	pageOption: string;
	changeStateOnClick: boolean;
	downEffect: number;
	downEffectValue: number;
	src: string;
}

/**
 * A button display object with title, icon, and interaction modes.
 * @category Properties
 */
export class GButton extends GComponent {
	public declare propertyType: PropertyType.G_BUTTON;

	protected init(): void {
		this.propertyType = PropertyType.G_BUTTON;
	}

	protected getDefaults(): Nullable<IGButton> {
		return Object.assign(super.getDefaults(), {
			title: '',
			icon: '',
			selectedTitle: '',
			selectedIcon: '',
			titleColor: '#000000',
			titleFontSize: 0,
			sound: '',
			soundVolumeScale: 1,
			mode: ButtonMode.Common,
			pageOption: '',
			changeStateOnClick: true,
			downEffect: 0,
			downEffectValue: 0.8,
			src: '',
		});
	}

	public getTitle(): string { return this.get('title' as any); }
	public setTitle(v: string): this { return this.set('title' as any, v); }

	public getIcon(): string { return this.get('icon' as any); }
	public setIcon(v: string): this { return this.set('icon' as any, v); }

	public getSelectedTitle(): string { return this.get('selectedTitle' as any); }
	public setSelectedTitle(v: string): this { return this.set('selectedTitle' as any, v); }

	public getSelectedIcon(): string { return this.get('selectedIcon' as any); }
	public setSelectedIcon(v: string): this { return this.set('selectedIcon' as any, v); }

	public getTitleColor(): string { return this.get('titleColor' as any); }
	public setTitleColor(v: string): this { return this.set('titleColor' as any, v); }

	public getTitleFontSize(): number { return this.get('titleFontSize' as any); }
	public setTitleFontSize(v: number): this { return this.set('titleFontSize' as any, v); }

	public getSound(): string { return this.get('sound' as any); }
	public setSound(v: string): this { return this.set('sound' as any, v); }

	public getSoundVolumeScale(): number { return this.get('soundVolumeScale' as any); }
	public setSoundVolumeScale(v: number): this { return this.set('soundVolumeScale' as any, v); }

	public getMode(): number { return this.get('mode' as any); }
	public setMode(v: number): this { return this.set('mode' as any, v); }

	public getDownEffect(): number { return this.get('downEffect' as any); }
	public setDownEffect(v: number): this { return this.set('downEffect' as any, v); }

	public getDownEffectValue(): number { return this.get('downEffectValue' as any); }
	public setDownEffectValue(v: number): this { return this.set('downEffectValue' as any, v); }

	public getSrc(): string { return this.get('src' as any); }
	public setSrc(v: string): this { return this.set('src' as any, v); }
}
