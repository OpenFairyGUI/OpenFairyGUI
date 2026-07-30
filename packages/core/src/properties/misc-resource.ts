import type { Ref } from 'property-graph';
import { type Nullable, PropertyType } from '../constants.js';
import { ExtensibleProperty, type IExtensibleProperty } from './extensible-property.js';
import type { FairyBuffer } from './buffer.js';

interface IMiscResource extends IExtensibleProperty {
	id: string;
	path: string;
	branch: string;
	branchItemIds: string[];
	file: string;
	exported: boolean;
	favorite: boolean;
	resourceData: Ref<FairyBuffer>;
}

/**
 * A generic external resource within a FairyGUI package.
 * @category Properties
 */
export class MiscResource extends ExtensibleProperty<IMiscResource> {
	public declare propertyType: PropertyType.MISC_RESOURCE;

	protected init(): void {
		this.propertyType = PropertyType.MISC_RESOURCE;
	}

	protected getDefaults(): Nullable<IMiscResource> {
		return Object.assign(super.getDefaults(), {
			id: '',
			path: '',
			branch: '',
			branchItemIds: [],
			file: '',
			exported: false,
			favorite: false,
			resourceData: null,
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

	public getResourceData(): FairyBuffer | null { return this.getRef('resourceData' as never) as FairyBuffer | null; }
	public setResourceData(buffer: FairyBuffer | null): this { return this.setRef('resourceData' as never, buffer as never); }

	/** Primary source-file bytes for this miscellaneous resource. */
	public getSourceData(): FairyBuffer | null { return this.getResourceData(); }
	public setSourceData(buffer: FairyBuffer | null): this { return this.setResourceData(buffer); }
}
