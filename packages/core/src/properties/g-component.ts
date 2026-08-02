import { type Nullable, PropertyType, OverflowType, ScrollType, ScrollBarDisplayType } from '../constants.js';
import { GObject, type IGObject } from './g-object.js';

export interface GComponentPropertyOverride {
	target: string;
	propertyId: number;
	value: string;
}

export interface IGComponent extends IGObject {
	src: string;
	x: number;
	y: number;
	width: number;
	height: number;
	locked: boolean;
	minWidth: number;
	maxWidth: number;
	minHeight: number;
	maxHeight: number;
	aspect: boolean;
	pivotX: number;
	pivotY: number;
	anchor: boolean;
	scaleX: number;
	scaleY: number;
	group: string;
	alpha: number;
	rotation: number;
	visible: boolean;
	touchable: boolean;
	grayed: boolean;
	tooltips: string;
	customData: string;
	fileName: string;
	packageId: string;
	filter: string;
	filterData: string;
	overflow: number;
	scrollType: number;
	scrollBarDisplay: number;
	scrollBarFlags: number;
	margin: [number, number, number, number];
	clipSoftness: [number, number];
	pageController: string;
	controllerOverrides: string;
	instanceExtType: string;
	instanceTitle: string;
	instanceSelectedTitle: string;
	instanceIcon: string;
	instanceSelectedIcon: string;
	instanceTitleColor: string;
	instanceTitleFontSize: number;
	instanceController: string;
	instancePage: string;
	instanceChecked: boolean;
	instanceSound: string;
	instanceSoundVolumeScale: number;
	instancePromptText: string;
	instanceSelectionController: string;
	instanceVisibleItemCount: number;
	instanceAutoClearItems: boolean;
	instanceValue: number;
	instanceMax: number;
	instanceMin: number;
	instanceComboItems: Array<{
		title: string | null;
		value: string | null;
		icon: string | null;
	}>;
	propertyOverrides: GComponentPropertyOverride[];
}

function firstString(value: unknown): string {
	if (Array.isArray(value)) return String(value[0] ?? '');
	return String(value ?? '');
}

/**
 * A component instance display object — references a Component resource via src.
 *
 * This parallels the Mesh/Node split in glTF: Component is the resource definition,
 * GComponent is the instance placed in a display list.
 *
 * @category Properties
 */
export class GComponent<
	TProps extends IGComponent = IGComponent,
	TType extends PropertyType = PropertyType.G_COMPONENT,
> extends GObject<TProps, TType> {
	public declare propertyType: TType;

	protected init(): void {
		this.propertyType = PropertyType.G_COMPONENT as TType;
	}

	protected getDefaults(): Nullable<TProps> {
		return Object.assign(super.getDefaults(), {
			src: '',
			x: 0,
			y: 0,
			width: 0,
			height: 0,
			locked: false,
			minWidth: 0,
			maxWidth: 0,
			minHeight: 0,
			maxHeight: 0,
			aspect: false,
			pivotX: 0,
			pivotY: 0,
			anchor: false,
			scaleX: 1,
			scaleY: 1,
			group: '',
			alpha: 1,
			rotation: 0,
			visible: true,
			touchable: true,
			grayed: false,
			tooltips: '',
			customData: '',
			fileName: '',
			packageId: '',
			filter: '',
			filterData: '',
			overflow: OverflowType.Visible,
			scrollType: ScrollType.Vertical,
			scrollBarDisplay: ScrollBarDisplayType.Default,
			scrollBarFlags: 0,
			margin: [0, 0, 0, 0] as [number, number, number, number],
			clipSoftness: [0, 0] as [number, number],
			pageController: '',
			controllerOverrides: '',
			instanceExtType: '',
			instanceTitle: '',
			instanceSelectedTitle: '',
			instanceIcon: '',
			instanceSelectedIcon: '',
			instanceTitleColor: '',
			instanceTitleFontSize: 0,
			instanceController: '',
			instancePage: '',
			instanceChecked: false,
			instanceSound: '',
			instanceSoundVolumeScale: 1,
			instancePromptText: '',
			instanceSelectionController: '',
			instanceVisibleItemCount: 0,
			instanceAutoClearItems: false,
			instanceValue: 0,
			instanceMax: 0,
			instanceMin: 0,
			instanceComboItems: [] as IGComponent['instanceComboItems'],
			propertyOverrides: [] as GComponentPropertyOverride[],
		}) as Nullable<TProps>;
	}

	protected getComponentProp<K extends keyof IGComponent>(key: K): IGComponent[K] {
		const self = this as unknown as GComponent<IGComponent, TType>;
		return self.get(key as never) as IGComponent[K];
	}

	protected setComponentProp<K extends keyof IGComponent>(key: K, value: IGComponent[K]): this {
		const self = this as unknown as GComponent<IGComponent, TType>;
		return self.set(key as never, value as never) as this;
	}

	public getSrc(): string { return this.getComponentProp('src'); }
	public setSrc(v: string): this { return this.setComponentProp('src', v); }

	public getX(): number { return this.getComponentProp('x'); }
	public getY(): number { return this.getComponentProp('y'); }
	public getWidth(): number { return this.getComponentProp('width'); }
	public getHeight(): number { return this.getComponentProp('height'); }
	public getLocked(): boolean { return this.getComponentProp('locked'); }
	public getMinWidth(): number { return this.getComponentProp('minWidth'); }
	public getMaxWidth(): number { return this.getComponentProp('maxWidth'); }
	public getMinHeight(): number { return this.getComponentProp('minHeight'); }
	public getMaxHeight(): number { return this.getComponentProp('maxHeight'); }
	public setXY(x: number, y: number): this {
		this.setComponentProp('x', x);
		return this.setComponentProp('y', y);
	}
	public setSize(w: number, h: number): this {
		this.setComponentProp('width', w);
		return this.setComponentProp('height', h);
	}
	public setLocked(v: boolean): this { return this.setComponentProp('locked', v); }
	public setMinWidth(v: number): this { return this.setComponentProp('minWidth', v); }
	public setMaxWidth(v: number): this { return this.setComponentProp('maxWidth', v); }
	public setMinHeight(v: number): this { return this.setComponentProp('minHeight', v); }
	public setMaxHeight(v: number): this { return this.setComponentProp('maxHeight', v); }
	public setX(v: number): this { return this.setComponentProp('x', v); }
	public setY(v: number): this { return this.setComponentProp('y', v); }

	public getAspect(): boolean { return this.getComponentProp('aspect'); }
	public setAspect(v: boolean): this { return this.setComponentProp('aspect', v); }

	public getPivotX(): number { return this.getComponentProp('pivotX'); }
	public getPivotY(): number { return this.getComponentProp('pivotY'); }
	public getPivotAsAnchor(): boolean { return this.getComponentProp('anchor'); }
	public setPivot(x: number, y: number, anchor = false): this {
		this.setComponentProp('pivotX', x);
		this.setComponentProp('pivotY', y);
		return this.setComponentProp('anchor', anchor);
	}
	public setPivotAsAnchor(v: boolean): this { return this.setComponentProp('anchor', v); }

	public getScaleX(): number { return this.getComponentProp('scaleX'); }
	public getScaleY(): number { return this.getComponentProp('scaleY'); }
	public setScale(x: number, y: number): this {
		this.setComponentProp('scaleX', x);
		return this.setComponentProp('scaleY', y);
	}

	public getGroup(): string { return this.getComponentProp('group'); }
	public setGroup(v: string): this { return this.setComponentProp('group', v); }

	public getAlpha(): number { return this.getComponentProp('alpha'); }
	public setAlpha(v: number): this { return this.setComponentProp('alpha', v); }

	public getRotation(): number { return this.getComponentProp('rotation'); }
	public setRotation(v: number): this { return this.setComponentProp('rotation', v); }

	public getVisible(): boolean { return this.getComponentProp('visible'); }
	public setVisible(v: boolean): this { return this.setComponentProp('visible', v); }

	public getTouchable(): boolean { return this.getComponentProp('touchable'); }
	public setTouchable(v: boolean): this { return this.setComponentProp('touchable', v); }

	public getGrayed(): boolean { return this.getComponentProp('grayed'); }
	public setGrayed(v: boolean): this { return this.setComponentProp('grayed', v); }

	public getTooltips(): string { return firstString(this.getComponentProp('tooltips')); }
	public setTooltips(v: string): this { return this.setComponentProp('tooltips', v); }

	public getCustomData(): string { return firstString(this.getComponentProp('customData')); }
	public setCustomData(v: string): this { return this.setComponentProp('customData', v); }

	public getFileName(): string { return firstString(this.getComponentProp('fileName')); }
	public setFileName(v: string): this { return this.setComponentProp('fileName', v); }

	public getPackageId(): string { return firstString(this.getComponentProp('packageId')); }
	public setPackageId(v: string): this { return this.setComponentProp('packageId', v); }

	public getFilter(): string { return firstString(this.getComponentProp('filter')); }
	public setFilter(v: string): this { return this.setComponentProp('filter', v); }

	public getFilterData(): string { return firstString(this.getComponentProp('filterData')); }
	public setFilterData(v: string): this { return this.setComponentProp('filterData', v); }

	public getOverflow(): number { return this.getComponentProp('overflow'); }
	public setOverflow(v: number): this { return this.setComponentProp('overflow', v); }

	public getScrollType(): number { return this.getComponentProp('scrollType'); }
	public setScrollType(v: number): this { return this.setComponentProp('scrollType', v); }

	public getScrollBarDisplay(): number { return this.getComponentProp('scrollBarDisplay'); }
	public setScrollBarDisplay(v: number): this { return this.setComponentProp('scrollBarDisplay', v); }

	public getPageController(): string { return firstString(this.getComponentProp('pageController')); }
	public setPageController(v: string): this { return this.setComponentProp('pageController', v); }

	public getControllerOverrides(): string { return firstString(this.getComponentProp('controllerOverrides')); }
	public setControllerOverrides(v: string): this { return this.setComponentProp('controllerOverrides', v); }

	public getInstanceExtType(): string { return firstString(this.getComponentProp('instanceExtType')); }
	public setInstanceExtType(v: string): this { return this.setComponentProp('instanceExtType', v); }

	public getInstanceTitle(): string { return firstString(this.getComponentProp('instanceTitle')); }
	public setInstanceTitle(v: string): this { return this.setComponentProp('instanceTitle', v); }

	public getInstanceSelectedTitle(): string { return firstString(this.getComponentProp('instanceSelectedTitle')); }
	public setInstanceSelectedTitle(v: string): this { return this.setComponentProp('instanceSelectedTitle', v); }

	public getInstanceIcon(): string { return firstString(this.getComponentProp('instanceIcon')); }
	public setInstanceIcon(v: string): this { return this.setComponentProp('instanceIcon', v); }

	public getInstanceSelectedIcon(): string { return firstString(this.getComponentProp('instanceSelectedIcon')); }
	public setInstanceSelectedIcon(v: string): this { return this.setComponentProp('instanceSelectedIcon', v); }

	public getInstanceTitleColor(): string { return firstString(this.getComponentProp('instanceTitleColor')); }
	public setInstanceTitleColor(v: string): this { return this.setComponentProp('instanceTitleColor', v); }

	public getInstanceTitleFontSize(): number { return this.getComponentProp('instanceTitleFontSize'); }
	public setInstanceTitleFontSize(v: number): this { return this.setComponentProp('instanceTitleFontSize', v); }

	public getInstanceController(): string { return firstString(this.getComponentProp('instanceController')); }
	public setInstanceController(v: string): this { return this.setComponentProp('instanceController', v); }

	public getInstancePage(): string { return firstString(this.getComponentProp('instancePage')); }
	public setInstancePage(v: string): this { return this.setComponentProp('instancePage', v); }

	public getInstanceChecked(): boolean { return this.getComponentProp('instanceChecked'); }
	public setInstanceChecked(v: boolean): this { return this.setComponentProp('instanceChecked', v); }

	public getInstanceSound(): string { return firstString(this.getComponentProp('instanceSound')); }
	public setInstanceSound(v: string): this { return this.setComponentProp('instanceSound', v); }

	public getInstanceSoundVolumeScale(): number { return this.getComponentProp('instanceSoundVolumeScale'); }
	public setInstanceSoundVolumeScale(v: number): this { return this.setComponentProp('instanceSoundVolumeScale', v); }

	public getInstancePromptText(): string { return firstString(this.getComponentProp('instancePromptText')); }
	public setInstancePromptText(v: string): this { return this.setComponentProp('instancePromptText', v); }

	public getInstanceSelectionController(): string { return firstString(this.getComponentProp('instanceSelectionController')); }
	public setInstanceSelectionController(v: string): this { return this.setComponentProp('instanceSelectionController', v); }

	public getInstanceVisibleItemCount(): number { return this.getComponentProp('instanceVisibleItemCount'); }
	public setInstanceVisibleItemCount(v: number): this { return this.setComponentProp('instanceVisibleItemCount', v); }

	public getInstanceAutoClearItems(): boolean { return this.getComponentProp('instanceAutoClearItems'); }
	public setInstanceAutoClearItems(v: boolean): this { return this.setComponentProp('instanceAutoClearItems', v); }

	public getInstanceValue(): number { return this.getComponentProp('instanceValue'); }
	public setInstanceValue(v: number): this { return this.setComponentProp('instanceValue', v); }

	public getInstanceMax(): number { return this.getComponentProp('instanceMax'); }
	public setInstanceMax(v: number): this { return this.setComponentProp('instanceMax', v); }

	public getInstanceMin(): number { return this.getComponentProp('instanceMin'); }
	public setInstanceMin(v: number): this { return this.setComponentProp('instanceMin', v); }

	public getInstanceComboItems(): IGComponent['instanceComboItems'] {
		return this.get('instanceComboItems' as never) as IGComponent['instanceComboItems'];
	}
	public setInstanceComboItems(v: IGComponent['instanceComboItems']): this {
		return this.set('instanceComboItems' as never, v as never);
	}

	public getPropertyOverrides(): GComponentPropertyOverride[] {
		return this.getComponentProp('propertyOverrides').map((property) => ({ ...property }));
	}
	public setPropertyOverrides(v: GComponentPropertyOverride[]): this {
		return this.setComponentProp('propertyOverrides', v.map((property) => ({ ...property })));
	}

	public getMargin(): [number, number, number, number] { return this.getComponentProp('margin'); }
	public setMargin(v: [number, number, number, number]): this { return this.setComponentProp('margin', v); }
}
