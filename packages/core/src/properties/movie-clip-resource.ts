import { RefList } from 'property-graph';
import { type Nullable, PropertyType } from '../constants.js';
import { ExtensibleProperty, type IExtensibleProperty } from './extensible-property.js';
import type { MovieFrame } from './movie-frame.js';

interface IMovieClipResource extends IExtensibleProperty {
	id: string;
	path: string;
	branch: string;
	branchItemIds: string[];
	fileName: string;
	exported: boolean;
	width: number;
	height: number;
	interval: number;
	swing: boolean;
	repeatDelay: number;
	smoothing: boolean;
	frames: RefList<MovieFrame>;
}

/**
 * A movie clip (frame animation) resource within a FairyGUI package.
 * @category Properties
 */
export class MovieClipResource extends ExtensibleProperty<IMovieClipResource> {
	public declare propertyType: PropertyType.MOVIE_CLIP_RESOURCE;

	protected init(): void {
		this.propertyType = PropertyType.MOVIE_CLIP_RESOURCE;
	}

	protected getDefaults(): Nullable<IMovieClipResource> {
		return Object.assign(super.getDefaults(), {
			id: '',
			path: '',
			branch: '',
			branchItemIds: [],
			fileName: '',
			exported: false,
			width: 0,
			height: 0,
			interval: 0,
			swing: false,
			repeatDelay: 0,
			smoothing: true,
			frames: new RefList<MovieFrame>(),
		});
	}

	public getId(): string { return this.get('id'); }
	public setId(id: string): this { return this.set('id', id); }

	public getPath(): string { return this.get('path'); }
	public setPath(path: string): this { return this.set('path', path); }

	public getBranch(): string { return this.get('branch'); }
	public setBranch(branch: string): this { return this.set('branch', branch); }

	public getBranchItemIds(): string[] { return [...this.get('branchItemIds')]; }
	public setBranchItemIds(ids: string[]): this { return this.set('branchItemIds', [...ids]); }

	public getFileName(): string { return this.get('fileName'); }
	public setFileName(fileName: string): this { return this.set('fileName', fileName); }

	public getExported(): boolean { return this.get('exported'); }
	public setExported(v: boolean): this { return this.set('exported', v); }

	public getWidth(): number { return this.get('width'); }
	public setWidth(v: number): this { return this.set('width', v); }

	public getHeight(): number { return this.get('height'); }
	public setHeight(v: number): this { return this.set('height', v); }

	public getInterval(): number { return this.get('interval'); }
	public setInterval(v: number): this { return this.set('interval', v); }

	public getSwing(): boolean { return this.get('swing'); }
	public setSwing(v: boolean): this { return this.set('swing', v); }

	public getRepeatDelay(): number { return this.get('repeatDelay'); }
	public setRepeatDelay(v: number): this { return this.set('repeatDelay', v); }

	public getSmoothing(): boolean { return this.get('smoothing'); }
	public setSmoothing(v: boolean): this { return this.set('smoothing', v); }

	public addFrame(frame: MovieFrame): this { return this.addRef('frames', frame); }
	public removeFrame(frame: MovieFrame): this { return this.removeRef('frames', frame); }
	public listFrames(): MovieFrame[] { return this.listRefs('frames'); }
}
