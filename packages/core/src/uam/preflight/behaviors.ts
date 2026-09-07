import {
	type UamComponentModel,
	type UamControllerModel,
	type UamGearBinding,
	type UamProject,
	UAM_SUPPORTED_TRANSACTION_SCOPE,
} from '../model.js';
import type {
	AddGearOperation,
	UamComponentSelector,
	UamControllerSelector,
	UamGearSelector,
	RemoveGearOperation,
	UamTransitionSelector,
	UamTransactionOperation,
	UamTransactionSupportIssue,
	UpdateGearOperation,
} from '../transaction-contracts.js';
import { findComponentSpec, findDisplayNodeSpec } from '../transaction-shared.js';
import { isValidUamXYGearValue } from '../validate.js';
import { pushSupportIssue, validateTouchedDisplayNodeKind } from './support.js';

function validateControllerActionTargets(
	project: UamProject,
	selector: UamComponentSelector,
	controller: UamControllerModel,
	path: string,
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
): void {
	for (const [actionIndex, action] of controller.actions.entries()) {
		if (!action.targetNodeId) continue;
		validateTouchedDisplayNodeKind(
			project,
			{
				packageId: selector.packageId,
				componentResourceId: selector.componentResourceId,
				displayNodeId: action.targetNodeId,
			},
			`${path}.actions[${actionIndex}].targetNodeId`,
			issues,
			operationKind,
		);
	}
}

function validateTransitionTargets(
	project: UamProject,
	selector: UamComponentSelector,
	transition: UamComponentModel['transitions'][number],
	path: string,
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
): void {
	for (const [itemIndex, item] of transition.items.entries()) {
		if (!item.targetNodeId) continue;
		validateTouchedDisplayNodeKind(
			project,
			{
				packageId: selector.packageId,
				componentResourceId: selector.componentResourceId,
				displayNodeId: item.targetNodeId,
			},
			`${path}.items[${itemIndex}].targetNodeId`,
			issues,
			operationKind,
		);
	}
}

function validateUniquePageIds(
	pages: UamControllerModel['pages'],
	path: string,
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
): void {
	const seen = new Set<string>();
	for (const [pageIndex, page] of pages.entries()) {
		if (!page.id) {
			pushSupportIssue(
				issues,
				'invalid_controller_payload',
				`${path}.pages[${pageIndex}].id`,
				'Controller page id must not be empty.',
				{ operationKind },
			);
			continue;
		}
		if (seen.has(page.id)) {
			pushSupportIssue(
				issues,
				'invalid_controller_payload',
				`${path}.pages[${pageIndex}].id`,
				`Duplicate controller page id "${page.id}".`,
				{ operationKind },
			);
		}
		seen.add(page.id);
	}
}

function validateControllerPayload(
	selector: UamControllerSelector,
	controller: UamControllerModel,
	path: string,
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
): void {
	if (controller.name !== selector.controllerName) {
		pushSupportIssue(
			issues,
			'invalid_controller_payload',
			`${path}.controller.name`,
			'Controller payload name must match selector.controllerName.',
			{ operationKind },
		);
	}
	if (controller.pages.length === 0) {
		pushSupportIssue(
			issues,
			'invalid_controller_payload',
			`${path}.controller.pages`,
			'Controller payload must define at least one page.',
			{ operationKind },
		);
	}
	validateUniquePageIds(controller.pages, `${path}.controller`, issues, operationKind);
	if (controller.selectedIndex < 0 || controller.selectedIndex >= controller.pages.length) {
		pushSupportIssue(
			issues,
			'invalid_controller_payload',
			`${path}.controller.selectedIndex`,
			'Controller selectedIndex is out of range.',
			{ operationKind },
		);
	}
	const pageIds = new Set(controller.pages.map((page) => page.id));
	if (typeof controller.autoRadioGroupDepth !== 'boolean') {
		pushSupportIssue(issues, 'invalid_controller_payload', `${path}.controller.autoRadioGroupDepth`, 'Controller autoRadioGroupDepth must be boolean.', { operationKind });
	}
	if (typeof controller.alias !== 'string') {
		pushSupportIssue(issues, 'invalid_controller_payload', `${path}.controller.alias`, 'Controller alias must be a string.', { operationKind });
	}
	if (typeof controller.exported !== 'boolean') {
		pushSupportIssue(issues, 'invalid_controller_payload', `${path}.controller.exported`, 'Controller exported must be boolean.', { operationKind });
	}
	if (!['default', 'specific', 'branch', 'variable'].includes(controller.homePageType)) {
		pushSupportIssue(issues, 'invalid_controller_payload', `${path}.controller.homePageType`, `Unknown controller home page type "${controller.homePageType}".`, { operationKind });
	} else if (typeof controller.homePage !== 'string') {
		pushSupportIssue(issues, 'invalid_controller_payload', `${path}.controller.homePage`, 'Controller homePage must be a string.', { operationKind });
	} else if (controller.homePageType === 'specific' && !pageIds.has(controller.homePage)) {
		pushSupportIssue(issues, 'invalid_controller_payload', `${path}.controller.homePage`, `Unknown controller home page id "${controller.homePage}".`, { operationKind });
	} else if (controller.homePageType === 'variable' && !controller.homePage) {
		pushSupportIssue(issues, 'invalid_controller_payload', `${path}.controller.homePage`, 'Variable controller home page requires a custom property key.', { operationKind });
	} else if ((controller.homePageType === 'default' || controller.homePageType === 'branch') && controller.homePage) {
		pushSupportIssue(issues, 'invalid_controller_payload', `${path}.controller.homePage`, `Controller home page must be empty for "${controller.homePageType}".`, { operationKind });
	}
	for (const [actionIndex, action] of controller.actions.entries()) {
		for (const pageId of action.fromPageIds) {
			if (!pageIds.has(pageId)) {
				pushSupportIssue(
					issues,
					'invalid_controller_payload',
					`${path}.controller.actions[${actionIndex}].fromPageIds`,
					`Unknown controller page id "${pageId}".`,
					{ operationKind },
				);
			}
		}
		for (const pageId of action.toPageIds) {
			if (!pageIds.has(pageId)) {
				pushSupportIssue(
					issues,
					'invalid_controller_payload',
					`${path}.controller.actions[${actionIndex}].toPageIds`,
					`Unknown controller page id "${pageId}".`,
					{ operationKind },
				);
			}
		}
	}
}

function isControllerGearOperation(
	operation: UamTransactionOperation,
): operation is AddGearOperation | UpdateGearOperation | RemoveGearOperation {
	return operation.kind === 'addGear' || operation.kind === 'updateGear' || operation.kind === 'removeGear';
}

function projectedDisplayGearsForController(
	project: UamProject,
	operations: UamTransactionOperation[],
	selector: UamControllerSelector,
): Array<{ displayNodeId: string; gear: Extract<UamGearBinding, { kind: 'display' | 'display2' }> }> {
	const component = findComponentSpec(project, selector);
	if (!component) return [];

	const projected = new Map<string, { displayNodeId: string; gear: Extract<UamGearBinding, { kind: 'display' | 'display2' }> }>();
	const keyFor = (displayNodeId: string, kind: 'display' | 'display2') => `${displayNodeId}\u0000${kind}`;
	const include = (displayNodeId: string, gear: UamGearBinding) => {
		if ((gear.kind !== 'display' && gear.kind !== 'display2') || gear.controllerName !== selector.controllerName) return;
		projected.set(keyFor(displayNodeId, gear.kind), { displayNodeId, gear });
	};

	for (const node of component.component.displayList) {
		for (const gear of node.gears) include(node.id, gear);
	}

	for (const operation of operations) {
		if (operation.kind === 'attachDisplayNode'
			&& operation.selector.packageId === selector.packageId
			&& operation.selector.componentResourceId === selector.componentResourceId
		) {
			for (const gear of operation.node.gears) include(operation.node.id, gear);
			continue;
		}
		if (operation.kind === 'detachDisplayNode'
			&& operation.selector.packageId === selector.packageId
			&& operation.selector.componentResourceId === selector.componentResourceId
		) {
			for (const kind of ['display', 'display2'] as const) projected.delete(keyFor(operation.selector.displayNodeId, kind));
			continue;
		}
		if (!isControllerGearOperation(operation)
			|| operation.selector.packageId !== selector.packageId
			|| operation.selector.componentResourceId !== selector.componentResourceId
			|| operation.selector.controllerName !== selector.controllerName
			|| (operation.selector.kind !== 'display' && operation.selector.kind !== 'display2')
		) continue;
		const key = keyFor(operation.selector.displayNodeId, operation.selector.kind);
		if (operation.kind === 'removeGear') projected.delete(key);
		else include(operation.selector.displayNodeId, operation.gear);
	}

	return [...projected.values()];
}

function isFinalControllerMutation(
	operations: UamTransactionOperation[],
	operationIndex: number,
	selector: UamControllerSelector,
): boolean {
	for (let index = operationIndex + 1; index < operations.length; index += 1) {
		const operation = operations[index]!;
		if ((operation.kind !== 'addController' && operation.kind !== 'updateController' && operation.kind !== 'removeController')
			|| operation.selector.packageId !== selector.packageId
			|| operation.selector.componentResourceId !== selector.componentResourceId
			|| operation.selector.controllerName !== selector.controllerName
		) continue;
		return false;
	}
	return true;
}

function validateUpdatedControllerGearBindings(
	project: UamProject,
	operations: UamTransactionOperation[],
	selector: UamControllerSelector,
	controller: UamControllerModel,
	path: string,
	issues: UamTransactionSupportIssue[],
): void {
	const pageIds = new Set(controller.pages.map((page) => page.id));
	for (const { displayNodeId, gear } of projectedDisplayGearsForController(project, operations, selector)) {
		for (const pageId of gear.visibleOnPageIds) {
			if (pageIds.has(pageId)) continue;
			pushSupportIssue(
				issues,
				'invalid_controller_payload',
				`${path}.controller.pages`,
				`Unknown gear page id "${pageId}"; controller page ids would leave the ${gear.kind} gear on display node "${displayNodeId}" invalid.`,
				{ operationKind: 'updateController', gearKind: gear.kind },
			);
		}
	}
}

function validateTransitionPayload(
	selector: UamTransitionSelector,
	transition: UamComponentModel['transitions'][number],
	path: string,
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
): void {
	if (transition.name !== selector.transitionName) {
		pushSupportIssue(
			issues,
			'invalid_transition_payload',
			`${path}.transition.name`,
			'Transition payload name must match selector.transitionName.',
			{ operationKind },
		);
	}
}

function plannedControllerForOperation(
	project: UamProject,
	operations: UamTransactionOperation[],
	operationIndex: number,
	selector: UamGearSelector,
): UamControllerModel | null {
	const component = findComponentSpec(project, selector);
	let controller = component?.component.controllers.find((candidate) => candidate.name === selector.controllerName) ?? null;
	for (let index = 0; index < operationIndex; index += 1) {
		const operation = operations[index]!;
		if (!('selector' in operation)) continue;
		const candidate = operation.selector as Partial<UamComponentSelector & UamControllerSelector>;
		if (
			candidate.packageId !== selector.packageId
			|| candidate.componentResourceId !== selector.componentResourceId
			|| candidate.controllerName !== selector.controllerName
		) continue;
		if (operation.kind === 'addController' || operation.kind === 'updateController') controller = operation.controller;
		if (operation.kind === 'removeController') controller = null;
	}
	return controller;
}

function validateGearSelector(
	project: UamProject,
	operations: UamTransactionOperation[],
	operationIndex: number,
	selector: UamGearSelector,
	path: string,
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
): UamControllerModel | null {
	if (!UAM_SUPPORTED_TRANSACTION_SCOPE.gearKinds.includes(selector.kind as never)) {
		pushSupportIssue(
			issues,
			'invalid_gear_selector',
			`${path}.kind`,
			`Unsupported gear selector kind "${selector.kind}".`,
			{ operationKind, gearKind: selector.kind },
		);
	}
	const controller = plannedControllerForOperation(project, operations, operationIndex, selector);
	if (controller) return controller;
	pushSupportIssue(
		issues,
		'invalid_gear_selector',
		`${path}.controllerName`,
		`Unknown gear controller "${selector.controllerName}".`,
		{ operationKind, gearKind: selector.kind },
	);
	return null;
}

function validateGearPayload(
	project: UamProject,
	operations: UamTransactionOperation[],
	operationIndex: number,
	selector: UamGearSelector,
	gear: UamGearBinding,
	path: string,
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
): void {
	if (gear.kind === 'xy' && [gear.defaultValue, ...gear.states.map((state) => state.value)]
		.some((value) => value !== null && !isValidUamXYGearValue(value, gear.positionsInPercent))) {
		pushSupportIssue(issues, 'invalid_gear_payload', `${path}.gear`,
			'XY gear values require finite x/y and paired finite px/py; percentage mode requires px/py.', { operationKind, gearKind: gear.kind });
	}
	const controller = validateGearSelector(project, operations, operationIndex, selector, `${path}.selector`, issues, operationKind);
	if (gear.kind !== selector.kind) {
		pushSupportIssue(
			issues,
			'invalid_gear_payload',
			`${path}.gear.kind`,
			'Gear payload kind must match selector.kind.',
			{ operationKind, gearKind: gear.kind },
		);
	}
	if (gear.controllerName !== selector.controllerName) {
		pushSupportIssue(
			issues,
			'invalid_gear_payload',
			`${path}.gear.controllerName`,
			'Gear payload controllerName must match selector.controllerName.',
			{ operationKind, gearKind: gear.kind },
		);
	}
	if (!controller) return;
	const pageIds = new Set(controller.pages.map((page) => page.id));
	const statePageIds = gear.kind === 'display' || gear.kind === 'display2'
		? gear.visibleOnPageIds
		: gear.states.map((state) => state.pageId);
	const seen = new Set<string>();
	for (const [stateIndex, pageId] of statePageIds.entries()) {
		const statePath = gear.kind === 'display' || gear.kind === 'display2'
			? `${path}.gear.visibleOnPageIds[${stateIndex}]`
			: `${path}.gear.states[${stateIndex}]`;
		if (!pageIds.has(pageId)) {
			pushSupportIssue(
				issues,
				'invalid_gear_payload',
				statePath,
				`Unknown controller page id "${pageId}".`,
				{ operationKind, gearKind: gear.kind },
			);
		}
		if (seen.has(pageId)) {
			pushSupportIssue(
				issues,
				gear.kind === 'look' ? 'duplicate_look_gear_state_page' : 'duplicate_gear_state_page',
				statePath,
				`Duplicate gear state page id "${pageId}".`,
				{ operationKind, gearKind: gear.kind },
			);
		}
		seen.add(pageId);
	}
}

function projectedGearControllers(
	project: UamProject,
	operations: UamTransactionOperation[],
	operationIndex: number,
	selector: UamGearSelector,
): Set<string> {
	const controllers = new Set(findDisplayNodeSpec(project, selector)?.gears
		.filter((gear) => gear.kind === selector.kind).map((gear) => gear.controllerName));
	for (let index = 0; index < operationIndex; index += 1) {
		const operation = operations[index]!;
		if (!('selector' in operation)) continue;
		if (
			(operation.kind !== 'addGear' && operation.kind !== 'updateGear' && operation.kind !== 'removeGear'
				&& operation.kind !== 'addLookGear' && operation.kind !== 'updateLookGear' && operation.kind !== 'removeLookGear')
		) continue;
		const candidate = operation.selector as UamGearSelector;
		if (
			candidate.packageId !== selector.packageId
			|| candidate.componentResourceId !== selector.componentResourceId
			|| candidate.displayNodeId !== selector.displayNodeId
			|| candidate.kind !== selector.kind
		) continue;
		if (operation.kind === 'addGear' || operation.kind === 'addLookGear') controllers.add(candidate.controllerName);
		if (operation.kind === 'removeGear' || operation.kind === 'removeLookGear') controllers.delete(candidate.controllerName);
	}
	return controllers;
}

function validateAddGearDoesNotDuplicate(
	project: UamProject,
	operations: UamTransactionOperation[],
	operationIndex: number,
	selector: UamGearSelector,
	path: string,
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
): void {
	if (projectedGearControllers(project, operations, operationIndex, selector).size === 0) return;
	pushSupportIssue(
		issues,
		selector.kind === 'look' ? 'duplicate_look_gear_controller' : 'duplicate_gear_controller',
		path,
		`A ${selector.kind} gear already exists on this display node; each gear kind can bind only one controller.`,
		{ operationKind, gearKind: selector.kind },
	);
}

function validateExistingGear(
	project: UamProject,
	operations: UamTransactionOperation[],
	operationIndex: number,
	selector: UamGearSelector,
	path: string,
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
): void {
	if (projectedGearControllers(project, operations, operationIndex, selector).has(selector.controllerName)) return;
	pushSupportIssue(
		issues,
		'invalid_gear_selector',
		path,
		`No ${selector.kind} gear exists for controller "${selector.controllerName}" on this display node.`,
		{ operationKind, gearKind: selector.kind },
	);
}

export function validateBehaviorOperation(
	project: UamProject,
	operations: UamTransactionOperation[],
	operationIndex: number,
	operation: Extract<UamTransactionOperation, { kind: 'addController' | 'updateController' | 'removeController' | 'addTransition' | 'updateTransition' | 'removeTransition' | 'addLookGear' | 'updateLookGear' | 'removeLookGear' | 'addGear' | 'updateGear' | 'removeGear' }>,
	operationPath: string,
	issues: UamTransactionSupportIssue[],
): void {
	switch (operation.kind) {
	case 'addController':
		validateControllerPayload(operation.selector, operation.controller, operationPath, issues, operation.kind);
		validateControllerActionTargets(project, operation.selector, operation.controller, `${operationPath}.controller`, issues, operation.kind);
		break;
	case 'updateController':
		validateControllerPayload(operation.selector, operation.controller, operationPath, issues, operation.kind);
		validateControllerActionTargets(project, operation.selector, operation.controller, `${operationPath}.controller`, issues, operation.kind);
		if (isFinalControllerMutation(operations, operationIndex, operation.selector)) {
			validateUpdatedControllerGearBindings(project, operations, operation.selector, operation.controller, operationPath, issues);
		}
		break;
	case 'removeController':
		break;
	case 'addTransition':
	case 'updateTransition':
		validateTransitionPayload(operation.selector, operation.transition, operationPath, issues, operation.kind);
		validateTransitionTargets(project, operation.selector, operation.transition, `${operationPath}.transition`, issues, operation.kind);
		break;
	case 'removeTransition':
		break;
	case 'addLookGear':
		validateTouchedDisplayNodeKind(project, operation.selector, `${operationPath}.selector.displayNodeId`, issues, operation.kind);
		validateGearPayload(project, operations, operationIndex, operation.selector, operation.gear, operationPath, issues, operation.kind);
		validateAddGearDoesNotDuplicate(project, operations, operationIndex, operation.selector, `${operationPath}.selector`, issues, operation.kind);
		break;
	case 'updateLookGear':
		validateTouchedDisplayNodeKind(project, operation.selector, `${operationPath}.selector.displayNodeId`, issues, operation.kind);
		validateGearPayload(project, operations, operationIndex, operation.selector, operation.gear, operationPath, issues, operation.kind);
		validateExistingGear(project, operations, operationIndex, operation.selector, `${operationPath}.selector`, issues, operation.kind);
		break;
	case 'removeLookGear':
		validateTouchedDisplayNodeKind(project, operation.selector, `${operationPath}.selector.displayNodeId`, issues, operation.kind);
		validateGearSelector(project, operations, operationIndex, operation.selector, `${operationPath}.selector`, issues, operation.kind);
		validateExistingGear(project, operations, operationIndex, operation.selector, `${operationPath}.selector`, issues, operation.kind);
		break;
	case 'addGear':
		validateTouchedDisplayNodeKind(project, operation.selector, `${operationPath}.selector.displayNodeId`, issues, operation.kind);
		validateGearPayload(project, operations, operationIndex, operation.selector, operation.gear, operationPath, issues, operation.kind);
		validateAddGearDoesNotDuplicate(project, operations, operationIndex, operation.selector, `${operationPath}.selector`, issues, operation.kind);
		break;
	case 'updateGear':
		validateTouchedDisplayNodeKind(project, operation.selector, `${operationPath}.selector.displayNodeId`, issues, operation.kind);
		validateGearPayload(project, operations, operationIndex, operation.selector, operation.gear, operationPath, issues, operation.kind);
		validateExistingGear(project, operations, operationIndex, operation.selector, `${operationPath}.selector`, issues, operation.kind);
		break;
	case 'removeGear':
		validateTouchedDisplayNodeKind(project, operation.selector, `${operationPath}.selector.displayNodeId`, issues, operation.kind);
		validateGearSelector(project, operations, operationIndex, operation.selector, `${operationPath}.selector`, issues, operation.kind);
		validateExistingGear(project, operations, operationIndex, operation.selector, `${operationPath}.selector`, issues, operation.kind);
		break;
	}
}
