import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import type { OpenFairyGuiBackendRuntime } from './tool-handler.js';

const JSON_MIME_TYPE = 'application/json';

function firstVariable(value: string | string[] | undefined): string {
	return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function jsonResource(uri: URL, backendResult: unknown): ReadResourceResult {
	return {
		contents: [
			{
				uri: uri.toString(),
				mimeType: JSON_MIME_TYPE,
				text: JSON.stringify(backendResult, null, 2),
			},
		],
	};
}

export const OPENFAIRYGUI_BACKEND_CAPABILITIES_RESOURCE_URI = 'openfairygui://backend/capabilities';

export const OPENFAIRYGUI_BACKEND_RESOURCE_TEMPLATES = [
	'openfairygui://backend/session/{sessionId}',
	'openfairygui://backend/session/{sessionId}/outline',
	'openfairygui://backend/cache/{sessionId}',
	'openfairygui://backend/job/{sessionId}/{jobId}',
] as const;

export function registerOpenFairyGuiBackendResources(server: McpServer, runtime: OpenFairyGuiBackendRuntime): void {
	server.registerResource(
		'openfairygui_backend_capabilities',
		OPENFAIRYGUI_BACKEND_CAPABILITIES_RESOURCE_URI,
		{
			title: 'OpenFairyGUI Backend Capabilities',
			description: 'Read the backend capability and version envelope as JSON.',
			mimeType: JSON_MIME_TYPE,
		},
		(uri: URL) => jsonResource(uri, runtime.getCapabilities()),
	);

	server.registerResource(
		'openfairygui_backend_session',
		new ResourceTemplate('openfairygui://backend/session/{sessionId}', { list: undefined }),
		{
			title: 'OpenFairyGUI Backend Session Snapshot',
			description: 'Read a backend session envelope by backend-local session id.',
			mimeType: JSON_MIME_TYPE,
		},
		(uri: URL, variables) => jsonResource(uri, runtime.getSession({
			sessionId: firstVariable(variables.sessionId),
		})),
	);

	server.registerResource(
		'openfairygui_backend_project_outline',
		new ResourceTemplate('openfairygui://backend/session/{sessionId}/outline', { list: undefined }),
		{
			title: 'OpenFairyGUI Project Outline',
			description: 'Read a revision-bound project identity outline without source bytes or full property payloads.',
			mimeType: JSON_MIME_TYPE,
		},
		(uri: URL, variables) => jsonResource(uri, runtime.getProjectOutline({
			sessionId: firstVariable(variables.sessionId),
		})),
	);

	server.registerResource(
		'openfairygui_backend_cache',
		new ResourceTemplate('openfairygui://backend/cache/{sessionId}', { list: undefined }),
		{
			title: 'OpenFairyGUI Backend Cache Snapshot',
			description: 'Read a derived backend cache envelope by backend-local session id.',
			mimeType: JSON_MIME_TYPE,
		},
		(uri: URL, variables) => jsonResource(uri, runtime.getCacheSnapshot({
			sessionId: firstVariable(variables.sessionId),
		})),
	);

	server.registerResource(
		'openfairygui_backend_job',
		new ResourceTemplate('openfairygui://backend/job/{sessionId}/{jobId}', { list: undefined }),
		{
			title: 'OpenFairyGUI Backend Job Snapshot',
			description: 'Read a backend runtime job envelope by session id and job id.',
			mimeType: JSON_MIME_TYPE,
		},
		(uri: URL, variables) => jsonResource(uri, runtime.getJob({
			sessionId: firstVariable(variables.sessionId),
			jobId: firstVariable(variables.jobId),
		})),
	);
}
