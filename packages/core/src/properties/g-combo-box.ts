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
	selectionController: string;
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
			titleColor: '',
			titleFontSize: 0,
			items: [],
			icons: [],
			values: [],
			selectedIndex: -1,
			popupDirection: 0,
			visibleItemCount: 0,
			selectionController: '',
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

	public getSelectionController(): string {
		return this.get('selectionController');
	}
	public setSelectionController(v: string): this {
		return this.set('selectionController', v);
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
	public override getInstanceExtType(): string {
		return 'ComboBox';
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
	public override getInstancePopupDirection(): number {
		return this.getPopupDirection();
	}
	public override setInstancePopupDirection(value: number): this {
		return this.setPopupDirection(value);
	}
	public override getInstanceVisibleItemCount(): number {
		return this.getVisibleItemCount();
	}
	public override setInstanceVisibleItemCount(value: number): this {
		return this.setVisibleItemCount(value);
	}
	public override getInstanceSelectionController(): string {
		return this.getSelectionController();
	}
	public override setInstanceSelectionController(value: string): this {
		return this.setSelectionController(value);
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
	public override getInstanceComboItems(): IGComponent['instanceComboItems'] {
		const items = this.getItems();
		const values = this.getValues();
		const icons = this.getIcons();
		const count = Math.max(items.length, values.length, icons.length);
		const result: IGComponent['instanceComboItems'] = [];
		for (let i = 0; i < count; i++) {
			result.push({
				title: items[i] ?? '',
				value: values[i] !== undefined && values[i] !== '' ? values[i]! : null,
				icon: icons[i] !== undefined && icons[i] !== '' ? icons[i]! : null,
			});
		}
		return result;
	}
	public override setInstanceComboItems(v: IGComponent['instanceComboItems']): this {
		this.setItems(v.map((item) => item.title ?? ''));
		this.setValues(v.map((item) => item.value ?? ''));
		this.setIcons(v.map((item) => item.icon ?? ''));
		return this;
	}
}
