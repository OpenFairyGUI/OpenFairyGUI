import { type Nullable, PropertyType, LoaderFillType } from '../constants.js';
import { GObject, type IGObject } from './g-object.js';

export interface IGLoader3D extends IGObject {
	url: string;
	fill: number;
	shrinkOnly: boolean;
	autoSize: boolean;
	align: number;
	vAlign: number;
	animationName: string;
	skinName: string;
	playing: boolean;
	frame: number;
	loop: boolean;
	color: string;
}

/**
 * A 3D loader display object for Spine / DragonBones style package items.
 * @category Properties
 */
export class GLoader3D extends GObject<IGLoader3D, PropertyType.G_LOADER_3D> {
	public declare propertyType: PropertyType.G_LOADER_3D;

	protected init(): void {
		this.propertyType = PropertyType.G_LOADER_3D;
	}

	protected getDefaults(): Nullable<IGLoader3D> {
		return Object.assign(super.getDefaults(), {
			url: '',
			fill: LoaderFillType.None,
			shrinkOnly: false,
			autoSize: false,
			align: 0,
			vAlign: 0,
			animationName: '',
			skinName: '',
			playing: true,
			frame: 0,
			loop: true,
			color: '#FFFFFF',
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

	public getAlign(): number { return this.get('align'); }
	public setAlign(v: number): this { return this.set('align', v); }

	public getVAlign(): number { return this.get('vAlign'); }
	public setVAlign(v: number): this { return this.set('vAlign', v); }

	public getAnimationName(): string { return this.get('animationName'); }
	public setAnimationName(v: string): this { return this.set('animationName', v); }

	public getSkinName(): string { return this.get('skinName'); }
	public setSkinName(v: string): this { return this.set('skinName', v); }

	public getPlaying(): boolean { return this.get('playing'); }
	public setPlaying(v: boolean): this { return this.set('playing', v); }

	public getFrame(): number { return this.get('frame'); }
	public setFrame(v: number): this { return this.set('frame', v); }

	public getLoop(): boolean { return this.get('loop'); }
	public setLoop(v: boolean): this { return this.set('loop', v); }

	public getColor(): string { return this.get('color'); }
	public setColor(v: string): this { return this.set('color', v); }
}
