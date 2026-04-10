import { type Nullable, PropertyType, OverflowType, ScrollType, ScrollBarDisplayType } from '../constants.js';
import { GObject, type IGObject } from './g-object.js';

export interface IGComponent extends IGObject {
	src: string;
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
	instancePromptText: string;
	instanceSelectionController: string;
	instanceVisibleItemCount: number;
	instanceValue: number;
	instanceMax: number;
	instanceMin: number;
	instanceComboItems: Array<{
		title: string | null;
		value: string | null;
		icon: string | null;
	}>;
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
export class GComponent extends GObject<IGComponent, PropertyType.G_COMPONENT> {
	public declare propertyType: PropertyType.G_COMPONENT;

	protected init(): void {
		this.propertyType = PropertyType.G_COMPONENT;
	}

	protected getDefaults(): Nullable<IGComponent> {
		return Object.assign(super.getDefaults(), {
			src: '',
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
			instancePromptText: '',
			instanceSelectionController: '',
			instanceVisibleItemCount: 0,
			instanceValue: 0,
			instanceMax: 0,
			instanceMin: 0,
			instanceComboItems: [] as IGComponent['instanceComboItems'],
		});
	}

	public getSrc(): string { return this.get('src'); }
	public setSrc(v: string): this { return this.set('src', v); }

	public getOverflow(): number { return this.get('overflow'); }
	public setOverflow(v: number): this { return this.set('overflow', v); }

	public getScrollType(): number { return this.get('scrollType'); }
	public setScrollType(v: number): this { return this.set('scrollType', v); }

	public getScrollBarDisplay(): number { return this.get('scrollBarDisplay'); }
	public setScrollBarDisplay(v: number): this { return this.set('scrollBarDisplay', v); }

	public getPageController(): string { return firstString(this.get('pageController')); }
	public setPageController(v: string): this { return this.set('pageController', v); }

	public getControllerOverrides(): string { return firstString(this.get('controllerOverrides')); }
	public setControllerOverrides(v: string): this { return this.set('controllerOverrides', v); }

	public getInstanceExtType(): string { return firstString(this.get('instanceExtType')); }
	public setInstanceExtType(v: string): this { return this.set('instanceExtType', v); }

	public getInstanceTitle(): string { return firstString(this.get('instanceTitle')); }
	public setInstanceTitle(v: string): this { return this.set('instanceTitle', v); }

	public getInstanceSelectedTitle(): string { return firstString(this.get('instanceSelectedTitle')); }
	public setInstanceSelectedTitle(v: string): this { return this.set('instanceSelectedTitle', v); }

	public getInstanceIcon(): string { return firstString(this.get('instanceIcon')); }
	public setInstanceIcon(v: string): this { return this.set('instanceIcon', v); }

	public getInstanceSelectedIcon(): string { return firstString(this.get('instanceSelectedIcon')); }
	public setInstanceSelectedIcon(v: string): this { return this.set('instanceSelectedIcon', v); }

	public getInstanceTitleColor(): string { return firstString(this.get('instanceTitleColor')); }
	public setInstanceTitleColor(v: string): this { return this.set('instanceTitleColor', v); }

	public getInstanceTitleFontSize(): number { return this.get('instanceTitleFontSize'); }
	public setInstanceTitleFontSize(v: number): this { return this.set('instanceTitleFontSize', v); }

	public getInstanceController(): string { return firstString(this.get('instanceController')); }
	public setInstanceController(v: string): this { return this.set('instanceController', v); }

	public getInstancePage(): string { return firstString(this.get('instancePage')); }
	public setInstancePage(v: string): this { return this.set('instancePage', v); }

	public getInstanceChecked(): boolean { return this.get('instanceChecked'); }
	public setInstanceChecked(v: boolean): this { return this.set('instanceChecked', v); }

	public getInstancePromptText(): string { return firstString(this.get('instancePromptText')); }
	public setInstancePromptText(v: string): this { return this.set('instancePromptText', v); }

	public getInstanceSelectionController(): string { return firstString(this.get('instanceSelectionController')); }
	public setInstanceSelectionController(v: string): this { return this.set('instanceSelectionController', v); }

	public getInstanceVisibleItemCount(): number { return this.get('instanceVisibleItemCount'); }
	public setInstanceVisibleItemCount(v: number): this { return this.set('instanceVisibleItemCount', v); }

	public getInstanceValue(): number { return this.get('instanceValue'); }
	public setInstanceValue(v: number): this { return this.set('instanceValue', v); }

	public getInstanceMax(): number { return this.get('instanceMax'); }
	public setInstanceMax(v: number): this { return this.set('instanceMax', v); }

	public getInstanceMin(): number { return this.get('instanceMin'); }
	public setInstanceMin(v: number): this { return this.set('instanceMin', v); }

	public getInstanceComboItems(): IGComponent['instanceComboItems'] {
		return this.get('instanceComboItems' as never) as IGComponent['instanceComboItems'];
	}
	public setInstanceComboItems(v: IGComponent['instanceComboItems']): this {
		return this.set('instanceComboItems' as never, v as never);
	}

	public getMargin(): [number, number, number, number] { return this.get('margin'); }
	public setMargin(v: [number, number, number, number]): this { return this.set('margin', v); }
}
