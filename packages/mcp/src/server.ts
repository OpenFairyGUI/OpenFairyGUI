import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createNodeBackendRuntime } from '@openfairygui/backend/node';
import { createRequire } from 'node:module';
import { registerOpenFairyGuiBackendPrompts } from './prompt-definitions.js';
import { registerOpenFairyGuiBackendResources } from './resource-definitions.js';
import { callOpenFairyGuiBackendTool, type OpenFairyGuiBackendRuntime } from './tool-handler.js';
import {
	OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS,
	type OpenFairyGuiBackendToolName,
} from './tool-definitions.js';

const require = createRequire(import.meta.url);
declare const __OPENFAIRYGUI_PACKAGE_VERSION__: string | undefined;

function getInjectedPackageVersion(): string | null {
	const version = typeof __OPENFAIRYGUI_PACKAGE_VERSION__ === 'string' ? __OPENFAIRYGUI_PACKAGE_VERSION__ : null;
	return typeof version === 'string' && version.length > 0 ? version : null;
}

function readPackageVersion(): string {
	const injectedVersion = getInjectedPackageVersion();
	if (injectedVersion) return injectedVersion;
	try {
		const pkg = require('../package.json') as { version?: unknown };
		if (typeof pkg.version === 'string' && pkg.version.length > 0) {
			return pkg.version;
		}
	} catch {
		// Keep the MCP server usable when executed from a bundled artifact missing package.json.
	}
	return '0.0.0-dev';
}

const PACKAGE_VERSION = readPackageVersion();

export interface CreateOpenFairyGuiMcpServerOptions {
	runtime?: OpenFairyGuiBackendRuntime;
	name?: string;
	version?: string;
}

export function createOpenFairyGuiMcpServer(options: CreateOpenFairyGuiMcpServerOptions = {}): McpServer {
	const runtime = options.runtime ?? createNodeBackendRuntime();
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
			async (args: Record<string, unknown>) => callOpenFairyGuiBackendTool(runtime, definition.name as OpenFairyGuiBackendToolName, args),
		);
	}

	registerOpenFairyGuiBackendResources(server, runtime);
	registerOpenFairyGuiBackendPrompts(server);

	return server;
}
