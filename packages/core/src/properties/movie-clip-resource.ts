import { RefList, type Ref } from 'property-graph';
import { type Nullable, PropertyType } from '../constants.js';
import { ExtensibleProperty, type IExtensibleProperty } from './extensible-property.js';
import type { MovieFrame } from './movie-frame.js';
import type { FairyBuffer } from './buffer.js';

interface IMovieClipResource extends IExtensibleProperty {
	id: string;
	path: string;
	branch: string;
	branchItemIds: string[];
	highResolutionItemIds: Array<string | null>;
	fileName: string;
	exported: boolean;
	favorite: boolean;
	textureSetMode: string;
	width: number;
	height: number;
	interval: number;
	swing: boolean;
	repeatDelay: number;
	smoothing: boolean;
	frames: RefList<MovieFrame>;
	sourceData: Ref<FairyBuffer>;
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
			highResolutionItemIds: [],
			fileName: '',
			exported: false,
			favorite: false,
			textureSetMode: '',
			width: 0,
			height: 0,
			interval: 0,
			swing: false,
			repeatDelay: 0,
			smoothing: true,
			frames: new RefList<MovieFrame>(),
			sourceData: null,
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

	public getHighResolutionItemIds(): Array<string | null> { return [...this.get('highResolutionItemIds')]; }
	public setHighResolutionItemIds(ids: Array<string | null>): this { return this.set('highResolutionItemIds', [...ids]); }

	public getFileName(): string { return this.get('fileName'); }
	public setFileName(fileName: string): this { return this.set('fileName', fileName); }

	public getExported(): boolean { return this.get('exported'); }
	public setExported(v: boolean): this { return this.set('exported', v); }

	public getFavorite(): boolean { return this.get('favorite'); }
	public setFavorite(v: boolean): this { return this.set('favorite', v); }

	public getTextureSetMode(): string { return this.get('textureSetMode'); }
	public setTextureSetMode(v: string): this { return this.set('textureSetMode', v); }

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

	/** Primary source-file bytes for this movie-clip resource. */
	public getSourceData(): FairyBuffer | null { return this.getRef('sourceData' as never) as FairyBuffer | null; }
	public setSourceData(buffer: FairyBuffer | null): this { return this.setRef('sourceData' as never, buffer as never); }
}
