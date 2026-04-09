import { PropertyType } from '../constants.js';
import type { IGTextField } from './g-text-field.js';
import { GTextField } from './g-text-field.js';

/**
 * A rich text display object supporting UBB tags and inline images.
 * @category Properties
 */
export class GRichTextField extends GTextField<IGTextField, PropertyType.G_RICH_TEXT_FIELD> {
	public declare propertyType: PropertyType.G_RICH_TEXT_FIELD;

	protected init(): void {
		this.propertyType = PropertyType.G_RICH_TEXT_FIELD;
	}
}
