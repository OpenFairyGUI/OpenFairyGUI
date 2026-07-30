import type {
	UamAssetResource,
	UamComponentModel,
	UamComponentResource,
	UamControllerModel,
	UamDisplayNode,
	UamGearBinding,
	UamLoader3DProperties,
	UamLookGearBinding,
	UamPackage,
	UamProject,
	UamValidationIssue,
} from './model.js';
import type { UAM_SUPPORTED_TRANSACTION_SCOPE } from './model.js';

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
	pivot?: NonNullable<UamDisplayNode['pivot']>;
	pivotAsAnchor?: boolean;
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
	loader3DProperties?: UamLoader3DProperties;
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

/** Adds a complete package snapshot at a stable package-list position. */
export interface AddPackageOperation extends UamTransactionOperationBase {
	kind: 'addPackage';
	package: UamPackage;
	atIndex: number;
}

export interface RenamePackageOperation extends UamTransactionOperationBase {
	kind: 'renamePackage';
	selector: UamPackageSelector;
	newName: string;
}

export interface RemovePackageOperation extends UamTransactionOperationBase {
	kind: 'removePackage';
	selector: UamPackageSelector;
}

/** Adds a complete component snapshot, including its initial display list. */
export interface AddComponentOperation extends UamTransactionOperationBase {
	kind: 'addComponent';
	selector: UamPackageSelector;
	component: UamComponentResource;
	atIndex: number;
}

export interface RemoveComponentOperation extends UamTransactionOperationBase {
	kind: 'removeComponent';
	selector: UamComponentSelector;
}

export interface MoveComponentOperation extends UamTransactionOperationBase {
	kind: 'moveComponent';
	selector: UamComponentSelector;
	toPackageId: string;
	toIndex: number;
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
	| AddPackageOperation
	| RenamePackageOperation
	| RemovePackageOperation
	| AddComponentOperation
	| RemoveComponentOperation
	| MoveComponentOperation
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
	| 'invalid_display_node_payload'
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
	| 'unavailable_resource_source_bytes'
	| 'invalid_package_selector'
	| 'invalid_package_payload'
	| 'duplicate_package_id'
	| 'duplicate_package_name'
	| 'invalid_package_index'
	| 'invalid_component_selector'
	| 'invalid_component_reference'
	| 'invalid_component_payload'
	| 'duplicate_component_id'
	| 'invalid_component_index'
	| 'invalid_component_move'
	| 'package_referenced'
	| 'component_referenced'
	| 'component_has_package_dependencies'
	| 'unsupported_operation_batch';

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
