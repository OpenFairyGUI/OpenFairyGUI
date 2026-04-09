import { type Nullable, PropertyType } from '../constants.js';
import { type IProperty, Property } from './property.js';

interface IControllerPage extends IProperty {
	id: string;
}

/**
 * A single page (state) within a Controller.
 * @category Properties
 */
export class ControllerPage extends Property<IControllerPage> {
	public declare propertyType: PropertyType.CONTROLLER_PAGE;

	protected init(): void {
		this.propertyType = PropertyType.CONTROLLER_PAGE;
	}

	protected getDefaults(): Nullable<IControllerPage> {
		return Object.assign(super.getDefaults(), {
			id: '',
		});
	}

	public getId(): string { return this.get('id'); }
	public setId(id: string): this { return this.set('id', id); }
}
