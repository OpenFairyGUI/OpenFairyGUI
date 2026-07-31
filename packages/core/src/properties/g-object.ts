import { RefList } from 'property-graph';
import { type Nullable, PropertyType, type RelationDef } from '../constants.js';
import { ExtensibleProperty, type IExtensibleProperty } from './extensible-property.js';
import type { Gear } from './gear.js';

export interface IGObject extends IExtensibleProperty {
	id: string;
	sourceWidth: number;
	sourceHeight: number;
	initWidth: number;
	initHeight: number;
	locked: boolean;
	aspect: boolean;
	minWidth: number;
	maxWidth: number;
	minHeight: number;
	maxHeight: number;
	pivotX: number;
	pivotY: number;
	anchor: boolean;
	scaleX: number;
	scaleY: number;
	skewX: number;
	skewY: number;
	tooltips: string;
	blendMode: string;
	filter: string;
	filterData: string;
	customData: string;
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
			sourceWidth: 0,
			sourceHeight: 0,
			initWidth: 0,
			initHeight: 0,
			locked: false,
			aspect: false,
			minWidth: 0,
			maxWidth: 0,
			minHeight: 0,
			maxHeight: 0,
			pivotX: 0,
			pivotY: 0,
			anchor: false,
			scaleX: 1,
			scaleY: 1,
			skewX: 0,
			skewY: 0,
			tooltips: '',
			blendMode: 'normal',
			filter: '',
			filterData: '',
			customData: '',
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

	public getSourceWidth(): number { return this.getObjectProp('sourceWidth'); }
	public setSourceWidth(v: number): this { return this.setObjectProp('sourceWidth', v); }
	public getSourceHeight(): number { return this.getObjectProp('sourceHeight'); }
	public setSourceHeight(v: number): this { return this.setObjectProp('sourceHeight', v); }

	public getInitWidth(): number { return this.getObjectProp('initWidth'); }
	public setInitWidth(v: number): this { return this.setObjectProp('initWidth', v); }
	public getInitHeight(): number { return this.getObjectProp('initHeight'); }
	public setInitHeight(v: number): this { return this.setObjectProp('initHeight', v); }

	public getLocked(): boolean { return this.getObjectProp('locked'); }
	public setLocked(v: boolean): this { return this.setObjectProp('locked', v); }
	public getAspect(): boolean { return this.getObjectProp('aspect'); }
	public setAspect(v: boolean): this { return this.setObjectProp('aspect', v); }
	public getMinWidth(): number { return this.getObjectProp('minWidth'); }
	public setMinWidth(v: number): this { return this.setObjectProp('minWidth', v); }
	public getMaxWidth(): number { return this.getObjectProp('maxWidth'); }
	public setMaxWidth(v: number): this { return this.setObjectProp('maxWidth', v); }
	public getMinHeight(): number { return this.getObjectProp('minHeight'); }
	public setMinHeight(v: number): this { return this.setObjectProp('minHeight', v); }
	public getMaxHeight(): number { return this.getObjectProp('maxHeight'); }
	public setMaxHeight(v: number): this { return this.setObjectProp('maxHeight', v); }

	public getPivotX(): number { return this.getObjectProp('pivotX'); }
	public getPivotY(): number { return this.getObjectProp('pivotY'); }
	public getPivotAsAnchor(): boolean { return this.getObjectProp('anchor'); }
	public setPivot(x: number, y: number, anchor = false): this {
		this.setObjectProp('pivotX', x);
		this.setObjectProp('pivotY', y);
		return this.setObjectProp('anchor', anchor);
	}
	public setPivotAsAnchor(v: boolean): this { return this.setObjectProp('anchor', v); }

	public getScaleX(): number { return this.getObjectProp('scaleX'); }
	public getScaleY(): number { return this.getObjectProp('scaleY'); }
	public setScale(x: number, y: number): this {
		this.setObjectProp('scaleX', x);
		return this.setObjectProp('scaleY', y);
	}

	public getSkewX(): number { return this.getObjectProp('skewX'); }
	public getSkewY(): number { return this.getObjectProp('skewY'); }
	public setSkew(x: number, y: number): this {
		this.setObjectProp('skewX', x);
		return this.setObjectProp('skewY', y);
	}

	public getTooltips(): string { return this.getObjectProp('tooltips'); }
	public setTooltips(v: string): this { return this.setObjectProp('tooltips', v); }
	public getBlendMode(): string { return this.getObjectProp('blendMode'); }
	public setBlendMode(v: string): this { return this.setObjectProp('blendMode', v); }
	public getFilter(): string { return this.getObjectProp('filter'); }
	public setFilter(v: string): this { return this.setObjectProp('filter', v); }
	public getFilterData(): string { return this.getObjectProp('filterData'); }
	public setFilterData(v: string): this { return this.setObjectProp('filterData', v); }

	public getCustomData(): string { return this.getObjectProp('customData'); }
	public setCustomData(v: string): this { return this.setObjectProp('customData', v); }

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
