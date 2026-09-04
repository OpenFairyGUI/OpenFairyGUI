import type { BackendMethodName, BackendResponseMeta } from '@openfairygui/backend';

export interface BackendToolMetadata {
	name: `openfairygui_backend_${string}`;
	backendMethod: BackendMethodName;
	title: string;
	description: string;
	annotations: {
		readOnlyHint?: boolean;
		destructiveHint?: boolean;
		idempotentHint?: boolean;
		openWorldHint?: boolean;
	};
}

/** MCP transport failure, not a Backend domain error. */
export interface McpUnhandledFailure {
	ok: false;
	meta: BackendResponseMeta;
	error: { code: 'backend_unhandled_error'; message: string };
}

/** Host objects cannot cross JSON; materialize keeps its existing MCP target boundary. */
export const MCP_OMITTED_INPUT_FIELDS = {
	openProjectSession: ['storage'],
	saveSession: ['fileSystem'],
	materializeSession: ['storage', 'fileSystem', 'targetPath'],
} as const;

export const OPENFAIRYGUI_BACKEND_TOOL_METADATA = [
	{
		name: 'openfairygui_backend_get_capabilities',
		backendMethod: 'getCapabilities',
		title: 'Get Backend Capabilities',
		description: 'Return the OpenFairyGUI backend capability, version, and service-plane snapshot.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_open_session',
		backendMethod: 'openSession',
		title: 'Open Backend Session',
		description: 'Open a FairyGUI project through BackendRuntime and acquire its backend-local session lock.',
		annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_open_project_session',
		backendMethod: 'openProjectSession',
		title: 'Open Project Session',
		description: 'Open a browser-safe backend session from an already loaded UAM project without filesystem access.',
		annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_get_session',
		backendMethod: 'getSession',
		title: 'Get Backend Session',
		description: 'Return a backend session snapshot by session id.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_get_project_outline',
		backendMethod: 'getProjectOutline',
		title: 'Get Project Outline',
		description: 'Return a revision-bound project/package/resource/component identity outline without source bytes or full property payloads.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_query_entity',
		backendMethod: 'queryEntity',
		title: 'Query Entity Properties',
		description: 'Read a revision-bound resource, component-property, or display-node snapshot using formal selectors. No source bytes; fixed projection with explicit response limits.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_validate_session',
		backendMethod: 'validateSession',
		title: 'Validate Project Session',
		description: 'Validate the current session project structure, references, paths, and available source bytes without writing files.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_preflight_transaction',
		backendMethod: 'preflightTransaction',
		title: 'Preview UAM Transaction',
		description: 'Execute a revision-checked operation batch on an isolated project snapshot and discard the result. Returns the base revision and Core diagnostics; does not write, reserve a revision, or guarantee a later apply/save.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_apply_transaction',
		backendMethod: 'applyTransaction',
		title: 'Apply UAM Transaction',
		description: 'Apply a bounded, revision-checked UAM operation batch using the Core transaction discriminants.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_save_session',
		backendMethod: 'saveSession',
		title: 'Save Backend Session',
		description: 'Write the current backend session through its coordinated save path; Node uses an atomic staged directory swap.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_materialize_session',
		backendMethod: 'materializeSession',
		title: 'Materialize Backend Session',
		description: 'Force materialize the current backend session project through the configured project storage without requiring a dirty edit revision.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_close_session',
		backendMethod: 'closeSession',
		title: 'Close Backend Session',
		description: 'Close a backend session and release its backend-local session lock.',
		annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_get_events',
		backendMethod: 'getEvents',
		title: 'Get Runtime Events',
		description: 'Poll backend runtime events for a session using the backend P2 event cursor contract.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_get_job',
		backendMethod: 'getJob',
		title: 'Get Runtime Job',
		description: 'Return a backend runtime job snapshot by session and backend-local job id.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_list_jobs',
		backendMethod: 'listJobs',
		title: 'List Runtime Jobs',
		description: 'List backend runtime jobs for a session with backend P2 status/kind filters.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_cancel_job',
		backendMethod: 'cancelJob',
		title: 'Cancel Runtime Job',
		description: 'Request cooperative cancellation for a backend runtime job.',
		annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_get_cache_snapshot',
		backendMethod: 'getCacheSnapshot',
		title: 'Get Cache Snapshot',
		description: 'Return the backend P2 derived read-only cache snapshot for a session.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_refresh_cache',
		backendMethod: 'refreshCache',
		title: 'Refresh Cache',
		description: 'Create a backend P2 cache.refresh job for the session cache snapshot.',
		annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
	},
] as const satisfies readonly BackendToolMetadata[];
