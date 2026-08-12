import type { ProjectDiagnostic } from '../validation.js';
import { probeRasterImage } from '../utils/image-info.js';
import { deriveMovieClipModelFromJta } from '../utils/jta-parser.js';
import { validateSafeSvgSource } from '../utils/svg-validation.js';
import type { UamAssetResource, UamProject } from './model.js';
import { defaultAssetSourcePath } from './project-source-files.js';

export interface UamSourceValidationResult {
	diagnostics: ProjectDiagnostic[];
	complete: boolean;
}

function assetFileName(resource: UamAssetResource): string {
	return resource.fileName ?? ('file' in resource ? resource.file : '') ?? resource.name;
}

function sourceExtension(resource: UamAssetResource): string {
	const fileName = assetFileName(resource);
	const dot = fileName.lastIndexOf('.');
	return dot < 0 ? '' : fileName.slice(dot + 1).toLowerCase();
}

function validSvg(bytes: Uint8Array): boolean {
	try {
		validateSafeSvgSource(bytes);
		return true;
	} catch {
		return false;
	}
}

export function validateUamSourceBytes(project: UamProject): UamSourceValidationResult {
	const diagnostics: ProjectDiagnostic[] = [];
	let complete = true;
	for (const [packageIndex, pkg] of project.packages.entries()) {
		for (const [resourceIndex, resource] of pkg.resources.entries()) {
			if (resource.kind === 'component') continue;
			const bytes = resource.sourceBytes;
			const path = `packages[${packageIndex}].resources[${resourceIndex}]`;
			const sourcePath = resource.sourcePath ?? defaultAssetSourcePath(resource);
			const base = {
				path,
				packageId: pkg.id,
				resourceId: resource.id,
				sourcePath,
			};
			if (!(bytes instanceof Uint8Array)) {
				complete = false;
				diagnostics.push({
					severity: 'warning',
					code: 'decode_capability_unavailable',
					message: 'Source bytes are not loaded, so source validation is incomplete.',
					...base,
				});
				continue;
			}
			if (bytes.byteLength === 0) {
				diagnostics.push({
					severity: 'error',
					code: 'corrupt_source',
					message: 'Declared source file is empty.',
					...base,
				});
				continue;
			}
			if (resource.kind === 'image') {
				const extension = sourceExtension(resource);
				if (extension === 'png' || extension === 'jpg' || extension === 'jpeg') {
					if (!probeRasterImage(bytes)) {
						diagnostics.push({ severity: 'error', code: 'corrupt_source', message: `Invalid ${extension.toUpperCase()} source.`, ...base });
					}
				} else if (extension === 'svg') {
					if (!validSvg(bytes)) diagnostics.push({ severity: 'error', code: 'corrupt_source', message: 'Invalid or unsafe SVG source.', ...base });
				} else {
					complete = false;
					diagnostics.push({
						severity: 'warning',
						code: 'decode_capability_unavailable',
						message: `No host-neutral decoder is available for image extension "${extension || '(none)'}".`,
						...base,
					});
				}
			} else if (resource.kind === 'movieClip') {
				try {
					deriveMovieClipModelFromJta(bytes);
				} catch (error) {
					diagnostics.push({
						severity: 'error',
						code: 'corrupt_source',
						message: `Invalid MovieClip source: ${error instanceof Error ? error.message : String(error)}`,
						...base,
					});
				}
			}
		}
	}
	return { diagnostics, complete };
}
