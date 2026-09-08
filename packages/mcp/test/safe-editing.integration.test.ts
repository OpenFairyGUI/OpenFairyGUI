import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'ava';
import sharp from 'sharp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BackendRuntime, type BackendEntitySnapshot, type BackendResult, type BackendTransactionPreview, type BackendSessionSnapshot, type BackendSessionStateSnapshot } from '@openfairygui/backend';
import { createNodeBackendRuntime } from '@openfairygui/backend/node';
import { composeController, composeTransition, materializeUamProject, liftDocumentToUamProject, readProjectAsUam, writeProjectFromUam } from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';
import { getFixturePath } from '@openfairygui/test-utils';
import { isOpenFairyGuiMcpPayloadWithinBudget } from '../src/tool-definitions.js';
import { createOpenFairyGuiMcpServer, callOpenFairyGuiBackendTool, OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS } from '../src/index.js';
import { createTempMcpProject, createMcpFixtureProject } from './helpers.js';

test('MCP round-trips a real image above the generic array budget through read, preview and apply', async (t) => {
	const project = createMcpFixtureProject();
	const sourceBytes = new Uint8Array(await fs.readFile(getFixturePath('FairyGUI-unity', 'UIProject', 'assets', 'VirtualList', '8.png')));
	t.true(sourceBytes.length > 10_000);
	const image = project.packages[0].resources[0]; assert(image.kind === 'image'); image.sourceBytes = sourceBytes;
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({ project }); assert(opened.ok);
	const sessionId = opened.data.sessionId, selector = { packageId: 'pkg001', resourceId: 'img001' };
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const server = createOpenFairyGuiMcpServer({ runtime });
	const client = new Client({ name: 'image-roundtrip', version: 'test' });
	await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
	try {
		await client.listTools();
		const read = await client.callTool({ name: 'openfairygui_backend_read_resource_bytes', arguments: { sessionId, expectedRevision: 0, selector } });
		t.false(read.isError);
		const wireBytes = (read.structuredContent as { backendResult: { data: { sourceBytes: number[] } } }).backendResult.data.sourceBytes;
		t.deepEqual(wireBytes, [...sourceBytes]);
		const input = { sessionId, expectedRevision: 0, operations: [{ kind: 'replaceResourceBytes', selector, sourceBytes: wireBytes }] };
		for (const method of ['preflight_transaction', 'apply_transaction']) {
			const result = await client.callTool({ name: `openfairygui_backend_${method}`, arguments: input });
			t.false(result.isError, JSON.stringify(result));
		}
		const current = runtime.readResourceBytes({ sessionId, expectedRevision: 1, selector }); assert(current.ok);
		t.deepEqual(current.data.sourceBytes, sourceBytes);
	} finally { await runtime.closeSession({ sessionId }); await client.close(); await server.close(); }
});

test('MCP byte allowances are schema-scoped, integer-only and bounded in aggregate', (t) => {
	const bytePaths = [['operations', '*', 'sourceBytes']];
	const payload = (bytes: unknown) => ({ operations: [{ sourceBytes: bytes }] });
	t.true(isOpenFairyGuiMcpPayloadWithinBudget(payload(Array(100_001).fill(255)), bytePaths));
	t.false(isOpenFairyGuiMcpPayloadWithinBudget(payload(Array(10_001).fill(0))));
	t.false(isOpenFairyGuiMcpPayloadWithinBudget({ metadata: { sourceBytes: Array(10_001).fill(0) } }, bytePaths));
	for (const value of [-1, 256, 0.5, NaN, '1']) t.false(isOpenFairyGuiMcpPayloadWithinBudget(payload([value]), bytePaths));
	t.false(isOpenFairyGuiMcpPayloadWithinBudget(payload(new Array(8 * 1024 * 1024 + 1)), bytePaths));
	t.false(isOpenFairyGuiMcpPayloadWithinBudget({ operations: [
		{ sourceBytes: new Uint8Array(5 * 1024 * 1024) }, { sourceBytes: new Uint8Array(5 * 1024 * 1024) },
	] }, bytePaths));
});

test('MCP session reads expose current unsaved state and primary bytes at one revision', async (t) => {
	const fixture = await createTempMcpProject();
	const project = createMcpFixtureProject();
	const image = project.packages[0].resources[0]; assert(image.kind === 'image');
	image.sourceBytes = new Uint8Array(await sharp({ create: { width: 320, height: 180, channels: 4, background: '#123456' } }).png().toBuffer());
	project.settings.publish = Object.assign({ compressDesc: false }, { include2x: true });
	project.settings.customProperties = { extension: { sourceBytes: [7, 8] } };
	await writeProjectFromUam(new NodeIO(), project, fixture.fairyPath);
	const runtime = createNodeBackendRuntime({ allowedProjectRoots: [fixture.rootDir] });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const server = createOpenFairyGuiMcpServer({ runtime });
	const client = new Client({ name: 'session-state-reader', version: 'test' });
	await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
	let sessionId: string | undefined;
	try {
		const { tools } = await client.listTools();
		for (const name of ['read_session_state', 'read_resource_bytes']) {
			const tool = tools.find((entry) => entry.name === `openfairygui_backend_${name}`);
			assert(tool); t.true(tool.annotations?.readOnlyHint); t.true(tool.annotations?.idempotentHint);
		}
		const opened = await runtime.openSession({ projectPath: fixture.fairyPath }); assert(opened.ok);
		sessionId = opened.data.sessionId;
		const before = runtime.readSessionState({ sessionId }); assert(before.ok);
		const applied = await runtime.applyTransaction({ sessionId, expectedRevision: before.data.revision, operations: [
			{ kind: 'setDisplayNodeProps', selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' }, props: { text: 'Read before save' } },
		] }); assert(applied.ok);
		const result = await client.callTool({ name: 'openfairygui_backend_read_session_state', arguments: { sessionId } });
		t.false(result.isError);
		const backend = (result.structuredContent as { backendResult: BackendResult<BackendSessionStateSnapshot> }).backendResult;
		assert(backend.ok); t.is(backend.data.revision, 1); t.true(backend.data.dirty); t.is(backend.data.lastSavedRevision, 0);
		const native = runtime.readSessionState({ sessionId, expectedRevision: 1 }); assert(native.ok);
		t.deepEqual(backend.data, JSON.parse(JSON.stringify(native.data)));
		t.deepEqual(backend.data.project.settings.customProperties, project.settings.customProperties);
		t.true((backend.data.project.settings.publish as Record<string, unknown>).include2x);
		const definition = OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS.find((entry) => entry.backendMethod === 'readSessionState')!;
		const invalid = structuredClone(backend);
		Object.assign(invalid.data.project.packages[0].resources.find((entry) => entry.kind === 'image')!, { sourceBytes: [1, 2] });
		t.false(definition.outputSchema.safeParse({ backendResult: invalid }).success);
		const text = (result.content as Array<{ type: string; text: string }>)[0]; assert(text.type === 'text'); t.deepEqual(JSON.parse(text.text), backend);
		const selector = { packageId: 'pkg001', resourceId: 'img001' };
		const bytes = await client.callTool({ name: 'openfairygui_backend_read_resource_bytes', arguments: { sessionId, expectedRevision: 1, selector } });
		t.false(bytes.isError);
		const source = runtime.readResourceBytes({ sessionId, expectedRevision: 1, selector }); assert(source.ok);
		t.deepEqual((bytes.structuredContent as { backendResult: { data: unknown } }).backendResult.data, { ...source.data, sourceBytes: [...source.data.sourceBytes] });
		for (const method of ['read_session_state', 'read_resource_bytes']) {
			const stale = await client.callTool({ name: `openfairygui_backend_${method}`, arguments: { sessionId, expectedRevision: 0, ...(method === 'read_resource_bytes' ? { selector } : {}) } });
			t.true(stale.isError); t.is((stale.structuredContent as { backendResult: { error: { code: string } } }).backendResult.error.code, 'stale_read');
		}
		t.true((await client.callTool({ name: 'openfairygui_backend_read_resource_bytes', arguments: { sessionId, selector } })).isError);
		const after = runtime.readSessionState({ sessionId }); assert(after.ok); t.deepEqual(after.data, native.data);
	} finally {
		if (sessionId) await runtime.closeSession({ sessionId });
		await client.close(); await server.close(); await fixture.cleanup();
	}
});

test('MCP bounds the full session-read response independently of Backend limits', async (t) => {
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({ project: createMcpFixtureProject() }); assert(opened.ok);
	const sessionId = opened.data.sessionId;
	try {
		const native = runtime.readSessionState({ sessionId }); assert(native.ok);
		// Simulate a Backend adapter exceeding the transport budget, including both response representations.
		native.data.project.settings.customProperties = { content: 'x'.repeat(9 * 1024 * 1024) };
		runtime.readSessionState = () => native;
		const result = await callOpenFairyGuiBackendTool(runtime, 'openfairygui_backend_read_session_state', { sessionId });
		t.true(result.isError);
		const definition = OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS.find((entry) => entry.backendMethod === 'readSessionState')!;
		assert(definition.maxResponseBytes !== undefined);
		t.notThrows(() => definition.outputSchema.parse(result.structuredContent));
		const error = (result.structuredContent as { backendResult: { error: { code: string; maxBytes: number } } }).backendResult.error;
		t.is(error.code, 'mcp_response_budget_exceeded'); t.is(error.maxBytes, definition.maxResponseBytes);
		t.true(Buffer.byteLength(JSON.stringify(result)) < 2000);
	} finally { await runtime.closeSession({ sessionId }); }
});

test('MCP reads complete project and package settings before editing only the requested fields', async (t) => {
	const fixture = await createTempMcpProject();
	const io = new NodeIO();
	const project = await readProjectAsUam(io, fixture.fairyPath);
	project.settings = {
		publish: { compressDesc: true, codeGeneration: { codePath: './generated', packageName: 'ui' } },
		common: { font: 'PreserveFont', fontSize: 18 },
		adaptation: { designResolutionX: 1280, designResolutionY: 720 },
		customProperties: { theme: { accents: ['blue', 'green'] } },
	};
	const pkg = project.packages[0];
	pkg.compressPNG = true; pkg.jpegQuality = 85;
	assert(pkg.publish);
	pkg.publish.atlases = [{ index: 0, name: 'main', compression: true }];
	await writeProjectFromUam(io, project, fixture.fairyPath);
	const expected = await readProjectAsUam(io, fixture.fairyPath);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const server = createOpenFairyGuiMcpServer({ allowedProjectRoots: [fixture.rootDir] });
	const client = new Client({ name: 'settings-editing', version: 'test' });
	await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
	let sessionId: string | undefined;
	async function call<T>(method: string, input: Record<string, unknown>): Promise<T> {
		const result = await client.callTool({ name: `openfairygui_backend_${method}`, arguments: input });
		t.false(result.isError, JSON.stringify(result));
		const backend = (result.structuredContent as { backendResult: BackendResult<T> }).backendResult;
		assert(backend.ok, JSON.stringify(backend));
		return backend.data;
	}
	try {
		await client.listTools(); // Validate responses against the advertised, generated wire schemas.
		const opened = await call<BackendSessionSnapshot>('open_session', { projectPath: fixture.fairyPath });
		sessionId = opened.sessionId;
		for (const target of [{ kind: 'project', selector: {} }, { kind: 'package', selector: {} }]) {
			t.true((await client.callTool({ name: 'openfairygui_backend_query_entity', arguments: { sessionId, target } })).isError);
		}
		const projectQuery = await call<BackendEntitySnapshot>('query_entity', { sessionId, target: { kind: 'project' } });
		const packageQuery = await call<BackendEntitySnapshot>('query_entity', { sessionId, target: { kind: 'package', selector: { packageId: pkg.id } } });
		assert(projectQuery.entity.kind === 'project' && packageQuery.entity.kind === 'package');
		t.deepEqual(projectQuery.entity.properties.settings, expected.settings);
		t.deepEqual(packageQuery.entity.properties.settings, {
			compressPNG: expected.packages[0].compressPNG, jpegQuality: expected.packages[0].jpegQuality, publish: expected.packages[0].publish,
		});
		assert(projectQuery.entity.properties.settings.common && expected.settings.common);
		projectQuery.entity.properties.settings.common.fontSize = 24;
		packageQuery.entity.properties.settings.jpegQuality = 90;
		expected.settings.common.fontSize = 24; expected.packages[0].jpegQuality = 90;
		const transaction = { sessionId, expectedRevision: projectQuery.revision, operations: [
			{ kind: 'updateProjectSettings', settings: projectQuery.entity.properties.settings },
			{ kind: 'updatePackageSettings', selector: { packageId: pkg.id }, settings: packageQuery.entity.properties.settings },
		] };
		const applied = await call<BackendSessionSnapshot>('apply_transaction', transaction);
		t.is(applied.revision, projectQuery.revision + 1);
		const projectAgain = await call<BackendEntitySnapshot>('query_entity', { sessionId, target: projectQuery.target });
		const packageAgain = await call<BackendEntitySnapshot>('query_entity', { sessionId, target: packageQuery.target });
		assert(projectAgain.entity.kind === 'project' && packageAgain.entity.kind === 'package');
		t.is(projectAgain.revision, applied.revision); t.is(packageAgain.revision, applied.revision);
		t.deepEqual(projectAgain.entity.properties.settings, expected.settings);
		t.deepEqual(packageAgain.entity.properties.settings, packageQuery.entity.properties.settings);
		const stale = await client.callTool({ name: 'openfairygui_backend_apply_transaction', arguments: transaction });
		t.true(stale.isError);
		t.is((stale.structuredContent as { backendResult: { error: { code: string } } }).backendResult.error.code, 'stale_write');
		await call('save_session', { sessionId, expectedRevision: applied.revision });
		t.deepEqual(await readProjectAsUam(io, fixture.fairyPath), expected);
	} finally {
		if (sessionId) await call('close_session', { sessionId });
		await client.close(); await server.close(); await fixture.cleanup();
	}
});

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
		t.is(preview.data.projectedRevision, snapshot.revision + 1);
		t.deepEqual(preview.data.impact.entities.find((entry) => entry.target.kind === 'displayNode' && entry.target.selector.displayNodeId === 'n1'),
			{ target: snapshot.target, change: 'updated', fields: ['text'] });
		t.deepEqual(preview.data.impact.files, [{ path: 'assets/Main/MainView.xml', kind: 'file', change: 'updated' }]);
		t.is(preview.data.persistence.nextAction, 'saveSession');
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
