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
