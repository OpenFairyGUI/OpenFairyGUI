import { z } from 'zod';
import { getInstalledContractSnapshot, type ContractSchema } from '@openfairygui/backend/docs';
export { getOpenFairyGuiOperationCatalog, getOpenFairyGuiOperationSchema, OPENFAIRYGUI_OPERATION_CATALOG_URI, OPENFAIRYGUI_OPERATION_SCHEMA_TEMPLATE } from '@openfairygui/backend/docs';

export const CONTRACT_SNAPSHOT = getInstalledContractSnapshot();

export function contractObjectSchema(schema: ContractSchema): z.ZodObject {
	const result = z.fromJSONSchema({ ...schema, $defs: CONTRACT_SNAPSHOT.$defs });
	if (!(result instanceof z.ZodObject)) throw new TypeError('Tool contract must be an object');
	return result;
}

/** Keep SDK discovery dynamic without expanding shared contract definitions. */
export function compactToolSchema(schema: z.ZodObject, io: 'input' | 'output'): z.ZodObject {
	// Zod metadata supplies the wire schema; validation still delegates to the original schema.
	// A separate object avoids Zod's cycle extraction overwriting the metadata's definitions.
	return z.looseObject({}).superRefine((value, context) => {
		const parsed = schema.safeParse(value);
		if (!parsed.success) for (const issue of parsed.error.issues) context.addIssue({ ...issue });
	}).meta(z.toJSONSchema(schema, { target: 'draft-07', io, reused: 'ref' }));
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
