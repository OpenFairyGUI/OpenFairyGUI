import { PropertyType } from '../constants.js';
import { SkeletonResourceBase, type ISkeletonResourceBase } from './skeleton-resource-base.js';

export interface ISpineResource extends ISkeletonResourceBase {}

/**
 * A Spine skeleton resource within a FairyGUI package.
 * @category Properties
 */
export class SpineResource extends SkeletonResourceBase<ISpineResource> {
	public declare propertyType: PropertyType.SPINE_RESOURCE;

	protected init(): void {
		this.propertyType = PropertyType.SPINE_RESOURCE;
	}
}
