import {
	createProjectValidationReport,
	liftDocumentToUamProject,
	type ProjectDiagnostic,
	type ProjectValidationReport,
	type UamProject,
} from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';
import { validateProject } from '../../validate.js';

const importNative = new Function('id', 'return import(id)') as <T>(id: string) => Promise<T>;

function sourceName(resource: {
	kind: string;
	name: string;
	fileName?: string;
	file?: string;
	sourcePath?: string;
}): string {
	return resource.sourcePath ?? resource.fileName ?? resource.file ?? resource.name;
}

export async function validateProjectNode(projectPath: string): Promise<ProjectValidationReport> {
	const read = await new NodeIO().readProjectDetailed(projectPath, { hydrateResourceBytes: true });
	if (!read.document) return createProjectValidationReport(read.diagnostics, false);

	let project: UamProject;
	try {
		project = liftDocumentToUamProject(read.document);
	} catch (error) {
		return createProjectValidationReport([...read.diagnostics, {
			severity: 'error',
			code: 'invalid_uam',
			path: 'project',
			message: `Project cannot be represented as UAM: ${error instanceof Error ? error.message : String(error)}`,
			sourcePath: projectPath,
		}], false);
	}
	const base = validateProject(project, {
		readDiagnostics: read.diagnostics,
		complete: read.complete,
		validateSources: true,
	});
	let diagnostics: ProjectDiagnostic[] = base.diagnostics;
	const knownCorruptPaths = new Set(base.diagnostics
		.filter((diagnostic) => diagnostic.code === 'corrupt_source')
		.map((diagnostic) => diagnostic.path));
	const images = project.packages.flatMap((pkg, packageIndex) => pkg.resources
		.map((resource, resourceIndex) => ({ pkg, packageIndex, resource, resourceIndex }))
		.filter(({ resource, packageIndex, resourceIndex }) => (
			resource.kind === 'image'
			&& resource.sourceBytes instanceof Uint8Array
			&& !knownCorruptPaths.has(`packages[${packageIndex}].resources[${resourceIndex}]`)
		)));
	if (images.length === 0) return base;

	let sharp: ((bytes: Uint8Array) => { raw(): { toBuffer(): Promise<unknown> } });
	try {
		const loaded = await importNative<typeof import('sharp')>('sharp');
		sharp = (loaded as unknown as { default?: typeof loaded }).default ?? loaded;
	} catch {
		return createProjectValidationReport([...base.diagnostics, {
			severity: 'warning',
			code: 'decode_capability_unavailable',
			path: 'project',
			message: 'Sharp is unavailable, so Node image decoding could not be completed.',
		}], false);
	}
	const decodedPaths = new Set(images.map(({ packageIndex, resourceIndex }) => `packages[${packageIndex}].resources[${resourceIndex}]`));
	diagnostics = diagnostics.filter((diagnostic) => (
		diagnostic.code !== 'decode_capability_unavailable' || !decodedPaths.has(diagnostic.path)
	));

	for (const { pkg, packageIndex, resource, resourceIndex } of images) {
		try {
			await sharp(resource.sourceBytes!).raw().toBuffer();
		} catch (error) {
			diagnostics.push({
				severity: 'error',
				code: 'corrupt_source',
				path: `packages[${packageIndex}].resources[${resourceIndex}]`,
				message: `Image source cannot be decoded: ${error instanceof Error ? error.message : String(error)}`,
				packageId: pkg.id,
				resourceId: resource.id,
				sourcePath: sourceName(resource),
			});
		}
	}
	return createProjectValidationReport(
		diagnostics,
		read.complete && !diagnostics.some((diagnostic) => diagnostic.code === 'decode_capability_unavailable'),
	);
}
