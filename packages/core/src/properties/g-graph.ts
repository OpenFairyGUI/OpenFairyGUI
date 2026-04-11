import { type Nullable, PropertyType, GraphType } from '../constants.js';
import { GObject, type IGObject } from './g-object.js';

export interface IGGraph extends IGObject {
	x: number;
	y: number;
	width: number;
	height: number;
	locked: boolean;
	minWidth: number;
	maxWidth: number;
	minHeight: number;
	maxHeight: number;
	pivotX: number;
	pivotY: number;
	anchor: boolean;
	group: string;
	alpha: number;
	rotation: number;
	visible: boolean;
	touchable: boolean;
	grayed: boolean;
	skewX: number;
	skewY: number;
	graphType: number;
	lineSize: number;
	lineColor: string;
	fillColor: string;
	cornerRadius: [number, number, number, number] | null;
	points: number[] | null;
	sides: number;
	startAngle: number;
	distances: number[] | null;
}

/**
 * A vector shape display object (rect, ellipse, polygon).
 * @category Properties
 */
export class GGraph extends GObject<IGGraph, PropertyType.G_GRAPH> {
	public declare propertyType: PropertyType.G_GRAPH;

	protected init(): void {
		this.propertyType = PropertyType.G_GRAPH;
	}

	protected getDefaults(): Nullable<IGGraph> {
		return Object.assign(super.getDefaults(), {
			x: 0,
			y: 0,
			width: 0,
			height: 0,
			locked: false,
			minWidth: 0,
			maxWidth: 0,
			minHeight: 0,
			maxHeight: 0,
			pivotX: 0,
			pivotY: 0,
			anchor: false,
			group: '',
			alpha: 1,
			rotation: 0,
			visible: true,
			touchable: true,
			grayed: false,
			skewX: 0,
			skewY: 0,
			graphType: GraphType.Empty,
			lineSize: 1,
			lineColor: '#000000',
			fillColor: '#FFFFFF',
			cornerRadius: null,
			points: null,
			sides: 0,
			startAngle: 0,
			distances: null,
		});
	}

	public getGraphType(): number { return this.get('graphType'); }
	public setGraphType(v: number): this { return this.set('graphType', v); }

	public getX(): number { return this.get('x'); }
	public getY(): number { return this.get('y'); }
	public getWidth(): number { return this.get('width'); }
	public getHeight(): number { return this.get('height'); }
	public getLocked(): boolean { return this.get('locked'); }
	public getMinWidth(): number { return this.get('minWidth'); }
	public getMaxWidth(): number { return this.get('maxWidth'); }
	public getMinHeight(): number { return this.get('minHeight'); }
	public getMaxHeight(): number { return this.get('maxHeight'); }
	public setXY(x: number, y: number): this {
		this.set('x', x);
		return this.set('y', y);
	}
	public setSize(w: number, h: number): this {
		this.set('width', w);
		return this.set('height', h);
	}
	public setLocked(v: boolean): this { return this.set('locked', v); }
	public setMinWidth(v: number): this { return this.set('minWidth', v); }
	public setMaxWidth(v: number): this { return this.set('maxWidth', v); }
	public setMinHeight(v: number): this { return this.set('minHeight', v); }
	public setMaxHeight(v: number): this { return this.set('maxHeight', v); }
	public setX(v: number): this { return this.set('x', v); }
	public setY(v: number): this { return this.set('y', v); }

	public getPivotX(): number { return this.get('pivotX'); }
	public getPivotY(): number { return this.get('pivotY'); }
	public getPivotAsAnchor(): boolean { return this.get('anchor'); }
	public setPivot(x: number, y: number, anchor = false): this {
		this.set('pivotX', x);
		this.set('pivotY', y);
		return this.set('anchor', anchor);
	}
	public setPivotAsAnchor(v: boolean): this { return this.set('anchor', v); }

	public getGroup(): string { return this.get('group'); }
	public setGroup(v: string): this { return this.set('group', v); }

	public getSkewX(): number { return this.get('skewX'); }
	public getSkewY(): number { return this.get('skewY'); }
	public setSkew(x: number, y: number): this {
		this.set('skewX', x);
		return this.set('skewY', y);
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

	public getLineSize(): number { return this.get('lineSize'); }
	public setLineSize(v: number): this { return this.set('lineSize', v); }

	public getLineColor(): string { return this.get('lineColor'); }
	public setLineColor(v: string): this { return this.set('lineColor', v); }

	public getFillColor(): string { return this.get('fillColor'); }
	public setFillColor(v: string): this { return this.set('fillColor', v); }

	public getCornerRadius(): [number, number, number, number] | null { return this.get('cornerRadius'); }
	public setCornerRadius(v: [number, number, number, number] | null): this { return this.set('cornerRadius', v); }

	public getPoints(): number[] | null { return this.get('points'); }
	public setPoints(v: number[] | null): this { return this.set('points', v); }

	public getSides(): number { return this.get('sides'); }
	public setSides(v: number): this { return this.set('sides', v); }

	public getStartAngle(): number { return this.get('startAngle'); }
	public setStartAngle(v: number): this { return this.set('startAngle', v); }

	public getDistances(): number[] | null { return this.get('distances'); }
	public setDistances(v: number[] | null): this { return this.set('distances', v); }
}
