import assert from 'node:assert/strict';
import test from 'ava';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { BackendEntitySnapshot, BackendResult, BackendTransactionPreview, BackendSessionSnapshot } from '@openfairygui/backend';
import { createNodeBackendRuntime } from '@openfairygui/backend/node';
import { composeController, composeTransition, materializeUamProject, liftDocumentToUamProject, readProjectAsUam, writeProjectFromUam } from '@openfairygui/core';
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

test('MCP complex queries validate formal selectors and round-trip full snapshots without losing untouched data', async (t) => {
	const fixture = await createTempMcpProject();
	const io = new NodeIO();
	const doc = materializeUamProject(await readProjectAsUam(io, fixture.fairyPath));
	const component = doc.getRoot().getPackage('Main')!.getResourceById('cmp001');
	assert(component && 'addController' in component);
	composeController(doc, component, { name: 'state', pages: [{ id: '0', name: 'Idle', remark: 'Preserve me' }, { id: '1', name: 'Active' }],
		actions: [{ actionType: 0, fromPage: ['0'], toPage: ['1'], transitionName: 'intro' }],
	});
	composeTransition(doc, component, { name: 'intro', items: [{ name: 'move', time: 0, actionType: 0, target: 'n1', tween: true, duration: 12, startValue: [16, 18], endValue: [96, 48] }] });
	composeTransition(doc, component, { name: 'outro' });
	await writeProjectFromUam(io, liftDocumentToUamProject(doc), fixture.fairyPath);
	const expected = await readProjectAsUam(io, fixture.fairyPath);
	const runtime = createNodeBackendRuntime();
	const opened = await runtime.openSession({ projectPath: fixture.fairyPath });
	assert(opened.ok);
	const sessionId = opened.data.sessionId;
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const server = createOpenFairyGuiMcpServer({ runtime });
	const client = new Client({ name: 'complex-editing', version: 'test' });
	await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
	try {
		await client.listTools(); // The SDK validates actual output against the advertised schema.
		for (const kind of ['controller', 'transition'] as const) {
			const key = kind === 'controller' ? 'controllerName' : 'transitionName';
			const target = { kind, selector: { packageId: 'pkg001', componentResourceId: 'cmp001', [key]: kind === 'controller' ? 'state' : 'intro' } };
			const result = await client.callTool({ name: 'openfairygui_backend_query_entity', arguments: { sessionId, target } });
			t.false(result.isError);
			const queried = (result.structuredContent as { backendResult: BackendResult<BackendEntitySnapshot> }).backendResult;
			assert(queried.ok);
			const expectedComponent = expected.packages[0].resources.find((entry) => entry.id === 'cmp001');
			assert(expectedComponent?.kind === 'component');
			let operation;
			if (queried.data.entity.kind === 'controller') {
				t.deepEqual(queried.data.entity.properties, expectedComponent.component.controllers[0]);
				queried.data.entity.properties.pages[1].name = 'Ready';
				expectedComponent.component.controllers[0].pages[1].name = 'Ready';
				operation = { kind: 'updateController', selector: target.selector, controller: queried.data.entity.properties };
			} else {
				assert(queried.data.entity.kind === 'transition');
				t.deepEqual(queried.data.entity.properties, expectedComponent.component.transitions[0]);
				queried.data.entity.properties.items[0].duration = 18;
				queried.data.entity.properties.items[0].endValue = [120, 64];
				expectedComponent.component.transitions[0].items[0].duration = 18;
				expectedComponent.component.transitions[0].items[0].endValue = ['120', '64']; // Current XML reader's CSV representation.
				operation = { kind: 'updateTransition', selector: target.selector, transition: queried.data.entity.properties };
			}
			const before = runtime.getSession({ sessionId });
			assert(before.ok);
			for (const selector of [{ packageId: 'pkg001', componentResourceId: 'cmp001' }, { ...target.selector, [key]: '' }, { ...target.selector, [key]: 'x'.repeat(257) }, { ...target.selector, inventedId: 'x' }]) {
				t.true((await client.callTool({ name: 'openfairygui_backend_query_entity', arguments: { sessionId, target: { kind, selector } } })).isError);
			}
			const absent = await client.callTool({ name: 'openfairygui_backend_query_entity', arguments: { sessionId, target: { kind, selector: { ...target.selector, [key]: 'absent' } } } });
			const failure = (absent.structuredContent as { backendResult: BackendResult<BackendEntitySnapshot> }).backendResult;
			assert(!failure.ok && failure.error.code === 'entity_query_failed'); t.is(failure.error.reason, 'not_found');
			const after = runtime.getSession({ sessionId }); assert(after.ok); t.deepEqual(after.data, before.data);
			const transaction = { sessionId, expectedRevision: queried.data.revision, operations: [operation] };
			t.false((await client.callTool({ name: 'openfairygui_backend_preflight_transaction', arguments: transaction })).isError);
			t.false((await client.callTool({ name: 'openfairygui_backend_apply_transaction', arguments: transaction })).isError);
			t.true((await client.callTool({ name: 'openfairygui_backend_apply_transaction', arguments: transaction })).isError);
		}
		t.false((await client.callTool({ name: 'openfairygui_backend_save_session', arguments: { sessionId, expectedRevision: 2 } })).isError);
		t.deepEqual(await readProjectAsUam(io, fixture.fairyPath), expected);
	} finally {
		await client.close(); await server.close(); await runtime.closeSession({ sessionId }); await fixture.cleanup();
	}
});
