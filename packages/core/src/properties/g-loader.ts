import { type Nullable, PropertyType, LoaderFillType, FillMethod, FillOrigin } from '../constants.js';
import { GObject, type IGObject } from './g-object.js';

export interface IGLoader extends IGObject {
	x: number;
	y: number;
	width: number;
	height: number;
	pivotX: number;
	pivotY: number;
	scaleX: number;
	scaleY: number;
	alpha: number;
	rotation: number;
	visible: boolean;
	touchable: boolean;
	grayed: boolean;
	url: string;
	filter: string;
	filterData: string;
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
	clearOnPublish: boolean;
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
			x: 0,
			y: 0,
			width: 0,
			height: 0,
			pivotX: 0,
			pivotY: 0,
			scaleX: 1,
			scaleY: 1,
			alpha: 1,
			rotation: 0,
			visible: true,
			touchable: true,
			grayed: false,
			url: '',
			filter: '',
			filterData: '',
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
			clearOnPublish: false,
		});
	}

	public getUrl(): string { return this.get('url'); }
	public setUrl(v: string): this { return this.set('url', v); }

	public getFilter(): string { return this.get('filter'); }
	public setFilter(v: string): this { return this.set('filter', v); }

	public getFilterData(): string { return this.get('filterData'); }
	public setFilterData(v: string): this { return this.set('filterData', v); }

	public getX(): number { return this.get('x'); }
	public getY(): number { return this.get('y'); }
	public getWidth(): number { return this.get('width'); }
	public getHeight(): number { return this.get('height'); }
	public setXY(x: number, y: number): this {
		this.set('x', x);
		return this.set('y', y);
	}
	public setSize(w: number, h: number): this {
		this.set('width', w);
		return this.set('height', h);
	}
	public setX(v: number): this { return this.set('x', v); }
	public setY(v: number): this { return this.set('y', v); }

	public getPivotX(): number { return this.get('pivotX'); }
	public getPivotY(): number { return this.get('pivotY'); }
	public setPivot(x: number, y: number): this {
		this.set('pivotX', x);
		return this.set('pivotY', y);
	}

	public getScaleX(): number { return this.get('scaleX'); }
	public getScaleY(): number { return this.get('scaleY'); }
	public setScale(x: number, y: number): this {
		this.set('scaleX', x);
		return this.set('scaleY', y);
	}

	public getAlpha(): number { return this.get('alpha'); }
	public setAlpha(v: number): this { return this.set('alpha', v); }

	public getRotation(): number { return this.get('rotation'); }
	public setRotation(v: number): this { return this.set('rotation', v); }

	public getVisible(): boolean { return this.get('visible'); }
	public setVisible(v: boolean): this { return this.set('visible', v); }

	public getTouchable(): boolean { return this.get('touchable'); }
	public setTouchable(v: boolean): this { return this.set('touchable', v); }

	public getGrayed(): boolean { return this.get('grayed'); }
	public setGrayed(v: boolean): this { return this.set('grayed', v); }

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

	public getClearOnPublish(): boolean { return this.get('clearOnPublish'); }
	public setClearOnPublish(v: boolean): this { return this.set('clearOnPublish', v); }
}
