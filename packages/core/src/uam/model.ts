import type { ProjectSettings } from '../types/settings.js';

export interface UamPoint {
	x: number;
	y: number;
}

export interface UamSize {
	width: number;
	height: number;
}

export interface UamDimensions {
	width: number;
	height: number;
}

export interface UamResourceRef {
	packageId?: string;
	resourceId: string;
}

export interface UamRelation {
	targetNodeId: string;
	type: number;
	usePercent: boolean;
}

export interface UamProject {
	projectId: string;
	projectType: number;
	version: string;
	branches: string[];
	settings: ProjectSettings;
	packages: UamPackage[];
}

export interface UamPackagePublish {
	name: string;
	path: string;
	branchPath: string;
	packageCount: number;
	genCode: boolean;
	codePath: string;
}

export interface UamPackage {
	id: string;
	name: string;
	publish: UamPackagePublish | null;
	resources: UamResource[];
}

export type UamResource =
	| UamAssetResource
	| UamComponentResource;

export type UamAssetResourceKind =
	| 'image'
	| 'sound'
	| 'misc'
	| 'font'
	| 'movieClip'
	| 'spine'
	| 'dragonBones';

export interface UamAssetResource {
	kind: UamAssetResourceKind;
	id: string;
	name: string;
	path: string;
	exported: boolean;
	branch: string;
	branchItemIds: string[];
	fileName?: string;
	file?: string;
	dimensions?: UamDimensions | null;
	metadata?: Record<string, unknown> | null;
}

export interface UamComponentResource {
	kind: 'component';
	id: string;
	name: string;
	path: string;
	exported: boolean;
	branch: string;
	branchItemIds: string[];
	component: UamComponentModel;
}

export interface UamComponentModel {
	size: UamSize;
	customData: string;
	displayList: UamDisplayNode[];
	controllers: UamControllerModel[];
	transitions: UamTransitionModel[];
}

export type UamDisplayNodeKind =
	| 'image'
	| 'text'
	| 'component';

interface UamDisplayNodeBase {
	kind: UamDisplayNodeKind;
	id: string;
	name: string;
	position: UamPoint;
	size: UamSize;
	visible: boolean;
	touchable: boolean;
	grayed: boolean;
	alpha: number;
	rotation: number;
	customData: string;
	relations: UamRelation[];
	gears: UamGearBinding[];
}

export interface UamImageNode extends UamDisplayNodeBase {
	kind: 'image';
	resource: UamResourceRef;
}

export interface UamTextNode extends UamDisplayNodeBase {
	kind: 'text';
	text: string;
	font: string;
	fontSize: number;
	color: string;
}

export interface UamComponentRefNode extends UamDisplayNodeBase {
	kind: 'component';
	resource: UamResourceRef;
}

export type UamDisplayNode =
	| UamImageNode
	| UamTextNode
	| UamComponentRefNode;

export interface UamControllerPage {
	id: string;
	name: string;
}

export interface UamControllerAction {
	name: string;
	actionType: number;
	fromPageIds: string[];
	toPageIds: string[];
	transitionName: string;
	playTimes: number;
	delay: number;
	stopOnExit: boolean;
	targetNodeId: string;
	controllerName: string;
	targetPage: string;
}

export interface UamControllerModel {
	name: string;
	selectedIndex: number;
	autoRadioGroupDepth: boolean;
	pages: UamControllerPage[];
	actions: UamControllerAction[];
}

export interface UamTransitionItem {
	name: string;
	time: number;
	actionType: number;
	targetNodeId: string;
	tween: boolean;
	duration: number;
	startValue: unknown[];
	endValue: unknown[];
	easeType: number;
	repeat: number;
	yoyo: boolean;
	label: string;
	endLabel: string;
	path: string;
	customEasePath: string;
}

export interface UamTransitionModel {
	name: string;
	autoPlay: boolean;
	autoPlayTimes: number;
	autoPlayDelay: number;
	options: number;
	fps: number;
	items: UamTransitionItem[];
}

export interface UamGearPageState<TValue> {
	pageId: string;
	value: TValue | null;
}

export interface UamLookGearValue {
	alpha: number;
	rotation: number;
	grayed: boolean;
	touchable: boolean;
}

export interface UamXYGearValue extends UamPoint {}

export interface UamSizeGearValue extends UamSize {
	scaleX: number;
	scaleY: number;
}

export interface UamColorGearValue {
	color: string;
	outlineColor: string | null;
}

export interface UamAnimationGearValue {
	frame: number;
	playing: boolean;
	animationName: string;
	skinName: string;
}

export interface UamTextGearValue {
	text: string;
}

export interface UamIconGearValue {
	icon: string;
}

export interface UamFontSizeGearValue {
	fontSize: number;
}

interface UamValueBoundGear<TKind extends string, TValue> {
	kind: TKind;
	name: string;
	controllerName: string;
	states: UamGearPageState<TValue>[];
	defaultValue: TValue;
	condition: string;
	positionsInPercent: boolean;
	tween: boolean;
	tweenDuration: number;
	tweenDelay: number;
	easeType: number;
	customEasePath: string;
}

export interface UamDisplayGearBinding {
	kind: 'display';
	name: string;
	controllerName: string;
	visibleOnPageIds: string[];
}

export interface UamDisplay2GearBinding {
	kind: 'display2';
	name: string;
	controllerName: string;
	visibleOnPageIds: string[];
	condition: string;
}

export type UamLookGearBinding = UamValueBoundGear<'look', UamLookGearValue>;
export type UamXYGearBinding = UamValueBoundGear<'xy', UamXYGearValue>;
export type UamSizeGearBinding = UamValueBoundGear<'size', UamSizeGearValue>;
export type UamColorGearBinding = UamValueBoundGear<'color', UamColorGearValue>;
export type UamAnimationGearBinding = UamValueBoundGear<'animation', UamAnimationGearValue>;
export type UamTextGearBinding = UamValueBoundGear<'text', UamTextGearValue>;
export type UamIconGearBinding = UamValueBoundGear<'icon', UamIconGearValue>;
export type UamFontSizeGearBinding = UamValueBoundGear<'fontSize', UamFontSizeGearValue>;

export type UamGearBinding =
	| UamDisplayGearBinding
	| UamDisplay2GearBinding
	| UamLookGearBinding
	| UamXYGearBinding
	| UamSizeGearBinding
	| UamColorGearBinding
	| UamAnimationGearBinding
	| UamTextGearBinding
	| UamIconGearBinding
	| UamFontSizeGearBinding;

export interface UamValidationIssue {
	path: string;
	message: string;
}

export const UAM_SUPPORTED_MATERIALIZATION_SCOPE = {
	resourceKinds: ['image', 'component'] as const,
	nodeKinds: ['image', 'text'] as const,
	gearKinds: ['look'] as const,
} as const;
