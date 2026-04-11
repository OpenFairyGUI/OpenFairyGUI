import { type Nullable, PropertyType, FlipType, FillMethod, FillOrigin } from '../constants.js';
import { GObject, type IGObject } from './g-object.js';

export interface IGImage extends IGObject {
	src: string;
	x: number;
	y: number;
	width: number;
	height: number;
	locked: boolean;
	aspect: boolean;
	pivotX: number;
	pivotY: number;
	anchor: boolean;
	scaleX: number;
	scaleY: number;
	group: string;
	alpha: number;
	rotation: number;
	visible: boolean;
	touchable: boolean;
	grayed: boolean;
	skewX: number;
	skewY: number;
	tooltips: string;
	customData: string;
	fileName: string;
	packageId: string;
	filter: string;
	filterData: string;
	flip: number;
	color: string;
	fillMethod: number;
	fillOrigin: number;
	fillClockwise: boolean;
	fillAmount: number;
}

/**
 * An image display object.
 * @category Properties
 */
export class GImage extends GObject<IGImage, PropertyType.G_IMAGE> {
	public declare propertyType: PropertyType.G_IMAGE;

	protected init(): void {
		this.propertyType = PropertyType.G_IMAGE;
	}

	protected getDefaults(): Nullable<IGImage> {
		return Object.assign(super.getDefaults(), {
			src: '',
			x: 0,
			y: 0,
			width: 0,
			height: 0,
			locked: false,
			aspect: false,
			pivotX: 0,
			pivotY: 0,
			anchor: false,
			scaleX: 1,
			scaleY: 1,
			group: '',
			alpha: 1,
			rotation: 0,
			visible: true,
			touchable: true,
			grayed: false,
			skewX: 0,
			skewY: 0,
			tooltips: '',
			customData: '',
			fileName: '',
			packageId: '',
			filter: '',
			filterData: '',
			flip: FlipType.None,
			color: '#FFFFFF',
			fillMethod: FillMethod.None,
			fillOrigin: FillOrigin.Top,
			fillClockwise: true,
			fillAmount: 100,
		});
	}

	public getSrc(): string { return this.get('src'); }
	public setSrc(v: string): this { return this.set('src', v); }

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

	public getAspect(): boolean { return this.get('aspect'); }
	public setAspect(v: boolean): this { return this.set('aspect', v); }

	public getPivotX(): number { return this.get('pivotX'); }
	public getPivotY(): number { return this.get('pivotY'); }
	public getPivotAsAnchor(): boolean { return this.get('anchor'); }
	public setPivot(x: number, y: number, anchor = false): this {
		this.set('pivotX', x);
		this.set('pivotY', y);
		return this.set('anchor', anchor);
	}
	public setPivotAsAnchor(v: boolean): this { return this.set('anchor', v); }

	public getScaleX(): number { return this.get('scaleX'); }
	public getScaleY(): number { return this.get('scaleY'); }
	public setScale(x: number, y: number): this {
		this.set('scaleX', x);
		return this.set('scaleY', y);
	}

	public getGroup(): string { return this.get('group'); }
	public setGroup(v: string): this { return this.set('group', v); }

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

	public getSkewX(): number { return this.get('skewX'); }
	public getSkewY(): number { return this.get('skewY'); }
	public setSkew(x: number, y: number): this {
		this.set('skewX', x);
		return this.set('skewY', y);
	}

	public getTooltips(): string { return this.get('tooltips'); }
	public setTooltips(v: string): this { return this.set('tooltips', v); }

	public getCustomData(): string { return this.get('customData'); }
	public setCustomData(v: string): this { return this.set('customData', v); }

	public getFileName(): string { return this.get('fileName'); }
	public setFileName(v: string): this { return this.set('fileName', v); }

	public getPackageId(): string { return this.get('packageId'); }
	public setPackageId(v: string): this { return this.set('packageId', v); }

	public getFilter(): string { return this.get('filter'); }
	public setFilter(v: string): this { return this.set('filter', v); }

	public getFilterData(): string { return this.get('filterData'); }
	public setFilterData(v: string): this { return this.set('filterData', v); }

	public getFlip(): number { return this.get('flip'); }
	public setFlip(v: number): this { return this.set('flip', v); }

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
