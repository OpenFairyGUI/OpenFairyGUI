import type { ProjectValidationReport } from '@openfairygui/core';
import type { InspectReport } from '@openfairygui/functions';
import type { PublishNodeResult } from '@openfairygui/functions/node';
import type { BackendRuntime } from '@openfairygui/backend';
import type { getInstalledDocumentationIndex, getInstalledDocumentationVersion, readInstalledDocumentation } from '@openfairygui/backend/docs';

export interface DoctorReport extends ReturnType<typeof getInstalledDocumentationVersion> {
	scope: 'installed-product';
	cliVersion: string;
	nodeVersion: string;
	status: 'ready' | 'error' | 'incomplete';
	errors: { code: 'installed_version_mismatch' | 'unsupported_node_version' | 'project_check_failed'; message: string }[];
	capabilities: ReturnType<BackendRuntime['getCapabilities']>;
	projectPath: string | null;
	project: ProjectValidationReport | null;
	limits: string[];
}

/** CLI owns transport shapes; workflow reports remain owned by their packages. */
export interface CliCommandResults {
	ofgui: never;
	docs: never;
	inspect: InspectReport;
	validate: ProjectValidationReport;
	publish: PublishNodeResult;
	restore: { projectPath: string; packages: { id: string; name: string }[]; warnings: string[] };
	doctor: DoctorReport;
	'backend-capabilities': Extract<ReturnType<BackendRuntime['getCapabilities']>, { ok: true }>['data'];
	'docs ls': ReturnType<typeof getInstalledDocumentationIndex>;
	'docs find': ReturnType<typeof getInstalledDocumentationIndex>;
	'docs cat': ReturnType<typeof readInstalledDocumentation>;
	'docs diagnostic': ReturnType<typeof readInstalledDocumentation>;
	'docs schema': ReturnType<typeof readInstalledDocumentation>;
}

export type CliCommand = keyof CliCommandResults;
export interface CliError {
	code: 'invalid_arguments' | 'command_failed' | 'publish_failed' | 'restore_failed' | 'documentation_unavailable'
		| 'validation_failed' | 'validation_incomplete' | 'doctor_failed' | 'doctor_incomplete';
	message: string;
}
export type CliEnvelope<C extends CliCommand> =
	| { schemaVersion: 1; command: C; success: true; result: CliCommandResults[C] }
	| { schemaVersion: 1; command: C; success: false; error: CliError; result?: CliCommandResults[C] };
/** The generator emits one schema per command, including parser-only failures. */
export type CliOutputContracts = { [C in CliCommand]: CliEnvelope<C> };
