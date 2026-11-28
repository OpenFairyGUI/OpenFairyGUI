import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError, type ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import {
	BACKEND_DIAGNOSTICS_URI,
	BACKEND_DIAGNOSTIC_TEMPLATE,
	getBackendDiagnosticCatalog,
	getBackendDiagnosticGuide,
} from '@openfairygui/backend';
import {
	getInstalledDocumentationIndex,
	readInstalledDocumentation,
	OPENFAIRYGUI_DOCS_INDEX_URI,
} from '@openfairygui/backend/docs';
import type { OpenFairyGuiBackendRuntime } from './tool-handler.js';
import {
	getOpenFairyGuiOperationCatalog,
	getOpenFairyGuiOperationSchema,
	OPENFAIRYGUI_OPERATION_CATALOG_URI,
	OPENFAIRYGUI_OPERATION_SCHEMA_TEMPLATE,
} from './contract-schema.js';

const JSON_MIME_TYPE = 'application/json';
const MAX_RESOURCE_RESPONSE_BYTES = 16 * 1024 * 1024;

function firstVariable(value: string | string[] | undefined): string {
	return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function decodeTemplateVariable(value: string | string[] | undefined): string {
	const raw = firstVariable(value);
	try {
		return decodeURIComponent(raw);
	} catch {
		throw new McpError(ErrorCode.InvalidParams, `Invalid percent-encoding in resource URI variable: ${raw}`);
	}
}

function assertResourceSizeWithinBudget(text: string): void {
	if (Buffer.byteLength(text, 'utf8') > MAX_RESOURCE_RESPONSE_BYTES) {
		throw new McpError(
			ErrorCode.InvalidRequest,
			`MCP resource response exceeds the ${MAX_RESOURCE_RESPONSE_BYTES}-byte transport budget.`,
		);
	}
}

function runResourceRead(read: () => ReadResourceResult): ReadResourceResult {
	try {
		return read();
	} catch (error) {
		if (error instanceof McpError) throw error;
		if (error instanceof RangeError) {
			throw new McpError(ErrorCode.InvalidParams, error.message);
		}
		throw new McpError(ErrorCode.InternalError, 'Resource read failed due to an internal error.');
	}
}

function jsonResource(uri: URL, backendResult: unknown, compact = false): ReadResourceResult {
	const text = compact ? JSON.stringify(backendResult) : JSON.stringify(backendResult, null, 2);
	assertResourceSizeWithinBudget(text);
	return {
		contents: [
			{
				uri: uri.toString(),
				mimeType: JSON_MIME_TYPE,
				text,
			},
		],
	};
}

export const OPENFAIRYGUI_BACKEND_CAPABILITIES_RESOURCE_URI = 'openfairygui://backend/capabilities';

export const OPENFAIRYGUI_BACKEND_RESOURCE_TEMPLATES = [
	'openfairygui://docs/methods/{method}',
	'openfairygui://docs/cli/{command}',
	BACKEND_DIAGNOSTIC_TEMPLATE,
	OPENFAIRYGUI_OPERATION_SCHEMA_TEMPLATE,
	'openfairygui://backend/session/{sessionId}',
	'openfairygui://backend/session/{sessionId}/outline',
	'openfairygui://backend/cache/{sessionId}',
] as const;

export function registerOpenFairyGuiBackendResources(server: McpServer, runtime: OpenFairyGuiBackendRuntime): void {
	server.registerResource(
		'openfairygui_docs_index',
		OPENFAIRYGUI_DOCS_INDEX_URI,
		{
			title: 'Installed Documentation',
			description:
				'Offline documentation IDs, URIs, installed package version and contract digest shared with the CLI.',
			mimeType: JSON_MIME_TYPE,
		},
		(uri) => runResourceRead(() => jsonResource(uri, getInstalledDocumentationIndex())),
	);
	function installedDocument(uri: URL, id: string): ReadResourceResult {
		return runResourceRead(() => {
			const document = readInstalledDocumentation(id);
			assertResourceSizeWithinBudget(document.text);
			return { contents: [{ uri: uri.toString(), mimeType: document.mimeType, text: document.text }] };
		});
	}
	for (const id of ['workflow', 'restore-limits', 'skill', 'contracts']) {
		server.registerResource(
			`openfairygui_docs_${id}`,
			`openfairygui://docs/${id}`,
			{
				title: `Installed ${id}`,
				description: 'Read the installed-version corpus without repository or network access.',
				mimeType: id === 'contracts' ? JSON_MIME_TYPE : 'text/markdown',
			},
			(uri) => installedDocument(uri, id),
		);
	}
	server.registerResource(
		'openfairygui_docs_method',
		new ResourceTemplate('openfairygui://docs/methods/{method}', { list: undefined }),
		{
			title: 'Installed Method Contract',
			description: 'Read self-contained Backend/MCP wire input/output schemas and metadata.',
			mimeType: JSON_MIME_TYPE,
		},
		(uri, variables) => installedDocument(uri, `methods/${decodeTemplateVariable(variables.method)}`),
	);
	server.registerResource(
		'openfairygui_diagnostic_catalog',
		BACKEND_DIAGNOSTICS_URI,
		{
			title: 'Diagnostic Recovery Catalog',
			description: 'Complete formal diagnostic ownership and recovery guidance; never automatic repair.',
			mimeType: JSON_MIME_TYPE,
		},
		(uri) => runResourceRead(() => jsonResource(uri, getBackendDiagnosticCatalog())),
	);
	server.registerResource(
		'openfairygui_docs_cli',
		new ResourceTemplate('openfairygui://docs/cli/{command}', { list: undefined }),
		{
			title: 'Installed CLI Output Contract',
			description: 'Read a generated, self-contained CLI JSON envelope schema.',
			mimeType: JSON_MIME_TYPE,
		},
		(uri, variables) => installedDocument(uri, `cli/${decodeTemplateVariable(variables.command)}`),
	);
	server.registerResource(
		'openfairygui_diagnostic_guide',
		new ResourceTemplate(BACKEND_DIAGNOSTIC_TEMPLATE, { list: undefined }),
		{
			title: 'Diagnostic Recovery Guide',
			description: 'Read the recovery boundary for one stable diagnostic code.',
			mimeType: JSON_MIME_TYPE,
		},
		(uri, variables) =>
			runResourceRead(() => jsonResource(uri, getBackendDiagnosticGuide(decodeTemplateVariable(variables.code)))),
	);
	server.registerResource(
		'openfairygui_operation_catalog',
		OPENFAIRYGUI_OPERATION_CATALOG_URI,
		{
			title: 'UAM Operation Catalog',
			description: 'Discover current operations and their generated JSON schemas.',
			mimeType: JSON_MIME_TYPE,
		},
		(uri) => runResourceRead(() => jsonResource(uri, getOpenFairyGuiOperationCatalog())),
	);
	server.registerResource(
		'openfairygui_operation_schema',
		new ResourceTemplate(OPENFAIRYGUI_OPERATION_SCHEMA_TEMPLATE, { list: undefined }),
		{
			title: 'UAM Operation Schema',
			description:
				'Read the precise Core-derived JSON wire schema for one operation. Structure is not semantic preflight.',
			mimeType: JSON_MIME_TYPE,
		},
		(uri, variables) =>
			runResourceRead(() =>
				jsonResource(uri, getOpenFairyGuiOperationSchema(decodeTemplateVariable(variables.kind))),
			),
	);
	server.registerResource(
		'openfairygui_backend_capabilities',
		OPENFAIRYGUI_BACKEND_CAPABILITIES_RESOURCE_URI,
		{
			title: 'OpenFairyGUI Backend Capabilities',
			description: 'Read the backend capability and version envelope as JSON.',
			mimeType: JSON_MIME_TYPE,
		},
		(uri: URL) => runResourceRead(() => jsonResource(uri, runtime.getCapabilities())),
	);

	server.registerResource(
		'openfairygui_backend_session',
		new ResourceTemplate('openfairygui://backend/session/{sessionId}', { list: undefined }),
		{
			title: 'OpenFairyGUI Backend Session Snapshot',
			description: 'Read a backend session envelope by backend-local session id.',
			mimeType: JSON_MIME_TYPE,
		},
		(uri: URL, variables) =>
			runResourceRead(() =>
				jsonResource(
					uri,
					runtime.getSession({
						sessionId: decodeTemplateVariable(variables.sessionId),
					}),
					true,
				),
			),
	);

	server.registerResource(
		'openfairygui_backend_project_outline',
		new ResourceTemplate('openfairygui://backend/session/{sessionId}/outline', { list: undefined }),
		{
			title: 'OpenFairyGUI Project Outline',
			description:
				'Read a revision-bound project identity outline without source bytes or full property payloads.',
			mimeType: JSON_MIME_TYPE,
		},
		(uri: URL, variables) =>
			runResourceRead(() =>
				jsonResource(
					uri,
					runtime.getProjectOutline({
						sessionId: decodeTemplateVariable(variables.sessionId),
					}),
					true,
				),
			),
	);

	server.registerResource(
		'openfairygui_backend_cache',
		new ResourceTemplate('openfairygui://backend/cache/{sessionId}', { list: undefined }),
		{
			title: 'OpenFairyGUI Backend Cache Snapshot',
			description: 'Read a derived backend cache envelope by backend-local session id.',
			mimeType: JSON_MIME_TYPE,
		},
		(uri: URL, variables) =>
			runResourceRead(() =>
				jsonResource(
					uri,
					runtime.getCacheSnapshot({
						sessionId: decodeTemplateVariable(variables.sessionId),
					}),
					true,
				),
			),
	);
}
