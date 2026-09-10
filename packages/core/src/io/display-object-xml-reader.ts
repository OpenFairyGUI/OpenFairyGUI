import { createTextDisplayObject } from './display-object-xml-text.js';
import { createListDisplayObject } from './display-object-xml-list.js';
import { readDisplayBehaviors } from './display-object-xml-behaviors.js';
import { readComponentInstanceOverlays } from './display-object-xml-instance.js';
import type { DisplayObjectXmlNode } from './display-object-xml-shared.js';
export type { DisplayObjectXmlNode } from './display-object-xml-shared.js';
import type { Document } from '../document.js';
import type { Controller } from '../properties/controller.js';
import type { GObject } from '../properties/g-object.js';
import {
	parseBool,
	parseFloat2,
	parseInt2,
	parseSizeString,
	parseXYString,
} from '../utils/xml-utils.js';
import { PROJECT_XML_PROTOCOL, readXmlAttr, type XmlNodeProtocol } from './project-xml-protocol.js';
import type { ReaderContext } from './reader-context.js';

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

export function createDisplayObject(
		_ctx: ReaderContext,
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
			case 'text':
			case 'richtext':
			case 'inputtext':
				obj = createTextDisplayObject(doc, tagName, name, attrs);
				break;
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
			case 'list':
				obj = createListDisplayObject(doc, name, attrs);
				break;
			default:
				return null;
		}

		// Common GObject attributes
		const objectId = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.displayObject.attrs.id);
		obj.setId(objectId || '');
		const objectProtocol = DISPLAY_OBJECT_PROTOCOL_MAP[tagName];
		readCommonDisplayState(attrs, obj as WritableCommonDisplayState, objectProtocol);
		readDisplayBehaviors(doc, obj, attrs, objectProtocol, localControllers);
		readComponentInstanceOverlays(obj, attrs);

		return obj;
	}
