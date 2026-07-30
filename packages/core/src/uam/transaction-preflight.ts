import type {
	UamAssetResource,
	UamComponentModel,
	UamComponentResource,
	UamControllerModel,
	UamDisplayNode,
	UamGearBinding,
	UamPackage,
	UamProject,
} from './model.js';
import { UAM_SUPPORTED_TRANSACTION_SCOPE } from './model.js';
import { normalizeUamProject } from './normalize.js';
import { isFiniteUamPoint, validateUamProject } from './validate.js';
import {
	UamTransactionError,
	type UamComponentSelector,
	type UamDisplayNodeSelector,
	type UamResourceSelector,
	type UamTransactionOperation,
	type UamTransactionSupportIssue,
	type UamTransactionSupportIssueCode,
} from './transaction-contracts.js';
import {
	findComponentSpec,
	findDisplayNodeSpec,
	findDisplayNodeSpecWithPath,
	findPackageSpec,
	findProjectedResource,
	isDisplayListRewriteOperation,
	isLifecycleOperation,
	TEXT_DISPLAY_NODE_KINDS,
} from './transaction-shared.js';
import {
	applyUamDisplayListRewriteOperation,
	applyUamLifecycleOperation,
} from './transaction-uam-apply.js';

function pushSupportIssue(
	issues: UamTransactionSupportIssue[],
	code: UamTransactionSupportIssueCode,
	path: string,
	message: string,
	details: Omit<Partial<UamTransactionSupportIssue>, 'code' | 'path' | 'message'> = {},
): void {
	issues.push({ code, path, message, ...details });
}


function countDuplicateNames(values: string[]): Set<string> {
	const seen = new Set<string>();
	const duplicates = new Set<string>();
	for (const value of values) {
		if (seen.has(value)) duplicates.add(value);
		seen.add(value);
	}
	return duplicates;
}

function validateSupportedDisplayNode(
	node: UamDisplayNode,
	owningPackageId: string,
	path: string,
	issues: UamTransactionSupportIssue[],
	details: Omit<Partial<UamTransactionSupportIssue>, 'code' | 'path' | 'message' | 'nodeKind' | 'gearKind'> = {},
): void {
	if (!UAM_SUPPORTED_TRANSACTION_SCOPE.nodeKinds.includes(node.kind as never)) {
		pushSupportIssue(
			issues,
			'unsupported_display_node_kind',
			`${path}.kind`,
			`Phase A does not support display node kind "${node.kind}".`,
			{ ...details, nodeKind: node.kind },
		);
	}

	if (node.kind === 'image' && node.resource.packageId && node.resource.packageId !== owningPackageId) {
		pushSupportIssue(
			issues,
			'unsupported_cross_package_image_ref',
			`${path}.resource.packageId`,
			`Phase A does not support cross-package image refs on supported image nodes ("${node.resource.packageId}" != "${owningPackageId}").`,
			{ ...details, nodeKind: node.kind },
		);
	}

	const gearControllers = new Set<string>();
	for (const [gearIndex, gear] of node.gears.entries()) {
		if (!UAM_SUPPORTED_TRANSACTION_SCOPE.gearKinds.includes(gear.kind as never)) {
			pushSupportIssue(
				issues,
				'unsupported_gear_kind',
				`${path}.gears[${gearIndex}]`,
				`Phase A does not support gear kind "${gear.kind}".`,
				{ ...details, nodeKind: node.kind, gearKind: gear.kind },
			);
			continue;
		}
		const key = `${gear.kind}\u0000${gear.controllerName}`;
		if (gearControllers.has(key)) {
			pushSupportIssue(
				issues,
				gear.kind === 'look' ? 'duplicate_look_gear_controller' : 'duplicate_gear_controller',
				`${path}.gears[${gearIndex}]`,
				`A display node may only have one ${gear.kind} gear per controller ("${gear.controllerName}").`,
				{ ...details, nodeKind: node.kind, gearKind: gear.kind },
			);
		}
		gearControllers.add(key);
	}
}

function validateBaselineSupport(project: UamProject, issues: UamTransactionSupportIssue[]): void {
	for (const [packageIndex, pkg] of project.packages.entries()) {
		for (const [resourceIndex, resource] of pkg.resources.entries()) {
			const resourcePath = `packages[${packageIndex}].resources[${resourceIndex}]`;
			if (resource.kind !== 'component' && !UAM_SUPPORTED_TRANSACTION_SCOPE.resourceKinds.includes(resource.kind as never)) {
				pushSupportIssue(
					issues,
					'unsupported_resource_kind',
					`${resourcePath}.kind`,
					`Phase A does not support resource kind "${resource.kind}".`,
					{ resourceKind: resource.kind },
				);
				continue;
			}

			if (resource.kind !== 'component') continue;

			const duplicateTransitionNames = countDuplicateNames(resource.component.transitions.map((transition) => transition.name));
			for (const duplicateName of duplicateTransitionNames) {
				pushSupportIssue(
					issues,
					'duplicate_transition_name',
					`${resourcePath}.component.transitions`,
					`Phase A requires transition names to be unique within a component ("${duplicateName}").`,
				);
			}

			for (const [nodeIndex, node] of resource.component.displayList.entries()) {
				validateSupportedDisplayNode(
					node,
					pkg.id,
					`${resourcePath}.component.displayList[${nodeIndex}]`,
					issues,
				);
			}
		}
	}
}

function validateTouchedResourceKind(
	project: UamProject,
	operations: UamTransactionOperation[],
	operationIndex: number,
	selector: UamResourceSelector,
	path: string,
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
): void {
	const resource = findProjectedResource(project, operations, operationIndex, selector);
	if (!resource) {
		pushSupportIssue(
			issues,
			'invalid_resource_selector',
			path,
			`Resource "${selector.packageId}/${selector.resourceId}" does not exist at this point in the transaction.`,
			{ operationKind },
		);
		return;
	}
	if (resource.kind === 'component' || UAM_SUPPORTED_TRANSACTION_SCOPE.resourceKinds.includes(resource.kind as never)) {
		return;
	}
	pushSupportIssue(
		issues,
		'unsupported_resource_mutation',
		path,
		`Phase A does not support ${resource.kind} resource mutation ("${selector.packageId}/${selector.resourceId}").`,
		{ operationKind, resourceKind: resource.kind },
	);
}

function validateTouchedDisplayNodeKind(
	project: UamProject,
	selector: UamDisplayNodeSelector,
	path: string,
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
) {
	const found = findDisplayNodeSpecWithPath(project, selector);
	if (!found) {
		pushSupportIssue(
			issues,
			'invalid_display_node_selector',
			path,
			`Display node "${selector.displayNodeId}" does not exist in component "${selector.componentResourceId}".`,
			{ operationKind },
		);
		return null;
	}
	if (!UAM_SUPPORTED_TRANSACTION_SCOPE.nodeKinds.includes(found.node.kind as never)) {
		pushSupportIssue(
			issues,
			'unsupported_display_node_mutation',
			path,
			`Phase A does not support ${found.node.kind} display node mutation ("${selector.displayNodeId}").`,
			{ operationKind, nodeKind: found.node.kind },
		);
	}
	return found;
}

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

const COMMON_DISPLAY_PROP_KEYS = new Set<keyof UamDisplayNodePropsUpdate>([
	'position',
	'size',
	'visible',
	'touchable',
	'grayed',
	'alpha',
	'rotation',
	'customData',
]);

const TEXT_DISPLAY_PROP_KEYS = new Set<keyof UamDisplayNodePropsUpdate>([
	'text',
	'font',
	'fontSize',
	'color',
]);

function validateDisplayPropsPayload(
	op: SetDisplayNodePropsOperation,
	project: UamProject,
	path: string,
	issues: UamTransactionSupportIssue[],
): void {
	const node = findDisplayNodeSpec(project, op.selector);
	const nodeKind = node?.kind;
	for (const key of Object.keys(op.props) as Array<keyof UamDisplayNodePropsUpdate>) {
		if (key === 'pivot') {
			if (!isFiniteUamPoint(op.props.pivot)) {
				pushSupportIssue(
					issues,
					'invalid_display_node_payload',
					`${path}.props.pivot`,
					'Display node pivot must contain finite x and y numbers.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			}
			continue;
		}
		if (key === 'pivotAsAnchor') {
			if (typeof op.props.pivotAsAnchor !== 'boolean') {
				pushSupportIssue(
					issues,
					'invalid_display_node_payload',
					`${path}.props.pivotAsAnchor`,
					'Display node pivotAsAnchor must be boolean.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			}
			continue;
		}
		if (COMMON_DISPLAY_PROP_KEYS.has(key)) continue;
		if (TEXT_DISPLAY_PROP_KEYS.has(key)) {
			if (nodeKind && !TEXT_DISPLAY_NODE_KINDS.has(nodeKind)) {
				pushSupportIssue(
					issues,
					'unsupported_text_field_target',
					`${path}.props.${String(key)}`,
					`Field "${String(key)}" is only supported on text, richText, or textInput display nodes.`,
					{ operationKind: op.kind, nodeKind, field: String(key) },
				);
			}
			continue;
		}
		pushSupportIssue(
			issues,
			'unsupported_display_node_field',
			`${path}.props.${String(key)}`,
			`Field "${String(key)}" is not supported by setDisplayNodeProps in Phase A.`,
			{ operationKind: op.kind, nodeKind, field: String(key) },
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

function projectedGearExists(
	project: UamProject,
	operations: UamTransactionOperation[],
	operationIndex: number,
	selector: UamGearSelector,
): boolean {
	let exists = findDisplayNodeSpec(project, selector)?.gears.some((gear) => (
		gear.kind === selector.kind && gear.controllerName === selector.controllerName
	)) ?? false;
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
			|| candidate.controllerName !== selector.controllerName
		) continue;
		if (operation.kind === 'addGear' || operation.kind === 'addLookGear') exists = true;
		if (operation.kind === 'removeGear' || operation.kind === 'removeLookGear') exists = false;
	}
	return exists;
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
	if (!projectedGearExists(project, operations, operationIndex, selector)) return;
	pushSupportIssue(
		issues,
		selector.kind === 'look' ? 'duplicate_look_gear_controller' : 'duplicate_gear_controller',
		path,
		`A ${selector.kind} gear already exists for controller "${selector.controllerName}" on this display node.`,
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
	if (projectedGearExists(project, operations, operationIndex, selector)) return;
	pushSupportIssue(
		issues,
		'invalid_gear_selector',
		path,
		`No ${selector.kind} gear exists for controller "${selector.controllerName}" on this display node.`,
		{ operationKind, gearKind: selector.kind },
	);
}

function isSafeResourceFileName(value: string): boolean {
	return value.length > 0
		&& !value.includes('/')
		&& !value.includes('\\')
		&& value !== '.'
		&& value !== '..';
}

function isSafePackageName(value: string): boolean {
	return value.length > 0
		&& !/[\\/:]/.test(value)
		&& value !== '.'
		&& value !== '..';
}

function isSafeResourcePath(value: string): boolean {
	if (!value) return false;
	const segments = value.replace(/\\/g, '/').split('/').filter(Boolean);
	return !segments.some((segment) => segment === '.' || segment === '..');
}

function primaryResourceFileName(resource: UamAssetResource): string {
	return resource.fileName ?? resource.file ?? '';
}

function validateAssetSourceBytes(
	project: UamProject,
	operations: UamTransactionOperation[],
	operationIndex: number,
	selector: UamResourceSelector,
	path: string,
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
): void {
	const resource = findProjectedResource(project, operations, operationIndex, selector);
	if (!resource || resource.kind === 'component') return;
	if (resource.sourceBytes instanceof Uint8Array) return;
	pushSupportIssue(
		issues,
		'unavailable_resource_source_bytes',
		path,
		`Resource "${selector.packageId}/${selector.resourceId}" has no hydrated primary source bytes.`,
		{ operationKind, resourceKind: resource.kind },
	);
}

function validateBinaryResourceTarget(
	project: UamProject,
	operations: UamTransactionOperation[],
	operationIndex: number,
	selector: UamResourceSelector,
	path: string,
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
): void {
	const resource = findProjectedResource(project, operations, operationIndex, selector);
	if (!resource || resource.kind !== 'component') return;
	pushSupportIssue(
		issues,
		'unsupported_resource_mutation',
		path,
		`${operationKind} only supports binary package resources, not components.`,
		{ operationKind, resourceKind: resource.kind },
	);
}

function validateAssetResourcePayload(
	project: UamProject,
	operations: UamTransactionOperation[],
	operationIndex: number,
	selector: UamPackageSelector,
	resource: UamAssetResource,
	path: string,
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
): void {
	const pkg = findPackageSpec(project, selector.packageId);
	if (!pkg) return;
	if (!UAM_SUPPORTED_TRANSACTION_SCOPE.resourceKinds.includes(resource.kind as never)) {
		pushSupportIssue(
			issues,
			'unsupported_resource_kind',
			`${path}.resource.kind`,
			`Unsupported resource kind "${resource.kind}".`,
			{ operationKind, resourceKind: resource.kind },
		);
	}
	if (!resource.id) {
		pushSupportIssue(
			issues,
			'invalid_resource_payload',
			`${path}.resource.id`,
			'Added binary resource id must not be empty.',
			{ operationKind, resourceKind: resource.kind },
		);
	} else if (findProjectedResource(project, operations, operationIndex, {
		packageId: selector.packageId,
		resourceId: resource.id,
	})) {
		pushSupportIssue(
			issues,
			'duplicate_resource_id',
			`${path}.resource.id`,
			`Resource id "${resource.id}" already exists in package "${selector.packageId}".`,
			{ operationKind, resourceKind: resource.kind },
		);
	}
	const fileName = primaryResourceFileName(resource);
	if (!isSafeResourceFileName(fileName)) {
		pushSupportIssue(
			issues,
			'invalid_resource_payload',
			`${path}.resource`,
			'Added binary resource must define a safe primary file name.',
			{ operationKind, resourceKind: resource.kind },
		);
	}
	if (!isSafeResourcePath(resource.path)) {
		pushSupportIssue(
			issues,
			'invalid_resource_path',
			`${path}.resource.path`,
			'Added binary resource path must not contain traversal segments.',
			{ operationKind, resourceKind: resource.kind },
		);
	}
	if (!(resource.sourceBytes instanceof Uint8Array)) {
		pushSupportIssue(
			issues,
			'unavailable_resource_source_bytes',
			`${path}.resource.sourceBytes`,
			'Added binary resource must provide primary source bytes.',
			{ operationKind, resourceKind: resource.kind },
		);
	}
	if (resource.sourcePath !== undefined) {
		pushSupportIssue(
			issues,
			'invalid_resource_payload',
			`${path}.resource.sourcePath`,
			'Added binary resources must not declare a previous sourcePath.',
			{ operationKind, resourceKind: resource.kind },
		);
	}
}

function validatePackagePayload(
	project: UamProject,
	pkg: UamPackage,
	path: string,
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
): void {
	if (!pkg.id) {
		pushSupportIssue(issues, 'invalid_package_payload', `${path}.id`, 'Package id must not be empty.', { operationKind });
	}
	if (!isSafePackageName(pkg.name)) {
		pushSupportIssue(issues, 'invalid_package_payload', `${path}.name`, 'Package name must be a safe output path segment.', { operationKind });
	}

	const standalone = normalizeUamProject({ ...project, packages: [pkg] });
	for (const issue of validateUamProject(standalone)) {
		const suffix = issue.path.startsWith('packages[0]') ? issue.path.slice('packages[0]'.length) : `.${issue.path}`;
		pushSupportIssue(issues, 'invalid_package_payload', `${path}${suffix}`, issue.message, { operationKind });
	}

	for (const [resourceIndex, resource] of pkg.resources.entries()) {
		const resourcePath = `${path}.resources[${resourceIndex}]`;
		if (resource.kind !== 'component' && !(resource.sourceBytes instanceof Uint8Array)) {
			pushSupportIssue(
				issues,
				'unavailable_resource_source_bytes',
				`${resourcePath}.sourceBytes`,
				'Added package assets must provide primary source bytes.',
				{ operationKind, resourceKind: resource.kind },
			);
		}
		if (resource.kind !== 'component') continue;
		for (const [nodeIndex, node] of resource.component.displayList.entries()) {
			validateSupportedDisplayNode(node, pkg.id, `${resourcePath}.component.displayList[${nodeIndex}]`, issues, {
				operationKind,
			});
		}
	}
}

function validateComponentPayload(
	project: UamProject,
	pkg: UamPackage,
	component: UamComponentResource,
	path: string,
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
): void {
	if (!component.id) {
		pushSupportIssue(issues, 'invalid_component_payload', `${path}.id`, 'Component id must not be empty.', { operationKind });
	}
	const standalone = normalizeUamProject({
		...project,
		packages: [{ ...pkg, resources: [component] }],
	});
	for (const issue of validateUamProject(standalone)) {
		const prefix = 'packages[0].resources[0]';
		const suffix = issue.path.startsWith(prefix) ? issue.path.slice(prefix.length) : `.${issue.path}`;
		pushSupportIssue(issues, 'invalid_component_payload', `${path}${suffix}`, issue.message, { operationKind });
	}
	for (const [nodeIndex, node] of component.component.displayList.entries()) {
		validateSupportedDisplayNode(node, pkg.id, `${path}.component.displayList[${nodeIndex}]`, issues, {
			operationKind,
		});
	}
}

function validateLifecycleInsertionIndex(
	index: number,
	maximum: number,
	path: string,
	code: 'invalid_package_index' | 'invalid_component_index',
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
): void {
	if (Number.isInteger(index) && index >= 0 && index <= maximum) return;
	pushSupportIssue(
		issues,
		code,
		path,
		`Insertion index must be an integer between 0 and ${maximum}.`,
		{ operationKind },
	);
}

function validateLifecyclePackageSelector(
	project: UamProject,
	selector: UamPackageSelector,
	path: string,
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
): UamPackage | null {
	const pkg = findPackageSpec(project, selector.packageId);
	if (pkg) return pkg;
	pushSupportIssue(
		issues,
		'invalid_package_selector',
		`${path}.packageId`,
		`Package "${selector.packageId}" was not found.`,
		{ operationKind },
	);
	return null;
}

function validateLifecycleComponentSelector(
	project: UamProject,
	selector: UamComponentSelector,
	path: string,
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
): UamComponentResource | null {
	const component = findComponentSpec(project, selector);
	if (component) return component;
	pushSupportIssue(
		issues,
		'invalid_component_selector',
		`${path}.componentResourceId`,
		`Component "${selector.componentResourceId}" was not found in package "${selector.packageId}".`,
		{ operationKind },
	);
	return null;
}

function nodeReferencesPackage(node: UamDisplayNode, ownerPackageId: string, packageId: string): boolean {
	const resourceNode = node as UamDisplayNode & { resource?: { packageId?: string; resourceId?: string } };
	if (resourceNode.resource?.resourceId && (resourceNode.resource.packageId || ownerPackageId) === packageId) {
		return true;
	}
	const derivedNode = node as UamDisplayNode & { packageId?: string; src?: string };
	return !!derivedNode.src && (derivedNode.packageId || ownerPackageId) === packageId;
}

function getComponentReference(
	node: UamDisplayNode,
	ownerPackageId: string,
): { packageId: string; componentId: string } | null {
	if (node.kind === 'component') {
		return {
			packageId: node.resource.packageId || ownerPackageId,
			componentId: node.resource.resourceId,
		};
	}
	const derivedNode = node as UamDisplayNode & { packageId?: string; src?: string };
	if (!derivedNode.src) return null;
	return {
		packageId: derivedNode.packageId || ownerPackageId,
		componentId: derivedNode.src,
	};
}

function nodeReferencesComponent(
	node: UamDisplayNode,
	ownerPackageId: string,
	packageId: string,
	componentId: string,
): boolean {
	const reference = getComponentReference(node, ownerPackageId);
	return reference?.packageId === packageId && reference.componentId === componentId;
}

function findExternalPackageReference(project: UamProject, packageId: string): string | null {
	for (const [packageIndex, pkg] of project.packages.entries()) {
		if (pkg.id === packageId) continue;
		for (const [resourceIndex, resource] of pkg.resources.entries()) {
			if (resource.kind !== 'component') continue;
			for (const [nodeIndex, node] of resource.component.displayList.entries()) {
				if (nodeReferencesPackage(node, pkg.id, packageId)) {
					return `packages[${packageIndex}].resources[${resourceIndex}].component.displayList[${nodeIndex}]`;
				}
			}
		}
	}
	return null;
}

function findExternalComponentReference(project: UamProject, packageId: string, componentId: string): string | null {
	for (const [packageIndex, pkg] of project.packages.entries()) {
		for (const [resourceIndex, resource] of pkg.resources.entries()) {
			if (resource.kind !== 'component') continue;
			if (pkg.id === packageId && resource.id === componentId) continue;
			for (const [nodeIndex, node] of resource.component.displayList.entries()) {
				if (nodeReferencesComponent(node, pkg.id, packageId, componentId)) {
					return `packages[${packageIndex}].resources[${resourceIndex}].component.displayList[${nodeIndex}]`;
				}
			}
		}
	}
	return null;
}

function findComponentPackageDependency(component: UamComponentResource, packageId: string, path: string): string | null {
	for (const [nodeIndex, node] of component.component.displayList.entries()) {
		if (nodeReferencesPackage(node, packageId, packageId)) {
			return `${path}.component.displayList[${nodeIndex}]`;
		}
	}
	return null;
}

function findComponentPackageByIdentity(project: UamProject, component: UamComponentResource): UamPackage | null {
	return project.packages.find((pkg) => pkg.resources.some((resource) => resource === component)) ?? null;
}

function projectContainsDisplayNode(project: UamProject, target: UamDisplayNode): boolean {
	return project.packages.some((pkg) => pkg.resources.some((resource) => (
		resource.kind === 'component' && resource.component.displayList.includes(target)
	)));
}

type UamLifecycleReferenceCheck =
	| {
		kind: 'removePackage';
		packageId: string;
		path: string;
		operationKind: 'removePackage';
	}
	| {
		kind: 'removeComponent';
		packageId: string;
		componentId: string;
		path: string;
		operationKind: 'removeComponent';
	}
	| {
		kind: 'moveComponent';
		component: UamComponentResource;
		sourcePackageId: string;
		path: string;
		operationKind: 'moveComponent';
	}
	| {
		kind: 'attachDisplayNode';
		node: UamDisplayNode;
		ownerPackageId: string;
		path: string;
		operationKind: 'attachDisplayNode';
	};

function validateLifecycleReferenceChecks(
	project: UamProject,
	checks: UamLifecycleReferenceCheck[],
	issues: UamTransactionSupportIssue[],
): void {
	for (const check of checks) {
		switch (check.kind) {
			case 'removePackage': {
				const referencePath = findExternalPackageReference(project, check.packageId);
				if (referencePath) {
					pushSupportIssue(issues, 'package_referenced', check.path, `Package "${check.packageId}" is still referenced by ${referencePath}.`, { operationKind: check.operationKind });
				}
				break;
			}
			case 'removeComponent': {
				const referencePath = findExternalComponentReference(project, check.packageId, check.componentId);
				if (referencePath) {
					pushSupportIssue(issues, 'component_referenced', check.path, `Component "${check.componentId}" is still referenced by ${referencePath}.`, { operationKind: check.operationKind });
				}
				break;
			}
			case 'moveComponent': {
				const finalPackage = findComponentPackageByIdentity(project, check.component);
				if (!finalPackage || finalPackage.id === check.sourcePackageId) break;
				const referencePath = findExternalComponentReference(project, check.sourcePackageId, check.component.id);
				if (referencePath) {
					pushSupportIssue(issues, 'component_referenced', check.path, `Component "${check.component.id}" is still referenced by ${referencePath}.`, { operationKind: check.operationKind });
				}
				const dependencyPath = findComponentPackageDependency(check.component, check.sourcePackageId, check.path);
				if (dependencyPath) {
					pushSupportIssue(issues, 'component_has_package_dependencies', dependencyPath, `Component "${check.component.id}" still resolves display resources from package "${check.sourcePackageId}".`, { operationKind: check.operationKind });
				}
				break;
			}
			case 'attachDisplayNode': {
				if (!projectContainsDisplayNode(project, check.node)) break;
				const reference = getComponentReference(check.node, check.ownerPackageId);
				if (!reference || findComponentSpec(project, {
					packageId: reference.packageId,
					componentResourceId: reference.componentId,
				})) break;
				const referencePath = check.node.kind === 'component'
					? `${check.path}.resource.resourceId`
					: `${check.path}.src`;
				pushSupportIssue(
					issues,
					'invalid_component_reference',
					referencePath,
					`Display node "${check.node.id}" references missing component "${reference.packageId}/${reference.componentId}".`,
					{ operationKind: check.operationKind },
				);
				break;
			}
		}
	}
}

function validateLifecycleOperationPayloads(
	project: UamProject,
	operations: UamTransactionOperation[],
	issues: UamTransactionSupportIssue[],
): void {
	const projected = normalizeUamProject(project);
	const referenceChecks: UamLifecycleReferenceCheck[] = [];
	const initialIssueCount = issues.length;
	for (const [operationIndex, operation] of operations.entries()) {
		if (!isLifecycleOperation(operation) && !isDisplayListRewriteOperation(operation)) continue;
		const operationPath = `operations[${operationIndex}]`;
		const issueCount = issues.length;
		switch (operation.kind) {
			case 'addPackage': {
				validatePackagePayload(projected, operation.package, `${operationPath}.package`, issues, operation.kind);
				if (findPackageSpec(projected, operation.package.id)) {
					pushSupportIssue(issues, 'duplicate_package_id', `${operationPath}.package.id`, `Package id "${operation.package.id}" already exists.`, { operationKind: operation.kind });
				}
				if (projected.packages.some((pkg) => pkg.name === operation.package.name)) {
					pushSupportIssue(issues, 'duplicate_package_name', `${operationPath}.package.name`, `Package name "${operation.package.name}" already exists.`, { operationKind: operation.kind });
				}
				validateLifecycleInsertionIndex(operation.atIndex, projected.packages.length, `${operationPath}.atIndex`, 'invalid_package_index', issues, operation.kind);
				break;
			}
			case 'renamePackage': {
				const pkg = validateLifecyclePackageSelector(projected, operation.selector, `${operationPath}.selector`, issues, operation.kind);
				if (!isSafePackageName(operation.newName)) {
					pushSupportIssue(issues, 'invalid_package_payload', `${operationPath}.newName`, 'Package name must be a safe output path segment.', { operationKind: operation.kind });
				}
				if (pkg && projected.packages.some((candidate) => candidate !== pkg && candidate.name === operation.newName)) {
					pushSupportIssue(issues, 'duplicate_package_name', `${operationPath}.newName`, `Package name "${operation.newName}" already exists.`, { operationKind: operation.kind });
				}
				break;
			}
			case 'removePackage': {
				validateLifecyclePackageSelector(projected, operation.selector, `${operationPath}.selector`, issues, operation.kind);
				break;
			}
			case 'addComponent': {
				const pkg = validateLifecyclePackageSelector(projected, operation.selector, `${operationPath}.selector`, issues, operation.kind);
				if (pkg) {
					validateComponentPayload(projected, pkg, operation.component, `${operationPath}.component`, issues, operation.kind);
					if (pkg.resources.some((resource) => resource.id === operation.component.id)) {
						pushSupportIssue(issues, 'duplicate_component_id', `${operationPath}.component.id`, `Resource id "${operation.component.id}" already exists in package "${pkg.id}".`, { operationKind: operation.kind });
					}
					validateLifecycleInsertionIndex(operation.atIndex, pkg.resources.length, `${operationPath}.atIndex`, 'invalid_component_index', issues, operation.kind);
				}
				break;
			}
			case 'removeComponent': {
				validateLifecycleComponentSelector(projected, operation.selector, `${operationPath}.selector`, issues, operation.kind);
				break;
			}
			case 'moveComponent': {
				const component = validateLifecycleComponentSelector(projected, operation.selector, `${operationPath}.selector`, issues, operation.kind);
				const target = findPackageSpec(projected, operation.toPackageId);
				if (!target) {
					pushSupportIssue(issues, 'invalid_package_selector', `${operationPath}.toPackageId`, `Package "${operation.toPackageId}" was not found.`, { operationKind: operation.kind });
				}
				if (operation.selector.packageId === operation.toPackageId) {
					pushSupportIssue(issues, 'invalid_component_move', `${operationPath}.toPackageId`, 'moveComponent requires a different destination package.', { operationKind: operation.kind });
				}
				if (component && target) {
					if (target.resources.some((resource) => resource.id === component.id)) {
						pushSupportIssue(issues, 'duplicate_component_id', `${operationPath}.selector.componentResourceId`, `Resource id "${component.id}" already exists in package "${target.id}".`, { operationKind: operation.kind });
					}
					validateLifecycleInsertionIndex(operation.toIndex, target.resources.length, `${operationPath}.toIndex`, 'invalid_component_index', issues, operation.kind);
				}
				break;
			}
			case 'attachDisplayNode': {
				const component = validateLifecycleComponentSelector(projected, operation.selector, `${operationPath}.selector`, issues, operation.kind);
				if (!Number.isInteger(operation.atIndex) || operation.atIndex < 0) {
					pushSupportIssue(
						issues,
						'invalid_attach_index',
						`${operationPath}.atIndex`,
						'attachDisplayNode.atIndex must be a non-negative integer.',
						{ operationKind: operation.kind },
					);
				}
				validateSupportedDisplayNode(operation.node, operation.selector.packageId, `${operationPath}.node`, issues, {
					operationKind: operation.kind,
				});
				if (component && Number.isInteger(operation.atIndex) && operation.atIndex >= 0) {
					if (component.component.displayList.some((node) => node.id === operation.node.id)) {
						pushSupportIssue(issues, 'invalid_display_node_selector', `${operationPath}.node.id`, `Component "${component.id}" already contains display node id "${operation.node.id}".`, { operationKind: operation.kind });
					} else if (operation.atIndex > component.component.displayList.length) {
						pushSupportIssue(issues, 'invalid_attach_index', `${operationPath}.atIndex`, `attachDisplayNode.atIndex must be between 0 and ${component.component.displayList.length}.`, { operationKind: operation.kind });
					}
				}
				break;
			}
			case 'detachDisplayNode':
				validateTouchedDisplayNodeKind(projected, operation.selector, `${operationPath}.selector.displayNodeId`, issues, operation.kind);
				break;
		}
		if (issues.length !== issueCount) continue;
		if (isLifecycleOperation(operation)) {
			applyUamLifecycleOperation(projected, operation);
		} else {
			applyUamDisplayListRewriteOperation(projected, operation);
		}
		switch (operation.kind) {
			case 'removePackage':
				referenceChecks.push({
					kind: 'removePackage',
					packageId: operation.selector.packageId,
					path: `${operationPath}.selector`,
					operationKind: operation.kind,
				});
				break;
			case 'removeComponent':
				referenceChecks.push({
					kind: 'removeComponent',
					packageId: operation.selector.packageId,
					componentId: operation.selector.componentResourceId,
					path: `${operationPath}.selector`,
					operationKind: operation.kind,
				});
				break;
			case 'moveComponent': {
				const component = findComponentSpec(projected, {
					packageId: operation.toPackageId,
					componentResourceId: operation.selector.componentResourceId,
				});
				if (component) {
					referenceChecks.push({
						kind: 'moveComponent',
						component,
						sourcePackageId: operation.selector.packageId,
						path: `${operationPath}.selector`,
						operationKind: operation.kind,
					});
				}
				break;
			}
			case 'attachDisplayNode': {
				const component = findComponentSpec(projected, operation.selector);
				const node = component?.component.displayList.find((candidate) => candidate.id === operation.node.id);
				if (node) {
					referenceChecks.push({
						kind: 'attachDisplayNode',
						node,
						ownerPackageId: operation.selector.packageId,
						path: `${operationPath}.node`,
						operationKind: operation.kind,
					});
				}
				break;
			}
		}
	}
	if (issues.length === initialIssueCount) {
		validateLifecycleReferenceChecks(projected, referenceChecks, issues);
	}
}

function validateLifecycleBatchCompatibility(
	operations: UamTransactionOperation[],
	issues: UamTransactionSupportIssue[],
): boolean {
	if (!operations.some(isLifecycleOperation)) return true;
	const nonLifecycleIndex = operations.findIndex((operation) => !isLifecycleOperation(operation) && !isDisplayListRewriteOperation(operation));
	if (nonLifecycleIndex < 0) return true;
	const operation = operations[nonLifecycleIndex]!;
	pushSupportIssue(
		issues,
		'unsupported_operation_batch',
		`operations[${nonLifecycleIndex}].kind`,
		`Lifecycle operations may only be batched with lifecycle operations or display-list rewrites; "${operation.kind}" must be committed separately.`,
		{ operationKind: operation.kind },
	);
	return false;
}

function validateOperationPayloads(project: UamProject, operations: UamTransactionOperation[], issues: UamTransactionSupportIssue[]): void {
	const hasLifecycleOperation = operations.some(isLifecycleOperation);
	for (const [operationIndex, operation] of operations.entries()) {
		const operationPath = `operations[${operationIndex}]`;
		switch (operation.kind) {
			case 'renameResource':
				validateTouchedResourceKind(project, operations, operationIndex, operation.selector, `${operationPath}.selector.resourceId`, issues, operation.kind);
				validateAssetSourceBytes(project, operations, operationIndex, operation.selector, `${operationPath}.selector.resourceId`, issues, operation.kind);
				if (!isSafeResourceFileName(operation.newName)) {
					pushSupportIssue(
						issues,
						'invalid_resource_name',
						`${operationPath}.newName`,
						'renameResource.newName must be a safe file or resource name.',
						{ operationKind: operation.kind },
					);
				}
				break;
			case 'moveResource':
				validateTouchedResourceKind(project, operations, operationIndex, operation.selector, `${operationPath}.selector.resourceId`, issues, operation.kind);
				validateAssetSourceBytes(project, operations, operationIndex, operation.selector, `${operationPath}.selector.resourceId`, issues, operation.kind);
				if (!isSafeResourcePath(operation.toPath)) {
					pushSupportIssue(
						issues,
						'invalid_resource_path',
						`${operationPath}.toPath`,
						'moveResource.toPath must not be empty or contain traversal segments.',
						{ operationKind: operation.kind },
					);
				}
				break;
			case 'addResource':
				validateAssetResourcePayload(project, operations, operationIndex, operation.selector, operation.resource, operationPath, issues, operation.kind);
				break;
			case 'replaceResourceBytes':
				validateTouchedResourceKind(project, operations, operationIndex, operation.selector, `${operationPath}.selector.resourceId`, issues, operation.kind);
				validateBinaryResourceTarget(project, operations, operationIndex, operation.selector, `${operationPath}.selector.resourceId`, issues, operation.kind);
				validateAssetSourceBytes(project, operations, operationIndex, operation.selector, `${operationPath}.selector.resourceId`, issues, operation.kind);
				if (!(operation.sourceBytes instanceof Uint8Array)) {
					pushSupportIssue(
						issues,
						'unavailable_resource_source_bytes',
						`${operationPath}.sourceBytes`,
						'replaceResourceBytes.sourceBytes must be a Uint8Array.',
						{ operationKind: operation.kind },
					);
				}
				break;
			case 'removeResource':
				validateTouchedResourceKind(project, operations, operationIndex, operation.selector, `${operationPath}.selector.resourceId`, issues, operation.kind);
				validateBinaryResourceTarget(project, operations, operationIndex, operation.selector, `${operationPath}.selector.resourceId`, issues, operation.kind);
				validateAssetSourceBytes(project, operations, operationIndex, operation.selector, `${operationPath}.selector.resourceId`, issues, operation.kind);
				break;
			case 'setDisplayNodeProps':
				validateTouchedDisplayNodeKind(project, operation.selector, `${operationPath}.selector.displayNodeId`, issues, operation.kind);
				validateDisplayPropsPayload(operation, project, operationPath, issues);
				break;
			case 'attachDisplayNode':
				if (hasLifecycleOperation) break;
				if (!Number.isInteger(operation.atIndex) || operation.atIndex < 0) {
					pushSupportIssue(
						issues,
						'invalid_attach_index',
						`${operationPath}.atIndex`,
						'attachDisplayNode.atIndex must be a non-negative integer.',
						{ operationKind: operation.kind },
					);
				}
				validateSupportedDisplayNode(operation.node, operation.selector.packageId, `${operationPath}.node`, issues, {
					operationKind: operation.kind,
				});
				break;
			case 'detachDisplayNode':
				if (hasLifecycleOperation) break;
				validateTouchedDisplayNodeKind(project, operation.selector, `${operationPath}.selector.displayNodeId`, issues, operation.kind);
				break;
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
			case 'addPackage':
			case 'renamePackage':
			case 'removePackage':
			case 'addComponent':
			case 'removeComponent':
			case 'moveComponent':
				break;
		}
	}
}

export function validateTransactionSupport(
	project: UamProject,
	operations?: UamTransactionOperation[],
): UamTransactionSupportIssue[] {
	const issues: UamTransactionSupportIssue[] = [];
	if (operations === undefined) {
		validateBaselineSupport(project, issues);
		return issues;
	}
	const lifecycleOnly = validateLifecycleBatchCompatibility(operations, issues);
	validateOperationPayloads(project, operations, issues);
	if (lifecycleOnly && operations.some(isLifecycleOperation)) {
		validateLifecycleOperationPayloads(project, operations, issues);
	}
	return issues;
}

export function assertTransactionSupported(
	project: UamProject,
	operations?: UamTransactionOperation[],
): void {
	const issues = validateTransactionSupport(project, operations);
	if (issues.length === 0) return;
	throw new UamTransactionError(
		`Phase A transaction support check failed:\n${issues.map((issue) => `- ${issue.path}: ${issue.message}`).join('\n')}`,
		{
			code: 'transaction_unsupported',
			issues,
		},
	);
}

