import assert from 'node:assert/strict';
import test from 'ava';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BackendRuntime, type BackendEntitySnapshot, type BackendResult } from '@openfairygui/backend';
import { createOpenFairyGuiMcpServer } from '../src/index.js';
import { createMcpFixtureProject } from './helpers.js';

test('MCP exposes the generated read-only entity query and returns actual revision-bound properties', async (t) => {
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({ project: createMcpFixtureProject() });
	assert(opened.ok);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const server = createOpenFairyGuiMcpServer({ runtime });
	const client = new Client({ name: 'safe-editing', version: 'test' });
	await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
	try {
		const tools = await client.listTools();
		const tool = tools.tools.find((entry) => entry.name === 'openfairygui_backend_query_entity');
		t.true(tool?.annotations?.readOnlyHint);
		const result = await client.callTool({ name: 'openfairygui_backend_query_entity', arguments: {
			sessionId: opened.data.sessionId,
			target: { kind: 'displayNode', selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' } },
		} });
		t.false(result.isError);
		const structured = result.structuredContent as { backendResult: BackendResult<BackendEntitySnapshot> };
		assert(structured.backendResult.ok);
		const snapshot = structured.backendResult.data;
		t.is(snapshot.revision, opened.data.revision);
		assert(snapshot.entity.kind === 'displayNode' && snapshot.entity.properties.kind === 'text');
		t.is(typeof snapshot.entity.properties.text, 'string');
		const invalid = await client.callTool({ name: 'openfairygui_backend_query_entity', arguments: {
			sessionId: opened.data.sessionId, target: { kind: 'resource', selector: { packageId: 'pkg001' } },
		} });
		t.true(invalid.isError);
	} finally {
		await client.close(); await server.close(); await runtime.closeSession({ sessionId: opened.data.sessionId });
	}
});
