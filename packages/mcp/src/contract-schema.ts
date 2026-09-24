import { z } from 'zod';
import { getInstalledContractSnapshot, type ContractSchema } from '@openfairygui/backend/docs';
export {
	getOpenFairyGuiOperationCatalog,
	getOpenFairyGuiOperationSchema,
	OPENFAIRYGUI_OPERATION_CATALOG_URI,
	OPENFAIRYGUI_OPERATION_SCHEMA_TEMPLATE,
} from '@openfairygui/backend/docs';

export const CONTRACT_SNAPSHOT = getInstalledContractSnapshot();

export function contractObjectSchema(schema: ContractSchema): z.ZodObject {
	const result = z.fromJSONSchema({ ...schema, $defs: CONTRACT_SNAPSHOT.$defs });
	if (!(result instanceof z.ZodObject)) throw new TypeError('Tool contract must be an object');
	return result;
}

/** Keep SDK discovery dynamic without expanding shared contract definitions. */
export function compactToolSchema(
	getSchema: () => z.ZodObject,
	io: 'input' | 'output',
	withinBudget?: (value: unknown) => boolean,
): z.ZodObject {
	// Zod metadata supplies the wire schema; validation still delegates to the original schema.
	// A separate object avoids Zod's cycle extraction overwriting the metadata's definitions.
	// Metadata is read/enumerated by SDK discovery, not tool registration. Defer both
	// contract compilation and JSON conversion until a tool is called or listed.
	let metadata: Record<string, unknown> | undefined;
	const getMetadata = () =>
		(metadata ??= { ...z.toJSONSchema(getSchema(), { target: 'draft-07', io, reused: 'ref' }) });
	const lazyMetadata = new Proxy(
		{},
		{
			get: (_target, key) => Reflect.get(getMetadata(), key),
			ownKeys: () => Reflect.ownKeys(getMetadata()),
			getOwnPropertyDescriptor: (_target, key) => Object.getOwnPropertyDescriptor(getMetadata(), key),
		},
	);
	return z
		.looseObject({})
		.superRefine((value, context) => {
			if (withinBudget && !withinBudget(value)) {
				context.addIssue({ code: 'custom', message: 'MCP input exceeds the payload budget.' });
				return;
			}
			const parsed = getSchema().safeParse(value);
			if (!parsed.success) for (const issue of parsed.error.issues) context.addIssue({ ...issue });
		})
		.meta(lazyMetadata);
}

export { decodeContractBytes as decodeToolBytes } from '@openfairygui/backend/docs';
