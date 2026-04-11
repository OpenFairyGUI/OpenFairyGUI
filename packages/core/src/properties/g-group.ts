import { type Nullable, PropertyType, GroupLayoutType } from '../constants.js';
import { GObject, type IGObject } from './g-object.js';

interface IGGroup extends IGObject {
	x: number;
	y: number;
	width: number;
	height: number;
	locked: boolean;
	group: string;
	alpha: number;
	rotation: number;
	visible: boolean;
	touchable: boolean;
	grayed: boolean;
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
			x: 0,
			y: 0,
			width: 0,
			height: 0,
			locked: false,
			group: '',
			alpha: 1,
			rotation: 0,
			visible: true,
			touchable: true,
			grayed: false,
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

	public getX(): number { return this.get('x'); }
	public getY(): number { return this.get('y'); }
	public getWidth(): number { return this.get('width'); }
	public getHeight(): number { return this.get('height'); }
	public getLocked(): boolean { return this.get('locked'); }
	public setXY(x: number, y: number): this {
		this.set('x', x);
		return this.set('y', y);
	}
	public setSize(w: number, h: number): this {
		this.set('width', w);
		return this.set('height', h);
	}
	public setLocked(v: boolean): this { return this.set('locked', v); }
	public setX(v: number): this { return this.set('x', v); }
	public setY(v: number): this { return this.set('y', v); }

	public getAlpha(): number { return this.get('alpha'); }
	public setAlpha(v: number): this { return this.set('alpha', v); }

	public getRotation(): number { return this.get('rotation'); }
	public setRotation(v: number): this { return this.set('rotation', v); }

	public getVisible(): boolean { return this.get('visible'); }
	public setVisible(v: boolean): this { return this.set('visible', v); }

	public getGroup(): string { return this.get('group'); }
	public setGroup(v: string): this { return this.set('group', v); }

	public getTouchable(): boolean { return this.get('touchable'); }
	public setTouchable(v: boolean): this { return this.set('touchable', v); }

	public getGrayed(): boolean { return this.get('grayed'); }
	public setGrayed(v: boolean): this { return this.set('grayed', v); }

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
