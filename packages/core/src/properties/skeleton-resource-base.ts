import { type Nullable } from '../constants.js';
import { ExtensibleProperty, type IExtensibleProperty } from './extensible-property.js';

export interface ISkeletonResourceBase extends IExtensibleProperty {
	id: string;
	path: string;
	branch: string;
	branchItemIds: string[];
	file: string;
	exported: boolean;
	width: number;
	height: number;
	requireIds: string[];
	atlasNames: string[];
	anchorX: number;
	anchorY: number;
}

/**
 * Shared base for skeleton-style package resources.
 * @category Properties
 */
export abstract class SkeletonResourceBase<T extends ISkeletonResourceBase> extends ExtensibleProperty<T> {
	protected getDefaults(): Nullable<T> {
		return Object.assign(super.getDefaults(), {
			id: '',
			path: '',
			branch: '',
			branchItemIds: [],
			file: '',
			exported: false,
			width: 0,
			height: 0,
			requireIds: [],
			atlasNames: [],
			anchorX: 0,
			anchorY: 0,
		}) as Nullable<T>;
	}

	public getId(): string { return this.get('id' as never) as string; }
	public setId(id: string): this { return this.set('id' as never, id as never); }

	public getPath(): string { return this.get('path' as never) as string; }
	public setPath(path: string): this { return this.set('path' as never, path as never); }

	public getBranch(): string { return this.get('branch' as never) as string; }
	public setBranch(branch: string): this { return this.set('branch' as never, branch as never); }

	public getBranchItemIds(): string[] { return [...(this.get('branchItemIds' as never) as string[])]; }
	public setBranchItemIds(ids: string[]): this { return this.set('branchItemIds' as never, [...ids] as never); }

	public getFile(): string { return this.get('file' as never) as string; }
	public setFile(file: string): this { return this.set('file' as never, file as never); }

	public getExported(): boolean { return this.get('exported' as never) as boolean; }
	public setExported(v: boolean): this { return this.set('exported' as never, v as never); }

	public getWidth(): number { return this.get('width' as never) as number; }
	public setWidth(v: number): this { return this.set('width' as never, v as never); }

	public getHeight(): number { return this.get('height' as never) as number; }
	public setHeight(v: number): this { return this.set('height' as never, v as never); }

	public getRequireIds(): string[] { return [...(this.get('requireIds' as never) as string[])]; }
	public setRequireIds(ids: string[]): this { return this.set('requireIds' as never, [...ids] as never); }

	public getAtlasNames(): string[] { return [...(this.get('atlasNames' as never) as string[])]; }
	public setAtlasNames(names: string[]): this { return this.set('atlasNames' as never, [...names] as never); }

	public getAnchorX(): number { return this.get('anchorX' as never) as number; }
	public setAnchorX(v: number): this { return this.set('anchorX' as never, v as never); }

	public getAnchorY(): number { return this.get('anchorY' as never) as number; }
	public setAnchorY(v: number): this { return this.set('anchorY' as never, v as never); }

	public setAnchor(x: number, y: number): this {
		this.setAnchorX(x);
		return this.setAnchorY(y);
	}
}
