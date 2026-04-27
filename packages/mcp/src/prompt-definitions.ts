import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';

export const OPENFAIRYGUI_BACKEND_PROMPT_NAMES = [
	'openfairygui_inspect_capabilities',
	'openfairygui_open_and_inspect_session',
	'openfairygui_plan_revision_checked_transaction',
	'openfairygui_save_session',
	'openfairygui_poll_runtime_state',
] as const;

export type OpenFairyGuiBackendPromptName = typeof OPENFAIRYGUI_BACKEND_PROMPT_NAMES[number];

interface OpenFairyGuiBackendPromptDefinition {
	name: OpenFairyGuiBackendPromptName;
	title: string;
	description: string;
	text: string;
}

export const OPENFAIRYGUI_BACKEND_PROMPT_DEFINITIONS = [
	{
		name: 'openfairygui_inspect_capabilities',
		title: 'Inspect OpenFairyGUI Backend Capabilities',
		description: 'Guide a client through the capability and version discovery tool.',
		text: [
			'Use openfairygui_backend_get_capabilities first.',
			'Read contractVersion, capabilitySchemaVersion, capability planes, methods, and runtime non-goals from the backend envelope.',
			'Do not infer artifact publish/restore, subscriptions, persistent jobs, or cache source-of-truth support when the backend marks them unsupported.',
		].join('\n'),
	},
	{
		name: 'openfairygui_open_and_inspect_session',
		title: 'Open and Inspect an OpenFairyGUI Session',
		description: 'Guide a client through opening and reading a backend session.',
		text: [
			'Use openfairygui_backend_open_session with a projectPath, then use openfairygui_backend_get_session with the returned sessionId.',
			'Backend path policy remains authoritative for project paths and save targets; MCP roots are only client context in this package.',
			'Close the session with openfairygui_backend_close_session when finished.',
		].join('\n'),
	},
	{
		name: 'openfairygui_plan_revision_checked_transaction',
		title: 'Plan a Revision-Checked OpenFairyGUI Transaction',
		description: 'Guide a client through backend-owned revision checks without inventing operation grammar.',
		text: [
			'Use openfairygui_backend_get_session to read the current revision before mutation.',
			'Call openfairygui_backend_apply_transaction with sessionId, expectedRevision, and backend/UAM-owned operations.',
			'If the backend returns a stale revision error, refresh the session snapshot and re-plan against the new revision.',
			'Do not invent selector grammar, transaction grammar, or operation payload semantics at the MCP layer.',
		].join('\n'),
	},
	{
		name: 'openfairygui_save_session',
		title: 'Save an OpenFairyGUI Backend Session',
		description: 'Guide a client through coordinated backend save semantics.',
		text: [
			'Use openfairygui_backend_save_session with sessionId and expectedRevision when available.',
			'Backend path policy remains authoritative for targetPath; MCP does not canonicalize or authorize paths.',
			'Handle stale revision and partial save failure envelopes from the backend without rewriting their error semantics.',
		].join('\n'),
	},
	{
		name: 'openfairygui_poll_runtime_state',
		title: 'Poll OpenFairyGUI Runtime State',
		description: 'Guide a client through event, job, and cache polling tools.',
		text: [
			'Use openfairygui_backend_get_events for polling events with the backend cursor contract.',
			'Use openfairygui_backend_list_jobs and openfairygui_backend_get_job for in-memory job snapshots.',
			'Use openfairygui_backend_get_cache_snapshot and openfairygui_backend_refresh_cache for derived read-only cache state.',
			'Subscriptions, persistent jobs, artifact jobs, and cache-as-source-of-truth behavior are not supported by backend P2.',
		].join('\n'),
	},
] as const satisfies readonly OpenFairyGuiBackendPromptDefinition[];

function promptResult(text: string): GetPromptResult {
	return {
		messages: [
			{
				role: 'user',
				content: {
					type: 'text',
					text,
				},
			},
		],
	};
}

export function registerOpenFairyGuiBackendPrompts(server: {
	registerPrompt: (
		name: string,
		config: { title?: string; description?: string },
		callback: () => GetPromptResult,
	) => unknown;
}): void {
	for (const definition of OPENFAIRYGUI_BACKEND_PROMPT_DEFINITIONS) {
		server.registerPrompt(
			definition.name,
			{
				title: definition.title,
				description: definition.description,
			},
			() => promptResult(definition.text),
		);
	}
}
