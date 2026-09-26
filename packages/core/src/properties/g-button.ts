import { type Nullable, PropertyType, ButtonMode } from '../constants.js';
import { GComponent, type IGComponent } from './g-component.js';

interface IGButton extends IGComponent {
	checked: boolean;
	page: string;
	controller: string;
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
export class GButton extends GComponent<IGButton, PropertyType.G_BUTTON> {
	public declare propertyType: PropertyType.G_BUTTON;

	protected init(): void {
		this.propertyType = PropertyType.G_BUTTON;
	}

	protected getDefaults(): Nullable<IGButton> {
		return Object.assign(super.getDefaults(), {
			controller: '',
			page: '',
			checked: false,
			title: '',
			icon: '',
			selectedTitle: '',
			selectedIcon: '',
			titleColor: '',
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

	public getSelectedTitle(): string {
		return this.get('selectedTitle');
	}
	public setSelectedTitle(v: string): this {
		return this.set('selectedTitle', v);
	}

	public getSelectedIcon(): string {
		return this.get('selectedIcon');
	}
	public setSelectedIcon(v: string): this {
		return this.set('selectedIcon', v);
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

	public getMode(): number {
		return this.get('mode');
	}
	public setMode(v: number): this {
		return this.set('mode', v);
	}

	public getDownEffect(): number {
		return this.get('downEffect');
	}
	public setDownEffect(v: number): this {
		return this.set('downEffect', v);
	}

	public getDownEffectValue(): number {
		return this.get('downEffectValue');
	}
	public setDownEffectValue(v: number): this {
		return this.set('downEffectValue', v);
	}

	public getSrc(): string {
		return this.get('src');
	}
	public setSrc(v: string): this {
		return this.set('src', v);
	}
	public override getInstanceExtType(): string {
		return 'Button';
	}
	public override getInstanceTitle(): string {
		return this.getTitle();
	}
	public override setInstanceTitle(value: string): this {
		return this.setTitle(value);
	}
	public override getInstanceSelectedTitle(): string {
		return this.getSelectedTitle();
	}
	public override setInstanceSelectedTitle(value: string): this {
		return this.setSelectedTitle(value);
	}
	public override getInstanceIcon(): string {
		return this.getIcon();
	}
	public override setInstanceIcon(value: string): this {
		return this.setIcon(value);
	}
	public override getInstanceSelectedIcon(): string {
		return this.getSelectedIcon();
	}
	public override setInstanceSelectedIcon(value: string): this {
		return this.setSelectedIcon(value);
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
	public getController(): string {
		return this.get('controller');
	}
	public setController(value: string): this {
		return this.set('controller', value);
	}
	public override getInstanceController(): string {
		return this.getController();
	}
	public override setInstanceController(value: string): this {
		return this.setController(value);
	}
	public getPage(): string {
		return this.get('page');
	}
	public setPage(value: string): this {
		return this.set('page', value);
	}
	public override getInstancePage(): string {
		return this.getPage();
	}
	public override setInstancePage(value: string): this {
		return this.setPage(value);
	}
	public getChecked(): boolean {
		return this.get('checked');
	}
	public setChecked(value: boolean): this {
		return this.set('checked', value);
	}
	public override getInstanceChecked(): boolean {
		return this.getChecked();
	}
	public override setInstanceChecked(value: boolean): this {
		return this.setChecked(value);
	}
}
