import { bindLookGear, composeController, composeTransition } from '../authoring.js';
import { GearType } from '../constants.js';
import type { Document } from '../document.js';
import type { Component } from '../properties/component.js';
import type { Controller } from '../properties/controller.js';
import type { GImage } from '../properties/g-image.js';
import type { GObject } from '../properties/g-object.js';
import type { GTextField } from '../properties/g-text-field.js';
import type { Package } from '../properties/package.js';
import type { Transition } from '../properties/transition.js';
import { liftDocumentToUamProject, materializeUamProject } from './bridge.js';
import type {
	UamComponentModel,
	UamControllerModel,
	UamDisplayNode,
	UamImageNode,
	UamLookGearBinding,
	UamProject,
	UamRelation,
	UamTextNode,
	UamValidationIssue,
} from './model.js';
import { UAM_SUPPORTED_TRANSACTION_SCOPE } from './model.js';
import { normalizeUamProject } from './normalize.js';
import { validateUamProject } from './validate.js';

export interface UamResourceSelector {
	packageId: string;
	resourceId: string;
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

type UamAttachableDisplayNode = UamImageNode | UamTextNode;

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

export type UamTransactionOperation =
	| RenameResourceOperation
	| MoveResourceOperation
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
	| RemoveLookGearOperation;

export interface UamTransactionSupportIssue {
	path: string;
	message: string;
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

function pushSupportIssue(issues: UamTransactionSupportIssue[], path: string, message: string): void {
	issues.push({ path, message });
}

function cloneRelations(relations: UamRelation[]): Array<{ target: string; type: number; usePercent: boolean }> {
	return relations.map((relation) => ({
		target: relation.targetNodeId,
		type: relation.type,
		usePercent: relation.usePercent,
	}));
}

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
): void {
	if (!UAM_SUPPORTED_TRANSACTION_SCOPE.nodeKinds.includes(node.kind as never)) {
		pushSupportIssue(issues, `${path}.kind`, `Phase A does not support display node kind "${node.kind}".`);
	}

	if (node.kind === 'image' && node.resource.packageId && node.resource.packageId !== owningPackageId) {
		pushSupportIssue(
			issues,
			`${path}.resource.packageId`,
			`Phase A does not support cross-package image refs on supported image nodes ("${node.resource.packageId}" != "${owningPackageId}").`,
		);
	}

	if (node.kind === 'component') {
		pushSupportIssue(issues, `${path}.kind`, 'Phase A does not support component display nodes.');
	}

	const lookGearControllers = new Set<string>();
	for (const [gearIndex, gear] of node.gears.entries()) {
		if (!UAM_SUPPORTED_TRANSACTION_SCOPE.gearKinds.includes(gear.kind as never)) {
			pushSupportIssue(issues, `${path}.gears[${gearIndex}]`, `Phase A does not support gear kind "${gear.kind}".`);
			continue;
		}
		if (gear.kind !== 'look') continue;
		if (lookGearControllers.has(gear.controllerName)) {
			pushSupportIssue(
				issues,
				`${path}.gears[${gearIndex}]`,
				`Phase A allows at most one look gear per display node per controller ("${gear.controllerName}").`,
			);
		}
		lookGearControllers.add(gear.controllerName);
	}
}

function validateBaselineSupport(project: UamProject, issues: UamTransactionSupportIssue[]): void {
	for (const [packageIndex, pkg] of project.packages.entries()) {
		for (const [resourceIndex, resource] of pkg.resources.entries()) {
			const resourcePath = `packages[${packageIndex}].resources[${resourceIndex}]`;
			if (resource.kind !== 'component' && !UAM_SUPPORTED_TRANSACTION_SCOPE.resourceKinds.includes(resource.kind as never)) {
				pushSupportIssue(issues, `${resourcePath}.kind`, `Phase A does not support resource kind "${resource.kind}".`);
				continue;
			}

			if (resource.kind !== 'component') continue;

			const duplicateTransitionNames = countDuplicateNames(resource.component.transitions.map((transition) => transition.name));
			for (const duplicateName of duplicateTransitionNames) {
				pushSupportIssue(
					issues,
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
			if (nodeKind && nodeKind !== 'text') {
				pushSupportIssue(issues, `${path}.props.${String(key)}`, `Field "${String(key)}" is only supported on text display nodes.`);
			}
			continue;
		}
		pushSupportIssue(issues, `${path}.props.${String(key)}`, `Field "${String(key)}" is not supported by setDisplayNodeProps in Phase A.`);
	}
}

function validateUniquePageIds(
	pages: UamControllerModel['pages'],
	path: string,
	issues: UamTransactionSupportIssue[],
): void {
	const seen = new Set<string>();
	for (const [pageIndex, page] of pages.entries()) {
		if (!page.id) {
			pushSupportIssue(issues, `${path}.pages[${pageIndex}].id`, 'Controller page id must not be empty.');
			continue;
		}
		if (seen.has(page.id)) {
			pushSupportIssue(issues, `${path}.pages[${pageIndex}].id`, `Duplicate controller page id "${page.id}".`);
		}
		seen.add(page.id);
	}
}

function validateControllerPayload(
	selector: UamControllerSelector,
	controller: UamControllerModel,
	path: string,
	issues: UamTransactionSupportIssue[],
): void {
	if (controller.name !== selector.controllerName) {
		pushSupportIssue(issues, `${path}.controller.name`, 'Controller payload name must match selector.controllerName.');
	}
	if (controller.pages.length === 0) {
		pushSupportIssue(issues, `${path}.controller.pages`, 'Controller payload must define at least one page.');
	}
	validateUniquePageIds(controller.pages, `${path}.controller`, issues);
	if (controller.selectedIndex < 0 || controller.selectedIndex >= controller.pages.length) {
		pushSupportIssue(issues, `${path}.controller.selectedIndex`, 'Controller selectedIndex is out of range.');
	}
	const pageIds = new Set(controller.pages.map((page) => page.id));
	for (const [actionIndex, action] of controller.actions.entries()) {
		for (const pageId of action.fromPageIds) {
			if (!pageIds.has(pageId)) {
				pushSupportIssue(issues, `${path}.controller.actions[${actionIndex}].fromPageIds`, `Unknown controller page id "${pageId}".`);
			}
		}
		for (const pageId of action.toPageIds) {
			if (!pageIds.has(pageId)) {
				pushSupportIssue(issues, `${path}.controller.actions[${actionIndex}].toPageIds`, `Unknown controller page id "${pageId}".`);
			}
		}
	}
}

function validateTransitionPayload(
	selector: UamTransitionSelector,
	transition: UamComponentModel['transitions'][number],
	path: string,
	issues: UamTransactionSupportIssue[],
): void {
	if (transition.name !== selector.transitionName) {
		pushSupportIssue(issues, `${path}.transition.name`, 'Transition payload name must match selector.transitionName.');
	}
}

function validateLookGearPayload(
	selector: UamLookGearSelector,
	gear: UamLookGearBinding,
	path: string,
	issues: UamTransactionSupportIssue[],
): void {
	if (selector.kind !== 'look') {
		pushSupportIssue(issues, `${path}.selector.kind`, 'Phase A only supports look gear selectors.');
	}
	if (gear.kind !== 'look') {
		pushSupportIssue(issues, `${path}.gear.kind`, 'Phase A only supports look gear payloads.');
	}
	if (gear.controllerName !== selector.controllerName) {
		pushSupportIssue(issues, `${path}.gear.controllerName`, 'Look gear payload controllerName must match selector.controllerName.');
	}
	const seen = new Set<string>();
	for (const [stateIndex, state] of gear.states.entries()) {
		if (seen.has(state.pageId)) {
			pushSupportIssue(issues, `${path}.gear.states[${stateIndex}]`, `Duplicate look gear state page id "${state.pageId}".`);
		}
		seen.add(state.pageId);
	}
}

function validateOperationPayloads(project: UamProject, operations: UamTransactionOperation[], issues: UamTransactionSupportIssue[]): void {
	for (const [operationIndex, operation] of operations.entries()) {
		const operationPath = `operations[${operationIndex}]`;
		switch (operation.kind) {
			case 'renameResource':
				if (!operation.newName) {
					pushSupportIssue(issues, `${operationPath}.newName`, 'renameResource.newName must not be empty.');
				}
				break;
			case 'moveResource':
				if (!operation.toPath) {
					pushSupportIssue(issues, `${operationPath}.toPath`, 'moveResource.toPath must not be empty.');
				}
				break;
			case 'setDisplayNodeProps':
				validateDisplayPropsPayload(operation, project, operationPath, issues);
				break;
			case 'attachDisplayNode':
				if (!Number.isInteger(operation.atIndex) || operation.atIndex < 0) {
					pushSupportIssue(issues, `${operationPath}.atIndex`, 'attachDisplayNode.atIndex must be a non-negative integer.');
				}
				validateSupportedDisplayNode(operation.node, operation.selector.packageId, `${operationPath}.node`, issues);
				break;
			case 'detachDisplayNode':
				break;
			case 'addController':
			case 'updateController':
				validateControllerPayload(operation.selector, operation.controller, operationPath, issues);
				break;
			case 'removeController':
				break;
			case 'addTransition':
			case 'updateTransition':
				validateTransitionPayload(operation.selector, operation.transition, operationPath, issues);
				break;
			case 'removeTransition':
				break;
			case 'addLookGear':
			case 'updateLookGear':
				validateLookGearPayload(operation.selector, operation.gear, operationPath, issues);
				break;
			case 'removeLookGear':
				break;
		}
	}
}

export function validateTransactionSupport(
	project: UamProject,
	operations: UamTransactionOperation[] = [],
): UamTransactionSupportIssue[] {
	const issues: UamTransactionSupportIssue[] = [];
	validateBaselineSupport(project, issues);
	validateOperationPayloads(project, operations, issues);
	return issues;
}

export function assertTransactionSupported(
	project: UamProject,
	operations: UamTransactionOperation[] = [],
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

function resolveUniqueLookGear(node: GObject, selector: UamLookGearSelector) {
	const matches = node.listGears().filter((gear) => (
		gear.getGearType() === GearType.Look
		&& gear.getController()?.getName() === selector.controllerName
	));
	if (matches.length === 0) {
		throw new Error(`Look gear for controller "${selector.controllerName}" was not found on node "${selector.displayNodeId}".`);
	}
		if (matches.length > 1) {
			throw new UamTransactionError(
				`Look gear selector is ambiguous on node "${selector.displayNodeId}" for controller "${selector.controllerName}".`,
				{
					code: 'selector_ambiguity',
					selector: selectorDetails(selector as unknown as Record<string, unknown>),
				},
			);
		}
	return matches[0]!;
}

function materializeRelations(relations: UamRelation[]): Array<{ target: string; type: number; usePercent: boolean }> {
	return cloneRelations(relations);
}

function applyCommonDisplayProps(target: GImage | GTextField, props: UamDisplayNodePropsUpdate): void {
	if (props.position) target.setXY(props.position.x, props.position.y);
	if (props.size) target.setSize(props.size.width, props.size.height);
	if (props.visible !== undefined) target.setVisible(props.visible);
	if (props.touchable !== undefined) target.setTouchable(props.touchable);
	if (props.grayed !== undefined) target.setGrayed(props.grayed);
	if (props.alpha !== undefined) target.setAlpha(props.alpha);
	if (props.rotation !== undefined) target.setRotation(props.rotation);
	if (props.customData !== undefined) target.setCustomData(props.customData);
}

function createAttachableNode(doc: Document, packageId: string, node: UamAttachableDisplayNode): GImage | GTextField {
	if (node.kind === 'image') {
		const image = doc.createGImage(node.name)
			.setId(node.id)
			.setXY(node.position.x, node.position.y)
			.setSize(node.size.width, node.size.height)
			.setVisible(node.visible)
			.setTouchable(node.touchable)
			.setGrayed(node.grayed)
			.setAlpha(node.alpha)
			.setRotation(node.rotation)
			.setCustomData(node.customData)
			.setSrc(node.resource.resourceId)
			.setPackageId(node.resource.packageId ?? packageId);
		image.setRelations(materializeRelations(node.relations));
		return image;
	}

	const text = doc.createGTextField(node.name)
		.setId(node.id)
		.setXY(node.position.x, node.position.y)
		.setSize(node.size.width, node.size.height)
		.setVisible(node.visible)
		.setTouchable(node.touchable)
		.setGrayed(node.grayed)
		.setAlpha(node.alpha)
		.setRotation(node.rotation)
		.setCustomData(node.customData)
		.setText(node.text)
		.setFont(node.font)
		.setFontSize(node.fontSize)
		.setColor(node.color);
	text.setRelations(materializeRelations(node.relations));
	return text;
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

function hasControllerLookGear(node: GObject, controllerName: string): boolean {
	return node.listGears().some((gear) => (
		gear.getGearType() === GearType.Look && gear.getController()?.getName() === controllerName
	));
}

function applyOperation(doc: Document, operation: UamTransactionOperation): void {
	switch (operation.kind) {
		case 'renameResource': {
			const { resource } = resolveResource(doc, operation.selector);
			resource.setName(operation.newName);
			return;
		}
		case 'moveResource': {
			const { resource } = resolveResource(doc, operation.selector);
			resource.setPath(operation.toPath);
			return;
		}
		case 'setDisplayNodeProps': {
			const node = resolveDisplayNode(doc, operation.selector);
			if (node.propertyType !== 'GImage' && node.propertyType !== 'GTextField') {
				throw new Error(`setDisplayNodeProps only supports GImage/GTextField in Phase A, got "${node.propertyType}".`);
			}
			applyCommonDisplayProps(node as GImage | GTextField, operation.props);
			if (node.propertyType === 'GTextField') {
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
				if (gear.kind !== 'look') {
					throw new Error(`attachDisplayNode only supports look gears in Phase A, got "${gear.kind}".`);
				}
				if (hasControllerLookGear(child, gear.controllerName)) {
					throw new Error(`attachDisplayNode would create duplicate look gear for controller "${gear.controllerName}" on node "${operation.node.id}".`);
				}
				const controller = component.getController(gear.controllerName);
				if (!controller) {
					throw new Error(`attachDisplayNode references missing controller "${gear.controllerName}".`);
				}
				bindLookGear(doc, component, child, {
					name: gear.name,
					controller,
					states: gear.states.map((state) => ({
						pageId: state.pageId,
						value: state.value ?? null,
					})),
					defaultValue: gear.defaultValue,
					condition: gear.condition,
					positionsInPercent: gear.positionsInPercent,
					tween: gear.tween,
					tweenDuration: gear.tweenDuration,
					tweenDelay: gear.tweenDelay,
					easeType: gear.easeType,
					customEasePath: gear.customEasePath,
				});
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
		case 'addLookGear': {
			const component = resolveComponent(doc, operation.selector);
			const node = resolveDisplayNode(doc, operation.selector);
			if (node.propertyType !== 'GImage' && node.propertyType !== 'GTextField') {
				throw new Error(`addLookGear only supports image/text nodes in Phase A, got "${node.propertyType}".`);
			}
			if (hasControllerLookGear(node, operation.selector.controllerName)) {
					throw new UamTransactionError(
						`Look gear for controller "${operation.selector.controllerName}" already exists on node "${operation.selector.displayNodeId}".`,
						{
							code: 'selector_ambiguity',
							selector: selectorDetails(operation.selector as unknown as Record<string, unknown>),
						},
					);
				}
			const controller = resolveUniqueController(component, {
				packageId: operation.selector.packageId,
				componentResourceId: operation.selector.componentResourceId,
				controllerName: operation.selector.controllerName,
			});
			bindLookGear(doc, component, node, {
				name: operation.gear.name,
				controller,
				states: operation.gear.states.map((state) => ({
					pageId: state.pageId,
					value: state.value ?? null,
				})),
				defaultValue: operation.gear.defaultValue,
				condition: operation.gear.condition,
				positionsInPercent: operation.gear.positionsInPercent,
				tween: operation.gear.tween,
				tweenDuration: operation.gear.tweenDuration,
				tweenDelay: operation.gear.tweenDelay,
				easeType: operation.gear.easeType,
				customEasePath: operation.gear.customEasePath,
			});
			return;
		}
		case 'updateLookGear': {
			const component = resolveComponent(doc, operation.selector);
			const node = resolveDisplayNode(doc, operation.selector);
			if (node.propertyType !== 'GImage' && node.propertyType !== 'GTextField') {
				throw new Error(`updateLookGear only supports image/text nodes in Phase A, got "${node.propertyType}".`);
			}
			const existing = resolveUniqueLookGear(node, operation.selector);
			node.removeGear(existing);
			const controller = resolveUniqueController(component, {
				packageId: operation.selector.packageId,
				componentResourceId: operation.selector.componentResourceId,
				controllerName: operation.selector.controllerName,
			});
			bindLookGear(doc, component, node, {
				name: operation.gear.name,
				controller,
				states: operation.gear.states.map((state) => ({
					pageId: state.pageId,
					value: state.value ?? null,
				})),
				defaultValue: operation.gear.defaultValue,
				condition: operation.gear.condition,
				positionsInPercent: operation.gear.positionsInPercent,
				tween: operation.gear.tween,
				tweenDuration: operation.gear.tweenDuration,
				tweenDelay: operation.gear.tweenDelay,
				easeType: operation.gear.easeType,
				customEasePath: operation.gear.customEasePath,
			});
			return;
		}
		case 'removeLookGear': {
			const node = resolveDisplayNode(doc, operation.selector);
			const gear = resolveUniqueLookGear(node, operation.selector);
			node.removeGear(gear);
			return;
		}
	}
}

export function applyUamTransaction(
	project: UamProject,
	operations: UamTransactionOperation[],
): UamProject {
	const baseline = normalizeUamProject(project);
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

	assertTransactionSupported(baseline, operations);

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
