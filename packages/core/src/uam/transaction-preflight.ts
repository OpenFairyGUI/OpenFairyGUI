import type { UamPackageSettings, UamProject } from './model.js';
import { isValidUamComponentProperties } from './validate.js';
import {
	UamTransactionError,
	type UamTransactionOperation,
	type UamTransactionSupportIssue,
} from './transaction-contracts.js';
import {
	pushSupportIssue,
	validateSupportedDisplayNode,
	validateBaselineSupport,
	validateTouchedDisplayNodeKind,
	validateLifecyclePackageSelector,
	validateLifecycleComponentSelector,
} from './preflight/support.js';
import { validateBehaviorOperation } from './preflight/behaviors.js';
import { validateDisplayPropsPayload } from './preflight/display.js';
import { stableJson } from './preflight/values.js';
import {
	validateProjectSettingsPayload,
	validatePackageSettingsPayload,
	canonicalPackageSettings,
	packageSettingsSnapshot,
	canonicalProjectSettings,
} from './preflight/settings.js';
import { validateResourceFolderSelector } from './preflight/resource-folders.js';
import { validateResourceOperation } from './preflight/resources.js';
import {
	validateLifecycleOperationPayloads,
	validateLifecycleBatchCompatibility,
	requiresSequentialDisplayProjection,
} from './preflight/lifecycle.js';
import { validateProjectedState, validateProjectedGroupState } from './preflight/projected-state.js';

function validateOperationPayloads(project: UamProject, operations: UamTransactionOperation[], issues: UamTransactionSupportIssue[]): void {
	const usesSequentialDisplayProjection = requiresSequentialDisplayProjection(operations);
	let projectedSettings = canonicalProjectSettings(project.settings);
	const projectedPackageSettings = new Map<string, UamPackageSettings>();
	for (const [operationIndex, operation] of operations.entries()) {
		const operationPath = `operations[${operationIndex}]`;
		switch (operation.kind) {
			case 'updateProjectSettings': {
				const issueCount = issues.length;
				validateProjectSettingsPayload(operation.settings, `${operationPath}.settings`, issues, operation.kind);
				if (issues.length === issueCount) {
					const nextSettings = canonicalProjectSettings(operation.settings);
					if (stableJson(nextSettings) === stableJson(projectedSettings)) {
						pushSupportIssue(
							issues,
							'project_settings_unchanged',
							`${operationPath}.settings`,
							'updateProjectSettings must change the complete settings snapshot.',
							{ operationKind: operation.kind },
						);
					} else {
						projectedSettings = nextSettings;
					}
				}
				break;
			}
			case 'updatePackageSettings': {
				const pkg = validateLifecyclePackageSelector(
					project,
					operation.selector,
					`${operationPath}.selector`,
					issues,
					operation.kind,
				);
				const valid = validatePackageSettingsPayload(
					operation.settings,
					`${operationPath}.settings`,
					issues,
					operation.kind,
				);
				if (pkg && valid) {
					const current = projectedPackageSettings.get(pkg.id) ?? packageSettingsSnapshot(pkg);
					const next = canonicalPackageSettings(operation.settings);
					if (stableJson(next) === stableJson(current)) {
						pushSupportIssue(
							issues,
							'package_settings_unchanged',
							`${operationPath}.settings`,
							'updatePackageSettings must change the complete settings snapshot.',
							{ operationKind: operation.kind },
						);
					} else {
						projectedPackageSettings.set(pkg.id, next);
					}
				}
				break;
			}
			case 'renameResource':
			case 'moveResource':
			case 'setResourceFavorite':
			case 'setResourceExported':
			case 'setImageResourceProps':
			case 'addResource':
			case 'replaceResourceBytes':
			case 'removeResource':
				validateResourceOperation(project, operations, operationIndex, operation, operationPath, issues);
				break;
			case 'setResourceFolderFavorite':
				if (!usesSequentialDisplayProjection) {
					validateResourceFolderSelector(project, operation.selector, `${operationPath}.selector`, issues, operation.kind);
				}
				if (typeof operation.favorite !== 'boolean') {
					pushSupportIssue(
						issues,
						'invalid_resource_payload',
						`${operationPath}.favorite`,
						'setResourceFolderFavorite.favorite must be boolean.',
						{ operationKind: 'setResourceFolderFavorite' },
					);
				}
				break;
			case 'setResourceFolderAtlas':
				break;
			case 'addResourceFolder':
			case 'renameResourceFolder':
			case 'moveResourceFolder':
			case 'removeResourceFolder':
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
				if (usesSequentialDisplayProjection) break;
				validateTouchedDisplayNodeKind(project, operation.selector, `${operationPath}.selector.displayNodeId`, issues, operation.kind);
				validateDisplayPropsPayload(operation, project, operationPath, issues);
				break;
			case 'attachDisplayNode':
				if (usesSequentialDisplayProjection) break;
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
				if (usesSequentialDisplayProjection) break;
				validateTouchedDisplayNodeKind(project, operation.selector, `${operationPath}.selector.displayNodeId`, issues, operation.kind);
				break;
			case 'addController':
			case 'updateController':
			case 'removeController':
			case 'addTransition':
			case 'updateTransition':
			case 'removeTransition':
			case 'addLookGear':
			case 'updateLookGear':
			case 'removeLookGear':
			case 'addGear':
			case 'updateGear':
			case 'removeGear':
				validateBehaviorOperation(project, operations, operationIndex, operation, operationPath, issues);
				break;
			case 'addBranch':
			case 'renameBranch':
			case 'removeBranch':
			case 'addPackage':
			case 'renamePackage':
			case 'removePackage':
			case 'addComponent':
			case 'removeComponent':
			case 'moveComponent':
				break;
			default: {
				const unknownOperation = operation as { kind?: unknown };
				pushSupportIssue(
					issues,
					'unsupported_operation',
					`${operationPath}.kind`,
					`Unsupported transaction operation "${String(unknownOperation.kind)}".`,
				);
				break;
			}
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
	if (
		lifecycleOnly
		&& requiresSequentialDisplayProjection(operations)
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
