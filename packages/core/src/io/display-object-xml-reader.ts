import { GearType, type RelationDef } from '../constants.js';
import type { Document } from '../document.js';
import type { Controller } from '../properties/controller.js';
import type { GObject } from '../properties/g-object.js';
import type { GComponentPropertyOverride } from '../properties/g-component.js';
import { getDefaultListAutoResizeItem } from '../properties/g-list.js';
import {
	ensureArray,
	parseBool,
	parseFloat2,
	parseInt2,
	parseSidePair,
	parseSizeString,
	parseXYString,
} from '../utils/xml-utils.js';
import { PROJECT_XML_PROTOCOL, readXmlAttr, type XmlNodeProtocol } from './project-xml-protocol.js';
import type { ReaderContext } from './reader-context.js';
import { resolveTreeItemIsFolder } from './tree-item-hierarchy.js';

function _parseEaseType(ease: string): number {
	const map: Record<string, number> = {
		Linear: 0, SineIn: 1, SineOut: 2, SineInOut: 3,
		QuadIn: 4, QuadOut: 5, QuadInOut: 6,
		CubicIn: 7, CubicOut: 8, CubicInOut: 9,
		QuartIn: 10, QuartOut: 11, QuartInOut: 12,
		QuintIn: 13, QuintOut: 14, QuintInOut: 15,
		ExpoIn: 16, ExpoOut: 17, ExpoInOut: 18,
		CircIn: 19, CircOut: 20, CircInOut: 21,
		ElasticIn: 22, ElasticOut: 23, ElasticInOut: 24,
		BackIn: 25, BackOut: 26, BackInOut: 27,
		BounceIn: 28, BounceOut: 29, BounceInOut: 30,
		Custom: 31,
	};
	const normalized = ease.replace(/[.\s_-]/g, '');
	return map[ease] ?? map[normalized] ?? 5; // default QuadOut
}


const DISPLAY_TAG_MAP: Record<string, string> = {
	image: 'GImage',
	text: 'GTextField',
	richtext: 'GRichTextField',
	inputtext: 'GTextInput',
	graph: 'GGraph',
	group: 'GGroup',
	loader: 'GLoader',
	loader3d: 'GLoader3D',
	movieclip: 'GMovieClip',
	jta: 'GMovieClip',
	component: 'GComponent',
	list: 'GList',
	tree: 'GTree',
};

// Maps extension type (from <component extention="...">) to extended component type.

const EXTENSION_PROTOCOL_MAP = {
	Button: PROJECT_XML_PROTOCOL.buttonExtension,
	Label: PROJECT_XML_PROTOCOL.labelExtension,
	ComboBox: PROJECT_XML_PROTOCOL.comboBoxExtension,
	ProgressBar: PROJECT_XML_PROTOCOL.progressBarExtension,
	Slider: PROJECT_XML_PROTOCOL.sliderExtension,
	ScrollBar: PROJECT_XML_PROTOCOL.scrollBarExtension,
} as const;
const DISPLAY_OBJECT_PROTOCOL_MAP: Record<string, XmlNodeProtocol> = {
	image: PROJECT_XML_PROTOCOL.image,
	text: PROJECT_XML_PROTOCOL.text,
	richtext: PROJECT_XML_PROTOCOL.richText,
	inputtext: PROJECT_XML_PROTOCOL.textInput,
	graph: PROJECT_XML_PROTOCOL.graph,
	group: PROJECT_XML_PROTOCOL.group,
	loader: PROJECT_XML_PROTOCOL.loader,
	loader3d: PROJECT_XML_PROTOCOL.loader3D,
	movieclip: PROJECT_XML_PROTOCOL.movieClip,
	jta: PROJECT_XML_PROTOCOL.movieClip,
	component: PROJECT_XML_PROTOCOL.componentInstance,
	list: PROJECT_XML_PROTOCOL.list,
	tree: PROJECT_XML_PROTOCOL.list,
};

const DISPLAY_LIST_CONTAINER = PROJECT_XML_PROTOCOL.componentRoot.containers?.displayList;
if (!DISPLAY_LIST_CONTAINER) {
	throw new Error('PROJECT_XML_PROTOCOL.componentRoot must define containers.displayList');
}

const DISPLAY_LIST_ALLOWED_VARIANTS = new Set(Object.keys(DISPLAY_LIST_CONTAINER.items));

// Maps gear XML element names to gear type indices.
const GEAR_TAG_MAP: Record<string, number> = {
	gearDisplay: GearType.Display,
	gearXY: GearType.XY,
	gearSize: GearType.Size,
	gearLook: GearType.Look,
	gearColor: GearType.Color,
	gearAni: GearType.Animation,
	gearText: GearType.Text,
	gearIcon: GearType.Icon,
	gearDisplay2: GearType.Display2,
	gearFontSize: GearType.FontSize,
};


type XmlNode = Record<string, unknown>;

interface RelationXmlNode extends XmlNode {
	target?: string;
	sidePair?: string;
}

interface GearXmlNode extends XmlNode {
	tween?: string | boolean;
	controller?: string;
	pages?: string;
	values?: string;
	default?: string;
	condition?: string;
}

interface ListItemXmlNode extends XmlNode {
	title?: string;
	icon?: string;
	url?: string;
	name?: string;
	selectedTitle?: string;
	selectedIcon?: string;
	level?: string | number;
	isFolder?: string | boolean;
	controllers?: string;
	property?: PropertyOverrideXmlNode | PropertyOverrideXmlNode[];
}

interface PropertyOverrideXmlNode extends XmlNode {
	target?: string;
	propertyId?: string | number;
	value?: string | number | boolean;
}

interface ComboItemXmlNode extends XmlNode {
	title?: string;
	value?: string;
	icon?: string;
}

interface ExtensionXmlNode extends Record<string, unknown> {
	mode?: string | number;
	sound?: string;
	soundVolumeScale?: string | number;
	popupDirection?: string | number;
	downEffect?: string | number;
	downEffectValue?: string | number;
	dropdown?: string;
	titleType?: string | number;
	reverse?: string | boolean;
	wholeNumbers?: string | boolean;
	changeOnClick?: string | boolean;
	fixedGripSize?: string | boolean;
	title?: string;
	selectedTitle?: string;
	icon?: string;
	selectedIcon?: string;
	titleColor?: string;
	titleFontSize?: string | number;
	controller?: string;
	page?: string;
	checked?: string | boolean;
	visibleItemCount?: string | number;
	autoClearItems?: string | boolean;
	value?: string | number;
	max?: string | number;
	min?: string | number;
	item?: ComboItemXmlNode | ComboItemXmlNode[];
}

export interface DisplayObjectXmlNode extends Record<string, unknown> {
	id?: string;
	name?: string;
	src?: string;
	url?: string;
	text?: string;
	fontSize?: string | number;
	font?: string;
	color?: string;
	align?: string;
	vAlign?: string;
	autoSize?: string;
	singleLine?: string | boolean;
	ubb?: string | boolean;
	leading?: string | number;
	letterSpacing?: string | number;
	underline?: string | boolean;
	italic?: string | boolean;
	bold?: string | boolean;
	strikethrough?: string | boolean;
	strokeColor?: string;
	strokeSize?: string | number;
	shadowColor?: string;
	shadowOffset?: string;
	input?: string | boolean;
	prompt?: string;
	promptText?: string;
	maxLength?: string | number;
	restrict?: string;
	password?: string | boolean;
	keyboardType?: string | number;
	type?: string;
	lineSize?: string | number;
	lineColor?: string;
	fillColor?: string;
	corner?: string;
	points?: string;
	sides?: string | number;
	startAngle?: string | number;
	distances?: string;
	layout?: string;
	lineGap?: string | number;
	columnGap?: string | number;
	colGap?: string | number;
	lineItemCount?: string | number;
	lineItemCount2?: string | number;
	autoItemSize?: string | boolean;
	fill?: string;
	shrinkOnly?: string | boolean;
	autoSizeDisabled?: string | boolean;
	playing?: string | boolean;
	frame?: string | number;
	fillMethod?: string;
	flip?: string | number;
	fillOrigin?: string | number;
	fillClockwise?: string | boolean;
	fillAmount?: string | number;
	useResize?: string | boolean;
	animationName?: string;
	skinName?: string;
	loop?: string | boolean;
	defaultItem?: string;
	treeView?: string | boolean;
	indent?: string | number;
	clickToExpand?: string | number;
	selectionMode?: string;
	selectionController?: string;
	overflow?: string;
	scroll?: string;
	scrollBar?: string;
	scrollBarFlags?: string | number;
	scrollBarRes?: string;
	ptrRes?: string;
	margin?: string;
	clipSoftness?: string;
	controller?: string;
	pageController?: string;
	item?: ListItemXmlNode | ListItemXmlNode[];
	xy?: string;
	size?: string;
	pivot?: string;
	anchor?: string | boolean;
	scale?: string;
	skew?: string;
	rotation?: string | number;
	alpha?: string | number;
	visible?: string | boolean;
	touchable?: string | boolean;
	grayed?: string | boolean;
	locked?: string | boolean;
	aspect?: string | boolean;
	restrictSize?: string;
	tooltips?: string;
	blend?: string;
	filter?: string;
	filterData?: string;
	customData?: string;
	group?: string;
	advanced?: string | boolean;
	relation?: RelationXmlNode | RelationXmlNode[];
	gearDisplay?: GearXmlNode | GearXmlNode[];
	gearXY?: GearXmlNode | GearXmlNode[];
	gearSize?: GearXmlNode | GearXmlNode[];
	gearLook?: GearXmlNode | GearXmlNode[];
	gearColor?: GearXmlNode | GearXmlNode[];
	gearAni?: GearXmlNode | GearXmlNode[];
	gearText?: GearXmlNode | GearXmlNode[];
	gearIcon?: GearXmlNode | GearXmlNode[];
	gearDisplay2?: GearXmlNode | GearXmlNode[];
	gearFontSize?: GearXmlNode | GearXmlNode[];
	Button?: ExtensionXmlNode | ExtensionXmlNode[];
	Label?: ExtensionXmlNode | ExtensionXmlNode[];
	ComboBox?: ExtensionXmlNode | ExtensionXmlNode[];
	ProgressBar?: ExtensionXmlNode | ExtensionXmlNode[];
	Slider?: ExtensionXmlNode | ExtensionXmlNode[];
	ScrollBar?: ExtensionXmlNode | ExtensionXmlNode[];
}


function getXmlNode<T extends XmlNode>(value: unknown): T | null {
	const node = Array.isArray(value) ? value[0] : value;
	if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
	return node as T;
}


function getProtocolChildName(protocol: XmlNodeProtocol, childName: string): string | null {
	return protocol.children?.[childName] ? childName : null;
}

function parsePropertyOverrides(source: XmlNode, protocol: XmlNodeProtocol): GComponentPropertyOverride[] {
	const childName = getProtocolChildName(protocol, 'property');
	if (!childName) return [];
	return ensureArray(source[childName]).map((raw, index) => {
		const property = getXmlNode<PropertyOverrideXmlNode>(raw);
		const specs = PROJECT_XML_PROTOCOL.propertyOverride.attrs;
		const target = property ? readXmlAttr<string>(property, specs.target) : undefined;
		const rawPropertyId = property ? readXmlAttr<string | number>(property, specs.propertyId) : undefined;
		const propertyId = typeof rawPropertyId === 'number'
			? rawPropertyId
			: typeof rawPropertyId === 'string' && /^\d+$/.test(rawPropertyId)
				? Number(rawPropertyId)
				: Number.NaN;
		const value = property ? readXmlAttr<string | number | boolean>(property, specs.value) : undefined;
		if (!target || !Number.isSafeInteger(propertyId) || propertyId < 0 || value === undefined) {
			throw new Error(`Invalid property override at ${childName}[${index}].`);
		}
		return { target, propertyId, value: String(value) };
	});
}

function getProtocolGearChildNames(protocol: XmlNodeProtocol): string[] {
	return Object.keys(protocol.children ?? {}).filter((name) => name in GEAR_TAG_MAP);
}

function getProtocolExtensionChildNames(protocol: XmlNodeProtocol): Array<keyof typeof EXTENSION_PROTOCOL_MAP> {
	return Object.keys(protocol.children ?? {}).filter((name): name is keyof typeof EXTENSION_PROTOCOL_MAP => name in EXTENSION_PROTOCOL_MAP);
}


function getDisplayListVariantName(tagName: string, attrs: DisplayObjectXmlNode): string {
	if (tagName === 'loader3d') return 'loader3D';
	if (tagName === 'text') {
		const isInputText = parseBool(readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.input));
		if (isInputText) return 'inputtext';
	}
	if (tagName === 'list') {
		const isTree = parseBool(readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.list.attrs.treeView));
		if (isTree) return 'tree';
	}
	return tagName;
}

export function assertDisplayListTagAllowed(
	tagName: string,
	attrs: DisplayObjectXmlNode,
	componentName: string,
): void {
	if (!DISPLAY_TAG_MAP[tagName]) {
		throw new Error(`Unsupported displayList tag "${tagName}" in component "${componentName}"`);
	}
	const variantName = getDisplayListVariantName(tagName, attrs);
	if (!DISPLAY_LIST_ALLOWED_VARIANTS.has(variantName)) {
		throw new Error(
			`displayList variant "${variantName}" derived from tag "${tagName}" is not declared in protocol for component "${componentName}"`,
		);
	}
}

function inferTreeItemFolderFlags(items: Array<{
	title: string | null;
	icon: string | null;
	url: string | null;
	name: string | null;
	selectedTitle: string | null;
	selectedIcon: string | null;
	level: number;
	isFolder: boolean | null;
	controllers?: string | null;
}>): Array<{
	title: string | null;
	icon: string | null;
	url: string | null;
	name: string | null;
	selectedTitle: string | null;
	selectedIcon: string | null;
	level: number;
	isFolder: boolean | null;
	controllers?: string | null;
}> {
	return items.map((item, index) => {
		if (item.isFolder !== null) return item;
		return { ...item, isFolder: resolveTreeItemIsFolder(items, index) };
	});
}

function parseListItemXmlNode(item: ListItemXmlNode): {
	title: string | null;
	icon: string | null;
	url: string | null;
	name: string | null;
	selectedTitle: string | null;
	selectedIcon: string | null;
	level: number;
	isFolder: boolean | null;
	controllers?: string | null;
	propertyOverrides?: GComponentPropertyOverride[];
} {
	const specs = PROJECT_XML_PROTOCOL.listItem.attrs;
	const isFolder = readXmlAttr<string | boolean>(item, specs.isFolder);
	const controllers = readXmlAttr<string>(item, specs.controllers);
	const propertyOverrides = parsePropertyOverrides(item, PROJECT_XML_PROTOCOL.listItem);
	return {
		title: readXmlAttr<string>(item, specs.title) ?? null,
		icon: readXmlAttr<string>(item, specs.icon) ?? null,
		url: readXmlAttr<string>(item, specs.url) ?? null,
		name: readXmlAttr<string>(item, specs.name) ?? null,
		selectedTitle: readXmlAttr<string>(item, specs.selectedTitle) ?? null,
		selectedIcon: readXmlAttr<string>(item, specs.selectedIcon) ?? null,
		level: parseInt2(readXmlAttr<string | number>(item, specs.level)),
		isFolder: isFolder !== undefined ? parseBool(isFolder) : null,
		...(controllers !== undefined ? { controllers } : {}),
		...(propertyOverrides.length > 0 ? { propertyOverrides } : {}),
	};
}

function parseComboBoxItemXmlNode(item: ComboItemXmlNode): {
	title: string | null;
	value: string | null;
	icon: string | null;
} {
	const specs = PROJECT_XML_PROTOCOL.comboBoxItem.attrs;
	return {
		title: readXmlAttr<string>(item, specs.title) ?? null,
		value: readXmlAttr<string>(item, specs.value) ?? null,
		icon: readXmlAttr<string>(item, specs.icon) ?? null,
	};
}

type WritableCommonDisplayState = GObject & {
	setXY?(x: number, y: number): unknown;
	setSize?(width: number, height: number): unknown;
	setGroup?(group: string): unknown;
	setAlpha?(value: number): unknown;
	setRotation?(value: number): unknown;
	setVisible?(value: boolean): unknown;
	setTouchable?(value: boolean): unknown;
	setGrayed?(value: boolean): unknown;
};

function readCommonDisplayState(
	source: DisplayObjectXmlNode,
	object: WritableCommonDisplayState,
	protocol: XmlNodeProtocol,
): void {
	const specs = protocol.attrs;
	const xy = specs.xy ? readXmlAttr<string>(source, specs.xy) : undefined;
	if (xy) {
		const [x, y] = parseXYString(xy);
		object.setXY?.(x, y);
	}

	const size = specs.size ? readXmlAttr<string>(source, specs.size) : undefined;
	if (size) {
		const [width, height] = parseSizeString(size);
		object.setSize?.(width, height);
	}

	const locked = specs.locked ? readXmlAttr<string | boolean>(source, specs.locked) : undefined;
	if (locked !== undefined) object.setLocked(parseBool(locked));

	const restrictSize = specs.restrictSize ? readXmlAttr<string>(source, specs.restrictSize) : undefined;
	if (restrictSize) {
		const [minWidth = 0, maxWidth = 0, minHeight = 0, maxHeight = 0] = restrictSize
			.split(',')
			.map((value) => parseFloat2(value));
		object
			.setMinWidth(minWidth)
			.setMaxWidth(maxWidth)
			.setMinHeight(minHeight)
			.setMaxHeight(maxHeight);
	}

	const aspect = specs.aspect ? readXmlAttr<string | boolean>(source, specs.aspect) : undefined;
	if (aspect !== undefined) object.setAspect(parseBool(aspect));

	const pivot = specs.pivot ? readXmlAttr<string>(source, specs.pivot) : undefined;
	if (pivot) {
		const [pivotX, pivotY] = parseXYString(pivot);
		const anchor = specs.anchor ? readXmlAttr<string | boolean>(source, specs.anchor) : undefined;
		object.setPivot(pivotX, pivotY, parseBool(anchor));
	}

	const scale = specs.scale ? readXmlAttr<string>(source, specs.scale) : undefined;
	if (scale) {
		const [scaleX, scaleY] = parseXYString(scale);
		object.setScale(scaleX, scaleY);
	}

	const skew = specs.skew ? readXmlAttr<string>(source, specs.skew) : undefined;
	if (skew) {
		const [skewX, skewY] = parseXYString(skew);
		object.setSkew(skewX, skewY);
	}

	const group = specs.group ? readXmlAttr<string>(source, specs.group) : undefined;
	if (group !== undefined) object.setGroup?.(group);
	const alpha = specs.alpha
		? readXmlAttr<string | number>(source, specs.alpha)
		: undefined;
	if (alpha !== undefined) object.setAlpha?.(parseFloat2(alpha, 1));

	const rotation = specs.rotation
		? readXmlAttr<string | number>(source, specs.rotation)
		: undefined;
	if (rotation !== undefined) object.setRotation?.(parseFloat2(rotation));

	const visible = specs.visible
		? readXmlAttr<string | boolean>(source, specs.visible)
		: undefined;
	if (visible !== undefined) object.setVisible?.(parseBool(visible));

	const touchable = specs.touchable
		? readXmlAttr<string | boolean>(source, specs.touchable)
		: undefined;
	if (touchable !== undefined) object.setTouchable?.(parseBool(touchable));

	const grayed = specs.grayed
		? readXmlAttr<string | boolean>(source, specs.grayed)
		: undefined;
	if (grayed !== undefined) object.setGrayed?.(parseBool(grayed));

	const tooltips = specs.tooltips ? readXmlAttr<string>(source, specs.tooltips) : undefined;
	if (tooltips !== undefined) object.setTooltips(tooltips);

	const customData = specs.customData ? readXmlAttr<string>(source, specs.customData) : undefined;
	if (customData !== undefined) object.setCustomData(customData);

	const blendMode = specs.blendMode ? readXmlAttr<string>(source, specs.blendMode) : undefined;
	if (blendMode !== undefined) object.setBlendMode(blendMode);

	const filter = specs.filter ? readXmlAttr<string>(source, specs.filter) : undefined;
	if (filter !== undefined) object.setFilter(filter);
	const filterData = specs.filterData ? readXmlAttr<string>(source, specs.filterData) : undefined;
	if (filterData !== undefined) object.setFilterData(filterData);
}

/** Options for explicitly loading source bytes while reading a project. */

export function createDisplayObject(
		ctx: ReaderContext,
		doc: Document,
		tagName: string,
		attrs: DisplayObjectXmlNode,
		localControllers: Map<string, Controller>,
	): GObject | null {
		const name = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.displayObject.attrs.name) ?? '';
		let obj: GObject;

		switch (tagName) {
			case 'image': {
				const g = doc.createGImage(name);
				const imageSrc = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.image.attrs.src);
				g.setSrc(imageSrc || '');
				const imageFileName = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.image.attrs.fileName);
				if (imageFileName !== undefined) g.setFileName(imageFileName);
				const imagePackageId = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.image.attrs.pkg);
				if (imagePackageId !== undefined) g.setPackageId(imagePackageId);
				const imageColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.image.attrs.color);
				if (imageColor) g.setColor(imageColor);
				const imageFlip = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.image.attrs.flip);
				if (imageFlip !== undefined) {
					const flipRaw = String(imageFlip).trim().toLowerCase();
					const flipMap: Record<string, number> = {
						hz: 1,
						horizontal: 1,
						vt: 2,
						vertical: 2,
						both: 3,
					};
					g.setFlip(flipMap[flipRaw] ?? parseInt2(imageFlip));
				}
				const imageFillMethod = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.image.attrs.fillMethod);
				const imageFillOrigin = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.image.attrs.fillOrigin);
				const imageFillClockwise = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.image.attrs.fillClockwise);
				const imageFillAmount = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.image.attrs.fillAmount);
				if (imageFillMethod || imageFillOrigin !== undefined || imageFillClockwise !== undefined || imageFillAmount !== undefined) {
					const fillMap: Record<string, number> = { none: 0, hz: 1, vt: 2, radial90: 3, radial180: 4, radial360: 5 };
					g.setFillMethod(fillMap[imageFillMethod ?? ''] ?? 0);
					g.setFillOrigin(parseInt2(imageFillOrigin));
					g.setFillClockwise(imageFillClockwise !== 'false');
					g.setFillAmount(parseInt2(imageFillAmount, 100) / 100);
				}
				obj = g;
				break;
			}
			case 'text': {
				const isInputText = parseBool(readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.input));
				const g = isInputText ? doc.createGTextInput(name) : doc.createGTextField(name);
				const textValue = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.text);
				if (textValue !== undefined) g.setText(String(textValue));
				const textFontSize = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.fontSize);
				if (textFontSize !== undefined) g.setFontSize(parseInt2(textFontSize));
				const textFont = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.font);
				if (textFont) g.setFont(textFont);
				const textColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.color);
				if (textColor) g.setColor(textColor);
				const textAlign = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.align);
				if (textAlign) {
					const alignMap: Record<string, number> = { left: 0, center: 1, right: 2 };
					g.setAlign(alignMap[textAlign] ?? 0);
				}
				const textVAlign = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.vAlign);
				if (textVAlign) {
					const vAlignMap: Record<string, number> = { top: 0, middle: 1, bottom: 2 };
					g.setVAlign(vAlignMap[textVAlign] ?? 0);
				}
				const textAutoSize = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.autoSize);
				if (textAutoSize) {
					const autoSizeMap: Record<string, number> = { none: 0, both: 1, height: 2, shrink: 3, ellipsis: 4 };
					g.setAutoSize(autoSizeMap[textAutoSize] ?? 1);
				}
				const textSingleLine = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.singleLine);
				if (textSingleLine !== undefined) g.setSingleLine(parseBool(textSingleLine));
				const textAutoClearText = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.autoClearText);
				if (textAutoClearText !== undefined) g.setAutoClearText?.(parseBool(textAutoClearText));
				const textDemoText = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.demoText);
				if (textDemoText !== undefined) g.setDemoText?.(String(textDemoText));
				const textVars = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.vars);
				if (textVars !== undefined) g.setTemplateVarsEnabled?.(parseBool(textVars));
				const textFaceDilate = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.faceDilate);
				if (textFaceDilate !== undefined) g.setFaceDilate?.(parseFloat2(textFaceDilate));
				const textOutlineSoftness = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.outlineSoftness);
				if (textOutlineSoftness !== undefined) g.setOutlineSoftness?.(parseFloat2(textOutlineSoftness));
				const textUnderlaySoftness = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.underlaySoftness);
				if (textUnderlaySoftness !== undefined) g.setUnderlaySoftness?.(parseFloat2(textUnderlaySoftness));
				const textUbb = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.ubb);
				if (textUbb !== undefined) g.setUbbEnabled(parseBool(textUbb));
				const textLeading = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.leading);
				if (textLeading !== undefined) g.setLeading?.(parseInt2(textLeading));
				const textLetterSpacing = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.letterSpacing);
				if (textLetterSpacing !== undefined) g.setLetterSpacing?.(parseInt2(textLetterSpacing));
				const textUnderline = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.underline);
				if (textUnderline !== undefined) g.setUnderline?.(parseBool(textUnderline));
				const textItalic = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.italic);
				if (textItalic !== undefined) g.setItalic?.(parseBool(textItalic));
				const textBold = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.bold);
				if (textBold !== undefined) g.setBold?.(parseBool(textBold));
				const textStrikethrough = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.strikethrough);
				if (textStrikethrough !== undefined) g.setStrikethrough?.(parseBool(textStrikethrough));
				const textStrokeColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.strokeColor);
				if (textStrokeColor) {
					g.setStrokeColor?.(textStrokeColor);
					const textStrokeSize = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.strokeSize);
					g.setStrokeSize?.(parseFloat2(textStrokeSize, 1));
				}
				const textShadowColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.shadowColor);
				if (textShadowColor) {
					g.setShadowColor?.(textShadowColor);
					const textShadowOffset = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.shadowOffset);
					const shadowParts = String(textShadowOffset ?? '1,1').split(',');
					g.setShadowOffset?.({
						x: parseFloat2(shadowParts[0], 1),
						y: parseFloat2(shadowParts[1], 1),
					});
				}
				if (isInputText) {
					const input = g as ReturnType<Document['createGTextInput']>;
					const prompt = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.prompt);
					if (prompt !== undefined) input.setPromptText(String(prompt));
					const inputMaxLength = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.maxLength);
					if (inputMaxLength !== undefined) input.setMaxLength(parseInt2(inputMaxLength));
					const inputRestrict = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.restrict);
					if (inputRestrict !== undefined) input.setRestrict(String(inputRestrict));
					const inputPassword = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.password);
					if (inputPassword !== undefined) input.setPassword(parseBool(inputPassword));
					const inputKeyboardType = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.keyboardType);
					if (inputKeyboardType !== undefined) input.setKeyboardType?.(parseInt2(inputKeyboardType));
				}
				obj = g;
				break;
			}
			case 'richtext': {
				const g = doc.createGRichTextField(name);
				const richText = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.text);
				if (richText !== undefined) g.setText(String(richText));
				const richTextFontSize = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.fontSize);
				if (richTextFontSize !== undefined) g.setFontSize(parseInt2(richTextFontSize));
				const richTextFont = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.font);
				if (richTextFont) g.setFont(richTextFont);
				const richTextColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.color);
				if (richTextColor) g.setColor(richTextColor);
				const richTextAlign = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.align);
				if (richTextAlign) { const m: Record<string,number> = {left:0,center:1,right:2}; g.setAlign(m[richTextAlign]??0); }
				const richTextVAlign = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.vAlign);
				if (richTextVAlign) { const m: Record<string,number> = {top:0,middle:1,bottom:2}; g.setVAlign(m[richTextVAlign]??0); }
				const richTextLeading = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.leading);
				if (richTextLeading !== undefined) g.setLeading?.(parseInt2(richTextLeading));
				const richTextLetterSpacing = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.letterSpacing);
				if (richTextLetterSpacing !== undefined) g.setLetterSpacing?.(parseInt2(richTextLetterSpacing));
				const richTextUbb = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.ubb);
				if (richTextUbb !== undefined) g.setUbbEnabled?.(parseBool(richTextUbb));
				const richTextAutoSize = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.autoSize);
				if (richTextAutoSize) { const m: Record<string,number> = {none:0,both:1,height:2,shrink:3,ellipsis:4}; g.setAutoSize(m[richTextAutoSize]??1); }
				const richTextSingleLine = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.singleLine);
				if (richTextSingleLine !== undefined) g.setSingleLine?.(parseBool(richTextSingleLine));
				const richTextAutoClearText = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.autoClearText);
				if (richTextAutoClearText !== undefined) g.setAutoClearText?.(parseBool(richTextAutoClearText));
				const richTextOutlineSoftness = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.richText.attrs.outlineSoftness);
				if (richTextOutlineSoftness !== undefined) g.setOutlineSoftness?.(parseFloat2(richTextOutlineSoftness));
				const richTextUnderlaySoftness = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.richText.attrs.underlaySoftness);
				if (richTextUnderlaySoftness !== undefined) g.setUnderlaySoftness?.(parseFloat2(richTextUnderlaySoftness));
				const richTextUnderline = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.underline);
				if (richTextUnderline !== undefined) g.setUnderline?.(parseBool(richTextUnderline));
				const richTextItalic = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.italic);
				if (richTextItalic !== undefined) g.setItalic?.(parseBool(richTextItalic));
				const richTextBold = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.bold);
				if (richTextBold !== undefined) g.setBold?.(parseBool(richTextBold));
				const richTextStrikethrough = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.strikethrough);
				if (richTextStrikethrough !== undefined) g.setStrikethrough?.(parseBool(richTextStrikethrough));
				const richTextStrokeColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.strokeColor);
				if (richTextStrokeColor) {
					g.setStrokeColor?.(richTextStrokeColor);
					const richTextStrokeSize = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.strokeSize);
					g.setStrokeSize?.(parseFloat2(richTextStrokeSize, 1));
				}
				const richTextShadowColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.shadowColor);
				if (richTextShadowColor) {
					g.setShadowColor?.(richTextShadowColor);
					const richTextShadowOffset = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.shadowOffset);
					const shadowParts = String(richTextShadowOffset ?? '1,1').split(',');
					g.setShadowOffset?.({
						x: parseFloat2(shadowParts[0], 1),
						y: parseFloat2(shadowParts[1], 1),
					});
				}
				obj = g;
				break;
			}
			case 'inputtext': {
				const g = doc.createGTextInput(name);
				const inputText = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.text);
				if (inputText !== undefined) g.setText(String(inputText));
				const inputFontSize = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.fontSize);
				if (inputFontSize !== undefined) g.setFontSize(parseInt2(inputFontSize));
				const inputFont = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.font);
				if (inputFont) g.setFont(inputFont);
				const inputColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.color);
				if (inputColor) g.setColor(inputColor);
				const inputAlign = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.align);
				if (inputAlign) { const m: Record<string,number> = {left:0,center:1,right:2}; g.setAlign(m[inputAlign]??0); }
				const inputVAlign = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.vAlign);
				if (inputVAlign) { const m: Record<string,number> = {top:0,middle:1,bottom:2}; g.setVAlign(m[inputVAlign]??0); }
				const inputLeading = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.leading);
				if (inputLeading !== undefined) g.setLeading?.(parseInt2(inputLeading));
				const inputLetterSpacing = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.letterSpacing);
				if (inputLetterSpacing !== undefined) g.setLetterSpacing?.(parseInt2(inputLetterSpacing));
				const inputAutoSize = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.autoSize);
				if (inputAutoSize) { const m: Record<string,number> = {none:0,both:1,height:2,shrink:3,ellipsis:4}; g.setAutoSize(m[inputAutoSize]??1); }
				const inputSingleLine = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.singleLine);
				if (inputSingleLine !== undefined) g.setSingleLine?.(parseBool(inputSingleLine));
				const inputAutoClearText = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.autoClearText);
				if (inputAutoClearText !== undefined) g.setAutoClearText?.(parseBool(inputAutoClearText));
				const inputDemoText = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.demoText);
				if (inputDemoText !== undefined) g.setDemoText?.(String(inputDemoText));
				const inputVars = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.vars);
				if (inputVars !== undefined) g.setTemplateVarsEnabled?.(parseBool(inputVars));
				const inputFaceDilate = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.faceDilate);
				if (inputFaceDilate !== undefined) g.setFaceDilate?.(parseFloat2(inputFaceDilate));
				const inputOutlineSoftness = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.outlineSoftness);
				if (inputOutlineSoftness !== undefined) g.setOutlineSoftness?.(parseFloat2(inputOutlineSoftness));
				const inputUnderlaySoftness = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.underlaySoftness);
				if (inputUnderlaySoftness !== undefined) g.setUnderlaySoftness?.(parseFloat2(inputUnderlaySoftness));
				const inputUbb = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.ubb);
				if (inputUbb !== undefined) g.setUbbEnabled?.(parseBool(inputUbb));
				const inputUnderline = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.underline);
				if (inputUnderline !== undefined) g.setUnderline?.(parseBool(inputUnderline));
				const inputItalic = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.italic);
				if (inputItalic !== undefined) g.setItalic?.(parseBool(inputItalic));
				const inputBold = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.bold);
				if (inputBold !== undefined) g.setBold?.(parseBool(inputBold));
				const inputStrikethrough = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.strikethrough);
				if (inputStrikethrough !== undefined) g.setStrikethrough?.(parseBool(inputStrikethrough));
				const inputStrokeColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.strokeColor);
				if (inputStrokeColor) {
					g.setStrokeColor?.(inputStrokeColor);
					const inputStrokeSize = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.strokeSize);
					g.setStrokeSize?.(parseFloat2(inputStrokeSize, 1));
				}
				const inputShadowColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.shadowColor);
				if (inputShadowColor) {
					g.setShadowColor?.(inputShadowColor);
					const inputShadowOffset = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.shadowOffset);
					const shadowParts = String(inputShadowOffset ?? '1,1').split(',');
					g.setShadowOffset?.({
						x: parseFloat2(shadowParts[0], 1),
						y: parseFloat2(shadowParts[1], 1),
					});
				}
				const prompt = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.prompt);
				if (prompt !== undefined) g.setPromptText(prompt);
				const inputMaxLength = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.maxLength);
				if (inputMaxLength !== undefined) g.setMaxLength(parseInt2(inputMaxLength));
				const inputRestrict = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.restrict);
				if (inputRestrict !== undefined) g.setRestrict(inputRestrict);
				const inputPassword = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.password);
				if (inputPassword !== undefined) g.setPassword(parseBool(inputPassword));
				const inputKeyboardType = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.keyboardType);
				if (inputKeyboardType !== undefined) g.setKeyboardType?.(parseInt2(inputKeyboardType));
				obj = g;
				break;
			}
			case 'graph': {
				const g = doc.createGGraph(name);
				const graphType = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.graph.attrs.type);
				if (graphType) {
					const graphTypeMap: Record<string, number> = {
						rect: 1, eclipse: 2, ellipse: 2, polygon: 3, regularpolygon: 4, regular_polygon: 4,
					};
					g.setGraphType(graphTypeMap[graphType] ?? 0);
				}
				const lineSize = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.graph.attrs.lineSize);
				if (lineSize !== undefined) g.setLineSize(parseInt2(lineSize));
				const lineColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.graph.attrs.lineColor);
				if (lineColor) g.setLineColor(lineColor);
				const fillColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.graph.attrs.fillColor);
				if (fillColor) g.setFillColor(fillColor);
				const corner = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.graph.attrs.corner);
				if (corner) {
					const parts = corner.split(',').map(Number);
					g.setCornerRadius([
						parts[0] ?? 0,
						parts[1] ?? parts[0] ?? 0,
						parts[2] ?? parts[0] ?? 0,
						parts[3] ?? parts[0] ?? 0,
					]);
				}
				const points = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.graph.attrs.points);
				if (points) g.setPoints(points.split(',').map(Number));
				const sides = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.graph.attrs.sides);
				if (sides !== undefined) {
					g.setSides(parseInt2(sides));
					const startAngle = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.graph.attrs.startAngle);
					g.setStartAngle(parseFloat2(startAngle));
					const distances = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.graph.attrs.distances);
					if (distances) g.setDistances(distances.split(',').map(Number));
				}
				obj = g;
				break;
			}
			case 'group': {
				const g = doc.createGGroup(name);
				const groupLayout = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.group.attrs.layout);
				if (groupLayout) {
					const layoutMap: Record<string, number> = { none: 0, hz: 1, vt: 2 };
					g.setLayout(layoutMap[groupLayout] ?? 0);
				}
				const groupLineGap = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.group.attrs.lineGap);
				if (groupLineGap !== undefined) g.setLineGap(parseInt2(groupLineGap));
				const columnGap = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.group.attrs.columnGap);
				if (columnGap !== undefined) g.setColumnGap(parseInt2(columnGap));
				const groupAdvanced = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.group.attrs.advanced);
				if (groupAdvanced !== undefined) g.setAdvanced(parseBool(groupAdvanced));
				const excludeInvisibles = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.group.attrs.excludeInvisibles);
				if (excludeInvisibles !== undefined) g.setExcludeInvisibles?.(parseBool(excludeInvisibles));
				const autoSizeDisabled = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.group.attrs.autoSizeDisabled);
				if (autoSizeDisabled !== undefined) g.setAutoSizeDisabled?.(parseBool(autoSizeDisabled));
				const mainGridIndex = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.group.attrs.mainGridIndex);
				if (mainGridIndex !== undefined) g.setMainGridIndex?.(parseInt2(mainGridIndex));
				obj = g;
				break;
			}
			case 'loader': {
				const g = doc.createGLoader(name);
				const loaderUrl = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.url);
				if (loaderUrl) g.setUrl(loaderUrl);
				const loaderAlign = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.align);
				if (loaderAlign) { const m: Record<string,number> = {left:0,center:1,right:2}; g.setAlign?.(m[loaderAlign]??0); }
				const loaderVAlign = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.vAlign);
				if (loaderVAlign) { const m: Record<string,number> = {top:0,middle:1,bottom:2}; g.setVAlign?.(m[loaderVAlign]??0); }
				const loaderFill = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.fill);
				if (loaderFill) {
					const fillMap: Record<string, number> = {
						none: 0, scale: 1, scaleMatchHeight: 2, scaleMatchWidth: 3, scaleFree: 4, scaleNoBorder: 5,
					};
					g.setFill(fillMap[loaderFill] ?? 0);
				}
				const loaderShrinkOnly = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.shrinkOnly);
				if (loaderShrinkOnly !== undefined) g.setShrinkOnly?.(parseBool(loaderShrinkOnly));
				const loaderAutoSize = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.autoSize);
				if (loaderAutoSize !== undefined) g.setAutoSize?.(parseBool(loaderAutoSize));
				const useResize = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.useResize);
				if (useResize !== undefined) g.setUseResize?.(parseBool(useResize));
				const errorSign = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.errorSign);
				if (errorSign !== undefined) g.setShowErrorSign(parseBool(errorSign));
				const clearOnPublish = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.clearOnPublish);
				if (clearOnPublish !== undefined) g.setClearOnPublish?.(parseBool(clearOnPublish));
				const loaderColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.color);
				if (loaderColor) g.setColor(loaderColor);
				const loaderPlaying = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.playing);
				if (loaderPlaying !== undefined) g.setPlaying?.(parseBool(loaderPlaying));
				const loaderFrame = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.frame);
				if (loaderFrame !== undefined) g.setFrame?.(parseInt2(loaderFrame));
				const fillMethod = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.fillMethod);
				if (fillMethod) {
					const fmMap: Record<string,number> = { none:0, hz:1, vt:2, radial90:3, radial180:4, radial360:5 };
					g.setFillMethod?.(fmMap[fillMethod] ?? 0);
					const fillOrigin = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.fillOrigin);
					g.setFillOrigin?.(parseInt2(fillOrigin));
					const fillClockwise = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.fillClockwise);
					g.setFillClockwise?.(fillClockwise !== 'false');
					const fillAmount = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.fillAmount);
					g.setFillAmount?.(parseInt2(fillAmount, 100) / 100);
				}
				obj = g;
				break;
			}
			case 'loader3d': {
				const g = doc.createGLoader3D(name);
				const loader3dUrl = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.url);
				if (loader3dUrl) g.setUrl(loader3dUrl);
				const loader3dAlign = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.align);
				if (loader3dAlign) { const m: Record<string, number> = { left: 0, center: 1, right: 2 }; g.setAlign?.(m[loader3dAlign] ?? 0); }
				const loader3dVAlign = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.vAlign);
				if (loader3dVAlign) { const m: Record<string, number> = { top: 0, middle: 1, bottom: 2 }; g.setVAlign?.(m[loader3dVAlign] ?? 0); }
				const loader3dFill = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.fill);
				if (loader3dFill) {
					const fillMap: Record<string, number> = {
						none: 0, scale: 1, scaleMatchHeight: 2, scaleMatchWidth: 3, scaleFree: 4, scaleNoBorder: 5,
					};
					g.setFill(fillMap[loader3dFill] ?? 0);
				}
				const loader3dShrinkOnly = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.shrinkOnly);
				if (loader3dShrinkOnly !== undefined) g.setShrinkOnly?.(parseBool(loader3dShrinkOnly));
				const loader3dAutoSize = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.autoSize);
				if (loader3dAutoSize !== undefined) g.setAutoSize?.(parseBool(loader3dAutoSize));
				const animation = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.animation);
				if (animation !== undefined) g.setAnimationName?.(String(animation));
				const skinName = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.skinName);
				if (skinName !== undefined) g.setSkinName?.(String(skinName));
				const playing = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.playing);
				if (playing !== undefined) g.setPlaying?.(parseBool(playing));
				const frame = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.frame);
				if (frame !== undefined) g.setFrame?.(parseInt2(frame));
				const loop = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.loop);
				if (loop !== undefined) g.setLoop?.(parseBool(loop));
				const loader3dColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.color);
				if (loader3dColor) g.setColor(loader3dColor);
				const clearOnPublish = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.clearOnPublish);
				if (clearOnPublish !== undefined) g.setClearOnPublish(parseBool(clearOnPublish));
				obj = g;
				break;
			}
			case 'movieclip':
			case 'jta': {
				const g = doc.createGMovieClip(name);
				const src = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.src);
				g.setSrc(src || '');
				const movieClipFileName = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.fileName);
				if (movieClipFileName !== undefined) g.setFileName(movieClipFileName);
				const movieClipPackageId = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.pkg);
				if (movieClipPackageId !== undefined) g.setPackageId(movieClipPackageId);
				const playing = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.playing);
				if (playing !== undefined) g.setPlaying(parseBool(playing));
				const frame = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.frame);
				if (frame !== undefined) g.setFrame(parseInt2(frame));
				const movieClipColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.color);
				if (movieClipColor) g.setColor(movieClipColor);
				obj = g;
				break;
			}
			case 'component': {
				const g = doc.createGComponent(name);
				const src = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.src);
				g.setSrc(src || '');
				const componentFileName = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.fileName);
				if (componentFileName !== undefined) g.setFileName(componentFileName);
				const componentPackageId = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.pkg);
				if (componentPackageId !== undefined) g.setPackageId(componentPackageId);
				const controllerOverrides = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.controllerOverrides);
				if (controllerOverrides) g.setControllerOverrides?.(controllerOverrides);
				const pageController = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.pageController);
				if (pageController) g.setPageController?.(pageController);
				obj = g;
				break;
			}
			case 'list': {
				const treeView = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.list.attrs.treeView);
				const isTree = treeView !== undefined && parseBool(treeView);
				let g;
				if (isTree) {
					g = doc.createGTree(name).setTreeView(true);
					const indent = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.list.attrs.indent);
					if (indent !== undefined) g.setIndent(parseInt2(indent));
					const clickToExpand = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.list.attrs.clickToExpand);
					if (clickToExpand !== undefined) g.setClickToExpand(parseInt2(clickToExpand));
				} else {
					g = doc.createGList(name);
				}
				const src = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.src);
				g.setSrc(src || '');
				const defaultItem = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.defaultItem);
				if (defaultItem) g.setDefaultItem(defaultItem);
				const scrollBarRes = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.scrollBarRes);
				if (scrollBarRes) {
					const parts = String(scrollBarRes).split(',');
					g.setVtScrollBarRes?.(parts[0] ?? '');
					g.setHzScrollBarRes?.(parts[1] ?? '');
				}
				const ptrRes = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.ptrRes);
				if (ptrRes) {
					const parts = String(ptrRes).split(',');
					g.setHeaderRes?.(parts[0] ?? '');
					g.setFooterRes?.(parts[1] ?? '');
				}
				const controllerOverrides = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.controllerOverrides);
				if (controllerOverrides) g.setControllerOverrides?.(controllerOverrides);
				const pageController = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.pageController);
				if (pageController) g.setPageController?.(pageController);
				const layout = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.layout);
				if (layout) {
					const layoutMap: Record<string, number> = {
						singleColumn: 0, singleRow: 1, flowHorizontal: 2, flowVertical: 3, pagination: 4,
						single_column: 0, single_row: 1, flow_hz: 2, flow_vt: 3,
						column: 0, row: 1,
					};
					g.setLayout(layoutMap[layout] ?? 0);
				}
				const align = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.align);
				if (align) {
					const alignMap: Record<string, number> = { left: 0, center: 1, right: 2 };
					g.setAlign(alignMap[align] ?? 0);
				}
				const vAlign = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.vAlign);
				if (vAlign) {
					const vAlignMap: Record<string, number> = { top: 0, middle: 1, bottom: 2 };
					g.setVAlign(vAlignMap[vAlign] ?? 0);
				}
				const lineGap = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.list.attrs.lineGap);
				if (lineGap !== undefined) g.setLineGap(parseInt2(lineGap));
				const columnGap = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.list.attrs.columnGap);
				if (columnGap !== undefined) g.setColumnGap(parseInt2(columnGap));
				const lineItemCount = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.list.attrs.lineItemCount);
				const lineItemCount2 = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.list.attrs.lineItemCount2);
				if (layout) {
					const resolvedLayout = g.getLayout?.() ?? 0;
					if (resolvedLayout === 2 || resolvedLayout === 4) {
						if (lineItemCount !== undefined) g.setColumnCount?.(parseInt2(lineItemCount));
					} else if (resolvedLayout === 3 && lineItemCount !== undefined) {
						g.setLineCount?.(parseInt2(lineItemCount));
					}
					if (resolvedLayout === 4 && lineItemCount2 !== undefined) {
						g.setLineCount?.(parseInt2(lineItemCount2));
					}
				}
				const autoResizeItem = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.list.attrs.autoResizeItem);
				g.setAutoResizeItem?.(
					autoResizeItem === undefined
						? getDefaultListAutoResizeItem(g.getLayout?.() ?? 0)
						: parseBool(autoResizeItem),
				);
				const childrenRenderOrder = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.childrenRenderOrder);
				if (childrenRenderOrder) {
					const renderOrderMap: Record<string, number> = { ascent: 0, descent: 1, arch: 2 };
					g.setChildrenRenderOrder?.(renderOrderMap[childrenRenderOrder] ?? 0);
				}
				const apexIndex = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.list.attrs.apexIndex);
				if (apexIndex !== undefined) g.setApexIndex?.(parseInt2(apexIndex));
				const selectionMode = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.selectionMode);
				if (selectionMode) {
					const selMap: Record<string, number> = { single: 0, multiple: 1, multipleSingleClick: 2, none: 3 };
					g.setSelectionMode(selMap[selectionMode] ?? 0);
				}
				const selectionController = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.selectionController);
				if (selectionController !== undefined) g.setSelectionController?.(selectionController);
				// Overflow & scroll
				const overflow = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.overflow);
				const scroll = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.scroll);
				const scrollBar = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.scrollBar);
				const scrollBarFlags = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.list.attrs.scrollBarFlags);
				const margin = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.margin);
				if (overflow || scroll || scrollBar || scrollBarFlags !== undefined || margin) {
					if (overflow) {
						const overflowMap: Record<string, number> = { visible: 0, hidden: 1, scroll: 2 };
						g.setOverflow(overflowMap[overflow] ?? 0);
					}
					if (scroll) {
						const scrollMap: Record<string, number> = { horizontal: 0, vertical: 1, both: 2 };
						g.setScrollType(scrollMap[scroll] ?? 1);
					}
					if (scrollBar) {
						const scrollBarMap: Record<string, number> = { default: 0, visible: 1, auto: 2, hidden: 3 };
						g.setScrollBarDisplay(scrollBarMap[scrollBar] ?? 0);
					}
					if (scrollBarFlags !== undefined) g.setScrollBarFlags(parseInt2(scrollBarFlags));
					if (margin) {
						const parts = margin.split(',').map(Number);
						g.setMargin({
							top: parts[0] ?? 0,
							bottom: parts[1] ?? 0,
							left: parts[2] ?? 0,
							right: parts[3] ?? 0,
						});
					}
				}
				const scrollBarMargin = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.scrollBarMargin);
				if (scrollBarMargin) {
					const parts = scrollBarMargin.split(',').map(Number);
					g.setScrollBarMargin?.({
						top: parts[0] ?? 0,
						bottom: parts[1] ?? 0,
						left: parts[2] ?? 0,
						right: parts[3] ?? 0,
					});
				}
				// clipSoftness
				const clipSoftness = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.clipSoftness);
				if (clipSoftness) {
					const csParts = clipSoftness.split(',').map(Number);
					g.setClipSoftness({ x: csParts[0] ?? 0, y: csParts[1] ?? 0 });
				}
				const scrollItemToViewOnClick = readXmlAttr<string | boolean>(
					attrs,
					PROJECT_XML_PROTOCOL.list.attrs.scrollItemToViewOnClick,
				);
				if (scrollItemToViewOnClick !== undefined) {
					g.setScrollItemToViewOnClick?.(parseBool(scrollItemToViewOnClick));
				}
				const foldInvisibleItems = readXmlAttr<string | boolean>(
					attrs,
					PROJECT_XML_PROTOCOL.list.attrs.foldInvisibleItems,
				);
				if (foldInvisibleItems !== undefined) g.setFoldInvisibleItems?.(parseBool(foldInvisibleItems));
				const autoClearItems = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.list.attrs.autoClearItems);
				if (autoClearItems !== undefined) g.setAutoClearItems?.(parseBool(autoClearItems));
				// Parse static list items
				const listItemChildName = getProtocolChildName(PROJECT_XML_PROTOCOL.list, 'item');
				const items = listItemChildName ? ensureArray(attrs[listItemChildName]) : [];
				if (items.length > 0) {
					const listItems = items
						.map((itemDef) => getXmlNode<ListItemXmlNode>(itemDef))
						.filter((itemDef): itemDef is ListItemXmlNode => itemDef !== null)
						.map((itemDef) => parseListItemXmlNode(itemDef));
					g.setListItems(isTree ? inferTreeItemFolderFlags(listItems) : listItems);
				}
				obj = g;
				break;
			}
			default:
				return null;
		}

		// Common GObject attributes
		const objectId = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.displayObject.attrs.id);
		obj.setId(objectId || '');
		const objectProtocol = DISPLAY_OBJECT_PROTOCOL_MAP[tagName];
		readCommonDisplayState(attrs, obj as WritableCommonDisplayState, objectProtocol);
		// Parse gear elements
		for (const gearTag of getProtocolGearChildNames(objectProtocol)) {
			const gearDefs = ensureArray(attrs[gearTag]);
			for (const gearDef of gearDefs) {
				const parsedGear = getXmlNode<GearXmlNode>(gearDef);
				if (!parsedGear) continue;
				parseGear(ctx, doc, obj, gearTag, parsedGear, localControllers);
			}
		}

		// Parse relation elements
		const relationChildName = getProtocolChildName(objectProtocol, 'relation');
		const relations = relationChildName ? ensureArray(attrs[relationChildName]) : [];
		for (const relDef of relations) {
			const parsedRelation = getXmlNode<RelationXmlNode>(relDef);
			if (!parsedRelation) continue;
			const sidePair = readXmlAttr<string>(parsedRelation, PROJECT_XML_PROTOCOL.relation.attrs.sidePair) || '';
			const sidePairs = parseSidePair(sidePair);
			for (const sp of sidePairs) {
				const target = readXmlAttr<string>(parsedRelation, PROJECT_XML_PROTOCOL.relation.attrs.target) || '';
				const rel: RelationDef = {
					target,
					type: sp.type,
					usePercent: sp.usePercent,
				};
				obj.addRelation(rel);
			}
		}
		if (obj.propertyType === 'GComponent') {
			(obj as ReturnType<Document['createGComponent']>)
				.setPropertyOverrides(parsePropertyOverrides(attrs, PROJECT_XML_PROTOCOL.componentInstance));
		}

		// Parse extension overlay data for child component instances
		// e.g. <component id="n18" src="rpmb10"><Button title="点我" icon="..."/></component>
		for (const extTypeName of getProtocolExtensionChildNames(PROJECT_XML_PROTOCOL.componentInstance)) {
			const extElement = attrs[extTypeName];
			if (extElement) {
				const extAttrs = getXmlNode<ExtensionXmlNode>(extElement);
				if (!extAttrs || obj.propertyType !== 'GComponent') continue;
				const componentObj = obj as ReturnType<Document['createGComponent']>;
				const extProtocol = EXTENSION_PROTOCOL_MAP[extTypeName as keyof typeof EXTENSION_PROTOCOL_MAP];
				const extSpecs = extProtocol.attrs as Record<string, { canonical: string }>;
				componentObj.setInstanceExtType?.(extTypeName);
				const title = extSpecs.title ? readXmlAttr<string>(extAttrs, extSpecs.title) : undefined;
				if (title !== undefined) componentObj.setInstanceTitle?.(title);
				const selectedTitle = extSpecs.selectedTitle ? readXmlAttr<string>(extAttrs, extSpecs.selectedTitle) : undefined;
				if (selectedTitle !== undefined) componentObj.setInstanceSelectedTitle?.(selectedTitle);
				const icon = extSpecs.icon ? readXmlAttr<string>(extAttrs, extSpecs.icon) : undefined;
				if (icon !== undefined) componentObj.setInstanceIcon?.(icon);
				const selectedIcon = extSpecs.selectedIcon ? readXmlAttr<string>(extAttrs, extSpecs.selectedIcon) : undefined;
				if (selectedIcon !== undefined) componentObj.setInstanceSelectedIcon?.(selectedIcon);
				const titleColor = extSpecs.titleColor ? readXmlAttr<string>(extAttrs, extSpecs.titleColor) : undefined;
				if (titleColor !== undefined) componentObj.setInstanceTitleColor?.(titleColor);
				const titleFontSize = extSpecs.titleFontSize ? readXmlAttr<string | number>(extAttrs, extSpecs.titleFontSize) : undefined;
				if (titleFontSize !== undefined) componentObj.setInstanceTitleFontSize?.(parseInt2(titleFontSize));
				const controller = extSpecs.controller ? readXmlAttr<string>(extAttrs, extSpecs.controller) : undefined;
				if (controller !== undefined) componentObj.setInstanceController?.(controller);
				const page = extSpecs.page ? readXmlAttr<string>(extAttrs, extSpecs.page) : undefined;
				if (page !== undefined) componentObj.setInstancePage?.(page);
				const checked = extSpecs.checked ? readXmlAttr<string | boolean>(extAttrs, extSpecs.checked) : undefined;
				if (checked !== undefined) componentObj.setInstanceChecked?.(parseBool(checked));
				const sound = extSpecs.sound ? readXmlAttr<string>(extAttrs, extSpecs.sound) : undefined;
				if (sound !== undefined) componentObj.setInstanceSound?.(sound);
				const soundVolumeScale = extSpecs.soundVolumeScale ? readXmlAttr<string | number>(extAttrs, extSpecs.soundVolumeScale) : undefined;
				if (soundVolumeScale !== undefined) componentObj.setInstanceSoundVolumeScale?.(parseFloat2(soundVolumeScale, 100) / 100);
				const popupDirection = extSpecs.popupDirection ? readXmlAttr<string>(extAttrs, extSpecs.popupDirection) : undefined;
				if (popupDirection !== undefined) {
					componentObj.setInstancePopupDirection?.(({ auto: 0, up: 1, down: 2 } as Record<string, number>)[popupDirection] ?? 0);
				}
				const prompt = extSpecs.prompt ? readXmlAttr<string>(extAttrs, extSpecs.prompt) : undefined;
				if (prompt !== undefined) componentObj.setInstancePromptText?.(prompt);
				const selectionController = extSpecs.selectionController ? readXmlAttr<string>(extAttrs, extSpecs.selectionController) : undefined;
				if (selectionController !== undefined) componentObj.setInstanceSelectionController?.(selectionController);
				const visibleItemCount = extSpecs.visibleItemCount ? readXmlAttr<string | number>(extAttrs, extSpecs.visibleItemCount) : undefined;
				if (visibleItemCount !== undefined) componentObj.setInstanceVisibleItemCount?.(parseInt2(visibleItemCount));
				const autoClearItems = extSpecs.autoClearItems ? readXmlAttr<string | boolean>(extAttrs, extSpecs.autoClearItems) : undefined;
				if (autoClearItems !== undefined) componentObj.setInstanceAutoClearItems?.(parseBool(autoClearItems));
				const value = extSpecs.value ? readXmlAttr<string | number>(extAttrs, extSpecs.value) : undefined;
				if (value !== undefined) componentObj.setInstanceValue?.(parseInt2(value));
				const max = extSpecs.max ? readXmlAttr<string | number>(extAttrs, extSpecs.max) : undefined;
				if (max !== undefined) componentObj.setInstanceMax?.(parseInt2(max, 100));
				const min = extSpecs.min ? readXmlAttr<string | number>(extAttrs, extSpecs.min) : undefined;
				if (min !== undefined) componentObj.setInstanceMin?.(parseInt2(min));
				const comboBoxItemChildName = getProtocolChildName(PROJECT_XML_PROTOCOL.comboBoxExtension, 'item');
				if (extTypeName === 'ComboBox' && comboBoxItemChildName && extAttrs[comboBoxItemChildName]) {
					const comboItems = ensureArray(extAttrs[comboBoxItemChildName]);
					componentObj.setInstanceComboItems?.(
						comboItems
							.map((itemDef) => getXmlNode<ComboItemXmlNode>(itemDef))
							.filter((itemDef): itemDef is ComboItemXmlNode => itemDef !== null)
							.map((itemDef) => parseComboBoxItemXmlNode(itemDef)),
					);
				}
			}
		}

		return obj;
	}

function parseGear(
		_ctx: ReaderContext,
		doc: Document,
		obj: GObject,
		gearTag: string,
		attrs: GearXmlNode,
		localControllers: Map<string, Controller>,
	): void {
		const gearType = GEAR_TAG_MAP[gearTag];
		if (gearType === undefined) return;

		const gear = doc.createGear();
		gear.setGearType(gearType);
		const tween = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.gear.attrs.tween);
		gear.setTween(parseBool(tween));
		const positionsInPercent = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.gear.attrs.positionsInPercent);
		if (positionsInPercent !== undefined) {
			gear.setPositionsInPercent(parseBool(positionsInPercent));
		}

		// Resolve controller reference
		const ctrlName = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.gear.attrs.controller) || '';
		const controller = localControllers.get(ctrlName) || null;
		if (controller) {
			gear.setController(controller);
		}

		// Parse pages and values
		const pages = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.gear.attrs.pages);
		if (pages) {
			gear.setPages(pages);
		}
		const values = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.gear.attrs.values);
		if (gearType === GearType.Text || gearType === GearType.Icon || values) {
			gear.setValues(values ?? '');
		}
		const defaultValue = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.gear.attrs.default);
		if (defaultValue !== undefined) {
			gear.setDefaultValue(defaultValue);
		}
		const condition = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.gear.attrs.condition);
		if (condition !== undefined) {
			gear.setCondition(String(condition));
		}
		const ease = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.gear.attrs.ease);
		if (ease) {
			gear.setEaseType(_parseEaseType(ease));
		}
		const duration = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.gear.attrs.duration);
		if (duration !== undefined) {
			gear.setTweenDuration(parseFloat2(duration));
		}
		const delay = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.gear.attrs.delay);
		if (delay !== undefined) {
			gear.setTweenDelay(parseFloat2(delay));
		}

		obj.addGear(gear);
	}
