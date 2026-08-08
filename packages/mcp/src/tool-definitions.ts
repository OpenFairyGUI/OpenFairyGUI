import { z } from 'zod';

export const OPENFAIRYGUI_BACKEND_TOOL_PREFIX = 'openfairygui_backend_';

export const OPENFAIRYGUI_BACKEND_TOOL_NAMES = [
	'openfairygui_backend_get_capabilities',
	'openfairygui_backend_open_session',
	'openfairygui_backend_open_project_session',
	'openfairygui_backend_get_session',
	'openfairygui_backend_get_project_outline',
	'openfairygui_backend_validate_session',
	'openfairygui_backend_apply_transaction',
	'openfairygui_backend_save_session',
	'openfairygui_backend_materialize_session',
	'openfairygui_backend_close_session',
	'openfairygui_backend_get_events',
	'openfairygui_backend_get_job',
	'openfairygui_backend_list_jobs',
	'openfairygui_backend_cancel_job',
	'openfairygui_backend_get_cache_snapshot',
	'openfairygui_backend_refresh_cache',
] as const;

export type OpenFairyGuiBackendToolName = typeof OPENFAIRYGUI_BACKEND_TOOL_NAMES[number];

export type BackendMethodName =
	| 'getCapabilities'
	| 'openSession'
	| 'openProjectSession'
	| 'getSession'
	| 'getProjectOutline'
	| 'validateSession'
	| 'applyTransaction'
	| 'saveSession'
	| 'materializeSession'
	| 'closeSession'
	| 'getEvents'
	| 'getJob'
	| 'listJobs'
	| 'cancelJob'
	| 'getCacheSnapshot'
	| 'refreshCache';

export interface OpenFairyGuiBackendToolDefinition {
	name: OpenFairyGuiBackendToolName;
	backendMethod: BackendMethodName;
	title: string;
	description: string;
	inputSchema: z.ZodObject;
	outputSchema: z.ZodObject;
	annotations: {
		readOnlyHint?: boolean;
		destructiveHint?: boolean;
		idempotentHint?: boolean;
		openWorldHint?: boolean;
	};
}

const sessionId = z.string().min(1);
const jobId = z.string().min(1);
const expectedRevision = z.number().int().nonnegative();
const limit = z.number().int().nonnegative().optional();

export const OPENFAIRYGUI_BACKEND_TOOL_OUTPUT_SCHEMA = z.object({
	backendResult: z.object({
		ok: z.boolean(),
		data: z.unknown().optional(),
		error: z.unknown().optional(),
		meta: z.unknown().optional(),
	}).passthrough(),
});

export const OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS = [
	{
		name: 'openfairygui_backend_get_capabilities',
		backendMethod: 'getCapabilities',
		title: 'Get Backend Capabilities',
		description: 'Return the OpenFairyGUI backend capability, version, and service-plane snapshot.',
		inputSchema: z.object({}),
		outputSchema: OPENFAIRYGUI_BACKEND_TOOL_OUTPUT_SCHEMA,
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_open_session',
		backendMethod: 'openSession',
		title: 'Open Backend Session',
		description: 'Open a FairyGUI project through BackendRuntime and acquire its backend-local session lock.',
		inputSchema: z.object({
			projectPath: z.string().min(1),
		}),
		outputSchema: OPENFAIRYGUI_BACKEND_TOOL_OUTPUT_SCHEMA,
		annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_open_project_session',
		backendMethod: 'openProjectSession',
		title: 'Open Project Session',
		description: 'Open a browser-safe backend session from an already loaded UAM project without filesystem access.',
		inputSchema: z.object({
			project: z.unknown(),
			sessionId: z.string().min(1).optional(),
			canonicalProjectPath: z.string().min(1).optional(),
			canonicalPathKey: z.string().min(1).optional(),
		}),
		outputSchema: OPENFAIRYGUI_BACKEND_TOOL_OUTPUT_SCHEMA,
		annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_get_session',
		backendMethod: 'getSession',
		title: 'Get Backend Session',
		description: 'Return a backend session snapshot by session id.',
		inputSchema: z.object({ sessionId }),
		outputSchema: OPENFAIRYGUI_BACKEND_TOOL_OUTPUT_SCHEMA,
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_get_project_outline',
		backendMethod: 'getProjectOutline',
		title: 'Get Project Outline',
		description: 'Return a revision-bound project/package/resource/component identity outline without source bytes or full property payloads.',
		inputSchema: z.object({ sessionId }),
		outputSchema: OPENFAIRYGUI_BACKEND_TOOL_OUTPUT_SCHEMA,
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_validate_session',
		backendMethod: 'validateSession',
		title: 'Validate Project Session',
		description: 'Validate the current session project structure, references, paths, and available source bytes without writing files.',
		inputSchema: z.object({ sessionId }),
		outputSchema: OPENFAIRYGUI_BACKEND_TOOL_OUTPUT_SCHEMA,
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_apply_transaction',
		backendMethod: 'applyTransaction',
		title: 'Apply UAM Transaction',
		description: 'Apply a backend revision-checked UAM operation batch without redefining selector or operation grammar.',
		inputSchema: z.object({
			sessionId,
			expectedRevision,
			operations: z.array(z.unknown()),
		}),
		outputSchema: OPENFAIRYGUI_BACKEND_TOOL_OUTPUT_SCHEMA,
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_save_session',
		backendMethod: 'saveSession',
		title: 'Save Backend Session',
		description: 'Write the current backend session back through the backend coordinated non-atomic save path.',
		inputSchema: z.object({
			sessionId,
			expectedRevision: expectedRevision.optional(),
			targetPath: z.string().min(1).optional(),
			force: z.boolean().optional(),
			mode: z.literal('materializeCleanSession').optional(),
		}),
		outputSchema: OPENFAIRYGUI_BACKEND_TOOL_OUTPUT_SCHEMA,
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_materialize_session',
		backendMethod: 'materializeSession',
		title: 'Materialize Backend Session',
		description: 'Force materialize the current backend session project through the configured project storage without requiring a dirty edit revision.',
		inputSchema: z.object({
			sessionId,
			expectedRevision: expectedRevision.optional(),
			mode: z.literal('fullProject').optional(),
			reason: z.string().min(1).optional(),
		}),
		outputSchema: OPENFAIRYGUI_BACKEND_TOOL_OUTPUT_SCHEMA,
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_close_session',
		backendMethod: 'closeSession',
		title: 'Close Backend Session',
		description: 'Close a backend session and release its backend-local session lock.',
		inputSchema: z.object({ sessionId }),
		outputSchema: OPENFAIRYGUI_BACKEND_TOOL_OUTPUT_SCHEMA,
		annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_get_events',
		backendMethod: 'getEvents',
		title: 'Get Runtime Events',
		description: 'Poll backend runtime events for a session using the backend P2 event cursor contract.',
		inputSchema: z.object({
			sessionId,
			after: z.string().optional(),
			limit,
		}),
		outputSchema: OPENFAIRYGUI_BACKEND_TOOL_OUTPUT_SCHEMA,
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_get_job',
		backendMethod: 'getJob',
		title: 'Get Runtime Job',
		description: 'Return a backend runtime job snapshot by session and backend-local job id.',
		inputSchema: z.object({ sessionId, jobId }),
		outputSchema: OPENFAIRYGUI_BACKEND_TOOL_OUTPUT_SCHEMA,
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_list_jobs',
		backendMethod: 'listJobs',
		title: 'List Runtime Jobs',
		description: 'List backend runtime jobs for a session with backend P2 status/kind filters.',
		inputSchema: z.object({
			sessionId,
			status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled', 'active', 'terminal']).optional(),
			kind: z.literal('cache.refresh').optional(),
			limit,
		}),
		outputSchema: OPENFAIRYGUI_BACKEND_TOOL_OUTPUT_SCHEMA,
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_cancel_job',
		backendMethod: 'cancelJob',
		title: 'Cancel Runtime Job',
		description: 'Request cooperative cancellation for a backend runtime job.',
		inputSchema: z.object({ sessionId, jobId }),
		outputSchema: OPENFAIRYGUI_BACKEND_TOOL_OUTPUT_SCHEMA,
		annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_get_cache_snapshot',
		backendMethod: 'getCacheSnapshot',
		title: 'Get Cache Snapshot',
		description: 'Return the backend P2 derived read-only cache snapshot for a session.',
		inputSchema: z.object({ sessionId }),
		outputSchema: OPENFAIRYGUI_BACKEND_TOOL_OUTPUT_SCHEMA,
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_refresh_cache',
		backendMethod: 'refreshCache',
		title: 'Refresh Cache',
		description: 'Create a backend P2 cache.refresh job for the session cache snapshot.',
		inputSchema: z.object({
			sessionId,
			reason: z.enum(['manual', 'session_open', 'after_save']).optional(),
		}),
		outputSchema: OPENFAIRYGUI_BACKEND_TOOL_OUTPUT_SCHEMA,
		annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
	},
] as const satisfies readonly OpenFairyGuiBackendToolDefinition[];
