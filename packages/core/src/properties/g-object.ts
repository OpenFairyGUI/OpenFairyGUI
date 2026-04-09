import { RefList } from 'property-graph';
import { type Nullable, PropertyType, type RelationDef } from '../constants.js';
import { ExtensibleProperty, type IExtensibleProperty } from './extensible-property.js';
import type { Gear } from './gear.js';

export interface IGObject extends IExtensibleProperty {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	sourceWidth: number;
	sourceHeight: number;
	initWidth: number;
	initHeight: number;
	pivotX: number;
	pivotY: number;
	anchor: boolean;
	scaleX: number;
	scaleY: number;
	skewX: number;
	skewY: number;
	rotation: number;
	alpha: number;
	visible: boolean;
	touchable: boolean;
	grayed: boolean;
	tooltips: string;
	customData: string;
	group: string;
	relations: RelationDef[];
	gears: RefList<Gear>;
}

/**
 * Base class for all display objects in FairyGUI.
 *
 * GObject represents a single visual element that can be placed in a component's
 * display list. All display object types (GImage, GTextField, GComponent, etc.)
 * extend this class.
 *
 * @category Properties
 */
export class GObject<
	TProps extends IGObject = IGObject,
	TType extends PropertyType = PropertyType,
> extends ExtensibleProperty<TProps> {
	public declare propertyType: TType;

	protected init(): void {
		this.propertyType = PropertyType.G_OBJECT as TType;
	}

	protected getDefaults(): Nullable<TProps> {
		return Object.assign(super.getDefaults(), {
			id: '',
			x: 0,
			y: 0,
			width: 0,
			height: 0,
			sourceWidth: 0,
			sourceHeight: 0,
			initWidth: 0,
			initHeight: 0,
			pivotX: 0,
			pivotY: 0,
			anchor: false,
			scaleX: 1,
			scaleY: 1,
			skewX: 0,
			skewY: 0,
			rotation: 0,
			alpha: 1,
			visible: true,
			touchable: true,
			grayed: false,
			tooltips: '',
			customData: '',
			group: '',
			relations: [],
			gears: new RefList<Gear>(),
		}) as Nullable<TProps>;
	}

	protected getObjectProp<K extends keyof IGObject>(key: K): IGObject[K] {
		const self = this as unknown as GObject<IGObject, TType>;
		return self.get(key as never) as IGObject[K];
	}

	protected setObjectProp<K extends keyof IGObject>(key: K, value: IGObject[K]): this {
		const self = this as unknown as GObject<IGObject, TType>;
		return self.set(key as never, value as never) as this;
	}

	public getId(): string { return this.getObjectProp('id'); }
	public setId(id: string): this { return this.setObjectProp('id', id); }

	public getX(): number { return this.getObjectProp('x'); }
	public getY(): number { return this.getObjectProp('y'); }
	public setXY(x: number, y: number): this { this.setObjectProp('x', x); return this.setObjectProp('y', y); }
	public setX(x: number): this { return this.setObjectProp('x', x); }
	public setY(y: number): this { return this.setObjectProp('y', y); }

	public getWidth(): number { return this.getObjectProp('width'); }
	public getHeight(): number { return this.getObjectProp('height'); }
	public setSize(w: number, h: number): this { this.setObjectProp('width', w); return this.setObjectProp('height', h); }

	public getSourceWidth(): number { return this.getObjectProp('sourceWidth'); }
	public setSourceWidth(v: number): this { return this.setObjectProp('sourceWidth', v); }
	public getSourceHeight(): number { return this.getObjectProp('sourceHeight'); }
	public setSourceHeight(v: number): this { return this.setObjectProp('sourceHeight', v); }

	public getInitWidth(): number { return this.getObjectProp('initWidth'); }
	public setInitWidth(v: number): this { return this.setObjectProp('initWidth', v); }
	public getInitHeight(): number { return this.getObjectProp('initHeight'); }
	public setInitHeight(v: number): this { return this.setObjectProp('initHeight', v); }

	public getPivotX(): number { return this.getObjectProp('pivotX'); }
	public getPivotY(): number { return this.getObjectProp('pivotY'); }
	public getPivotAsAnchor(): boolean { return this.getObjectProp('anchor'); }
	public setPivot(x: number, y: number, anchor = false): this {
		this.setObjectProp('pivotX', x);
		this.setObjectProp('pivotY', y);
		return this.setObjectProp('anchor', anchor);
	}
	public setPivotAsAnchor(anchor: boolean): this { return this.setObjectProp('anchor', anchor); }

	public getScaleX(): number { return this.getObjectProp('scaleX'); }
	public getScaleY(): number { return this.getObjectProp('scaleY'); }
	public setScale(x: number, y: number): this { this.setObjectProp('scaleX', x); return this.setObjectProp('scaleY', y); }

	public getSkewX(): number { return this.getObjectProp('skewX'); }
	public getSkewY(): number { return this.getObjectProp('skewY'); }
	public setSkew(x: number, y: number): this { this.setObjectProp('skewX', x); return this.setObjectProp('skewY', y); }

	public getRotation(): number { return this.getObjectProp('rotation'); }
	public setRotation(v: number): this { return this.setObjectProp('rotation', v); }

	public getAlpha(): number { return this.getObjectProp('alpha'); }
	public setAlpha(v: number): this { return this.setObjectProp('alpha', v); }

	public getVisible(): boolean { return this.getObjectProp('visible'); }
	public setVisible(v: boolean): this { return this.setObjectProp('visible', v); }

	public getTouchable(): boolean { return this.getObjectProp('touchable'); }
	public setTouchable(v: boolean): this { return this.setObjectProp('touchable', v); }

	public getGrayed(): boolean { return this.getObjectProp('grayed'); }
	public setGrayed(v: boolean): this { return this.setObjectProp('grayed', v); }

	public getTooltips(): string { return this.getObjectProp('tooltips'); }
	public setTooltips(v: string): this { return this.setObjectProp('tooltips', v); }

	public getCustomData(): string { return this.getObjectProp('customData'); }
	public setCustomData(v: string): this { return this.setObjectProp('customData', v); }

	public getGroup(): string { return this.getObjectProp('group'); }
	public setGroup(v: string): this { return this.setObjectProp('group', v); }

	/****** Relations ******/

	public getRelations(): RelationDef[] { return this.getObjectProp('relations'); }
	public setRelations(relations: RelationDef[]): this { return this.setObjectProp('relations', relations); }
	public addRelation(relation: RelationDef): this {
		const relations = [...this.getRelations(), relation];
		return this.setObjectProp('relations', relations);
	}

	/****** Gears ******/

	public addGear(gear: Gear): this { return this.addRef('gears' as never, gear as never); }
	public removeGear(gear: Gear): this { return this.removeRef('gears' as never, gear as never); }
	public listGears(): Gear[] { return this.listRefs('gears' as never) as unknown as Gear[]; }
}
