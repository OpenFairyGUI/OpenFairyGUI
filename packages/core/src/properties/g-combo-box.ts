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
export class GComboBox extends GComponent<IGComboBox, PropertyType.G_COMBO_BOX> {
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

	public getItems(): string[] {
		return this.get('items');
	}
	public setItems(v: string[]): this {
		return this.set('items', v);
	}

	public getIcons(): string[] {
		return this.get('icons');
	}
	public setIcons(v: string[]): this {
		return this.set('icons', v);
	}

	public getValues(): string[] {
		return this.get('values');
	}
	public setValues(v: string[]): this {
		return this.set('values', v);
	}

	public getVisibleItemCount(): number {
		return this.get('visibleItemCount');
	}
	public setVisibleItemCount(v: number): this {
		return this.set('visibleItemCount', v);
	}

	public getPopupDirection(): number {
		return this.get('popupDirection');
	}
	public setPopupDirection(v: number): this {
		return this.set('popupDirection', v);
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

	public getSelectedIndex(): number {
		return this.get('selectedIndex');
	}
	public setSelectedIndex(v: number): this {
		return this.set('selectedIndex', v);
	}

	public getSrc(): string {
		return this.get('src');
	}
	public setSrc(v: string): this {
		return this.set('src', v);
	}
}
