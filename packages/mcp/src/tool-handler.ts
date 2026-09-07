import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
	BACKEND_CAPABILITY_SCHEMA_VERSION,
	BACKEND_CONTRACT_VERSION,
	type BackendRuntime,
	type BackendMethodName,
} from '@openfairygui/backend';
import {
	isOpenFairyGuiMcpPayloadWithinBudget,
	OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS,
	type OpenFairyGuiBackendToolName,
} from './tool-definitions.js';

import { decodeToolBytes, CONTRACT_SNAPSHOT } from './contract-schema.js';
import type { McpUnhandledFailure, McpResponseBudgetFailure } from './tool-metadata.js';

export type OpenFairyGuiBackendRuntime = Pick<BackendRuntime, BackendMethodName>;

function jsonResult(payload: unknown, isError = false, compact = false): CallToolResult {
	const text = JSON.stringify(payload, (_key, value) => value instanceof Uint8Array ? [...value] : value, compact ? undefined : 2);
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

function unhandledBackendFailure(startedAt: number): McpUnhandledFailure {
	return {
		ok: false,
		meta: {
			requestId: crypto.randomUUID(),
			durationMs: Math.max(0, Date.now() - startedAt),
			warnings: [],
			diagnostics: [],
			stage: 'runtime',
			contractVersion: BACKEND_CONTRACT_VERSION,
			capabilitySchemaVersion: BACKEND_CAPABILITY_SCHEMA_VERSION,
		},
		error: {
			code: 'backend_unhandled_error',
			message: 'Backend tool execution failed.',
		},
	};
}

export async function callOpenFairyGuiBackendTool(
	runtime: OpenFairyGuiBackendRuntime,
	name: OpenFairyGuiBackendToolName,
	input: Record<string, unknown>,
): Promise<CallToolResult> {
	if (!isOpenFairyGuiMcpPayloadWithinBudget(input)) {
		throw new RangeError('MCP input exceeds the depth, node, key, string, or byte budget.');
	}
	const definition = OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS.find((entry) => entry.name === name);
	if (!definition) throw new RangeError(`Unknown OpenFairyGUI backend MCP tool: ${name}`);
	const parsed = definition.inputSchema.parse(input) as Record<string, unknown>;
	const decoded = decodeToolBytes(parsed, CONTRACT_SNAPSHOT.tools[definition.backendMethod].bytePaths);
	const startedAt = Date.now();
	try {
		const result = await Reflect.apply(runtime[definition.backendMethod], runtime, definition.backendMethod === 'getCapabilities' ? [] : [decoded]);
		let response = jsonResult(result, isBackendFailure(result), definition.maxResponseBytes !== undefined);
		if (definition.maxResponseBytes !== undefined && new TextEncoder().encode(JSON.stringify(response)).byteLength > definition.maxResponseBytes) {
			response = jsonResult({
				...unhandledBackendFailure(startedAt),
				error: { code: 'mcp_response_budget_exceeded', message: 'The complete MCP tool response exceeds its byte limit.', maxBytes: definition.maxResponseBytes },
			} satisfies McpResponseBudgetFailure, true);
		}
		definition.outputSchema.parse(response.structuredContent);
		return response;
	} catch {
		return jsonResult(unhandledBackendFailure(startedAt), true);
	}
}
