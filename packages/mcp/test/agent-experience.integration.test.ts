import test from 'ava';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BackendRuntime } from '@openfairygui/backend';
import { z } from 'zod';
import { createOpenFairyGuiMcpServer } from '../src/server.js';
import { compactToolSchema } from '../src/contract-schema.js';
import { createMcpFixtureProject } from './helpers.js';

test('text-only error clients can identify missing source bytes without mutating the session', async (t) => {
	const runtime = new BackendRuntime();
	const project = createMcpFixtureProject();
	const resource = project.packages[0].resources[0];
	assert(resource.kind === 'image');
	delete resource.sourceBytes;
	const opened = runtime.openProjectSession({ project });
	assert(opened.ok);
	const sessionId = opened.data.sessionId;
	const before = runtime.readSessionState({ sessionId, expectedRevision: 0 });
	const server = createOpenFairyGuiMcpServer({ runtime });
	const client = new Client({ name: 'text-only-errors', version: 'test' });
	const [a, b] = InMemoryTransport.createLinkedPair();
	await Promise.all([client.connect(a), server.connect(b)]);
	try {
		const result = await client.callTool({
			name: 'openfairygui_backend_preflight_transaction',
			arguments: {
				sessionId,
				expectedRevision: 0,
				operations: [
					{
						kind: 'renameResource',
						selector: { packageId: 'pkg001', resourceId: resource.id },
						newName: 'Renamed',
					},
				],
			},
		});
		t.true(result.isError);
		const content = result.content as { type: string; text: string }[];
		const summary = JSON.parse(content[0].text);
		t.is(summary.error.code, 'transaction_unsupported');
		t.true(summary.diagnosticCodes.includes('unavailable_resource_source_bytes'));
		const after = runtime.readSessionState({ sessionId, expectedRevision: 0 });
		assert(before.ok && after.ok);
		t.deepEqual(after.data, before.data);
	} finally {
		await runtime.closeSession({ sessionId });
		await client.close();
		await server.close();
	}
});

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
