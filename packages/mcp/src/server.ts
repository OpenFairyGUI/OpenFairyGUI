import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createNodeBackendRuntime } from '@openfairygui/backend/node';
import { createRequire } from 'node:module';
import { z } from 'zod';
import { getInstalledDocumentationIndex, readInstalledDocumentation } from '@openfairygui/backend/docs';
import { isOpenFairyGuiMcpPayloadWithinBudget } from './tool-definitions.js';
import { registerOpenFairyGuiBackendPrompts } from './prompt-definitions.js';
import { registerOpenFairyGuiBackendResources } from './resource-definitions.js';
import { compactToolSchema, CONTRACT_SNAPSHOT } from './contract-schema.js';
import {
	callOpenFairyGuiBackendTool,
	type OpenFairyGuiBackendRuntime,
	type OpenFairyGuiMcpToolPolicy,
} from './tool-handler.js';
import { OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS, type OpenFairyGuiBackendToolName } from './tool-definitions.js';

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

export const DEFAULT_INSTRUCTIONS = [
	'Read openfairygui_docs_read with id index, then workflow and the needed operation/method documents.',
	'Open a project directory or .fairy file within the configured allowed roots.',
	'Read the project outline, then query exact entity IDs and their current revision.',
	'Preflight the operation batch with expectedRevision before applying it.',
	'Apply at that same revision; on stale_write re-query and reconsider, never retry blindly.',
	'Validate the edited session, save with its current revision, and close the session when finished.',
].join('\n');

export interface CreateOpenFairyGuiMcpServerOptions {
	/** Explicit host-owned publishing authority. Absent by default; host validates paths, permissions and plugin policy. */
	publish?: (input: {
		projectPath: string;
		outputDirectory: string;
		packageNames?: string[];
	}) => Promise<CallToolResult>;
	runtime?: OpenFairyGuiBackendRuntime;
	/** Filesystem roots exposed by the default Node backend runtime. Defaults to process.cwd(). */
	allowedProjectRoots?: readonly string[];
	name?: string;
	version?: string;
	/** Host guidance returned by the SDK initialize handshake. */
	instructions?: string;
	/** Per-tool Host failures do not change the canonical Backend contracts. */
	toolPolicies?: Partial<Record<OpenFairyGuiBackendToolName, OpenFairyGuiMcpToolPolicy>>;
}

export function createOpenFairyGuiMcpServer(options: CreateOpenFairyGuiMcpServerOptions = {}): McpServer {
	for (const name of Object.keys(options.toolPolicies ?? {})) {
		if (!OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS.some((definition) => definition.name === name)) {
			throw new RangeError(`Unknown OpenFairyGUI backend MCP tool policy: ${name}`);
		}
	}
	const runtime =
		options.runtime ??
		createNodeBackendRuntime({
			allowedProjectRoots: options.allowedProjectRoots ?? [process.cwd()],
		});
	const server = new McpServer(
		{
			name: options.name ?? 'openfairygui-mcp',
			version: options.version ?? PACKAGE_VERSION,
		},
		{ instructions: options.instructions ?? DEFAULT_INSTRUCTIONS },
	);

	for (const definition of OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS) {
		const policy = options.toolPolicies?.[definition.name];
		let outputSchema: z.ZodObject | undefined;
		const getOutputSchema = () =>
			(outputSchema ??= policy
				? definition.outputSchema.extend({
						backendResult: z.union([definition.outputSchema.shape.backendResult, policy.failureSchema]),
					})
				: definition.outputSchema);
		const metadata = {
			name: definition.name,
			title: definition.title,
			description: definition.description,
			annotations: definition.annotations,
			_meta: {
				'openfairygui/backendMethod': definition.backendMethod,
				'openfairygui/adapter': 'backend',
				'openfairygui/contractDigest': CONTRACT_SNAPSHOT.digest,
				...(policy ? { 'openfairygui/hostPolicy': true } : {}),
			},
		};
		server.registerTool(
			definition.name,
			{
				...metadata,
				inputSchema: compactToolSchema(
					() => definition.inputSchema,
					'input',
					(value) =>
						isOpenFairyGuiMcpPayloadWithinBudget(
							value,
							CONTRACT_SNAPSHOT.tools[definition.backendMethod].bytePaths,
						),
				),
				outputSchema: compactToolSchema(getOutputSchema, 'output'),
			},
			async (args: Record<string, unknown>) =>
				callOpenFairyGuiBackendTool(runtime, definition.name, args, policy),
		);
	}
	server.registerTool(
		'openfairygui_docs_read',
		{
			title: 'Read installed documentation',
			description:
				'Read index first, then an exact document ID from that index. Offline, read-only and bound to the installed version.',
			inputSchema: z.object({ id: z.string().min(1).max(256).default('index') }),
			_meta: { 'openfairygui/contractDigest': CONTRACT_SNAPSHOT.digest },
			annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
		},
		async ({ id }) => {
			try {
				return {
					content: [
						{
							type: 'text' as const,
							text:
								id === 'index'
									? JSON.stringify(getInstalledDocumentationIndex())
									: readInstalledDocumentation(id).text,
						},
					],
				};
			} catch {
				return {
					isError: true,
					content: [{ type: 'text' as const, text: 'Unknown document ID; read index for available IDs.' }],
				};
			}
		},
	);

	registerOpenFairyGuiBackendResources(server, runtime);
	if (options.publish) {
		server.registerTool(
			'openfairygui_host_publish',
			{
				title: 'Publish project through host',
				description:
					'Publish saved project files through an explicitly enabled host. Host owns path authorization, output policy and plugin execution; unsaved session edits are not included.',
				inputSchema: z.object({
					projectPath: z.string().min(1).max(4096),
					outputDirectory: z.string().min(1).max(4096),
					packageNames: z.array(z.string().min(1).max(256)).max(1000).optional(),
				}),
				annotations: {
					readOnlyHint: false,
					destructiveHint: true,
					idempotentHint: false,
					openWorldHint: false,
				},
			},
			options.publish,
		);
	}
	registerOpenFairyGuiBackendPrompts(server);

	return server;
}
