import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BackendRuntime } from '@openfairygui/backend';
import { registerOpenFairyGuiBackendPrompts } from './prompt-definitions.js';
import { registerOpenFairyGuiBackendResources } from './resource-definitions.js';
import { callOpenFairyGuiBackendTool } from './tool-handler.js';
import {
	OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS,
	type OpenFairyGuiBackendToolName,
} from './tool-definitions.js';

const PACKAGE_VERSION = process.env.npm_package_version ?? '0.2.0-alpha.0';

export interface CreateOpenFairyGuiMcpServerOptions {
	runtime?: BackendRuntime;
	name?: string;
	version?: string;
}

export function createOpenFairyGuiMcpServer(options: CreateOpenFairyGuiMcpServerOptions = {}): McpServer {
	const runtime = options.runtime ?? new BackendRuntime();
	const server = new McpServer({
		name: options.name ?? 'openfairygui-mcp',
		version: options.version ?? PACKAGE_VERSION,
	});

	for (const definition of OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS) {
		server.registerTool(
			definition.name,
			{
				title: definition.title,
				description: definition.description,
				inputSchema: definition.inputSchema,
				outputSchema: definition.outputSchema,
				annotations: definition.annotations,
				_meta: {
					'openfairygui/backendMethod': definition.backendMethod,
					'openfairygui/adapter': 'thin-backend-p2',
				},
			},
			async (args) => callOpenFairyGuiBackendTool(runtime, definition.name as OpenFairyGuiBackendToolName, args as Record<string, unknown>),
		);
	}

	registerOpenFairyGuiBackendResources(server, runtime);
	registerOpenFairyGuiBackendPrompts(server);

	return server;
}
