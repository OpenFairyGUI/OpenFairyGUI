import { composeController, composeTransition } from '../authoring.js';
import { GearType, PropertyType } from '../constants.js';
import type { Document } from '../document.js';
import type { Component } from '../properties/component.js';
import type { Controller } from '../properties/controller.js';
import type { GObject } from '../properties/g-object.js';
import type { GTextField } from '../properties/g-text-field.js';
import type { Package } from '../properties/package.js';
import type { Transition } from '../properties/transition.js';
import {
	liftDocumentToUamProject,
	materializeAssetResource,
	materializeDisplayNode,
	materializeUamGear,
	materializeUamProject,
} from './bridge.js';
import type {
	UamAssetResource,
	UamComponentModel,
	UamControllerModel,
	UamDisplayNode,
	UamGearBinding,
	UamLookGearBinding,
	UamProject,
	UamValidationIssue,
} from './model.js';
import { UAM_SUPPORTED_TRANSACTION_SCOPE } from './model.js';
import { normalizeUamProject } from './normalize.js';
import { validateUamProject } from './validate.js';

export interface UamResourceSelector {
	packageId: string;
	resourceId: string;
}

export interface UamPackageSelector {
	packageId: string;
}

export interface UamComponentSelector {
	packageId: string;
	componentResourceId: string;
}

export interface UamDisplayNodeSelector extends UamComponentSelector {
	displayNodeId: string;
}

export interface UamControllerSelector extends UamComponentSelector {
	controllerName: string;
}

export interface UamTransitionSelector extends UamComponentSelector {
	transitionName: string;
}

export interface UamLookGearSelector extends UamDisplayNodeSelector {
	kind: 'look';
	controllerName: string;
}

export interface UamGearSelector extends UamDisplayNodeSelector {
	kind: UamGearBinding['kind'];
	controllerName: string;
}

export interface UamDisplayNodePropsUpdate {
	position?: UamDisplayNode['position'];
	size?: UamDisplayNode['size'];
	visible?: boolean;
	touchable?: boolean;
	grayed?: boolean;
	alpha?: number;
	rotation?: number;
	customData?: string;
	text?: string;
	font?: string;
	fontSize?: number;
	color?: string;
}

type UamTransactionDisplayNodeKind = (typeof UAM_SUPPORTED_TRANSACTION_SCOPE.nodeKinds)[number];
type UamAttachableDisplayNode = Extract<UamDisplayNode, { kind: UamTransactionDisplayNodeKind }>;

interface UamTransactionOperationBase {
	opId?: string;
}

export interface RenameResourceOperation extends UamTransactionOperationBase {
	kind: 'renameResource';
	selector: UamResourceSelector;
	newName: string;
}

export interface MoveResourceOperation extends UamTransactionOperationBase {
	kind: 'moveResource';
	selector: UamResourceSelector;
	toPath: string;
}

export interface AddResourceOperation extends UamTransactionOperationBase {
	kind: 'addResource';
	selector: UamPackageSelector;
	resource: UamAssetResource;
}

export interface ReplaceResourceBytesOperation extends UamTransactionOperationBase {
	kind: 'replaceResourceBytes';
	selector: UamResourceSelector;
	sourceBytes: Uint8Array;
}

export interface RemoveResourceOperation extends UamTransactionOperationBase {
	kind: 'removeResource';
	selector: UamResourceSelector;
}

export interface SetDisplayNodePropsOperation extends UamTransactionOperationBase {
	kind: 'setDisplayNodeProps';
	selector: UamDisplayNodeSelector;
	props: UamDisplayNodePropsUpdate;
}

export interface AttachDisplayNodeOperation extends UamTransactionOperationBase {
	kind: 'attachDisplayNode';
	selector: UamComponentSelector;
	atIndex: number;
	node: UamAttachableDisplayNode;
}

export interface DetachDisplayNodeOperation extends UamTransactionOperationBase {
	kind: 'detachDisplayNode';
	selector: UamDisplayNodeSelector;
}

export interface AddControllerOperation extends UamTransactionOperationBase {
	kind: 'addController';
	selector: UamControllerSelector;
	controller: UamControllerModel;
}

export interface UpdateControllerOperation extends UamTransactionOperationBase {
	kind: 'updateController';
	selector: UamControllerSelector;
	controller: UamControllerModel;
}

export interface RemoveControllerOperation extends UamTransactionOperationBase {
	kind: 'removeController';
	selector: UamControllerSelector;
}

export interface AddTransitionOperation extends UamTransactionOperationBase {
	kind: 'addTransition';
	selector: UamTransitionSelector;
	transition: UamComponentModel['transitions'][number];
}

export interface UpdateTransitionOperation extends UamTransactionOperationBase {
	kind: 'updateTransition';
	selector: UamTransitionSelector;
	transition: UamComponentModel['transitions'][number];
}

export interface RemoveTransitionOperation extends UamTransactionOperationBase {
	kind: 'removeTransition';
	selector: UamTransitionSelector;
}

export interface AddLookGearOperation extends UamTransactionOperationBase {
	kind: 'addLookGear';
	selector: UamLookGearSelector;
	gear: UamLookGearBinding;
}

export interface UpdateLookGearOperation extends UamTransactionOperationBase {
	kind: 'updateLookGear';
	selector: UamLookGearSelector;
	gear: UamLookGearBinding;
}

export interface RemoveLookGearOperation extends UamTransactionOperationBase {
	kind: 'removeLookGear';
	selector: UamLookGearSelector;
}

export interface AddGearOperation extends UamTransactionOperationBase {
	kind: 'addGear';
	selector: UamGearSelector;
	gear: UamGearBinding;
}

export interface UpdateGearOperation extends UamTransactionOperationBase {
	kind: 'updateGear';
	selector: UamGearSelector;
	gear: UamGearBinding;
}

export interface RemoveGearOperation extends UamTransactionOperationBase {
	kind: 'removeGear';
	selector: UamGearSelector;
}

export type UamTransactionOperation =
	| RenameResourceOperation
	| MoveResourceOperation
	| AddResourceOperation
	| ReplaceResourceBytesOperation
	| RemoveResourceOperation
	| SetDisplayNodePropsOperation
	| AttachDisplayNodeOperation
	| DetachDisplayNodeOperation
	| AddControllerOperation
	| UpdateControllerOperation
	| RemoveControllerOperation
	| AddTransitionOperation
	| UpdateTransitionOperation
	| RemoveTransitionOperation
	| AddLookGearOperation
	| UpdateLookGearOperation
	| RemoveLookGearOperation
	| AddGearOperation
	| UpdateGearOperation
	| RemoveGearOperation;

export type UamTransactionSupportIssueCode =
	| 'unsupported_resource_kind'
	| 'unsupported_display_node_kind'
	| 'unsupported_cross_package_image_ref'
	| 'unsupported_gear_kind'
	| 'duplicate_look_gear_controller'
	| 'duplicate_transition_name'
	| 'unsupported_resource_mutation'
	| 'unsupported_display_node_mutation'
	| 'unsupported_text_field_target'
	| 'unsupported_display_node_field'
	| 'invalid_resource_name'
	| 'invalid_resource_path'
	| 'invalid_attach_index'
	| 'invalid_controller_payload'
	| 'invalid_transition_payload'
	| 'invalid_look_gear_selector'
	| 'invalid_look_gear_payload'
	| 'duplicate_look_gear_state_page'
	| 'duplicate_gear_controller'
	| 'invalid_gear_selector'
	| 'invalid_gear_payload'
	| 'duplicate_gear_state_page'
	| 'invalid_resource_payload'
	| 'invalid_resource_selector'
	| 'invalid_display_node_selector'
	| 'duplicate_resource_id'
	| 'unavailable_resource_source_bytes';

export interface UamTransactionSupportIssue {
	code: UamTransactionSupportIssueCode;
	path: string;
	message: string;
	operationKind?: UamTransactionOperation['kind'];
	nodeKind?: UamDisplayNode['kind'];
	resourceKind?: UamProject['packages'][number]['resources'][number]['kind'];
	gearKind?: UamDisplayNode['gears'][number]['kind'];
	field?: string;
}

export type UamTransactionErrorCode =
	| 'invalid_uam'
	| 'transaction_unsupported'
	| 'selector_ambiguity'
	| 'execution_failure';

export class UamTransactionError extends Error {
	public readonly code: UamTransactionErrorCode;
	public readonly opIndex?: number;
	public readonly opId?: string;
	public readonly opKind?: UamTransactionOperation['kind'];
	public readonly selector?: Record<string, unknown>;
	public readonly issues?: UamValidationIssue[] | UamTransactionSupportIssue[];

	public constructor(
		message: string,
		options: {
			code: UamTransactionErrorCode;
			opIndex?: number;
			opId?: string;
			opKind?: UamTransactionOperation['kind'];
			selector?: Record<string, unknown>;
			issues?: UamValidationIssue[] | UamTransactionSupportIssue[];
			cause?: unknown;
		},
	) {
		super(message, { cause: options.cause });
		this.name = 'UamTransactionError';
		this.code = options.code;
		this.opIndex = options.opIndex;
		this.opId = options.opId;
		this.opKind = options.opKind;
		this.selector = options.selector;
		this.issues = options.issues;
	}
}

export class UamTransaction {
	private readonly baseline: UamProject;
	private readonly operations: UamTransactionOperation[] = [];

	public constructor(project: UamProject) {
		this.baseline = normalizeUamProject(project);
	}

	public add(operation: UamTransactionOperation): this {
		this.operations.push(operation);
		return this;
	}

	public addAll(operations: UamTransactionOperation[]): this {
		for (const operation of operations) this.add(operation);
		return this;
	}

	public listOperations(): UamTransactionOperation[] {
		return [...this.operations];
	}

	public commit(): UamProject {
		return applyUamTransaction(this.baseline, this.operations);
	}
}

export function createUamTransaction(project: UamProject): UamTransaction {
	return new UamTransaction(project);
}

function pushSupportIssue(
	issues: UamTransactionSupportIssue[],
	code: UamTransactionSupportIssueCode,
	path: string,
	message: string,
	details: Omit<Partial<UamTransactionSupportIssue>, 'code' | 'path' | 'message'> = {},
): void {
	issues.push({ code, path, message, ...details });
}

type CommonDisplayPropTarget = GObject & {
	setXY(x: number, y: number): unknown;
	setSize(width: number, height: number): unknown;
	setVisible(visible: boolean): unknown;
	setTouchable(touchable: boolean): unknown;
	setGrayed(grayed: boolean): unknown;
	setAlpha(alpha: number): unknown;
	setRotation(rotation: number): unknown;
	setCustomData(customData: string): unknown;
};

const TEXT_DISPLAY_NODE_KINDS = new Set<UamDisplayNode['kind']>(['text', 'richText', 'textInput']);

const TEXT_DISPLAY_PROPERTY_TYPES = new Set<string>([
	PropertyType.G_TEXT_FIELD,
	PropertyType.G_RICH_TEXT_FIELD,
	PropertyType.G_TEXT_INPUT,
]);

const COMMON_DISPLAY_PROPERTY_TYPES = new Set<string>([
	PropertyType.G_IMAGE,
	PropertyType.G_TEXT_FIELD,
	PropertyType.G_RICH_TEXT_FIELD,
	PropertyType.G_TEXT_INPUT,
	PropertyType.G_COMPONENT,
	PropertyType.G_GRAPH,
	PropertyType.G_GROUP,
	PropertyType.G_LIST,
	PropertyType.G_LOADER,
	PropertyType.G_LOADER_3D,
	PropertyType.G_MOVIE_CLIP,
	PropertyType.G_TREE,
	PropertyType.G_BUTTON,
	PropertyType.G_LABEL,
	PropertyType.G_COMBO_BOX,
	PropertyType.G_PROGRESS_BAR,
	PropertyType.G_SLIDER,
	PropertyType.G_SCROLL_BAR,
]);

function findPackageSpec(project: UamProject, packageId: string): UamProject['packages'][number] | null {
	return project.packages.find((pkg) => pkg.id === packageId) ?? null;
}

function findResourceSpec(project: UamProject, selector: UamResourceSelector) {
	const pkg = findPackageSpec(project, selector.packageId);
	if (!pkg) return null;
	return pkg.resources.find((resource) => resource.id === selector.resourceId) ?? null;
}

function findComponentSpec(project: UamProject, selector: UamComponentSelector) {
	const resource = findResourceSpec(project, {
		packageId: selector.packageId,
		resourceId: selector.componentResourceId,
	});
	return resource?.kind === 'component' ? resource : null;
}

function findDisplayNodeSpec(project: UamProject, selector: UamDisplayNodeSelector) {
	const component = findComponentSpec(project, selector);
	return component?.component.displayList.find((node) => node.id === selector.displayNodeId) ?? null;
}

function findResourceSpecWithPath(project: UamProject, selector: UamResourceSelector) {
	const packageIndex = project.packages.findIndex((pkg) => pkg.id === selector.packageId);
	if (packageIndex < 0) return null;
	const pkg = project.packages[packageIndex]!;
	const resourceIndex = pkg.resources.findIndex((resource) => resource.id === selector.resourceId);
	if (resourceIndex < 0) return null;
	return {
		pkg,
		resource: pkg.resources[resourceIndex]!,
		path: `packages[${packageIndex}].resources[${resourceIndex}]`,
	};
}

function findProjectedResource(
	project: UamProject,
	operations: UamTransactionOperation[],
	operationIndex: number,
	selector: UamResourceSelector,
): UamProject['packages'][number]['resources'][number] | null {
	let resource = findResourceSpec(project, selector);
	for (let index = 0; index < operationIndex; index += 1) {
		const operation = operations[index]!;
		if (operation.kind === 'addResource') {
			if (operation.selector.packageId === selector.packageId && operation.resource.id === selector.resourceId) {
				resource = operation.resource;
			}
			continue;
		}
		if (!('selector' in operation) || operation.selector.packageId !== selector.packageId) continue;
		if ('resourceId' in operation.selector && operation.selector.resourceId === selector.resourceId) {
			if (operation.kind === 'removeResource') resource = null;
			if (operation.kind === 'replaceResourceBytes' && resource?.kind !== 'component') {
				resource = { ...resource, sourceBytes: operation.sourceBytes };
			}
		}
	}
	return resource;
}

function findComponentSpecWithPath(project: UamProject, selector: UamComponentSelector) {
	const found = findResourceSpecWithPath(project, {
		packageId: selector.packageId,
		resourceId: selector.componentResourceId,
	});
	if (!found || found.resource.kind !== 'component') return null;
	return {
		pkg: found.pkg,
		resource: found.resource,
		path: found.path,
	};
}

function findDisplayNodeSpecWithPath(project: UamProject, selector: UamDisplayNodeSelector) {
	const component = findComponentSpecWithPath(project, selector);
	if (!component) return null;
	const nodeIndex = component.resource.component.displayList.findIndex((node) => node.id === selector.displayNodeId);
	if (nodeIndex < 0) return null;
	return {
		pkg: component.pkg,
		component: component.resource,
		node: component.resource.component.displayList[nodeIndex]!,
		path: `${component.path}.component.displayList[${nodeIndex}]`,
	};
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

function validateOperationPayloads(project: UamProject, operations: UamTransactionOperation[], issues: UamTransactionSupportIssue[]): void {
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
	validateOperationPayloads(project, operations, issues);
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

function asTransactionError(
	error: unknown,
	defaults: {
		code: UamTransactionErrorCode;
		opIndex?: number;
		opId?: string;
		opKind?: UamTransactionOperation['kind'];
		selector?: Record<string, unknown>;
	},
): UamTransactionError {
	if (error instanceof UamTransactionError) {
		return new UamTransactionError(error.message, {
			code: error.code,
			opIndex: error.opIndex ?? defaults.opIndex,
			opId: error.opId ?? defaults.opId,
			opKind: error.opKind ?? defaults.opKind,
			selector: error.selector ?? defaults.selector,
			issues: error.issues,
			cause: error.cause ?? error,
		});
	}
	return new UamTransactionError(error instanceof Error ? error.message : String(error), {
		code: defaults.code,
		opIndex: defaults.opIndex,
		opId: defaults.opId,
		opKind: defaults.opKind,
		selector: defaults.selector,
		cause: error,
	});
}

function selectorDetails(selector: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
	return selector;
}

type UamTextLikeDisplayNode = Extract<UamDisplayNode, { kind: 'text' | 'richText' | 'textInput' }>;

function isTextLikeDisplayNode(node: UamDisplayNode): node is UamTextLikeDisplayNode {
	return TEXT_DISPLAY_NODE_KINDS.has(node.kind);
}

function canApplyOperationsInUam(operations: UamTransactionOperation[]): boolean {
	return operations.every((operation) => operation.kind === 'setDisplayNodeProps');
}

function applyDisplayNodePropsUpdate(node: UamDisplayNode, props: UamDisplayNodePropsUpdate): void {
	if (props.position !== undefined) node.position = { ...props.position };
	if (props.size !== undefined) node.size = { ...props.size };
	if (props.visible !== undefined) node.visible = props.visible;
	if (props.touchable !== undefined) node.touchable = props.touchable;
	if (props.grayed !== undefined) node.grayed = props.grayed;
	if (props.alpha !== undefined) node.alpha = props.alpha;
	if (props.rotation !== undefined) node.rotation = props.rotation;
	if (props.customData !== undefined) node.customData = props.customData;

	const hasTextProps = props.text !== undefined
		|| props.font !== undefined
		|| props.fontSize !== undefined
		|| props.color !== undefined;
	if (!hasTextProps) return;
	if (!isTextLikeDisplayNode(node)) {
		throw new Error(`Text display props are not supported on display node kind "${node.kind}".`);
	}
	if (props.text !== undefined) node.text = props.text;
	if (props.font !== undefined) node.font = props.font;
	if (props.fontSize !== undefined) node.fontSize = props.fontSize;
	if (props.color !== undefined) node.color = props.color;
}

function applyUamNativeOperation(project: UamProject, operation: UamTransactionOperation): void {
	switch (operation.kind) {
		case 'setDisplayNodeProps': {
			const found = findDisplayNodeSpecWithPath(project, operation.selector);
			if (!found) {
				throw new Error(`Display node "${operation.selector.displayNodeId}" was not found in component "${operation.selector.componentResourceId}".`);
			}
			applyDisplayNodePropsUpdate(found.node, operation.props);
			return;
		}
		default:
			throw new Error(`UAM-native transaction path does not support operation "${operation.kind}".`);
	}
}

function applyUamNativeOperations(
	project: UamProject,
	operations: UamTransactionOperation[],
): UamProject {
	const result = normalizeUamProject(project);
	for (const [opIndex, operation] of operations.entries()) {
		try {
			applyUamNativeOperation(result, operation);
		} catch (error) {
			throw asTransactionError(error, {
				code: error instanceof UamTransactionError ? error.code : 'execution_failure',
				opIndex,
				opId: operation.opId,
				opKind: operation.kind,
				selector: 'selector' in operation ? selectorDetails(operation.selector as unknown as Record<string, unknown>) : undefined,
			});
		}
	}
	return result;
}

function resolvePackage(doc: Document, selector: { packageId: string }): Package {
	const pkg = doc.getRoot().getPackageById(selector.packageId);
	if (!pkg) {
		throw new Error(`Package "${selector.packageId}" was not found.`);
	}
	return pkg;
}

function resolveResource(doc: Document, selector: UamResourceSelector) {
	const pkg = resolvePackage(doc, selector);
	const resource = pkg.getResourceById(selector.resourceId);
	if (!resource) {
		throw new Error(`Resource "${selector.resourceId}" was not found in package "${selector.packageId}".`);
	}
	return { pkg, resource };
}

function resolveComponent(doc: Document, selector: UamComponentSelector): Component {
	const { resource } = resolveResource(doc, {
		packageId: selector.packageId,
		resourceId: selector.componentResourceId,
	});
	if (resource.propertyType !== 'Component') {
		throw new Error(`Resource "${selector.componentResourceId}" is not a component.`);
	}
	return resource as Component;
}

function resolveDisplayNode(doc: Document, selector: UamDisplayNodeSelector): GObject {
	const component = resolveComponent(doc, selector);
	const node = component.getChildById(selector.displayNodeId);
	if (!node) {
		throw new Error(`Display node "${selector.displayNodeId}" was not found in component "${selector.componentResourceId}".`);
	}
	return node;
}

function resolveUniqueController(component: Component, selector: UamControllerSelector): Controller {
	const matches = component.listControllers().filter((controller) => controller.getName() === selector.controllerName);
	if (matches.length === 0) {
		throw new Error(`Controller "${selector.controllerName}" was not found in component "${selector.componentResourceId}".`);
	}
		if (matches.length > 1) {
			throw new UamTransactionError(
				`Controller selector "${selector.controllerName}" is ambiguous in component "${selector.componentResourceId}".`,
				{
					code: 'selector_ambiguity',
					selector: selectorDetails(selector as unknown as Record<string, unknown>),
				},
			);
		}
	return matches[0]!;
}

function resolveUniqueTransition(component: Component, selector: UamTransitionSelector): Transition {
	const matches = component.listTransitions().filter((transition) => transition.getName() === selector.transitionName);
	if (matches.length === 0) {
		throw new Error(`Transition "${selector.transitionName}" was not found in component "${selector.componentResourceId}".`);
	}
		if (matches.length > 1) {
			throw new UamTransactionError(
				`Transition selector "${selector.transitionName}" is ambiguous in component "${selector.componentResourceId}".`,
				{
					code: 'selector_ambiguity',
					selector: selectorDetails(selector as unknown as Record<string, unknown>),
				},
			);
		}
	return matches[0]!;
}

function gearTypeForKind(kind: UamGearBinding['kind']): GearType {
	switch (kind) {
		case 'display': return GearType.Display;
		case 'display2': return GearType.Display2;
		case 'xy': return GearType.XY;
		case 'size': return GearType.Size;
		case 'look': return GearType.Look;
		case 'color': return GearType.Color;
		case 'animation': return GearType.Animation;
		case 'text': return GearType.Text;
		case 'icon': return GearType.Icon;
		case 'fontSize': return GearType.FontSize;
	}
}

function hasControllerGear(node: GObject, selector: UamGearSelector): boolean {
	return node.listGears().some((gear) => (
		gear.getGearType() === gearTypeForKind(selector.kind)
		&& gear.getController()?.getName() === selector.controllerName
	));
}

function resolveUniqueGear(node: GObject, selector: UamGearSelector) {
	const matches = node.listGears().filter((gear) => (
		gear.getGearType() === gearTypeForKind(selector.kind)
		&& gear.getController()?.getName() === selector.controllerName
	));
	if (matches.length === 0) {
		throw new Error(`${selector.kind} gear for controller "${selector.controllerName}" was not found on node "${selector.displayNodeId}".`);
	}
	if (matches.length > 1) {
		throw new UamTransactionError(
			`${selector.kind} gear selector is ambiguous on node "${selector.displayNodeId}" for controller "${selector.controllerName}".`,
			{
				code: 'selector_ambiguity',
				selector: selectorDetails(selector as unknown as Record<string, unknown>),
			},
		);
	}
	return matches[0]!;
}

function applyCommonDisplayProps(target: CommonDisplayPropTarget, props: UamDisplayNodePropsUpdate): void {
	if (props.position) target.setXY(props.position.x, props.position.y);
	if (props.size) target.setSize(props.size.width, props.size.height);
	if (props.visible !== undefined) target.setVisible(props.visible);
	if (props.touchable !== undefined) target.setTouchable(props.touchable);
	if (props.grayed !== undefined) target.setGrayed(props.grayed);
	if (props.alpha !== undefined) target.setAlpha(props.alpha);
	if (props.rotation !== undefined) target.setRotation(props.rotation);
	if (props.customData !== undefined) target.setCustomData(props.customData);
}

function withDefaultOwnPackageRef(packageId: string, node: UamAttachableDisplayNode): UamAttachableDisplayNode {
	if ((node.kind === 'image' || node.kind === 'component') && node.resource.packageId === undefined) {
		return {
			...node,
			resource: {
				...node.resource,
				packageId,
			},
		} as UamAttachableDisplayNode;
	}
	return node;
}

function createAttachableNode(doc: Document, packageId: string, node: UamAttachableDisplayNode): GObject {
	return materializeDisplayNode(doc, withDefaultOwnPackageRef(packageId, node));
}

function reorderChildren(component: Component, orderedChildren: GObject[]): void {
	const currentChildren = [...component.listChildren()];
	for (const child of currentChildren) component.removeChild(child);
	for (const child of orderedChildren) component.addChild(child);
}

function insertChildAtIndex(component: Component, child: GObject, atIndex: number): void {
	const children = [...component.listChildren()];
	if (atIndex < 0 || atIndex > children.length) {
		throw new Error(`attachDisplayNode.atIndex ${atIndex} is out of bounds for component "${component.getId()}".`);
	}
	const orderedChildren = [...children];
	orderedChildren.splice(atIndex, 0, child);
	reorderChildren(component, orderedChildren);
}

function validateControllerModelAgainstComponent(component: Component, model: UamControllerModel, owner: string): void {
	if (model.pages.length === 0) {
		throw new Error(`${owner}: controller "${model.name}" must define at least one page.`);
	}
	const seen = new Set<string>();
	for (const page of model.pages) {
		if (!page.id) {
			throw new Error(`${owner}: controller "${model.name}" has a page with an empty id.`);
		}
		if (seen.has(page.id)) {
			throw new Error(`${owner}: controller "${model.name}" has duplicate page id "${page.id}".`);
		}
		seen.add(page.id);
	}
	if (model.selectedIndex < 0 || model.selectedIndex >= model.pages.length) {
		throw new Error(`${owner}: controller "${model.name}" selectedIndex is out of range.`);
	}
	const pageIds = new Set(model.pages.map((page) => page.id));
	for (const action of model.actions) {
		for (const pageId of action.fromPageIds) {
			if (!pageIds.has(pageId)) throw new Error(`${owner}: controller "${model.name}" action references unknown fromPage id "${pageId}".`);
		}
		for (const pageId of action.toPageIds) {
			if (!pageIds.has(pageId)) throw new Error(`${owner}: controller "${model.name}" action references unknown toPage id "${pageId}".`);
		}
		if (action.targetNodeId && !component.getChildById(action.targetNodeId)) {
			throw new Error(`${owner}: controller "${model.name}" action references unknown target node "${action.targetNodeId}".`);
		}
	}
}

function replaceControllerModel(
	doc: Document,
	component: Component,
	controller: Controller,
	model: UamControllerModel,
): void {
	validateControllerModelAgainstComponent(component, model, 'updateController');
	controller.setName(model.name);
	controller.setAutoRadioGroupDepth(model.autoRadioGroupDepth);
	controller.setSelectedIndex(model.selectedIndex);
	for (const action of [...controller.listActions()]) controller.removeAction(action);
	for (const page of [...controller.listPages()]) controller.removePage(page);
	for (const page of model.pages) {
		controller.addPage(doc.createControllerPage(page.name).setId(page.id));
	}
	for (const actionModel of model.actions) {
		controller.addAction(
			doc.createControllerAction(actionModel.name)
				.setActionType(actionModel.actionType)
				.setFromPage([...actionModel.fromPageIds])
				.setToPage([...actionModel.toPageIds])
				.setTransitionName(actionModel.transitionName)
				.setPlayTimes(actionModel.playTimes)
				.setDelay(actionModel.delay)
				.setStopOnExit(actionModel.stopOnExit)
				.setObjectId(actionModel.targetNodeId)
				.setControllerName(actionModel.controllerName)
				.setTargetPage(actionModel.targetPage),
		);
	}
}

function replaceTransitionModel(
	doc: Document,
	component: Component,
	transition: Transition,
	model: UamComponentModel['transitions'][number],
): void {
	component.removeTransition(transition);
	composeTransition(doc, component, {
		name: model.name,
		autoPlay: model.autoPlay,
		autoPlayTimes: model.autoPlayTimes,
		autoPlayDelay: model.autoPlayDelay,
		options: model.options,
		fps: model.fps,
		items: model.items.map((item) => ({
			name: item.name,
			time: item.time,
			target: item.targetNodeId || null,
			actionType: item.actionType,
			tween: item.tween,
			duration: item.duration,
			startValue: [...item.startValue],
			endValue: [...item.endValue],
			easeType: item.easeType,
			repeat: item.repeat,
			yoyo: item.yoyo,
			label: item.label,
			endLabel: item.endLabel,
			path: item.path,
			customEasePath: item.customEasePath,
		})),
	});
}

type ResourceSourceData = {
	getURI(): string;
	getData(): Uint8Array | null;
};

type MutableAssetResource = {
	propertyType: string;
	getName(): string;
	setName(name: string): unknown;
	getPath(): string;
	setPath(path: string): unknown;
	getFileName?(): string;
	setFileName?(fileName: string): unknown;
	getFile?(): string;
	setFile?(file: string): unknown;
	getSourceData(): ResourceSourceData | null;
	setSourceData(buffer: ReturnType<Document['createBuffer']> | null): unknown;
};

function asMutableAssetResource(resource: ReturnType<Package['getResourceById']>): MutableAssetResource {
	if (!resource || resource.propertyType === PropertyType.COMPONENT) {
		throw new Error('Expected a binary package resource.');
	}
	return resource as unknown as MutableAssetResource;
}

function getAssetFileName(resource: MutableAssetResource): string {
	return resource.getFileName?.() ?? resource.getFile?.() ?? '';
}

function setAssetFileName(resource: MutableAssetResource, fileName: string): void {
	if (resource.setFileName) {
		resource.setFileName(fileName);
		return;
	}
	if (resource.setFile) {
		resource.setFile(fileName);
		return;
	}
	throw new Error(`Resource "${resource.getName()}" does not expose a primary source file name.`);
}

function resourceNameFromFileName(fileName: string): string {
	const extensionIndex = fileName.lastIndexOf('.');
	return extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
}

function renamedAssetFileName(resource: MutableAssetResource, requestedName: string): string {
	if (requestedName.includes('.')) return requestedName;
	const previousFileName = getAssetFileName(resource);
	const extensionIndex = previousFileName.lastIndexOf('.');
	return extensionIndex > 0 ? `${requestedName}${previousFileName.slice(extensionIndex)}` : requestedName;
}

function renameBinaryAssetResource(resource: MutableAssetResource, requestedName: string): void {
	const fileName = renamedAssetFileName(resource, requestedName);
	if (!fileName) throw new Error(`Resource "${resource.getName()}" does not define a primary source file.`);
	setAssetFileName(resource, fileName);
	resource.setName(resourceNameFromFileName(fileName));
}

function replaceBinaryAssetBytes(doc: Document, resource: MutableAssetResource, sourceBytes: Uint8Array): void {
	const previousSource = resource.getSourceData();
	if (!previousSource) {
		throw new Error(`Resource "${resource.getName()}" has no hydrated primary source bytes.`);
	}
	const sourcePath = previousSource.getURI() || `/${[resource.getPath(), getAssetFileName(resource)].filter(Boolean).join('/')}`;
	resource.setSourceData(doc.createBuffer()
		.setURI(sourcePath)
		.setData(new Uint8Array(sourceBytes)));
}

function addGearToDisplayNode(
	doc: Document,
	component: Component,
	node: GObject,
	selector: UamGearSelector,
	gear: UamGearBinding,
): void {
	if (hasControllerGear(node, selector)) {
		throw new UamTransactionError(
			`${selector.kind} gear for controller "${selector.controllerName}" already exists on node "${selector.displayNodeId}".`,
			{
				code: 'selector_ambiguity',
				selector: selectorDetails(selector as unknown as Record<string, unknown>),
			},
		);
	}
	resolveUniqueController(component, {
		packageId: selector.packageId,
		componentResourceId: selector.componentResourceId,
		controllerName: selector.controllerName,
	});
	materializeUamGear(doc, component, node, gear);
}

function replaceGearOnDisplayNode(
	doc: Document,
	component: Component,
	node: GObject,
	selector: UamGearSelector,
	gear: UamGearBinding,
): void {
	node.removeGear(resolveUniqueGear(node, selector));
	resolveUniqueController(component, {
		packageId: selector.packageId,
		componentResourceId: selector.componentResourceId,
		controllerName: selector.controllerName,
	});
	materializeUamGear(doc, component, node, gear);
}

function applyOperation(doc: Document, operation: UamTransactionOperation): void {
	switch (operation.kind) {
		case 'renameResource': {
			const { resource } = resolveResource(doc, operation.selector);
			if (resource.propertyType === PropertyType.COMPONENT) {
				resource.setName(operation.newName);
				return;
			}
			renameBinaryAssetResource(asMutableAssetResource(resource), operation.newName);
			return;
		}
		case 'moveResource': {
			const { resource } = resolveResource(doc, operation.selector);
			resource.setPath(operation.toPath);
			return;
		}
		case 'addResource': {
			const pkg = resolvePackage(doc, operation.selector);
			if (pkg.getResourceById(operation.resource.id)) {
				throw new Error(`Resource "${operation.resource.id}" already exists in package "${operation.selector.packageId}".`);
			}
			pkg.addResource(materializeAssetResource(doc, operation.resource));
			return;
		}
		case 'replaceResourceBytes': {
			const { resource } = resolveResource(doc, operation.selector);
			replaceBinaryAssetBytes(doc, asMutableAssetResource(resource), operation.sourceBytes);
			return;
		}
		case 'removeResource': {
			const { pkg, resource } = resolveResource(doc, operation.selector);
			if (resource.propertyType === PropertyType.COMPONENT) {
				throw new Error('removeResource only supports binary package resources.');
			}
			pkg.removeResource(resource);
			return;
		}
		case 'setDisplayNodeProps': {
			const node = resolveDisplayNode(doc, operation.selector);
			if (!COMMON_DISPLAY_PROPERTY_TYPES.has(node.propertyType)) {
				throw new Error(`setDisplayNodeProps does not support display node type "${node.propertyType}" in Phase A.`);
			}
			applyCommonDisplayProps(node as CommonDisplayPropTarget, operation.props);
			if (TEXT_DISPLAY_PROPERTY_TYPES.has(node.propertyType)) {
				const textNode = node as GTextField;
				if (operation.props.text !== undefined) textNode.setText(operation.props.text);
				if (operation.props.font !== undefined) textNode.setFont(operation.props.font);
				if (operation.props.fontSize !== undefined) textNode.setFontSize(operation.props.fontSize);
				if (operation.props.color !== undefined) textNode.setColor(operation.props.color);
			}
			return;
		}
		case 'attachDisplayNode': {
			const component = resolveComponent(doc, operation.selector);
			if (component.getChildById(operation.node.id)) {
				throw new Error(`attachDisplayNode target component "${component.getId()}" already contains node id "${operation.node.id}".`);
			}
			const child = createAttachableNode(doc, operation.selector.packageId, operation.node);
			insertChildAtIndex(component, child, operation.atIndex);
			for (const gear of operation.node.gears) {
				addGearToDisplayNode(doc, component, child, {
					packageId: operation.selector.packageId,
					componentResourceId: operation.selector.componentResourceId,
					displayNodeId: operation.node.id,
					kind: gear.kind,
					controllerName: gear.controllerName,
				}, gear);
			}
			return;
		}
		case 'detachDisplayNode': {
			const component = resolveComponent(doc, operation.selector);
			const node = component.getChildById(operation.selector.displayNodeId);
			if (!node) {
				throw new Error(`Display node "${operation.selector.displayNodeId}" was not found in component "${operation.selector.componentResourceId}".`);
			}
			component.removeChild(node);
			return;
		}
		case 'addController': {
			const component = resolveComponent(doc, operation.selector);
			validateControllerModelAgainstComponent(component, operation.controller, 'addController');
			if (component.listControllers().some((controller) => controller.getName() === operation.selector.controllerName)) {
				throw new Error(`Controller "${operation.selector.controllerName}" already exists in component "${operation.selector.componentResourceId}".`);
			}
			composeController(doc, component, {
				name: operation.controller.name,
				selectedIndex: operation.controller.selectedIndex,
				autoRadioGroupDepth: operation.controller.autoRadioGroupDepth,
				pages: operation.controller.pages.map((page) => ({ id: page.id, name: page.name })),
				actions: operation.controller.actions.map((action) => ({
					name: action.name,
					actionType: action.actionType,
					fromPage: [...action.fromPageIds],
					toPage: [...action.toPageIds],
					transitionName: action.transitionName,
					playTimes: action.playTimes,
					delay: action.delay,
					stopOnExit: action.stopOnExit,
					object: action.targetNodeId || null,
					controllerName: action.controllerName,
					targetPage: action.targetPage,
				})),
			});
			return;
		}
		case 'updateController': {
			const component = resolveComponent(doc, operation.selector);
			validateControllerModelAgainstComponent(component, operation.controller, 'updateController');
			const controller = resolveUniqueController(component, operation.selector);
			replaceControllerModel(doc, component, controller, operation.controller);
			return;
		}
		case 'removeController': {
			const component = resolveComponent(doc, operation.selector);
			const controller = resolveUniqueController(component, operation.selector);
			for (const child of component.listChildren()) {
				if (child.listGears().some((gear) => gear.getController() === controller)) {
					throw new Error(`Cannot remove controller "${controller.getName()}" while a child gear still references it.`);
				}
			}
			component.removeController(controller);
			return;
		}
		case 'addTransition': {
			const component = resolveComponent(doc, operation.selector);
			if (component.listTransitions().some((transition) => transition.getName() === operation.selector.transitionName)) {
				throw new Error(`Transition "${operation.selector.transitionName}" already exists in component "${operation.selector.componentResourceId}".`);
			}
			composeTransition(doc, component, {
				name: operation.transition.name,
				autoPlay: operation.transition.autoPlay,
				autoPlayTimes: operation.transition.autoPlayTimes,
				autoPlayDelay: operation.transition.autoPlayDelay,
				options: operation.transition.options,
				fps: operation.transition.fps,
				items: operation.transition.items.map((item) => ({
					name: item.name,
					time: item.time,
					target: item.targetNodeId || null,
					actionType: item.actionType,
					tween: item.tween,
					duration: item.duration,
					startValue: [...item.startValue],
					endValue: [...item.endValue],
					easeType: item.easeType,
					repeat: item.repeat,
					yoyo: item.yoyo,
					label: item.label,
					endLabel: item.endLabel,
					path: item.path,
					customEasePath: item.customEasePath,
				})),
			});
			return;
		}
		case 'updateTransition': {
			const component = resolveComponent(doc, operation.selector);
			const transition = resolveUniqueTransition(component, operation.selector);
			replaceTransitionModel(doc, component, transition, operation.transition);
			return;
		}
		case 'removeTransition': {
			const component = resolveComponent(doc, operation.selector);
			const transition = resolveUniqueTransition(component, operation.selector);
			component.removeTransition(transition);
			return;
		}
		case 'addLookGear':
		case 'addGear': {
			const component = resolveComponent(doc, operation.selector);
			const node = resolveDisplayNode(doc, operation.selector);
			addGearToDisplayNode(doc, component, node, operation.selector, operation.gear);
			return;
		}
		case 'updateLookGear':
		case 'updateGear': {
			const component = resolveComponent(doc, operation.selector);
			const node = resolveDisplayNode(doc, operation.selector);
			replaceGearOnDisplayNode(doc, component, node, operation.selector, operation.gear);
			return;
		}
		case 'removeLookGear':
		case 'removeGear': {
			const node = resolveDisplayNode(doc, operation.selector);
			node.removeGear(resolveUniqueGear(node, operation.selector));
			return;
		}
	}
}

export function applyUamTransaction(
	project: UamProject,
	operations: UamTransactionOperation[],
): UamProject {
	const baseline = normalizeUamProject(project);
	assertTransactionSupported(baseline, operations);
	if (canApplyOperationsInUam(operations)) {
		return applyUamNativeOperations(baseline, operations);
	}

	const baselineIssues = validateUamProject(baseline);
	if (baselineIssues.length > 0) {
		throw new UamTransactionError(
			`UAM validation failed before transaction:\n${baselineIssues.map((issue) => `- ${issue.path}: ${issue.message}`).join('\n')}`,
			{
				code: 'invalid_uam',
				issues: baselineIssues,
			},
		);
	}

	const workingDocument = materializeUamProject(baseline);
	for (const [opIndex, operation] of operations.entries()) {
		try {
			applyOperation(workingDocument, operation);
		} catch (error) {
				throw asTransactionError(error, {
					code: error instanceof UamTransactionError ? error.code : 'execution_failure',
					opIndex,
					opId: operation.opId,
					opKind: operation.kind,
					selector: 'selector' in operation ? selectorDetails(operation.selector as unknown as Record<string, unknown>) : undefined,
				});
			}
		}

	const result = normalizeUamProject(liftDocumentToUamProject(workingDocument));
	const resultIssues = validateUamProject(result);
	if (resultIssues.length > 0) {
		throw new UamTransactionError(
			`Transaction produced invalid UAM:\n${resultIssues.map((issue) => `- ${issue.path}: ${issue.message}`).join('\n')}`,
			{
				code: 'execution_failure',
				issues: resultIssues,
			},
		);
	}

	return result;
}
