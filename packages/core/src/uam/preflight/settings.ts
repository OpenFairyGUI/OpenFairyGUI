import type { UamPackage, UamPackageSettings } from '../model.js';
import type { UamTransactionOperation, UamTransactionSupportIssue } from '../transaction-contracts.js';
import { pushSupportIssue } from './support.js';
import { hasExactKeys, isFiniteNumber, isPlainRecord, isIntegerBetween, isSafeBranchName } from './values.js';

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

export function validateProjectSettingsPayload(
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

export function validatePackageSettingsPayload(
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
	const maxAtlasIndex = isIntegerBetween(publish.maxAtlasIndex, 0, 255) ? publish.maxAtlasIndex : 255;
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
			if (typeof atlas.index !== 'number' || !Number.isInteger(atlas.index) || atlas.index < 0 || atlas.index > maxAtlasIndex) {
				pushInvalidPackageSettings(issues, `${atlasPath}.index`, 'Atlas index must be a non-negative integer no greater than maxAtlasIndex.', operationKind);
			} else {
				if (indices.has(atlas.index)) {
					pushInvalidPackageSettings(issues, `${atlasPath}.index`, `Atlas index ${atlas.index} is duplicated.`, operationKind);
				}
				indices.add(atlas.index);
			}
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

export function canonicalPackageSettings(settings: UamPackageSettings): UamPackageSettings {
	return structuredClone({
		...settings,
		publish: settings.publish ? {
			...settings.publish,
			atlases: [...settings.publish.atlases].sort((left, right) => left.index - right.index),
			excludedResourceIds: [...settings.publish.excludedResourceIds],
		} : null,
	});
}

export function packageSettingsSnapshot(pkg: UamPackage): UamPackageSettings {
	return canonicalPackageSettings({
		compressPNG: pkg.compressPNG,
		jpegQuality: pkg.jpegQuality,
		publish: pkg.publish,
	});
}

export function canonicalProjectSettings(settings: Record<string, unknown>): Record<string, unknown> {
	return structuredClone({
		...settings,
		publish: settings.publish ?? {},
		common: settings.common ?? {},
		adaptation: settings.adaptation ?? {},
	});
}
