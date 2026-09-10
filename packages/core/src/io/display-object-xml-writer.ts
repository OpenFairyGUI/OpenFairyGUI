import type { GImage } from '../properties/g-image.js';
import type { GGraph } from '../properties/g-graph.js';
import type { GGroup } from '../properties/g-group.js';
import type { GLoader } from '../properties/g-loader.js';
import type { GLoader3D } from '../properties/g-loader-3d.js';
import type { GMovieClip } from '../properties/g-movie-clip.js';
import type { GComponent } from '../properties/g-component.js';
import type { GList } from '../properties/g-list.js';
import type { GTree } from '../properties/g-tree.js';
import { writeDisplayObjectBehaviors } from './display-object-xml-behaviors-writer.js';
import { writeListXmlNode } from './display-object-xml-list-writer.js';
import { writeComponentInstanceXmlNode } from './display-object-xml-instance-writer.js';
import type { GTextField } from '../properties/g-text-field.js';
import type { GTextInput } from '../properties/g-text-input.js';
import { writeTextXmlAttributes, writeTextInputXmlAttributes } from './display-object-xml-text-writer.js';
import {
	formatProjectInt32List,
	formatTrimmedFixed,
	sameColor,
	formatXmlColor,
	isDefaultWhiteColor,
} from './project-xml-writer-utils.js';
import type { GObject } from '../properties/g-object.js';
import { renderXmlAttrs } from '../utils/xml-utils.js';
import { PROJECT_XML_PROTOCOL, writeXmlAttr, type XmlNodeProtocol } from './project-xml-protocol.js';

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

// Some concrete tags lack these state fields; all other accessors belong to GObject.
type CommonDisplayState = GObject & Partial<Pick<GImage,
	'getX' | 'getY' | 'getWidth' | 'getHeight' | 'getGroup' |
	'getAlpha' | 'getRotation' | 'getVisible' | 'getTouchable' | 'getGrayed'
>>;


function writeCommonDisplayState(
	target: Record<string, unknown>,
	object: CommonDisplayState,
	protocol: XmlNodeProtocol,
): void {
	const specs = protocol.attrs;
	if (specs.xy) {
		writeXmlAttr(target, specs.xy, formatProjectInt32List([
			object.getX?.() ?? 0,
			object.getY?.() ?? 0,
		], 'display object xy'));
	}
	const width = object.getWidth?.() ?? 0;
	const height = object.getHeight?.() ?? 0;
	if (specs.size && (width !== 0 || height !== 0)) {
		writeXmlAttr(target, specs.size, formatProjectInt32List([width, height], 'display object size'));
	}
	if (specs.locked && object.getLocked()) writeXmlAttr(target, specs.locked, 'true');
	const restrictSize = [
		object.getMinWidth() ?? 0,
		object.getMaxWidth() ?? 0,
		object.getMinHeight() ?? 0,
		object.getMaxHeight() ?? 0,
	];
	if (specs.restrictSize && restrictSize.some((value) => value !== 0)) {
		writeXmlAttr(target, specs.restrictSize, formatProjectInt32List(restrictSize, 'display object restrictSize'));
	}
	if (specs.aspect && object.getAspect()) writeXmlAttr(target, specs.aspect, 'true');
	const pivotX = object.getPivotX() ?? 0;
	const pivotY = object.getPivotY() ?? 0;
	if (specs.pivot && (pivotX !== 0 || pivotY !== 0 || object.getPivotAsAnchor())) {
		writeXmlAttr(target, specs.pivot, `${pivotX},${pivotY}`);
		if (specs.anchor && object.getPivotAsAnchor()) writeXmlAttr(target, specs.anchor, 'true');
	}
	const scaleX = object.getScaleX() ?? 1;
	const scaleY = object.getScaleY() ?? 1;
	if (specs.scale && (scaleX !== 1 || scaleY !== 1)) {
		writeXmlAttr(target, specs.scale, `${scaleX},${scaleY}`);
	}
	const skewX = object.getSkewX() ?? 0;
	const skewY = object.getSkewY() ?? 0;
	if (specs.skew && (skewX !== 0 || skewY !== 0)) {
		writeXmlAttr(target, specs.skew, `${skewX},${skewY}`);
	}
	if (specs.group && object.getGroup?.()) writeXmlAttr(target, specs.group, object.getGroup?.());
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
	if (specs.tooltips && object.getTooltips()) writeXmlAttr(target, specs.tooltips, object.getTooltips());
	if (specs.customData && object.getCustomData()) writeXmlAttr(target, specs.customData, object.getCustomData());
	const blendMode = object.getBlendMode() ?? 'normal';
	if (specs.blendMode && blendMode !== 'normal') writeXmlAttr(target, specs.blendMode, blendMode);
	if (specs.filter && object.getFilter()) writeXmlAttr(target, specs.filter, object.getFilter());
	if (specs.filterData && object.getFilterData()) writeXmlAttr(target, specs.filterData, object.getFilterData());
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
	const attrs: Record<string, unknown> = {};
	if (obj.getId()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.displayObject.attrs.id, obj.getId());
	if (obj.getName()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.displayObject.attrs.name, obj.getName());

	// Type-specific attributes
	const type = obj.propertyType as string;
	if (EXTENSION_TYPE[type]) {
		const instance = obj as GComponent;
		if (instance.getSrc()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.src, instance.getSrc());
		if (instance.getFileName()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.fileName, instance.getFileName());
		if (instance.getPackageId()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.pkg, instance.getPackageId());
	}
	if (type === 'GImage') {
		writeImageXmlAttributes(attrs, obj as GImage);
	}
	if (type === 'GGraph') {
		writeGraphXmlAttributes(attrs, obj as GGraph);
	}
	if (type === 'GLoader') {
		writeLoaderXmlAttributes(attrs, obj as GLoader);
	}
	if (type === 'GMovieClip') {
		writeMovieClipXmlAttributes(attrs, obj as GMovieClip);
	}
	if (type === 'GTextField' || type === 'GRichTextField' || type === 'GTextInput') {
		writeTextXmlAttributes(attrs, obj as GTextField);
		if (type === 'GTextInput') writeTextInputXmlAttributes(attrs, obj as GTextInput);
	}
	if (type === 'GLoader3D') {
		writeLoader3DXmlAttributes(attrs, obj as GLoader3D);
	}

	if (type === 'GGroup') {
		writeGroupXmlAttributes(attrs, obj as GGroup);
	}
	if (type === 'GList' || type === 'GTree') {
		writeListXmlNode(attrs, obj as GList | GTree);
	}

	const extension = type === 'GComponent'
		? writeComponentInstanceXmlNode(attrs, obj as GComponent)
		: undefined;

	const objectProtocol = DISPLAY_OBJECT_PROTOCOL_BY_TYPE[type] ?? PROJECT_XML_PROTOCOL.componentInstance;
	writeCommonDisplayState(attrs, obj, objectProtocol);
	writeDisplayObjectBehaviors(attrs, obj, objectProtocol);
	if (extension) {
		attrs[extension.name] = extension.value;
	}

	return attrs;
}

function writeImageXmlAttributes(attrs: Record<string, unknown>, object: GImage): void {
	const src = object.getSrc();
	if (src) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.src, src);
	if (object.getPackageId()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.pkg, object.getPackageId());
	const imageColor = object.getColor();
	if (imageColor && !isDefaultWhiteColor(imageColor)) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.color, imageColor);
	const flip = object.getFlip() ?? 0;
	if (flip !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.flip, formatImageFlip(flip));
	const fillMethod = object.getFillMethod() ?? 0;
	if (fillMethod !== 0) {
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.fillMethod, formatFillMethod(fillMethod));
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.fillOrigin, String(object.getFillOrigin() ?? 0));
		if (object.getFillClockwise() === false) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.fillClockwise, 'false');
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.image.attrs.fillAmount, String(Math.round((object.getFillAmount() ?? 0) * 100)));
	}
}

function writeGraphXmlAttributes(attrs: Record<string, unknown>, object: GGraph): void {
	const graphType = object.getGraphType() ?? 0;
	if (graphType !== 0) {
		const graphTypeName: Record<number, string> = {
			1: 'rect',
			2: 'ellipse',
			3: 'polygon',
			4: 'regularpolygon',
		};
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.type, graphTypeName[graphType] ?? 'rect');
	}
	if ((object.getLineSize() ?? 1) !== 1) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.lineSize, String(object.getLineSize() ?? 1));
	const lineColor = object.getLineColor();
	if (lineColor && !sameColor(lineColor, '#000000') && !sameColor(lineColor, '#ff000000')) {
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.lineColor, formatXmlColor(lineColor));
	}
	const fillColor = object.getFillColor();
	if (fillColor && !sameColor(fillColor, '#FFFFFF') && !sameColor(fillColor, '#FFFFFFFF')) {
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.fillColor, formatXmlColor(fillColor));
	}
	const cornerRadius = object.getCornerRadius();
	if (cornerRadius) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.corner, cornerRadius.join(','));
	const points = object.getPoints();
	if (points?.length) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.points, points.join(','));
	const sides = object.getSides() ?? 0;
	if (sides > 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.sides, String(sides));
	const startAngle = object.getStartAngle() ?? 0;
	if (startAngle !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.startAngle, String(startAngle));
	const distances = object.getDistances();
	if (distances?.length) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.graph.attrs.distances, distances.join(','));
}

function writeLoaderXmlAttributes(attrs: Record<string, unknown>, object: GLoader): void {
	const url = object.getUrl();
	if (url) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.url, url);
	const align = object.getAlign();
	if (align !== undefined && align !== 0) {
		const alignName: Record<number, string> = { 0: 'left', 1: 'center', 2: 'right' };
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.align, alignName[align] ?? 'left');
	}
	const vAlign = object.getVAlign();
	if (vAlign !== undefined && vAlign !== 0) {
		const vAlignName: Record<number, string> = { 0: 'top', 1: 'middle', 2: 'bottom' };
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.vAlign, vAlignName[vAlign] ?? 'top');
	}
	const fill = object.getFill();
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
	if (object.getShrinkOnly()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.shrinkOnly, '1');
	if (object.getAutoSize()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.autoSize, '1');
	if (object.getUseResize()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.useResize, '1');
	if (object.getShowErrorSign()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.errorSign, 'true');
	const loaderColor = object.getColor();
	if (loaderColor && !isDefaultWhiteColor(loaderColor)) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.color, loaderColor);
	if (object.getPlaying() === false) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.playing, 'false');
	const frame = object.getFrame() ?? 0;
	if (frame !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.frame, String(frame));
	const fillMethod = object.getFillMethod() ?? 0;
	if (fillMethod !== 0) {
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.fillMethod, formatFillMethod(fillMethod));
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.fillOrigin, String(object.getFillOrigin() ?? 0));
		if (object.getFillClockwise() === false) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.fillClockwise, 'false');
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.fillAmount, String(Math.round((object.getFillAmount() ?? 0) * 100)));
	}
	if (object.getClearOnPublish()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader.attrs.clearOnPublish, 'true');
}

function writeLoader3DXmlAttributes(attrs: Record<string, unknown>, object: GLoader3D): void {
	const url = object.getUrl();
	if (url) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.url, url);
	const align = object.getAlign();
	if (align !== undefined && align !== 0) {
		const alignName: Record<number, string> = { 0: 'left', 1: 'center', 2: 'right' };
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.align, alignName[align] ?? 'left');
	}
	const vAlign = object.getVAlign();
	if (vAlign !== undefined && vAlign !== 0) {
		const vAlignName: Record<number, string> = { 0: 'top', 1: 'middle', 2: 'bottom' };
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.vAlign, vAlignName[vAlign] ?? 'top');
	}
	const fill = object.getFill();
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
	if (object.getShrinkOnly()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.shrinkOnly, '1');
	if (object.getAutoSize()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.autoSize, '1');
	const animationName = object.getAnimationName();
	if (animationName) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.animation, animationName);
	const skinName = object.getSkinName();
	if (skinName) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.skinName, skinName);
	if (object.getPlaying() === false) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.playing, 'false');
	const frame = object.getFrame() ?? 0;
	if (frame !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.frame, String(frame));
	if (object.getLoop() === false) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.loop, 'false');
	const loaderColor = object.getColor();
	if (loaderColor) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.color, loaderColor);
	if (object.getClearOnPublish()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.clearOnPublish, 'true');
}

function writeGroupXmlAttributes(attrs: Record<string, unknown>, object: GGroup): void {
	const layout = object.getLayout();
	if (layout !== undefined && layout !== 0) {
		const layoutName: Record<number, string> = { 0: 'none', 1: 'hz', 2: 'vt' };
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.group.attrs.layout, layoutName[layout] ?? 'none');
	}
	const lineGap = object.getLineGap() ?? 0;
	if (lineGap !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.group.attrs.lineGap, String(lineGap));
	const columnGap = object.getColumnGap() ?? 0;
	if (columnGap !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.group.attrs.columnGap, String(columnGap));
	if (object.getAdvanced()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.group.attrs.advanced, 'true');
	if (object.getExcludeInvisibles()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.group.attrs.excludeInvisibles, 'true');
	if (object.getAutoSizeDisabled()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.group.attrs.autoSizeDisabled, 'true');
	const mainGridIndex = object.getMainGridIndex() ?? -1;
	if (mainGridIndex >= 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.group.attrs.mainGridIndex, String(mainGridIndex));
}

function writeMovieClipXmlAttributes(attrs: Record<string, unknown>, object: GMovieClip): void {
	const src = object.getSrc();
	if (src) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.src, src);
	if (object.getFileName()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.fileName, object.getFileName());
	if (object.getPackageId()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.pkg, object.getPackageId());
	if (object.getPlaying() === false) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.playing, 'false');
	const frame = object.getFrame() ?? 0;
	if (frame !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.frame, String(frame));
	const movieClipColor = object.getColor();
	if (movieClipColor && !isDefaultWhiteColor(movieClipColor)) {
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.color, formatXmlColor(movieClipColor));
	}
}
