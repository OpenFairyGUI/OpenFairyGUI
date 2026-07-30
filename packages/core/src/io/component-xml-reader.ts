import { ControllerActionType } from '../constants.js';
import type { Component } from '../properties/component.js';
import type { Controller } from '../properties/controller.js';
import {
	ensureArray,
	parseBool,
	parseControllerPages,
	parseFloat2,
	parseInt2,
	parseSizeString,
	parseXML,
	parseXMLPreserveOrder,
} from '../utils/xml-utils.js';
import {
	assertDisplayListTagAllowed,
	createDisplayObject,
	type DisplayObjectXmlNode,
} from './display-object-xml-reader.js';
import { PROJECT_XML_PROTOCOL, readXmlAttr, type XmlNodeProtocol } from './project-xml-protocol.js';
import type { ReaderContext } from './reader-context.js';

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


const EXTENSION_TYPE_MAP: Record<string, string> = {
	Button: 'GButton',
	Label: 'GLabel',
	ComboBox: 'GComboBox',
	ProgressBar: 'GProgressBar',
	Slider: 'GSlider',
	ScrollBar: 'GScrollBar',
};

const EXTENSION_PROTOCOL_MAP = {
	Button: PROJECT_XML_PROTOCOL.buttonExtension,
	Label: PROJECT_XML_PROTOCOL.labelExtension,
	ComboBox: PROJECT_XML_PROTOCOL.comboBoxExtension,
	ProgressBar: PROJECT_XML_PROTOCOL.progressBarExtension,
	Slider: PROJECT_XML_PROTOCOL.sliderExtension,
	ScrollBar: PROJECT_XML_PROTOCOL.scrollBarExtension,
} as const;


type XmlNode = Record<string, unknown>;
type OrderedXmlEntry = Record<string, unknown>;

interface ControllerXmlNode extends XmlNode {
	name?: string;
	selected?: string | number;
	pages?: string;
	action?: ControllerActionXmlNode | ControllerActionXmlNode[];
}

interface ControllerActionXmlNode {
	[key: string]: unknown;
	type?: string;
	fromPage?: string;
	toPage?: string;
	transition?: string;
	repeat?: string | number;
	delay?: string | number;
	stopOnExit?: string | boolean;
	objectId?: string;
	controller?: string;
	targetPage?: string;
}

interface TransitionItemXmlNode extends XmlNode {
	time?: string | number;
	target?: string;
	tween?: string | boolean;
	duration?: string | number;
	repeat?: string | number;
	yoyo?: string | boolean;
	label?: string;
	label2?: string;
	path?: string;
	ease?: string;
	type?: string;
	value?: string | number;
	startValue?: string | number;
	endValue?: string | number;
}

interface TransitionXmlNode extends XmlNode {
	name?: string;
	autoPlay?: string | boolean;
	autoPlayTimes?: string | number;
	autoPlayDelay?: string | number;
	options?: string | number;
	fps?: string | number;
	item?: TransitionItemXmlNode | TransitionItemXmlNode[];
}


interface ExtensionXmlNode extends Record<string, unknown> {
	[key: string]: unknown;
}
interface ComponentXmlNode extends Record<string, unknown> {
	size?: string;
	overflow?: string;
	pivot?: string;
	anchor?: string | boolean;
	margin?: string;
	restrictSize?: string;
	clipSoftness?: string;
	opaque?: string | boolean;
	mask?: string;
	reversedMask?: string | boolean;
	hitTest?: string;
	customData?: string;
	scroll?: string;
	scrollBar?: string;
	scrollBarFlags?: string | number;
	scrollBarMargin?: string;
	scrollBarRes?: string;
	ptrRes?: string;
	extention?: string;
	controller?: ControllerXmlNode | ControllerXmlNode[];
	displayList?: Record<string, DisplayObjectXmlNode | DisplayObjectXmlNode[]>;
	transition?: TransitionXmlNode | TransitionXmlNode[];
	[key: string]: unknown;
}


function appendOrderedValue(target: Record<string, unknown>, key: string, value: unknown): void {
	const current = target[key];
	if (current === undefined) {
		target[key] = value;
		return;
	}
	if (Array.isArray(current)) {
		current.push(value);
		return;
	}
	target[key] = [current, value];
}

function normalizeOrderedChildren(entries: OrderedXmlEntry[]): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const entry of entries) {
		const attrs = (entry[':@'] as Record<string, unknown> | undefined) ?? {};
		for (const [tagName, value] of Object.entries(entry)) {
			if (tagName === ':@' || tagName === '#text') continue;
			const nestedEntries = Array.isArray(value) ? (value as OrderedXmlEntry[]) : [];
			const normalizedChildren = normalizeOrderedChildren(nestedEntries);
			const normalizedValue = Object.keys(normalizedChildren).length > 0
				? { ...attrs, ...normalizedChildren }
				: { ...attrs };
			appendOrderedValue(out, tagName, normalizedValue);
		}
	}
	return out;
}

function getOrderedDisplayListItems(xmlContent: string): Array<{ tagName: string; attrs: DisplayObjectXmlNode }> {
	const ordered = parseXMLPreserveOrder(xmlContent);
	const componentEntry = ordered.find((entry) => 'component' in entry);
	if (!componentEntry) return [];
	const componentChildren = Array.isArray(componentEntry.component)
		? (componentEntry.component as OrderedXmlEntry[])
		: [];
	const displayListEntry = componentChildren.find((entry) => 'displayList' in entry);
	if (!displayListEntry) return [];
	const displayListChildren = Array.isArray(displayListEntry.displayList)
		? (displayListEntry.displayList as OrderedXmlEntry[])
		: [];

	return displayListChildren.flatMap((entry) => {
		const rawTagName = Object.keys(entry).find((key) => key !== ':@' && key !== '#text');
		if (!rawTagName) return [];
		const attrs = (entry[':@'] as Record<string, unknown> | undefined) ?? {};
		const nestedEntries = Array.isArray(entry[rawTagName]) ? (entry[rawTagName] as OrderedXmlEntry[]) : [];
		const rawAttrs = readRawDisplayListAttrs(xmlContent, rawTagName, attrs.id);
		return [{
			tagName: rawTagName.toLowerCase(),
			attrs: {
				...rawAttrs,
				...attrs,
				...normalizeOrderedChildren(nestedEntries),
			} as DisplayObjectXmlNode,
		}];
	});
}

function readRawDisplayListAttrs(
	xmlContent: string,
	tagName: string,
	id: unknown,
): Record<string, unknown> {
	if (typeof id !== 'string' || !id) return {};
	const idPattern = escapeRegExp(id);
	const tagPattern = escapeRegExp(tagName);
	const match = xmlContent.match(new RegExp(`<${tagPattern}\\b([^>]*\\bid="${idPattern}"[^>]*)\\/?>`, 'i'));
	if (!match?.[1]) return {};
	const attrText = match[1].replace(/\/\s*$/, '');
	const attrs: Record<string, unknown> = {};
	for (const attrMatch of attrText.matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g)) {
		attrs[attrMatch[1]] = attrMatch[2];
	}
	return attrs;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


function getXmlNode<T extends XmlNode>(value: unknown): T | null {
	const node = Array.isArray(value) ? value[0] : value;
	if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
	return node as T;
}


function parseButtonMode(value: unknown): number {
	if (typeof value === 'number') return value;
	const normalized = String(value ?? '').trim().toLowerCase();
	const map: Record<string, number> = {
		common: 0,
		check: 1,
		radio: 2,
	};
	const parsed = Number(normalized);
	return map[normalized] ?? (Number.isFinite(parsed) ? parsed : 0);
}

function parseTitleType(value: unknown): number {
	if (typeof value === 'number') return value;
	const normalized = String(value ?? '').trim().toLowerCase();
	const map: Record<string, number> = {
		percent: 0,
		valueandmax: 1,
		value: 2,
		max: 3,
	};
	const parsed = Number(normalized);
	return map[normalized] ?? (Number.isFinite(parsed) ? parsed : 0);
}

function parseControllerActionType(value: unknown): number {
	const normalized = String(value ?? '').trim().toLowerCase();
	switch (normalized) {
		case 'play_transition':
			return ControllerActionType.PlayTransition;
		case 'change_page':
			return ControllerActionType.ChangePage;
		default:
			return ControllerActionType.PlayTransition;
	}
}

function parseControllerActionPages(value: unknown): string[] {
	const raw = String(value ?? '').trim();
	if (!raw) return [];
	return raw.split(',').map((entry) => entry.trim()).filter((entry) => entry !== '');
}

function getXmlScalar(value: unknown): string {
	if (Array.isArray(value)) {
		return value.length > 0 ? String(value[0] ?? '') : '';
	}
	return value === undefined || value === null ? '' : String(value);
}

function getProtocolChildName(protocol: XmlNodeProtocol, childName: string): string | null {
	return protocol.children?.[childName] ? childName : null;
}


export function readComponentXml(ctx: ReaderContext, comp: Component, xmlContent: string): void {
		const xml = parseXML(xmlContent);
		const compNode = getXmlNode<ComponentXmlNode>(xml.component);
		if (!compNode) return;
		const orderedDisplayItems = getOrderedDisplayListItems(xmlContent);

		// fast-xml-parser may wrap in array due to isArray config
		const doc = ctx.document;

		// Size
		const compSize = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.size);
		if (compSize) {
			const [w, h] = parseSizeString(compSize);
			comp.setSize(w, h);
		}

		// Overflow
		const overflow = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.overflow);
		if (overflow) {
			const overflowMap: Record<string, number> = { visible: 0, hidden: 1, scroll: 2 };
			comp.setOverflow?.(overflowMap[overflow] ?? 0);
		}

		// Pivot
		const pivot = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.pivot);
		if (pivot) {
			const parts = pivot.split(',');
			comp.setPivotX?.(parseFloat(parts[0]) || 0);
			comp.setPivotY?.(parseFloat(parts[1]) || 0);
			const anchor = readXmlAttr<string | boolean>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.anchor);
			if (anchor !== undefined) comp.setPivotAsAnchor?.(parseBool(anchor));
		}

		// Margin
		const margin = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.margin);
		if (margin) {
			const parts = margin.split(',').map(Number);
			comp.setMargin?.({ top: parts[0] ?? 0, bottom: parts[1] ?? 0, left: parts[2] ?? 0, right: parts[3] ?? 0 });
		}

		// Restrict size
		const restrictSize = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.restrictSize);
		if (restrictSize) {
			const parts = restrictSize.split(',').map(Number);
			comp.setMinWidth?.(parts[0] ?? 0);
			comp.setMaxWidth?.(parts[1] ?? 0);
			comp.setMinHeight?.(parts[2] ?? 0);
			comp.setMaxHeight?.(parts[3] ?? 0);
		}
		const bgColor = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.bgColor);
		if (bgColor !== undefined) comp.setBgColor?.(bgColor);
		const bgColorEnabled = readXmlAttr<string | boolean>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.bgColorEnabled);
		if (bgColorEnabled !== undefined) comp.setBgColorEnabled?.(parseBool(bgColorEnabled));
		const designImageAlpha = readXmlAttr<string | number>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.designImageAlpha);
		if (designImageAlpha !== undefined) comp.setDesignImageAlpha?.(parseInt2(designImageAlpha));
		const designImageLayer = readXmlAttr<string | number>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.designImageLayer);
		if (designImageLayer !== undefined) comp.setDesignImageLayer?.(parseInt2(designImageLayer));
		const designImageOffsetX = readXmlAttr<string | number>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.designImageOffsetX);
		if (designImageOffsetX !== undefined) comp.setDesignImageOffsetX?.(parseInt2(designImageOffsetX));
		const designImageOffsetY = readXmlAttr<string | number>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.designImageOffsetY);
		if (designImageOffsetY !== undefined) comp.setDesignImageOffsetY?.(parseInt2(designImageOffsetY));
		const idNum = readXmlAttr<string | number>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.idnum);
		if (idNum !== undefined) comp.setIdNum?.(parseInt2(idNum));
		const initName = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.initName);
		if (initName !== undefined) comp.setInitName?.(initName);
		const remark = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.remark);
		if (remark !== undefined) comp.setRemark?.(remark);

		// Clip softness
		const clipSoftness = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.clipSoftness);
		if (clipSoftness) {
			const parts = clipSoftness.split(',').map(Number);
			comp.setClipSoftness?.({ x: parts[0] ?? 0, y: parts[1] ?? 0 });
		}

		// Opaque
		const opaque = readXmlAttr<string | boolean>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.opaque);
		if (opaque !== undefined) {
			comp.setOpaque?.(parseBool(opaque));
		}

		// Mask / HitTest / Custom data
		const mask = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.mask);
		if (mask !== undefined) comp.setMask?.(mask);
		const reversedMask = readXmlAttr<string | boolean>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.reversedMask);
		if (reversedMask !== undefined) comp.setReversedMask?.(parseBool(reversedMask));
		const hitTest = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.hitTest);
		if (hitTest !== undefined) comp.setHitTest?.(hitTest);
		const customData = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.customData);
		if (customData !== undefined) comp.setCustomData?.(customData);

		// Scroll pane data for overflow=scroll
		if (overflow === 'scroll') {
			const scroll = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.scroll);
			if (scroll) {
				const scrollMap: Record<string, number> = { horizontal: 0, vertical: 1, both: 2 };
				comp.setScrollType?.(scrollMap[scroll] ?? 1);
			}
			const scrollBar = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.scrollBar);
			if (scrollBar) {
				const barMap: Record<string, number> = { default: 0, visible: 1, auto: 2, hidden: 3 };
				comp.setScrollBarDisplay?.(barMap[scrollBar] ?? 0);
			}
			const scrollBarFlags = readXmlAttr<string | number>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.scrollBarFlags);
			if (scrollBarFlags !== undefined) comp.setScrollBarFlags?.(parseInt2(scrollBarFlags));
			const scrollBarMargin = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.scrollBarMargin);
			if (scrollBarMargin) {
				const parts = scrollBarMargin.split(',').map(Number);
				comp.setScrollBarMargin?.({
					top: parts[0] ?? 0,
					bottom: parts[1] ?? 0,
					left: parts[2] ?? 0,
					right: parts[3] ?? 0,
				});
			}
			const scrollBarRes = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.scrollBarRes);
			if (scrollBarRes) {
				const parts = scrollBarRes.split(',');
				comp.setVtScrollBarRes?.(parts[0] ?? '');
				comp.setHzScrollBarRes?.(parts[1] ?? '');
			}
			const ptrRes = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.ptrRes);
			if (ptrRes) {
				const parts = ptrRes.split(',');
				comp.setHeaderRes?.(parts[0] ?? '');
				comp.setFooterRes?.(parts[1] ?? '');
			}
		}

		// Extension type (Button, Label, etc.)
		const extention = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.extention);
		if (extention) {
			const extType = EXTENSION_TYPE_MAP[extention];
			if (extType) {
				comp.setExtensionType?.(extention);
				// Parse extension element attributes (e.g. <Button mode="Check" sound="..."/>)
				const extChildName = getProtocolChildName(PROJECT_XML_PROTOCOL.componentRoot, extention);
				const extElement = extChildName
					? compNode[extChildName] as ExtensionXmlNode | ExtensionXmlNode[] | undefined
					: undefined;
				if (extElement) {
					const extAttrs = getXmlNode<ExtensionXmlNode>(extElement);
					if (extAttrs) {
						switch (extention) {
							case 'Button':
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Button.attrs.mode) !== undefined) comp.setButtonMode?.(parseButtonMode(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Button.attrs.mode)!));
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Button.attrs.sound) !== undefined) comp.setSound?.(String(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Button.attrs.sound)));
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Button.attrs.soundVolumeScale) !== undefined) comp.setSoundVolumeScale?.(parseFloat2(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Button.attrs.soundVolumeScale), 1));
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Button.attrs.downEffect) !== undefined) comp.setDownEffect?.(parseInt2(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Button.attrs.downEffect)));
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Button.attrs.downEffectValue) !== undefined) comp.setDownEffectValue?.(parseFloat2(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Button.attrs.downEffectValue), 0.8));
								break;
							case 'ComboBox':
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.ComboBox.attrs.dropdown) !== undefined) comp.setDropdown?.(String(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.ComboBox.attrs.dropdown)));
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.ComboBox.attrs.selectionController) !== undefined) comp.setSelectionController?.(String(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.ComboBox.attrs.selectionController)));
								break;
							case 'Label':
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Label.attrs.prompt) !== undefined) comp.setPromptText?.(String(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Label.attrs.prompt)));
								break;
							case 'ProgressBar':
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.ProgressBar.attrs.titleType) !== undefined) comp.setTitleType?.(parseTitleType(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.ProgressBar.attrs.titleType)!));
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.ProgressBar.attrs.reverse) !== undefined) comp.setReverse?.(parseBool(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.ProgressBar.attrs.reverse)));
								break;
							case 'Slider':
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Slider.attrs.titleType) !== undefined) comp.setTitleType?.(parseTitleType(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Slider.attrs.titleType)!));
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Slider.attrs.reverse) !== undefined) comp.setReverse?.(parseBool(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Slider.attrs.reverse)));
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Slider.attrs.wholeNumbers) !== undefined) comp.setWholeNumbers?.(parseBool(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Slider.attrs.wholeNumbers)));
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Slider.attrs.changeOnClick) !== undefined) comp.setChangeOnClick?.(parseBool(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Slider.attrs.changeOnClick)));
								break;
							case 'ScrollBar':
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.ScrollBar.attrs.fixedGripSize) !== undefined) comp.setFixedGripSize?.(parseBool(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.ScrollBar.attrs.fixedGripSize)));
								break;
							default:
								break;
						}
					}
				}
			}
		}

		// Build a local controller map for this component
		const localControllers = new Map<string, Controller>();

		// Controllers
		const controllers = ensureArray(compNode.controller);
		for (const ctrlDef of controllers) {
			const ctrlName = readXmlAttr<string>(ctrlDef, PROJECT_XML_PROTOCOL.controller.attrs.name) ?? '';
			const ctrl = doc.createController(ctrlName);
			const selected = readXmlAttr<string | number>(ctrlDef, PROJECT_XML_PROTOCOL.controller.attrs.selected);
			ctrl.setSelectedIndex(parseInt2(selected));

			// Parse pages: "0,up,1,down,2,over" → [{id:"0",name:"up"}, ...]
			const pagesAttr = readXmlAttr<string>(ctrlDef, PROJECT_XML_PROTOCOL.controller.attrs.pages) ?? '';
			const pages = parseControllerPages(pagesAttr);
			for (const page of pages) {
				const p = doc.createControllerPage(page.name);
				p.setId(page.id);
				ctrl.addPage(p);
			}

			const controllerActionChildName = getProtocolChildName(PROJECT_XML_PROTOCOL.controller, 'action');
			const actions = controllerActionChildName ? ensureArray(ctrlDef[controllerActionChildName]) : [];
			for (let actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
				const actionDef = getXmlNode<ControllerActionXmlNode>(actions[actionIndex]);
				if (!actionDef) continue;
				const action = doc.createControllerAction(`${ctrl.getName()}_action${actionIndex}`);
				const actionType = parseControllerActionType(readXmlAttr<string>(actionDef, PROJECT_XML_PROTOCOL.controllerAction.attrs.type));
				const fromPage = readXmlAttr<string>(actionDef, PROJECT_XML_PROTOCOL.controllerAction.attrs.fromPage);
				const toPage = readXmlAttr<string>(actionDef, PROJECT_XML_PROTOCOL.controllerAction.attrs.toPage);
				action
					.setActionType(actionType)
					.setFromPage(parseControllerActionPages(fromPage))
					.setToPage(parseControllerActionPages(toPage));
				switch (actionType) {
					case ControllerActionType.PlayTransition: {
						const transitionName = readXmlAttr<string>(actionDef, PROJECT_XML_PROTOCOL.controllerAction.attrs.transition);
						const repeat = readXmlAttr<string | number>(actionDef, PROJECT_XML_PROTOCOL.controllerAction.attrs.repeat);
						const delay = readXmlAttr<string | number>(actionDef, PROJECT_XML_PROTOCOL.controllerAction.attrs.delay);
						const stopOnExit = readXmlAttr<string | boolean>(actionDef, PROJECT_XML_PROTOCOL.controllerAction.attrs.stopOnExit);
						action
							.setTransitionName(getXmlScalar(transitionName))
							.setPlayTimes(parseInt2(repeat, 1))
							.setDelay(parseFloat2(delay))
							.setStopOnExit(parseBool(stopOnExit));
						break;
					}
					case ControllerActionType.ChangePage: {
						const objectId = readXmlAttr<string>(actionDef, PROJECT_XML_PROTOCOL.controllerAction.attrs.objectId);
						const controllerName = readXmlAttr<string>(actionDef, PROJECT_XML_PROTOCOL.controllerAction.attrs.controller);
						const targetPage = readXmlAttr<string>(actionDef, PROJECT_XML_PROTOCOL.controllerAction.attrs.targetPage);
						action
							.setObjectId(getXmlScalar(objectId))
							.setControllerName(getXmlScalar(controllerName))
							.setTargetPage(getXmlScalar(targetPage));
						break;
					}
					default:
						break;
				}
				ctrl.addAction(action);
			}

			comp.addController(ctrl);
			localControllers.set(ctrl.getName(), ctrl);
		}

		// Display list
		if (orderedDisplayItems.length > 0) {
			for (const { tagName, attrs } of orderedDisplayItems) {
				assertDisplayListTagAllowed(tagName, attrs, comp.getName());
				const child = createDisplayObject(ctx, doc, tagName, attrs, localControllers);
				if (child) comp.addChild(child);
			}
		} else {
			const displayList = compNode.displayList;
			if (displayList) {
				for (const tagName of Object.keys(displayList)) {
					const items = ensureArray(displayList[tagName]);
					for (const itemDef of items) {
						assertDisplayListTagAllowed(tagName, itemDef, comp.getName());
						const child = createDisplayObject(ctx, doc, tagName, itemDef, localControllers);
						if (child) {
							comp.addChild(child);
						}
					}
				}
			}
		}

		// Transitions
		const transitions = ensureArray(compNode.transition);
		for (const transDef of transitions) {
			const transitionName = readXmlAttr<string>(transDef, PROJECT_XML_PROTOCOL.transition.attrs.name) ?? '';
			const trans = doc.createTransition(transitionName);
			const autoPlay = readXmlAttr<string | boolean>(transDef, PROJECT_XML_PROTOCOL.transition.attrs.autoPlay);
			const autoPlayTimes = readXmlAttr<string | number>(transDef, PROJECT_XML_PROTOCOL.transition.attrs.autoPlayTimes);
			const autoPlayDelay = readXmlAttr<string | number>(transDef, PROJECT_XML_PROTOCOL.transition.attrs.autoPlayDelay);
			const options = readXmlAttr<string | number>(transDef, PROJECT_XML_PROTOCOL.transition.attrs.options);
			const fps = readXmlAttr<string | number>(transDef, PROJECT_XML_PROTOCOL.transition.attrs.fps);
			trans.setAutoPlay(parseBool(autoPlay));
			trans.setAutoPlayTimes(parseInt2(autoPlayTimes, 1));
			trans.setAutoPlayDelay(parseFloat2(autoPlayDelay));
			if (options !== undefined) trans.setOptions?.(parseInt2(options));
			if (fps !== undefined) trans.setFps?.(parseInt2(fps));

			const transitionItemChildName = getProtocolChildName(PROJECT_XML_PROTOCOL.transition, 'item');
			const items = transitionItemChildName ? ensureArray(transDef[transitionItemChildName]) : [];
			for (const itemDef of items) {
				const parsedItem = getXmlNode<TransitionItemXmlNode>(itemDef);
				if (!parsedItem) continue;
				const ti = doc.createTransitionItem();
				const time = readXmlAttr<string | number>(parsedItem, PROJECT_XML_PROTOCOL.transitionItem.attrs.time);
				const target = readXmlAttr<string>(parsedItem, PROJECT_XML_PROTOCOL.transitionItem.attrs.target);
				const tween = readXmlAttr<string | boolean>(parsedItem, PROJECT_XML_PROTOCOL.transitionItem.attrs.tween);
				const duration = readXmlAttr<string | number>(parsedItem, PROJECT_XML_PROTOCOL.transitionItem.attrs.duration);
				const repeat = readXmlAttr<string | number>(parsedItem, PROJECT_XML_PROTOCOL.transitionItem.attrs.repeat);
				const yoyo = readXmlAttr<string | boolean>(parsedItem, PROJECT_XML_PROTOCOL.transitionItem.attrs.yoyo);
				const label = readXmlAttr<string>(parsedItem, PROJECT_XML_PROTOCOL.transitionItem.attrs.label);
				const label2 = readXmlAttr<string>(parsedItem, PROJECT_XML_PROTOCOL.transitionItem.attrs.label2);
				const pathValue = readXmlAttr<string>(parsedItem, PROJECT_XML_PROTOCOL.transitionItem.attrs.path);
				const customEaseValue = readXmlAttr<string>(parsedItem, PROJECT_XML_PROTOCOL.transitionItem.attrs.customEase);
				ti.setTime(parseFloat2(time));
				ti.setTargetId(target || '');
				ti.setTween(parseBool(tween));
				ti.setDuration(parseFloat2(duration));
				ti.setRepeat(parseInt2(repeat));
				ti.setYoyo(parseBool(yoyo));
				ti.setLabel(label || '');
				if (label2 !== undefined) ti.setEndLabel?.(label2);
				if (pathValue !== undefined) ti.setPath?.(pathValue);
				if (customEaseValue !== undefined) ti.setCustomEasePath?.(customEaseValue);

				// Ease type
				const ease = readXmlAttr<string>(parsedItem, PROJECT_XML_PROTOCOL.transitionItem.attrs.ease);
				if (ease) {
					ti.setEaseType?.(_parseEaseType(ease));
				}

				// Action type from string
				const typeStr = (readXmlAttr<string>(parsedItem, PROJECT_XML_PROTOCOL.transitionItem.attrs.type) || '').toUpperCase();
				const actionTypeMap: Record<string, number> = {
					XY: 0, SIZE: 1, SCALE: 2, PIVOT: 3, ALPHA: 4, ROTATION: 5,
					COLOR: 6, ANIMATION: 7, VISIBLE: 8, SOUND: 9, TRANSITION: 10,
					SHAKE: 11, COLORFILTER: 12, SKEW: 13, TEXT: 14, ICON: 15,
				};
				ti.setActionType(actionTypeMap[typeStr] ?? 16);

				// Values
				const value = readXmlAttr<string>(parsedItem, PROJECT_XML_PROTOCOL.transitionItem.attrs.value);
				if (value !== undefined) {
					ti.setStartValue(String(value).split(','));
				}
				const startValue = readXmlAttr<string>(parsedItem, PROJECT_XML_PROTOCOL.transitionItem.attrs.startValue);
				if (startValue !== undefined) {
					ti.setStartValue(String(startValue).split(','));
				}
				const endValue = readXmlAttr<string>(parsedItem, PROJECT_XML_PROTOCOL.transitionItem.attrs.endValue);
				if (endValue !== undefined) {
					ti.setEndValue(String(endValue).split(','));
				}

				trans.addItem(ti);
			}

			comp.addTransition(trans);
		}
	}

