export type ProjectDiagnosticSeverity = 'error' | 'warning' | 'info';

export type ProjectDiagnosticCode =
	| 'invalid_project_xml'
	| 'invalid_package_xml'
	| 'invalid_branch_package_xml'
	| 'invalid_component_xml'
	| 'invalid_project_value'
	| 'desktop_incompatible_geometry'
	| 'invalid_settings_json'
	| 'invalid_uam'
	| 'duplicate_package_id'
	| 'duplicate_package_name'
	| 'duplicate_resource_id'
	| 'path_collision'
	| 'unsafe_path'
	| 'dangling_resource_reference'
	| 'missing_source'
	| 'unreadable_source'
	| 'corrupt_source'
	| 'unsupported_resource_kind'
	| 'decode_capability_unavailable';

/** One stable, transport-neutral project diagnostic. */
export interface ProjectDiagnostic {
	severity: ProjectDiagnosticSeverity;
	code: ProjectDiagnosticCode;
	path: string;
	message: string;
	packageId?: string;
	resourceId?: string;
	nodeId?: string;
	sourcePath?: string;
}

export interface ProjectValidationReport {
	status: 'valid' | 'invalid' | 'incomplete';
	complete: boolean;
	diagnostics: ProjectDiagnostic[];
}

export function sortProjectDiagnostics(diagnostics: readonly ProjectDiagnostic[]): ProjectDiagnostic[] {
	return [...diagnostics].sort((left, right) => (
		left.path.localeCompare(right.path)
		|| left.code.localeCompare(right.code)
		|| left.message.localeCompare(right.message)
	));
}

export function createProjectValidationReport(
	diagnostics: readonly ProjectDiagnostic[],
	complete = true,
): ProjectValidationReport {
	const sorted = sortProjectDiagnostics(diagnostics);
	return {
		status: sorted.some((diagnostic) => diagnostic.severity === 'error')
			? 'invalid'
			: complete ? 'valid' : 'incomplete',
		complete,
		diagnostics: sorted,
	};
}
