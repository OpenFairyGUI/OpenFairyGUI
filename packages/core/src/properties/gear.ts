import type { Ref } from 'property-graph';
import { type Nullable, PropertyType, GearType } from '../constants.js';
import { type IProperty, Property } from './property.js';
import type { Controller } from './controller.js';

interface IGear extends IProperty {
	gearType: number;
	controller: Ref<Controller>;
	pages: string;
	values: string;
	condition: string;
	defaultValue: unknown;
	pageValues: Record<string, unknown>;
	positionsInPercent: boolean;
	tween: boolean;
	tweenDuration: number;
	tweenDelay: number;
	easeType: number;
	customEasePath: string;
}

/**
 * A gear binds a display object property to a controller, storing per-page values.
 *
 * Gear types (0-9): Display, XY, Size, Look, Color, Animation, Text, Icon, Display2, FontSize.
 *
 * @category Properties
 */
export class Gear extends Property<IGear> {
	public declare propertyType: PropertyType.GEAR;

	protected init(): void {
		this.propertyType = PropertyType.GEAR;
	}

	protected getDefaults(): Nullable<IGear> {
		return Object.assign(super.getDefaults(), {
			gearType: GearType.Display,
			controller: null,
			pages: '',
			values: '',
			condition: '',
			defaultValue: null,
			pageValues: {},
			positionsInPercent: false,
			tween: false,
			tweenDuration: 0.3,
			tweenDelay: 0,
			easeType: 5,
			customEasePath: '',
		});
	}

	public getGearType(): number { return this.get('gearType'); }
	public setGearType(v: number): this { return this.set('gearType', v); }

	public getController(): Controller | null { return this.getRef('controller' as never) as Controller | null; }
	public setController(ctrl: Controller | null): this { return this.setRef('controller' as never, ctrl as never); }

	public getPages(): string { return this.get('pages'); }
	public setPages(v: string): this { return this.set('pages', v); }

	public getValues(): string { return this.get('values'); }
	public setValues(v: string): this { return this.set('values', v); }

	public getCondition(): string { return this.get('condition'); }
	public setCondition(v: string): this { return this.set('condition', v); }

	public getDefaultValue(): unknown { return this.get('defaultValue' as never) as unknown; }
	public setDefaultValue(v: unknown): this { return this.set('defaultValue' as never, v as never); }

	public getPageValues(): Record<string, unknown> { return this.get('pageValues'); }
	public setPageValues(v: Record<string, unknown>): this { return this.set('pageValues', v); }

	public setPageValue(pageId: string, value: unknown): this {
		const values = { ...this.getPageValues(), [pageId]: value };
		return this.set('pageValues', values);
	}

	public getPageValue(pageId: string): unknown {
		return this.getPageValues()[pageId] ?? this.getDefaultValue();
	}

	public getPositionsInPercent(): boolean { return this.get('positionsInPercent'); }
	public setPositionsInPercent(v: boolean): this { return this.set('positionsInPercent', v); }

	public getTween(): boolean { return this.get('tween'); }
	public setTween(v: boolean): this { return this.set('tween', v); }

	public getTweenDuration(): number { return this.get('tweenDuration'); }
	public setTweenDuration(v: number): this { return this.set('tweenDuration', v); }

	public getTweenDelay(): number { return this.get('tweenDelay'); }
	public setTweenDelay(v: number): this { return this.set('tweenDelay', v); }

	public getEaseType(): number { return this.get('easeType'); }
	public setEaseType(v: number): this { return this.set('easeType', v); }

	public getCustomEasePath(): string { return this.get('customEasePath'); }
	public setCustomEasePath(v: string): this { return this.set('customEasePath', v); }
}
