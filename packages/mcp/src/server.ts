import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ListToolsRequestSchema, ToolSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';
import { createNodeBackendRuntime } from '@openfairygui/backend/node';
import { createRequire } from 'node:module';
import { z } from 'zod';
import { registerOpenFairyGuiBackendPrompts } from './prompt-definitions.js';
import { registerOpenFairyGuiBackendResources } from './resource-definitions.js';
import { CONTRACT_SNAPSHOT } from './contract-schema.js';
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
	/** Filesystem roots exposed by the default Node backend runtime. Defaults to process.cwd(). */
	allowedProjectRoots?: readonly string[];
	name?: string;
	version?: string;
}

export function createOpenFairyGuiMcpServer(options: CreateOpenFairyGuiMcpServerOptions = {}): McpServer {
	const runtime = options.runtime ?? createNodeBackendRuntime({
		allowedProjectRoots: options.allowedProjectRoots ?? [process.cwd()],
	});
	const server = new McpServer({
		name: options.name ?? 'openfairygui-mcp',
		version: options.version ?? PACKAGE_VERSION,
	});

	const tools: Tool[] = [];
	for (const definition of OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS) {
		const metadata = {
			name: definition.name, title: definition.title, description: definition.description,
			annotations: definition.annotations,
			_meta: {
				'openfairygui/backendMethod': definition.backendMethod,
				'openfairygui/adapter': 'thin-backend-p2',
				'openfairygui/contractDigest': CONTRACT_SNAPSHOT.digest,
			},
		};
		server.registerTool(
			definition.name,
			{
				...metadata,
				inputSchema: definition.inputSchema,
				outputSchema: definition.outputSchema,
			},
			async (args: Record<string, unknown>) => callOpenFairyGuiBackendTool(runtime, definition.name as OpenFairyGuiBackendToolName, args),
		);
		tools.push(ToolSchema.parse({
			...metadata,
			inputSchema: z.toJSONSchema(definition.inputSchema, { target: 'draft-07', io: 'input', reused: 'ref' }),
			outputSchema: z.toJSONSchema(definition.outputSchema, { target: 'draft-07', io: 'output', reused: 'ref' }),
		}));
	}
	// The installed Backend catalog is fixed. Reuse local definitions in discovery only;
	// registered Zod schemas and the handler's structural/budget validation remain unchanged.
	server.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: structuredClone(tools) }));

	registerOpenFairyGuiBackendResources(server, runtime);
	registerOpenFairyGuiBackendPrompts(server);

	return server;
}
