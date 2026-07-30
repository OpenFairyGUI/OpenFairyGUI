import type { Ref } from 'property-graph';
import { type Nullable, PropertyType } from '../constants.js';
import { ExtensibleProperty, type IExtensibleProperty } from './extensible-property.js';
import type { FairyBuffer } from './buffer.js';

interface ISoundResource extends IExtensibleProperty {
	id: string;
	path: string;
	branch: string;
	branchItemIds: string[];
	file: string;
	exported: boolean;
	favorite: boolean;
	soundData: Ref<FairyBuffer>;
}

/**
 * A sound resource within a FairyGUI package.
 * @category Properties
 */
export class SoundResource extends ExtensibleProperty<ISoundResource> {
	public declare propertyType: PropertyType.SOUND_RESOURCE;

	protected init(): void {
		this.propertyType = PropertyType.SOUND_RESOURCE;
	}

	protected getDefaults(): Nullable<ISoundResource> {
		return Object.assign(super.getDefaults(), {
			id: '',
			path: '',
			branch: '',
			branchItemIds: [],
			file: '',
			exported: false,
			favorite: false,
			soundData: null,
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

	public getFile(): string { return this.get('file'); }
	public setFile(file: string): this { return this.set('file', file); }

	public getExported(): boolean { return this.get('exported'); }
	public setExported(v: boolean): this { return this.set('exported', v); }

	public getFavorite(): boolean { return this.get('favorite'); }
	public setFavorite(v: boolean): this { return this.set('favorite', v); }

	public getSoundData(): FairyBuffer | null { return this.getRef('soundData' as never) as FairyBuffer | null; }
	public setSoundData(buffer: FairyBuffer | null): this { return this.setRef('soundData' as never, buffer as never); }

	/** Primary source-file bytes for this sound resource. */
	public getSourceData(): FairyBuffer | null { return this.getSoundData(); }
	public setSourceData(buffer: FairyBuffer | null): this { return this.setSoundData(buffer); }
}
