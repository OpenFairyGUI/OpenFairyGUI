import {
	createProjectValidationReport,
	type ProjectDiagnostic,
	type ProjectValidationReport,
	type UamProject,
	validateUamReferences,
	validateUamProject,
	validateUamSourceBytes,
} from '@openfairygui/core';

export interface ValidateProjectOptions {
	/** Diagnostics collected while reading the source project. */
	readDiagnostics?: readonly ProjectDiagnostic[];
	/** Whether the reader and host completed every requested check. */
	complete?: boolean;
	/** Validate hydrated resource bytes in addition to the UAM graph. */
	validateSources?: boolean;
}

/** Validate one authoritative UAM snapshot without mutating it. */
export function validateProject(
	project: UamProject,
	options: ValidateProjectOptions = {},
): ProjectValidationReport {
	const diagnostics = [
		...(options.readDiagnostics ?? []),
		...validateUamProject(project),
		...validateUamReferences(project),
	];
	let complete = options.complete ?? true;
	if (options.validateSources) {
		const source = validateUamSourceBytes(project);
		diagnostics.push(...source.diagnostics);
		complete = complete && source.complete;
	}
	return createProjectValidationReport(diagnostics, complete);
}
