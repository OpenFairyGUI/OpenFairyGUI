import { PropertyType } from '../constants.js';
import { SkeletonResourceBase, type ISkeletonResourceBase } from './skeleton-resource-base.js';

export interface IDragonBonesResource extends ISkeletonResourceBase {}

/**
 * A DragonBones skeleton resource within a FairyGUI package.
 * @category Properties
 */
export class DragonBonesResource extends SkeletonResourceBase<IDragonBonesResource> {
	public declare propertyType: PropertyType.DRAGON_BONES_RESOURCE;

	protected init(): void {
		this.propertyType = PropertyType.DRAGON_BONES_RESOURCE;
	}
}
