import { type Nullable, PropertyType, GraphType } from '../constants.js';
import { GObject, type IGObject } from './g-object.js';

export interface IGGraph extends IGObject {
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
