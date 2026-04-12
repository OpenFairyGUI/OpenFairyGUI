import type { Nullable } from '../constants.js';
import { PropertyType } from '../constants.js';
import { GComponent, type IGComponent } from './g-component.js';

interface IGScrollBar extends IGComponent {
	src: string;
	fixedGripSize: boolean;
}

/**
 * A scrollbar display object.
 * @category Properties
 */
export class GScrollBar extends GComponent<IGScrollBar, PropertyType.G_SCROLL_BAR> {
	public declare propertyType: PropertyType.G_SCROLL_BAR;

	protected init(): void {
		this.propertyType = PropertyType.G_SCROLL_BAR;
	}

	protected getDefaults(): Nullable<IGScrollBar> {
		return Object.assign(super.getDefaults(), {
			src: '',
			fixedGripSize: false,
		});
	}

	public getSrc(): string { return this.get('src' as any); }
	public setSrc(v: string): this { return this.set('src' as any, v); }

	public getFixedGripSize(): boolean { return this.get('fixedGripSize' as any); }
	public setFixedGripSize(v: boolean): this { return this.set('fixedGripSize' as any, v); }
}
