import type { Nullable } from '../constants.js';
import { PropertyType } from '../constants.js';
import { GComponent, type IGComponent } from './g-component.js';

interface IGComboBox extends IGComponent {
	title: string;
	icon: string;
	titleColor: string;
	titleFontSize: number;
	items: string[];
	icons: string[];
	values: string[];
	selectedIndex: number;
	popupDirection: number;
	visibleItemCount: number;
	sound: string;
	soundVolumeScale: number;
	src: string;
}

/**
 * A combo box (dropdown) display object.
 * @category Properties
 */
export class GComboBox extends GComponent {
	public declare propertyType: PropertyType.G_COMBO_BOX;

	protected init(): void {
		this.propertyType = PropertyType.G_COMBO_BOX;
	}

	protected getDefaults(): Nullable<IGComboBox> {
		return Object.assign(super.getDefaults(), {
			title: '',
			icon: '',
			titleColor: '#000000',
			titleFontSize: 0,
			items: [],
			icons: [],
			values: [],
			selectedIndex: -1,
			popupDirection: 0,
			visibleItemCount: 0,
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

	public getItems(): string[] { return this.get('items' as any); }
	public setItems(v: string[]): this { return this.set('items' as any, v); }

	public getIcons(): string[] { return this.get('icons' as any); }
	public setIcons(v: string[]): this { return this.set('icons' as any, v); }

	public getValues(): string[] { return this.get('values' as any); }
	public setValues(v: string[]): this { return this.set('values' as any, v); }

	public getVisibleItemCount(): number { return this.get('visibleItemCount' as any); }
	public setVisibleItemCount(v: number): this { return this.set('visibleItemCount' as any, v); }

	public getPopupDirection(): number { return this.get('popupDirection' as any); }
	public setPopupDirection(v: number): this { return this.set('popupDirection' as any, v); }

	public getSound(): string { return this.get('sound' as any); }
	public setSound(v: string): this { return this.set('sound' as any, v); }

	public getSoundVolumeScale(): number { return this.get('soundVolumeScale' as any); }
	public setSoundVolumeScale(v: number): this { return this.set('soundVolumeScale' as any, v); }

	public getSelectedIndex(): number { return this.get('selectedIndex' as any); }
	public setSelectedIndex(v: number): this { return this.set('selectedIndex' as any, v); }

	public getSrc(): string { return this.get('src' as any); }
	public setSrc(v: string): this { return this.set('src' as any, v); }
}
