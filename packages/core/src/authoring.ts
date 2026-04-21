import { EaseType, GearType } from './constants.js';
import type { Document } from './document.js';
import type { Component } from './properties/component.js';
import type { Controller } from './properties/controller.js';
import type { GObject } from './properties/g-object.js';
import type { Gear } from './properties/gear.js';
import type { Transition } from './properties/transition.js';
import type { TransitionItem } from './properties/transition-item.js';

export interface ControllerPageComposition {
	id: string;
	name: string;
}

export interface ControllerActionComposition {
	name?: string;
	actionType: number;
	fromPage?: string[];
	toPage?: string[];
	transitionName?: string;
	playTimes?: number;
	delay?: number;
	stopOnExit?: boolean;
	object?: GObject | string | null;
	controllerName?: string;
	targetPage?: string;
}

export interface ControllerCompositionOptions {
	name: string;
	selectedIndex?: number;
	autoRadioGroupDepth?: boolean;
	pages: ControllerPageComposition[];
	actions?: ControllerActionComposition[];
}

export interface TransitionItemComposition {
	name?: string;
	time: number;
	actionType: number;
	target?: GObject | string | null;
	tween?: boolean;
	duration?: number;
	startValue?: unknown[];
	endValue?: unknown[];
	easeType?: number;
	repeat?: number;
	yoyo?: boolean;
	label?: string;
	endLabel?: string;
	path?: string;
	customEasePath?: string;
}

export interface TransitionCompositionOptions {
	name: string;
	autoPlay?: boolean;
	autoPlayTimes?: number;
	autoPlayDelay?: number;
	options?: number;
	fps?: number;
	items?: TransitionItemComposition[];
}

export interface LookGearBindingValue {
	alpha?: number;
	rotation?: number;
	grayed?: boolean;
	touchable?: boolean;
}

export interface LookGearBindingState {
	pageId: string;
	value?: LookGearBindingValue | null;
}

export interface LookGearBindingOptions {
	name?: string;
	controller: Controller;
	states: LookGearBindingState[];
	defaultValue: LookGearBindingValue;
	condition?: string;
	positionsInPercent?: boolean;
	tween?: boolean;
	tweenDuration?: number;
	tweenDelay?: number;
	easeType?: number;
	customEasePath?: string;
}

function resolveComponentChildId(component: Component, target: GObject | string | null | undefined, owner: string): string {
	if (!target) return '';
	if (typeof target === 'string') {
		const child = component.getChildById(target);
		if (!child) {
			throw new Error(`${owner}: target child "${target}" does not belong to component "${component.getName()}".`);
		}
		return target;
	}
	const targetId = target.getId();
	if (!targetId || component.getChildById(targetId) !== target) {
		throw new Error(`${owner}: target child "${target.getName()}" does not belong to component "${component.getName()}".`);
	}
	return targetId;
}

function ensureUniquePageIds(pages: ControllerPageComposition[], component: Component): void {
	const seen = new Set<string>();
	for (const page of pages) {
		if (!page.id) {
			throw new Error(`composeController: page "${page.name}" in component "${component.getName()}" is missing an id.`);
		}
		if (seen.has(page.id)) {
			throw new Error(`composeController: duplicate page id "${page.id}" in component "${component.getName()}".`);
		}
		seen.add(page.id);
	}
}

function ensureComponentOwnsController(component: Component, controller: Controller, owner: string): void {
	if (!component.listControllers().includes(controller)) {
		throw new Error(`${owner}: controller "${controller.getName()}" does not belong to component "${component.getName()}".`);
	}
}

function ensureUniqueStatePageIds(states: LookGearBindingState[], owner: string): void {
	const seen = new Set<string>();
	for (const state of states) {
		if (!state.pageId) {
			throw new Error(`${owner}: state is missing pageId.`);
		}
		if (seen.has(state.pageId)) {
			throw new Error(`${owner}: duplicate state page id "${state.pageId}".`);
		}
		seen.add(state.pageId);
	}
}

function ensureKnownPageIds(
	owner: string,
	contextLabel: string,
	pageIds: string[],
	knownPageIds: Set<string>,
	fieldName: string,
): void {
	for (const pageId of pageIds) {
		if (!knownPageIds.has(pageId)) {
			throw new Error(`${owner}: ${fieldName} references unknown page id "${pageId}" in ${contextLabel}.`);
		}
	}
}

function serializeLookGearValue(value: LookGearBindingValue): string {
	const alpha = value.alpha ?? 1;
	const rotation = value.rotation ?? 0;
	const grayed = value.grayed ?? false;
	const touchable = value.touchable ?? true;
	return `${alpha},${rotation},${grayed ? 'true' : 'false'},${touchable ? 'true' : 'false'}`;
}

function serializeOptionalLookGearValue(value: LookGearBindingValue | null | undefined): string {
	if (!value) return '-';
	return serializeLookGearValue(value);
}

/**
 * Compose and attach a controller with its pages and actions in one step.
 *
 * This helper is intentionally narrow: it wraps the multi-object assembly flow
 * for controller authoring, while still returning the underlying formal model nodes.
 */
export function composeController(
	doc: Document,
	component: Component,
	options: ControllerCompositionOptions,
): Controller {
	if (component.getController(options.name)) {
		throw new Error(`composeController: component "${component.getName()}" already has a controller named "${options.name}".`);
	}
	if (options.pages.length === 0) {
		throw new Error(`composeController: controller "${options.name}" must define at least one page.`);
	}

	ensureUniquePageIds(options.pages, component);
	const knownPageIds = new Set(options.pages.map((page) => page.id));

	const controller = doc.createController(options.name)
		.setSelectedIndex(options.selectedIndex ?? 0)
		.setAutoRadioGroupDepth(options.autoRadioGroupDepth ?? false);

	if (controller.getSelectedIndex() < 0 || controller.getSelectedIndex() >= options.pages.length) {
		throw new Error(
			`composeController: selectedIndex ${controller.getSelectedIndex()} is out of range for controller "${options.name}".`,
		);
	}

	for (const pageInput of options.pages) {
		controller.addPage(
			doc.createControllerPage(pageInput.name).setId(pageInput.id),
		);
	}

	for (const actionInput of options.actions ?? []) {
		const fromPage = [...(actionInput.fromPage ?? [])];
		const toPage = [...(actionInput.toPage ?? [])];
		ensureKnownPageIds('composeController', `controller "${options.name}"`, fromPage, knownPageIds, 'action fromPage');
		ensureKnownPageIds('composeController', `controller "${options.name}"`, toPage, knownPageIds, 'action toPage');

		const action = doc.createControllerAction(actionInput.name ?? '');
		action
			.setActionType(actionInput.actionType)
			.setFromPage(fromPage)
			.setToPage(toPage)
			.setTransitionName(actionInput.transitionName ?? '')
			.setPlayTimes(actionInput.playTimes ?? 1)
			.setDelay(actionInput.delay ?? 0)
			.setStopOnExit(actionInput.stopOnExit ?? false)
			.setObjectId(resolveComponentChildId(component, actionInput.object, 'composeController'))
			.setControllerName(actionInput.controllerName ?? '')
			.setTargetPage(actionInput.targetPage ?? '');
		controller.addAction(action);
	}

	component.addController(controller);
	return controller;
}

/**
 * Compose and attach a transition with its items in one step.
 *
 * The helper validates target membership against the component to reduce
 * reference-wiring mistakes while preserving the underlying transition model.
 */
export function composeTransition(
	doc: Document,
	component: Component,
	options: TransitionCompositionOptions,
): Transition {
	if (component.getTransition(options.name)) {
		throw new Error(`composeTransition: component "${component.getName()}" already has a transition named "${options.name}".`);
	}

	const transition = doc.createTransition(options.name)
		.setAutoPlay(options.autoPlay ?? false)
		.setAutoPlayTimes(options.autoPlayTimes ?? 1)
		.setAutoPlayDelay(options.autoPlayDelay ?? 0)
		.setOptions(options.options ?? 0)
		.setFps(options.fps ?? 24);

	for (const itemInput of options.items ?? []) {
		const item: TransitionItem = doc.createTransitionItem(itemInput.name ?? '');
		item
			.setTime(itemInput.time)
			.setTargetId(resolveComponentChildId(component, itemInput.target, 'composeTransition'))
			.setActionType(itemInput.actionType)
			.setTween(itemInput.tween ?? false)
			.setDuration(itemInput.duration ?? 0)
			.setStartValue([...(itemInput.startValue ?? [])])
			.setEndValue([...(itemInput.endValue ?? [])])
			.setEaseType(itemInput.easeType ?? EaseType.QuadOut)
			.setRepeat(itemInput.repeat ?? 0)
			.setYoyo(itemInput.yoyo ?? false)
			.setLabel(itemInput.label ?? '')
			.setEndLabel(itemInput.endLabel ?? '')
			.setPath(itemInput.path ?? '')
			.setCustomEasePath(itemInput.customEasePath ?? '');
		transition.addItem(item);
	}

	component.addTransition(transition);
	return transition;
}

/**
 * Compose and attach a Look gear binding with structured semantic input.
 *
 * The helper intentionally keeps the public contract controller/page-aware and
 * object-structured, while centralizing the string-shaped gear payload assembly
 * and validating membership before attach.
 */
export function bindLookGear(
	doc: Document,
	component: Component,
	target: GObject,
	options: LookGearBindingOptions,
): Gear {
	if (target.getId() === '' || component.getChildById(target.getId()) !== target) {
		throw new Error(`bindLookGear: target "${target.getName()}" does not belong to component "${component.getName()}".`);
	}

	ensureComponentOwnsController(component, options.controller, 'bindLookGear');
	ensureUniqueStatePageIds(options.states, 'bindLookGear');

	const knownPageIds = new Set(options.controller.listPages().map((page) => page.getId()));
	const statePageIds = options.states.map((state) => state.pageId);
	ensureKnownPageIds('bindLookGear', `controller "${options.controller.getName()}"`, statePageIds, knownPageIds, 'state pageId');

	const gear = doc.createGear(options.name ?? '')
		.setGearType(GearType.Look)
		.setController(options.controller)
		.setPages(statePageIds.join(','))
		.setValues(options.states.map((state) => serializeOptionalLookGearValue(state.value)).join('|'))
		.setDefaultValue(serializeLookGearValue(options.defaultValue))
		.setCondition(options.condition ?? '')
		.setPositionsInPercent(options.positionsInPercent ?? false)
		.setTween(options.tween ?? false)
		.setTweenDuration(options.tweenDuration ?? 0.3)
		.setTweenDelay(options.tweenDelay ?? 0)
		.setEaseType(options.easeType ?? EaseType.QuadOut)
		.setCustomEasePath(options.customEasePath ?? '');

	target.addGear(gear);
	return gear;
}
