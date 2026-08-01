import type {
	UamAssetResource,
	UamComponentModel,
	UamComponentResource,
	UamControllerModel,
	UamDisplayNode,
	UamGearBinding,
	UamGraphProperties,
	UamGroupProperties,
	UamListItemData,
	UamListProperties,
	UamLoader3DProperties,
	UamLoaderProperties,
	UamPackage,
	UamPackageSettings,
	UamProject,
	UamTreeProperties,
} from './model.js';
import { UAM_SUPPORTED_TRANSACTION_SCOPE } from './model.js';
import {
	browserRasterValidationRequired,
	probeRasterImage,
	rasterImageFormatFromFileName,
} from '../utils/image-info.js';
import { deriveMovieClipModelFromJta } from '../utils/jta-parser.js';
import {
	normalizeResourceFolderPath,
	resourceFolderName,
	resourceFolderParentPath,
} from '../utils/resource-folder.js';
import { normalizeUamProject } from './normalize.js';
import {
	isFiniteUamPoint,
	isValidUamComponentInstanceProperties,
	isValidUamComponentProperties,
	isValidUamImageResourceProperties,
	isValidUamMovieClipResourceProperties,
	isValidUamTextProperties,
	validateUamProject,
} from './validate.js';
import {
	UamTransactionError,
	type UamComponentSelector,
	type UamDisplayNodePropsUpdate,
	type UamDisplayNodeSelector,
	type UamResourceSelector,
	type UamResourceFolderSelector,
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
	findResourceSpec,
	GROUPABLE_DISPLAY_NODE_KINDS,
	findProjectedResource,
	isDisplayListRewriteOperation,
	isLifecycleOperation,
	isResourceLifecycleOperation,
	isResourceFolderLifecycleOperation,
	isUamNativeOperation,
	renamedResourceFileName,
	TEXT_DISPLAY_NODE_KINDS,
} from './transaction-shared.js';
import {
	applyDisplayNodePropsUpdate,
	applyUamNativeOperations,
	applyUamDisplayListRewriteOperation,
	applyUamLifecycleOperation,
	applyUamResourceLifecycleOperation,
	applyUamResourceFolderLifecycleOperation,
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
	'locked',
	'aspect',
	'minSize',
	'maxSize',
	'scale',
	'skew',
	'visible',
	'touchable',
	'grayed',
	'alpha',
	'rotation',
	'tooltips',
	'blendMode',
	'filter',
	'filterData',
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
	'url',
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

const GROUP_PROPERTY_KEYS = [
	'layout',
	'lineGap',
	'columnGap',
	'advanced',
	'excludeInvisibles',
	'autoSizeDisabled',
	'mainGridIndex',
] as const satisfies readonly (keyof UamGroupProperties)[];

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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function findInvalidJsonData(
	value: unknown,
	path: string,
	ancestors = new Set<object>(),
): { path: string; message: string } | null {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return null;
	if (typeof value === 'number') {
		return Number.isFinite(value) ? null : { path, message: 'Project settings numbers must be finite.' };
	}
	if (typeof value !== 'object') return { path, message: 'Project settings must contain only JSON-safe values.' };
	if (ancestors.has(value)) return { path, message: 'Project settings must not contain circular references.' };
	ancestors.add(value);
	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index += 1) {
			if (!(index in value)) return { path: `${path}[${index}]`, message: 'Project settings arrays must not contain holes.' };
			const invalid = findInvalidJsonData(value[index], `${path}[${index}]`, ancestors);
			if (invalid) return invalid;
		}
	} else {
		if (!isPlainRecord(value) || Reflect.ownKeys(value).some((key) => typeof key !== 'string')) {
			return { path, message: 'Project settings objects must be plain JSON objects.' };
		}
		for (const [key, child] of Object.entries(value)) {
			const invalid = findInvalidJsonData(child, `${path}.${key}`, ancestors);
			if (invalid) return invalid;
		}
	}
	ancestors.delete(value);
	return null;
}

function optionalFieldsMatch(
	record: Record<string, unknown>,
	fields: readonly string[],
	predicate: (value: unknown) => boolean,
): boolean {
	return fields.every((field) => record[field] === undefined || predicate(record[field]));
}

function validateProjectSettingsPayload(
	settings: unknown,
	path: string,
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
): void {
	const invalidJson = findInvalidJsonData(settings, path);
	if (invalidJson) {
		pushSupportIssue(issues, 'invalid_project_settings', invalidJson.path, invalidJson.message, { operationKind });
		return;
	}
	if (!isPlainRecord(settings)) {
		pushSupportIssue(issues, 'invalid_project_settings', path, 'Project settings must be a JSON object.', { operationKind });
		return;
	}

	const strings = (value: unknown) => typeof value === 'string';
	const booleans = (value: unknown) => typeof value === 'boolean';
	const stringArray = (value: unknown) => Array.isArray(value) && value.every(strings);
	const publish = settings.publish;
	if (publish !== undefined) {
		const valid = isPlainRecord(publish)
			&& optionalFieldsMatch(publish, ['fileExtension', 'path', 'branchPath'], strings)
			&& optionalFieldsMatch(publish, ['binaryFormat', 'compressDesc', 'seperatedAtlasForBranch'], booleans)
			&& optionalFieldsMatch(publish, ['includeHighResolution', 'branchProcessing', 'packageCount'], isFiniteNumber);
		if (!valid) {
			pushSupportIssue(issues, 'invalid_project_settings', `${path}.publish`, 'Publish settings contain an invalid typed field.', { operationKind });
		} else {
			for (const [key, numberFields, booleanFields, stringFields] of [
				['atlasSetting', ['maxSize', 'padding'], ['paging', 'forceSquare', 'fast', 'allowRotation', 'trimImage', 'extractAlpha'], ['sizeOption']],
				['codeGeneration', [], ['allowGenCode', 'getMemberByName', 'ignoreNoname'], ['classNamePrefix', 'codePath', 'codeType', 'memberNamePrefix', 'packageName']],
			] as const) {
				const nested = publish[key];
				if (nested === undefined) continue;
				if (!isPlainRecord(nested)
					|| !optionalFieldsMatch(nested, numberFields, isFiniteNumber)
					|| !optionalFieldsMatch(nested, booleanFields, booleans)
					|| !optionalFieldsMatch(nested, stringFields, strings)
				) {
					pushSupportIssue(issues, 'invalid_project_settings', `${path}.publish.${key}`, `Publish ${key} contains an invalid typed field.`, { operationKind });
				}
			}
		}
	}

	const common = settings.common;
	if (common !== undefined) {
		const valid = isPlainRecord(common)
			&& optionalFieldsMatch(common, ['font', 'textColor', 'buttonClickSound', 'pivot', 'tipsRes'], strings)
			&& optionalFieldsMatch(common, ['fontSize'], isFiniteNumber)
			&& optionalFieldsMatch(common, ['colorScheme', 'fontScheme', 'fontSizeScheme'], stringArray);
		if (!valid) {
			pushSupportIssue(issues, 'invalid_project_settings', `${path}.common`, 'Common settings contain an invalid typed field.', { operationKind });
		} else if (common.scrollBars !== undefined && (
			!isPlainRecord(common.scrollBars)
			|| !optionalFieldsMatch(common.scrollBars, ['defaultDisplay', 'horizontal', 'vertical'], strings)
		)) {
			pushSupportIssue(issues, 'invalid_project_settings', `${path}.common.scrollBars`, 'Common scrollBars contain an invalid typed field.', { operationKind });
		}
	}

	const adaptation = settings.adaptation;
	if (adaptation !== undefined && (
		!isPlainRecord(adaptation)
		|| !optionalFieldsMatch(adaptation, ['designResolutionX', 'designResolutionY'], isFiniteNumber)
		|| !optionalFieldsMatch(adaptation, ['scaleMode', 'screenMathMode'], strings)
		|| (adaptation.devices !== undefined && !Array.isArray(adaptation.devices))
	)) {
		pushSupportIssue(issues, 'invalid_project_settings', `${path}.adaptation`, 'Adaptation settings contain an invalid typed field.', { operationKind });
	}

	if (settings.customProperties !== undefined && !isPlainRecord(settings.customProperties)) {
		pushSupportIssue(issues, 'invalid_project_settings', `${path}.customProperties`, 'Custom properties settings must be a JSON object.', { operationKind });
	}
	const i18n = settings.i18n;
	if (i18n !== undefined && (
		!isPlainRecord(i18n)
		|| !Array.isArray(i18n.langFiles)
		|| !i18n.langFiles.every((entry) => (
			isPlainRecord(entry) && typeof entry.name === 'string' && typeof entry.path === 'string'
		))
	)) {
		pushSupportIssue(issues, 'invalid_project_settings', `${path}.i18n`, 'I18n settings require langFiles entries with string name and path.', { operationKind });
	}
}

const PACKAGE_SETTINGS_KEYS = ['compressPNG', 'jpegQuality', 'publish'] as const;
const PACKAGE_PUBLISH_KEYS = [
	'name',
	'path',
	'branchPath',
	'packageCount',
	'genCode',
	'codePath',
	'useGlobalAtlasSettings',
	'maxAtlasSize',
	'sizeOption',
	'forceSquare',
	'allowRotation',
	'paging',
	'extractAlpha',
	'maxAtlasIndex',
	'atlases',
	'excludedResourceIds',
] as const;
const PACKAGE_PUBLISH_ATLAS_KEYS = ['index', 'name', 'compression'] as const;

function pushInvalidPackageSettings(
	issues: UamTransactionSupportIssue[],
	path: string,
	message: string,
	operationKind: UamTransactionOperation['kind'],
): void {
	pushSupportIssue(issues, 'invalid_package_settings', path, message, { operationKind });
}

function isSafePackageOutputPath(value: string): boolean {
	if (!value) return true;
	if (/^[\\/]/.test(value) || /^[a-z]:/i.test(value)) return false;
	return value.replace(/\\/g, '/').split('/').every(isSafeBranchName);
}

function validatePackageSettingsPayload(
	settings: unknown,
	path: string,
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
): settings is UamPackageSettings {
	const issueCount = issues.length;
	const invalidJson = findInvalidJsonData(settings, path);
	if (invalidJson) {
		pushInvalidPackageSettings(
			issues,
			invalidJson.path,
			invalidJson.message.replaceAll('Project settings', 'Package settings'),
			operationKind,
		);
		return false;
	}
	if (!isPlainRecord(settings) || !hasExactKeys(settings, PACKAGE_SETTINGS_KEYS)) {
		pushInvalidPackageSettings(issues, path, 'Package settings must be one complete typed snapshot.', operationKind);
		return false;
	}
	if (settings.compressPNG !== null && typeof settings.compressPNG !== 'boolean') {
		pushInvalidPackageSettings(issues, `${path}.compressPNG`, 'compressPNG must be boolean or null.', operationKind);
	}
	if (settings.jpegQuality !== null && !isIntegerBetween(settings.jpegQuality, 1, 100)) {
		pushInvalidPackageSettings(issues, `${path}.jpegQuality`, 'jpegQuality must be null or an integer from 1 to 100.', operationKind);
	}
	if (settings.publish === null) {
		pushInvalidPackageSettings(issues, `${path}.publish`, 'publish must be one complete typed snapshot.', operationKind);
		return false;
	}
	const publish = settings.publish;
	if (!isPlainRecord(publish) || !hasExactKeys(publish, PACKAGE_PUBLISH_KEYS)) {
		pushInvalidPackageSettings(issues, `${path}.publish`, 'publish must be one complete typed snapshot.', operationKind);
		return false;
	}
	for (const key of ['name', 'path', 'branchPath', 'codePath'] as const) {
		if (typeof publish[key] !== 'string') {
			pushInvalidPackageSettings(issues, `${path}.publish.${key}`, `${key} must be a string.`, operationKind);
		}
	}
	if (typeof publish.name === 'string' && publish.name && !isSafeBranchName(publish.name)) {
		pushInvalidPackageSettings(issues, `${path}.publish.name`, 'Publish name must be empty or a safe output path segment.', operationKind);
	}
	for (const key of ['path', 'branchPath', 'codePath'] as const) {
		if (typeof publish[key] === 'string' && !isSafePackageOutputPath(publish[key])) {
			pushInvalidPackageSettings(issues, `${path}.publish.${key}`, `${key} must be an empty or safe relative path.`, operationKind);
		}
	}
	if (!isIntegerBetween(publish.packageCount, 0, 2_147_483_647)) {
		pushInvalidPackageSettings(issues, `${path}.publish.packageCount`, 'packageCount must be a non-negative integer.', operationKind);
	}
	for (const key of ['genCode', 'useGlobalAtlasSettings', 'forceSquare', 'allowRotation', 'paging', 'extractAlpha'] as const) {
		if (typeof publish[key] !== 'boolean') {
			pushInvalidPackageSettings(issues, `${path}.publish.${key}`, `${key} must be boolean.`, operationKind);
		}
	}
	if (!isIntegerBetween(publish.maxAtlasSize, 1, 16_384)) {
		pushInvalidPackageSettings(issues, `${path}.publish.maxAtlasSize`, 'maxAtlasSize must be an integer from 1 to 16384.', operationKind);
	}
	if (publish.sizeOption !== 'pot' && publish.sizeOption !== 'npot' && publish.sizeOption !== 'mof') {
		pushInvalidPackageSettings(issues, `${path}.publish.sizeOption`, 'sizeOption must be pot, npot, or mof.', operationKind);
	}
	if (!isIntegerBetween(publish.maxAtlasIndex, 0, 255)) {
		pushInvalidPackageSettings(issues, `${path}.publish.maxAtlasIndex`, 'maxAtlasIndex must be an integer from 0 to 255.', operationKind);
	}
	if (!Array.isArray(publish.atlases)) {
		pushInvalidPackageSettings(issues, `${path}.publish.atlases`, 'atlases must be an array.', operationKind);
	} else {
		const indices = new Set<number>();
		for (const [atlasIndex, atlas] of publish.atlases.entries()) {
			const atlasPath = `${path}.publish.atlases[${atlasIndex}]`;
			if (!isPlainRecord(atlas) || !hasExactKeys(atlas, PACKAGE_PUBLISH_ATLAS_KEYS)) {
				pushInvalidPackageSettings(issues, atlasPath, 'Atlas entries must be complete typed snapshots.', operationKind);
				continue;
			}
			if (!Number.isInteger(atlas.index) || atlas.index < 0 || atlas.index > publish.maxAtlasIndex) {
				pushInvalidPackageSettings(issues, `${atlasPath}.index`, 'Atlas index must be a non-negative integer no greater than maxAtlasIndex.', operationKind);
			} else if (indices.has(atlas.index)) {
				pushInvalidPackageSettings(issues, `${atlasPath}.index`, `Atlas index ${atlas.index} is duplicated.`, operationKind);
			}
			indices.add(atlas.index);
			if (typeof atlas.name !== 'string' || (atlas.name && !isSafeBranchName(atlas.name))) {
				pushInvalidPackageSettings(issues, `${atlasPath}.name`, 'Atlas name must be empty or a safe output path segment.', operationKind);
			}
			if (typeof atlas.compression !== 'boolean') {
				pushInvalidPackageSettings(issues, `${atlasPath}.compression`, 'Atlas compression must be boolean.', operationKind);
			} else if (!atlas.name && !atlas.compression) {
				pushInvalidPackageSettings(issues, atlasPath, 'An atlas entry must define a name or enable compression.', operationKind);
			}
		}
	}
	if (!Array.isArray(publish.excludedResourceIds)) {
		pushInvalidPackageSettings(issues, `${path}.publish.excludedResourceIds`, 'excludedResourceIds must be an array.', operationKind);
	} else {
		const ids = new Set<string>();
		for (const [resourceIndex, resourceId] of publish.excludedResourceIds.entries()) {
			const resourcePath = `${path}.publish.excludedResourceIds[${resourceIndex}]`;
			if (typeof resourceId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(resourceId)) {
				pushInvalidPackageSettings(issues, resourcePath, 'Excluded resource ids must be non-empty CSV-safe ids.', operationKind);
			} else if (ids.has(resourceId)) {
				pushInvalidPackageSettings(issues, resourcePath, `Excluded resource id "${resourceId}" is duplicated.`, operationKind);
			}
			ids.add(resourceId);
		}
	}
	return issues.length === issueCount;
}

function canonicalPackageSettings(settings: UamPackageSettings): UamPackageSettings {
	return structuredClone({
		...settings,
		publish: settings.publish ? {
			...settings.publish,
			atlases: [...settings.publish.atlases].sort((left, right) => left.index - right.index),
			excludedResourceIds: [...settings.publish.excludedResourceIds],
		} : null,
	});
}

function packageSettingsSnapshot(pkg: UamPackage): UamPackageSettings {
	return canonicalPackageSettings({
		compressPNG: pkg.compressPNG,
		jpegQuality: pkg.jpegQuality,
		publish: pkg.publish,
	});
}

function canonicalProjectSettings(settings: Record<string, unknown>): Record<string, unknown> {
	return structuredClone({
		...settings,
		publish: settings.publish ?? {},
		common: settings.common ?? {},
		adaptation: settings.adaptation ?? {},
	});
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
	if (isPlainRecord(value)) {
		return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
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

function isFiniteSize(value: unknown): value is { width: number; height: number } {
	if (!value || typeof value !== 'object') return false;
	const size = value as { width?: unknown; height?: unknown };
	return isFiniteNumber(size.width) && isFiniteNumber(size.height);
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
	return [properties.lineSize, properties.startAngle].every(isFiniteNumber)
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
	return typeof properties.url === 'string'
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

function isValidGroupProperties(value: unknown): value is UamGroupProperties {
	if (!value || typeof value !== 'object' || !hasExactKeys(value, GROUP_PROPERTY_KEYS)) return false;
	const properties = value as UamGroupProperties;
	if (!isIntegerBetween(properties.layout, 0, 2)
		|| ![properties.lineGap, properties.columnGap].every(isFiniteNumber)
		|| ![properties.advanced, properties.excludeInvisibles, properties.autoSizeDisabled]
			.every((item) => typeof item === 'boolean')
		|| !Number.isInteger(properties.mainGridIndex)
		|| properties.mainGridIndex < -1
	) return false;
	if (!properties.advanced) {
		return properties.layout === 0
			&& properties.lineGap === 0
			&& properties.columnGap === 0
			&& !properties.excludeInvisibles
			&& !properties.autoSizeDisabled
			&& properties.mainGridIndex === -1;
	}
	if (properties.layout === 0) {
		return properties.lineGap === 0
			&& properties.columnGap === 0
			&& !properties.excludeInvisibles
			&& !properties.autoSizeDisabled
			&& properties.mainGridIndex === -1;
	}
	return true;
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
	const commonValueIssue = (field: keyof UamDisplayNodePropsUpdate, message: string) => pushSupportIssue(
		issues,
		'invalid_display_node_payload',
		`${path}.props.${String(field)}`,
		message,
		{ operationKind: op.kind, nodeKind, field: String(field) },
	);
	if (op.props.position !== undefined && !isFiniteUamPoint(op.props.position)) {
		commonValueIssue('position', 'Display node position must contain finite x and y numbers.');
	}
	if (op.props.size !== undefined && (!isFiniteSize(op.props.size) || op.props.size.width < 0 || op.props.size.height < 0)) {
		commonValueIssue('size', 'Display node size must contain finite non-negative width and height values.');
	}
	for (const field of ['locked', 'aspect', 'visible', 'touchable', 'grayed'] as const) {
		if (op.props[field] !== undefined && typeof op.props[field] !== 'boolean') {
			commonValueIssue(field, `Display node ${field} must be boolean.`);
		}
	}
	for (const field of ['scale', 'skew'] as const) {
		if (op.props[field] !== undefined && !isFiniteUamPoint(op.props[field])) {
			commonValueIssue(field, `Display node ${field} must contain finite x and y numbers.`);
		}
	}
	const minSize = op.props.minSize ?? node?.minSize;
	const maxSize = op.props.maxSize ?? node?.maxSize;
	for (const [field, value] of [['minSize', op.props.minSize], ['maxSize', op.props.maxSize]] as const) {
		if (value !== undefined && (!isFiniteSize(value) || value.width < 0 || value.height < 0)) {
			commonValueIssue(field, `Display node ${field} must contain finite non-negative width and height values.`);
		}
	}
	if (isFiniteSize(minSize) && isFiniteSize(maxSize)) {
		if (maxSize.width > 0 && maxSize.width < minSize.width) {
			commonValueIssue('maxSize', 'Display node maxSize.width must be zero or at least minSize.width.');
		}
		if (maxSize.height > 0 && maxSize.height < minSize.height) {
			commonValueIssue('maxSize', 'Display node maxSize.height must be zero or at least minSize.height.');
		}
	}
	if (op.props.alpha !== undefined && (!isFiniteNumber(op.props.alpha) || op.props.alpha < 0 || op.props.alpha > 1)) {
		commonValueIssue('alpha', 'Display node alpha must be a finite number between 0 and 1.');
	}
	if (op.props.rotation !== undefined && !isFiniteNumber(op.props.rotation)) {
		commonValueIssue('rotation', 'Display node rotation must be finite.');
	}
	for (const field of ['tooltips', 'filter', 'filterData', 'customData'] as const) {
		if (op.props[field] !== undefined && typeof op.props[field] !== 'string') {
			commonValueIssue(field, `Display node ${field} must be a string.`);
		}
	}
	if (op.props.blendMode !== undefined
		&& !['normal', 'none', 'add', 'multiply', 'screen', 'erase'].includes(op.props.blendMode)
	) {
		commonValueIssue('blendMode', `Unsupported display node blendMode "${op.props.blendMode}".`);
	}
	const filter = op.props.filter ?? node?.filter ?? '';
	const filterData = op.props.filterData ?? node?.filterData ?? '';
	if (filter !== '' && filter !== 'color') {
		commonValueIssue('filter', `Unsupported display node filter "${filter}".`);
	} else if (filter === 'color') {
		const values = filterData.split(',').map((part) => Number(part.trim()));
		if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
			commonValueIssue('filterData', 'Color filterData must contain four finite comma-separated numbers.');
		}
	} else if (filterData !== '') {
		commonValueIssue('filterData', 'filterData must be empty when filter is empty.');
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
		if (key === 'groupProperties') {
			if (nodeKind && nodeKind !== 'group') {
				pushSupportIssue(
					issues,
					'unsupported_display_node_field',
					`${path}.props.groupProperties`,
					'Group properties are only supported on group display nodes.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			} else if (!isValidGroupProperties(op.props.groupProperties)) {
				pushSupportIssue(
					issues,
					'invalid_display_node_payload',
					`${path}.props.groupProperties`,
					'Group properties must be a complete valid group property snapshot.',
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

function isSafeBranchName(value: string): boolean {
	return isSafePackageName(value)
		&& value.trim() === value
		&& !/[. ]$/.test(value)
		&& !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(value);
}

function isSafeResourcePath(value: string): boolean {
	if (!value) return false;
	const segments = value.replace(/\\/g, '/').split('/').filter(Boolean);
	return !segments.some((segment) => segment === '.' || segment === '..');
}

function isSafeResourceFolderPath(value: string, allowRoot = false): boolean {
	if (!value || value !== normalizeResourceFolderPath(value)) return false;
	if (value === '/') return allowRoot;
	return value.split('/').filter(Boolean).every(isSafePackageName);
}

function folderBranch(selector: UamResourceFolderSelector): string {
	return selector.branch ?? '';
}

function findResourceFolder(project: UamProject, selector: UamResourceFolderSelector) {
	const pkg = findPackageSpec(project, selector.packageId);
	const branch = folderBranch(selector);
	const folder = pkg?.folders.find((candidate) => candidate.branch === branch && candidate.path === selector.path);
	return pkg && folder ? { pkg, folder } : null;
}

function folderContainsItems(pkg: UamPackage, branch: string, path: string): boolean {
	return pkg.folders.some((folder) => (
		folder.branch === branch && folder.path !== path && folder.path.startsWith(path)
	)) || pkg.resources.some((resource) => (
		resource.branch === branch && normalizeResourceFolderPath(resource.path).startsWith(path)
	));
}

function folderPathConflictsWithResource(pkg: UamPackage, branch: string, path: string): boolean {
	const folderTarget = path.replace(/^\/+|\/+$/g, '');
	return pkg.resources.some((resource) => {
		if (resource.branch !== branch) return false;
		const fileName = resource.kind === 'component' ? `${resource.name}.xml` : primaryResourceFileName(resource);
		return normalizeResourceFolderPath(`${resource.path}/${fileName}`).slice(1, -1) === folderTarget;
	});
}

function folderParentExists(pkg: UamPackage, branch: string, path: string): boolean {
	const parentPath = resourceFolderParentPath(path);
	return parentPath === '/' || pkg.folders.some((folder) => folder.branch === branch && folder.path === parentPath);
}

function validateResourceFolderSelector(
	project: UamProject,
	selector: UamResourceFolderSelector,
	path: string,
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
) {
	if (!isSafeResourceFolderPath(selector.path)) {
		pushSupportIssue(
			issues,
			'invalid_resource_folder_selector',
			`${path}.path`,
			'Resource folder selector path must be canonical, non-root, and traversal-free.',
			{ operationKind },
		);
		return null;
	}
	const found = findResourceFolder(project, selector);
	if (!found) {
		pushSupportIssue(
			issues,
			'invalid_resource_folder_selector',
			path,
			`Resource folder "${folderBranch(selector)}:${selector.path}" was not found in package "${selector.packageId}".`,
			{ operationKind },
		);
	}
	return found;
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
	} else if (resource.kind === 'movieClip') {
		try {
			deriveMovieClipModelFromJta(resource.sourceBytes);
		} catch (error) {
			pushSupportIssue(
				issues,
				'invalid_movie_clip_jta',
				`${path}.resource.sourceBytes`,
				error instanceof Error ? error.message : 'MovieClip source bytes are not a valid JTA file.',
				{ operationKind, resourceKind: resource.kind },
			);
		}
	}
	if (resource.kind === 'movieClip' && !isValidUamMovieClipResourceProperties(resource.movieClip)) {
		pushSupportIssue(
			issues,
			'invalid_resource_payload',
			`${path}.resource.movieClip`,
			'Added MovieClip resource must define a complete valid typed MovieClip snapshot.',
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
	validatePackageSettingsPayload({
		compressPNG: pkg.compressPNG,
		jpegQuality: pkg.jpegQuality,
		publish: pkg.publish,
	}, path, issues, operationKind);

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
		if (resource.kind === 'movieClip' && resource.sourceBytes instanceof Uint8Array) {
			try {
				deriveMovieClipModelFromJta(resource.sourceBytes);
			} catch (error) {
				pushSupportIssue(
					issues,
					'invalid_movie_clip_jta',
					`${resourcePath}.sourceBytes`,
					`MovieClip source bytes must contain a valid JTA payload: ${error instanceof Error ? error.message : String(error)}`,
					{ operationKind, resourceKind: resource.kind },
				);
			}
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
	code: 'invalid_package_index' | 'invalid_component_index' | 'invalid_resource_index',
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

function findComponentPackageDependency(
	component: UamComponentResource,
	ownerPackageId: string,
	dependencyPackageId: string,
	path: string,
): string | null {
	for (const [nodeIndex, node] of component.component.displayList.entries()) {
		if (nodeReferencesPackage(node, ownerPackageId, dependencyPackageId)) {
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
				const dependencyPath = findComponentPackageDependency(
					check.component,
					finalPackage.id,
					check.sourcePackageId,
					check.path,
				);
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
			&& !isResourceFolderLifecycleOperation(operation)
			&& !isDisplayListRewriteOperation(operation)
			&& operation.kind !== 'setDisplayNodeProps'
			&& operation.kind !== 'setResourceFolderFavorite'
		) continue;
		const operationPath = `operations[${operationIndex}]`;
		const issueCount = issues.length;
		switch (operation.kind) {
			case 'addBranch':
				if (!isSafeBranchName(operation.branch)) {
					pushSupportIssue(issues, 'invalid_branch_name', `${operationPath}.branch`, 'Branch must be a safe non-reserved output path segment.', { operationKind: operation.kind });
				}
				if (projected.branches.includes(operation.branch)) {
					pushSupportIssue(issues, 'duplicate_branch_name', `${operationPath}.branch`, `Branch "${operation.branch}" already exists.`, { operationKind: operation.kind });
				}
				break;
			case 'renameBranch': {
				const branchName = operation.selector.branch;
				if (!projected.branches.includes(branchName)) {
					pushSupportIssue(issues, 'invalid_branch_selector', `${operationPath}.selector.branch`, `Branch "${branchName}" was not found.`, { operationKind: operation.kind });
				}
				if (!isSafeBranchName(operation.newName)) {
					pushSupportIssue(issues, 'invalid_branch_name', `${operationPath}.newName`, 'Branch must be a safe non-reserved output path segment.', { operationKind: operation.kind });
				}
				if (projected.branches.includes(operation.newName)) {
					pushSupportIssue(issues, 'duplicate_branch_name', `${operationPath}.newName`, `Branch "${operation.newName}" already exists.`, { operationKind: operation.kind });
				}
				break;
			}
			case 'removeBranch': {
				const branchName = operation.selector.branch;
				if (!projected.branches.includes(branchName)) {
					pushSupportIssue(issues, 'invalid_branch_selector', `${operationPath}.selector.branch`, `Branch "${branchName}" was not found.`, { operationKind: operation.kind });
					break;
				}
				if (projected.packages.some((pkg) => (
					pkg.folders.some((folder) => folder.branch === branchName)
					|| pkg.resources.some((resource) => resource.branch === branchName)
				))) {
					pushSupportIssue(issues, 'branch_not_empty', `${operationPath}.selector.branch`, `Branch "${branchName}" still contains resources or folders.`, { operationKind: operation.kind });
				}
				if (projected.packages.some((pkg) => {
					const slotIndex = pkg.branchNames.indexOf(branchName);
					return slotIndex >= 0 && pkg.resources.some((resource) => !!resource.branchItemIds[slotIndex]);
				})) {
					pushSupportIssue(issues, 'branch_referenced', `${operationPath}.selector.branch`, `Branch "${branchName}" still has mapped variant ids.`, { operationKind: operation.kind });
				}
				break;
			}
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
					validateLifecycleInsertionIndex(
						operation.atIndex === undefined ? pkg.resources.length : operation.atIndex,
						pkg.resources.length,
						`${operationPath}.atIndex`,
						'invalid_resource_index',
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
			case 'addResourceFolder': {
				const pkg = validateLifecyclePackageSelector(projected, operation.selector, `${operationPath}.selector`, issues, operation.kind);
				const branch = operation.branch ?? '';
				if (!isSafeResourceFolderPath(operation.path)) {
					pushSupportIssue(issues, 'invalid_resource_folder_path', `${operationPath}.path`, 'Resource folder path must be canonical, non-root, and traversal-free.', { operationKind: operation.kind });
				}
				if (branch && (!isSafePackageName(branch) || !projected.branches.includes(branch))) {
					pushSupportIssue(issues, 'invalid_resource_folder_path', `${operationPath}.branch`, `Resource folder branch "${branch}" is not defined by the project.`, { operationKind: operation.kind });
				}
				if (operation.favorite !== undefined && typeof operation.favorite !== 'boolean') {
					pushSupportIssue(issues, 'invalid_resource_payload', `${operationPath}.favorite`, 'addResourceFolder.favorite must be boolean.', { operationKind: operation.kind });
				}
				if (operation.atlas !== undefined && typeof operation.atlas !== 'string') {
					pushSupportIssue(issues, 'invalid_resource_payload', `${operationPath}.atlas`, 'addResourceFolder.atlas must be a string.', { operationKind: operation.kind });
				}
				if (pkg && isSafeResourceFolderPath(operation.path)) {
					if (!folderParentExists(pkg, branch, operation.path)) {
						pushSupportIssue(issues, 'invalid_resource_folder_path', `${operationPath}.path`, `Parent folder "${resourceFolderParentPath(operation.path)}" does not exist.`, { operationKind: operation.kind });
					}
					if (pkg.folders.some((folder) => folder.branch === branch && folder.path === operation.path)
						|| folderPathConflictsWithResource(pkg, branch, operation.path)
					) {
						pushSupportIssue(issues, 'resource_folder_conflict', `${operationPath}.path`, `Resource folder path "${operation.path}" already exists or conflicts with a resource.`, { operationKind: operation.kind });
					}
				}
				break;
			}
			case 'renameResourceFolder': {
				const found = validateResourceFolderSelector(projected, operation.selector, `${operationPath}.selector`, issues, operation.kind);
				if (!isSafePackageName(operation.newName)) {
					pushSupportIssue(issues, 'invalid_resource_folder_path', `${operationPath}.newName`, 'renameResourceFolder.newName must be a safe folder name.', { operationKind: operation.kind });
				}
				if (found) {
					const branch = folderBranch(operation.selector);
					if (folderContainsItems(found.pkg, branch, found.folder.path)) {
						pushSupportIssue(issues, 'resource_folder_not_empty', `${operationPath}.selector`, 'renameResourceFolder only supports empty folders.', { operationKind: operation.kind });
					}
					if (isSafePackageName(operation.newName)) {
						const destination = normalizeResourceFolderPath(`${resourceFolderParentPath(found.folder.path)}/${operation.newName}`);
						if (destination === found.folder.path
							|| found.pkg.folders.some((folder) => folder.branch === branch && folder.path === destination)
							|| folderPathConflictsWithResource(found.pkg, branch, destination)
						) {
							pushSupportIssue(issues, 'resource_folder_conflict', `${operationPath}.newName`, `Resource folder path "${destination}" already exists or conflicts with a resource.`, { operationKind: operation.kind });
						}
					}
				}
				break;
			}
			case 'moveResourceFolder': {
				const found = validateResourceFolderSelector(projected, operation.selector, `${operationPath}.selector`, issues, operation.kind);
				const branch = folderBranch(operation.selector);
				if (!isSafeResourceFolderPath(operation.toPath, true)) {
					pushSupportIssue(issues, 'invalid_resource_folder_path', `${operationPath}.toPath`, 'moveResourceFolder.toPath must be a canonical folder path or root.', { operationKind: operation.kind });
				}
				if (found && isSafeResourceFolderPath(operation.toPath, true)) {
					if (operation.toPath !== '/' && !found.pkg.folders.some((folder) => folder.branch === branch && folder.path === operation.toPath)) {
						pushSupportIssue(issues, 'invalid_resource_folder_path', `${operationPath}.toPath`, `Destination parent folder "${operation.toPath}" does not exist.`, { operationKind: operation.kind });
					}
					if (operation.toPath.startsWith(found.folder.path)) {
						pushSupportIssue(issues, 'invalid_resource_folder_path', `${operationPath}.toPath`, 'A resource folder cannot be moved into itself.', { operationKind: operation.kind });
					}
					if (folderContainsItems(found.pkg, branch, found.folder.path)) {
						pushSupportIssue(issues, 'resource_folder_not_empty', `${operationPath}.selector`, 'moveResourceFolder only supports empty folders.', { operationKind: operation.kind });
					}
					const destination = normalizeResourceFolderPath(`${operation.toPath}/${resourceFolderName(found.folder.path)}`);
					if (destination === found.folder.path
						|| found.pkg.folders.some((folder) => folder.branch === branch && folder.path === destination)
						|| folderPathConflictsWithResource(found.pkg, branch, destination)
					) {
						pushSupportIssue(issues, 'resource_folder_conflict', `${operationPath}.toPath`, `Resource folder path "${destination}" already exists or conflicts with a resource.`, { operationKind: operation.kind });
					}
				}
				break;
			}
			case 'removeResourceFolder': {
				const found = validateResourceFolderSelector(projected, operation.selector, `${operationPath}.selector`, issues, operation.kind);
				if (found && folderContainsItems(found.pkg, folderBranch(operation.selector), found.folder.path)) {
					pushSupportIssue(issues, 'resource_folder_not_empty', `${operationPath}.selector`, 'removeResourceFolder only supports empty folders.', { operationKind: operation.kind });
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
			case 'setDisplayNodeProps':
				validateTouchedDisplayNodeKind(projected, operation.selector, `${operationPath}.selector.displayNodeId`, issues, operation.kind);
				validateDisplayPropsPayload(operation, projected, operationPath, issues);
				break;
			case 'setResourceFolderFavorite':
				validateResourceFolderSelector(projected, operation.selector, `${operationPath}.selector`, issues, operation.kind);
				break;
		}
		if (issues.length !== issueCount) continue;
		if (isLifecycleOperation(operation)) {
			applyUamLifecycleOperation(projected, operation);
		} else if (isResourceLifecycleOperation(operation)) {
			applyUamResourceLifecycleOperation(projected, operation);
		} else if (isResourceFolderLifecycleOperation(operation)) {
			applyUamResourceFolderLifecycleOperation(projected, operation);
		} else if (operation.kind === 'setDisplayNodeProps') {
			applyDisplayNodePropsUpdate(findDisplayNodeSpec(projected, operation.selector)!, operation.props);
		} else if (operation.kind === 'setResourceFolderFavorite') {
			findResourceFolder(projected, operation.selector)!.folder.favorite = operation.favorite;
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
		&& !isResourceFolderLifecycleOperation(operation)
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

function requiresSequentialDisplayProjection(operations: UamTransactionOperation[]): boolean {
	const hasDisplayListRewrite = operations.some(isDisplayListRewriteOperation);
	return operations.some(isLifecycleOperation)
		|| operations.some(isResourceLifecycleOperation)
		|| operations.some(isResourceFolderLifecycleOperation)
		|| (
			hasDisplayListRewrite
			&& (
				operations.some(isResourceLifecycleOperation)
				|| operations.some((operation) => operation.kind === 'setDisplayNodeProps')
			)
		);
}

function projectedAssetFileName(
	project: UamProject,
	operations: UamTransactionOperation[],
	operationIndex: number,
	selector: UamResourceSelector,
): string {
	const resource = findResourceSpec(project, selector);
	let fileName = resource && resource.kind !== 'component'
		? resource.fileName ?? ('file' in resource ? resource.file : undefined) ?? ''
		: '';
	for (let index = 0; index < operationIndex; index += 1) {
		const operation = operations[index]!;
		if (operation.kind === 'addResource') {
			if (operation.selector.packageId === selector.packageId && operation.resource.id === selector.resourceId) {
				fileName = operation.resource.fileName
					?? ('file' in operation.resource ? operation.resource.file : undefined)
					?? '';
			}
			continue;
		}
		if (!('selector' in operation)
			|| operation.selector.packageId !== selector.packageId
			|| !('resourceId' in operation.selector)
			|| operation.selector.resourceId !== selector.resourceId
		) continue;
		if (operation.kind === 'removeResource') fileName = '';
		if (operation.kind === 'renameResource' && fileName) {
			fileName = renamedResourceFileName(fileName, operation.newName);
		}
	}
	return fileName;
}

function imageReplacementSurvives(
	operations: UamTransactionOperation[],
	operationIndex: number,
	selector: UamResourceSelector,
): boolean {
	for (let index = operationIndex + 1; index < operations.length; index += 1) {
		const operation = operations[index]!;
		if (operation.kind === 'addResource') {
			if (operation.selector.packageId === selector.packageId && operation.resource.id === selector.resourceId) return false;
			continue;
		}
		if (!('selector' in operation)
			|| operation.selector.packageId !== selector.packageId
			|| !('resourceId' in operation.selector)
			|| operation.selector.resourceId !== selector.resourceId
		) continue;
		if (operation.kind === 'replaceResourceBytes' || operation.kind === 'removeResource') return false;
	}
	return true;
}

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
						{ operationKind: operation.kind },
					);
				}
				break;
			case 'setResourceExported':
				validateTouchedResourceKind(project, operations, operationIndex, operation.selector, `${operationPath}.selector.resourceId`, issues, operation.kind);
				if (typeof operation.exported !== 'boolean') {
					pushSupportIssue(
						issues,
						'invalid_resource_payload',
						`${operationPath}.exported`,
						'setResourceExported.exported must be boolean.',
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
			case 'replaceResourceBytes': {
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
					break;
				}
				const resource = findProjectedResource(project, operations, operationIndex, operation.selector);
				if (resource?.kind === 'movieClip') {
					try {
						deriveMovieClipModelFromJta(operation.sourceBytes);
					} catch (error) {
						pushSupportIssue(
							issues,
							'invalid_movie_clip_jta',
							`${operationPath}.sourceBytes`,
							error instanceof Error ? error.message : 'MovieClip replacement bytes are not a valid JTA file.',
							{ operationKind: operation.kind, resourceKind: resource.kind },
						);
					}
					break;
				}
				if (resource?.kind !== 'image') break;
				const fileName = projectedAssetFileName(project, operations, operationIndex, operation.selector);
				const expectedFormat = rasterImageFormatFromFileName(fileName);
				if (!expectedFormat) {
					pushSupportIssue(
						issues,
						'unsupported_resource_mutation',
						`${operationPath}.sourceBytes`,
						`replaceResourceBytes only supports PNG and JPEG image sources; "${fileName}" is unsupported.`,
						{ operationKind: operation.kind, resourceKind: resource.kind },
					);
					break;
				}
				if (browserRasterValidationRequired(operation.sourceBytes)) {
					pushSupportIssue(
						issues,
						'unsupported_resource_mutation',
						`${operationPath}.sourceBytes`,
						'Browser image replacement requires applyUamTransactionAsync so decoding does not block the main thread.',
						{ operationKind: operation.kind, resourceKind: resource.kind },
					);
					break;
				}
				const imageInfo = probeRasterImage(operation.sourceBytes);
				if (!imageInfo || imageInfo.format !== expectedFormat) {
					pushSupportIssue(
						issues,
						'invalid_resource_bytes',
						`${operationPath}.sourceBytes`,
						imageInfo
							? `Image replacement format "${imageInfo.format}" does not match source file "${fileName}".`
							: 'Image replacement bytes are not a structurally valid PNG or JPEG source.',
						{ operationKind: operation.kind, resourceKind: resource.kind },
					);
					break;
				}
				const finalResource = findProjectedResource(project, operations, operations.length, operation.selector);
				if (finalResource?.kind === 'image' && imageReplacementSurvives(operations, operationIndex, operation.selector)) {
					const finalFileName = projectedAssetFileName(project, operations, operations.length, operation.selector);
					if (finalFileName !== fileName) {
						const finalFormat = rasterImageFormatFromFileName(finalFileName);
						if (!finalFormat) {
							pushSupportIssue(
								issues,
								'unsupported_resource_mutation',
								`${operationPath}.sourceBytes`,
								`replaceResourceBytes only supports PNG and JPEG image sources; "${finalFileName}" is unsupported.`,
								{ operationKind: operation.kind, resourceKind: resource.kind },
							);
						} else if (imageInfo.format !== finalFormat) {
							pushSupportIssue(
								issues,
								'invalid_resource_bytes',
								`${operationPath}.sourceBytes`,
								`Image replacement format "${imageInfo.format}" does not match final source file "${finalFileName}".`,
								{ operationKind: operation.kind, resourceKind: resource.kind },
							);
						}
					}
				}
				break;
			}
			case 'removeResource':
				validateTouchedResourceKind(project, operations, operationIndex, operation.selector, `${operationPath}.selector.resourceId`, issues, operation.kind);
				validateBinaryResourceTarget(project, operations, operationIndex, operation.selector, `${operationPath}.selector.resourceId`, issues, operation.kind);
				validateAssetSourceBytes(project, operations, operationIndex, operation.selector, `${operationPath}.selector.resourceId`, issues, operation.kind);
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
