import { type Nullable } from '../constants.js';
import { ExtensibleProperty, type IExtensibleProperty } from './extensible-property.js';

export interface ISkeletonResourceBase extends IExtensibleProperty {
	id: string;
	path: string;
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

	public getId(): string { return this.get('id' as keyof T) as string; }
	public setId(id: string): this { return this.set('id' as keyof T, id as T[keyof T]); }

	public getPath(): string { return this.get('path' as keyof T) as string; }
	public setPath(path: string): this { return this.set('path' as keyof T, path as T[keyof T]); }

	public getFile(): string { return this.get('file' as keyof T) as string; }
	public setFile(file: string): this { return this.set('file' as keyof T, file as T[keyof T]); }

	public getExported(): boolean { return this.get('exported' as keyof T) as boolean; }
	public setExported(v: boolean): this { return this.set('exported' as keyof T, v as T[keyof T]); }

	public getWidth(): number { return this.get('width' as keyof T) as number; }
	public setWidth(v: number): this { return this.set('width' as keyof T, v as T[keyof T]); }

	public getHeight(): number { return this.get('height' as keyof T) as number; }
	public setHeight(v: number): this { return this.set('height' as keyof T, v as T[keyof T]); }

	public getRequireIds(): string[] { return [...(this.get('requireIds' as keyof T) as string[])]; }
	public setRequireIds(ids: string[]): this { return this.set('requireIds' as keyof T, [...ids] as T[keyof T]); }

	public getAtlasNames(): string[] { return [...(this.get('atlasNames' as keyof T) as string[])]; }
	public setAtlasNames(names: string[]): this { return this.set('atlasNames' as keyof T, [...names] as T[keyof T]); }

	public getAnchorX(): number { return this.get('anchorX' as keyof T) as number; }
	public setAnchorX(v: number): this { return this.set('anchorX' as keyof T, v as T[keyof T]); }

	public getAnchorY(): number { return this.get('anchorY' as keyof T) as number; }
	public setAnchorY(v: number): this { return this.set('anchorY' as keyof T, v as T[keyof T]); }

	public setAnchor(x: number, y: number): this {
		this.setAnchorX(x);
		return this.setAnchorY(y);
	}
}
