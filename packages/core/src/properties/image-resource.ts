import type { Ref } from 'property-graph';
import { type Nullable, PropertyType } from '../constants.js';
import { ExtensibleProperty, type IExtensibleProperty } from './extensible-property.js';
import type { FairyBuffer } from './buffer.js';

export interface PixelHitTestData {
	pixelWidth: number;
	scaleDenominator: number;
	pixels: Uint8Array;
}

interface IImageResource extends IExtensibleProperty {
	id: string;
	path: string;
	width: number;
	height: number;
	exported: boolean;
	qualityOption: string;
	smoothing: boolean;
	duplicatePadding: boolean;
	scaleOption: number;
	scale9Grid: [number, number, number, number] | null;
	tileGridIndice: number;
	imageData: Ref<FairyBuffer>;
	pixelHitTestPixelWidth: number;
	pixelHitTestScaleDenominator: number;
	pixelHitTestPixels: Uint8Array | null;
}

/**
 * An image resource within a FairyGUI package.
 * @category Properties
 */
export class ImageResource extends ExtensibleProperty<IImageResource> {
	public declare propertyType: PropertyType.IMAGE_RESOURCE;

	protected init(): void {
		this.propertyType = PropertyType.IMAGE_RESOURCE;
	}

	protected getDefaults(): Nullable<IImageResource> {
		return Object.assign(super.getDefaults(), {
			id: '',
			path: '',
			width: 0,
			height: 0,
			exported: false,
			qualityOption: '',
			smoothing: true,
			duplicatePadding: false,
			scaleOption: 0,
			scale9Grid: null,
			tileGridIndice: 0,
			imageData: null,
			pixelHitTestPixelWidth: 0,
			pixelHitTestScaleDenominator: 1,
			pixelHitTestPixels: null,
		});
	}

	public getId(): string { return this.get('id'); }
	public setId(id: string): this { return this.set('id', id); }

	public getPath(): string { return this.get('path'); }
	public setPath(path: string): this { return this.set('path', path); }

	public getWidth(): number { return this.get('width'); }
	public setWidth(w: number): this { return this.set('width', w); }

	public getHeight(): number { return this.get('height'); }
	public setHeight(h: number): this { return this.set('height', h); }

	public getExported(): boolean { return this.get('exported'); }
	public setExported(v: boolean): this { return this.set('exported', v); }

	public getQualityOption(): string { return this.get('qualityOption'); }
	public setQualityOption(v: string): this { return this.set('qualityOption', v); }

	public getSmoothing(): boolean { return this.get('smoothing'); }
	public setSmoothing(v: boolean): this { return this.set('smoothing', v); }

	public getDuplicatePadding(): boolean { return this.get('duplicatePadding'); }
	public setDuplicatePadding(v: boolean): this { return this.set('duplicatePadding', v); }

	public getScaleOption(): number { return this.get('scaleOption'); }
	public setScaleOption(v: number): this { return this.set('scaleOption', v); }

	public getScale9Grid(): [number, number, number, number] | null { return this.get('scale9Grid'); }
	public setScale9Grid(v: [number, number, number, number] | null): this { return this.set('scale9Grid', v); }

	public getTileGridIndice(): number { return this.get('tileGridIndice'); }
	public setTileGridIndice(v: number): this { return this.set('tileGridIndice', v); }

	public getImageData(): FairyBuffer | null { return this.getRef('imageData' as never) as FairyBuffer | null; }
	public setImageData(buffer: FairyBuffer | null): this { return this.setRef('imageData' as never, buffer as never); }

	public getPixelHitTestData(): PixelHitTestData | null {
		const pixelWidth = this.get('pixelHitTestPixelWidth');
		const scaleDenominator = this.get('pixelHitTestScaleDenominator');
		const pixels = this.get('pixelHitTestPixels');
		if (pixelWidth <= 0 || scaleDenominator <= 0 || !(pixels instanceof Uint8Array)) return null;
		return {
			pixelWidth,
			scaleDenominator,
			pixels,
		};
	}

	public setPixelHitTestData(data: PixelHitTestData | null): this {
		if (!data) {
			this.set('pixelHitTestPixelWidth', 0);
			this.set('pixelHitTestScaleDenominator', 1);
			return this.set('pixelHitTestPixels', null);
		}
		this.set('pixelHitTestPixelWidth', data.pixelWidth);
		this.set('pixelHitTestScaleDenominator', data.scaleDenominator);
		return this.set('pixelHitTestPixels', data.pixels);
	}
}
