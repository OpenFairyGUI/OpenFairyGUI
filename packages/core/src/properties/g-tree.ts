import { type Nullable, PropertyType } from '../constants.js';
import { GListBase, type IListBase } from './g-list.js';

export interface IGTree extends IListBase {
	treeView: boolean;
	indent: number;
	clickToExpand: number;
}

/**
 * A tree display object that uses the editor's list XML tag plus `treeView=true`,
 * but maps to the dedicated runtime tree type.
 * @category Properties
 */
export class GTree extends GListBase<IGTree, PropertyType.G_TREE> {
	public declare propertyType: PropertyType.G_TREE;

	protected init(): void {
		this.propertyType = PropertyType.G_TREE;
	}

	protected getDefaults(): Nullable<IGTree> {
		return Object.assign(super.getDefaults(), {
			treeView: true,
			indent: 30,
			clickToExpand: 0,
		});
	}

	public getTreeView(): boolean { return this.get('treeView'); }
	public setTreeView(v: boolean): this { return this.set('treeView', v); }

	public getIndent(): number { return this.get('indent'); }
	public setIndent(v: number): this { return this.set('indent', v); }

	public getClickToExpand(): number { return this.get('clickToExpand'); }
	public setClickToExpand(v: number): this { return this.set('clickToExpand', v); }
}
