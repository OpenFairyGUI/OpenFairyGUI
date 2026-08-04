import {
	createProjectValidationReport,
	type ProjectDiagnostic,
	type ProjectValidationReport,
	type UamProject,
} from '@openfairygui/core';
import { validateProject } from '../../validate.js';
import { assertBrowserImageSupport, validateBrowserImageSource } from './raster.js';

function sourceName(resource: {
	name: string;
	fileName?: string;
	sourcePath?: string;
}): string {
	return resource.sourcePath ?? resource.fileName ?? resource.name;
}

export async function validateProjectWeb(project: UamProject): Promise<ProjectValidationReport> {
	const base = validateProject(project, { validateSources: true });
	const hasHydratedImages = project.packages.some((pkg) => pkg.resources.some(
		(resource) => resource.kind === 'image' && resource.sourceBytes instanceof Uint8Array,
	));
	if (!hasHydratedImages) return base;
	try {
		assertBrowserImageSupport();
	} catch (error) {
		return createProjectValidationReport([...base.diagnostics, {
			severity: 'warning',
			code: 'decode_capability_unavailable',
			path: 'project',
			message: error instanceof Error ? error.message : String(error),
		}], false);
	}
	const decodedPaths = new Set<string>();
	const diagnostics: ProjectDiagnostic[] = [...base.diagnostics];
	for (const [packageIndex, pkg] of project.packages.entries()) {
		for (const [resourceIndex, resource] of pkg.resources.entries()) {
			if (resource.kind !== 'image' || !(resource.sourceBytes instanceof Uint8Array)) continue;
			try {
				await validateBrowserImageSource(resource.sourceBytes, sourceName(resource));
				decodedPaths.add(`packages[${packageIndex}].resources[${resourceIndex}]`);
			} catch (error) {
				const capabilityUnavailable = error instanceof Error && /(?:required|unavailable)/iu.test(error.message);
				diagnostics.push({
					severity: capabilityUnavailable ? 'warning' : 'error',
					code: capabilityUnavailable ? 'decode_capability_unavailable' : 'corrupt_source',
					path: `packages[${packageIndex}].resources[${resourceIndex}]`,
					message: `Image source cannot be decoded: ${error instanceof Error ? error.message : String(error)}`,
					packageId: pkg.id,
					resourceId: resource.id,
					sourcePath: sourceName(resource),
				});
			}
		}
	}
	const resolved = diagnostics.filter((diagnostic) => (
		diagnostic.code !== 'decode_capability_unavailable' || !decodedPaths.has(diagnostic.path)
	));
	return createProjectValidationReport(resolved, !resolved.some((diagnostic) => diagnostic.code === 'decode_capability_unavailable'));
}
