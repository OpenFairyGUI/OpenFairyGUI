import type { Nullable } from '../constants.js';
import { PropertyType } from '../constants.js';
import { GObject, type IGObject } from './g-object.js';

export interface IGMovieClip extends IGObject {
	src: string;
	x: number;
	y: number;
	width: number;
	height: number;
	pivotX: number;
	pivotY: number;
	group: string;
	alpha: number;
	rotation: number;
	visible: boolean;
	touchable: boolean;
	grayed: boolean;
	fileName: string;
	filter: string;
	filterData: string;
	playing: boolean;
	frame: number;
	color: string;
}

/**
 * A movie clip (frame animation) display object.
 * @category Properties
 */
export class GMovieClip extends GObject<IGMovieClip, PropertyType.G_MOVIE_CLIP> {
	public declare propertyType: PropertyType.G_MOVIE_CLIP;

	protected init(): void {
		this.propertyType = PropertyType.G_MOVIE_CLIP;
	}

	protected getDefaults(): Nullable<IGMovieClip> {
		return Object.assign(super.getDefaults(), {
			src: '',
			x: 0,
			y: 0,
			width: 0,
			height: 0,
			pivotX: 0,
			pivotY: 0,
			group: '',
			alpha: 1,
			rotation: 0,
			visible: true,
			touchable: true,
			grayed: false,
			fileName: '',
			filter: '',
			filterData: '',
			playing: true,
			frame: 0,
			color: '#FFFFFF',
		});
	}

	public getSrc(): string { return this.get('src' as any); }
	public setSrc(v: string): this { return this.set('src' as any, v); }

	public getX(): number { return this.get('x' as any); }
	public getY(): number { return this.get('y' as any); }
	public getWidth(): number { return this.get('width' as any); }
	public getHeight(): number { return this.get('height' as any); }
	public setXY(x: number, y: number): this {
		this.set('x' as any, x);
		return this.set('y' as any, y);
	}
	public setSize(w: number, h: number): this {
		this.set('width' as any, w);
		return this.set('height' as any, h);
	}
	public setX(v: number): this { return this.set('x' as any, v); }
	public setY(v: number): this { return this.set('y' as any, v); }

	public getPivotX(): number { return this.get('pivotX' as any); }
	public getPivotY(): number { return this.get('pivotY' as any); }
	public setPivot(x: number, y: number): this {
		this.set('pivotX' as any, x);
		return this.set('pivotY' as any, y);
	}

	public getGroup(): string { return this.get('group' as any); }
	public setGroup(v: string): this { return this.set('group' as any, v); }

	public getAlpha(): number { return this.get('alpha' as any); }
	public setAlpha(v: number): this { return this.set('alpha' as any, v); }

	public getRotation(): number { return this.get('rotation' as any); }
	public setRotation(v: number): this { return this.set('rotation' as any, v); }

	public getVisible(): boolean { return this.get('visible' as any); }
	public setVisible(v: boolean): this { return this.set('visible' as any, v); }

	public getTouchable(): boolean { return this.get('touchable' as any); }
	public setTouchable(v: boolean): this { return this.set('touchable' as any, v); }

	public getGrayed(): boolean { return this.get('grayed' as any); }
	public setGrayed(v: boolean): this { return this.set('grayed' as any, v); }

	public getFileName(): string { return this.get('fileName' as any); }
	public setFileName(v: string): this { return this.set('fileName' as any, v); }

	public getFilter(): string { return this.get('filter' as any); }
	public setFilter(v: string): this { return this.set('filter' as any, v); }

	public getFilterData(): string { return this.get('filterData' as any); }
	public setFilterData(v: string): this { return this.set('filterData' as any, v); }

	public getPlaying(): boolean { return this.get('playing' as any); }
	public setPlaying(v: boolean): this { return this.set('playing' as any, v); }

	public getFrame(): number { return this.get('frame' as any); }
	public setFrame(v: number): this { return this.set('frame' as any, v); }

	public getColor(): string { return this.get('color' as any); }
	public setColor(v: string): this { return this.set('color' as any, v); }
}
