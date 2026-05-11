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

export interface UamEdgeInsets {
	top: number;
	bottom: number;
	left: number;
	right: number;
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
	| 'richText'
	| 'textInput'
	| 'component'
	| 'list'
	| 'tree'
	| 'graph'
	| 'group'
	| 'loader'
	| 'loader3D'
	| 'movieClip'
	| 'button'
	| 'label'
	| 'comboBox'
	| 'progressBar'
	| 'slider'
	| 'scrollBar';

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

export interface UamRichTextNode extends Omit<UamTextNode, 'kind'> {
	kind: 'richText';
}

export interface UamTextInputNode extends Omit<UamTextNode, 'kind'> {
	kind: 'textInput';
	promptText: string;
	maxLength: number;
	restrict: string;
	password: boolean;
	keyboardType: number;
}

export interface UamComponentRefNode extends UamDisplayNodeBase {
	kind: 'component';
	resource: UamResourceRef;
}

export interface UamListItemData {
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

export interface UamListNode extends UamDisplayNodeBase {
	kind: 'list';
	group: string;
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
	scrollBarMargin: UamEdgeInsets;
	vtScrollBarRes: string;
	hzScrollBarRes: string;
	headerRes: string;
	footerRes: string;
	margin: UamEdgeInsets;
	clipSoftness: UamPoint;
	scrollItemToViewOnClick: boolean;
	foldInvisibleItems: boolean;
	listItems: UamListItemData[];
	pageController: string;
	controllerOverrides: string;
	selectionController: string;
}

export interface UamTreeNode extends Omit<UamListNode, 'kind'> {
	kind: 'tree';
	treeView: boolean;
	indent: number;
	clickToExpand: number;
}

export interface UamGraphNode extends UamDisplayNodeBase {
	kind: 'graph';
	locked: boolean;
	minWidth: number;
	maxWidth: number;
	minHeight: number;
	maxHeight: number;
	pivot: UamPoint;
	pivotAsAnchor: boolean;
	group: string;
	skew: UamPoint;
	graphType: number;
	lineSize: number;
	lineColor: string;
	fillColor: string;
	cornerRadius: [number, number, number, number] | null;
	points: number[] | null;
	sides: number;
	startAngle: number;
	distances: number[] | null;
}

export interface UamGroupNode extends UamDisplayNodeBase {
	kind: 'group';
	locked: boolean;
	group: string;
	layout: number;
	lineGap: number;
	columnGap: number;
	advanced: boolean;
	excludeInvisibles: boolean;
	autoSizeDisabled: boolean;
	mainGridIndex: number;
}

export interface UamLoaderNode extends UamDisplayNodeBase {
	kind: 'loader';
	pivot: UamPoint;
	scale: UamPoint;
	url: string;
	filter: string;
	filterData: string;
	fill: number;
	shrinkOnly: boolean;
	autoSize: boolean;
	useResize: boolean;
	align: number;
	vAlign: number;
	frame: number;
	playing: boolean;
	color: string;
	fillMethod: number;
	fillOrigin: number;
	fillClockwise: boolean;
	fillAmount: number;
	clearOnPublish: boolean;
}

export interface UamLoader3DNode extends UamDisplayNodeBase {
	kind: 'loader3D';
	url: string;
	fill: number;
	shrinkOnly: boolean;
	autoSize: boolean;
	align: number;
	vAlign: number;
	animationName: string;
	skinName: string;
	playing: boolean;
	frame: number;
	loop: boolean;
	color: string;
}

export interface UamMovieClipNode extends UamDisplayNodeBase {
	kind: 'movieClip';
	resource: UamResourceRef;
	fileName: string;
	filter: string;
	filterData: string;
	playing: boolean;
	frame: number;
	color: string;
}

interface UamComponentDerivedNodeBase extends UamDisplayNodeBase {
	src: string;
	packageId: string;
}

interface UamTitleControlNodeBase extends UamComponentDerivedNodeBase {
	title: string;
	icon: string;
	titleColor: string;
	titleFontSize: number;
	sound: string;
	soundVolumeScale: number;
}

export interface UamButtonNode extends UamTitleControlNodeBase {
	kind: 'button';
	selectedTitle: string;
	selectedIcon: string;
	mode: number;
	downEffect: number;
	downEffectValue: number;
}

export interface UamLabelNode extends UamTitleControlNodeBase {
	kind: 'label';
}

export interface UamComboBoxNode extends UamTitleControlNodeBase {
	kind: 'comboBox';
	items: string[];
	icons: string[];
	values: string[];
	selectedIndex: number;
	visibleItemCount: number;
	popupDirection: number;
}

export interface UamProgressBarNode extends UamComponentDerivedNodeBase {
	kind: 'progressBar';
	titleType: number;
	min: number;
	max: number;
	value: number;
	reverse: boolean;
	sound: string;
	soundVolumeScale: number;
}

export interface UamSliderNode extends UamComponentDerivedNodeBase {
	kind: 'slider';
	titleType: number;
	min: number;
	max: number;
	value: number;
	wholeNumbers: boolean;
}

export interface UamScrollBarNode extends UamComponentDerivedNodeBase {
	kind: 'scrollBar';
	fixedGripSize: boolean;
}

export type UamDisplayNode =
	| UamImageNode
	| UamTextNode
	| UamRichTextNode
	| UamTextInputNode
	| UamComponentRefNode
	| UamListNode
	| UamTreeNode
	| UamGraphNode
	| UamGroupNode
	| UamLoaderNode
	| UamLoader3DNode
	| UamMovieClipNode
	| UamButtonNode
	| UamLabelNode
	| UamComboBoxNode
	| UamProgressBarNode
	| UamSliderNode
	| UamScrollBarNode;

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
	resourceKinds: ['image', 'sound', 'misc', 'font', 'movieClip', 'spine', 'dragonBones', 'component'] as const,
	nodeKinds: [
		'image',
		'text',
		'richText',
		'textInput',
		'component',
		'list',
		'tree',
		'graph',
		'group',
		'loader',
		'loader3D',
		'movieClip',
		'button',
		'label',
		'comboBox',
		'progressBar',
		'slider',
		'scrollBar',
	] as const,
	gearKinds: ['display', 'display2', 'look', 'xy', 'size', 'color', 'animation', 'text', 'icon', 'fontSize'] as const,
} as const;

export const UAM_SUPPORTED_TRANSACTION_SCOPE = {
	resourceKinds: ['image', 'component'] as const,
	nodeKinds: ['image', 'text', 'richText', 'textInput', 'component', 'graph', 'group', 'list', 'loader', 'tree'] as const,
	gearKinds: ['look'] as const,
} as const;
