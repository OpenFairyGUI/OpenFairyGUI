import { type Nullable, PropertyType } from '../constants.js';
import { type IProperty, Property } from './property.js';

interface IBuffer extends IProperty {
	uri: string;
	mimeType: string;
	data: Uint8Array | null;
}

/**
 * A binary data buffer (e.g., image data, sound data).
 * @category Properties
 */
export class FairyBuffer extends Property<IBuffer> {
	public declare propertyType: PropertyType.BUFFER;

	protected init(): void {
		this.propertyType = PropertyType.BUFFER;
	}

	protected getDefaults(): Nullable<IBuffer> {
		return Object.assign(super.getDefaults(), {
			uri: '',
			mimeType: '',
			data: null,
		});
	}

	public getURI(): string { return this.get('uri'); }
	public setURI(uri: string): this { return this.set('uri', uri); }

	public getMimeType(): string { return this.get('mimeType'); }
	public setMimeType(mimeType: string): this { return this.set('mimeType', mimeType); }

	public getData(): Uint8Array | null { return this.get('data'); }
	public setData(data: Uint8Array | null): this { return this.set('data', data); }
}
