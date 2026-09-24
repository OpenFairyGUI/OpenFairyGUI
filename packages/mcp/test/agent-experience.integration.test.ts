import test from 'ava';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BackendRuntime } from '@openfairygui/backend';
import { z } from 'zod';
import { createOpenFairyGuiMcpServer } from '../src/server.js';
import { compactToolSchema } from '../src/contract-schema.js';

test('tool-only clients receive workflow guidance and installed docs; publish requires host injection', async (t) => {
	for (const enabled of [false, true]) {
		let calls = 0;
		const server = createOpenFairyGuiMcpServer({
			runtime: new BackendRuntime(),
			...(enabled
				? {
						publish: async () => {
							calls++;
							return { content: [{ type: 'text' as const, text: 'host result' }] };
						},
					}
				: {}),
		});
		const client = new Client({ name: 'agent-experience', version: 'test' });
		const [a, b] = InMemoryTransport.createLinkedPair();
		await Promise.all([client.connect(a), server.connect(b)]);
		try {
			t.true(client.getInstructions()!.includes('stale_write'));
			t.is(
				(await client.listTools()).tools.some((tool) => tool.name === 'openfairygui_host_publish'),
				enabled,
			);
			const docs = await client.callTool({ name: 'openfairygui_docs_read', arguments: { id: 'index' } });
			t.false(Boolean(docs.isError));
			t.true(JSON.stringify(docs.content).includes('workflow'));
			const bad = await client.callTool({ name: 'openfairygui_docs_read', arguments: { id: '../secret' } });
			t.true(bad.isError);
			if (enabled) {
				await client.callTool({
					name: 'openfairygui_host_publish',
					arguments: { projectPath: '/project', outputDirectory: '/output' },
				});
				t.is(calls, 1);
			}
		} finally {
			await client.close();
			await server.close();
		}
	}
});

test('input budget is checked before compiling or recursively parsing the contract', (t) => {
	let compiled = false;
	const schema = compactToolSchema(
		() => {
			compiled = true;
			return z.object({});
		},
		'input',
		() => false,
	);
	t.false(schema.safeParse({ nested: { ignored: true } }).success);
	t.false(compiled);
});
