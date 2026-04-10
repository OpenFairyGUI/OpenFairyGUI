import { RefList } from 'property-graph';
import { type Nullable, ObjectType, OverflowType, PropertyType, ChildrenRenderOrder, type RelationDef } from '../constants.js';
import { ExtensibleProperty, type IExtensibleProperty } from './extensible-property.js';
import type { GObject } from './g-object.js';
import type { Controller } from './controller.js';
import type { Transition } from './transition.js';

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

interface IComponent extends IExtensibleProperty {
	id: string;
	path: string;
	exported: boolean;
	width: number;
	height: number;
	minWidth: number;
	maxWidth: number;
	minHeight: number;
	maxHeight: number;
	pivotX: number;
	pivotY: number;
	pivotAsAnchor: boolean;
	extType: number;
	overflow: number;
	margin: [number, number, number, number];
	clipSoftness: [number, number];
	hitTest: string;
	customData: string;
	mask: string;
	reversedMask: boolean;
	scrollType: number;
	scrollBarDisplay: number;
	scrollBarFlags: number;
	scrollBarMargin: [number, number, number, number];
	vtScrollBarRes: string;
	hzScrollBarRes: string;
	headerRes: string;
	footerRes: string;
	extensionType: string;
	buttonMode: number;
	sound: string;
	soundVolumeScale: number;
	addedToStageSound: string;
	removedFromStageSound: string;
	downEffect: number;
	downEffectValue: number;
	dropdown: string;
	promptText: string;
	selectionController: string;
	titleType: number;
	reverse: boolean;
	wholeNumbers: boolean;
	changeOnClick: boolean;
	fixedGripSize: boolean;
	opaque: boolean;
	childrenRenderOrder: number;
	apexIndex: number;
	relations: RelationDef[];
	displayList: RefList<GObject>;
	controllers: RefList<Controller>;
	transitions: RefList<Transition>;
}

/**
 * A component definition — the primary building block in FairyGUI.
 *
 * Components are resource definitions containing a display list (children),
 * controllers (state machines), and transitions (animations). They can be
 * instantiated in other components via {@link GComponent}.
 *
 * @category Properties
 */
export class Component extends ExtensibleProperty<IComponent> {
	public declare propertyType: PropertyType.COMPONENT;

	protected init(): void {
		this.propertyType = PropertyType.COMPONENT;
	}

	protected getDefaults(): Nullable<IComponent> {
		return Object.assign(super.getDefaults(), {
			id: '',
			path: '',
			exported: false,
			width: 0,
			height: 0,
			minWidth: 0,
			maxWidth: 0,
			minHeight: 0,
			maxHeight: 0,
			pivotX: 0,
			pivotY: 0,
			pivotAsAnchor: false,
			extType: ObjectType.Component,
			overflow: OverflowType.Visible,
			margin: [0, 0, 0, 0] as [number, number, number, number],
			clipSoftness: [0, 0] as [number, number],
			hitTest: '',
			customData: '',
			mask: '',
			reversedMask: false,
			scrollType: 1,
			scrollBarDisplay: 0,
			scrollBarFlags: 0,
			scrollBarMargin: [0, 0, 0, 0] as [number, number, number, number],
			vtScrollBarRes: '',
			hzScrollBarRes: '',
			headerRes: '',
			footerRes: '',
			extensionType: '',
			buttonMode: 0,
			sound: '',
			soundVolumeScale: 1,
			addedToStageSound: '',
			removedFromStageSound: '',
			downEffect: 0,
			downEffectValue: 0.8,
			dropdown: '',
			promptText: '',
			selectionController: '',
			titleType: 0,
			reverse: false,
			wholeNumbers: false,
			changeOnClick: true,
			fixedGripSize: false,
			opaque: true,
			childrenRenderOrder: ChildrenRenderOrder.Ascent,
			apexIndex: 0,
			relations: [],
			displayList: new RefList<GObject>(),
			controllers: new RefList<Controller>(),
			transitions: new RefList<Transition>(),
		});
	}

	public getId(): string { return this.get('id'); }
	public setId(id: string): this { return this.set('id', id); }

	public getPath(): string { return this.get('path'); }
	public setPath(path: string): this { return this.set('path', path); }

	public getExported(): boolean { return this.get('exported'); }
	public setExported(v: boolean): this { return this.set('exported', v); }

	public getWidth(): number { return this.get('width'); }
	public getHeight(): number { return this.get('height'); }
	public getMinWidth(): number { return this.get('minWidth'); }
	public setMinWidth(v: number): this { return this.set('minWidth', v); }
	public getMaxWidth(): number { return this.get('maxWidth'); }
	public setMaxWidth(v: number): this { return this.set('maxWidth', v); }
	public getMinHeight(): number { return this.get('minHeight'); }
	public setMinHeight(v: number): this { return this.set('minHeight', v); }
	public getMaxHeight(): number { return this.get('maxHeight'); }
	public setMaxHeight(v: number): this { return this.set('maxHeight', v); }

	public setSize(w: number, h: number): this {
		this.set('width', w);
		return this.set('height', h);
	}

	public getPivotX(): number { return this.get('pivotX'); }
	public setPivotX(v: number): this { return this.set('pivotX', v); }
	public getPivotY(): number { return this.get('pivotY'); }
	public setPivotY(v: number): this { return this.set('pivotY', v); }
	public getPivotAsAnchor(): boolean { return this.get('pivotAsAnchor'); }
	public setPivotAsAnchor(v: boolean): this { return this.set('pivotAsAnchor', v); }

	public getExtType(): number { return this.get('extType'); }
	public setExtType(v: number): this { return this.set('extType', v); }

	public getOverflow(): number { return this.get('overflow'); }
	public setOverflow(v: number): this { return this.set('overflow', v); }

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

	public getHitTest(): string { return this.get('hitTest'); }
	public setHitTest(v: string): this { return this.set('hitTest', v); }

	public getCustomData(): string { return this.get('customData'); }
	public setCustomData(v: string): this { return this.set('customData', v); }

	public getMask(): string { return this.get('mask'); }
	public setMask(v: string): this { return this.set('mask', v); }

	public getReversedMask(): boolean { return this.get('reversedMask'); }
	public setReversedMask(v: boolean): this { return this.set('reversedMask', v); }

	public getScrollType(): number { return this.get('scrollType'); }
	public setScrollType(v: number): this { return this.set('scrollType', v); }

	public getScrollBarDisplay(): number { return this.get('scrollBarDisplay'); }
	public setScrollBarDisplay(v: number): this { return this.set('scrollBarDisplay', v); }

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

	public getExtensionType(): string { return this.get('extensionType'); }
	public setExtensionType(v: string): this { return this.set('extensionType', v); }

	public getButtonMode(): number { return this.get('buttonMode'); }
	public setButtonMode(v: number): this { return this.set('buttonMode', v); }

	public getSound(): string { return this.get('sound'); }
	public setSound(v: string): this { return this.set('sound', v); }

	public getSoundVolumeScale(): number { return this.get('soundVolumeScale'); }
	public setSoundVolumeScale(v: number): this { return this.set('soundVolumeScale', v); }

	public getAddedToStageSound(): string { return this.get('addedToStageSound'); }
	public setAddedToStageSound(v: string): this { return this.set('addedToStageSound', v); }

	public getRemovedFromStageSound(): string { return this.get('removedFromStageSound'); }
	public setRemovedFromStageSound(v: string): this { return this.set('removedFromStageSound', v); }

	public getDownEffect(): number { return this.get('downEffect'); }
	public setDownEffect(v: number): this { return this.set('downEffect', v); }

	public getDownEffectValue(): number { return this.get('downEffectValue'); }
	public setDownEffectValue(v: number): this { return this.set('downEffectValue', v); }

	public getDropdown(): string { return this.get('dropdown'); }
	public setDropdown(v: string): this { return this.set('dropdown', v); }

	public getPromptText(): string { return this.get('promptText'); }
	public setPromptText(v: string): this { return this.set('promptText', v); }

	public getSelectionController(): string { return this.get('selectionController'); }
	public setSelectionController(v: string): this { return this.set('selectionController', v); }

	public getTitleType(): number { return this.get('titleType'); }
	public setTitleType(v: number): this { return this.set('titleType', v); }

	public getReverse(): boolean { return this.get('reverse'); }
	public setReverse(v: boolean): this { return this.set('reverse', v); }

	public getWholeNumbers(): boolean { return this.get('wholeNumbers'); }
	public setWholeNumbers(v: boolean): this { return this.set('wholeNumbers', v); }

	public getChangeOnClick(): boolean { return this.get('changeOnClick'); }
	public setChangeOnClick(v: boolean): this { return this.set('changeOnClick', v); }

	public getFixedGripSize(): boolean { return this.get('fixedGripSize'); }
	public setFixedGripSize(v: boolean): this { return this.set('fixedGripSize', v); }

	public getOpaque(): boolean { return this.get('opaque'); }
	public setOpaque(v: boolean): this { return this.set('opaque', v); }

	public getChildrenRenderOrder(): number { return this.get('childrenRenderOrder'); }
	public setChildrenRenderOrder(v: number): this { return this.set('childrenRenderOrder', v); }

	/****** Relations ******/

	public getRelations(): RelationDef[] { return this.get('relations'); }
	public setRelations(relations: RelationDef[]): this { return this.set('relations', relations); }
	public addRelation(relation: RelationDef): this {
		const relations = [...this.getRelations(), relation];
		return this.set('relations', relations);
	}

	/****** Display List ******/

	public addChild(child: GObject): this { return this.addRef('displayList', child); }
	public removeChild(child: GObject): this { return this.removeRef('displayList', child); }
	public listChildren(): GObject[] { return this.listRefs('displayList'); }

	public getChild(name: string): GObject | null {
		return this.listChildren().find((child) => child.getName() === name) || null;
	}

	public getChildById(id: string): GObject | null {
		return this.listChildren().find((child) => child.getId() === id) || null;
	}

	/****** Controllers ******/

	public addController(ctrl: Controller): this { return this.addRef('controllers', ctrl); }
	public removeController(ctrl: Controller): this { return this.removeRef('controllers', ctrl); }
	public listControllers(): Controller[] { return this.listRefs('controllers'); }

	public getController(name: string): Controller | null {
		return this.listControllers().find((c) => c.getName() === name) || null;
	}

	/****** Transitions ******/

	public addTransition(trans: Transition): this { return this.addRef('transitions', trans); }
	public removeTransition(trans: Transition): this { return this.removeRef('transitions', trans); }
	public listTransitions(): Transition[] { return this.listRefs('transitions'); }

	public getTransition(name: string): Transition | null {
		return this.listTransitions().find((t) => t.getName() === name) || null;
	}
}
