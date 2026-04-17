import { XMLBuilder } from 'fast-xml-parser';
import type { Document } from '../document.js';
import type { Package } from '../properties/package.js';
import type { Component } from '../properties/component.js';
import type { GObject } from '../properties/g-object.js';
import type { Controller } from '../properties/controller.js';
import type { Transition } from '../properties/transition.js';
import type { Gear } from '../properties/gear.js';
import { ControllerActionType, GearType, TransitionActionType } from '../constants.js';
import type { FileSystem } from './project-reader.js';
import { PROJECT_XML_PROTOCOL, writeXmlAttr, type XmlNodeProtocol } from './project-xml-protocol.js';

const builder = new XMLBuilder({
	ignoreAttributes: false,
	attributeNamePrefix: '@_',
	format: true,
	indentBy: '  ',
	suppressBooleanAttributes: false,
	suppressEmptyNode: true,
	suppressUnpairedNode: false,
	unpairedTags: [],
	stopNodes: ['component.displayList'],
});

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

const EXTENSION_PROTOCOL_MAP = {
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
		0: 'Linear',
		1: 'Sine.In',
		2: 'Sine.Out',
		3: 'Sine.InOut',
		4: 'Quad.In',
		5: 'Quad.Out',
		6: 'Quad.InOut',
		7: 'Cubic.In',
		8: 'Cubic.Out',
		9: 'Cubic.InOut',
		10: 'Quart.In',
		11: 'Quart.Out',
		12: 'Quart.InOut',
		13: 'Quint.In',
		14: 'Quint.Out',
		15: 'Quint.InOut',
		16: 'Expo.In',
		17: 'Expo.Out',
		18: 'Expo.InOut',
		19: 'Circ.In',
		20: 'Circ.Out',
		21: 'Circ.InOut',
		22: 'Elastic.In',
		23: 'Elastic.Out',
		24: 'Elastic.InOut',
		25: 'Back.In',
		26: 'Back.Out',
		27: 'Back.InOut',
		28: 'Bounce.In',
		29: 'Bounce.Out',
		30: 'Bounce.InOut',
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

function formatButtonDownEffectValue(value: number): string {
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

function shouldWritePackageImageSize(resource: WritableImageResource): boolean {
	return resource.getExtras?.()?._suppressPackageSize !== true;
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

function compareResourceIdSequence(a: string, b: string): number {
	const left = a.toLowerCase();
	const right = b.toLowerCase();
	if (left.length !== right.length) return left.length - right.length;
	return left.localeCompare(right);
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

function formatTransitionFrameValue(value: number): string {
	const rounded = Math.round(value);
	if (almostEqual(value, rounded, 0.0001)) return String(rounded);
	return formatTrimmedFixed(value, 3);
}

function formatTransitionValuePart(actionType: number, raw: string): string {
	if (!raw || raw === '-' || raw === 'true' || raw === 'false' || raw === 'p' || raw === 's') {
		return raw;
	}
	const numeric = Number(raw);
	if (!Number.isFinite(numeric)) return raw;
	switch (actionType) {
		case TransitionActionType.Alpha:
		case TransitionActionType.ColorFilter:
			return numeric.toFixed(2);
		default:
			return formatTrimmedFixed(numeric);
	}
}

function stringifyTransitionValue(actionType: number, values: unknown[]): string {
	const parts = values.map((value) => String(value));
	if (actionType === 9) {
		if (parts.length <= 1) return parts[0] ?? '';
		if (parts[1] === '100') return parts[0] ?? '';
	}
	if (actionType === 10) {
		if (parts.length <= 1) return parts[0] ?? '';
		if (parts[1] === '1') return parts[0] ?? '';
	}
	return parts.map((part) => formatTransitionValuePart(actionType, part)).join(',');
}

type PackageResource = ReturnType<Package['listResources']>[number];

type WritableResource = PackageResource & {
	getId?(): string;
	getPath?(): string;
	getBranch?(): string;
	getBranchItemIds?(): string[];
	getExported?(): boolean;
	getExtras?(): Record<string, unknown>;
};

type WritableImageResource = WritableResource & {
	getFileName?(): string;
	getWidth?(): number;
	getHeight?(): number;
	getTextureSetMode?(): string;
	getQualityOption?(): string;
	getScaleOption?(): number;
	getScale9Grid?(): [number, number, number, number] | null;
	getTileGridIndice?(): number;
	getSmoothing?(): boolean;
	getDuplicatePadding?(): boolean;
	getExtras?(): Record<string, unknown>;
};

type WritableFontResource = WritableResource & {
	getFileName?(): string;
	getTextureId?(): string;
	getRenderMode?(): string;
	getSamplePointSize?(): number;
};

type WritableMovieClipResource = WritableResource & {
	getFileName?(): string;
};

type WritableFileResource = WritableResource & {
	getFile?(): string;
};

type WritableSkeletonResource = WritableFileResource & {
	getWidth?(): number;
	getHeight?(): number;
	getRequireIds?(): string[];
	getAtlasNames?(): string[];
	getAnchorX?(): number;
	getAnchorY?(): number;
};

type WritableComponent = Component & {
	getMinWidth?(): number;
	getMaxWidth?(): number;
	getMinHeight?(): number;
	getMaxHeight?(): number;
	getPivotX?(): number;
	getPivotY?(): number;
	getPivotAsAnchor?(): boolean;
	getOverflow?(): number;
	getMargin?(): { top?: number; bottom?: number; left?: number; right?: number };
	getClipSoftness?(): { x?: number; y?: number };
	getOpaque?(): boolean;
	getMask?(): string;
	getReversedMask?(): boolean;
	getHitTest?(): string;
	getCustomData?(): string;
	getScrollType?(): number;
	getScrollBarDisplay?(): number;
	getScrollBarFlags?(): number;
	getScrollBarMargin?(): { top?: number; bottom?: number; left?: number; right?: number };
	getVtScrollBarRes?(): string;
	getHzScrollBarRes?(): string;
	getHeaderRes?(): string;
	getFooterRes?(): string;
	getBgColor?(): string;
	getBgColorEnabled?(): boolean;
	getDesignImageAlpha?(): number;
	getDesignImageLayer?(): number;
	getDesignImageOffsetX?(): number;
	getDesignImageOffsetY?(): number;
	getIdNum?(): number;
	getInitName?(): string;
	getRemark?(): string;
	getExtensionType?(): string;
	getButtonMode?(): number;
	getSound?(): string;
	getSoundVolumeScale?(): number;
	getDownEffect?(): number;
	getDownEffectValue?(): number;
	getDropdown?(): string;
	getTitleType?(): number;
	getReverse?(): boolean;
	getWholeNumbers?(): boolean;
	getChangeOnClick?(): boolean;
	getFixedGripSize?(): boolean;
};

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

type WritableControllerAction = ReturnType<Controller['listActions']>[number] & {
	getFromPage?(): string[];
	getToPage?(): string[];
	getTransitionName?(): string;
	getPlayTimes?(): number;
	getDelay?(): number;
	getStopOnExit?(): boolean;
	getObjectId?(): string;
	getControllerName?(): string;
	getTargetPage?(): string;
};

function hasNonZeroInsets(value: { top?: number; bottom?: number; left?: number; right?: number } | null | undefined): boolean {
	return !!value && !!(value.top || value.bottom || value.left || value.right);
}

function formatInsets(value: { top?: number; bottom?: number; left?: number; right?: number }): string {
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

function formatButtonMode(mode: number): string {
	const map: Record<number, string> = {
		0: 'Common',
		1: 'Check',
		2: 'Radio',
	};
	return map[mode] ?? 'Common';
}

function formatTitleType(titleType: number): string {
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

function getProtocolChildName(protocol: XmlNodeProtocol, childName: string): string | null {
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
export class ProjectWriter {
	private readonly _fs: FileSystem;

	constructor(fs: FileSystem) {
		this._fs = fs;
	}

	async write(doc: Document, projectPath: string): Promise<void> {
		const fs = this._fs;
		const root = doc.getRoot();
		const basePath = fs.dirname(projectPath);

		// 1. Write .fairy file
		const fairyXml = `<?xml version="1.0" encoding="utf-8"?>\n`
			+ `<projectDescription id="${root.getProjectId()}" type="${this._projectTypeName(root.getProjectType())}" version="${root.getVersion() || '3.0'}"/>\n`;
		await fs.writeFile(projectPath, fairyXml);

		// 2. Write settings
		const settings = root.getSettings?.() ?? {};
		const settingsPath = fs.join(basePath, 'settings');
		await fs.mkdir(settingsPath);
		const settingFiles: Record<string, string> = {
			'Publish.json': 'publish',
			'Common.json': 'common',
			'Adaptation.json': 'adaptation',
		};
		for (const [fileName, key] of Object.entries(settingFiles)) {
			if (settings[key]) {
				await fs.writeFile(
					fs.join(settingsPath, fileName),
					JSON.stringify(settings[key], null, '\t'),
				);
			}
		}

		// 3. Write packages
		const assetsPath = fs.join(basePath, 'assets');
		await fs.mkdir(assetsPath);
		for (const pkg of root.listPackages()) {
			await this._writePackage(doc, pkg, assetsPath);
		}
	}

	private async _writePackage(_doc: Document, pkg: Package, assetsPath: string): Promise<void> {
		const fs = this._fs;
		const pkgDir = fs.join(assetsPath, pkg.getName());
		await fs.mkdir(pkgDir);
		const basePath = fs.dirname(assetsPath);
		const resourcesByBranch = new Map<string, PackageResource[]>();
		for (const res of pkg.listResources()) {
			const branchName = (res as WritableResource).getBranch?.() ?? '';
			const bucket = resourcesByBranch.get(branchName) ?? [];
			bucket.push(res);
			resourcesByBranch.set(branchName, bucket);
		}

		// Build package.xml object
		const mainResources = resourcesByBranch.get('') ?? [];
		const publishName = pkg.getPublishName() || pkg.getName();
		const publishPath = pkg.getPublishPath();
		const publishBranchPath = pkg.getPublishBranchPath();
		const publishPackageCount = pkg.getPublishPackageCount();
		const genCode = pkg.getGenCode();
		const codePath = pkg.getCodePath();
		const packageDescriptionAttrs: Record<string, unknown> = {};
		writeXmlAttr(packageDescriptionAttrs, PROJECT_XML_PROTOCOL.packageDescription.attrs.id, pkg.getId());
		const compressPNG = pkg.getCompressPNG();
		if (compressPNG !== null) {
			writeXmlAttr(packageDescriptionAttrs, PROJECT_XML_PROTOCOL.packageDescription.attrs.compressPNG, compressPNG ? 'true' : 'false');
		}
		const jpegQuality = pkg.getJpegQuality();
		if (jpegQuality !== null) {
			writeXmlAttr(packageDescriptionAttrs, PROJECT_XML_PROTOCOL.packageDescription.attrs.jpegQuality, String(jpegQuality));
		}
		const publishAttrs: Record<string, unknown> = {};
		writeXmlAttr(publishAttrs, PROJECT_XML_PROTOCOL.packagePublish.attrs.name, publishName);
		writeXmlAttr(
			publishAttrs,
			PROJECT_XML_PROTOCOL.packagePublish.attrs.path,
			publishPath || undefined,
		);
		writeXmlAttr(
			publishAttrs,
			PROJECT_XML_PROTOCOL.packagePublish.attrs.branchPath,
			publishBranchPath || undefined,
		);
		writeXmlAttr(
			publishAttrs,
			PROJECT_XML_PROTOCOL.packagePublish.attrs.packageCount,
			publishPackageCount > 0 ? publishPackageCount : undefined,
		);
		writeXmlAttr(
			publishAttrs,
			PROJECT_XML_PROTOCOL.packagePublish.attrs.genCode,
			genCode ? 'true' : undefined,
		);
		writeXmlAttr(
			publishAttrs,
			PROJECT_XML_PROTOCOL.packagePublish.attrs.codePath,
			codePath || undefined,
		);
		const publishAtlases = pkg.listAtlases().map((atlas) => {
			const attrs: Record<string, unknown> = {};
			const index = atlas.getIndex?.() ?? 0;
			writeXmlAttr(
				attrs,
				PROJECT_XML_PROTOCOL.packagePublishAtlas.attrs.name,
				index === 0 ? 'Default' : atlas.getName(),
			);
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packagePublishAtlas.attrs.index, String(index));
			return attrs;
		});
		if (publishAtlases.length > 0) {
			publishAttrs.atlas = publishAtlases;
		}
		await fs.writeFile(
			fs.join(pkgDir, 'package.xml'),
			this._renderPackageDescriptionXml(packageDescriptionAttrs, mainResources, publishAttrs),
		);

		// Write main-branch component XML files
		for (const comp of mainResources.filter((resource): resource is Component => resource.propertyType === 'Component')) {
			await this._writeComponent(comp, pkgDir);
		}

		for (const [branchName, branchResources] of resourcesByBranch) {
			if (!branchName) continue;
			const branchPkgDir = fs.join(basePath, `assets_${branchName}`, pkg.getName());
			await fs.mkdir(branchPkgDir);
			await fs.writeFile(
				fs.join(branchPkgDir, 'package_branch.xml'),
				this._renderBranchDescriptionXml(branchResources),
			);

			for (const comp of branchResources.filter((resource): resource is Component => resource.propertyType === 'Component')) {
				await this._writeComponent(comp, branchPkgDir);
			}
		}
	}

	private _renderPackageDescriptionXml(
		packageDescriptionAttrs: Record<string, unknown>,
		resources: PackageResource[],
		publishAttrs: Record<string, unknown>,
	): string {
		const publishNodeAttrs = Object.fromEntries(
			Object.entries(publishAttrs).filter(([key]) => key !== 'atlas'),
		);
		const lines = [
			'<?xml version="1.0" encoding="utf-8"?>',
			`<packageDescription${renderXmlAttrs(packageDescriptionAttrs)}>`,
			'  <resources>',
			...this._renderPackageResourceLines(resources, '    '),
			'  </resources>',
			`  <publish${renderXmlAttrs(publishNodeAttrs)}>`,
		];
		const publishAtlases = Array.isArray(publishAttrs.atlas) ? publishAttrs.atlas as Record<string, unknown>[] : [];
		for (const atlasAttrs of publishAtlases) {
			lines.push(`    <atlas${renderXmlAttrs(atlasAttrs)}/>`);
		}
		lines.push('  </publish>');
		lines.push('</packageDescription>');
		return `${lines.join('\n')}\n`;
	}

	private _renderBranchDescriptionXml(resources: PackageResource[]): string {
		const lines = [
			'<?xml version="1.0" encoding="utf-8"?>',
			'<branchDescription>',
			'  <resources>',
			...this._renderPackageResourceLines(resources, '    '),
			'  </resources>',
			'</branchDescription>',
		];
		return `${lines.join('\n')}\n`;
	}

	private _renderPackageResourceLines(resources: PackageResource[], indent: string): string[] {
		return this._orderedPackageResources(resources)
			.map((resource) => {
				const serialized = this._serializePackageResourceEntry(resource);
				if (!serialized) return null;
				return `${indent}<${serialized.tagName}${renderXmlAttrs(serialized.attrs)}/>`;
			})
			.filter((line): line is string => !!line);
	}

	private _orderedPackageResources(resources: PackageResource[]): PackageResource[] {
		const original = [...resources].sort((a, b) => {
			const aId = (a as WritableResource).getId?.() ?? '';
			const bId = (b as WritableResource).getId?.() ?? '';
			return compareResourceIdSequence(aId, bId);
		});
		const syntheticAfter = new Map<string, Array<{ resource: PackageResource; weight: number }>>();
		const trailing: Array<{ resource: PackageResource; weight: number }> = [];

		for (const resource of original) {
			const extras = (resource as WritableResource).getExtras?.() ?? {};
			const afterId = typeof extras._packageOrderAfterId === 'string' ? extras._packageOrderAfterId : '';
			const weight = typeof extras._packageOrderWeight === 'number' ? extras._packageOrderWeight : 0;
			if (afterId) {
				const bucket = syntheticAfter.get(afterId) ?? [];
				bucket.push({ resource, weight });
				syntheticAfter.set(afterId, bucket);
				continue;
			}
			if (extras._syntheticFontGlyph === true || extras._syntheticFontTexture === true) {
				trailing.push({ resource, weight });
			}
		}

		const result: PackageResource[] = [];
		for (const resource of original) {
			const extras = (resource as WritableResource).getExtras?.() ?? {};
			if (extras._packageOrderAfterId || extras._syntheticFontGlyph === true || extras._syntheticFontTexture === true) {
				continue;
			}
			result.push(resource);
			const id = (resource as WritableResource).getId?.() ?? '';
			const bucket = syntheticAfter.get(id) ?? [];
			bucket.sort((a, b) =>
				a.weight - b.weight
				|| compareResourceIdSequence((a.resource as WritableResource).getId?.() ?? '', (b.resource as WritableResource).getId?.() ?? ''),
			);
			for (const entry of bucket) {
				result.push(entry.resource);
			}
		}

		trailing.sort((a, b) =>
			a.weight - b.weight
			|| compareResourceIdSequence((a.resource as WritableResource).getId?.() ?? '', (b.resource as WritableResource).getId?.() ?? ''),
		);
		for (const entry of trailing) {
			result.push(entry.resource);
		}

		return result;
	}

	private _serializePackageResourceEntry(resource: PackageResource): { tagName: string; attrs: Record<string, unknown> } | null {
		const serialized = this._serializePackageResources([resource]);
		const [tagName, entries] = Object.entries(serialized)[0] ?? [];
		if (!tagName || !entries || entries.length === 0) return null;
		return { tagName, attrs: entries[0] as Record<string, unknown> };
	}

	private _serializePackageResources(packageResources: PackageResource[]): Record<string, unknown[]> {
		const resources: Record<string, unknown[]> = {};

		for (const res of packageResources) {
			const tagName = this._resourceTag(res.propertyType as string);
			if (!tagName) continue;

			const typedRes = res as WritableResource;
			const attrs: Record<string, unknown> = {
			};
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageResource.attrs.id, typedRes.getId?.() ?? '');
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageResource.attrs.name, this._resourceFileName(res));
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageResource.attrs.path, typedRes.getPath?.() ?? '/');
			if (typedRes.getExported?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageResource.attrs.exported, 'true');

			// Image-specific
			if (res.propertyType === 'ImageResource') {
				const imgRes = res as WritableImageResource;
				const textureSetMode = imgRes.getTextureSetMode?.() ?? '';
				if (textureSetMode) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.atlas, textureSetMode);
				const scaleOpt = imgRes.getScaleOption?.() ?? 0;
				if (scaleOpt === 1) {
					writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.scale, '9grid');
					const g = imgRes.getScale9Grid?.();
					if (g) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.scale9grid, `${g[0]},${g[1]},${g[2]},${g[3]}`);
				} else if (scaleOpt === 2) {
					writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.scale, 'tile');
				}
				if (shouldWritePackageImageSize(imgRes)) {
					const width = imgRes.getWidth?.() ?? 0;
					if (width !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.width, String(width));
					const height = imgRes.getHeight?.() ?? 0;
					if (height !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.height, String(height));
				}
				const gridTile = imgRes.getTileGridIndice?.() ?? 0;
				if (gridTile !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.gridTile, String(gridTile));
				const qualityOption = imgRes.getQualityOption?.() ?? '';
				if (qualityOption) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.qualityOption, qualityOption);
				if (imgRes.getDuplicatePadding?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.duplicatePadding, 'true');
				if (imgRes.getSmoothing?.() === false) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageImageResource.attrs.smoothing, 'false');
			}

			// Font-specific: texture reference
			if (res.propertyType === 'FontResource') {
				const fontRes = res as WritableFontResource;
				const texture = fontRes.getTextureId?.() ?? '';
				if (texture) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageFontResource.attrs.texture, texture);
				const renderMode = fontRes.getRenderMode?.() ?? '';
				if (renderMode) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageFontResource.attrs.renderMode, renderMode);
				const samplePointSize = fontRes.getSamplePointSize?.() ?? 0;
				if (samplePointSize !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageFontResource.attrs.samplePointSize, String(samplePointSize));
			}

			if (res.propertyType === 'SpineResource' || res.propertyType === 'DragonBonesResource') {
				const skeletonRes = res as WritableSkeletonResource;
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageSkeletonResource.attrs.width, String(skeletonRes.getWidth?.() ?? 0));
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageSkeletonResource.attrs.height, String(skeletonRes.getHeight?.() ?? 0));
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageSkeletonResource.attrs.require, (skeletonRes.getRequireIds?.() ?? []).join(',') || undefined);
				writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.packageSkeletonResource.attrs.atlasNames, (skeletonRes.getAtlasNames?.() ?? []).join(','));
				writeXmlAttr(
					attrs,
					PROJECT_XML_PROTOCOL.packageSkeletonResource.attrs.anchor,
					`${skeletonRes.getAnchorX?.() ?? 0},${skeletonRes.getAnchorY?.() ?? 0}`,
				);
			}

			if (!resources[tagName]) resources[tagName] = [];
			(resources[tagName] as Record<string, unknown>[]).push(attrs);
		}

		return resources;
	}

	private async _writeComponent(comp: Component, pkgDir: string): Promise<void> {
		const fs = this._fs;
		const typedComp = comp as WritableComponent;
		const path = typedComp.getPath?.() ?? '/';
		const name = comp.getName() + '.xml';

		// Ensure subdirectory exists
		const subDir = path.replace(/^\//, '').replace(/\/$/, '');
		const fileDir = subDir ? fs.join(pkgDir, subDir) : pkgDir;
		if (subDir) await fs.mkdir(fileDir);

		const compAttrs: Record<string, unknown> = {};
		const [w, h] = [typedComp.getWidth?.() ?? 0, typedComp.getHeight?.() ?? 0];
		if (w || h) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.size, `${w},${h}`);
		const [pivotX, pivotY] = [typedComp.getPivotX?.() ?? 0, typedComp.getPivotY?.() ?? 0];
		if (pivotX !== 0 || pivotY !== 0) {
			writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.pivot, `${pivotX},${pivotY}`);
			if (typedComp.getPivotAsAnchor?.()) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.anchor, 'true');
		}
		const overflow = typedComp.getOverflow?.() ?? 0;
		if (overflow !== 0) {
			const overflowName: Record<number, string> = { 0: 'visible', 1: 'hidden', 2: 'scroll' };
			writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.overflow, overflowName[overflow] ?? 'visible');
		}
		const margin = typedComp.getMargin?.();
		if (hasNonZeroInsets(margin)) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.margin, formatInsets(margin!));
		const restrictSize = [
			typedComp.getMinWidth?.() ?? 0,
			typedComp.getMaxWidth?.() ?? 0,
			typedComp.getMinHeight?.() ?? 0,
			typedComp.getMaxHeight?.() ?? 0,
		];
		if (restrictSize.some((value) => value !== 0)) {
			writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.restrictSize, restrictSize.join(','));
		}
		if (typedComp.getBgColorEnabled?.()) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.bgColorEnabled, 'true');
		const bgColor = typedComp.getBgColor?.();
		if (bgColor) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.bgColor, bgColor);
		const designImageAlpha = typedComp.getDesignImageAlpha?.() ?? 0;
		if (designImageAlpha !== 0) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.designImageAlpha, String(designImageAlpha));
		const designImageLayer = typedComp.getDesignImageLayer?.() ?? 0;
		if (designImageLayer !== 0) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.designImageLayer, String(designImageLayer));
		const designImageOffsetX = typedComp.getDesignImageOffsetX?.() ?? 0;
		if (designImageOffsetX !== 0) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.designImageOffsetX, String(designImageOffsetX));
		const designImageOffsetY = typedComp.getDesignImageOffsetY?.() ?? 0;
		if (designImageOffsetY !== 0) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.designImageOffsetY, String(designImageOffsetY));
		const idNum = typedComp.getIdNum?.() ?? 0;
		if (idNum !== 0) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.idnum, String(idNum));
		const initName = typedComp.getInitName?.();
		if (initName) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.initName, initName);
		const remark = typedComp.getRemark?.();
		if (remark) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.remark, remark);
		const clipSoftness = typedComp.getClipSoftness?.();
		if (clipSoftness && ((clipSoftness.x ?? 0) !== 0 || (clipSoftness.y ?? 0) !== 0)) {
			writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.clipSoftness, `${clipSoftness.x ?? 0},${clipSoftness.y ?? 0}`);
		}
		if (typedComp.getOpaque?.() === false) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.opaque, 'false');
		const mask = typedComp.getMask?.();
		if (mask) {
			writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.mask, mask);
			if (typedComp.getReversedMask?.()) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.reversedMask, '1');
		}
		const hitTest = typedComp.getHitTest?.();
		if (hitTest) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.hitTest, hitTest);
		const customData = typedComp.getCustomData?.();
		if (customData) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.customData, customData);
		if (overflow === 2) {
			const scrollTypeName: Record<number, string> = { 0: 'horizontal', 1: 'vertical', 2: 'both' };
			const scrollBarName: Record<number, string> = { 0: 'default', 1: 'visible', 2: 'auto', 3: 'hidden' };
			const scrollType = typedComp.getScrollType?.() ?? 1;
			if (scrollType !== 1) {
				writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.scroll, scrollTypeName[scrollType] ?? 'vertical');
			}
			const scrollBarDisplay = typedComp.getScrollBarDisplay?.() ?? 0;
			if (scrollBarDisplay !== 0) {
				writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.scrollBar, scrollBarName[scrollBarDisplay] ?? 'default');
			}
			const scrollBarFlags = typedComp.getScrollBarFlags?.() ?? 0;
			if (scrollBarFlags !== 0) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.scrollBarFlags, String(scrollBarFlags));
			const scrollBarMargin = typedComp.getScrollBarMargin?.();
			if (hasNonZeroInsets(scrollBarMargin)) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.scrollBarMargin, formatInsets(scrollBarMargin!));
			const vtScrollBarRes = typedComp.getVtScrollBarRes?.() ?? '';
			const hzScrollBarRes = typedComp.getHzScrollBarRes?.() ?? '';
			if (vtScrollBarRes || hzScrollBarRes) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.scrollBarRes, `${vtScrollBarRes},${hzScrollBarRes}`);
			const headerRes = typedComp.getHeaderRes?.() ?? '';
			const footerRes = typedComp.getFooterRes?.() ?? '';
			if (headerRes || footerRes) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.ptrRes, `${headerRes},${footerRes}`);
		}

		const extType = typedComp.getExtensionType?.() ?? '';
		if (extType) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.extention, extType);

		const compNode: Record<string, unknown> = { ...compAttrs };

		// Controllers
		const controllers = comp.listControllers();
		if (controllers.length > 0) {
			const controllerChildName = getProtocolChildName(PROJECT_XML_PROTOCOL.componentRoot, 'controller');
			if (controllerChildName) {
				compNode[controllerChildName] = controllers.map((ctrl) => this._serializeController(ctrl));
			}
		}

		// Display list
		const children = comp.listChildren();
		if (children.length > 0) {
			compNode.displayList = this._serializeDisplayList(children);
		}

		// Transitions
		const transitions = comp.listTransitions();
		if (transitions.length > 0) {
			const transitionChildName = getProtocolChildName(PROJECT_XML_PROTOCOL.componentRoot, 'transition');
			if (transitionChildName) {
				compNode[transitionChildName] = transitions.map((t) => this._serializeTransition(t));
			}
		}

		if (extType) {
			const extProtocol = EXTENSION_PROTOCOL_MAP[extType as keyof typeof EXTENSION_PROTOCOL_MAP];
			const extSpecs = extProtocol.attrs as Record<string, { canonical: string }>;
			const extAttrs: Record<string, unknown> = {};
			switch (extType) {
				case 'Button': {
					if ((typedComp.getButtonMode?.() ?? 0) !== 0) writeXmlAttr(extAttrs, extSpecs.mode, formatButtonMode(typedComp.getButtonMode?.() ?? 0));
					if (typedComp.getSound?.()) writeXmlAttr(extAttrs, extSpecs.sound, typedComp.getSound?.());
					if ((typedComp.getSoundVolumeScale?.() ?? 1) !== 1) writeXmlAttr(extAttrs, extSpecs.soundVolumeScale, String(typedComp.getSoundVolumeScale?.() ?? 1));
					const downEffect = typedComp.getDownEffect?.() ?? 0;
					if (downEffect !== 0) {
						writeXmlAttr(extAttrs, extSpecs.downEffect, String(downEffect));
						writeXmlAttr(extAttrs, extSpecs.downEffectValue, formatButtonDownEffectValue(typedComp.getDownEffectValue?.() ?? 0.8));
					}
					break;
				}
				case 'ComboBox':
					if (typedComp.getDropdown?.()) writeXmlAttr(extAttrs, extSpecs.dropdown, typedComp.getDropdown?.());
					if (typedComp.getSelectionController?.()) writeXmlAttr(extAttrs, extSpecs.selectionController, typedComp.getSelectionController?.());
					break;
				case 'Label':
					if (typedComp.getPromptText?.()) writeXmlAttr(extAttrs, extSpecs.prompt, typedComp.getPromptText?.());
					break;
				case 'ProgressBar':
					if ((typedComp.getTitleType?.() ?? 0) !== 0) writeXmlAttr(extAttrs, extSpecs.titleType, formatTitleType(typedComp.getTitleType?.() ?? 0));
					if (typedComp.getReverse?.()) writeXmlAttr(extAttrs, extSpecs.reverse, 'true');
					break;
				case 'Slider':
					if ((typedComp.getTitleType?.() ?? 0) !== 0) writeXmlAttr(extAttrs, extSpecs.titleType, formatTitleType(typedComp.getTitleType?.() ?? 0));
					if (typedComp.getReverse?.()) writeXmlAttr(extAttrs, extSpecs.reverse, 'true');
					if (typedComp.getWholeNumbers?.()) writeXmlAttr(extAttrs, extSpecs.wholeNumbers, 'true');
					if (typedComp.getChangeOnClick?.() === false) writeXmlAttr(extAttrs, extSpecs.changeOnClick, 'false');
					break;
				case 'ScrollBar':
					if (typedComp.getFixedGripSize?.()) writeXmlAttr(extAttrs, extSpecs.fixedGripSize, 'true');
					break;
				default:
					break;
			}
			const rootExtensionChildName = getProtocolChildName(PROJECT_XML_PROTOCOL.componentRoot, extType);
			if (rootExtensionChildName) {
				compNode[rootExtensionChildName] = Object.keys(extAttrs).length > 0 ? extAttrs : '';
			}
		}

		const xmlObj = {
			'?xml': { '@_version': '1.0', '@_encoding': 'utf-8' },
			component: compNode,
		};

		await fs.writeFile(fs.join(fileDir, name), builder.build(xmlObj) as string);
	}

	private _serializeController(ctrl: Controller): Record<string, unknown> {
		const pages = ctrl.listPages();
		const pagesStr = pages.map((p) => `${p.getId()},${p.getName()}`).join(',');
		const attrs: Record<string, unknown> = {};
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.controller.attrs.name, ctrl.getName());
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.controller.attrs.pages, pagesStr);
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.controller.attrs.selected, String(ctrl.getSelectedIndex()));
		const actions = ctrl.listActions().map((action) => this._serializeControllerAction(action as WritableControllerAction));
		const actionChildName = getProtocolChildName(PROJECT_XML_PROTOCOL.controller, 'action');
		if (actions.length > 0 && actionChildName) attrs[actionChildName] = actions;
		return attrs;
	}

	private _serializeControllerAction(action: WritableControllerAction): Record<string, unknown> {
		const fromPage = action.getFromPage?.() ?? [];
		const toPage = action.getToPage?.() ?? [];
		const attrs: Record<string, unknown> = {};
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.controllerAction.attrs.type, action.getActionType() === ControllerActionType.ChangePage ? 'change_page' : 'play_transition');
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.controllerAction.attrs.fromPage, fromPage.join(','));
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.controllerAction.attrs.toPage, toPage.join(','));

		switch (action.getActionType()) {
			case ControllerActionType.PlayTransition:
				if (action.getTransitionName?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.controllerAction.attrs.transition, action.getTransitionName?.());
				if ((action.getPlayTimes?.() ?? 1) !== 1) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.controllerAction.attrs.repeat, String(action.getPlayTimes?.() ?? 1));
				if ((action.getDelay?.() ?? 0) !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.controllerAction.attrs.delay, String(action.getDelay?.() ?? 0));
				if (action.getStopOnExit?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.controllerAction.attrs.stopOnExit, 'true');
				break;
			case ControllerActionType.ChangePage:
				if (action.getObjectId?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.controllerAction.attrs.objectId, action.getObjectId?.());
				if (action.getControllerName?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.controllerAction.attrs.controller, action.getControllerName?.());
				if (action.getTargetPage?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.controllerAction.attrs.targetPage, action.getTargetPage?.());
				break;
			default:
				break;
		}

		return attrs;
	}

	private _serializeDisplayList(children: GObject[]): string {
		const lines: string[] = [];
		for (const child of children) {
			const propertyType = child.propertyType as string;
			const tag = DISPLAY_TAG[propertyType] ?? 'component';
			assertDisplayListVariantAllowed(propertyType, tag, child.getName() || child.getId() || propertyType);
			lines.push(renderXmlNode(tag, this._serializeChild(child), '    '));
		}
		return `\n${lines.join('\n')}\n  `;
	}

	private _serializeChild(obj: GObject): Record<string, unknown> {
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
		}
		if (type === 'GLoader') {
			const [x, y] = [typedObj.getX?.() ?? 0, typedObj.getY?.() ?? 0];
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.xy, `${x},${y}`);
			const [w, h] = [typedObj.getWidth?.() ?? 0, typedObj.getHeight?.() ?? 0];
			if (w !== 0 || h !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.size, `${w},${h}`);
			const [pivotX, pivotY] = [typedObj.getPivotX?.() ?? 0, typedObj.getPivotY?.() ?? 0];
			if (pivotX !== 0 || pivotY !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.pivot, `${pivotX},${pivotY}`);
			const [scaleX, scaleY] = [typedObj.getScaleX?.() ?? 1, typedObj.getScaleY?.() ?? 1];
			if (scaleX !== 1 || scaleY !== 1) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.scale, `${scaleX},${scaleY}`);
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
			if (pivotX !== 0 || pivotY !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.pivot, `${pivotX},${pivotY}`);
			if ((typedObj.getRotation?.() ?? 0) !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.rotation, String(typedObj.getRotation?.() ?? 0));
			if ((typedObj.getAlpha?.() ?? 1) !== 1) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.alpha, formatDisplayAlpha(typedObj.getAlpha?.() ?? 1));
			if (typedObj.getVisible?.() === false) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.visible, 'false');
			if (typedObj.getGrayed?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.grayed, 'true');
			if (typedObj.getFileName?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.fileName, typedObj.getFileName?.());
			if (typedObj.getFilter?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.filter, typedObj.getFilter?.());
			if (typedObj.getFilterData?.()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.filterData, typedObj.getFilterData?.());
		}
		if (type === 'GTextField' || type === 'GRichTextField' || type === 'GTextInput') {
			const [x, y] = [typedObj.getX?.() ?? 0, typedObj.getY?.() ?? 0];
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.xy, `${x},${y}`);
			const [w, h] = [typedObj.getWidth?.() ?? 0, typedObj.getHeight?.() ?? 0];
			if (w !== 0 || h !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.size, `${w},${h}`);
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
		}
		if (type === 'GLoader3D') {
			const [x, y] = [typedObj.getX?.() ?? 0, typedObj.getY?.() ?? 0];
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.xy, `${x},${y}`);
			const [w, h] = [typedObj.getWidth?.() ?? 0, typedObj.getHeight?.() ?? 0];
			if (w !== 0 || h !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.size, `${w},${h}`);
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
			const lineCount = typedObj.getLineCount?.() ?? 0;
			if (lineCount !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.lineCount, String(lineCount));
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
				extensionChildName = getProtocolChildName(PROJECT_XML_PROTOCOL.componentInstance, instanceExtType);
				if (extensionChildName) {
					extensionValue = Object.keys(extAttrs).length > 0 ? extAttrs : '';
				}
			}
		}

		// Gear child elements
		const objectProtocol = DISPLAY_OBJECT_PROTOCOL_BY_TYPE[type] ?? PROJECT_XML_PROTOCOL.componentInstance;
		const gearChildNameSet = getProtocolGearChildNameSet(objectProtocol);
		for (const gear of obj.listGears()) {
			const gearTag = GEAR_TAG[gear.getGearType()];
			if (!gearTag || !gearChildNameSet.has(gearTag)) continue;
			attrs[gearTag] = [this._serializeGear(gear, obj.propertyType, obj.getName?.())];
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

	private _serializeGear(gear: Gear, ownerType?: string, ownerName?: string | null): Record<string, unknown> {
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

	private _serializeTransition(trans: Transition): Record<string, unknown> {
		const attrs: Record<string, unknown> = {};
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.transition.attrs.name, trans.getName());
		if (trans.getAutoPlay()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.transition.attrs.autoPlay, 'true');
		if (trans.getAutoPlayTimes() !== 1) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.transition.attrs.autoPlayTimes, String(trans.getAutoPlayTimes()));
		if (trans.getAutoPlayDelay() !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.transition.attrs.autoPlayDelay, String(trans.getAutoPlayDelay()));

		const ACTION_TYPE_NAMES: Record<number, string> = {
			0: 'XY', 1: 'Size', 2: 'Scale', 3: 'Pivot', 4: 'Alpha', 5: 'Rotation',
			6: 'Color', 7: 'Animation', 8: 'Visible', 9: 'Sound', 10: 'Transition',
			11: 'Shake', 12: 'ColorFilter', 13: 'Skew', 14: 'Text', 15: 'Icon',
		};

		const items = trans.listItems().map((item) => {
			const ia: Record<string, unknown> = {};
			writeXmlAttr(ia, PROJECT_XML_PROTOCOL.transitionItem.attrs.time, formatTransitionFrameValue(item.getTime()));
			writeXmlAttr(ia, PROJECT_XML_PROTOCOL.transitionItem.attrs.type, ACTION_TYPE_NAMES[item.getActionType()] ?? 'XY');
			if (item.getTargetId()) writeXmlAttr(ia, PROJECT_XML_PROTOCOL.transitionItem.attrs.target, item.getTargetId());
			if (item.getDuration() !== 0) writeXmlAttr(ia, PROJECT_XML_PROTOCOL.transitionItem.attrs.duration, formatTransitionFrameValue(item.getDuration()));
			if (item.getTween()) writeXmlAttr(ia, PROJECT_XML_PROTOCOL.transitionItem.attrs.tween, 'true');
			if (item.getTween() && item.getEaseType() !== 5) writeXmlAttr(ia, PROJECT_XML_PROTOCOL.transitionItem.attrs.ease, stringifyEaseType(item.getEaseType()));
			if (item.getRepeat() !== 0) writeXmlAttr(ia, PROJECT_XML_PROTOCOL.transitionItem.attrs.repeat, String(item.getRepeat()));
			if (item.getYoyo()) writeXmlAttr(ia, PROJECT_XML_PROTOCOL.transitionItem.attrs.yoyo, 'true');
			if (item.getLabel()) writeXmlAttr(ia, PROJECT_XML_PROTOCOL.transitionItem.attrs.label, item.getLabel());
			if (item.getEndLabel()) writeXmlAttr(ia, PROJECT_XML_PROTOCOL.transitionItem.attrs.label2, item.getEndLabel());
			if (item.getPath()) writeXmlAttr(ia, PROJECT_XML_PROTOCOL.transitionItem.attrs.path, item.getPath());
			const sv = item.getStartValue();
			if (sv.length) {
				if (!item.getTween()) writeXmlAttr(ia, PROJECT_XML_PROTOCOL.transitionItem.attrs.value, stringifyTransitionValue(item.getActionType(), sv));
				else writeXmlAttr(ia, PROJECT_XML_PROTOCOL.transitionItem.attrs.startValue, stringifyTransitionValue(item.getActionType(), sv));
			}
			const ev = item.getEndValue();
			if (ev.length) writeXmlAttr(ia, PROJECT_XML_PROTOCOL.transitionItem.attrs.endValue, stringifyTransitionValue(item.getActionType(), ev));
			return ia;
		});

		const transitionItemChildName = getProtocolChildName(PROJECT_XML_PROTOCOL.transition, 'item');
		if (items.length > 0 && transitionItemChildName) attrs[transitionItemChildName] = items;
		return attrs;
	}

	private _resourceTag(propertyType: string): string | null {
		const map: Record<string, string> = {
			ImageResource: 'image',
			Component: 'component',
			MiscResource: 'misc',
			SoundResource: 'sound',
			FontResource: 'font',
			MovieClipResource: 'movieclip',
			SpineResource: 'spine',
			DragonBonesResource: 'dragonbones',
		};
		return map[propertyType] ?? null;
	}

	private _resourceFileName(res: WritableResource): string {
		const name = res.getName?.() ?? '';
		const type = res.propertyType as string;
		if (type === 'Component') return name + '.xml';
		if (type === 'ImageResource') {
			const fileName = (res as WritableImageResource).getFileName?.() ?? '';
			if (fileName) return fileName;
		}
		if (type === 'SoundResource' || type === 'MiscResource' || type === 'SpineResource' || type === 'DragonBonesResource') {
			const fileName = (res as WritableFileResource).getFile?.() ?? '';
			if (fileName) return fileName;
		}
		if (type === 'FontResource') {
			const fileName = (res as WritableFontResource).getFileName?.() ?? '';
			if (fileName) return fileName;
		}
		if (type === 'MovieClipResource') {
			const fileName = (res as WritableMovieClipResource).getFileName?.() ?? '';
			if (fileName) return fileName;
			return `${name}.jta`;
		}
		// For other types the name usually includes the extension already (stored from original)
		return name;
	}

	private _projectTypeName(type: number): string {
		const names: Record<number, string> = {
			0: 'Unity', 1: 'Flash', 2: 'Starling', 3: 'CocosCreator',
			4: 'Layabox', 5: 'Egret', 6: 'Haxe', 7: 'Pixi',
			8: 'LibGDX', 9: 'Unreal',
		};
		return names[type] ?? 'Unity';
	}
}
