import type { Ref, LiteralKeys } from 'property-graph';
import type { Nullable } from '../constants.js';
import { ExtensibleProperty, type IExtensibleProperty } from './extensible-property.js';
import type { FairyBuffer } from './buffer.js';

export interface ISkeletonResourceBase extends IExtensibleProperty {
	id: string;
	path: string;
	branch: string;
	branchItemIds: string[];
	file: string;
	publishedFile: string;
	exported: boolean;
	favorite: boolean;
	width: number;
	height: number;
	requireIds: string[];
	atlasNames: string[];
	anchorX: number;
	anchorY: number;
	sourceData: Ref<FairyBuffer>;
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
			publishedFile: '',
			exported: false,
			favorite: false,
			width: 0,
			height: 0,
			requireIds: [],
			atlasNames: [],
			anchorX: 0,
			anchorY: 0,
			sourceData: null,
		}) as Nullable<T>;
	}

	protected getSkeletonProp<K extends LiteralKeys<ISkeletonResourceBase>>(key: K): ISkeletonResourceBase[K] {
		return (this as unknown as SkeletonResourceBase<ISkeletonResourceBase>).get(key);
	}
	protected setSkeletonProp<K extends LiteralKeys<ISkeletonResourceBase>>(
		key: K,
		value: ISkeletonResourceBase[K],
	): this {
		(this as unknown as SkeletonResourceBase<ISkeletonResourceBase>).set(key, value);
		return this;
	}

	public getId(): string {
		return this.getSkeletonProp('id');
	}
	public setId(id: string): this {
		return this.setSkeletonProp('id', id);
	}

	public getPath(): string {
		return this.getSkeletonProp('path');
	}
	public setPath(path: string): this {
		return this.setSkeletonProp('path', path);
	}

	public getBranch(): string {
		return this.getSkeletonProp('branch');
	}
	public setBranch(branch: string): this {
		return this.setSkeletonProp('branch', branch);
	}

	public getBranchItemIds(): string[] {
		return [...this.getSkeletonProp('branchItemIds')];
	}
	public setBranchItemIds(ids: string[]): this {
		return this.setSkeletonProp('branchItemIds', [...ids]);
	}

	public getPublishedFile(): string {
		return this.getSkeletonProp('publishedFile');
	}
	public setPublishedFile(value: string): this {
		return this.setSkeletonProp('publishedFile', value);
	}

	public getFile(): string {
		return this.getSkeletonProp('file');
	}
	public setFile(file: string): this {
		return this.setSkeletonProp('file', file);
	}

	public getExported(): boolean {
		return this.getSkeletonProp('exported');
	}
	public setExported(v: boolean): this {
		return this.setSkeletonProp('exported', v);
	}

	public getFavorite(): boolean {
		return this.getSkeletonProp('favorite');
	}
	public setFavorite(v: boolean): this {
		return this.setSkeletonProp('favorite', v);
	}

	public getWidth(): number {
		return this.getSkeletonProp('width');
	}
	public setWidth(v: number): this {
		return this.setSkeletonProp('width', v);
	}

	public getHeight(): number {
		return this.getSkeletonProp('height');
	}
	public setHeight(v: number): this {
		return this.setSkeletonProp('height', v);
	}

	public getRequireIds(): string[] {
		return [...this.getSkeletonProp('requireIds')];
	}
	public setRequireIds(ids: string[]): this {
		return this.setSkeletonProp('requireIds', [...ids]);
	}

	public getAtlasNames(): string[] {
		return [...this.getSkeletonProp('atlasNames')];
	}
	public setAtlasNames(names: string[]): this {
		return this.setSkeletonProp('atlasNames', [...names]);
	}

	public getAnchorX(): number {
		return this.getSkeletonProp('anchorX');
	}
	public setAnchorX(v: number): this {
		return this.setSkeletonProp('anchorX', v);
	}

	public getAnchorY(): number {
		return this.getSkeletonProp('anchorY');
	}
	public setAnchorY(v: number): this {
		return this.setSkeletonProp('anchorY', v);
	}

	public setAnchor(x: number, y: number): this {
		this.setAnchorX(x);
		return this.setAnchorY(y);
	}

	/** Primary source-file bytes for this skeleton resource. */
	public getSourceData(): FairyBuffer | null {
		return (this as unknown as SkeletonResourceBase<ISkeletonResourceBase>).getRef(
			'sourceData' as never,
		) as FairyBuffer | null;
	}
	public setSourceData(buffer: FairyBuffer | null): this {
		(this as unknown as SkeletonResourceBase<ISkeletonResourceBase>).setRef('sourceData' as never, buffer as never);
		return this;
	}
}
