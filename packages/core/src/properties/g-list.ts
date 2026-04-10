import { type Nullable, PropertyType, ListLayoutType, ListSelectionMode } from '../constants.js';
import { GObject, type IGObject } from './g-object.js';

export interface GListItemData {
	title: string | null;
	icon: string | null;
	url: string | null;
	name: string | null;
	selectedTitle: string | null;
	selectedIcon: string | null;
	level: number;
	isFolder: boolean | null;
}

interface XYLike {
	x: number;
	y: number;
}

interface EdgeInsetsLike {
	top: number;
	bottom: number;
	left: number;
	right: number;
}

export interface IListBase extends IGObject {
	layout: number;
	align: number;
	vAlign: number;
	lineGap: number;
	columnGap: number;
	lineCount: number;
	columnCount: number;
	selectionMode: number;
	defaultItem: string;
	autoResizeItem: boolean;
	childrenRenderOrder: number;
	apexIndex: number;
	src: string;
	overflow: number;
	scrollType: number;
	scrollBarFlags: number;
	scrollBarMargin: [number, number, number, number];
	vtScrollBarRes: string;
	hzScrollBarRes: string;
	headerRes: string;
	footerRes: string;
	margin: [number, number, number, number];
	clipSoftness: [number, number];
	scrollItemToViewOnClick: boolean;
	foldInvisibleItems: boolean;
	listItems: GListItemData[];
	pageController: string;
	controllerOverrides: string;
	selectionController: string;
}

export interface IGList extends IListBase {}

function firstString(value: unknown): string {
	if (Array.isArray(value)) return String(value[0] ?? '');
	return String(value ?? '');
}

/**
 * Shared list-like behavior used by both `GList` and `GTree`.
 */
export class GListBase<
	TProps extends IListBase = IListBase,
	TType extends PropertyType = PropertyType.G_LIST,
> extends GObject<TProps, TType> {
	protected getDefaults(): Nullable<TProps> {
		return Object.assign(super.getDefaults(), {
			layout: ListLayoutType.SingleColumn,
			align: 0,
			vAlign: 0,
			lineGap: 0,
			columnGap: 0,
			lineCount: 0,
			columnCount: 0,
			selectionMode: ListSelectionMode.Single,
			defaultItem: '',
			autoResizeItem: true,
			childrenRenderOrder: 0,
			apexIndex: 0,
			src: '',
			overflow: 0,
			scrollType: 1,
			scrollBarFlags: 0,
			scrollBarMargin: [0, 0, 0, 0] as [number, number, number, number],
			vtScrollBarRes: '',
			hzScrollBarRes: '',
			headerRes: '',
			footerRes: '',
			margin: [0, 0, 0, 0] as [number, number, number, number],
			clipSoftness: [0, 0] as [number, number],
			scrollItemToViewOnClick: true,
			foldInvisibleItems: false,
			listItems: [] as GListItemData[],
			pageController: '',
			controllerOverrides: '',
			selectionController: '',
		}) as Nullable<TProps>;
	}

	public getLayout(): number { return this.get('layout'); }
	public setLayout(v: number): this { return this.set('layout', v); }

	public getAlign(): number { return this.get('align'); }
	public setAlign(v: number): this { return this.set('align', v); }

	public getVAlign(): number { return this.get('vAlign'); }
	public setVAlign(v: number): this { return this.set('vAlign', v); }

	public getLineGap(): number { return this.get('lineGap'); }
	public setLineGap(v: number): this { return this.set('lineGap', v); }

	public getColumnGap(): number { return this.get('columnGap'); }
	public setColumnGap(v: number): this { return this.set('columnGap', v); }

	public getLineCount(): number { return this.get('lineCount'); }
	public setLineCount(v: number): this { return this.set('lineCount', v); }

	public getColumnCount(): number { return this.get('columnCount'); }
	public setColumnCount(v: number): this { return this.set('columnCount', v); }

	public getSelectionMode(): number { return this.get('selectionMode'); }
	public setSelectionMode(v: number): this { return this.set('selectionMode', v); }

	public getDefaultItem(): string { return this.get('defaultItem'); }
	public setDefaultItem(v: string): this { return this.set('defaultItem', v); }

	public getAutoResizeItem(): boolean { return this.get('autoResizeItem'); }
	public setAutoResizeItem(v: boolean): this { return this.set('autoResizeItem', v); }

	public getChildrenRenderOrder(): number { return this.get('childrenRenderOrder'); }
	public setChildrenRenderOrder(v: number): this { return this.set('childrenRenderOrder', v); }

	public getApexIndex(): number { return this.get('apexIndex'); }
	public setApexIndex(v: number): this { return this.set('apexIndex', v); }

	public getSrc(): string { return this.get('src'); }
	public setSrc(v: string): this { return this.set('src', v); }

	public getOverflow(): number { return this.get('overflow'); }
	public setOverflow(v: number): this { return this.set('overflow', v); }

	public getScrollType(): number { return this.get('scrollType'); }
	public setScrollType(v: number): this { return this.set('scrollType', v); }

	public getScrollBarFlags(): number { return this.get('scrollBarFlags'); }
	public setScrollBarFlags(v: number): this { return this.set('scrollBarFlags', v); }

	public getScrollBarMargin(): EdgeInsetsLike {
		const margin = this.get('scrollBarMargin');
		return {
			top: margin[0] ?? 0,
			bottom: margin[1] ?? 0,
			left: margin[2] ?? 0,
			right: margin[3] ?? 0,
		};
	}
	public setScrollBarMargin(v: EdgeInsetsLike | [number, number, number, number]): this {
		if (Array.isArray(v)) {
			return this.set('scrollBarMargin', [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0]);
		}
		return this.set('scrollBarMargin', [v.top ?? 0, v.bottom ?? 0, v.left ?? 0, v.right ?? 0]);
	}

	public getVtScrollBarRes(): string { return this.get('vtScrollBarRes'); }
	public setVtScrollBarRes(v: string): this { return this.set('vtScrollBarRes', v); }

	public getHzScrollBarRes(): string { return this.get('hzScrollBarRes'); }
	public setHzScrollBarRes(v: string): this { return this.set('hzScrollBarRes', v); }

	public getHeaderRes(): string { return this.get('headerRes'); }
	public setHeaderRes(v: string): this { return this.set('headerRes', v); }

	public getFooterRes(): string { return this.get('footerRes'); }
	public setFooterRes(v: string): this { return this.set('footerRes', v); }

	public getPageController(): string { return firstString(this.get('pageController')); }
	public setPageController(v: string): this { return this.set('pageController', v); }

	public getControllerOverrides(): string { return firstString(this.get('controllerOverrides')); }
	public setControllerOverrides(v: string): this { return this.set('controllerOverrides', v); }

	public getMargin(): EdgeInsetsLike {
		const margin = this.get('margin');
		return {
			top: margin[0] ?? 0,
			bottom: margin[1] ?? 0,
			left: margin[2] ?? 0,
			right: margin[3] ?? 0,
		};
	}
	public setMargin(v: EdgeInsetsLike | [number, number, number, number]): this {
		if (Array.isArray(v)) {
			return this.set('margin', [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0]);
		}
		return this.set('margin', [v.top ?? 0, v.bottom ?? 0, v.left ?? 0, v.right ?? 0]);
	}

	public getClipSoftness(): XYLike {
		const clipSoftness = this.get('clipSoftness');
		return {
			x: clipSoftness[0] ?? 0,
			y: clipSoftness[1] ?? 0,
		};
	}
	public setClipSoftness(v: XYLike | [number, number]): this {
		if (Array.isArray(v)) {
			return this.set('clipSoftness', [v[0] ?? 0, v[1] ?? 0]);
		}
		return this.set('clipSoftness', [v.x ?? 0, v.y ?? 0]);
	}

	public getScrollItemToViewOnClick(): boolean { return this.get('scrollItemToViewOnClick'); }
	public setScrollItemToViewOnClick(v: boolean): this { return this.set('scrollItemToViewOnClick', v); }

	public getFoldInvisibleItems(): boolean { return this.get('foldInvisibleItems'); }
	public setFoldInvisibleItems(v: boolean): this { return this.set('foldInvisibleItems', v); }

	public getListItems(): GListItemData[] { return this.get('listItems' as never) as GListItemData[]; }
	public setListItems(v: GListItemData[]): this { return this.set('listItems' as never, v as never); }

	public getSelectionController(): string { return firstString(this.get('selectionController')); }
	public setSelectionController(v: string): this { return this.set('selectionController', v); }
}

/**
 * A list display object that manages a collection of items.
 * @category Properties
 */
export class GList extends GListBase<IGList, PropertyType.G_LIST> {
	public declare propertyType: PropertyType.G_LIST;

	protected init(): void {
		this.propertyType = PropertyType.G_LIST;
	}
}
