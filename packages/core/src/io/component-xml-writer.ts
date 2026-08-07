import { XMLBuilder } from 'fast-xml-parser';
import { ControllerActionType, TransitionActionType } from '../constants.js';
import type { Component } from '../properties/component.js';
import type { Controller } from '../properties/controller.js';
import type { Transition } from '../properties/transition.js';
import {
	EXTENSION_PROTOCOL_MAP,
	formatButtonDownEffect,
	formatButtonDownEffectValue,
	formatButtonMode,
	formatInsets,
	formatProjectInt32,
	formatProjectInt32List,
	formatTitleType,
	getProtocolChildName,
	hasNonZeroInsets,
	serializeDisplayList,
} from './display-object-xml-writer.js';
import type { FileSystem } from './file-system.js';
import { PROJECT_XML_PROTOCOL, writeXmlAttr } from './project-xml-protocol.js';

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

function almostEqual(a: number, b: number, epsilon = 0.000001): boolean {
	return Math.abs(a - b) <= epsilon;
}

function formatTrimmedFixed(value: number, precision = 2): string {
	return value
		.toFixed(precision)
		.replace(/(\.\d*?[1-9])0+$/, '$1')
		.replace(/\.0+$/, '');
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
	getDesignImage?(): string;
	getDesignImageForTest?(): boolean;
	getDesignImageAlpha?(): number;
	getDesignImageLayer?(): number;
	getDesignImageOffsetX?(): number;
	getDesignImageOffsetY?(): number;
	getIdNum?(): number;
	getInitName?(): string;
	getRemark?(): string;
	getCustomExtensionId?(): string;
	getPageController?(): string;
	getAddedToStageSound?(): string;
	getRemovedFromStageSound?(): string;
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
	getAutoClearItems?(): boolean;
	getCustomProperties?(): Array<{ target: string; propertyId: 0 | 1; label: string }>;
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


export async function writeComponent(
	fs: FileSystem,
	comp: Component,
	pkgDir: string,
	sourceRelativePath: string,
): Promise<void> {
		const typedComp = comp as WritableComponent;
		const targetPath = fs.join(pkgDir, sourceRelativePath);
		await fs.mkdir(fs.dirname(targetPath));

		const compAttrs: Record<string, unknown> = {};
		const [w, h] = [typedComp.getWidth?.() ?? 0, typedComp.getHeight?.() ?? 0];
		if (w || h) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.size, formatProjectInt32List([w, h], 'component size'));
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
		if (hasNonZeroInsets(margin)) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.margin, formatInsets(margin!, 'component margin'));
		const restrictSize = [
			typedComp.getMinWidth?.() ?? 0,
			typedComp.getMaxWidth?.() ?? 0,
			typedComp.getMinHeight?.() ?? 0,
			typedComp.getMaxHeight?.() ?? 0,
		];
		if (restrictSize.some((value) => value !== 0)) {
			writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.restrictSize, formatProjectInt32List(restrictSize, 'component restrictSize'));
		}
		if (typedComp.getBgColorEnabled?.()) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.bgColorEnabled, 'true');
		const bgColor = typedComp.getBgColor?.();
		if (bgColor) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.bgColor, bgColor);
		const designImage = typedComp.getDesignImage?.();
		if (designImage) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.designImage, designImage);
		if (typedComp.getDesignImageForTest?.()) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.designImageForTest, 'true');
		const designImageAlpha = typedComp.getDesignImageAlpha?.() ?? 50;
		if (designImageAlpha !== 50) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.designImageAlpha, String(designImageAlpha));
		const designImageLayer = typedComp.getDesignImageLayer?.() ?? 0;
		if (designImageLayer !== 0) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.designImageLayer, String(designImageLayer));
		const designImageOffsetX = typedComp.getDesignImageOffsetX?.() ?? 0;
		if (designImageOffsetX !== 0) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.designImageOffsetX, formatProjectInt32(designImageOffsetX, 'designImageOffsetX'));
		const designImageOffsetY = typedComp.getDesignImageOffsetY?.() ?? 0;
		if (designImageOffsetY !== 0) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.designImageOffsetY, formatProjectInt32(designImageOffsetY, 'designImageOffsetY'));
		const idNum = typedComp.getIdNum?.() ?? 0;
		if (idNum !== 0) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.idnum, String(idNum));
		const initName = typedComp.getInitName?.();
		if (initName) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.initName, initName);
		const remark = typedComp.getRemark?.();
		if (remark) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.remark, remark);
		const customExtensionId = typedComp.getCustomExtensionId?.();
		if (customExtensionId) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.customExtention, customExtensionId);
		const pageController = typedComp.getPageController?.();
		if (pageController) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.pageController, pageController);
		const showSound = typedComp.getAddedToStageSound?.();
		if (showSound) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.showSound, showSound);
		const hideSound = typedComp.getRemovedFromStageSound?.();
		if (hideSound) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.hideSound, hideSound);
		const clipSoftness = typedComp.getClipSoftness?.();
		if (clipSoftness && ((clipSoftness.x ?? 0) !== 0 || (clipSoftness.y ?? 0) !== 0)) {
			writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.clipSoftness, formatProjectInt32List([
				clipSoftness.x ?? 0,
				clipSoftness.y ?? 0,
			], 'component clipSoftness'));
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
			if (hasNonZeroInsets(scrollBarMargin)) writeXmlAttr(compAttrs, PROJECT_XML_PROTOCOL.componentRoot.attrs.scrollBarMargin, formatInsets(scrollBarMargin!, 'component scrollBarMargin'));
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
				compNode[controllerChildName] = controllers.map((ctrl) => serializeController(ctrl));
			}
		}

		// Display list
		const children = comp.listChildren();
		if (children.length > 0) {
			compNode.displayList = serializeDisplayList(children);
		}

		// Transitions
		const transitions = comp.listTransitions();
		if (transitions.length > 0) {
			const transitionChildName = getProtocolChildName(PROJECT_XML_PROTOCOL.componentRoot, 'transition');
			if (transitionChildName) {
				compNode[transitionChildName] = transitions.map((t) => serializeTransition(t));
			}
		}

		const customProperties = typedComp.getCustomProperties?.() ?? [];
		const customPropertyChildName = getProtocolChildName(PROJECT_XML_PROTOCOL.componentRoot, 'customProperty');
		const customPropertyProtocol = PROJECT_XML_PROTOCOL.componentRoot.children!.customProperty!;
		if (customProperties.length > 0 && customPropertyChildName) {
			compNode[customPropertyChildName] = customProperties.map((property) => {
				const attrs: Record<string, unknown> = {};
				writeXmlAttr(attrs, customPropertyProtocol?.attrs.target, property.target);
				writeXmlAttr(attrs, customPropertyProtocol?.attrs.propertyId, String(property.propertyId));
				if (property.label) writeXmlAttr(attrs, customPropertyProtocol?.attrs.label, property.label);
				return attrs;
			});
		}

		if (extType) {
			const extProtocol = EXTENSION_PROTOCOL_MAP[extType as keyof typeof EXTENSION_PROTOCOL_MAP];
			const extSpecs = extProtocol.attrs as Record<string, { canonical: string }>;
			const extAttrs: Record<string, unknown> = {};
			switch (extType) {
				case 'Button': {
					if ((typedComp.getButtonMode?.() ?? 0) !== 0) writeXmlAttr(extAttrs, extSpecs.mode, formatButtonMode(typedComp.getButtonMode?.() ?? 0));
					if (typedComp.getSound?.()) writeXmlAttr(extAttrs, extSpecs.sound, typedComp.getSound?.());
					if ((typedComp.getSoundVolumeScale?.() ?? 1) !== 1) writeXmlAttr(extAttrs, extSpecs.soundVolumeScale, String(Math.round((typedComp.getSoundVolumeScale?.() ?? 1) * 100)));
					const downEffect = typedComp.getDownEffect?.() ?? 0;
					if (downEffect !== 0) {
						writeXmlAttr(extAttrs, extSpecs.downEffect, formatButtonDownEffect(downEffect));
						writeXmlAttr(extAttrs, extSpecs.downEffectValue, formatButtonDownEffectValue(typedComp.getDownEffectValue?.() ?? 0.8));
					}
					break;
				}
				case 'ComboBox':
					if (typedComp.getDropdown?.()) writeXmlAttr(extAttrs, extSpecs.dropdown, typedComp.getDropdown?.());
					if (typedComp.getSelectionController?.()) writeXmlAttr(extAttrs, extSpecs.selectionController, typedComp.getSelectionController?.());
					if (typedComp.getAutoClearItems?.()) writeXmlAttr(extAttrs, extSpecs.autoClearItems, 'true');
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

		await fs.writeFile(targetPath, builder.build(xmlObj) as string);
}

function serializeController(ctrl: Controller): Record<string, unknown> {
		const pages = ctrl.listPages();
		const pagesStr = pages.map((p) => `${p.getId()},${p.getName()}`).join(',');
		const attrs: Record<string, unknown> = {};
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.controller.attrs.name, ctrl.getName());
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.controller.attrs.pages, pagesStr);
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.controller.attrs.selected, String(ctrl.getSelectedIndex()));
		if (ctrl.getAlias()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.controller.attrs.alias, ctrl.getAlias());
		if (ctrl.getAutoRadioGroupDepth()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.controller.attrs.autoRadioGroupDepth, 'true');
		if (ctrl.getExported()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.controller.attrs.exported, 'true');
		if (ctrl.getHomePageType() !== 'default') {
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.controller.attrs.homePageType, ctrl.getHomePageType());
		}
		if (ctrl.getHomePageType() === 'specific' || ctrl.getHomePageType() === 'variable') {
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.controller.attrs.homePage, ctrl.getHomePage());
		}
		const remarkProtocol = PROJECT_XML_PROTOCOL.controller.children!.remark!;
		const remarks = pages.flatMap((page, pageIndex) => {
			if (!page.getRemark()) return [];
			const remarkAttrs: Record<string, unknown> = {};
			writeXmlAttr(remarkAttrs, remarkProtocol.attrs.page, String(pageIndex));
			writeXmlAttr(remarkAttrs, remarkProtocol.attrs.value, page.getRemark());
			return [remarkAttrs];
		});
		const remarkChildName = getProtocolChildName(PROJECT_XML_PROTOCOL.controller, 'remark');
		if (remarks.length > 0 && remarkChildName) attrs[remarkChildName] = remarks;
		const actions = ctrl.listActions().map((action) => serializeControllerAction(action as WritableControllerAction));
		const actionChildName = getProtocolChildName(PROJECT_XML_PROTOCOL.controller, 'action');
		if (actions.length > 0 && actionChildName) attrs[actionChildName] = actions;
		return attrs;
}

function serializeControllerAction(action: WritableControllerAction): Record<string, unknown> {
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


function serializeTransition(trans: Transition): Record<string, unknown> {
		const attrs: Record<string, unknown> = {};
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.transition.attrs.name, trans.getName());
		if (trans.getAutoPlay()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.transition.attrs.autoPlay, 'true');
		if (trans.getAutoPlayTimes() !== 1) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.transition.attrs.autoPlayTimes, String(trans.getAutoPlayTimes()));
		if (trans.getAutoPlayDelay() !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.transition.attrs.autoPlayDelay, String(trans.getAutoPlayDelay()));
		if (trans.getOptions() !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.transition.attrs.options, String(trans.getOptions()));
		if (trans.getFps() !== 24) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.transition.attrs.fps, String(trans.getFps()));

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
			if (item.getEaseType() === 31 && item.getCustomEasePath()) {
				writeXmlAttr(ia, PROJECT_XML_PROTOCOL.transitionItem.attrs.customEase, item.getCustomEasePath());
			}
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
