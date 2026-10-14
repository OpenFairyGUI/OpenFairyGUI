import { z } from 'zod';
import { getInstalledContractSnapshot, OPENFAIRYGUI_OPERATION_CATALOG_URI, OPENFAIRYGUI_OPERATION_SCHEMA_TEMPLATE, type ContractSchema } from '@openfairygui/backend/docs';
export { getOpenFairyGuiOperationCatalog, getOpenFairyGuiOperationSchema, OPENFAIRYGUI_OPERATION_CATALOG_URI, OPENFAIRYGUI_OPERATION_SCHEMA_TEMPLATE } from '@openfairygui/backend/docs';

export const CONTRACT_SNAPSHOT = getInstalledContractSnapshot();

export function contractObjectSchema(schema: ContractSchema): z.ZodObject {
	const result = z.fromJSONSchema({ ...schema, $defs: CONTRACT_SNAPSHOT.$defs });
	if (!(result instanceof z.ZodObject)) throw new TypeError('Tool contract must be an object');
	return result;
}

type ContractIssue = z.core.$ZodIssue;

function valueAt(value: unknown, path: readonly PropertyKey[]): unknown {
	return path.reduce<unknown>((node, key) => node !== null && typeof node === 'object' ? (node as Record<PropertyKey, unknown>)[key] : undefined, value);
}

/**
 * A union of `kind`-tagged objects fails with one nested issue list per branch.
 * Report only the branch selected by the input's kind, or the valid kinds when none matches;
 * other unions keep Zod's issue. Paths stay relative to `input`.
 */
export function focusContractIssues(issues: readonly ContractIssue[], input: unknown): ContractIssue[] {
	return issues.flatMap((issue): ContractIssue[] => {
		if (issue.code !== 'invalid_union' || issue.errors.length < 2) return [issue];
		const tags = issue.errors.map((branch) => branch.find((entry) => entry.code === 'invalid_value' && entry.path.length === 1 && entry.path[0] === 'kind'));
		const untagged = issue.errors.filter((_branch, index) => !tags[index]);
		// A non-object branch (for example null) has no kind to select by.
		if (untagged.length > 1 || untagged.some((branch) => branch.some((entry) => entry.code === 'invalid_type' && entry.path.length === 0))) return [issue];
		const target = valueAt(input, issue.path);
		const kind = valueAt(target, ['kind']);
		const kinds = tags.flatMap((tag) => tag?.code === 'invalid_value' ? tag.values : []);
		const operation = issue.errors.length === Object.keys(CONTRACT_SNAPSHOT.operations).length
			&& kinds.every((value) => typeof value === 'string' && Object.hasOwn(CONTRACT_SNAPSHOT.operations, value));
		if (untagged.length === 1) {
			const note = operation && typeof kind === 'string' ? ` (schema: ${OPENFAIRYGUI_OPERATION_CATALOG_URI}/${kind})` : '';
			return focusContractIssues(untagged[0], target).map((entry) => ({ ...entry, path: [...issue.path, ...entry.path], message: entry.message + note }));
		}
		const subject = operation ? 'operation kind' : 'kind';
		const found = kind === undefined ? `Missing ${subject}` : typeof kind === 'string' ? `Unknown ${subject} ${JSON.stringify(kind)}` : `Invalid ${subject} of type ${typeof kind}`;
		const help = operation ? `. Read ${OPENFAIRYGUI_OPERATION_SCHEMA_TEMPLATE} for one operation's fields` : '';
		return [{ code: 'invalid_value', values: kinds, path: [...issue.path, 'kind'], message: `${found}; expected one of: ${kinds.join(', ')}${help}` }];
	});
}

/** Keep SDK discovery dynamic without expanding shared contract definitions. */
export function compactToolSchema(schema: z.ZodObject, io: 'input' | 'output'): z.ZodObject {
	// Zod metadata supplies the wire schema; validation still delegates to the original schema.
	// A separate object avoids Zod's cycle extraction overwriting the metadata's definitions.
	return z.looseObject({}).superRefine((value, context) => {
		const parsed = schema.safeParse(value);
		if (!parsed.success) for (const issue of focusContractIssues(parsed.error.issues, value)) context.addIssue({ ...issue });
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
