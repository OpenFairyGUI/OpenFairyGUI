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
	packageId: string;
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
			packageId: '',
			filter: '',
			filterData: '',
			playing: true,
			frame: 0,
			color: '#FFFFFF',
		});
	}

	public getSrc(): string {
		return this.get('src');
	}
	public setSrc(v: string): this {
		return this.set('src', v);
	}

	public getX(): number {
		return this.get('x');
	}
	public getY(): number {
		return this.get('y');
	}
	public getWidth(): number {
		return this.get('width');
	}
	public getHeight(): number {
		return this.get('height');
	}
	public setXY(x: number, y: number): this {
		this.set('x', x);
		return this.set('y', y);
	}
	public setSize(w: number, h: number): this {
		this.set('width', w);
		return this.set('height', h);
	}
	public setX(v: number): this {
		return this.set('x', v);
	}
	public setY(v: number): this {
		return this.set('y', v);
	}

	public getPivotX(): number {
		return this.get('pivotX');
	}
	public getPivotY(): number {
		return this.get('pivotY');
	}
	public getPivotAsAnchor(): boolean {
		return this.get('anchor');
	}
	public setPivot(x: number, y: number, anchor = false): this {
		this.set('pivotX', x);
		this.set('pivotY', y);
		return this.set('anchor', anchor);
	}

	public getGroup(): string {
		return this.get('group');
	}
	public setGroup(v: string): this {
		return this.set('group', v);
	}

	public getAlpha(): number {
		return this.get('alpha');
	}
	public setAlpha(v: number): this {
		return this.set('alpha', v);
	}

	public getRotation(): number {
		return this.get('rotation');
	}
	public setRotation(v: number): this {
		return this.set('rotation', v);
	}

	public getVisible(): boolean {
		return this.get('visible');
	}
	public setVisible(v: boolean): this {
		return this.set('visible', v);
	}

	public getTouchable(): boolean {
		return this.get('touchable');
	}
	public setTouchable(v: boolean): this {
		return this.set('touchable', v);
	}

	public getGrayed(): boolean {
		return this.get('grayed');
	}
	public setGrayed(v: boolean): this {
		return this.set('grayed', v);
	}

	public getFileName(): string {
		return this.get('fileName');
	}
	public setFileName(v: string): this {
		return this.set('fileName', v);
	}

	public getPackageId(): string {
		return this.get('packageId');
	}
	public setPackageId(v: string): this {
		return this.set('packageId', v);
	}

	public getFilter(): string {
		return this.get('filter');
	}
	public setFilter(v: string): this {
		return this.set('filter', v);
	}

	public getFilterData(): string {
		return this.get('filterData');
	}
	public setFilterData(v: string): this {
		return this.set('filterData', v);
	}

	public getPlaying(): boolean {
		return this.get('playing');
	}
	public setPlaying(v: boolean): this {
		return this.set('playing', v);
	}

	public getFrame(): number {
		return this.get('frame');
	}
	public setFrame(v: number): this {
		return this.set('frame', v);
	}

	public getColor(): string {
		return this.get('color');
	}
	public setColor(v: string): this {
		return this.set('color', v);
	}
}
