import { type UamAssetResource, type UamProject, UAM_SUPPORTED_TRANSACTION_SCOPE } from '../model.js';
import {
	browserRasterValidationRequired,
	probeRasterImage,
	rasterImageFormatFromFileName,
} from '../../utils/image-info.js';
import { deriveMovieClipModelFromJta } from '../../utils/jta-parser.js';
import { isValidUamImageResourceProperties, isValidUamMovieClipResourceProperties } from '../validate.js';
import type {
	UamPackageSelector,
	UamResourceSelector,
	UamTransactionOperation,
	UamTransactionSupportIssue,
} from '../transaction-contracts.js';
import {
	findPackageSpec,
	findResourceSpec,
	findProjectedResource,
	renamedResourceFileName,
} from '../transaction-shared.js';
import { pushSupportIssue, validateTouchedResourceKind } from './support.js';
import { isSafeResourceFileName, isSafeResourcePath } from './values.js';

export function primaryResourceFileName(resource: UamAssetResource): string {
	return resource.fileName ?? ('file' in resource ? resource.file : '') ?? '';
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

export function validateAssetResourcePayload(
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
			|| !('packageId' in operation.selector)
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
			|| !('packageId' in operation.selector)
			|| operation.selector.packageId !== selector.packageId
			|| !('resourceId' in operation.selector)
			|| operation.selector.resourceId !== selector.resourceId
		) continue;
		if (operation.kind === 'replaceResourceBytes' || operation.kind === 'removeResource') return false;
	}
	return true;
}

export function validateResourceOperation(
	project: UamProject,
	operations: UamTransactionOperation[],
	operationIndex: number,
	operation: Extract<UamTransactionOperation, { kind: 'renameResource' | 'moveResource' | 'setResourceFavorite' | 'setResourceExported' | 'setImageResourceProps' | 'addResource' | 'replaceResourceBytes' | 'removeResource' }>,
	operationPath: string,
	issues: UamTransactionSupportIssue[],
): void {
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
				{ operationKind: 'setResourceFavorite' },
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
	}
}
