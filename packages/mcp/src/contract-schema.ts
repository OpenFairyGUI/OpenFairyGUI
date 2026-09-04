import { z } from 'zod';
import type { BackendToolMetadata } from './tool-metadata.js';
import { CONTRACT_SNAPSHOT } from './generated/contracts.js';

export type ContractSchema = z.core.JSONSchema.JSONSchema;
export interface ContractSnapshot {
	digest: string;
	schemaVersion: number;
	versions: { BACKEND_CONTRACT_VERSION: string; BACKEND_CAPABILITY_SCHEMA_VERSION: number };
	operations: Record<string, ContractSchema>;
	tools: Record<string, BackendToolMetadata & { input: ContractSchema; output: ContractSchema; bytePaths: string[][] }>;
	$defs: Record<string, ContractSchema>;
}

export const OPENFAIRYGUI_OPERATION_CATALOG_URI = 'openfairygui://contracts/operations';
export const OPENFAIRYGUI_OPERATION_SCHEMA_TEMPLATE = `${OPENFAIRYGUI_OPERATION_CATALOG_URI}/{kind}`;

export function contractObjectSchema(schema: ContractSchema): z.ZodObject {
	const result = z.fromJSONSchema({ ...schema, $defs: CONTRACT_SNAPSHOT.$defs });
	if (!(result instanceof z.ZodObject)) throw new TypeError('Tool contract must be an object');
	return result;
}

/** Decode only generated Uint8Array locations; arbitrary JSON metadata is not rewritten. */
export function decodeToolBytes(input: Record<string, unknown>, paths: string[][]): Record<string, unknown> {
	if (!paths.length) return input;
	const result = structuredClone(input);
	function visit(value: unknown, parts: string[]): unknown {
		if (!parts.length) return value === null ? value : Uint8Array.from(value as number[]);
		if (!value || typeof value !== 'object') return value;
		const [key, ...rest] = parts;
		const record = value as Record<string, unknown>;
		for (const name of key === '*' ? Object.keys(record) : [key]) {
			if (Object.hasOwn(record, name)) record[name] = visit(record[name], rest);
		}
		return value;
	}
	for (const parts of paths) visit(result, parts);
	return result;
}

export function getOpenFairyGuiOperationCatalog() {
	return {
		digest: CONTRACT_SNAPSHOT.digest,
		schemaVersion: CONTRACT_SNAPSHOT.schemaVersion,
		...CONTRACT_SNAPSHOT.versions,
		operations: Object.keys(CONTRACT_SNAPSHOT.operations).map((kind) => ({ kind, schemaUri: `${OPENFAIRYGUI_OPERATION_CATALOG_URI}/${kind}` })),
	};
}

/** A self-contained schema with only the definitions reachable from this operation. */
export function getOpenFairyGuiOperationSchema(kind: string): ContractSchema {
	if (!Object.hasOwn(CONTRACT_SNAPSHOT.operations, kind)) throw new RangeError(`Unknown UAM operation: ${kind}`);
	const schema = CONTRACT_SNAPSHOT.operations[kind];
	const definitions: Record<string, ContractSchema> = {};
	function visit(value: unknown): void {
		if (!value || typeof value !== 'object') return;
		const ref = (value as ContractSchema).$ref;
		if (ref) {
			const key = ref.slice('#/$defs/'.length);
			if (Object.hasOwn(definitions, key)) return;
			definitions[key] = CONTRACT_SNAPSHOT.$defs[key];
			visit(definitions[key]);
		} else for (const child of Object.values(value)) visit(child);
	}
	visit(schema);
	return structuredClone({ $schema: 'https://json-schema.org/draft/2020-12/schema', ...schema, $defs: definitions });
}
