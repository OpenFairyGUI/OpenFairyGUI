import type {
	UamAssetResource,
	UamComponentModel,
	UamComponentResource,
	UamControllerModel,
	UamDisplayNode,
	UamGearBinding,
	UamGraphProperties,
	UamListItemData,
	UamListProperties,
	UamLoader3DProperties,
	UamLoaderProperties,
	UamPackage,
	UamProject,
	UamTreeProperties,
} from './model.js';
import { UAM_SUPPORTED_TRANSACTION_SCOPE } from './model.js';
import { normalizeUamProject } from './normalize.js';
import {
	isFiniteUamPoint,
	isValidUamComponentInstanceProperties,
	isValidUamComponentProperties,
	isValidUamImageResourceProperties,
	isValidUamTextProperties,
	validateUamProject,
} from './validate.js';
import {
	UamTransactionError,
	type UamComponentSelector,
	type UamDisplayNodePropsUpdate,
	type UamDisplayNodeSelector,
	type UamResourceSelector,
	type SetDisplayNodePropsOperation,
	type UamTransactionOperation,
	type UamTransactionSupportIssue,
	type UamTransactionSupportIssueCode,
} from './transaction-contracts.js';
import {
	findComponentSpec,
	findDisplayNodeSpec,
	findDisplayNodeSpecWithPath,
	findPackageSpec,
	GROUPABLE_DISPLAY_NODE_KINDS,
	findProjectedResource,
	isDisplayListRewriteOperation,
	isLifecycleOperation,
	isResourceLifecycleOperation,
	isUamNativeOperation,
	TEXT_DISPLAY_NODE_KINDS,
} from './transaction-shared.js';
import {
	applyUamNativeOperations,
	applyUamDisplayListRewriteOperation,
	applyUamLifecycleOperation,
	applyUamResourceLifecycleOperation,
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

const LOADER_3D_PROPERTY_KEYS = new Set<keyof UamLoader3DProperties>([
	'url',
	'fill',
	'shrinkOnly',
	'autoSize',
	'align',
	'vAlign',
	'animationName',
	'skinName',
	'playing',
	'frame',
	'loop',
	'color',
	'clearOnPublish',
]);

const GRAPH_PROPERTY_KEYS = [
	'locked',
	'minWidth',
	'maxWidth',
	'minHeight',
	'maxHeight',
	'skew',
	'graphType',
	'lineSize',
	'lineColor',
	'fillColor',
	'cornerRadius',
	'points',
	'sides',
	'startAngle',
	'distances',
] as const satisfies readonly (keyof UamGraphProperties)[];

const LOADER_PROPERTY_KEYS = [
	'scale',
	'url',
	'filter',
	'filterData',
	'fill',
	'shrinkOnly',
	'autoSize',
	'useResize',
	'align',
	'vAlign',
	'frame',
	'playing',
	'color',
	'fillMethod',
	'fillOrigin',
	'fillClockwise',
	'fillAmount',
	'clearOnPublish',
] as const satisfies readonly (keyof UamLoaderProperties)[];

const LIST_PROPERTY_KEYS = [
	'layout',
	'align',
	'vAlign',
	'lineGap',
	'columnGap',
	'lineCount',
	'columnCount',
	'selectionMode',
	'defaultItem',
	'autoResizeItem',
	'childrenRenderOrder',
	'apexIndex',
	'src',
	'overflow',
	'scrollType',
	'scrollBarFlags',
	'scrollBarMargin',
	'vtScrollBarRes',
	'hzScrollBarRes',
	'headerRes',
	'footerRes',
	'margin',
	'clipSoftness',
	'scrollItemToViewOnClick',
	'foldInvisibleItems',
	'listItems',
	'pageController',
	'controllerOverrides',
	'selectionController',
] as const satisfies readonly (keyof UamListProperties)[];

const TREE_PROPERTY_KEYS = [
	...LIST_PROPERTY_KEYS,
	'treeView',
	'indent',
	'clickToExpand',
] as const satisfies readonly (keyof UamTreeProperties)[];

function hasExactKeys(value: object, keys: readonly string[]): boolean {
	const actual = Object.keys(value);
	return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isIntegerBetween(value: unknown, minimum: number, maximum: number): value is number {
	return Number.isInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function isColor(value: unknown): value is string {
	return typeof value === 'string' && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value);
}

function isFiniteNumberArrayOrNull(value: unknown, length?: number): value is number[] | null {
	return value === null || (
		Array.isArray(value)
		&& (length === undefined || value.length === length)
		&& value.every(isFiniteNumber)
	);
}

function isFiniteEdgeInsets(value: unknown): boolean {
	if (!value || typeof value !== 'object') return false;
	const insets = value as { top?: unknown; bottom?: unknown; left?: unknown; right?: unknown };
	return [insets.top, insets.bottom, insets.left, insets.right].every(isFiniteNumber);
}

function isNullableString(value: unknown): value is string | null {
	return value === null || typeof value === 'string';
}

function isValidListItem(value: unknown): value is UamListItemData {
	if (!value || typeof value !== 'object') return false;
	const item = value as UamListItemData;
	const keys = Object.keys(item);
	if (keys.length < 8 || keys.length > 9 || keys.some((key) => ![
		'title',
		'icon',
		'url',
		'name',
		'selectedTitle',
		'selectedIcon',
		'level',
		'isFolder',
		'controllers',
	].includes(key))) return false;
	return [
		item.title,
		item.icon,
		item.url,
		item.name,
		item.selectedTitle,
		item.selectedIcon,
	].every(isNullableString)
		&& Number.isInteger(item.level)
		&& item.level >= 0
		&& (item.isFolder === null || typeof item.isFolder === 'boolean')
		&& (item.controllers === undefined || isNullableString(item.controllers));
}

function isValidGraphProperties(value: unknown): value is UamGraphProperties {
	if (!value || typeof value !== 'object' || !hasExactKeys(value, GRAPH_PROPERTY_KEYS)) return false;
	const properties = value as UamGraphProperties;
	return typeof properties.locked === 'boolean'
		&& [
			properties.minWidth,
			properties.maxWidth,
			properties.minHeight,
			properties.maxHeight,
			properties.lineSize,
			properties.startAngle,
		].every(isFiniteNumber)
		&& isFiniteUamPoint(properties.skew)
		&& isIntegerBetween(properties.graphType, 0, 4)
		&& isColor(properties.lineColor)
		&& isColor(properties.fillColor)
		&& isFiniteNumberArrayOrNull(properties.cornerRadius, 4)
		&& isFiniteNumberArrayOrNull(properties.points)
		&& Number.isInteger(properties.sides)
		&& properties.sides >= 0
		&& isFiniteNumberArrayOrNull(properties.distances)
		&& (properties.sides > 0 || (properties.startAngle === 0 && properties.distances === null));
}

function isValidLoaderProperties(value: unknown): value is UamLoaderProperties {
	if (!value || typeof value !== 'object' || !hasExactKeys(value, LOADER_PROPERTY_KEYS)) return false;
	const properties = value as UamLoaderProperties;
	return isFiniteUamPoint(properties.scale)
		&& [properties.url, properties.filter, properties.filterData].every((item) => typeof item === 'string')
		&& isIntegerBetween(properties.fill, 0, 5)
		&& [properties.shrinkOnly, properties.autoSize, properties.useResize, properties.playing,
			properties.fillClockwise, properties.clearOnPublish].every((item) => typeof item === 'boolean')
		&& isIntegerBetween(properties.align, 0, 2)
		&& isIntegerBetween(properties.vAlign, 0, 2)
		&& Number.isInteger(properties.frame)
		&& properties.frame >= 0
		&& isColor(properties.color)
		&& isIntegerBetween(properties.fillMethod, 0, 5)
		&& isIntegerBetween(properties.fillOrigin, 0, 3)
		&& isFiniteNumber(properties.fillAmount)
		&& (properties.fillMethod !== 0 || (
			properties.fillOrigin === 0
			&& properties.fillClockwise
			&& properties.fillAmount === 100
		));
}

function isValidListProperties(
	value: unknown,
	nodeKind: UamDisplayNode['kind'] | undefined,
): value is UamListProperties | UamTreeProperties {
	const keys = nodeKind === 'tree' ? TREE_PROPERTY_KEYS : LIST_PROPERTY_KEYS;
	if (!value || typeof value !== 'object' || !hasExactKeys(value, keys)) return false;
	const properties = value as UamTreeProperties;
	const validCounts = (
		(properties.layout === 0 || properties.layout === 1)
			? properties.lineCount === 0 && properties.columnCount === 0
			: properties.layout === 2
				? properties.lineCount === 0
				: properties.layout === 3
					? properties.columnCount === 0
					: true
	);
	const validListProperties = [
		properties.defaultItem,
		properties.src,
		properties.vtScrollBarRes,
		properties.hzScrollBarRes,
		properties.headerRes,
		properties.footerRes,
		properties.pageController,
		properties.controllerOverrides,
		properties.selectionController,
	].every((item) => typeof item === 'string')
		&& isIntegerBetween(properties.layout, 0, 4)
		&& isIntegerBetween(properties.align, 0, 2)
		&& isIntegerBetween(properties.vAlign, 0, 2)
		&& [properties.lineGap, properties.columnGap].every(isFiniteNumber)
		&& [properties.lineCount, properties.columnCount].every((item) => Number.isInteger(item) && item >= 0)
		&& validCounts
		&& isIntegerBetween(properties.selectionMode, 0, 3)
		&& [properties.autoResizeItem, properties.scrollItemToViewOnClick, properties.foldInvisibleItems]
			.every((item) => typeof item === 'boolean')
		&& isIntegerBetween(properties.childrenRenderOrder, 0, 2)
		&& Number.isInteger(properties.apexIndex)
		&& (properties.childrenRenderOrder === 2 || properties.apexIndex === 0)
		&& isIntegerBetween(properties.overflow, 0, 2)
		&& isIntegerBetween(properties.scrollType, 0, 2)
		&& Number.isInteger(properties.scrollBarFlags)
		&& properties.scrollBarFlags >= 0
		&& isFiniteEdgeInsets(properties.scrollBarMargin)
		&& isFiniteEdgeInsets(properties.margin)
		&& isFiniteUamPoint(properties.clipSoftness)
		&& Array.isArray(properties.listItems)
		&& properties.listItems.every(isValidListItem);
	if (!validListProperties || nodeKind !== 'tree') return validListProperties;
	return properties.treeView === true
		&& isFiniteNumber(properties.indent)
		&& properties.indent >= 0
		&& isIntegerBetween(properties.clickToExpand, 0, 1)
		&& properties.listItems.every((item) => typeof item.isFolder === 'boolean');
}

function isValidLoader3DProperties(value: unknown): value is UamLoader3DProperties {
	if (!value || typeof value !== 'object') return false;
	const properties = value as UamLoader3DProperties;
	const keys = Object.keys(properties);
	return keys.length === LOADER_3D_PROPERTY_KEYS.size
		&& keys.every((key) => LOADER_3D_PROPERTY_KEYS.has(key as keyof UamLoader3DProperties))
		&& [properties.url, properties.animationName, properties.skinName].every((candidate) => typeof candidate === 'string')
		&& Number.isInteger(properties.fill) && properties.fill >= 0 && properties.fill <= 5
		&& [properties.shrinkOnly, properties.autoSize, properties.playing, properties.loop, properties.clearOnPublish]
			.every((candidate) => typeof candidate === 'boolean')
		&& Number.isInteger(properties.align) && properties.align >= 0 && properties.align <= 2
		&& Number.isInteger(properties.vAlign) && properties.vAlign >= 0 && properties.vAlign <= 2
		&& Number.isInteger(properties.frame) && properties.frame >= 0
		&& isColor(properties.color);
}

function validateDisplayPropsPayload(
	op: SetDisplayNodePropsOperation,
	project: UamProject,
	path: string,
	issues: UamTransactionSupportIssue[],
): void {
	const node = findDisplayNodeSpec(project, op.selector);
	const nodeKind = node?.kind;
	const hasTextProperties = op.props.textProperties !== undefined;
	const hasTextOverrides = [...TEXT_DISPLAY_PROP_KEYS].some((key) => op.props[key] !== undefined);
	if (hasTextProperties && hasTextOverrides) {
		pushSupportIssue(
			issues,
			'invalid_display_node_payload',
			`${path}.props`,
			'textProperties cannot be combined with individual text property overrides.',
			{ operationKind: op.kind, nodeKind },
		);
	}
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
		if (key === 'group') {
			if (nodeKind && !GROUPABLE_DISPLAY_NODE_KINDS.has(nodeKind)) {
				pushSupportIssue(
					issues,
					'unsupported_display_node_field',
					`${path}.props.group`,
					'Group references are not supported on loader or loader3D display nodes.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			} else if (typeof op.props.group !== 'string') {
				pushSupportIssue(
					issues,
					'invalid_display_node_payload',
					`${path}.props.group`,
					'Display node group must be a string.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			}
			continue;
		}
		if (key === 'graphProperties') {
			if (nodeKind && nodeKind !== 'graph') {
				pushSupportIssue(
					issues,
					'unsupported_display_node_field',
					`${path}.props.graphProperties`,
					'Graph properties are only supported on graph display nodes.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			} else if (!isValidGraphProperties(op.props.graphProperties)) {
				pushSupportIssue(
					issues,
					'invalid_display_node_payload',
					`${path}.props.graphProperties`,
					'Graph properties must be a complete valid graph property snapshot.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			}
			continue;
		}
		if (key === 'loaderProperties') {
			if (nodeKind && nodeKind !== 'loader') {
				pushSupportIssue(
					issues,
					'unsupported_display_node_field',
					`${path}.props.loaderProperties`,
					'Loader properties are only supported on loader display nodes.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			} else if (!isValidLoaderProperties(op.props.loaderProperties)) {
				pushSupportIssue(
					issues,
					'invalid_display_node_payload',
					`${path}.props.loaderProperties`,
					'Loader properties must be a complete valid loader property snapshot.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			}
			continue;
		}
		if (key === 'listProperties') {
			if (nodeKind && nodeKind !== 'list' && nodeKind !== 'tree') {
				pushSupportIssue(
					issues,
					'unsupported_display_node_field',
					`${path}.props.listProperties`,
					'List properties are only supported on list or tree display nodes.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			} else if (!isValidListProperties(op.props.listProperties, nodeKind)) {
				pushSupportIssue(
					issues,
					'invalid_display_node_payload',
					`${path}.props.listProperties`,
					'List properties must be a complete snapshot matching the target list or tree node.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			}
			continue;
		}
		if (key === 'loader3DProperties') {
			if (nodeKind && nodeKind !== 'loader3D') {
				pushSupportIssue(
					issues,
					'unsupported_display_node_field',
					`${path}.props.loader3DProperties`,
					'Loader3D properties are only supported on loader3D display nodes.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			} else if (!isValidLoader3DProperties(op.props.loader3DProperties)) {
				pushSupportIssue(
					issues,
					'invalid_display_node_payload',
					`${path}.props.loader3DProperties`,
					'Loader3D properties must be a complete valid Loader3D property snapshot.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			}
			continue;
		}
		if (key === 'componentInstanceProperties') {
			if (nodeKind && nodeKind !== 'component') {
				pushSupportIssue(
					issues,
					'unsupported_display_node_field',
					`${path}.props.componentInstanceProperties`,
					'Component instance properties are only supported on component reference nodes.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			} else if (op.props.componentInstanceProperties !== null
				&& !isValidUamComponentInstanceProperties(op.props.componentInstanceProperties)
			) {
				pushSupportIssue(
					issues,
					'invalid_display_node_payload',
					`${path}.props.componentInstanceProperties`,
					'Component instance properties must be null or a complete valid extension snapshot.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			}
			continue;
		}
		if (key === 'textProperties') {
			if (nodeKind && !TEXT_DISPLAY_NODE_KINDS.has(nodeKind)) {
				pushSupportIssue(
					issues,
					'unsupported_text_field_target',
					`${path}.props.textProperties`,
					'Text properties are only supported on text, richText, or textInput display nodes.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			} else if (
				nodeKind
				&& TEXT_DISPLAY_NODE_KINDS.has(nodeKind)
				&& !isValidUamTextProperties(
					op.props.textProperties,
					nodeKind as 'text' | 'richText' | 'textInput',
				)
			) {
				pushSupportIssue(
					issues,
					'invalid_display_node_payload',
					`${path}.props.textProperties`,
					'Text properties must be a complete valid snapshot matching the target text node kind.',
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
	return resource.fileName ?? (resource.kind === 'image' ? '' : resource.file) ?? '';
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
		if (
			!isLifecycleOperation(operation)
			&& !isResourceLifecycleOperation(operation)
			&& !isDisplayListRewriteOperation(operation)
		) continue;
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
			case 'addResource': {
				const pkg = validateLifecyclePackageSelector(projected, operation.selector, `${operationPath}.selector`, issues, operation.kind);
				if (pkg) {
					validateAssetResourcePayload(
						projected,
						[operation],
						0,
						operation.selector,
						operation.resource,
						operationPath,
						issues,
						operation.kind,
					);
				}
				break;
			}
			case 'removeResource': {
				const resource = findProjectedResource(projected, [operation], 0, operation.selector);
				if (!resource || resource.kind === 'component') {
					pushSupportIssue(
						issues,
						'invalid_resource_selector',
						`${operationPath}.selector.resourceId`,
						`Binary resource "${operation.selector.resourceId}" was not found in package "${operation.selector.packageId}".`,
						{ operationKind: operation.kind },
					);
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
		} else if (isResourceLifecycleOperation(operation)) {
			applyUamResourceLifecycleOperation(projected, operation);
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
	const nonLifecycleIndex = operations.findIndex((operation) => (
		!isLifecycleOperation(operation)
		&& !isResourceLifecycleOperation(operation)
		&& !isDisplayListRewriteOperation(operation)
		&& operation.kind !== 'setDisplayNodeProps'
	));
	if (nonLifecycleIndex < 0) return true;
	const operation = operations[nonLifecycleIndex]!;
	pushSupportIssue(
		issues,
		'unsupported_operation_batch',
		`operations[${nonLifecycleIndex}].kind`,
		`Lifecycle operations may only be batched with resource lifecycle operations, display-list rewrites, or display-node property updates; "${operation.kind}" must be committed separately.`,
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
			case 'setResourceFavorite':
				validateTouchedResourceKind(project, operations, operationIndex, operation.selector, `${operationPath}.selector.resourceId`, issues, operation.kind);
				if (typeof operation.favorite !== 'boolean') {
					pushSupportIssue(
						issues,
						'invalid_resource_payload',
						`${operationPath}.favorite`,
						'setResourceFavorite.favorite must be boolean.',
						{ operationKind: operation.kind },
					);
				}
				break;
			case 'setImageResourceProps': {
				validateTouchedResourceKind(project, operations, operationIndex, operation.selector, `${operationPath}.selector.resourceId`, issues, operation.kind);
				const resource = findProjectedResource(project, operations, operationIndex, operation.selector);
				if (resource && resource.kind !== 'image') {
					pushSupportIssue(
						issues,
						'invalid_resource_selector',
						`${operationPath}.selector.resourceId`,
						'setImageResourceProps requires an image resource selector.',
						{ operationKind: operation.kind, resourceKind: resource.kind },
					);
				} else if (!isValidUamImageResourceProperties(operation.props)) {
					pushSupportIssue(
						issues,
						'invalid_resource_payload',
						`${operationPath}.props`,
						'setImageResourceProps.props must be a complete valid image property snapshot.',
						{ operationKind: operation.kind },
					);
				}
				break;
			}
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
			case 'setComponentProps': {
				validateLifecycleComponentSelector(project, operation.selector, `${operationPath}.selector`, issues, operation.kind);
				if (!operation.props || typeof operation.props !== 'object' || Array.isArray(operation.props)) {
					pushSupportIssue(
						issues,
						'invalid_component_payload',
						`${operationPath}.props`,
						'setComponentProps.props must be an object.',
						{ operationKind: operation.kind },
					);
					break;
				}
				const keys = Object.keys(operation.props);
				if (keys.length === 0 || keys.some((key) => key !== 'size' && key !== 'properties')) {
					pushSupportIssue(
						issues,
						'invalid_component_payload',
						`${operationPath}.props`,
						'setComponentProps.props must contain size, properties, or both.',
						{ operationKind: operation.kind },
					);
				}
				if (operation.props.size !== undefined) {
					const size = operation.props.size;
					if (!size
						|| typeof size !== 'object'
						|| Object.keys(size).length !== 2
						|| !Number.isFinite(size.width)
						|| size.width < 0
						|| !Number.isFinite(size.height)
						|| size.height < 0
					) {
						pushSupportIssue(
							issues,
							'invalid_component_payload',
							`${operationPath}.props.size`,
							'Component size must contain finite non-negative width and height values.',
							{ operationKind: operation.kind },
						);
					}
				}
				if (operation.props.properties !== undefined
					&& !isValidUamComponentProperties(operation.props.properties)
				) {
					pushSupportIssue(
						issues,
						'invalid_component_payload',
						`${operationPath}.props.properties`,
						'Component properties must be a complete valid property snapshot.',
						{ operationKind: operation.kind },
					);
				}
				break;
			}
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

interface ProjectedResourceReferenceIssue {
	key: string;
	path: string;
	message: string;
}

function findUiResource(project: UamProject, value: string) {
	if (!value.startsWith('ui://')) return null;
	const reference = value.slice(5);
	const slashIndex = reference.indexOf('/');
	if (slashIndex >= 0) {
		const packageKey = reference.slice(0, slashIndex);
		const resourceKey = reference.slice(slashIndex + 1);
		const pkg = project.packages.find((candidate) => candidate.id === packageKey || candidate.name === packageKey);
		return pkg?.resources.find((resource) => (
			resource.id === resourceKey
			|| resource.name === resourceKey
			|| resource.name.replace(/\.[^.]+$/, '') === resourceKey
		)) ?? null;
	}
	const pkg = [...project.packages]
		.sort((left, right) => right.id.length - left.id.length)
		.find((candidate) => reference.startsWith(candidate.id));
	return pkg?.resources.find((resource) => resource.id === reference.slice(pkg.id.length)) ?? null;
}

function collectUiReferences(value: unknown): string[] {
	if (Array.isArray(value)) return value.flatMap(collectUiReferences);
	if (typeof value === 'object' && value !== null) {
		return Object.values(value).flatMap(collectUiReferences);
	}
	if (typeof value !== 'string') return [];
	return [...value.matchAll(/ui:\/\/[^\s"'<>()[\]{}]+/g)].map((match) => match[0]);
}

function collectProjectedResourceReferenceIssues(project: UamProject): ProjectedResourceReferenceIssue[] {
	const issues: ProjectedResourceReferenceIssue[] = [];
	const findResource = (packageId: string, resourceId: string) => (
		project.packages.find((pkg) => pkg.id === packageId)?.resources.find((resource) => resource.id === resourceId)
	);
	const pushMissing = (
		key: string,
		path: string,
		packageId: string,
		resourceId: string,
		expectedKinds: readonly UamPackage['resources'][number]['kind'][],
	) => {
		const target = findResource(packageId, resourceId);
		if (target && expectedKinds.includes(target.kind)) return;
		issues.push({
			key,
			path,
			message: `Resource reference "${packageId}/${resourceId}" must target ${expectedKinds.join(' or ')}.`,
		});
	};
	const pushMissingUi = (
		key: string,
		path: string,
		value: string,
		expectedKinds: readonly UamPackage['resources'][number]['kind'][],
	) => {
		if (!value.startsWith('ui://')) return;
		const target = findUiResource(project, value);
		if (target && expectedKinds.includes(target.kind)) return;
		issues.push({
			key,
			path,
			message: `Resource reference "${value}" must target ${expectedKinds.join(' or ')}.`,
		});
	};
	const componentKinds = ['component'] as const;
	const visualKinds = ['image', 'movieClip', 'component', 'spine', 'dragonBones'] as const;
	const binaryKinds = ['image', 'sound', 'misc', 'font', 'movieClip', 'spine', 'dragonBones'] as const;
	const resourceKinds = UAM_SUPPORTED_TRANSACTION_SCOPE.resourceKinds;

	for (const pkg of project.packages) {
		for (const resource of pkg.resources) {
			if (resource.kind === 'font') {
				const textureId = `${resource.metadata?.textureId ?? ''}`;
				if (textureId) {
					pushMissing(
						`${pkg.id}/${resource.id}/metadata.textureId`,
						`packages.${pkg.id}.resources.${resource.id}.metadata.textureId`,
						pkg.id,
						textureId,
						['image'],
					);
				}
			}
			if (resource.kind === 'spine' || resource.kind === 'dragonBones') {
				const requireIds = Array.isArray(resource.metadata?.requireIds)
					? resource.metadata.requireIds.filter((value): value is string => typeof value === 'string')
					: [];
				for (const [requireIndex, requireId] of requireIds.entries()) {
					pushMissing(
						`${pkg.id}/${resource.id}/metadata.requireIds/${requireId}`,
						`packages.${pkg.id}.resources.${resource.id}.metadata.requireIds.${requireIndex}`,
						pkg.id,
						requireId,
						binaryKinds,
					);
				}
			}
			if (resource.kind !== 'component') continue;
			const componentPath = `packages.${pkg.id}.resources.${resource.id}.component`;
			const componentRefs = [
				['vtScrollBarRes', resource.component.properties.vtScrollBarRes],
				['hzScrollBarRes', resource.component.properties.hzScrollBarRes],
				['headerRes', resource.component.properties.headerRes],
				['footerRes', resource.component.properties.footerRes],
				['dropdown', resource.component.properties.dropdown],
			] as const;
			for (const [field, value] of componentRefs) {
				pushMissingUi(
					`${pkg.id}/${resource.id}/properties/${field}`,
					`${componentPath}.properties.${field}`,
					value,
					componentKinds,
				);
			}
			pushMissingUi(
				`${pkg.id}/${resource.id}/properties/sound`,
				`${componentPath}.properties.sound`,
				resource.component.properties.sound,
				['sound'],
			);
			for (const node of resource.component.displayList) {
				const nodeKey = `${pkg.id}/${resource.id}/${node.id}`;
				const nodePath = `packages.${pkg.id}.resources.${resource.id}.component.displayList.${node.id}`;
				if (node.kind === 'image' && node.resource.resourceId) {
					pushMissing(
						`${nodeKey}/resource`,
						`${nodePath}.resource`,
						node.resource.packageId || pkg.id,
						node.resource.resourceId,
						['image'],
					);
				} else if (node.kind === 'movieClip' && node.resource.resourceId) {
					pushMissing(
						`${nodeKey}/resource`,
						`${nodePath}.resource`,
						node.resource.packageId || pkg.id,
						node.resource.resourceId,
						['movieClip'],
					);
				} else if (node.kind === 'component' && node.resource.resourceId) {
					pushMissing(
						`${nodeKey}/resource`,
						`${nodePath}.resource`,
						node.resource.packageId || pkg.id,
						node.resource.resourceId,
						componentKinds,
					);
				} else if ('packageId' in node && 'src' in node && node.src) {
					pushMissing(
						`${nodeKey}/src`,
						`${nodePath}.src`,
						node.packageId || pkg.id,
						node.src,
						componentKinds,
					);
				}
				if (node.kind === 'text' || node.kind === 'richText' || node.kind === 'textInput') {
					pushMissingUi(`${nodeKey}/font`, `${nodePath}.font`, node.font, ['font']);
					for (const [referenceIndex, reference] of collectUiReferences(node.text).entries()) {
						pushMissingUi(`${nodeKey}/text/${reference}`, `${nodePath}.text.${referenceIndex}`, reference, resourceKinds);
					}
				}
				if (node.kind === 'loader' || node.kind === 'loader3D') {
					pushMissingUi(`${nodeKey}/url`, `${nodePath}.url`, node.url, visualKinds);
				}
				if (node.kind === 'list' || node.kind === 'tree') {
					const listRefs = [
						['defaultItem', node.defaultItem],
						['src', node.src],
						['vtScrollBarRes', node.vtScrollBarRes],
						['hzScrollBarRes', node.hzScrollBarRes],
						['headerRes', node.headerRes],
						['footerRes', node.footerRes],
					] as const;
					for (const [field, value] of listRefs) {
						pushMissingUi(`${nodeKey}/${field}`, `${nodePath}.${field}`, value, componentKinds);
					}
					for (const [itemIndex, item] of node.listItems.entries()) {
						pushMissingUi(`${nodeKey}/items/${itemIndex}/url`, `${nodePath}.listItems.${itemIndex}.url`, item.url ?? '', componentKinds);
						pushMissingUi(`${nodeKey}/items/${itemIndex}/icon`, `${nodePath}.listItems.${itemIndex}.icon`, item.icon ?? '', visualKinds);
						pushMissingUi(`${nodeKey}/items/${itemIndex}/selectedIcon`, `${nodePath}.listItems.${itemIndex}.selectedIcon`, item.selectedIcon ?? '', visualKinds);
					}
				}
				if (node.kind === 'component' && node.instanceProperties) {
					const instance = node.instanceProperties;
					if ('icon' in instance) {
						pushMissingUi(`${nodeKey}/instance/icon`, `${nodePath}.instanceProperties.icon`, instance.icon, visualKinds);
					}
					if (instance.extensionType === 'Button') {
						pushMissingUi(`${nodeKey}/instance/selectedIcon`, `${nodePath}.instanceProperties.selectedIcon`, instance.selectedIcon, visualKinds);
						pushMissingUi(`${nodeKey}/instance/sound`, `${nodePath}.instanceProperties.sound`, instance.sound, ['sound']);
					}
					if (instance.extensionType === 'ComboBox') {
						for (const [itemIndex, item] of instance.items.entries()) {
							pushMissingUi(`${nodeKey}/instance/items/${itemIndex}/icon`, `${nodePath}.instanceProperties.items.${itemIndex}.icon`, item.icon ?? '', visualKinds);
						}
					}
				}
				if ('icon' in node) {
					pushMissingUi(`${nodeKey}/icon`, `${nodePath}.icon`, node.icon, visualKinds);
				}
				if ('selectedIcon' in node) {
					pushMissingUi(`${nodeKey}/selectedIcon`, `${nodePath}.selectedIcon`, node.selectedIcon, visualKinds);
				}
				if ('icons' in node) {
					for (const [iconIndex, icon] of node.icons.entries()) {
						pushMissingUi(`${nodeKey}/icons/${iconIndex}`, `${nodePath}.icons.${iconIndex}`, icon, visualKinds);
					}
				}
				if ('sound' in node) {
					pushMissingUi(`${nodeKey}/sound`, `${nodePath}.sound`, node.sound, ['sound']);
				}
				for (const [gearIndex, gear] of node.gears.entries()) {
					for (const [referenceIndex, reference] of collectUiReferences(gear).entries()) {
						pushMissingUi(`${nodeKey}/gears/${gearIndex}/${reference}`, `${nodePath}.gears.${gearIndex}.${referenceIndex}`, reference, resourceKinds);
					}
				}
			}
			for (const [transitionIndex, transition] of resource.component.transitions.entries()) {
				for (const [itemIndex, item] of transition.items.entries()) {
					for (const [field, value] of [['startValue', item.startValue], ['endValue', item.endValue]] as const) {
						for (const [referenceIndex, reference] of collectUiReferences(value).entries()) {
							pushMissingUi(
								`${pkg.id}/${resource.id}/transitions/${transitionIndex}/${itemIndex}/${field}/${reference}`,
								`${componentPath}.transitions.${transitionIndex}.items.${itemIndex}.${field}.${referenceIndex}`,
								reference,
								resourceKinds,
							);
						}
					}
				}
			}
		}
	}
	return issues;
}

function collectTouchedGroupPaths(project: UamProject, operations: UamTransactionOperation[]): Set<string> {
	const paths = new Set<string>();
	for (const operation of operations) {
		if (operation.kind !== 'setDisplayNodeProps' || operation.props.group === undefined) continue;
		const found = findDisplayNodeSpecWithPath(project, operation.selector);
		if (found) paths.add(`${found.path}.group`);
	}
	return paths;
}

function validateProjectedState(
	project: UamProject,
	operations: UamTransactionOperation[],
	issues: UamTransactionSupportIssue[],
): void {
	if (issues.length > 0 || !operations.every(isUamNativeOperation)) return;
	let projected: UamProject;
	try {
		projected = applyUamNativeOperations(project, operations);
	} catch {
		return;
	}
	const baselineValidationIssues = new Set(validateUamProject(normalizeUamProject(project))
		.map((issue) => `${issue.path}\0${issue.message}`));
	const touchedGroupPaths = collectTouchedGroupPaths(projected, operations);
	for (const issue of validateUamProject(projected)) {
		if (
			baselineValidationIssues.has(`${issue.path}\0${issue.message}`)
			&& !touchedGroupPaths.has(issue.path)
		) continue;
		pushSupportIssue(
			issues,
			issue.path.endsWith('.group') ? 'invalid_group_reference' : 'invalid_resource_payload',
			issue.path,
			issue.message,
		);
	}
	if (
		operations.some(isLifecycleOperation)
		|| operations.some(isResourceLifecycleOperation)
		|| operations.some(isDisplayListRewriteOperation)
	) {
		const baselineReferenceKeys = new Set(collectProjectedResourceReferenceIssues(normalizeUamProject(project))
			.map((issue) => issue.key));
		for (const issue of collectProjectedResourceReferenceIssues(projected)) {
			if (baselineReferenceKeys.has(issue.key)) continue;
			pushSupportIssue(issues, 'invalid_resource_reference', issue.path, issue.message);
		}
	}
}

function validateProjectedGroupState(
	project: UamProject,
	operations: UamTransactionOperation[],
	issues: UamTransactionSupportIssue[],
): void {
	if (issues.length > 0 || operations.every(isUamNativeOperation)) return;
	const relevantOperations = operations.filter((operation) => (
		isLifecycleOperation(operation)
		|| isDisplayListRewriteOperation(operation)
		|| (operation.kind === 'setDisplayNodeProps' && operation.props.group !== undefined)
	));
	let projected: UamProject;
	try {
		projected = relevantOperations.length === 0
			? normalizeUamProject(project)
			: applyUamNativeOperations(project, relevantOperations);
	} catch {
		return;
	}
	for (const issue of validateUamProject(projected)) {
		if (!issue.path.endsWith('.group')) continue;
		pushSupportIssue(issues, 'invalid_group_reference', issue.path, issue.message);
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
	if (
		lifecycleOnly
		&& (
			operations.some(isLifecycleOperation)
			|| (operations.some(isResourceLifecycleOperation) && operations.some(isDisplayListRewriteOperation))
		)
	) {
		validateLifecycleOperationPayloads(project, operations, issues);
	}
	validateProjectedGroupState(project, operations, issues);
	validateProjectedState(project, operations, issues);
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
