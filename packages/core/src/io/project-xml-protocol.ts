export interface XmlAttrSpec {
	canonical: string;
	aliases?: readonly string[];
	implemented?: boolean;
}

export interface XmlNodeProtocol {
	attrs: Record<string, XmlAttrSpec>;
	children?: Record<string, XmlNodeProtocol>;
	containers?: Record<string, XmlContainerProtocol>;
}

export interface XmlContainerProtocol {
	kind: 'orderedVariants';
	items: Record<string, XmlNodeProtocol>;
}

type XmlAttrSource = Record<string, unknown>;
type XmlAttrTarget = Record<string, unknown>;
type XmlAttrMap = Record<string, XmlAttrSpec>;
type XmlChildrenMap = Record<string, XmlNodeProtocol>;
type XmlContainerMap = Record<string, XmlContainerProtocol>;

const mergeAttrs = (...parts: readonly XmlAttrMap[]): XmlAttrMap =>
	Object.assign({}, ...parts);

const mergeChildren = (...parts: readonly XmlChildrenMap[]): XmlChildrenMap =>
	Object.assign({}, ...parts);

const mergeContainers = (...parts: readonly XmlContainerMap[]): XmlContainerMap =>
	Object.assign({}, ...parts);

const defineContainer = (
	items: Record<string, XmlNodeProtocol>,
): XmlContainerProtocol => ({
	kind: 'orderedVariants',
	items,
});

const defineNode = (
	attrs: XmlAttrMap,
	children?: XmlChildrenMap,
	containers?: XmlContainerMap,
): XmlNodeProtocol => ({
	attrs,
	...(children ? { children } : {}),
	...(containers ? { containers } : {}),
});

const PACKAGE_DESCRIPTION_ATTRS = {
	id: { canonical: 'id' },
	compressPNG: { canonical: 'compressPNG' },
	jpegQuality: { canonical: 'jpegQuality' },
} satisfies XmlAttrMap;

const BRANCH_DESCRIPTION_ATTRS = {} satisfies XmlAttrMap;

const PACKAGE_PUBLISH_ATTRS = {
	name: { canonical: 'name' },
	path: { canonical: 'path' },
	branchPath: { canonical: 'branchPath' },
	packageCount: { canonical: 'packageCount' },
	genCode: { canonical: 'genCode' },
	codePath: { canonical: 'codePath' },
} satisfies XmlAttrMap;

const PACKAGE_PUBLISH_ATLAS_ATTRS = {
	name: { canonical: 'name' },
	index: { canonical: 'index' },
} satisfies XmlAttrMap;

const PACKAGE_RESOURCE_BASE_ATTRS = {
	id: { canonical: 'id' },
	name: { canonical: 'name' },
	path: { canonical: 'path' },
	exported: { canonical: 'exported' },
} satisfies XmlAttrMap;

const PACKAGE_IMAGE_RESOURCE_ATTRS = {
	atlas: { canonical: 'atlas' },
	scale: { canonical: 'scale' },
	scale9grid: { canonical: 'scale9grid' },
	width: { canonical: 'width' },
	height: { canonical: 'height' },
	gridTile: { canonical: 'gridTile' },
	qualityOption: { canonical: 'qualityOption' },
	duplicatePadding: { canonical: 'duplicatePadding' },
	smoothing: { canonical: 'smoothing' },
} satisfies XmlAttrMap;

const PACKAGE_FONT_RESOURCE_ATTRS = {
	texture: { canonical: 'texture' },
	renderMode: { canonical: 'renderMode' },
	samplePointSize: { canonical: 'samplePointSize' },
} satisfies XmlAttrMap;

const PACKAGE_MOVIE_CLIP_RESOURCE_ATTRS = {
	atlas: { canonical: 'atlas' },
} satisfies XmlAttrMap;

const PACKAGE_SKELETON_RESOURCE_ATTRS = {
	width: { canonical: 'width' },
	height: { canonical: 'height' },
	require: { canonical: 'require' },
	atlasNames: { canonical: 'atlasNames' },
	anchor: { canonical: 'anchor' },
} satisfies XmlAttrMap;

const DISPLAY_OBJECT_IDENTITY_ATTRS = {
	id: { canonical: 'id' },
	name: { canonical: 'name' },
	relation: { canonical: 'relation' },
} satisfies XmlAttrMap;

const XY_SIZE_ATTRS = {
	xy: { canonical: 'xy' },
	size: { canonical: 'size' },
} satisfies XmlAttrMap;

const LOCKED_ATTRS = {
	locked: { canonical: 'locked' },
} satisfies XmlAttrMap;

const RESTRICT_SIZE_ATTRS = {
	restrictSize: { canonical: 'restrictSize' },
} satisfies XmlAttrMap;

const ASPECT_ATTRS = {
	aspect: { canonical: 'aspect' },
} satisfies XmlAttrMap;

const PIVOT_ATTRS = {
	pivot: { canonical: 'pivot' },
} satisfies XmlAttrMap;

const ANCHOR_ATTRS = {
	anchor: { canonical: 'anchor' },
} satisfies XmlAttrMap;

const SCALE_ATTRS = {
	scale: { canonical: 'scale' },
} satisfies XmlAttrMap;

const SKEW_ATTRS = {
	skew: { canonical: 'skew' },
} satisfies XmlAttrMap;

const GROUP_REF_ATTRS = {
	group: { canonical: 'group' },
} satisfies XmlAttrMap;

const ROTATION_ALPHA_ATTRS = {
	rotation: { canonical: 'rotation' },
	alpha: { canonical: 'alpha' },
} satisfies XmlAttrMap;

const VISIBLE_ATTRS = {
	visible: { canonical: 'visible' },
} satisfies XmlAttrMap;

const TOUCHABLE_ATTRS = {
	touchable: { canonical: 'touchable' },
} satisfies XmlAttrMap;

const GRAYED_ATTRS = {
	grayed: { canonical: 'grayed' },
} satisfies XmlAttrMap;

const COMMON_DISPLAY_STATE_ATTRS = mergeAttrs(
	ROTATION_ALPHA_ATTRS,
	VISIBLE_ATTRS,
	TOUCHABLE_ATTRS,
	GRAYED_ATTRS,
);

const INSTANCE_MISC_PANEL_ATTRS = {
	tooltips: { canonical: 'tooltips' },
	customData: { canonical: 'customData' },
} satisfies XmlAttrMap;

const RESOURCE_LINK_ATTRS = {
	fileName: { canonical: 'fileName' },
	pkg: { canonical: 'pkg' },
} satisfies XmlAttrMap;

const FILTER_ATTRS = {
	filter: { canonical: 'filter' },
	filterData: { canonical: 'filterData' },
} satisfies XmlAttrMap;

const ROOT_COMPONENT_PANEL_ATTRS = {
	size: { canonical: 'size' },
	pivot: { canonical: 'pivot' },
	anchor: { canonical: 'anchor' },
	margin: { canonical: 'margin' },
	restrictSize: { canonical: 'restrictSize' },
	overflow: { canonical: 'overflow' },
	clipSoftness: { canonical: 'clipSoftness' },
	opaque: { canonical: 'opaque' },
	mask: { canonical: 'mask' },
	reversedMask: { canonical: 'reversedMask' },
	hitTest: { canonical: 'hitTest' },
	customData: { canonical: 'customData' },
	scroll: { canonical: 'scroll' },
	scrollBar: { canonical: 'scrollBar' },
	scrollBarFlags: { canonical: 'scrollBarFlags' },
	scrollBarMargin: { canonical: 'scrollBarMargin' },
	scrollBarRes: { canonical: 'scrollBarRes' },
	ptrRes: { canonical: 'ptrRes' },
	extention: { canonical: 'extention' },
	bgColor: { canonical: 'bgColor' },
	bgColorEnabled: { canonical: 'bgColorEnabled' },
	idnum: { canonical: 'idnum' },
	initName: { canonical: 'initName' },
} satisfies XmlAttrMap;

const ROOT_MISC_PANEL_ATTRS = {
	remark: { canonical: 'remark' },
} satisfies XmlAttrMap;

const ROOT_DESIGN_PANEL_ATTRS = {
	designImageAlpha: { canonical: 'designImageAlpha' },
	designImageLayer: { canonical: 'designImageLayer' },
	designImageOffsetX: { canonical: 'designImageOffsetX' },
	designImageOffsetY: { canonical: 'designImageOffsetY' },
} satisfies XmlAttrMap;

const COMPONENT_INSTANCE_PANEL_ATTRS = {
	src: { canonical: 'src' },
	controllerOverrides: { canonical: 'controller' },
	pageController: { canonical: 'pageController' },
} satisfies XmlAttrMap;

const IMAGE_PANEL_ATTRS = {
	src: { canonical: 'src' },
	color: { canonical: 'color' },
	flip: { canonical: 'flip' },
	fillMethod: { canonical: 'fillMethod' },
	fillOrigin: { canonical: 'fillOrigin' },
	fillClockwise: { canonical: 'fillClockwise' },
	fillAmount: { canonical: 'fillAmount' },
} satisfies XmlAttrMap;

const GRAPH_PANEL_ATTRS = {
	type: { canonical: 'type' },
	lineSize: { canonical: 'lineSize' },
	lineColor: { canonical: 'lineColor' },
	fillColor: { canonical: 'fillColor' },
	corner: { canonical: 'corner' },
	points: { canonical: 'points' },
	sides: { canonical: 'sides' },
	startAngle: { canonical: 'startAngle' },
	distances: { canonical: 'distances' },
} satisfies XmlAttrMap;

const MOVIE_CLIP_PANEL_ATTRS = {
	src: { canonical: 'src' },
	playing: { canonical: 'playing' },
	frame: { canonical: 'frame' },
	color: { canonical: 'color' },
} satisfies XmlAttrMap;

const LOADER_PANEL_ATTRS = {
	url: { canonical: 'url' },
	align: { canonical: 'align' },
	vAlign: { canonical: 'vAlign' },
	fill: { canonical: 'fill' },
	shrinkOnly: { canonical: 'shrinkOnly' },
	autoSize: { canonical: 'autoSize' },
	useResize: { canonical: 'useResize' },
	color: { canonical: 'color' },
	playing: { canonical: 'playing' },
	frame: { canonical: 'frame' },
	fillMethod: { canonical: 'fillMethod' },
	fillOrigin: { canonical: 'fillOrigin' },
	fillClockwise: { canonical: 'fillClockwise' },
	fillAmount: { canonical: 'fillAmount' },
	clearOnPublish: { canonical: 'clearOnPublish' },
} satisfies XmlAttrMap;

const LOADER3D_PANEL_ATTRS = {
	url: { canonical: 'url' },
	align: { canonical: 'align' },
	vAlign: { canonical: 'vAlign' },
	fill: { canonical: 'fill' },
	shrinkOnly: { canonical: 'shrinkOnly' },
	autoSize: { canonical: 'autoSize' },
	animation: { canonical: 'animation', aliases: ['animationName'] },
	skinName: { canonical: 'skin', aliases: ['skinName'] },
	playing: { canonical: 'playing' },
	frame: { canonical: 'frame' },
	loop: { canonical: 'loop' },
	color: { canonical: 'color' },
	clearOnPublish: { canonical: 'clearOnPublish' },
} satisfies XmlAttrMap;

const TEXT_PANEL_ATTRS = {
	font: { canonical: 'font' },
	fontSize: { canonical: 'fontSize' },
	color: { canonical: 'color' },
	align: { canonical: 'align' },
	vAlign: { canonical: 'vAlign' },
	autoSize: { canonical: 'autoSize' },
	singleLine: { canonical: 'singleLine' },
	text: { canonical: 'text' },
	input: { canonical: 'input' },
	ubb: { canonical: 'ubb' },
	leading: { canonical: 'leading' },
	letterSpacing: { canonical: 'letterSpacing' },
	underline: { canonical: 'underline' },
	italic: { canonical: 'italic' },
	bold: { canonical: 'bold' },
	strikethrough: { canonical: 'strikethrough' },
	strokeColor: { canonical: 'strokeColor' },
	strokeSize: { canonical: 'strokeSize' },
	shadowColor: { canonical: 'shadowColor' },
	shadowOffset: { canonical: 'shadowOffset' },
	autoClearText: { canonical: 'autoClearText' },
	demoText: { canonical: 'demoText' },
	faceDilate: { canonical: 'faceDilate' },
	underlaySoftness: { canonical: 'underlaySoftness' },
	vars: { canonical: 'vars' },
} satisfies XmlAttrMap;

const TEXT_INPUT_PANEL_ATTRS = {
	prompt: { canonical: 'prompt', aliases: ['promptText'] },
	maxLength: { canonical: 'maxLength' },
	restrict: { canonical: 'restrict' },
	password: { canonical: 'password' },
	keyboardType: { canonical: 'keyboardType' },
} satisfies XmlAttrMap;

const RICH_TEXT_PANEL_ATTRS = {
	restrictSize: { canonical: 'restrictSize' },
	underlaySoftness: { canonical: 'underlaySoftness' },
} satisfies XmlAttrMap;

const GROUP_PANEL_ATTRS = {
	layout: { canonical: 'layout' },
	lineGap: { canonical: 'lineGap' },
	columnGap: { canonical: 'colGap', aliases: ['columnGap'] },
	advanced: { canonical: 'advanced' },
	excludeInvisibles: { canonical: 'excludeInvisibles' },
	autoSizeDisabled: { canonical: 'autoSizeDisabled' },
	mainGridIndex: { canonical: 'mainGridIndex' },
} satisfies XmlAttrMap;

const LIST_PANEL_ATTRS = {
	src: { canonical: 'src' },
	layout: { canonical: 'layout' },
	align: { canonical: 'align' },
	vAlign: { canonical: 'vAlign' },
	lineGap: { canonical: 'lineGap' },
	columnGap: { canonical: 'colGap', aliases: ['columnGap'] },
	lineItemCount: { canonical: 'lineItemCount' },
	lineItemCount2: { canonical: 'lineItemCount2' },
	autoResizeItem: { canonical: 'autoItemSize', aliases: ['autoResizeItem'] },
	selectionMode: { canonical: 'selectionMode' },
	selectionController: { canonical: 'selectionController' },
	defaultItem: { canonical: 'defaultItem' },
	pageController: { canonical: 'pageController' },
	controllerOverrides: { canonical: 'controller' },
	overflow: { canonical: 'overflow' },
	scroll: { canonical: 'scroll' },
	scrollBar: { canonical: 'scrollBar' },
	scrollBarFlags: { canonical: 'scrollBarFlags' },
	scrollBarMargin: { canonical: 'scrollBarMargin' },
	scrollBarRes: { canonical: 'scrollBarRes' },
	ptrRes: { canonical: 'ptrRes' },
	margin: { canonical: 'margin' },
	clipSoftness: { canonical: 'clipSoftness' },
	treeView: { canonical: 'treeView' },
	indent: { canonical: 'indent' },
	clickToExpand: { canonical: 'clickToExpand' },
	autoClearItems: { canonical: 'autoClearItems' },
} satisfies XmlAttrMap;

const BUTTON_EXTENSION_ATTRS = {
	mode: { canonical: 'mode' },
	sound: { canonical: 'sound' },
	soundVolumeScale: { canonical: 'soundVolumeScale', aliases: ['volume'] },
	downEffect: { canonical: 'downEffect' },
	downEffectValue: { canonical: 'downEffectValue' },
	title: { canonical: 'title' },
	selectedTitle: { canonical: 'selectedTitle' },
	icon: { canonical: 'icon' },
	selectedIcon: { canonical: 'selectedIcon' },
	titleColor: { canonical: 'titleColor' },
	titleFontSize: { canonical: 'titleFontSize' },
	controller: { canonical: 'controller' },
	page: { canonical: 'page' },
	checked: { canonical: 'checked' },
} satisfies XmlAttrMap;

const LABEL_EXTENSION_ATTRS = {
	title: { canonical: 'title' },
	icon: { canonical: 'icon' },
	titleColor: { canonical: 'titleColor' },
	titleFontSize: { canonical: 'titleFontSize' },
	prompt: { canonical: 'prompt' },
} satisfies XmlAttrMap;

const COMBOBOX_EXTENSION_ATTRS = {
	dropdown: { canonical: 'dropdown' },
	title: { canonical: 'title' },
	icon: { canonical: 'icon' },
	visibleItemCount: { canonical: 'visibleItemCount' },
	selectionController: { canonical: 'selectionController' },
} satisfies XmlAttrMap;

const PROGRESSBAR_EXTENSION_ATTRS = {
	titleType: { canonical: 'titleType' },
	reverse: { canonical: 'reverse' },
	value: { canonical: 'value' },
	max: { canonical: 'max' },
	min: { canonical: 'min' },
} satisfies XmlAttrMap;

const SLIDER_EXTENSION_ATTRS = {
	titleType: { canonical: 'titleType' },
	reverse: { canonical: 'reverse' },
	wholeNumbers: { canonical: 'wholeNumbers' },
	changeOnClick: { canonical: 'changeOnClick' },
	value: { canonical: 'value' },
	max: { canonical: 'max' },
	min: { canonical: 'min' },
} satisfies XmlAttrMap;

const SCROLLBAR_EXTENSION_ATTRS = {
	fixedGripSize: { canonical: 'fixedGripSize' },
} satisfies XmlAttrMap;

const RELATION_ATTRS = {
	target: { canonical: 'target' },
	sidePair: { canonical: 'sidePair' },
} satisfies XmlAttrMap;

const GEAR_ATTRS = {
	controller: { canonical: 'controller' },
	pages: { canonical: 'pages' },
	values: { canonical: 'values' },
	default: { canonical: 'default' },
	tween: { canonical: 'tween' },
	positionsInPercent: { canonical: 'positionsInPercent' },
	condition: { canonical: 'condition' },
	ease: { canonical: 'ease' },
	duration: { canonical: 'duration' },
} satisfies XmlAttrMap;

const CONTROLLER_ATTRS = {
	name: { canonical: 'name' },
	pages: { canonical: 'pages' },
	selected: { canonical: 'selected' },
} satisfies XmlAttrMap;

const CONTROLLER_ACTION_ATTRS = {
	type: { canonical: 'type' },
	fromPage: { canonical: 'fromPage' },
	toPage: { canonical: 'toPage' },
	transition: { canonical: 'transition' },
	repeat: { canonical: 'repeat' },
	delay: { canonical: 'delay' },
	stopOnExit: { canonical: 'stopOnExit' },
	objectId: { canonical: 'objectId' },
	controller: { canonical: 'controller' },
	targetPage: { canonical: 'targetPage' },
} satisfies XmlAttrMap;

const TRANSITION_ATTRS = {
	name: { canonical: 'name' },
	autoPlay: { canonical: 'autoPlay' },
	autoPlayTimes: { canonical: 'autoPlayRepeat', aliases: ['autoPlayTimes'] },
	autoPlayDelay: { canonical: 'autoPlayDelay' },
	options: { canonical: 'options' },
	fps: { canonical: 'fps' },
} satisfies XmlAttrMap;

const TRANSITION_ITEM_ATTRS = {
	time: { canonical: 'time' },
	target: { canonical: 'target' },
	tween: { canonical: 'tween' },
	duration: { canonical: 'duration' },
	repeat: { canonical: 'repeat' },
	yoyo: { canonical: 'yoyo' },
	label: { canonical: 'label' },
	label2: { canonical: 'label2' },
	path: { canonical: 'path' },
	customEase: { canonical: 'customEase' },
	ease: { canonical: 'ease' },
	type: { canonical: 'type' },
	value: { canonical: 'value' },
	startValue: { canonical: 'startValue' },
	endValue: { canonical: 'endValue' },
} satisfies XmlAttrMap;

const LIST_ITEM_ATTRS = {
	title: { canonical: 'title' },
	icon: { canonical: 'icon' },
	url: { canonical: 'url' },
	name: { canonical: 'name' },
	selectedTitle: { canonical: 'selectedTitle' },
	selectedIcon: { canonical: 'selectedIcon' },
	level: { canonical: 'level' },
	isFolder: { canonical: 'isFolder' },
	controllers: { canonical: 'controllers' },
} satisfies XmlAttrMap;

const COMBOBOX_ITEM_ATTRS = {
	title: { canonical: 'title' },
	value: { canonical: 'value' },
	icon: { canonical: 'icon' },
} satisfies XmlAttrMap;

const PACKAGE_DESCRIPTION_NODE = defineNode(PACKAGE_DESCRIPTION_ATTRS);
const BRANCH_DESCRIPTION_NODE = defineNode(BRANCH_DESCRIPTION_ATTRS);
const PACKAGE_PUBLISH_ATLAS_NODE = defineNode(PACKAGE_PUBLISH_ATLAS_ATTRS);
const PACKAGE_PUBLISH_NODE = defineNode(
	PACKAGE_PUBLISH_ATTRS,
	{
		atlas: PACKAGE_PUBLISH_ATLAS_NODE,
	},
);
const PACKAGE_RESOURCE_NODE = defineNode(PACKAGE_RESOURCE_BASE_ATTRS);
const PACKAGE_IMAGE_RESOURCE_NODE = defineNode(PACKAGE_IMAGE_RESOURCE_ATTRS);
const PACKAGE_FONT_RESOURCE_NODE = defineNode(PACKAGE_FONT_RESOURCE_ATTRS);
const PACKAGE_MOVIE_CLIP_RESOURCE_NODE = defineNode(PACKAGE_MOVIE_CLIP_RESOURCE_ATTRS);
const PACKAGE_SKELETON_RESOURCE_NODE = defineNode(PACKAGE_SKELETON_RESOURCE_ATTRS);
const DISPLAY_OBJECT_NODE = defineNode(mergeAttrs(
	DISPLAY_OBJECT_IDENTITY_ATTRS,
	PIVOT_ATTRS,
	ANCHOR_ATTRS,
));
const BUTTON_EXTENSION_NODE = defineNode(BUTTON_EXTENSION_ATTRS);
const LABEL_EXTENSION_NODE = defineNode(LABEL_EXTENSION_ATTRS);
const PROGRESSBAR_EXTENSION_NODE = defineNode(PROGRESSBAR_EXTENSION_ATTRS);
const SLIDER_EXTENSION_NODE = defineNode(SLIDER_EXTENSION_ATTRS);
const SCROLLBAR_EXTENSION_NODE = defineNode(SCROLLBAR_EXTENSION_ATTRS);
const RELATION_NODE = defineNode(RELATION_ATTRS);
const GEAR_NODE = defineNode(GEAR_ATTRS);
const CONTROLLER_ACTION_NODE = defineNode(CONTROLLER_ACTION_ATTRS);
const TRANSITION_ITEM_NODE = defineNode(TRANSITION_ITEM_ATTRS);
const LIST_ITEM_NODE = defineNode(LIST_ITEM_ATTRS);
const COMBOBOX_ITEM_NODE = defineNode(COMBOBOX_ITEM_ATTRS);

const WITH_RELATION_CHILDREN = {
	relation: RELATION_NODE,
} satisfies XmlChildrenMap;

const WITH_GEAR_CHILDREN = {
	gearDisplay: GEAR_NODE,
	gearXY: GEAR_NODE,
	gearSize: GEAR_NODE,
	gearLook: GEAR_NODE,
	gearColor: GEAR_NODE,
	gearAni: GEAR_NODE,
	gearText: GEAR_NODE,
	gearIcon: GEAR_NODE,
	gearDisplay2: GEAR_NODE,
	gearFontSize: GEAR_NODE,
} satisfies XmlChildrenMap;

const WITH_GROUP_GEAR_CHILDREN = {
	gearDisplay: GEAR_NODE,
	gearXY: GEAR_NODE,
	gearSize: GEAR_NODE,
	gearText: GEAR_NODE,
	gearIcon: GEAR_NODE,
	gearDisplay2: GEAR_NODE,
} satisfies XmlChildrenMap;

const WITH_CONTROLLER_ACTION_CHILDREN = {
	action: CONTROLLER_ACTION_NODE,
} satisfies XmlChildrenMap;

const WITH_TRANSITION_ITEM_CHILDREN = {
	item: TRANSITION_ITEM_NODE,
} satisfies XmlChildrenMap;

const WITH_LIST_ITEM_CHILDREN = {
	item: LIST_ITEM_NODE,
} satisfies XmlChildrenMap;

const COMBOBOX_EXTENSION_NODE = defineNode(
	mergeAttrs(COMBOBOX_EXTENSION_ATTRS),
	mergeChildren({
		item: COMBOBOX_ITEM_NODE,
	}),
);

const WITH_INSTANCE_EXTENSION_CHILDREN = {
	Button: BUTTON_EXTENSION_NODE,
	Label: LABEL_EXTENSION_NODE,
	ComboBox: COMBOBOX_EXTENSION_NODE,
	ProgressBar: PROGRESSBAR_EXTENSION_NODE,
	Slider: SLIDER_EXTENSION_NODE,
	ScrollBar: SCROLLBAR_EXTENSION_NODE,
} satisfies XmlChildrenMap;

const WITH_ROOT_EXTENSION_CHILDREN = {
	Button: BUTTON_EXTENSION_NODE,
	Label: LABEL_EXTENSION_NODE,
	ComboBox: COMBOBOX_EXTENSION_NODE,
	ProgressBar: PROGRESSBAR_EXTENSION_NODE,
	Slider: SLIDER_EXTENSION_NODE,
	ScrollBar: SCROLLBAR_EXTENSION_NODE,
} satisfies XmlChildrenMap;

const CONTROLLER_NODE = defineNode(
	mergeAttrs(CONTROLLER_ATTRS),
	mergeChildren(WITH_CONTROLLER_ACTION_CHILDREN),
);

const TRANSITION_NODE = defineNode(
	mergeAttrs(TRANSITION_ATTRS),
	mergeChildren(WITH_TRANSITION_ITEM_CHILDREN),
);

const IMAGE_NODE = defineNode(
	mergeAttrs(
		IMAGE_PANEL_ATTRS,
		XY_SIZE_ATTRS,
		LOCKED_ATTRS,
		ASPECT_ATTRS,
		PIVOT_ATTRS,
		ANCHOR_ATTRS,
		SCALE_ATTRS,
		SKEW_ATTRS,
		GROUP_REF_ATTRS,
		COMMON_DISPLAY_STATE_ATTRS,
		RESOURCE_LINK_ATTRS,
		FILTER_ATTRS,
	),
	mergeChildren(WITH_RELATION_CHILDREN, WITH_GEAR_CHILDREN),
);

const GRAPH_NODE = defineNode(
	mergeAttrs(
		XY_SIZE_ATTRS,
		LOCKED_ATTRS,
		RESTRICT_SIZE_ATTRS,
		PIVOT_ATTRS,
		ANCHOR_ATTRS,
		SKEW_ATTRS,
		GROUP_REF_ATTRS,
		COMMON_DISPLAY_STATE_ATTRS,
		GRAPH_PANEL_ATTRS,
	),
	mergeChildren(WITH_RELATION_CHILDREN, WITH_GEAR_CHILDREN),
);

const MOVIE_CLIP_NODE = defineNode(
	mergeAttrs(
		MOVIE_CLIP_PANEL_ATTRS,
		XY_SIZE_ATTRS,
		PIVOT_ATTRS,
		ANCHOR_ATTRS,
		GROUP_REF_ATTRS,
		COMMON_DISPLAY_STATE_ATTRS,
		RESOURCE_LINK_ATTRS,
		FILTER_ATTRS,
	),
	mergeChildren(WITH_RELATION_CHILDREN, WITH_GEAR_CHILDREN),
);

const COMPONENT_INSTANCE_NODE = defineNode(
	mergeAttrs(
		COMPONENT_INSTANCE_PANEL_ATTRS,
		XY_SIZE_ATTRS,
		LOCKED_ATTRS,
		RESTRICT_SIZE_ATTRS,
		ASPECT_ATTRS,
		PIVOT_ATTRS,
		ANCHOR_ATTRS,
		SCALE_ATTRS,
		GROUP_REF_ATTRS,
		COMMON_DISPLAY_STATE_ATTRS,
		INSTANCE_MISC_PANEL_ATTRS,
		RESOURCE_LINK_ATTRS,
		FILTER_ATTRS,
	),
	mergeChildren(
		WITH_RELATION_CHILDREN,
		WITH_GEAR_CHILDREN,
		WITH_INSTANCE_EXTENSION_CHILDREN,
	),
);

const LOADER_NODE = defineNode(
	mergeAttrs(
		XY_SIZE_ATTRS,
		PIVOT_ATTRS,
		ANCHOR_ATTRS,
		SCALE_ATTRS,
		GROUP_REF_ATTRS,
		COMMON_DISPLAY_STATE_ATTRS,
		LOADER_PANEL_ATTRS,
		FILTER_ATTRS,
	),
	mergeChildren(WITH_RELATION_CHILDREN, WITH_GEAR_CHILDREN),
);

const LOADER3D_NODE = defineNode(
	mergeAttrs(XY_SIZE_ATTRS, PIVOT_ATTRS, ANCHOR_ATTRS, COMMON_DISPLAY_STATE_ATTRS, LOADER3D_PANEL_ATTRS),
	mergeChildren(WITH_RELATION_CHILDREN, WITH_GEAR_CHILDREN),
);

const TEXT_NODE = defineNode(
	mergeAttrs(
		XY_SIZE_ATTRS,
		RESTRICT_SIZE_ATTRS,
		PIVOT_ATTRS,
		ANCHOR_ATTRS,
		{ customData: { canonical: 'customData' } },
		GROUP_REF_ATTRS,
		COMMON_DISPLAY_STATE_ATTRS,
		TEXT_PANEL_ATTRS,
		TEXT_INPUT_PANEL_ATTRS,
	),
	mergeChildren(WITH_RELATION_CHILDREN, WITH_GEAR_CHILDREN),
);

const TEXT_INPUT_NODE = defineNode(
	mergeAttrs(
		XY_SIZE_ATTRS,
		RESTRICT_SIZE_ATTRS,
		PIVOT_ATTRS,
		ANCHOR_ATTRS,
		{ customData: { canonical: 'customData' } },
		GROUP_REF_ATTRS,
		COMMON_DISPLAY_STATE_ATTRS,
		TEXT_PANEL_ATTRS,
		TEXT_INPUT_PANEL_ATTRS,
	),
	mergeChildren(WITH_RELATION_CHILDREN, WITH_GEAR_CHILDREN),
);

const RICH_TEXT_NODE = defineNode(
	mergeAttrs(
		XY_SIZE_ATTRS,
		RESTRICT_SIZE_ATTRS,
		PIVOT_ATTRS,
		ANCHOR_ATTRS,
		{ customData: { canonical: 'customData' } },
		GROUP_REF_ATTRS,
		COMMON_DISPLAY_STATE_ATTRS,
		TEXT_PANEL_ATTRS,
		RICH_TEXT_PANEL_ATTRS,
	),
	mergeChildren(WITH_RELATION_CHILDREN, WITH_GEAR_CHILDREN),
);

const GROUP_NODE = defineNode(
	mergeAttrs(
		XY_SIZE_ATTRS,
		LOCKED_ATTRS,
		PIVOT_ATTRS,
		ANCHOR_ATTRS,
		GROUP_REF_ATTRS,
		COMMON_DISPLAY_STATE_ATTRS,
		GROUP_PANEL_ATTRS,
	),
	// FairyGUI editor only exposes relation/gear channels on advanced groups.
	// Protocol metadata stays static, so we keep the child set narrow here and
	// rely on samples/tests to enforce the advanced=true structural constraint.
	mergeChildren(WITH_RELATION_CHILDREN, WITH_GROUP_GEAR_CHILDREN),
);

const LIST_NODE = defineNode(
	mergeAttrs(
		XY_SIZE_ATTRS,
		PIVOT_ATTRS,
		ANCHOR_ATTRS,
		GROUP_REF_ATTRS,
		COMMON_DISPLAY_STATE_ATTRS,
		LIST_PANEL_ATTRS,
	),
	mergeChildren(
		WITH_RELATION_CHILDREN,
		WITH_GEAR_CHILDREN,
		WITH_LIST_ITEM_CHILDREN,
	),
);

const DISPLAY_LIST_CONTAINER = defineContainer({
	image: IMAGE_NODE,
	graph: GRAPH_NODE,
	movieclip: MOVIE_CLIP_NODE,
	jta: MOVIE_CLIP_NODE,
	component: COMPONENT_INSTANCE_NODE,
	loader: LOADER_NODE,
	loader3D: LOADER3D_NODE,
	text: TEXT_NODE,
	richtext: RICH_TEXT_NODE,
	inputtext: TEXT_INPUT_NODE,
	group: GROUP_NODE,
	list: LIST_NODE,
	tree: LIST_NODE,
});

const COMPONENT_ROOT_NODE = defineNode(
	mergeAttrs(
		ROOT_COMPONENT_PANEL_ATTRS,
		ROOT_DESIGN_PANEL_ATTRS,
		ROOT_MISC_PANEL_ATTRS,
	),
	mergeChildren(
		{
			controller: CONTROLLER_NODE,
			transition: TRANSITION_NODE,
		},
		WITH_ROOT_EXTENSION_CHILDREN,
	),
	mergeContainers({
		displayList: DISPLAY_LIST_CONTAINER,
	}),
);

export const PROJECT_XML_PROTOCOL = {
	packageDescription: PACKAGE_DESCRIPTION_NODE,
	branchDescription: BRANCH_DESCRIPTION_NODE,
	packagePublish: PACKAGE_PUBLISH_NODE,
	packagePublishAtlas: PACKAGE_PUBLISH_ATLAS_NODE,
	packageResource: PACKAGE_RESOURCE_NODE,
	packageImageResource: PACKAGE_IMAGE_RESOURCE_NODE,
	packageFontResource: PACKAGE_FONT_RESOURCE_NODE,
	packageMovieClipResource: PACKAGE_MOVIE_CLIP_RESOURCE_NODE,
	packageSkeletonResource: PACKAGE_SKELETON_RESOURCE_NODE,
	displayObject: DISPLAY_OBJECT_NODE,
	image: IMAGE_NODE,
	graph: GRAPH_NODE,
	movieClip: MOVIE_CLIP_NODE,
	componentRoot: COMPONENT_ROOT_NODE,
	componentInstance: COMPONENT_INSTANCE_NODE,
	buttonExtension: BUTTON_EXTENSION_NODE,
	labelExtension: LABEL_EXTENSION_NODE,
	comboBoxExtension: COMBOBOX_EXTENSION_NODE,
	progressBarExtension: PROGRESSBAR_EXTENSION_NODE,
	sliderExtension: SLIDER_EXTENSION_NODE,
	scrollBarExtension: SCROLLBAR_EXTENSION_NODE,
	relation: RELATION_NODE,
	gear: GEAR_NODE,
	controller: CONTROLLER_NODE,
	controllerAction: CONTROLLER_ACTION_NODE,
	transition: TRANSITION_NODE,
	transitionItem: TRANSITION_ITEM_NODE,
	loader: LOADER_NODE,
	loader3D: LOADER3D_NODE,
	text: TEXT_NODE,
	textInput: TEXT_INPUT_NODE,
	richText: RICH_TEXT_NODE,
	group: GROUP_NODE,
	list: LIST_NODE,
	listItem: LIST_ITEM_NODE,
	comboBoxItem: COMBOBOX_ITEM_NODE,
} satisfies Record<string, XmlNodeProtocol>;

export function readXmlAttr<T = unknown>(
	source: XmlAttrSource,
	spec: XmlAttrSpec,
): T | undefined {
	if (Object.hasOwn(source, spec.canonical)) {
		return source[spec.canonical] as T;
	}

	for (const alias of spec.aliases ?? []) {
		if (Object.hasOwn(source, alias)) {
			return source[alias] as T;
		}
	}

	return undefined;
}

export function hasXmlAttr(source: XmlAttrSource, spec: XmlAttrSpec): boolean {
	return readXmlAttr(source, spec) !== undefined;
}

export function writeXmlAttr(
	target: XmlAttrTarget,
	spec: XmlAttrSpec,
	value: unknown,
): void {
	target[`@_${spec.canonical}`] = value;
}

export function listXmlAttrNames(protocol: XmlNodeProtocol): string[] {
	return Object.values(protocol.attrs)
		.flatMap((spec) => [spec.canonical, ...(spec.aliases ?? [])]);
}

export function listXmlChildNames(protocol: XmlNodeProtocol): string[] {
	return Object.keys(protocol.children ?? {});
}

export function listXmlContainerNames(protocol: XmlNodeProtocol): string[] {
	return Object.keys(protocol.containers ?? {});
}

export function listXmlContainerItemNames(
	protocol: XmlNodeProtocol,
	containerName: string,
): string[] {
	return Object.keys(protocol.containers?.[containerName]?.items ?? {});
}
