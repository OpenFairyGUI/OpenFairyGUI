export { getXmlNode } from '../utils/xml-utils.js';
import { getXmlNode } from '../utils/xml-utils.js';
import type { GComponentPropertyOverride } from '../properties/g-component.js';
import { ensureArray } from '../utils/xml-utils.js';
import { PROJECT_XML_PROTOCOL, readXmlAttr, type XmlNodeProtocol } from './project-xml-protocol.js';

export type XmlNode = Record<string, unknown>;

export interface RelationXmlNode extends XmlNode {
	target?: string;
	sidePair?: string;
}

export interface GearXmlNode extends XmlNode {
	tween?: string | boolean;
	controller?: string;
	pages?: string;
	values?: string;
	default?: string;
	condition?: string;
}

export interface ListItemXmlNode extends XmlNode {
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

export interface PropertyOverrideXmlNode extends XmlNode {
	target?: string;
	propertyId?: string | number;
	value?: string | number | boolean;
}

export interface ComboItemXmlNode extends XmlNode {
	title?: string;
	value?: string;
	icon?: string;
}

export interface ExtensionXmlNode extends Record<string, unknown> {
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


export function getProtocolChildName(protocol: XmlNodeProtocol, childName: string): string | null {
	return protocol.children?.[childName] ? childName : null;
}

export function parsePropertyOverrides(source: XmlNode, protocol: XmlNodeProtocol): GComponentPropertyOverride[] {
	const childName = getProtocolChildName(protocol, 'property');
	if (!childName) return [];
	return ensureArray(source[childName]).map((raw, index) => {
		const property = getXmlNode<PropertyOverrideXmlNode>(raw);
		const specs = PROJECT_XML_PROTOCOL.propertyOverride.attrs;
		const target = property ? readXmlAttr<string>(property, specs.target) : undefined;
		const rawPropertyId = property ? readXmlAttr<string | number>(property, specs.propertyId) : undefined;
		const propertyId =
			typeof rawPropertyId === 'number'
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
