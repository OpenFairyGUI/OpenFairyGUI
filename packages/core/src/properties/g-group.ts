import { type Nullable, PropertyType, GroupLayoutType } from '../constants.js';
import { GObject, type IGObject } from './g-object.js';

interface IGGroup extends IGObject {
	layout: number;
	lineGap: number;
	columnGap: number;
	advanced: boolean;
	excludeInvisibles: boolean;
	autoSizeDisabled: boolean;
	mainGridIndex: number;
}

/**
 * A group display object that can organize children with optional layout.
 * @category Properties
 */
export class GGroup extends GObject<IGGroup, PropertyType.G_GROUP> {
	public declare propertyType: PropertyType.G_GROUP;

	protected init(): void {
		this.propertyType = PropertyType.G_GROUP;
	}

	protected getDefaults(): Nullable<IGGroup> {
		return Object.assign(super.getDefaults(), {
			layout: GroupLayoutType.None,
			lineGap: 0,
			columnGap: 0,
			advanced: false,
			excludeInvisibles: false,
			autoSizeDisabled: false,
			mainGridIndex: -1,
		});
	}

	public getLayout(): number { return this.get('layout'); }
	public setLayout(v: number): this { return this.set('layout', v); }

	public getLineGap(): number { return this.get('lineGap'); }
	public setLineGap(v: number): this { return this.set('lineGap', v); }

	public getColumnGap(): number { return this.get('columnGap'); }
	public setColumnGap(v: number): this { return this.set('columnGap', v); }

	public getAdvanced(): boolean { return this.get('advanced'); }
	public setAdvanced(v: boolean): this { return this.set('advanced', v); }

	public getExcludeInvisibles(): boolean { return this.get('excludeInvisibles'); }
	public setExcludeInvisibles(v: boolean): this { return this.set('excludeInvisibles', v); }

	public getAutoSizeDisabled(): boolean { return this.get('autoSizeDisabled'); }
	public setAutoSizeDisabled(v: boolean): this { return this.set('autoSizeDisabled', v); }

	public getMainGridIndex(): number { return this.get('mainGridIndex'); }
	public setMainGridIndex(v: number): this { return this.set('mainGridIndex', v); }
}
