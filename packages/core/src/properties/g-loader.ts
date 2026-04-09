import { type Nullable, PropertyType, LoaderFillType, FillMethod, FillOrigin } from '../constants.js';
import { GObject, type IGObject } from './g-object.js';

export interface IGLoader extends IGObject {
	url: string;
	fill: number;
	shrinkOnly: boolean;
	autoSize: boolean;
	useResize: boolean;
	align: number;
	vAlign: number;
	frame: number;
	playing: boolean;
	color: string;
	fillMethod: number;
	fillOrigin: number;
	fillClockwise: boolean;
	fillAmount: number;
}

/**
 * A loader display object that loads external or package resources by URL.
 * @category Properties
 */
export class GLoader extends GObject<IGLoader, PropertyType.G_LOADER> {
	public declare propertyType: PropertyType.G_LOADER;

	protected init(): void {
		this.propertyType = PropertyType.G_LOADER;
	}

	protected getDefaults(): Nullable<IGLoader> {
		return Object.assign(super.getDefaults(), {
			url: '',
			fill: LoaderFillType.None,
			shrinkOnly: false,
			autoSize: false,
			useResize: false,
			align: 0,
			vAlign: 0,
			frame: 0,
			playing: true,
			color: '#FFFFFF',
			fillMethod: FillMethod.None,
			fillOrigin: FillOrigin.Top,
			fillClockwise: true,
			fillAmount: 100,
		});
	}

	public getUrl(): string { return this.get('url'); }
	public setUrl(v: string): this { return this.set('url', v); }

	public getFill(): number { return this.get('fill'); }
	public setFill(v: number): this { return this.set('fill', v); }

	public getShrinkOnly(): boolean { return this.get('shrinkOnly'); }
	public setShrinkOnly(v: boolean): this { return this.set('shrinkOnly', v); }

	public getAutoSize(): boolean { return this.get('autoSize'); }
	public setAutoSize(v: boolean): this { return this.set('autoSize', v); }

	public getUseResize(): boolean { return this.get('useResize'); }
	public setUseResize(v: boolean): this { return this.set('useResize', v); }

	public getAlign(): number { return this.get('align'); }
	public setAlign(v: number): this { return this.set('align', v); }

	public getVAlign(): number { return this.get('vAlign'); }
	public setVAlign(v: number): this { return this.set('vAlign', v); }

	public getFrame(): number { return this.get('frame'); }
	public setFrame(v: number): this { return this.set('frame', v); }

	public getPlaying(): boolean { return this.get('playing'); }
	public setPlaying(v: boolean): this { return this.set('playing', v); }

	public getColor(): string { return this.get('color'); }
	public setColor(v: string): this { return this.set('color', v); }

	public getFillMethod(): number { return this.get('fillMethod'); }
	public setFillMethod(v: number): this { return this.set('fillMethod', v); }

	public getFillOrigin(): number { return this.get('fillOrigin'); }
	public setFillOrigin(v: number): this { return this.set('fillOrigin', v); }

	public getFillClockwise(): boolean { return this.get('fillClockwise'); }
	public setFillClockwise(v: boolean): this { return this.set('fillClockwise', v); }

	public getFillAmount(): number { return this.get('fillAmount'); }
	public setFillAmount(v: number): this { return this.set('fillAmount', v); }
}
