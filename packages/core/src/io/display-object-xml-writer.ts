import { GearType } from '../constants.js';
import type { Gear } from '../properties/gear.js';
import type { GObject } from '../properties/g-object.js';
import { PROJECT_XML_PROTOCOL, writeXmlAttr, type XmlNodeProtocol } from './project-xml-protocol.js';

const GEAR_TAG: Record<number, string> = {
	[GearType.Display]: 'gearDisplay',
	[GearType.XY]: 'gearXY',
	[GearType.Size]: 'gearSize',
	[GearType.Look]: 'gearLook',
	[GearType.Color]: 'gearColor',
	[GearType.Animation]: 'gearAni',
	[GearType.Text]: 'gearText',
	[GearType.Icon]: 'gearIcon',
	[GearType.Display2]: 'gearDisplay2',
	[GearType.FontSize]: 'gearFontSize',
};

const RELATION_TYPE_NAME: Record<number, string> = {
	0: 'left-left', 1: 'left-center', 2: 'left-right',
	3: 'center-center',
	4: 'right-left', 5: 'right-center', 6: 'right-right',
	7: 'top-top', 8: 'top-middle', 9: 'top-bottom',
	10: 'middle-middle',
	11: 'bottom-top', 12: 'bottom-middle', 13: 'bottom-bottom',
	14: 'width-width', 15: 'height-height',
	16: 'leftext-left', 17: 'leftext-right',
	18: 'rightext-left', 19: 'rightext-right',
	20: 'topext-top', 21: 'topext-bottom',
	22: 'bottomext-top', 23: 'bottomext-bottom',
};

const DISPLAY_TAG: Record<string, string> = {
	GImage: 'image',
	GTextField: 'text',
	GRichTextField: 'richtext',
	GTextInput: 'inputtext',
	GGraph: 'graph',
	GGroup: 'group',
	GLoader: 'loader',
	GLoader3D: 'loader3d',
	GMovieClip: 'jta',
	GComponent: 'component',
	GButton: 'component',
	GLabel: 'component',
	GComboBox: 'component',
	GProgressBar: 'component',
	GSlider: 'component',
	GScrollBar: 'component',
	GList: 'list',
	GTree: 'list',
};

const EXTENSION_TYPE: Record<string, string> = {
	GButton: 'Button',
	GLabel: 'Label',
	GComboBox: 'ComboBox',
	GProgressBar: 'ProgressBar',
	GSlider: 'Slider',
	GScrollBar: 'ScrollBar',
};

export const EXTENSION_PROTOCOL_MAP = {
	Button: PROJECT_XML_PROTOCOL.buttonExtension,
	Label: PROJECT_XML_PROTOCOL.labelExtension,
	ComboBox: PROJECT_XML_PROTOCOL.comboBoxExtension,
	ProgressBar: PROJECT_XML_PROTOCOL.progressBarExtension,
	Slider: PROJECT_XML_PROTOCOL.sliderExtension,
	ScrollBar: PROJECT_XML_PROTOCOL.scrollBarExtension,
} as const;

const DISPLAY_OBJECT_PROTOCOL_BY_TYPE: Record<string, XmlNodeProtocol> = {
	GImage: PROJECT_XML_PROTOCOL.image,
	GTextField: PROJECT_XML_PROTOCOL.text,
	GRichTextField: PROJECT_XML_PROTOCOL.richText,
	GTextInput: PROJECT_XML_PROTOCOL.textInput,
	GGraph: PROJECT_XML_PROTOCOL.graph,
	GGroup: PROJECT_XML_PROTOCOL.group,
	GLoader: PROJECT_XML_PROTOCOL.loader,
	GLoader3D: PROJECT_XML_PROTOCOL.loader3D,
	GMovieClip: PROJECT_XML_PROTOCOL.movieClip,
	GComponent: PROJECT_XML_PROTOCOL.componentInstance,
	GButton: PROJECT_XML_PROTOCOL.componentInstance,
	GLabel: PROJECT_XML_PROTOCOL.componentInstance,
	GComboBox: PROJECT_XML_PROTOCOL.componentInstance,
	GProgressBar: PROJECT_XML_PROTOCOL.componentInstance,
	GSlider: PROJECT_XML_PROTOCOL.componentInstance,
	GScrollBar: PROJECT_XML_PROTOCOL.componentInstance,
	GList: PROJECT_XML_PROTOCOL.list,
	GTree: PROJECT_XML_PROTOCOL.list,
};

const DISPLAY_LIST_CONTAINER = PROJECT_XML_PROTOCOL.componentRoot.containers?.displayList;
if (!DISPLAY_LIST_CONTAINER) {
	throw new Error('PROJECT_XML_PROTOCOL.componentRoot must define containers.displayList');
}

const DISPLAY_LIST_ALLOWED_VARIANTS = new Set(Object.keys(DISPLAY_LIST_CONTAINER.items));

function stringifyEaseType(easeType: number): string {
	const names: Record<number, string> = {
		0: 'Linear', 1: 'Sine.In', 2: 'Sine.Out', 3: 'Sine.InOut',
		4: 'Quad.In', 5: 'Quad.Out', 6: 'Quad.InOut',
		7: 'Cubic.In', 8: 'Cubic.Out', 9: 'Cubic.InOut',
		10: 'Quart.In', 11: 'Quart.Out', 12: 'Quart.InOut',
		13: 'Quint.In', 14: 'Quint.Out', 15: 'Quint.InOut',
		16: 'Expo.In', 17: 'Expo.Out', 18: 'Expo.InOut',
		19: 'Circ.In', 20: 'Circ.Out', 21: 'Circ.InOut',
		22: 'Elastic.In', 23: 'Elastic.Out', 24: 'Elastic.InOut',
		25: 'Back.In', 26: 'Back.Out', 27: 'Back.InOut',
		28: 'Bounce.In', 29: 'Bounce.Out', 30: 'Bounce.InOut',
		31: 'Custom',
	};
	return names[easeType] ?? 'Quad.Out';
}

function sameColor(a: string | undefined, b: string): boolean {
	return (a ?? '').toLowerCase() === b.toLowerCase();
}

function formatXmlColor(color: string): string {
	return color.toLowerCase();
}

export function formatButtonDownEffectValue(value: number): string {
	return value.toFixed(2);
}

function almostEqual(a: number, b: number, epsilon = 0.000001): boolean {
	return Math.abs(a - b) < epsilon;
}

function isDefaultWhiteColor(color: string | undefined): boolean {
	return sameColor(color, '#FFFFFF') || sameColor(color, '#FFFFFFFF');
}

function isDefaultBlackColor(color: string | undefined): boolean {
	return sameColor(color, '#000000') || sameColor(color, '#FF000000');
}


function escapeXmlAttr(value: unknown): string {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/\r\n/g, '&#xA;')
		.replace(/[\r\n]/g, '&#xA;')
		.replace(/\t/g, '&#x9;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function renderXmlAttrs(attrs: Record<string, unknown>): string {
	const parts: string[] = [];
	for (const [key, value] of Object.entries(attrs)) {
		if (value === undefined || value === null) continue;
		if (Array.isArray(value) || typeof value === 'object') continue;
		const attrName = key.startsWith('@_') ? key.slice(2) : key;
		parts.push(` ${attrName}="${escapeXmlAttr(value)}"`);
	}
	return parts.join('');
}

function renderXmlText(value: unknown): string {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function renderXmlNode(tagName: string, node: unknown, indent: string): string {
	if (node === undefined || node === null || node === '') {
		return `${indent}<${tagName}/>`;
	}
	if (Array.isArray(node)) {
		return node.map((item) => renderXmlNode(tagName, item, indent)).join('\n');
	}
	if (typeof node !== 'object') {
		return `${indent}<${tagName}>${renderXmlText(node)}</${tagName}>`;
	}

	const attrs: Record<string, unknown> = {};
	const children: Array<{ tagName: string; value: unknown }> = [];
	for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
		if (key.startsWith('@_')) attrs[key] = value;
		else if (value !== undefined && value !== null) children.push({ tagName: key, value });
	}

	if (children.length === 0) {
		return `${indent}<${tagName}${renderXmlAttrs(attrs)}/>`;
	}

	const childIndent = `${indent}  `;
	const childLines: string[] = [];
	for (const child of children) {
		if (Array.isArray(child.value)) {
			for (const item of child.value) childLines.push(renderXmlNode(child.tagName, item, childIndent));
		} else {
			childLines.push(renderXmlNode(child.tagName, child.value, childIndent));
		}
	}

	return `${indent}<${tagName}${renderXmlAttrs(attrs)}>\n${childLines.join('\n')}\n${indent}</${tagName}>`;
}


function formatTrimmedFixed(value: number, precision = 2): string {
	if (!Number.isFinite(value)) return String(value);
	if (precision === 0) return value.toFixed(0);
	const fixed = value.toFixed(precision);
	return fixed.replace(/(?:\.0+|(\.\d*?[1-9])0+)$/, '$1');
}

function formatDisplayAlpha(value: number): string {
	return formatTrimmedFixed(value, 2);
}

function formatImageFlip(value: number): string {
	switch (value) {
		case 1:
			return 'hz';
		case 2:
			return 'vt';
		case 3:
			return 'both';
		default:
			return String(value);
	}
}

function formatGearLookAlpha(value: string | undefined, fixedAlpha: boolean): string {
	if (value === undefined) return '';
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return value;
	return fixedAlpha ? numeric.toFixed(2) : formatTrimmedFixed(numeric, 2);
}

function normalizeGearLookSegment(segment: string, fixedAlpha: boolean): string {
	if (!segment || segment === '-') return segment;
	const parts = segment.split(',');
	if (parts.length < 3) return segment;
	const normalizeFlag = (value: string | undefined, fallback: string): string => {
		if (value === undefined || value === '') return fallback;
		const lower = value.trim().toLowerCase();
		if (lower === 'true') return '1';
		if (lower === 'false') return '0';
		return value;
	};
	const normalized = [
		formatGearLookAlpha(parts[0], fixedAlpha),
		formatTrimmedFixed(Number(parts[1] ?? 0), 2),
		normalizeFlag(parts[2], '0'),
	];
	if (parts.length >= 4) {
		const touchable = normalizeFlag(parts[3], '1');
		if (touchable !== '1') normalized.push(touchable);
	}
	return normalized.join(',');
}

function normalizeGearColorSegment(segment: string, compactOutline: boolean): string {
	if (!segment || segment === '-') return segment;
	const parts = segment.split(',');
	if (parts.length === 1) return formatXmlColor(parts[0] ?? '');
	const normalized = parts.map((part) => formatXmlColor(part));
	if (compactOutline && normalized.length >= 2 && isDefaultBlackColor(normalized[1])) {
		return normalized[0] ?? '';
	}
	return normalized.join(',');
}

function isIdentityGearSizeScale(segment: string): boolean {
	if (!segment || segment === '-') return true;
	const parts = segment.split(',');
	if (parts.length < 4) return true;
	return almostEqual(Number(parts[2] ?? 1), 1) && almostEqual(Number(parts[3] ?? 1), 1);
}

function normalizeGearSizeSegment(segment: string, fixedScale: boolean, omitIdentityScale: boolean): string {
	if (!segment || segment === '-') return segment;
	const parts = segment.split(',');
	if (parts.length < 2) return segment;
	const normalized = [
		String(Math.trunc(Number(parts[0] ?? 0))),
		String(Math.trunc(Number(parts[1] ?? 0))),
	];
	if (parts.length >= 4) {
		if (omitIdentityScale && isIdentityGearSizeScale(segment)) {
			return normalized.join(',');
		}
		const scaleFormatter = fixedScale
			? (value: string | undefined) => {
				const numeric = Number(value);
				return Number.isFinite(numeric) ? numeric.toFixed(2) : String(value ?? '');
			}
			: (value: string | undefined) => formatTrimmedFixed(Number(value ?? 0), 2);
		normalized.push(scaleFormatter(parts[2]), scaleFormatter(parts[3]));
	}
	return normalized.join(',');
}

function shouldCompactTextGearColor(ownerType?: string, ownerName?: string): boolean {
	return (ownerType === 'GTextField' || ownerType === 'GRichTextField' || ownerType === 'GTextInput')
		&& ownerName === 'title';
}

function normalizeGearXmlValue(gearType: number, value: unknown, ownerType?: string, ownerName?: string, gear?: Gear): string {
	const raw = String(value ?? '');
	switch (gearType) {
		case GearType.Size: {
			const fixedScale = !gear?.getTween();
			const segments = raw.split('|');
			const omitIdentityScale = fixedScale
				&& ownerName !== 'bg'
				&& segments.every((segment) => isIdentityGearSizeScale(segment));
			return segments.map((segment) => normalizeGearSizeSegment(segment, fixedScale, omitIdentityScale)).join('|');
		}
		case GearType.Look: {
			const fixedAlpha = ownerType === 'GLoader'
				|| Boolean(gear?.getTween() && !almostEqual(gear.getTweenDuration(), 0.3));
			return raw.split('|').map((segment) => normalizeGearLookSegment(segment, fixedAlpha)).join('|');
		}
		case GearType.Color: {
			const textLike = ownerType === 'GTextField' || ownerType === 'GRichTextField' || ownerType === 'GTextInput';
			const compactOutline = !textLike || shouldCompactTextGearColor(ownerType, ownerName);
			return raw.split('|').map((segment) => normalizeGearColorSegment(segment, compactOutline)).join('|');
		}
		default:
			return raw;
	}
}


type WritableChild = GObject & {
	getX?(): number;
	getY?(): number;
	getWidth?(): number;
	getHeight?(): number;
	getPivotX?(): number;
	getPivotY?(): number;
	getPivotAsAnchor?(): boolean;
	getScaleX?(): number;
	getScaleY?(): number;
	getLocked?(): boolean;
	getMinWidth?(): number;
	getMaxWidth?(): number;
	getMinHeight?(): number;
	getMaxHeight?(): number;
	getAutoClearText?(): boolean;
	getDemoText?(): string;
	getTemplateVarsEnabled?(): boolean;
	getFaceDilate?(): number;
	getUnderlaySoftness?(): number;
	getSrc?(): string;
	getAspect?(): boolean;
	getGroup?(): string;
	getAlpha?(): number;
	getRotation?(): number;
	getVisible?(): boolean;
	getTouchable?(): boolean;
	getGrayed?(): boolean;
	getTooltips?(): string;
	getCustomData?(): string;
	getFileName?(): string;
	getPackageId?(): string;
	getFilter?(): string;
	getFilterData?(): string;
	getUrl?(): string;
	getText?(): string;
	getFont?(): string;
	getFontSize?(): number;
	getColor?(): string;
	getLeading?(): number;
	getLetterSpacing?(): number;
	getSingleLine?(): boolean;
	getUbbEnabled?(): boolean;
	getUnderline?(): boolean;
	getItalic?(): boolean;
	getBold?(): boolean;
	getStrokeColor?(): string | null;
	getStrokeSize?(): number;
	getShadowColor?(): string | null;
	getShadowOffsetX?(): number;
	getShadowOffsetY?(): number;
	getStrikethrough?(): boolean;
	getAlign?(): number;
	getVAlign?(): number;
	getFill?(): number;
	getShrinkOnly?(): boolean;
	getAutoSize?(): number | boolean;
	getUseResize?(): boolean;
	getAnimationName?(): string;
	getSkinName?(): string;
	getLoop?(): boolean;
	getPlaying?(): boolean;
	getFrame?(): number;
	getFlip?(): number;
	getFillMethod?(): number;
	getFillOrigin?(): number;
	getFillClockwise?(): boolean;
	getFillAmount?(): number;
	getClearOnPublish?(): boolean;
	getGraphType?(): number;
	getLineSize?(): number;
	getLineColor?(): string;
	getFillColor?(): string;
	getCornerRadius?(): [number, number, number, number] | null;
	getPoints?(): number[] | null;
	getSkewX?(): number;
	getSkewY?(): number;
	getSides?(): number;
	getStartAngle?(): number;
	getDistances?(): number[] | null;
	getLayout?(): number;
	getLineGap?(): number;
	getColumnGap?(): number;
	getAdvanced?(): boolean;
	getExcludeInvisibles?(): boolean;
	getAutoSizeDisabled?(): boolean;
	getMainGridIndex?(): number;
	getSelectionMode?(): number;
	getSelectionController?(): string;
	getDefaultItem?(): string;
	getLineCount?(): number;
	getColumnCount?(): number;
	getAutoResizeItem?(): boolean;
	getOverflow?(): number;
	getScrollType?(): number;
	getScrollBarFlags?(): number;
	getVtScrollBarRes?(): string;
	getHzScrollBarRes?(): string;
	getHeaderRes?(): string;
	getFooterRes?(): string;
	getMargin?(): { top?: number; bottom?: number; left?: number; right?: number };
	getClipSoftness?(): { x?: number; y?: number };
	getListItems?(): Array<{
		title?: string | null;
		icon?: string | null;
		url?: string | null;
		name?: string | null;
		selectedTitle?: string | null;
		selectedIcon?: string | null;
		level?: number;
		isFolder?: boolean | null;
		controllers?: string | null;
	}>;
	getIndent?(): number;
	getClickToExpand?(): number;
	getPageController?(): string;
	getControllerOverrides?(): string;
	getPromptText?(): string;
	getMaxLength?(): number;
	getRestrict?(): string;
	getPassword?(): boolean;
	getKeyboardType?(): number;
	getInstanceExtType?(): string;
	getInstanceTitle?(): string;
	getInstanceSelectedTitle?(): string;
	getInstanceIcon?(): string;
	getInstanceSelectedIcon?(): string;
	getInstanceTitleColor?(): string;
	getInstanceTitleFontSize?(): number;
	getInstanceController?(): string;
	getInstancePage?(): string;
	getInstanceChecked?(): boolean;
	getInstanceSound?(): string;
	getInstanceSoundVolumeScale?(): number;
	getInstancePromptText?(): string;
	getInstanceSelectionController?(): string;
	getInstanceVisibleItemCount?(): number;
	getInstanceValue?(): number;
	getInstanceMax?(): number;
	getInstanceMin?(): number;
	getInstanceComboItems?(): Array<{
		title?: string | null;
		value?: string | null;
		icon?: string | null;
	}>;
};


function writeCommonDisplayState(
	target: Record<string, unknown>,
	object: WritableChild,
	protocol: XmlNodeProtocol,
): void {
	const specs = protocol.attrs;
	if (specs.alpha && (object.getAlpha?.() ?? 1) !== 1) {
		writeXmlAttr(target, specs.alpha, formatDisplayAlpha(object.getAlpha?.() ?? 1));
	}
	if (specs.rotation && (object.getRotation?.() ?? 0) !== 0) {
		writeXmlAttr(target, specs.rotation, String(object.getRotation?.() ?? 0));
	}
	if (specs.visible && object.getVisible?.() === false) {
		writeXmlAttr(target, specs.visible, 'false');
	}
	if (specs.touchable && object.getTouchable?.() === false) {
		writeXmlAttr(target, specs.touchable, 'false');
	}
	if (specs.grayed && object.getGrayed?.()) {
		writeXmlAttr(target, specs.grayed, 'true');
	}
}

export function hasNonZeroInsets(value: { top?: number; bottom?: number; left?: number; right?: number } | null | undefined): boolean {
	return !!value && !!(value.top || value.bottom || value.left || value.right);
}

export function formatInsets(value: { top?: number; bottom?: number; left?: number; right?: number }): string {
	return `${value.top ?? 0},${value.bottom ?? 0},${value.left ?? 0},${value.right ?? 0}`;
}

function formatFillMethod(fillMethod: number): string {
	const fillMethodName: Record<number, string> = {
		0: 'none',
		1: 'hz',
		2: 'vt',
		3: 'radial90',
		4: 'radial180',
		5: 'radial360',
	};
	return fillMethodName[fillMethod] ?? 'none';
}

export function formatButtonMode(mode: number): string {
	const map: Record<number, string> = {
		0: 'Common',
		1: 'Check',
		2: 'Radio',
	};
	return map[mode] ?? 'Common';
}

export function formatTitleType(titleType: number): string {
	const map: Record<number, string> = {
		0: 'percent',
		1: 'valueAndmax',
		2: 'value',
		3: 'max',
	};
	return map[titleType] ?? 'percent';
}

function serializeListItemXmlNode(item: {
	title?: string | null;
	icon?: string | null;
	url?: string | null;
	name?: string | null;
	selectedTitle?: string | null;
	selectedIcon?: string | null;
	level?: number;
	isFolder?: boolean | null;
	controllers?: string | null;
}, options?: {
	forceLevel?: boolean;
}): Record<string, unknown> {
	const attrs: Record<string, unknown> = {};
	const specs = PROJECT_XML_PROTOCOL.listItem.attrs;
	if (item.title !== undefined && item.title !== null) writeXmlAttr(attrs, specs.title, item.title);
	if (item.icon !== undefined && item.icon !== null) writeXmlAttr(attrs, specs.icon, item.icon);
	if (item.url !== undefined && item.url !== null) writeXmlAttr(attrs, specs.url, item.url);
	if (item.name !== undefined && item.name !== null) writeXmlAttr(attrs, specs.name, item.name);
	if (item.selectedTitle !== undefined && item.selectedTitle !== null) writeXmlAttr(attrs, specs.selectedTitle, item.selectedTitle);
	if (item.selectedIcon !== undefined && item.selectedIcon !== null) writeXmlAttr(attrs, specs.selectedIcon, item.selectedIcon);
	if (item.level !== undefined && item.level !== null && ((options?.forceLevel ?? false) || item.level !== 0 || item.isFolder === true)) {
		writeXmlAttr(attrs, specs.level, String(item.level));
	}
	if (item.isFolder !== undefined && item.isFolder !== null) {
		writeXmlAttr(attrs, specs.isFolder, item.isFolder ? 'true' : 'false');
	}
	if (item.controllers !== undefined && item.controllers !== null) writeXmlAttr(attrs, specs.controllers, item.controllers);
	return attrs;
}

function serializeComboBoxItemXmlNode(item: {
	title?: string | null;
	value?: string | null;
	icon?: string | null;
}): Record<string, unknown> {
	const attrs: Record<string, unknown> = {};
	const specs = PROJECT_XML_PROTOCOL.comboBoxItem.attrs;
	if (item.title !== undefined && item.title !== null) writeXmlAttr(attrs, specs.title, item.title);
	if (item.value !== undefined && item.value !== null) writeXmlAttr(attrs, specs.value, item.value);
	if (item.icon !== undefined && item.icon !== null) writeXmlAttr(attrs, specs.icon, item.icon);
	return attrs;
}

export function getProtocolChildName(protocol: XmlNodeProtocol, childName: string): string | null {
	return protocol.children?.[childName] ? childName : null;
}

function getProtocolGearChildNameSet(protocol: XmlNodeProtocol): Set<string> {
	const gearTagNames = new Set(Object.values(GEAR_TAG));
	return new Set(Object.keys(protocol.children ?? {}).filter((name) => gearTagNames.has(name)));
}

function getDisplayListVariantName(propertyType: string, tagName: string): string {
	if (propertyType === 'GLoader3D') return 'loader3D';
	if (propertyType === 'GTree') return 'tree';
	return tagName;
}

function assertDisplayListVariantAllowed(propertyType: string, tagName: string, childName: string): void {
	const variantName = getDisplayListVariantName(propertyType, tagName);
	if (!DISPLAY_LIST_ALLOWED_VARIANTS.has(variantName)) {
		throw new Error(
			`displayList variant "${variantName}" derived from propertyType "${propertyType}" is not declared in protocol for child "${childName}"`,
		);
	}
}

/**
 * Writes a {@link Document} to disk as a FairyGUI project
 * (.fairy file + settings JSON + assets directory with package.xml and component XML files).
 *
 * @category I/O
 */

export function serializeDisplayList(children: GObject[]): string {
		const lines: string[] = [];
		for (const child of children) {
			const propertyType = child.propertyType as string;
			const tag = DISPLAY_TAG[propertyType] ?? 'component';
			assertDisplayListVariantAllowed(propertyType, tag, child.getName() || child.getId() || propertyType);
			lines.push(renderXmlNode(tag, serializeChild(child), '    '));
		}
		return `\n${lines.join('\n')}\n  `;
	}

function serializeChild(obj: GObject): Record<string, unknown> {
		const typedObj = obj as WritableChild;
		const attrs: Record<string, unknown> = {};
		let extensionChildName: string | undefined;
		let extensionValue: Record<string, unknown> | string | undefined;
		if (obj.getId()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.displayObject.attrs.id, obj.getId());
		if (obj.getName()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.displayObject.attrs.name, obj.getName());

		// Type-specific attributes
		const type = obj.propertyType as string;
		if (type === 'GImage' || type === 'GMovieClip' || type === 'GComponent'
			|| EXTENSION_TYPE[type]) {
			const src = typedObj.getSrc?.();
			if (src) {
				if (type === 'GComponent' || EXTENSION_TYPE[type]) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.src, src);
				else if (type === 'GMovieClip') writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.src, src);
				else writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.src, src);
			}
		}
		if ((type === 'GComponent' || type === 'GList' || type === 'GTree') && typedObj.getControllerOverrides?.()) {
			if (type === 'GComponent') writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.controllerOverrides, typedObj.getControllerOverrides?.());
			else writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.controllerOverrides, typedObj.getControllerOverrides?.());
		}
		if ((type === 'GComponent' || type === 'GList' || type === 'GTree') && typedObj.getPageController?.()) {
			if (type === 'GComponent') writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.pageController, typedObj.getPageController?.());
			else writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.pageController, typedObj.getPageController?.());
		}
		if (type === 'GComponent' && typedObj.getAspect?.()) {
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.aspect, 'true');
		}
		if (type === 'GComponent') {
			const [x, y] = [typedObj.getX?.() ?? 0, typedObj.getY?.() ?? 0];
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.xy, `${x},${y}`);
			const [w, h] = [typedObj.getWidth?.() ?? 0, typedObj.getHeight?.() ?? 0];
			if (w !== 0 || h !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.size, `${w},${h}`);
			if (typedObj.getLocked?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.locked, 'true');
			const restrictSize = [
				typedObj.getMinWidth?.() ?? 0,
				typedObj.getMaxWidth?.() ?? 0,
				typedObj.getMinHeight?.() ?? 0,
				typedObj.getMaxHeight?.() ?? 0,
			];
			if (restrictSize.some((value) => value !== 0)) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.restrictSize, restrictSize.join(','));
			if (typedObj.getGroup?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.group, typedObj.getGroup?.());
			const [pivotX, pivotY] = [typedObj.getPivotX?.() ?? 0, typedObj.getPivotY?.() ?? 0];
			if (pivotX !== 0 || pivotY !== 0) {
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.pivot, `${pivotX},${pivotY}`);
				if (typedObj.getPivotAsAnchor?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.anchor, 'true');
			}
			const [scaleX, scaleY] = [typedObj.getScaleX?.() ?? 1, typedObj.getScaleY?.() ?? 1];
			if (scaleX !== 1 || scaleY !== 1) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.scale, `${scaleX},${scaleY}`);
			if ((typedObj.getRotation?.() ?? 0) !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.rotation, String(typedObj.getRotation?.() ?? 0));
			if ((typedObj.getAlpha?.() ?? 1) !== 1) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.alpha, formatDisplayAlpha(typedObj.getAlpha?.() ?? 1));
			if (typedObj.getVisible?.() === false) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.visible, 'false');
			if (typedObj.getTouchable?.() === false) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.touchable, 'false');
			if (typedObj.getGrayed?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.grayed, 'true');
			if (typedObj.getTooltips?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.tooltips, typedObj.getTooltips?.());
			if (typedObj.getCustomData?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.customData, typedObj.getCustomData?.());
			if (typedObj.getFileName?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.fileName, typedObj.getFileName?.());
			if (typedObj.getPackageId?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.pkg, typedObj.getPackageId?.());
			if (typedObj.getFilter?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.filter, typedObj.getFilter?.());
			if (typedObj.getFilterData?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.filterData, typedObj.getFilterData?.());
		}
		if (type === 'GImage') {
			const [x, y] = [typedObj.getX?.() ?? 0, typedObj.getY?.() ?? 0];
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.xy, `${x},${y}`);
			const [w, h] = [typedObj.getWidth?.() ?? 0, typedObj.getHeight?.() ?? 0];
			if (w !== 0 || h !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.size, `${w},${h}`);
			if (typedObj.getLocked?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.locked, 'true');
			if (typedObj.getAspect?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.aspect, 'true');
			if (typedObj.getGroup?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.group, typedObj.getGroup?.());
			const [pivotX, pivotY] = [typedObj.getPivotX?.() ?? 0, typedObj.getPivotY?.() ?? 0];
			if (pivotX !== 0 || pivotY !== 0) {
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.pivot, `${pivotX},${pivotY}`);
				if (typedObj.getPivotAsAnchor?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.anchor, 'true');
			}
			const [scaleX, scaleY] = [typedObj.getScaleX?.() ?? 1, typedObj.getScaleY?.() ?? 1];
			if (scaleX !== 1 || scaleY !== 1) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.scale, `${scaleX},${scaleY}`);
			const [skewX, skewY] = [typedObj.getSkewX?.() ?? 0, typedObj.getSkewY?.() ?? 0];
			if (skewX !== 0 || skewY !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.skew, `${skewX},${skewY}`);
			if ((typedObj.getRotation?.() ?? 0) !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.rotation, String(typedObj.getRotation?.() ?? 0));
			if ((typedObj.getAlpha?.() ?? 1) !== 1) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.alpha, formatDisplayAlpha(typedObj.getAlpha?.() ?? 1));
			if (typedObj.getVisible?.() === false) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.visible, 'false');
			if (typedObj.getGrayed?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.grayed, 'true');
			if (typedObj.getPackageId?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.pkg, typedObj.getPackageId?.());
			if (typedObj.getFilter?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.filter, typedObj.getFilter?.());
			if (typedObj.getFilterData?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.filterData, typedObj.getFilterData?.());
			const imageColor = typedObj.getColor?.();
			if (imageColor && !isDefaultWhiteColor(imageColor)) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.color, imageColor);
			const flip = typedObj.getFlip?.() ?? 0;
			if (flip !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.flip, formatImageFlip(flip));
			const fillMethod = typedObj.getFillMethod?.() ?? 0;
			if (fillMethod !== 0) {
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.fillMethod, formatFillMethod(fillMethod));
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.fillOrigin, String(typedObj.getFillOrigin?.() ?? 0));
				if (typedObj.getFillClockwise?.() === false) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.fillClockwise, 'false');
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.fillAmount, String(Math.round((typedObj.getFillAmount?.() ?? 0) * 100)));
			}
		}
		if (type === 'GGraph') {
			const [x, y] = [typedObj.getX?.() ?? 0, typedObj.getY?.() ?? 0];
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.xy, `${x},${y}`);
			const [w, h] = [typedObj.getWidth?.() ?? 0, typedObj.getHeight?.() ?? 0];
			if (w !== 0 || h !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.size, `${w},${h}`);
			if (typedObj.getLocked?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.locked, 'true');
			const restrictSize = [
				typedObj.getMinWidth?.() ?? 0,
				typedObj.getMaxWidth?.() ?? 0,
				typedObj.getMinHeight?.() ?? 0,
				typedObj.getMaxHeight?.() ?? 0,
			];
			if (restrictSize.some((value) => value !== 0)) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.restrictSize, restrictSize.join(','));
			if (typedObj.getGroup?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.group, typedObj.getGroup?.());
			const [pivotX, pivotY] = [typedObj.getPivotX?.() ?? 0, typedObj.getPivotY?.() ?? 0];
			if (pivotX !== 0 || pivotY !== 0) {
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.pivot, `${pivotX},${pivotY}`);
				if (typedObj.getPivotAsAnchor?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.anchor, 'true');
			}
			if ((typedObj.getRotation?.() ?? 0) !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.rotation, String(typedObj.getRotation?.() ?? 0));
			if ((typedObj.getAlpha?.() ?? 1) !== 1) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.alpha, formatDisplayAlpha(typedObj.getAlpha?.() ?? 1));
			if (typedObj.getVisible?.() === false) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.visible, 'false');
			if (typedObj.getTouchable?.() === false) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.touchable, 'false');
			const [skewX, skewY] = [typedObj.getSkewX?.() ?? 0, typedObj.getSkewY?.() ?? 0];
			if (skewX !== 0 || skewY !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.skew, `${skewX},${skewY}`);
			const graphType = typedObj.getGraphType?.() ?? 0;
			if (graphType !== 0) {
				const graphTypeName: Record<number, string> = {
					1: 'rect',
					2: 'ellipse',
					3: 'polygon',
					4: 'regularpolygon',
				};
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.type, graphTypeName[graphType] ?? 'rect');
			}
			if ((typedObj.getLineSize?.() ?? 1) !== 1) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.lineSize, String(typedObj.getLineSize?.() ?? 1));
			const lineColor = typedObj.getLineColor?.();
			if (lineColor && !sameColor(lineColor, '#000000') && !sameColor(lineColor, '#ff000000')) {
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.lineColor, formatXmlColor(lineColor));
			}
			const fillColor = typedObj.getFillColor?.();
			if (fillColor && !sameColor(fillColor, '#FFFFFF') && !sameColor(fillColor, '#FFFFFFFF')) {
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.fillColor, formatXmlColor(fillColor));
			}
			const cornerRadius = typedObj.getCornerRadius?.();
			if (cornerRadius) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.corner, cornerRadius.join(','));
			const points = typedObj.getPoints?.();
			if (points?.length) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.points, points.join(','));
			const sides = typedObj.getSides?.() ?? 0;
			if (sides > 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.sides, String(sides));
			const startAngle = typedObj.getStartAngle?.() ?? 0;
			if (startAngle !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.startAngle, String(startAngle));
			const distances = typedObj.getDistances?.();
			if (distances?.length) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.distances, distances.join(','));
		}
		if (type === 'GGroup' && typedObj.getGroup?.()) {
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.group.attrs.group, typedObj.getGroup?.());
		}
		if (type === 'GGroup') {
			const [x, y] = [typedObj.getX?.() ?? 0, typedObj.getY?.() ?? 0];
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.group.attrs.xy, `${x},${y}`);
			const [w, h] = [typedObj.getWidth?.() ?? 0, typedObj.getHeight?.() ?? 0];
			if (w !== 0 || h !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.group.attrs.size, `${w},${h}`);
			if (typedObj.getLocked?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.group.attrs.locked, 'true');
			const [pivotX, pivotY] = [typedObj.getPivotX?.() ?? 0, typedObj.getPivotY?.() ?? 0];
			if (pivotX !== 0 || pivotY !== 0) {
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.group.attrs.pivot, `${pivotX},${pivotY}`);
				if (typedObj.getPivotAsAnchor?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.group.attrs.anchor, 'true');
			}
		}
		if (type === 'GLoader') {
			const [x, y] = [typedObj.getX?.() ?? 0, typedObj.getY?.() ?? 0];
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.xy, `${x},${y}`);
			const [w, h] = [typedObj.getWidth?.() ?? 0, typedObj.getHeight?.() ?? 0];
			if (w !== 0 || h !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.size, `${w},${h}`);
			const [pivotX, pivotY] = [typedObj.getPivotX?.() ?? 0, typedObj.getPivotY?.() ?? 0];
			if (pivotX !== 0 || pivotY !== 0) {
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.pivot, `${pivotX},${pivotY}`);
				if (typedObj.getPivotAsAnchor?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.anchor, 'true');
			}
			const [scaleX, scaleY] = [typedObj.getScaleX?.() ?? 1, typedObj.getScaleY?.() ?? 1];
			if (scaleX !== 1 || scaleY !== 1) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.scale, `${scaleX},${scaleY}`);
			if (typedObj.getVisible?.() === false) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.visible, 'false');
			if (typedObj.getGrayed?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.grayed, 'true');
			const url = typedObj.getUrl?.();
			if (url) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.url, url);
			const align = typedObj.getAlign?.();
			if (align !== undefined && align !== 0) {
				const alignName: Record<number, string> = { 0: 'left', 1: 'center', 2: 'right' };
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.align, alignName[align] ?? 'left');
			}
			const vAlign = typedObj.getVAlign?.();
			if (vAlign !== undefined && vAlign !== 0) {
				const vAlignName: Record<number, string> = { 0: 'top', 1: 'middle', 2: 'bottom' };
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.vAlign, vAlignName[vAlign] ?? 'top');
			}
			const fill = typedObj.getFill?.();
			if (fill !== undefined && fill !== 0) {
				const fillName: Record<number, string> = {
					0: 'none',
					1: 'scale',
					2: 'scaleMatchHeight',
					3: 'scaleMatchWidth',
					4: 'scaleFree',
					5: 'scaleNoBorder',
				};
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.fill, fillName[fill] ?? 'none');
			}
			if (typedObj.getShrinkOnly?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.shrinkOnly, '1');
			if (typedObj.getAutoSize?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.autoSize, '1');
			if (typedObj.getUseResize?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.useResize, '1');
			const loaderColor = typedObj.getColor?.();
			if (loaderColor && !isDefaultWhiteColor(loaderColor)) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.color, loaderColor);
			if (typedObj.getFilter?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.filter, typedObj.getFilter?.());
			if (typedObj.getFilterData?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.filterData, typedObj.getFilterData?.());
			if (typedObj.getPlaying?.() === false) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.playing, 'false');
			const frame = typedObj.getFrame?.() ?? 0;
			if (frame !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.frame, String(frame));
			const fillMethod = typedObj.getFillMethod?.() ?? 0;
			if (fillMethod !== 0) {
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.fillMethod, formatFillMethod(fillMethod));
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.fillOrigin, String(typedObj.getFillOrigin?.() ?? 0));
				if (typedObj.getFillClockwise?.() === false) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.fillClockwise, 'false');
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.fillAmount, String(Math.round((typedObj.getFillAmount?.() ?? 0) * 100)));
			}
			if (typedObj.getClearOnPublish?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.clearOnPublish, 'true');
		}
		if (type === 'GMovieClip') {
			const [x, y] = [typedObj.getX?.() ?? 0, typedObj.getY?.() ?? 0];
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.xy, `${x},${y}`);
			const [w, h] = [typedObj.getWidth?.() ?? 0, typedObj.getHeight?.() ?? 0];
			if (w !== 0 || h !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.size, `${w},${h}`);
			if (typedObj.getGroup?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.group, typedObj.getGroup?.());
			const [pivotX, pivotY] = [typedObj.getPivotX?.() ?? 0, typedObj.getPivotY?.() ?? 0];
			if (pivotX !== 0 || pivotY !== 0) {
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.pivot, `${pivotX},${pivotY}`);
				if (typedObj.getPivotAsAnchor?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.anchor, 'true');
			}
			if ((typedObj.getRotation?.() ?? 0) !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.rotation, String(typedObj.getRotation?.() ?? 0));
			if ((typedObj.getAlpha?.() ?? 1) !== 1) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.alpha, formatDisplayAlpha(typedObj.getAlpha?.() ?? 1));
			if (typedObj.getVisible?.() === false) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.visible, 'false');
			if (typedObj.getGrayed?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.grayed, 'true');
			if (typedObj.getFileName?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.fileName, typedObj.getFileName?.());
			if (typedObj.getPackageId?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.pkg, typedObj.getPackageId?.());
			if (typedObj.getFilter?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.filter, typedObj.getFilter?.());
			if (typedObj.getFilterData?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.filterData, typedObj.getFilterData?.());
		}
		if (type === 'GTextField' || type === 'GRichTextField' || type === 'GTextInput') {
			const textNodeProtocol = type === 'GRichTextField'
				? PROJECT_XML_PROTOCOL.richText
				: type === 'GTextInput'
					? PROJECT_XML_PROTOCOL.textInput
					: PROJECT_XML_PROTOCOL.text;
			const [x, y] = [typedObj.getX?.() ?? 0, typedObj.getY?.() ?? 0];
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.xy, `${x},${y}`);
			const [w, h] = [typedObj.getWidth?.() ?? 0, typedObj.getHeight?.() ?? 0];
			if (w !== 0 || h !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.size, `${w},${h}`);
			const [pivotX, pivotY] = [typedObj.getPivotX?.() ?? 0, typedObj.getPivotY?.() ?? 0];
			if (pivotX !== 0 || pivotY !== 0) {
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.pivot, `${pivotX},${pivotY}`);
				if (typedObj.getPivotAsAnchor?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.anchor, 'true');
			}
			const restrictSize = [
				typedObj.getMinWidth?.() ?? 0,
				typedObj.getMaxWidth?.() ?? 0,
				typedObj.getMinHeight?.() ?? 0,
				typedObj.getMaxHeight?.() ?? 0,
			];
			if (restrictSize.some((value) => value !== 0)) {
				const restrictSpec = type === 'GRichTextField'
					? PROJECT_XML_PROTOCOL.richText.attrs.restrictSize
					: PROJECT_XML_PROTOCOL.text.attrs.restrictSize;
				writeXmlAttr(attrs, restrictSpec, restrictSize.join(','));
			}
			if (typedObj.getAutoClearText?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.autoClearText, 'true');
			if (type === 'GTextField') {
				const demoText = typedObj.getDemoText?.();
				if (demoText !== undefined && demoText !== '') writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.demoText, demoText);
				if (typedObj.getTemplateVarsEnabled?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.vars, 'true');
				const faceDilate = typedObj.getFaceDilate?.() ?? 0;
				if (faceDilate !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.faceDilate, String(faceDilate));
				const underlaySoftness = typedObj.getUnderlaySoftness?.() ?? 0;
				if (underlaySoftness !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.underlaySoftness, String(underlaySoftness));
			}
			if (type === 'GRichTextField') {
				const underlaySoftness = typedObj.getUnderlaySoftness?.() ?? 0;
				if (underlaySoftness !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.richText.attrs.underlaySoftness, String(underlaySoftness));
			}
			if (typedObj.getGroup?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.group, typedObj.getGroup?.());
			if ((typedObj.getRotation?.() ?? 0) !== 0) writeXmlAttr(attrs, textNodeProtocol.attrs.rotation, String(typedObj.getRotation?.() ?? 0));
			if ((typedObj.getAlpha?.() ?? 1) !== 1) writeXmlAttr(attrs, textNodeProtocol.attrs.alpha, formatDisplayAlpha(typedObj.getAlpha?.() ?? 1));
			if (typedObj.getVisible?.() === false) writeXmlAttr(attrs, textNodeProtocol.attrs.visible, 'false');
			if (typedObj.getTouchable?.() === false) writeXmlAttr(attrs, textNodeProtocol.attrs.touchable, 'false');
			if (typedObj.getGrayed?.()) writeXmlAttr(attrs, textNodeProtocol.attrs.grayed, 'true');
			if (typedObj.getCustomData?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.customData, typedObj.getCustomData?.());
		}
		if ((type === 'GList' || type === 'GTree') && typedObj.getGroup?.()) {
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.group, typedObj.getGroup?.());
		}
		if (type === 'GList' || type === 'GTree') {
			const [x, y] = [typedObj.getX?.() ?? 0, typedObj.getY?.() ?? 0];
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.xy, `${x},${y}`);
			const [w, h] = [typedObj.getWidth?.() ?? 0, typedObj.getHeight?.() ?? 0];
			if (w !== 0 || h !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.size, `${w},${h}`);
			const [pivotX, pivotY] = [typedObj.getPivotX?.() ?? 0, typedObj.getPivotY?.() ?? 0];
			if (pivotX !== 0 || pivotY !== 0) {
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.pivot, `${pivotX},${pivotY}`);
				if (typedObj.getPivotAsAnchor?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.anchor, 'true');
			}
			if (typedObj.getVisible?.() === false) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.visible, 'false');
		}
		if (type === 'GLoader3D') {
			const [x, y] = [typedObj.getX?.() ?? 0, typedObj.getY?.() ?? 0];
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.xy, `${x},${y}`);
			const [w, h] = [typedObj.getWidth?.() ?? 0, typedObj.getHeight?.() ?? 0];
			if (w !== 0 || h !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.size, `${w},${h}`);
			const [pivotX, pivotY] = [typedObj.getPivotX?.() ?? 0, typedObj.getPivotY?.() ?? 0];
			if (pivotX !== 0 || pivotY !== 0) {
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.pivot, `${pivotX},${pivotY}`);
				if (typedObj.getPivotAsAnchor?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.anchor, 'true');
			}
			if (typedObj.getVisible?.() === false) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.visible, 'false');
			const url = typedObj.getUrl?.();
			if (url) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.url, url);
			const align = typedObj.getAlign?.();
			if (align !== undefined && align !== 0) {
				const alignName: Record<number, string> = { 0: 'left', 1: 'center', 2: 'right' };
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.align, alignName[align] ?? 'left');
			}
			const vAlign = typedObj.getVAlign?.();
			if (vAlign !== undefined && vAlign !== 0) {
				const vAlignName: Record<number, string> = { 0: 'top', 1: 'middle', 2: 'bottom' };
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.vAlign, vAlignName[vAlign] ?? 'top');
			}
			const fill = typedObj.getFill?.();
			if (fill !== undefined) {
				const fillName: Record<number, string> = {
					0: 'none',
					1: 'scale',
					2: 'scaleMatchHeight',
					3: 'scaleMatchWidth',
					4: 'scaleFree',
					5: 'scaleNoBorder',
				};
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.fill, fillName[fill] ?? 'none');
			}
			if (typedObj.getShrinkOnly?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.shrinkOnly, '1');
			if (typedObj.getAutoSize?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.autoSize, '1');
			const animationName = typedObj.getAnimationName?.();
			if (animationName) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.animation, animationName);
			const skinName = typedObj.getSkinName?.();
			if (skinName) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.skinName, skinName);
			if (typedObj.getPlaying?.() === false) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.playing, 'false');
			const frame = typedObj.getFrame?.() ?? 0;
			if (frame !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.frame, String(frame));
			if (typedObj.getLoop?.() === false) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.loop, 'false');
			const loaderColor = typedObj.getColor?.();
			if (loaderColor) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.color, loaderColor);
		}
		if (type === 'GGroup' && typedObj.getVisible?.() === false) {
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.group.attrs.visible, 'false');
		}
		if ((type === 'GList' || type === 'GTree') && typedObj.getTouchable?.() === false) {
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.touchable, 'false');
		}
		if (type === 'GMovieClip') {
			if (typedObj.getPlaying?.() === false) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.playing, 'false');
			const frame = typedObj.getFrame?.() ?? 0;
			if (frame !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.frame, String(frame));
			const movieClipColor = typedObj.getColor?.();
			if (movieClipColor && !isDefaultWhiteColor(movieClipColor)) {
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.color, formatXmlColor(movieClipColor));
			}
		}
		if (type === 'GGroup') {
			const layout = typedObj.getLayout?.();
			if (layout !== undefined && layout !== 0) {
				const layoutName: Record<number, string> = { 0: 'none', 1: 'horizontal', 2: 'vertical' };
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.group.attrs.layout, layoutName[layout] ?? 'none');
			}
			const lineGap = typedObj.getLineGap?.() ?? 0;
			if (lineGap !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.group.attrs.lineGap, String(lineGap));
			const columnGap = typedObj.getColumnGap?.() ?? 0;
			if (columnGap !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.group.attrs.columnGap, String(columnGap));
			if (typedObj.getAdvanced?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.group.attrs.advanced, 'true');
			if (typedObj.getExcludeInvisibles?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.group.attrs.excludeInvisibles, 'true');
			if (typedObj.getAutoSizeDisabled?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.group.attrs.autoSizeDisabled, 'true');
			const mainGridIndex = typedObj.getMainGridIndex?.() ?? -1;
			if (mainGridIndex >= 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.group.attrs.mainGridIndex, String(mainGridIndex));
		}
		if (type === 'GList' || type === 'GTree') {
			const isTree = type === 'GTree';
			const layout = typedObj.getLayout?.();
			if (layout !== undefined && layout !== 0) {
				const layoutName: Record<number, string> = {
					1: 'row',
					2: 'flow_hz',
					3: 'flow_vt',
					4: 'pagination',
				};
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.layout, layoutName[layout] ?? 'row');
			}
			const lineGap = typedObj.getLineGap?.() ?? 0;
			if (lineGap !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.lineGap, String(lineGap));
			const columnGap = typedObj.getColumnGap?.() ?? 0;
			if (columnGap !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.columnGap, String(columnGap));
			const align = typedObj.getAlign?.();
			if (align !== undefined && align !== 0) {
				const alignName: Record<number, string> = { 0: 'left', 1: 'center', 2: 'right' };
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.align, alignName[align] ?? 'left');
			}
			const vAlign = typedObj.getVAlign?.();
			if (vAlign !== undefined && vAlign !== 0) {
				const vAlignName: Record<number, string> = { 0: 'top', 1: 'middle', 2: 'bottom' };
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.vAlign, vAlignName[vAlign] ?? 'top');
			}
			const lineCount = typedObj.getLineCount?.() ?? 0;
			const columnCount = typedObj.getColumnCount?.() ?? 0;
			if ((layout === 2 || layout === 4) && columnCount !== 0) {
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.lineItemCount, String(columnCount));
			} else if (layout === 3 && lineCount !== 0) {
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.lineItemCount, String(lineCount));
			}
			if (layout === 4 && lineCount !== 0) {
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.lineItemCount2, String(lineCount));
			}
			if (typedObj.getAutoResizeItem?.() === false) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.autoResizeItem, 'false');
			const selectionMode = typedObj.getSelectionMode?.();
			if (selectionMode !== undefined && selectionMode !== 0) {
				const selectionName: Record<number, string> = {
					0: 'single',
					1: 'multiple',
					2: 'multipleSingleClick',
					3: 'none',
				};
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.selectionMode, selectionName[selectionMode] ?? 'single');
			}
			const defaultItem = typedObj.getDefaultItem?.();
			if (defaultItem) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.defaultItem, defaultItem);
			const selectionController = typedObj.getSelectionController?.();
			if (selectionController) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.selectionController, selectionController);
			if (isTree) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.treeView, 'true');
			if (isTree) {
				const indent = typedObj.getIndent?.() ?? 0;
				if (indent !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.indent, String(indent));
				const clickToExpand = typedObj.getClickToExpand?.() ?? 0;
				if (clickToExpand !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.clickToExpand, String(clickToExpand));
			}
			const overflow = typedObj.getOverflow?.() ?? 0;
			if (overflow !== 0) {
				const overflowName: Record<number, string> = { 0: 'visible', 1: 'hidden', 2: 'scroll' };
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.overflow, overflowName[overflow] ?? 'visible');
			}
			const scrollType = typedObj.getScrollType?.();
			if (scrollType !== undefined && scrollType !== 1) {
				const scrollTypeName: Record<number, string> = { 0: 'horizontal', 1: 'vertical', 2: 'both' };
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.scroll, scrollTypeName[scrollType] ?? 'vertical');
			}
			const scrollBarFlags = typedObj.getScrollBarFlags?.() ?? 0;
			if (scrollBarFlags !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.scrollBarFlags, String(scrollBarFlags));
			const vtScrollBarRes = typedObj.getVtScrollBarRes?.() ?? '';
			const hzScrollBarRes = typedObj.getHzScrollBarRes?.() ?? '';
			if (vtScrollBarRes || hzScrollBarRes) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.scrollBarRes, `${vtScrollBarRes},${hzScrollBarRes}`);
			const headerRes = typedObj.getHeaderRes?.() ?? '';
			const footerRes = typedObj.getFooterRes?.() ?? '';
			if (headerRes || footerRes) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.ptrRes, `${headerRes},${footerRes}`);
			const margin = typedObj.getMargin?.();
			if (hasNonZeroInsets(margin)) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.margin, formatInsets(margin!));
			const clipSoftness = typedObj.getClipSoftness?.();
			if (clipSoftness && ((clipSoftness.x ?? 0) !== 0 || (clipSoftness.y ?? 0) !== 0)) {
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.clipSoftness, `${clipSoftness.x ?? 0},${clipSoftness.y ?? 0}`);
			}
			const listItems = typedObj.getListItems?.() ?? [];
			const listItemChildName = getProtocolChildName(PROJECT_XML_PROTOCOL.list, 'item');
			if (listItems.length > 0 && listItemChildName) {
			attrs[listItemChildName] = listItems.map((item) => serializeListItemXmlNode(item, { forceLevel: isTree }));
			}
		}
		if (type === 'GTextField' || type === 'GRichTextField' || type === 'GTextInput') {
			const text = typedObj.getText?.();
			if (text !== undefined && text !== null) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.text, text);
			const font = typedObj.getFont?.();
			if (font) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.font, font);
			const fontSize = typedObj.getFontSize?.();
			if (fontSize) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.fontSize, String(fontSize));
			const color = typedObj.getColor?.();
			if (color && !isDefaultBlackColor(color)) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.color, formatXmlColor(color));
			const align = typedObj.getAlign?.();
			if (align !== undefined && align !== 0) {
				const alignName: Record<number, string> = { 0: 'left', 1: 'center', 2: 'right' };
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.align, alignName[align] ?? 'left');
			}
			const vAlign = typedObj.getVAlign?.();
			if (vAlign !== undefined && vAlign !== 0) {
				const vAlignName: Record<number, string> = { 0: 'top', 1: 'middle', 2: 'bottom' };
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.vAlign, vAlignName[vAlign] ?? 'top');
			}
			const autoSize = typedObj.getAutoSize?.();
			if (typeof autoSize === 'number' && autoSize !== 1) {
				const autoSizeName: Record<number, string> = { 0: 'none', 1: 'both', 2: 'height', 3: 'shrink', 4: 'ellipsis' };
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.autoSize, autoSizeName[autoSize] ?? 'both');
			}
			if (typedObj.getSingleLine?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.singleLine, 'true');
			if (typedObj.getUbbEnabled?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.ubb, 'true');
			const leading = typedObj.getLeading?.() ?? 3;
			if (leading !== 3) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.leading, String(leading));
			const letterSpacing = typedObj.getLetterSpacing?.() ?? 0;
			if (letterSpacing !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.letterSpacing, String(letterSpacing));
			if (typedObj.getUnderline?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.underline, 'true');
			if (typedObj.getItalic?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.italic, 'true');
			if (typedObj.getBold?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.bold, 'true');
			if (typedObj.getStrikethrough?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.strikethrough, '1');
			const strokeColor = typedObj.getStrokeColor?.();
			if (strokeColor) {
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.strokeColor, formatXmlColor(strokeColor));
				const strokeSize = typedObj.getStrokeSize?.() ?? 1;
				if (strokeSize !== 1) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.strokeSize, String(strokeSize));
			}
			const shadowColor = typedObj.getShadowColor?.();
			if (shadowColor) {
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.shadowColor, formatXmlColor(shadowColor));
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.shadowOffset, `${typedObj.getShadowOffsetX?.() ?? 1},${typedObj.getShadowOffsetY?.() ?? 1}`);
			}
			if (type === 'GTextInput') {
				const promptText = typedObj.getPromptText?.();
				if (promptText) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.prompt, promptText);
				const maxLength = typedObj.getMaxLength?.() ?? 0;
				if (maxLength !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.maxLength, String(maxLength));
				const restrict = typedObj.getRestrict?.();
				if (restrict) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.restrict, restrict);
				if (typedObj.getPassword?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.password, 'true');
				const keyboardType = typedObj.getKeyboardType?.() ?? 0;
				if (keyboardType !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.keyboardType, String(keyboardType));
			}
		}
		if (type === 'GComponent') {
			const instanceExtType = typedObj.getInstanceExtType?.() ?? '';
			if (instanceExtType) {
				const extProtocol = EXTENSION_PROTOCOL_MAP[instanceExtType as keyof typeof EXTENSION_PROTOCOL_MAP];
				const extSpecs = extProtocol.attrs as Record<string, { canonical: string }>;
				const extAttrs: Record<string, unknown> = {};
				if (typedObj.getInstanceTitle?.() && extSpecs.title) writeXmlAttr(extAttrs, extSpecs.title, typedObj.getInstanceTitle?.());
				if (typedObj.getInstanceSelectedTitle?.() && extSpecs.selectedTitle) writeXmlAttr(extAttrs, extSpecs.selectedTitle, typedObj.getInstanceSelectedTitle?.());
				if (typedObj.getInstanceIcon?.() && extSpecs.icon) writeXmlAttr(extAttrs, extSpecs.icon, typedObj.getInstanceIcon?.());
				if (typedObj.getInstanceSelectedIcon?.() && extSpecs.selectedIcon) writeXmlAttr(extAttrs, extSpecs.selectedIcon, typedObj.getInstanceSelectedIcon?.());
				if (typedObj.getInstanceTitleColor?.() && extSpecs.titleColor) writeXmlAttr(extAttrs, extSpecs.titleColor, typedObj.getInstanceTitleColor?.());
				if ((typedObj.getInstanceTitleFontSize?.() ?? 0) > 0 && extSpecs.titleFontSize) writeXmlAttr(extAttrs, extSpecs.titleFontSize, String(typedObj.getInstanceTitleFontSize?.() ?? 0));
				if (typedObj.getInstanceController?.() && extSpecs.controller) writeXmlAttr(extAttrs, extSpecs.controller, typedObj.getInstanceController?.());
				if (typedObj.getInstancePage?.() && extSpecs.page) writeXmlAttr(extAttrs, extSpecs.page, typedObj.getInstancePage?.());
				if (typedObj.getInstanceChecked?.() && extSpecs.checked) writeXmlAttr(extAttrs, extSpecs.checked, '1');
				if (typedObj.getInstanceSound?.() && extSpecs.sound) writeXmlAttr(extAttrs, extSpecs.sound, typedObj.getInstanceSound?.());
				if ((typedObj.getInstanceSoundVolumeScale?.() ?? 1) !== 1 && extSpecs.soundVolumeScale) {
					writeXmlAttr(extAttrs, extSpecs.soundVolumeScale, String(typedObj.getInstanceSoundVolumeScale?.() ?? 1));
				}
				if (typedObj.getInstancePromptText?.() && extSpecs.prompt) writeXmlAttr(extAttrs, extSpecs.prompt, typedObj.getInstancePromptText?.());
				if (typedObj.getInstanceSelectionController?.() && extSpecs.selectionController) writeXmlAttr(extAttrs, extSpecs.selectionController, typedObj.getInstanceSelectionController?.());
				if ((typedObj.getInstanceVisibleItemCount?.() ?? 0) > 0 && extSpecs.visibleItemCount) writeXmlAttr(extAttrs, extSpecs.visibleItemCount, String(typedObj.getInstanceVisibleItemCount?.() ?? 0));
				const instanceValue = typedObj.getInstanceValue?.() ?? 0;
				const instanceMax = typedObj.getInstanceMax?.() ?? 0;
				const instanceMin = typedObj.getInstanceMin?.() ?? 0;
				if (instanceValue !== 0 && extSpecs.value) writeXmlAttr(extAttrs, extSpecs.value, String(instanceValue));
				if (instanceMax !== 0 && extSpecs.max) writeXmlAttr(extAttrs, extSpecs.max, String(instanceMax));
				if (instanceMin !== 0 && extSpecs.min) writeXmlAttr(extAttrs, extSpecs.min, String(instanceMin));
				const comboItems = typedObj.getInstanceComboItems?.() ?? [];
				const comboBoxItemChildName = getProtocolChildName(PROJECT_XML_PROTOCOL.comboBoxExtension, 'item');
				if (comboItems.length > 0 && comboBoxItemChildName) {
					extAttrs[comboBoxItemChildName] = comboItems.map((item) => serializeComboBoxItemXmlNode(item));
				}
				extensionChildName = getProtocolChildName(PROJECT_XML_PROTOCOL.componentInstance, instanceExtType) ?? undefined;
				if (extensionChildName) {
					extensionValue = Object.keys(extAttrs).length > 0 ? extAttrs : '';
				}
			}
		}

		// Gear child elements
		const objectProtocol = DISPLAY_OBJECT_PROTOCOL_BY_TYPE[type] ?? PROJECT_XML_PROTOCOL.componentInstance;
		writeCommonDisplayState(attrs, typedObj, objectProtocol);
		const gearChildNameSet = getProtocolGearChildNameSet(objectProtocol);
		for (const gear of obj.listGears()) {
			const gearTag = GEAR_TAG[gear.getGearType()];
			if (!gearTag || !gearChildNameSet.has(gearTag)) continue;
			attrs[gearTag] = [serializeGear(gear, obj.propertyType, obj.getName?.())];
		}

		// Relation child elements
		const relationChildName = getProtocolChildName(objectProtocol, 'relation');
		const relations = obj.getRelations();
		if (relations.length > 0) {
			// Group by target
			const byTarget = new Map<string, string[]>();
			for (const rel of relations) {
				const name = RELATION_TYPE_NAME[rel.type] ?? '';
				if (!name) continue;
				const pair = rel.usePercent ? name + '%' : name;
				if (!byTarget.has(rel.target)) byTarget.set(rel.target, []);
				byTarget.get(rel.target)!.push(pair);
			}
			const relElements = Array.from(byTarget.entries()).map(([target, pairs]) => ({
				...(() => {
					const relationAttrs: Record<string, unknown> = {};
					writeXmlAttr(relationAttrs, PROJECT_XML_PROTOCOL.relation.attrs.target, target);
					writeXmlAttr(relationAttrs, PROJECT_XML_PROTOCOL.relation.attrs.sidePair, pairs.join(','));
					return relationAttrs;
				})(),
			}));
			if (relElements.length > 0 && relationChildName) attrs[relationChildName] = relElements;
		}
		if (extensionChildName && extensionValue !== undefined) {
			attrs[extensionChildName] = extensionValue;
		}

		return attrs;
	}

function serializeGear(gear: Gear, ownerType?: string, ownerName?: string | null): Record<string, unknown> {
		const ctrl = gear.getController();
		const attrs: Record<string, unknown> = {};
		if (ctrl) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.gear.attrs.controller, ctrl.getName());
		if (gear.getPages()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.gear.attrs.pages, gear.getPages());
		if (gear.getValues()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.gear.attrs.values, normalizeGearXmlValue(gear.getGearType(), gear.getValues(), ownerType, ownerName ?? undefined, gear));
		if (gear.getDefaultValue() !== null) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.gear.attrs.default, normalizeGearXmlValue(gear.getGearType(), gear.getDefaultValue(), ownerType, ownerName ?? undefined, gear));
		if (gear.getTween()) {
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.gear.attrs.tween, 'true');
			const hasDefaultTweenConfig = gear.getEaseType() === 5 && Math.abs(gear.getTweenDuration() - 0.3) < 0.000001;
			if (!hasDefaultTweenConfig) {
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.gear.attrs.ease, stringifyEaseType(gear.getEaseType()));
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.gear.attrs.duration, String(gear.getTweenDuration()));
			}
		}
		if (gear.getPositionsInPercent?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.gear.attrs.positionsInPercent, 'true');
		if (gear.getCondition()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.gear.attrs.condition, gear.getCondition());
		return attrs;
	}
