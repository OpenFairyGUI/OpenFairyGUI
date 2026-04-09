import type { Nullable } from '../constants.js';
import { PropertyType } from '../constants.js';
import { GObject, type IGObject } from './g-object.js';

interface IGMovieClip extends IGObject {
	src: string;
	playing: boolean;
	frame: number;
	color: string;
}

/**
 * A movie clip (frame animation) display object.
 * @category Properties
 */
export class GMovieClip extends GObject {
	public declare propertyType: PropertyType.G_MOVIE_CLIP;

	protected init(): void {
		this.propertyType = PropertyType.G_MOVIE_CLIP;
	}

	protected getDefaults(): Nullable<IGMovieClip> {
		return Object.assign(super.getDefaults(), {
			src: '',
			playing: true,
			frame: 0,
			color: '#FFFFFF',
		});
	}

	public getSrc(): string { return this.get('src' as any); }
	public setSrc(v: string): this { return this.set('src' as any, v); }

	public getPlaying(): boolean { return this.get('playing' as any); }
	public setPlaying(v: boolean): this { return this.set('playing' as any, v); }

	public getFrame(): number { return this.get('frame' as any); }
	public setFrame(v: number): this { return this.set('frame' as any, v); }

	public getColor(): string { return this.get('color' as any); }
	public setColor(v: string): this { return this.set('color' as any, v); }
}
