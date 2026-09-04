import assert from 'node:assert/strict';
import test from 'ava';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { BackendEntitySnapshot, BackendResult, BackendTransactionPreview, BackendSessionSnapshot } from '@openfairygui/backend';
import { createNodeBackendRuntime } from '@openfairygui/backend/node';
import { readProjectAsUam } from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';
import { createOpenFairyGuiMcpServer } from '../src/index.js';
import { createTempMcpProject } from './helpers.js';

test('MCP queries, previews, applies and saves with generated schemas and revision checks', async (t) => {
	const fixture = await createTempMcpProject();
	const runtime = createNodeBackendRuntime();
	const opened = await runtime.openSession({ projectPath: fixture.fairyPath });
	assert(opened.ok);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const server = createOpenFairyGuiMcpServer({ runtime });
	const client = new Client({ name: 'safe-editing', version: 'test' });
	await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
	try {
		const tools = await client.listTools();
		const tool = tools.tools.find((entry) => entry.name === 'openfairygui_backend_query_entity');
		t.true(tool?.annotations?.readOnlyHint);
		t.true(tools.tools.find((entry) => entry.name === 'openfairygui_backend_preflight_transaction')?.annotations?.readOnlyHint);
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
		const transaction = { sessionId: opened.data.sessionId, expectedRevision: snapshot.revision,
			operations: [{ kind: 'setDisplayNodeProps', selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' }, props: { text: 'MCP safe edit' } }],
		};
		const events = runtime.getEvents({ sessionId: opened.data.sessionId });
		const binaryPreview = await client.callTool({ name: 'openfairygui_backend_preflight_transaction', arguments: { ...transaction, operations: [
			{ kind: 'addResource', selector: { packageId: 'pkg001' }, resource: {
				kind: 'misc', id: 'preview-only', name: 'preview.bin', path: '/', file: 'preview.bin',
				exported: false, favorite: false, branch: '', branchItemIds: [], metadata: null, sourceBytes: [1, 2, 3],
			} },
		] } });
		t.false(binaryPreview.isError);
		const rejected = await client.callTool({ name: 'openfairygui_backend_preflight_transaction', arguments: { ...transaction, operations: [...transaction.operations,
			{ kind: 'removeController', selector: { packageId: 'pkg001', componentResourceId: 'cmp001', controllerName: 'missing' } },
		] } });
		t.true(rejected.isError);
		const failure = (rejected.structuredContent as { backendResult: BackendResult<BackendTransactionPreview> }).backendResult;
		assert(!failure.ok && failure.error.code === 'execution_failure');
		t.is(failure.error.stage, 'execution');
		t.true(failure.meta.diagnostics.length > 0);
		const previewed = await client.callTool({ name: 'openfairygui_backend_preflight_transaction', arguments: transaction });
		t.false(previewed.isError);
		const preview = (previewed.structuredContent as { backendResult: BackendResult<BackendTransactionPreview> }).backendResult;
		assert(preview.ok);
		t.is(preview.data.baseRevision, snapshot.revision);
		t.is(preview.data.mode, 'execute-and-discard');
		const eventsAfter = runtime.getEvents({ sessionId: opened.data.sessionId });
		assert(events.ok && eventsAfter.ok);
		t.deepEqual(eventsAfter.data, events.data);
		const unchanged = await client.callTool({ name: 'openfairygui_backend_query_entity', arguments: { sessionId: opened.data.sessionId, target: snapshot.target } });
		const unchangedResult = (unchanged.structuredContent as { backendResult: BackendResult<BackendEntitySnapshot> }).backendResult;
		assert(unchangedResult.ok); t.deepEqual(unchangedResult.data, snapshot);
		const applied = await client.callTool({ name: 'openfairygui_backend_apply_transaction', arguments: transaction });
		t.false(applied.isError);
		const changed = (applied.structuredContent as { backendResult: BackendResult<BackendSessionSnapshot> }).backendResult;
		assert(changed.ok);
		t.is(changed.data.revision, snapshot.revision + 1);
		const stale = await client.callTool({ name: 'openfairygui_backend_apply_transaction', arguments: transaction });
		t.true(stale.isError);
		t.is((stale.structuredContent as { backendResult: { error: { code: string } } }).backendResult.error.code, 'stale_write');
		const saved = await client.callTool({ name: 'openfairygui_backend_save_session', arguments: { sessionId: opened.data.sessionId, expectedRevision: changed.data.revision } });
		t.false(saved.isError);
		const reread = await readProjectAsUam(new NodeIO(), fixture.fairyPath);
		const component = reread.packages[0].resources.find((entry) => entry.id === 'cmp001');
		assert(component?.kind === 'component');
		const title = component.component.displayList.find((entry) => entry.id === 'n1');
		assert(title?.kind === 'text'); t.is(title.text, 'MCP safe edit');
	} finally {
		await client.close(); await server.close(); await runtime.closeSession({ sessionId: opened.data.sessionId });
		await fixture.cleanup();
	}
});
