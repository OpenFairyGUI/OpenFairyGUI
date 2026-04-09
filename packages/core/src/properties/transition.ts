import { RefList } from 'property-graph';
import { type Nullable, PropertyType } from '../constants.js';
import { ExtensibleProperty, type IExtensibleProperty } from './extensible-property.js';
import type { TransitionItem } from './transition-item.js';

interface ITransition extends IExtensibleProperty {
	autoPlay: boolean;
	autoPlayTimes: number;
	autoPlayDelay: number;
	options: number;
	fps: number;
	items: RefList<TransitionItem>;
}

/**
 * A transition defines an animation timeline for a component.
 * @category Properties
 */
export class Transition extends ExtensibleProperty<ITransition> {
	public declare propertyType: PropertyType.TRANSITION;

	protected init(): void {
		this.propertyType = PropertyType.TRANSITION;
	}

	protected getDefaults(): Nullable<ITransition> {
		return Object.assign(super.getDefaults(), {
			autoPlay: false,
			autoPlayTimes: 1,
			autoPlayDelay: 0,
			options: 0,
			fps: 24,
			items: new RefList<TransitionItem>(),
		});
	}

	public getAutoPlay(): boolean { return this.get('autoPlay'); }
	public setAutoPlay(v: boolean): this { return this.set('autoPlay', v); }

	public getAutoPlayTimes(): number { return this.get('autoPlayTimes'); }
	public setAutoPlayTimes(v: number): this { return this.set('autoPlayTimes', v); }

	public getAutoPlayDelay(): number { return this.get('autoPlayDelay'); }
	public setAutoPlayDelay(v: number): this { return this.set('autoPlayDelay', v); }

	public getOptions(): number { return this.get('options'); }
	public setOptions(v: number): this { return this.set('options', v); }

	public getFps(): number { return this.get('fps'); }
	public setFps(v: number): this { return this.set('fps', v); }

	public addItem(item: TransitionItem): this { return this.addRef('items', item); }
	public removeItem(item: TransitionItem): this { return this.removeRef('items', item); }
	public listItems(): TransitionItem[] { return this.listRefs('items'); }
}
