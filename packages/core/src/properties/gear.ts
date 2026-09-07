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
	pageValues: Record<string, string | null>;
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
	public setGearType(v: number): this {
		const stringValues = v === GearType.Text || v === GearType.Icon;
		if (stringValues === this.hasStringValues()) return this.set('gearType', v);
		const values = this.getValues();
		const pageValues = stringValues ? this.parseDelimitedValues(values) : {};
		this.set('gearType', v);
		this.set('values', stringValues ? '' : values);
		return this.set('pageValues', pageValues);
	}

	public getController(): Controller | null { return this.getRef('controller' as never) as Controller | null; }
	public setController(ctrl: Controller | null): this { return this.setRef('controller' as never, ctrl as never); }

	public getPages(): string { return this.get('pages'); }
	public setPages(v: string): this {
		this.set('pages', v);
		if (this.hasStringValues()) {
			const values = this.getPageValues();
			this.setPageValues(Object.fromEntries((v ? v.split(',') : []).map((page) => [page, values[page] ?? null])));
		}
		return this;
	}

	/** Delimited protocol values. Text/Icon states are owned by pageValues. */
	public getValues(): string {
		if (!this.hasStringValues()) return this.get('values');
		const values = this.getPageValues();
		return (this.getPages() ? this.getPages().split(',') : []).map((page) => {
			const value = values[page];
			if (value === null || value === undefined || value.includes('|')) {
				throw new Error('Text/Icon gear states containing null or "|" require getPageValues().');
			}
			return value;
		}).join('|');
	}
	public setValues(v: string): this {
		if (!this.hasStringValues()) return this.set('values', v);
		return this.setPageValues(this.parseDelimitedValues(v));
	}

	private parseDelimitedValues(v: string): Record<string, string | null> {
		const pages = this.getPages() ? this.getPages().split(',') : [];
		const values = v.split('|');
		if (v !== '' && values.length > pages.length) {
			throw new Error('Text/Icon gear delimited values require a matching page for every value.');
		}
		return Object.fromEntries(pages.map((page, index) => [page, values[index] ?? '']));
	}

	public getCondition(): string { return this.get('condition'); }
	public setCondition(v: string): this { return this.set('condition', v); }

	public getDefaultValue(): unknown { return this.get('defaultValue' as never) as unknown; }
	public setDefaultValue(v: unknown): this { return this.set('defaultValue' as never, v as never); }

	public getPageValues(): Record<string, string | null> { return { ...this.get('pageValues') }; }
	public setPageValues(v: Record<string, string | null>): this {
		if (Object.values(v).some((value) => value !== null && typeof value !== 'string')) {
			throw new Error('Gear page values must be strings or null.');
		}
		return this.set('pageValues', { ...v });
	}

	public setPageValue(pageId: string, value: string | null): this {
		const values = { ...this.getPageValues(), [pageId]: value };
		return this.setPageValues(values);
	}

	public getPageValue(pageId: string): unknown {
		return this.getPageValues()[pageId] ?? this.getDefaultValue();
	}

	private hasStringValues(): boolean {
		return this.getGearType() === GearType.Text || this.getGearType() === GearType.Icon;
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
