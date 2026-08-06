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
	useGlobalAtlasSettings: boolean;
	maxAtlasSize: number;
	sizeOption: 'pot' | 'npot' | 'mof';
	forceSquare: boolean;
	allowRotation: boolean;
	paging: boolean;
	extractAlpha: boolean;
	maxAtlasIndex: number;
	atlases: UamPackagePublishAtlas[];
	excludedResourceIds: string[];
}

export interface UamPackagePublishAtlas {
	index: number;
	name: string;
	compression: boolean;
}

export interface UamPackageSettings {
	compressPNG: boolean | null;
	jpegQuality: number | null;
	publish: UamPackagePublish | null;
}

export interface UamPackage {
	id: string;
	name: string;
	compressPNG: boolean | null;
	jpegQuality: number | null;
	publish: UamPackagePublish | null;
	branchNames: string[];
	folders: UamResourceFolder[];
	resources: UamResource[];
}

export interface UamResourceFolder {
	branch: string;
	path: string;
	favorite: boolean;
	atlas: string;
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

interface UamAssetResourceBase {
	id: string;
	name: string;
	path: string;
	exported: boolean;
	favorite: boolean;
	branch: string;
	branchItemIds: string[];
	/**
	 * Primary source-file bytes loaded by an explicit reader hydration request.
	 * The value is copied at UAM boundaries and is never JSON serialized.
	 */
	sourceBytes?: Uint8Array | null;
	/**
	 * Package-relative location of hydrated source bytes. It is updated to the
	 * current resource location after a successful project write.
	 */
	sourcePath?: string;
}

export interface UamImageResourceProperties {
	textureSetMode: string;
	qualityOption: string;
	quality: number;
	smoothing: boolean;
	duplicatePadding: boolean;
	scaleOption: 0 | 1 | 2;
	scale9Grid: [number, number, number, number] | null;
	tileGridIndice: number;
}

export interface UamImageResource extends UamAssetResourceBase {
	kind: 'image';
	fileName?: string;
	dimensions?: UamDimensions | null;
	image: UamImageResourceProperties;
}

export interface UamMovieClipFrame {
	rectX: number;
	rectY: number;
	rectWidth: number;
	rectHeight: number;
	addDelay: number;
	spriteId: string;
}

export interface UamMovieClipResourceProperties {
	interval: number;
	repeatDelay: number;
	swing: boolean;
	smoothing: boolean;
	frames: UamMovieClipFrame[];
}

export interface UamMovieClipResource extends UamAssetResourceBase {
	kind: 'movieClip';
	fileName?: string;
	dimensions: UamDimensions;
	movieClip: UamMovieClipResourceProperties;
}

export interface UamGenericAssetResource extends UamAssetResourceBase {
	kind: Exclude<UamAssetResourceKind, 'image' | 'movieClip'>;
	fileName?: string;
	file?: string;
	dimensions?: UamDimensions | null;
	metadata?: Record<string, unknown> | null;
}

export type UamAssetResource =
	| UamImageResource
	| UamMovieClipResource
	| UamGenericAssetResource;

export interface UamComponentResource {
	kind: 'component';
	id: string;
	name: string;
	path: string;
	exported: boolean;
	favorite: boolean;
	branch: string;
	branchItemIds: string[];
	component: UamComponentModel;
}

export interface UamComponentModel {
	size: UamSize;
	properties: UamComponentProperties;
	customData: string;
	displayList: UamDisplayNode[];
	controllers: UamControllerModel[];
	transitions: UamTransitionModel[];
}

export interface UamComponentCustomProperty {
	target: string;
	propertyId: 0 | 1;
	label: string;
}

export interface UamComponentPropertyOverride {
	target: string;
	propertyId: number;
	value: string;
}

export interface UamComponentProperties {
	minSize: UamSize;
	maxSize: UamSize;
	pivot: UamPoint;
	pivotAsAnchor: boolean;
	overflow: number;
	margin: UamEdgeInsets;
	clipSoftness: UamPoint;
	hitTest: string;
	mask: string;
	reversedMask: boolean;
	scrollType: number;
	scrollBarDisplay: number;
	scrollBarFlags: number;
	scrollBarMargin: UamEdgeInsets;
	vtScrollBarRes: string;
	hzScrollBarRes: string;
	headerRes: string;
	footerRes: string;
	bgColor: string;
	bgColorEnabled: boolean;
	designImageAlpha: number;
	designImageLayer: number;
	designImageOffset: UamPoint;
	idNum: number;
	initName: string;
	remark: string;
	extensionType: string;
	opaque: boolean;
	buttonMode: number;
	sound: string;
	soundVolumeScale: number;
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
	autoClearItems: boolean;
	customProperties: UamComponentCustomProperty[];
}

export interface UamComponentInstanceComboItem {
	title: string | null;
	value: string | null;
	icon: string | null;
}

export type UamComponentInstanceProperties =
	| {
		extensionType: 'Button';
		title: string;
		selectedTitle: string;
		icon: string;
		selectedIcon: string;
		titleColor: string;
		titleFontSize: number;
		controller: string;
		page: string;
		checked: boolean;
		sound: string;
		soundVolumeScale: number;
	}
	| {
		extensionType: 'Label';
		title: string;
		icon: string;
		titleColor: string;
		titleFontSize: number;
		promptText: string;
		sound: string;
		soundVolumeScale: number;
	}
	| {
		extensionType: 'ComboBox';
		title: string;
		icon: string;
		titleColor: string;
		popupDirection: number;
		sound: string;
		soundVolumeScale: number;
		visibleItemCount: number;
		selectionController: string;
		autoClearItems: boolean;
		items: UamComponentInstanceComboItem[];
	}
	| {
		extensionType: 'ProgressBar';
		value: number;
		max: number;
		min: number;
		sound: string;
		soundVolumeScale: number;
	}
	| {
		extensionType: 'Slider';
		value: number;
		max: number;
		min: number;
	}
	| {
		extensionType: 'ScrollBar';
	};

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

export type UamBlendMode = 'normal' | 'none' | 'add' | 'multiply' | 'screen' | 'erase';

export interface UamDisplayNodeBase {
	kind: UamDisplayNodeKind;
	id: string;
	name: string;
	position: UamPoint;
	size: UamSize;
	locked: boolean;
	aspect: boolean;
	minSize: UamSize;
	maxSize: UamSize;
	pivot?: UamPoint;
	pivotAsAnchor?: boolean;
	scale: UamPoint;
	skew: UamPoint;
	visible: boolean;
	touchable: boolean;
	grayed: boolean;
	alpha: number;
	rotation: number;
	tooltips: string;
	blendMode: UamBlendMode;
	filter: string;
	filterData: string;
	customData: string;
	relations: UamRelation[];
	gears: UamGearBinding[];
}

export interface UamGroupableDisplayNodeBase extends UamDisplayNodeBase {
	group: string;
}

export interface UamImageProperties {
	color: string;
	flip: number;
	fillMethod: number;
	fillOrigin: number;
	fillClockwise: boolean;
	fillAmount: number;
}

export interface UamImageNode extends UamGroupableDisplayNodeBase, UamImageProperties {
	kind: 'image';
	resource: UamResourceRef;
}

export interface UamTextProperties {
	text: string;
	font: string;
	fontSize: number;
	color: string;
	align: number;
	vAlign: number;
	leading: number;
	letterSpacing: number;
	autoSize: number;
	singleLine: boolean;
	autoClearText: boolean;
	outlineSoftness: number;
	underlaySoftness: number;
	ubbEnabled: boolean;
	underline: boolean;
	italic: boolean;
	bold: boolean;
	strikethrough: boolean;
	strokeColor: string | null;
	strokeSize: number;
	shadowColor: string | null;
	shadowOffset: UamPoint;
}

export interface UamPlainTextProperties extends UamTextProperties {
	demoText: string;
	templateVarsEnabled: boolean;
	faceDilate: number;
}

export interface UamTextNode extends UamGroupableDisplayNodeBase, UamPlainTextProperties {
	kind: 'text';
}

export interface UamRichTextNode extends UamGroupableDisplayNodeBase, UamTextProperties {
	kind: 'richText';
}

export interface UamTextInputNode extends UamGroupableDisplayNodeBase, UamPlainTextProperties {
	kind: 'textInput';
	promptText: string;
	maxLength: number;
	restrict: string;
	password: boolean;
	keyboardType: number;
}

export interface UamComponentRefNode extends UamGroupableDisplayNodeBase {
	kind: 'component';
	resource: UamResourceRef;
	instanceProperties?: UamComponentInstanceProperties;
	propertyOverrides?: UamComponentPropertyOverride[];
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
	propertyOverrides?: UamComponentPropertyOverride[];
}

export interface UamListProperties {
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
	scrollBarDisplay: number;
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
	autoClearItems: boolean;
	listItems: UamListItemData[];
	pageController: string;
	controllerOverrides: string;
	selectionController: string;
}

export interface UamTreeProperties extends UamListProperties {
	treeView: boolean;
	indent: number;
	clickToExpand: number;
}

export interface UamListNode extends UamGroupableDisplayNodeBase, UamListProperties {
	kind: 'list';
}

export interface UamTreeNode extends UamGroupableDisplayNodeBase, UamTreeProperties {
	kind: 'tree';
}

export interface UamGraphProperties {
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

export interface UamGraphNode extends UamGroupableDisplayNodeBase, UamGraphProperties {
	kind: 'graph';
	pivot: UamPoint;
	pivotAsAnchor: boolean;
}

export interface UamGroupProperties {
	layout: number;
	lineGap: number;
	columnGap: number;
	advanced: boolean;
	excludeInvisibles: boolean;
	autoSizeDisabled: boolean;
	mainGridIndex: number;
}

export interface UamGroupNode extends UamGroupableDisplayNodeBase, UamGroupProperties {
	kind: 'group';
}

export interface UamLoaderProperties {
	url: string;
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

export interface UamLoaderNode extends UamDisplayNodeBase, UamLoaderProperties {
	kind: 'loader';
	pivot: UamPoint;
}

export interface UamLoader3DProperties {
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
	clearOnPublish: boolean;
}

export interface UamLoader3DNode extends UamDisplayNodeBase, UamLoader3DProperties {
	kind: 'loader3D';
}

export interface UamMovieClipProperties {
	playing: boolean;
	frame: number;
	color: string;
}

export interface UamMovieClipNode extends UamGroupableDisplayNodeBase, UamMovieClipProperties {
	kind: 'movieClip';
	resource: UamResourceRef;
	fileName: string;
}

interface UamComponentDerivedNodeBase extends UamGroupableDisplayNodeBase {
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
