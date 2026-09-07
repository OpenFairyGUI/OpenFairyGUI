import {
	type UamComponentResource,
	type UamDisplayNode,
	type UamPackage,
	type UamProject,
	UAM_SUPPORTED_TRANSACTION_SCOPE,
} from '../model.js';
import type {
	UamComponentSelector,
	UamDisplayNodeSelector,
	UamPackageSelector,
	UamResourceSelector,
	UamTransactionOperation,
	UamTransactionSupportIssue,
	UamTransactionSupportIssueCode,
} from '../transaction-contracts.js';
import {
	findComponentSpec,
	findDisplayNodeSpecWithPath,
	findPackageSpec,
	findProjectedResource,
} from '../transaction-shared.js';

export function pushSupportIssue(
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

export function validateSupportedDisplayNode(
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

	const gearKinds = new Set<string>();
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
		if (gearKinds.has(gear.kind)) {
			pushSupportIssue(
				issues,
				gear.kind === 'look' ? 'duplicate_look_gear_controller' : 'duplicate_gear_controller',
				`${path}.gears[${gearIndex}]`,
				`A display node may only have one ${gear.kind} gear, regardless of its controller.`,
				{ ...details, nodeKind: node.kind, gearKind: gear.kind },
			);
		}
		gearKinds.add(gear.kind);
	}
}

export function validateBaselineSupport(project: UamProject, issues: UamTransactionSupportIssue[]): void {
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

export function validateTouchedResourceKind(
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

export function validateTouchedDisplayNodeKind(
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

export function validateLifecyclePackageSelector(
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

export function validateLifecycleComponentSelector(
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
