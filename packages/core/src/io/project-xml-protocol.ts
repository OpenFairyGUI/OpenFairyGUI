export interface XmlAttrSpec {
	canonical: string;
	aliases?: readonly string[];
	implemented?: boolean;
}

export interface XmlNodeProtocol {
	attrs: Record<string, XmlAttrSpec>;
}

type XmlAttrSource = Record<string, unknown>;
type XmlAttrTarget = Record<string, unknown>;
type XmlAttrMap = Record<string, XmlAttrSpec>;

const mergeAttrs = (...parts: readonly XmlAttrMap[]): XmlAttrMap =>
	Object.assign({}, ...parts);

const defineNode = (...parts: readonly XmlAttrMap[]): XmlNodeProtocol => ({
	attrs: mergeAttrs(...parts),
});

const PACKAGE_DESCRIPTION_ATTRS = {
	id: { canonical: 'id' },
} satisfies XmlAttrMap;

const PACKAGE_PUBLISH_ATTRS = {
	name: { canonical: 'name' },
	path: { canonical: 'path' },
	branchPath: { canonical: 'branchPath' },
	packageCount: { canonical: 'packageCount' },
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
	skew: { canonical: 'skew' },
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
	lineCount: { canonical: 'lineItemCount', aliases: ['lineCount'] },
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
	soundVolumeScale: { canonical: 'soundVolumeScale' },
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

export const PROJECT_XML_PROTOCOL = {
	packageDescription: defineNode(PACKAGE_DESCRIPTION_ATTRS),
	packagePublish: defineNode(PACKAGE_PUBLISH_ATTRS),
	packageResource: defineNode(PACKAGE_RESOURCE_BASE_ATTRS),
	packageImageResource: defineNode(PACKAGE_IMAGE_RESOURCE_ATTRS),
	packageFontResource: defineNode(PACKAGE_FONT_RESOURCE_ATTRS),
	displayObject: defineNode(DISPLAY_OBJECT_IDENTITY_ATTRS),
	image: defineNode(
		IMAGE_PANEL_ATTRS,
		XY_SIZE_ATTRS,
		LOCKED_ATTRS,
		ASPECT_ATTRS,
		PIVOT_ATTRS,
		ANCHOR_ATTRS,
		SCALE_ATTRS,
		GROUP_REF_ATTRS,
		ROTATION_ALPHA_ATTRS,
		VISIBLE_ATTRS,
		GRAYED_ATTRS,
		RESOURCE_LINK_ATTRS,
		FILTER_ATTRS,
	),
	graph: defineNode(
		XY_SIZE_ATTRS,
		LOCKED_ATTRS,
		RESTRICT_SIZE_ATTRS,
		PIVOT_ATTRS,
		ANCHOR_ATTRS,
		GROUP_REF_ATTRS,
		ROTATION_ALPHA_ATTRS,
		VISIBLE_ATTRS,
		TOUCHABLE_ATTRS,
		GRAPH_PANEL_ATTRS,
	),
	movieClip: defineNode(
		MOVIE_CLIP_PANEL_ATTRS,
		XY_SIZE_ATTRS,
		PIVOT_ATTRS,
		GROUP_REF_ATTRS,
		ROTATION_ALPHA_ATTRS,
		VISIBLE_ATTRS,
		GRAYED_ATTRS,
		RESOURCE_LINK_ATTRS,
		FILTER_ATTRS,
	),
	componentRoot: defineNode(
		ROOT_COMPONENT_PANEL_ATTRS,
		ROOT_DESIGN_PANEL_ATTRS,
		ROOT_MISC_PANEL_ATTRS,
	),
	componentInstance: defineNode(
		COMPONENT_INSTANCE_PANEL_ATTRS,
		XY_SIZE_ATTRS,
		LOCKED_ATTRS,
		RESTRICT_SIZE_ATTRS,
		ASPECT_ATTRS,
		PIVOT_ATTRS,
		ANCHOR_ATTRS,
		SCALE_ATTRS,
		GROUP_REF_ATTRS,
		ROTATION_ALPHA_ATTRS,
		VISIBLE_ATTRS,
		TOUCHABLE_ATTRS,
		GRAYED_ATTRS,
		INSTANCE_MISC_PANEL_ATTRS,
		RESOURCE_LINK_ATTRS,
		FILTER_ATTRS,
	),
	buttonExtension: defineNode(BUTTON_EXTENSION_ATTRS),
	labelExtension: defineNode(LABEL_EXTENSION_ATTRS),
	comboBoxExtension: defineNode(COMBOBOX_EXTENSION_ATTRS),
	progressBarExtension: defineNode(PROGRESSBAR_EXTENSION_ATTRS),
	sliderExtension: defineNode(SLIDER_EXTENSION_ATTRS),
	scrollBarExtension: defineNode(SCROLLBAR_EXTENSION_ATTRS),
	relation: defineNode(RELATION_ATTRS),
	gear: defineNode(GEAR_ATTRS),
	controller: defineNode(CONTROLLER_ATTRS),
	controllerAction: defineNode(CONTROLLER_ACTION_ATTRS),
	transition: defineNode(TRANSITION_ATTRS),
	transitionItem: defineNode(TRANSITION_ITEM_ATTRS),
	loader: defineNode(
		XY_SIZE_ATTRS,
		PIVOT_ATTRS,
		SCALE_ATTRS,
		GROUP_REF_ATTRS,
		GRAYED_ATTRS,
		LOADER_PANEL_ATTRS,
		FILTER_ATTRS,
	),
	loader3D: defineNode(XY_SIZE_ATTRS, LOADER3D_PANEL_ATTRS),
	text: defineNode(
		XY_SIZE_ATTRS,
		RESTRICT_SIZE_ATTRS,
		{ customData: { canonical: 'customData' } },
		GROUP_REF_ATTRS,
		TEXT_PANEL_ATTRS,
		TEXT_INPUT_PANEL_ATTRS,
	),
	textInput: defineNode(TEXT_INPUT_PANEL_ATTRS),
	richText: defineNode(RICH_TEXT_PANEL_ATTRS),
	group: defineNode(
		XY_SIZE_ATTRS,
		LOCKED_ATTRS,
		GROUP_REF_ATTRS,
		VISIBLE_ATTRS,
		GROUP_PANEL_ATTRS,
	),
	list: defineNode(
		XY_SIZE_ATTRS,
		GROUP_REF_ATTRS,
		TOUCHABLE_ATTRS,
		LIST_PANEL_ATTRS,
	),
	listItem: defineNode(LIST_ITEM_ATTRS),
	comboBoxItem: defineNode(COMBOBOX_ITEM_ATTRS),
} satisfies Record<string, XmlNodeProtocol>;

export function readXmlAttr<T = unknown>(
	source: XmlAttrSource,
	spec: XmlAttrSpec,
): T | undefined {
	if (Object.prototype.hasOwnProperty.call(source, spec.canonical)) {
		return source[spec.canonical] as T;
	}

	for (const alias of spec.aliases ?? []) {
		if (Object.prototype.hasOwnProperty.call(source, alias)) {
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
