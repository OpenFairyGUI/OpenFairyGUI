import { type Nullable, PropertyType } from '../constants.js';
import { type IProperty, Property } from './property.js';

interface IControllerPage extends IProperty {
	id: string;
	remark: string;
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
			remark: '',
		});
	}

	public getId(): string { return this.get('id'); }
	public setId(id: string): this { return this.set('id', id); }

	public getRemark(): string { return this.get('remark'); }
	public setRemark(remark: string): this { return this.set('remark', remark); }
}
