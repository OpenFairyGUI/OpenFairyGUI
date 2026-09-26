import test from 'ava';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BackendRuntime } from '@openfairygui/backend';
import { z } from 'zod';
import { createOpenFairyGuiMcpServer, OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS } from '../src/index.js';
import { compactToolSchema } from '../src/contract-schema.js';

test('server startup defers schemas; calls load one tool and discovery caches all wire schemas', async (t) => {
	const accessed = new Set<string>();
	let reads = 0;
	for (const definition of OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS) {
		for (const field of ['inputSchema', 'outputSchema'] as const) {
			const descriptor = Object.getOwnPropertyDescriptor(definition, field)!;
			t.is(typeof descriptor.get, 'function');
			Object.defineProperty(definition, field, {
				...descriptor,
				get() {
					reads++;
					accessed.add(`${definition.backendMethod}.${field}`);
					return descriptor.get!.call(definition);
				},
			});
			t.teardown(() => Object.defineProperty(definition, field, descriptor));
		}
	}
	const server = createOpenFairyGuiMcpServer({
		runtime: new BackendRuntime(),
		toolPolicies: {
			openfairygui_backend_get_session: {
				failureSchema: z.object({ ok: z.literal(false), reason: z.literal('host_denied') }),
				beforeCall: () => ({ ok: false, reason: 'host_denied' }),
			},
		},
	});
	t.is(reads, 0, 'Registration, including Host policy composition, must not compile contracts');
	const client = new Client({ name: 'lazy-schema', version: 'test' });
	const [ct, st] = InMemoryTransport.createLinkedPair();
	await Promise.all([client.connect(ct), server.connect(st)]);
	try {
		t.is(reads, 0, 'Initialize must not compile contracts');
		const result = await client.callTool({ name: 'openfairygui_backend_get_capabilities', arguments: {} });
		t.false(result.isError);
		t.deepEqual([...accessed].sort(), ['getCapabilities.inputSchema', 'getCapabilities.outputSchema']);
		const first = await client.listTools();
		t.is(first.tools.length, 18);
		t.is(accessed.size, 34);
		const afterDiscovery = reads;
		t.deepEqual(await client.listTools(), first);
		t.is(reads, afterDiscovery, 'Repeated discovery must reuse converted wire schemas');
		for (const definition of OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS) {
			t.is(definition.inputSchema, definition.inputSchema);
			t.is(definition.outputSchema, definition.outputSchema);
		}
	} finally {
		await client.close();
		await server.close();
	}
});

test('lazy discovery metadata preserves strict validation before and after enumeration', (t) => {
	let reads = 0;
	const schema = compactToolSchema(() => {
		reads++;
		return z.strictObject({ value: z.number().int().nonnegative() });
	}, 'input');
	t.is(reads, 0);
	t.false(schema.safeParse({ value: -1 }).success);
	t.is(reads, 1);
	const wire = z.toJSONSchema(schema, { target: 'draft-07' });
	t.is(reads, 2);
	t.deepEqual(z.toJSONSchema(schema, { target: 'draft-07' }), wire);
	t.is(reads, 2);
	t.false(schema.safeParse({ value: 1, extra: true }).success);
	t.true(schema.safeParse({ value: 1 }).success);
});
