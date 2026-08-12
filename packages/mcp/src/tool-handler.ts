import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { BackendRuntime } from '@openfairygui/backend';
import {
	isOpenFairyGuiMcpPayloadWithinBudget,
	type OpenFairyGuiBackendToolName,
} from './tool-definitions.js';

export type OpenFairyGuiBackendRuntime = Pick<
	BackendRuntime,
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
	| 'refreshCache'
>;

function jsonResult(payload: unknown, isError = false): CallToolResult {
	const text = JSON.stringify(payload, null, 2);
	const wirePayload = JSON.parse(text) as unknown;
	return {
		content: [
			{
				type: 'text',
				text,
			},
		],
		structuredContent: {
			backendResult: wirePayload,
		},
		isError,
	};
}

function isBackendFailure(value: unknown): boolean {
	return typeof value === 'object'
		&& value !== null
		&& 'ok' in value
		&& (value as { ok?: unknown }).ok === false;
}

export async function callOpenFairyGuiBackendTool(
	runtime: OpenFairyGuiBackendRuntime,
	name: OpenFairyGuiBackendToolName,
	input: Record<string, unknown>,
): Promise<CallToolResult> {
	if (!isOpenFairyGuiMcpPayloadWithinBudget(input)) {
		throw new RangeError('MCP input exceeds the depth, node, key, string, or byte budget.');
	}
	let result: unknown;
	switch (name) {
		case 'openfairygui_backend_get_capabilities':
			result = runtime.getCapabilities();
			break;
		case 'openfairygui_backend_open_session':
			result = await runtime.openSession({
				projectPath: String(input.projectPath),
			});
			break;
		case 'openfairygui_backend_open_project_session':
			result = runtime.openProjectSession({
				project: input.project as Parameters<BackendRuntime['openProjectSession']>[0]['project'],
				sessionId: input.sessionId === undefined ? undefined : String(input.sessionId),
				canonicalProjectPath: input.canonicalProjectPath === undefined ? undefined : String(input.canonicalProjectPath),
				canonicalPathKey: input.canonicalPathKey === undefined ? undefined : String(input.canonicalPathKey),
			});
			break;
		case 'openfairygui_backend_get_session':
			result = runtime.getSession({
				sessionId: String(input.sessionId),
			});
			break;
		case 'openfairygui_backend_get_project_outline':
			result = runtime.getProjectOutline({
				sessionId: String(input.sessionId),
			});
			break;
		case 'openfairygui_backend_validate_session':
			result = runtime.validateSession({
				sessionId: String(input.sessionId),
			});
			break;
		case 'openfairygui_backend_apply_transaction': {
			const operations = (input.operations as Parameters<BackendRuntime['applyTransaction']>[0]['operations']).map(
				(operation) => operation.kind === 'replaceResourceBytes'
					? { ...operation, sourceBytes: new Uint8Array(operation.sourceBytes) }
					: operation,
			);
			result = await runtime.applyTransaction({
				sessionId: String(input.sessionId),
				expectedRevision: Number(input.expectedRevision),
				operations,
			});
			break;
		}
		case 'openfairygui_backend_save_session':
			result = await runtime.saveSession({
				sessionId: String(input.sessionId),
				expectedRevision: input.expectedRevision === undefined ? undefined : Number(input.expectedRevision),
				targetPath: input.targetPath === undefined ? undefined : String(input.targetPath),
				force: input.force === undefined ? undefined : Boolean(input.force),
				mode: input.mode as Parameters<BackendRuntime['saveSession']>[0]['mode'],
			});
			break;
		case 'openfairygui_backend_materialize_session':
			result = await runtime.materializeSession({
				sessionId: String(input.sessionId),
				expectedRevision: input.expectedRevision === undefined ? undefined : Number(input.expectedRevision),
				mode: input.mode as Parameters<BackendRuntime['materializeSession']>[0]['mode'],
				reason: input.reason === undefined ? undefined : String(input.reason),
			});
			break;
		case 'openfairygui_backend_close_session':
			result = await runtime.closeSession({
				sessionId: String(input.sessionId),
			});
			break;
		case 'openfairygui_backend_get_events':
			result = runtime.getEvents({
				sessionId: String(input.sessionId),
				after: input.after === undefined ? undefined : String(input.after),
				limit: input.limit === undefined ? undefined : Number(input.limit),
			});
			break;
		case 'openfairygui_backend_get_job':
			result = runtime.getJob({
				sessionId: String(input.sessionId),
				jobId: String(input.jobId),
			});
			break;
		case 'openfairygui_backend_list_jobs':
			result = runtime.listJobs({
				sessionId: String(input.sessionId),
				status: input.status as Parameters<BackendRuntime['listJobs']>[0]['status'],
				kind: input.kind as Parameters<BackendRuntime['listJobs']>[0]['kind'],
				limit: input.limit === undefined ? undefined : Number(input.limit),
			});
			break;
		case 'openfairygui_backend_cancel_job':
			result = runtime.cancelJob({
				sessionId: String(input.sessionId),
				jobId: String(input.jobId),
			});
			break;
		case 'openfairygui_backend_get_cache_snapshot':
			result = runtime.getCacheSnapshot({
				sessionId: String(input.sessionId),
			});
			break;
		case 'openfairygui_backend_refresh_cache':
			result = runtime.refreshCache({
				sessionId: String(input.sessionId),
				reason: input.reason as Parameters<BackendRuntime['refreshCache']>[0]['reason'],
			});
			break;
		default: {
			const exhaustive: never = name;
			throw new Error(`Unknown OpenFairyGUI backend MCP tool: ${exhaustive}`);
		}
	}
	return jsonResult(result, isBackendFailure(result));
}
