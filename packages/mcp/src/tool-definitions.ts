import type { z } from 'zod';
import type { BackendMethodName } from '@openfairygui/backend';
import { contractObjectSchema } from './contract-schema.js';
import { CONTRACT_SNAPSHOT } from './generated/contracts.js';
import { OPENFAIRYGUI_BACKEND_TOOL_METADATA, type BackendToolMetadata } from './tool-metadata.js';

export const OPENFAIRYGUI_BACKEND_TOOL_PREFIX = 'openfairygui_backend_';
export type { BackendMethodName };
export type OpenFairyGuiBackendToolName = typeof OPENFAIRYGUI_BACKEND_TOOL_METADATA[number]['name'];
export const OPENFAIRYGUI_BACKEND_TOOL_NAMES = OPENFAIRYGUI_BACKEND_TOOL_METADATA.map((entry) => entry.name);

export interface OpenFairyGuiBackendToolDefinition extends BackendToolMetadata {
	name: OpenFairyGuiBackendToolName;
	inputSchema: z.ZodObject;
	outputSchema: z.ZodObject;
}

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

export const OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS: readonly OpenFairyGuiBackendToolDefinition[] =
	OPENFAIRYGUI_BACKEND_TOOL_METADATA.map((metadata) => {
		const contract = CONTRACT_SNAPSHOT.tools[metadata.backendMethod];
		return {
			...metadata,
			inputSchema: contractObjectSchema(contract.input),
			outputSchema: contractObjectSchema(contract.output),
		};
	});
