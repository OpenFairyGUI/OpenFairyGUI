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
const identifier = z.string().min(1).max(256);
export function isOpenFairyGuiMcpPayloadWithinBudget(root: unknown): boolean {
	const pending: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
	let nodes = 0;
	while (pending.length > 0) {
		const { value, depth } = pending.pop()!;
		nodes += 1;
		if (nodes > 100_000 || depth > 32) return false;
		if (value === null || typeof value === 'boolean') continue;
		if (typeof value === 'number') {
			if (!Number.isFinite(value)) return false;
			continue;
		}
		if (typeof value === 'string') {
			if (value.length > 1_000_000) return false;
			continue;
		}
		if (value instanceof Uint8Array) {
			if (value.byteLength > 8 * 1024 * 1024) return false;
			continue;
		}
		if (Array.isArray(value)) {
			if (value.length > 10_000) return false;
			for (const child of value) pending.push({ value: child, depth: depth + 1 });
			continue;
		}
		if (typeof value !== 'object') return false;
		const entries = Object.entries(value);
		if (entries.length > 10_000 || entries.some(([key]) => key.length > 256)) return false;
		for (const [, child] of entries) pending.push({ value: child, depth: depth + 1 });
	}
	return true;
}
const boundedPayload = z.json();
const bytes = z.array(z.number().int().min(0).max(255)).max(8 * 1024 * 1024);
const packageSelector = z.object({ packageId: identifier });
const resourceSelector = z.object({ packageId: identifier, resourceId: identifier });
const componentSelector = z.object({ packageId: identifier, componentResourceId: identifier });
const displayNodeSelector = componentSelector.extend({ displayNodeId: identifier });
const controllerSelector = componentSelector.extend({ controllerName: identifier });
const transitionSelector = componentSelector.extend({ transitionName: identifier });
const folderSelector = packageSelector.extend({ branch: z.string().max(256).optional(), path: z.string().min(1).max(4096) });
const operationBase = { opId: identifier.optional() };
const operation = z.discriminatedUnion('kind', [
	z.object({ ...operationBase, kind: z.literal('updateProjectSettings'), settings: boundedPayload }),
	z.object({ ...operationBase, kind: z.literal('updatePackageSettings'), selector: packageSelector, settings: boundedPayload }),
	z.object({ ...operationBase, kind: z.literal('renameResource'), selector: resourceSelector, newName: identifier }),
	z.object({ ...operationBase, kind: z.literal('moveResource'), selector: resourceSelector, toPath: z.string().max(4096) }),
	z.object({ ...operationBase, kind: z.literal('setResourceFavorite'), selector: resourceSelector, favorite: z.boolean() }),
	z.object({ ...operationBase, kind: z.literal('setResourceFolderFavorite'), selector: folderSelector, favorite: z.boolean() }),
	z.object({ ...operationBase, kind: z.literal('setResourceFolderAtlas'), selector: folderSelector, atlas: z.string().max(32) }),
	z.object({ ...operationBase, kind: z.literal('setResourceExported'), selector: resourceSelector, exported: z.boolean() }),
	z.object({ ...operationBase, kind: z.literal('addResourceFolder'), selector: packageSelector, path: z.string().max(4096), branch: z.string().max(256).optional(), favorite: z.boolean().optional(), atlas: z.string().max(32).optional() }),
	z.object({ ...operationBase, kind: z.literal('renameResourceFolder'), selector: folderSelector, newName: identifier }),
	z.object({ ...operationBase, kind: z.literal('moveResourceFolder'), selector: folderSelector, toPath: z.string().max(4096) }),
	z.object({ ...operationBase, kind: z.literal('removeResourceFolder'), selector: folderSelector }),
	z.object({ ...operationBase, kind: z.literal('setImageResourceProps'), selector: resourceSelector, props: boundedPayload }),
	z.object({ ...operationBase, kind: z.literal('addResource'), selector: packageSelector, resource: boundedPayload, atIndex: z.number().int().nonnegative().optional() }),
	z.object({ ...operationBase, kind: z.literal('addBranch'), branch: identifier }),
	z.object({ ...operationBase, kind: z.literal('renameBranch'), selector: z.object({ branch: identifier }), newName: identifier }),
	z.object({ ...operationBase, kind: z.literal('removeBranch'), selector: z.object({ branch: identifier }) }),
	z.object({ ...operationBase, kind: z.literal('addPackage'), package: boundedPayload, atIndex: z.number().int().nonnegative() }),
	z.object({ ...operationBase, kind: z.literal('renamePackage'), selector: packageSelector, newName: identifier }),
	z.object({ ...operationBase, kind: z.literal('removePackage'), selector: packageSelector }),
	z.object({ ...operationBase, kind: z.literal('addComponent'), selector: packageSelector, component: boundedPayload, atIndex: z.number().int().nonnegative() }),
	z.object({ ...operationBase, kind: z.literal('removeComponent'), selector: componentSelector }),
	z.object({ ...operationBase, kind: z.literal('moveComponent'), selector: componentSelector, toPackageId: identifier, toIndex: z.number().int().nonnegative() }),
	z.object({ ...operationBase, kind: z.literal('replaceResourceBytes'), selector: resourceSelector, sourceBytes: bytes }),
	z.object({ ...operationBase, kind: z.literal('removeResource'), selector: resourceSelector }),
	z.object({ ...operationBase, kind: z.literal('setDisplayNodeProps'), selector: displayNodeSelector, props: boundedPayload }),
	z.object({ ...operationBase, kind: z.literal('setComponentProps'), selector: componentSelector, props: boundedPayload }),
	z.object({ ...operationBase, kind: z.literal('attachDisplayNode'), selector: componentSelector, atIndex: z.number().int().nonnegative(), node: boundedPayload }),
	z.object({ ...operationBase, kind: z.literal('detachDisplayNode'), selector: displayNodeSelector }),
	...(['addController', 'updateController'] as const).map((kind) => z.object({ ...operationBase, kind: z.literal(kind), selector: controllerSelector, controller: boundedPayload })),
	z.object({ ...operationBase, kind: z.literal('removeController'), selector: controllerSelector }),
	...(['addTransition', 'updateTransition'] as const).map((kind) => z.object({ ...operationBase, kind: z.literal(kind), selector: transitionSelector, transition: boundedPayload })),
	z.object({ ...operationBase, kind: z.literal('removeTransition'), selector: transitionSelector }),
	...(['addLookGear', 'updateLookGear', 'addGear', 'updateGear'] as const).map((kind) => z.object({ ...operationBase, kind: z.literal(kind), selector: displayNodeSelector.extend({ kind: identifier, controllerName: identifier }), gear: boundedPayload })),
	...(['removeLookGear', 'removeGear'] as const).map((kind) => z.object({ ...operationBase, kind: z.literal(kind), selector: displayNodeSelector.extend({ kind: identifier, controllerName: identifier }) })),
]);
const project = z.object({
	projectId: identifier,
	projectType: z.number().int(),
	version: z.string().max(256),
	branches: z.array(z.string().max(256)).max(256),
	settings: boundedPayload,
	packages: z.array(z.object({
		id: identifier,
		name: identifier,
		compressPNG: z.boolean().nullable(),
		jpegQuality: z.number().finite().nullable(),
		publish: boundedPayload.nullable(),
		branchNames: z.array(z.string().max(256)).max(256),
		folders: z.array(boundedPayload).max(10_000),
		resources: z.array(boundedPayload).max(100_000),
	})).max(1_000),
});

export const OPENFAIRYGUI_BACKEND_TOOL_OUTPUT_SCHEMA = z.object({
	backendResult: z.discriminatedUnion('ok', [
		z.object({ ok: z.literal(true), data: boundedPayload, meta: boundedPayload }),
		z.object({ ok: z.literal(false), error: z.object({ code: identifier, message: z.string().max(1_000_000) }).passthrough(), meta: boundedPayload, session: boundedPayload.optional() }),
	]),
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
			project,
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
		description: 'Apply a bounded, revision-checked UAM operation batch using the Core transaction discriminants.',
		inputSchema: z.object({
			sessionId,
			expectedRevision,
			operations: z.array(operation).min(1).max(1_000),
		}),
		outputSchema: OPENFAIRYGUI_BACKEND_TOOL_OUTPUT_SCHEMA,
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
	},
	{
		name: 'openfairygui_backend_save_session',
		backendMethod: 'saveSession',
		title: 'Save Backend Session',
		description: 'Write the current backend session through its coordinated save path; Node uses an atomic staged directory swap.',
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
