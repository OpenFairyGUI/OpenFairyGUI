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
	controllers?: string | null;
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
	x: number;
	y: number;
	width: number;
	height: number;
	pivotX: number;
	pivotY: number;
	anchor: boolean;
	group: string;
	alpha: number;
	rotation: number;
	visible: boolean;
	touchable: boolean;
	grayed: boolean;
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
			x: 0,
			y: 0,
			width: 0,
			height: 0,
			pivotX: 0,
			pivotY: 0,
			anchor: false,
			group: '',
			alpha: 1,
			rotation: 0,
			visible: true,
			touchable: true,
			grayed: false,
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

	protected getListProp<K extends keyof IListBase>(key: K): IListBase[K] {
		const self = this as unknown as GListBase<IListBase, TType>;
		return self.get(key as never) as IListBase[K];
	}

	protected setListProp<K extends keyof IListBase>(key: K, value: IListBase[K]): this {
		const self = this as unknown as GListBase<IListBase, TType>;
		return self.set(key as never, value as never) as this;
	}

	public getLayout(): number { return this.getListProp('layout'); }
	public setLayout(v: number): this { return this.setListProp('layout', v); }

	public getX(): number { return this.getListProp('x'); }
	public getY(): number { return this.getListProp('y'); }
	public getWidth(): number { return this.getListProp('width'); }
	public getHeight(): number { return this.getListProp('height'); }
	public setXY(x: number, y: number): this {
		this.setListProp('x', x);
		return this.setListProp('y', y);
	}
	public setSize(w: number, h: number): this {
		this.setListProp('width', w);
		return this.setListProp('height', h);
	}
	public setX(v: number): this { return this.setListProp('x', v); }
	public setY(v: number): this { return this.setListProp('y', v); }

	public getPivotX(): number { return this.getListProp('pivotX'); }
	public getPivotY(): number { return this.getListProp('pivotY'); }
	public getPivotAsAnchor(): boolean { return this.getListProp('anchor'); }
	public setPivot(x: number, y: number, anchor = false): this {
		this.setListProp('pivotX', x);
		this.setListProp('pivotY', y);
		return this.setListProp('anchor', anchor);
	}
	public setPivotAsAnchor(v: boolean): this { return this.setListProp('anchor', v); }

	public getAlpha(): number { return this.getListProp('alpha'); }
	public setAlpha(v: number): this { return this.setListProp('alpha', v); }

	public getRotation(): number { return this.getListProp('rotation'); }
	public setRotation(v: number): this { return this.setListProp('rotation', v); }

	public getVisible(): boolean { return this.getListProp('visible'); }
	public setVisible(v: boolean): this { return this.setListProp('visible', v); }

	public getGroup(): string { return this.getListProp('group'); }
	public setGroup(v: string): this { return this.setListProp('group', v); }

	public getTouchable(): boolean { return this.getListProp('touchable'); }
	public setTouchable(v: boolean): this { return this.setListProp('touchable', v); }

	public getGrayed(): boolean { return this.getListProp('grayed'); }
	public setGrayed(v: boolean): this { return this.setListProp('grayed', v); }

	public getAlign(): number { return this.getListProp('align'); }
	public setAlign(v: number): this { return this.setListProp('align', v); }

	public getVAlign(): number { return this.getListProp('vAlign'); }
	public setVAlign(v: number): this { return this.setListProp('vAlign', v); }

	public getLineGap(): number { return this.getListProp('lineGap'); }
	public setLineGap(v: number): this { return this.setListProp('lineGap', v); }

	public getColumnGap(): number { return this.getListProp('columnGap'); }
	public setColumnGap(v: number): this { return this.setListProp('columnGap', v); }

	public getLineCount(): number { return this.getListProp('lineCount'); }
	public setLineCount(v: number): this { return this.setListProp('lineCount', v); }

	public getColumnCount(): number { return this.getListProp('columnCount'); }
	public setColumnCount(v: number): this { return this.setListProp('columnCount', v); }

	public getSelectionMode(): number { return this.getListProp('selectionMode'); }
	public setSelectionMode(v: number): this { return this.setListProp('selectionMode', v); }

	public getDefaultItem(): string { return this.getListProp('defaultItem'); }
	public setDefaultItem(v: string): this { return this.setListProp('defaultItem', v); }

	public getAutoResizeItem(): boolean { return this.getListProp('autoResizeItem'); }
	public setAutoResizeItem(v: boolean): this { return this.setListProp('autoResizeItem', v); }

	public getChildrenRenderOrder(): number { return this.getListProp('childrenRenderOrder'); }
	public setChildrenRenderOrder(v: number): this { return this.setListProp('childrenRenderOrder', v); }

	public getApexIndex(): number { return this.getListProp('apexIndex'); }
	public setApexIndex(v: number): this { return this.setListProp('apexIndex', v); }

	public getSrc(): string { return this.getListProp('src'); }
	public setSrc(v: string): this { return this.setListProp('src', v); }

	public getOverflow(): number { return this.getListProp('overflow'); }
	public setOverflow(v: number): this { return this.setListProp('overflow', v); }

	public getScrollType(): number { return this.getListProp('scrollType'); }
	public setScrollType(v: number): this { return this.setListProp('scrollType', v); }

	public getScrollBarFlags(): number { return this.getListProp('scrollBarFlags'); }
	public setScrollBarFlags(v: number): this { return this.setListProp('scrollBarFlags', v); }

	public getScrollBarMargin(): EdgeInsetsLike {
		const margin = this.getListProp('scrollBarMargin');
		return {
			top: margin[0] ?? 0,
			bottom: margin[1] ?? 0,
			left: margin[2] ?? 0,
			right: margin[3] ?? 0,
		};
	}
	public setScrollBarMargin(v: EdgeInsetsLike | [number, number, number, number]): this {
		if (Array.isArray(v)) {
			return this.setListProp('scrollBarMargin', [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0]);
		}
		return this.setListProp('scrollBarMargin', [v.top ?? 0, v.bottom ?? 0, v.left ?? 0, v.right ?? 0]);
	}

	public getVtScrollBarRes(): string { return this.getListProp('vtScrollBarRes'); }
	public setVtScrollBarRes(v: string): this { return this.setListProp('vtScrollBarRes', v); }

	public getHzScrollBarRes(): string { return this.getListProp('hzScrollBarRes'); }
	public setHzScrollBarRes(v: string): this { return this.setListProp('hzScrollBarRes', v); }

	public getHeaderRes(): string { return this.getListProp('headerRes'); }
	public setHeaderRes(v: string): this { return this.setListProp('headerRes', v); }

	public getFooterRes(): string { return this.getListProp('footerRes'); }
	public setFooterRes(v: string): this { return this.setListProp('footerRes', v); }

	public getPageController(): string { return firstString(this.getListProp('pageController')); }
	public setPageController(v: string): this { return this.setListProp('pageController', v); }

	public getControllerOverrides(): string { return firstString(this.getListProp('controllerOverrides')); }
	public setControllerOverrides(v: string): this { return this.setListProp('controllerOverrides', v); }

	public getMargin(): EdgeInsetsLike {
		const margin = this.getListProp('margin');
		return {
			top: margin[0] ?? 0,
			bottom: margin[1] ?? 0,
			left: margin[2] ?? 0,
			right: margin[3] ?? 0,
		};
	}
	public setMargin(v: EdgeInsetsLike | [number, number, number, number]): this {
		if (Array.isArray(v)) {
			return this.setListProp('margin', [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0]);
		}
		return this.setListProp('margin', [v.top ?? 0, v.bottom ?? 0, v.left ?? 0, v.right ?? 0]);
	}

	public getClipSoftness(): XYLike {
		const clipSoftness = this.getListProp('clipSoftness');
		return {
			x: clipSoftness[0] ?? 0,
			y: clipSoftness[1] ?? 0,
		};
	}
	public setClipSoftness(v: XYLike | [number, number]): this {
		if (Array.isArray(v)) {
			return this.setListProp('clipSoftness', [v[0] ?? 0, v[1] ?? 0]);
		}
		return this.setListProp('clipSoftness', [v.x ?? 0, v.y ?? 0]);
	}

	public getScrollItemToViewOnClick(): boolean { return this.getListProp('scrollItemToViewOnClick'); }
	public setScrollItemToViewOnClick(v: boolean): this { return this.setListProp('scrollItemToViewOnClick', v); }

	public getFoldInvisibleItems(): boolean { return this.getListProp('foldInvisibleItems'); }
	public setFoldInvisibleItems(v: boolean): this { return this.setListProp('foldInvisibleItems', v); }

	public getListItems(): GListItemData[] { return this.get('listItems' as never) as GListItemData[]; }
	public setListItems(v: GListItemData[]): this { return this.set('listItems' as never, v as never); }

	public getSelectionController(): string { return firstString(this.getListProp('selectionController')); }
	public setSelectionController(v: string): this { return this.setListProp('selectionController', v); }
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
