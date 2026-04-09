import type { Nullable } from '../constants.js';
import { PropertyType } from '../constants.js';
import { GTextField, type IGTextField } from './g-text-field.js';

export interface IGTextInput extends IGTextField {
	promptText: string;
	maxLength: number;
	restrict: string;
	password: boolean;
	keyboardType: number;
}

/**
 * A text input field display object.
 * @category Properties
 */
export class GTextInput extends GTextField<IGTextInput, PropertyType.G_TEXT_INPUT> {
	public declare propertyType: PropertyType.G_TEXT_INPUT;

	protected init(): void {
		this.propertyType = PropertyType.G_TEXT_INPUT;
	}

	protected getDefaults(): Nullable<IGTextInput> {
		return Object.assign(super.getDefaults(), {
			promptText: '',
			maxLength: 0,
			restrict: '',
			password: false,
			keyboardType: 0,
		});
	}

	public getPromptText(): string { return this.get('promptText'); }
	public setPromptText(v: string): this { return this.set('promptText', v); }

	public getMaxLength(): number { return this.get('maxLength'); }
	public setMaxLength(v: number): this { return this.set('maxLength', v); }

	public getRestrict(): string { return this.get('restrict'); }
	public setRestrict(v: string): this { return this.set('restrict', v); }

	public getPassword(): boolean { return this.get('password'); }
	public setPassword(v: boolean): this { return this.set('password', v); }

	public getKeyboardType(): number { return this.get('keyboardType'); }
	public setKeyboardType(v: number): this { return this.set('keyboardType', v); }
}
