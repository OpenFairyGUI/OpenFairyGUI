import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'ava';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BackendRuntime } from '@openfairygui/backend';
import { createNodeBackendRuntime } from '@openfairygui/backend/node';
import { NodeIO } from '@openfairygui/core/node';
import { readProjectAsUam } from '@openfairygui/core';
import { z } from 'zod';
import { createOpenFairyGuiMcpServer, callOpenFairyGuiBackendTool, getOpenFairyGuiOperationCatalog, getOpenFairyGuiOperationSchema, OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS, OPENFAIRYGUI_OPERATION_CATALOG_URI } from '../src/index.js';
import { createMcpFixtureProject, createTempMcpProject } from './helpers.js';

test('operation discovery returns precise, isolated schemas including nested properties and byte arrays', (t) => {
	const catalog = getOpenFairyGuiOperationCatalog();
	t.is(catalog.operations.length, 41);
	for (const { kind, schemaUri } of catalog.operations) {
		t.is(schemaUri, `${OPENFAIRYGUI_OPERATION_CATALOG_URI}/${kind}`);
		const schema = getOpenFairyGuiOperationSchema(kind);
		t.notThrows(() => z.fromJSONSchema(schema));
	}
	t.throws(() => getOpenFairyGuiOperationSchema('__proto__'), { instanceOf: RangeError });
	const schema = getOpenFairyGuiOperationSchema('renameResource');
	schema.$defs = {};
	t.true(Object.keys(getOpenFairyGuiOperationSchema('renameResource').$defs ?? {}).length > 0);
	const apply = OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS.find((entry) => entry.backendMethod === 'applyTransaction')!.inputSchema;
	const input = { sessionId: 's', expectedRevision: 0, operations: [{ kind: 'setDisplayNodeProps', selector: { packageId: 'p', componentResourceId: 'c', displayNodeId: 'n' }, props: { position: { x: 'wrong', y: 0 } } }] };
	t.false(apply.safeParse(input).success);
	t.false(apply.safeParse({ ...input, operations: [] }).success);
	t.false(apply.safeParse({ ...input, expectedRevision: -1 }).success);
	const open = OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS.find((entry) => entry.backendMethod === 'openProjectSession')!.inputSchema;
	t.false(open.safeParse({ project: createMcpFixtureProject(), storage: {} }).success);
});

test('each generated output schema validates its own data and error types', (t) => {
	const runtime = new BackendRuntime();
	const getCapabilities = OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS.find((entry) => entry.backendMethod === 'getCapabilities')!;
	const getSession = OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS.find((entry) => entry.backendMethod === 'getSession')!;
	t.true(getCapabilities.outputSchema.safeParse({ backendResult: runtime.getCapabilities() }).success);
	t.false(getSession.outputSchema.safeParse({ backendResult: runtime.getCapabilities() }).success);
	t.true(getSession.outputSchema.safeParse({ backendResult: runtime.getSession({ sessionId: 'missing' }) }).success);
	t.false(getSession.outputSchema.safeParse({ backendResult: { ok: false, meta: {}, error: { code: 'made_up', message: 'bad' } } }).success);
});

test('wire schemas use uniform items for fixed numeric tuples without weakening their validation', async (t) => {
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const server = createOpenFairyGuiMcpServer({ runtime: new BackendRuntime() });
	const client = new Client({ name: 'tuple-schema', version: 'test' });
	await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
	try {
		const { tools } = await client.listTools();
		t.is(tools.length, 18);
		t.deepEqual(tools.map((tool) => tool.name), OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS.map((tool) => tool.name));
		function checkItems(value: unknown): void {
			if (!value || typeof value !== 'object') return;
			const schema = value as Record<string, unknown>;
			if (schema.type === 'array') assert(!Array.isArray(schema.items), 'Positional items make Codex skip the whole tool');
			for (const child of Object.values(value)) checkItems(child);
		}
		for (const tool of tools) {
			checkItems(tool.inputSchema);
			for (const schema of [tool.inputSchema, tool.outputSchema!]) {
				function checkRefs(value: unknown): void {
					if (!value || typeof value !== 'object') return;
					if ('$ref' in value) {
						assert(typeof value.$ref === 'string' && (value.$ref === '#' || value.$ref.startsWith('#/definitions/')), 'Only self-contained references are allowed');
						assert(value.$ref.split('/').slice(1).reduce((node: unknown, key) => (node as Record<string, unknown>)?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], schema));
					}
					for (const child of Object.values(value)) checkRefs(child);
				}
				checkRefs(schema);
			}
		}
		for (const method of ['apply_transaction', 'preflight_transaction']) {
			const wire = tools.find((tool) => tool.name.endsWith(`_${method}`))!;
			const definition = OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS.find((entry) => entry.name === wire.name)!;
			const inline = z.toJSONSchema(definition.inputSchema, { target: 'draft-07', io: 'input', reused: 'inline' });
			t.true(Buffer.byteLength(JSON.stringify(wire.inputSchema)) < Buffer.byteLength(JSON.stringify(inline)) / 4, 'Discovery must not re-expand shared transaction schemas');
			const schema = z.fromJSONSchema(wire.inputSchema as Parameters<typeof z.fromJSONSchema>[0]);
			const kinds = new Set<string>();
			function collectKinds(value: unknown): void {
				if (!value || typeof value !== 'object') return;
				const properties = (value as { properties?: { kind?: { const?: string } } }).properties;
				if (properties?.kind?.const) kinds.add(properties.kind.const);
				for (const child of Object.values(value)) collectKinds(child);
			}
			collectKinds(wire.inputSchema);
			for (const { kind } of getOpenFairyGuiOperationCatalog().operations) t.true(kinds.has(kind), `Missing operation: ${kind}`);
			const rename = { sessionId: 's', expectedRevision: 0, operations: [{ kind: 'renameResource', selector: { packageId: 'p', resourceId: 'r' }, newName: 'After' }] };
			t.true(schema.safeParse(rename).success);
			for (const invalid of [{ ...rename, expectedRevision: -1 }, { ...rename, operations: [] }, { ...rename, operations: [{ kind: 'invented' }] }, { ...rename, operations: [{ kind: 'setDisplayNodeProps', selector: { packageId: 'p', componentResourceId: 'c', displayNodeId: 'n' }, props: { position: { x: 'wrong', y: 0 } } }] }]) t.false(schema.safeParse(invalid).success);
			for (const operation of [
				{ kind: 'setImageResourceProps', selector: { packageId: 'p', resourceId: 'r' } },
				{ kind: 'setDisplayNodeProps', selector: { packageId: 'p', componentResourceId: 'c', displayNodeId: 'n' } },
			]) {
				const parse = (value: unknown) => schema.safeParse({ sessionId: 's', expectedRevision: 0, operations: [{ ...operation, props: operation.kind === 'setImageResourceProps'
					? { textureSetMode: '', qualityOption: '', quality: 90, smoothing: true, duplicatePadding: false, scaleOption: 1, scale9Grid: value, tileGridIndice: 0 }
					: { graphProperties: { graphType: 1, lineSize: 1, lineColor: '#000000', fillColor: '#ffffff', cornerRadius: value, points: null, sides: 4, startAngle: 0, distances: null } },
				}] }).success;
				for (const value of [null, [0, 1, 2, 3]]) t.true(parse(value), `${method}: ${operation.kind} ${JSON.stringify(value)}`);
				for (const value of [[], [1, 2, 3], [1, 2, 3, 4, 5], [1, 2, 3, '4']]) t.false(parse(value), `${method}: ${operation.kind} ${JSON.stringify(value)}`);
			}
		}
	} finally { await client.close(); await server.close(); }
});

test('direct calls reject structural and budget violations before reaching Backend', async (t) => {
	const runtime = new BackendRuntime();
	let calls = 0;
	runtime.applyTransaction = async () => { calls++; throw new Error('Must not be called'); };
	await t.throwsAsync(callOpenFairyGuiBackendTool(runtime, 'openfairygui_backend_apply_transaction', { sessionId: 's', expectedRevision: 0, operations: [{ kind: 'invented' }] }));
	let nested: unknown = null;
	for (let i = 0; i < 35; i++) nested = [nested];
	await t.throwsAsync(callOpenFairyGuiBackendTool(runtime, 'openfairygui_backend_apply_transaction', { nested }), { instanceOf: RangeError });
	t.is(calls, 0);
});

test('MCP discovery and four representative operations preserve semantics through save and reread', async (t) => {
	const fixture = await createTempMcpProject();
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const server = createOpenFairyGuiMcpServer({ runtime: createNodeBackendRuntime({ allowedProjectRoots: [fixture.rootDir] }) });
	const client = new Client({ name: 'contract-roundtrip', version: 'test' });
	await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
	let sessionId: string | undefined;
	async function call(method: string, input: Record<string, unknown>) {
		const result = await client.callTool({ name: `openfairygui_backend_${method}`, arguments: input });
		const structured = result.structuredContent as {
			backendResult?: { ok: boolean; error?: unknown; data: { sessionId: string; revision: number; dirty: boolean } };
		} | undefined;
		assert(!result.isError, JSON.stringify(structured?.backendResult?.error ?? result.content));
		const envelope = structured?.backendResult;
		assert(envelope?.ok);
		return envelope.data;
	}
	try {
		const catalog = await client.readResource({ uri: OPENFAIRYGUI_OPERATION_CATALOG_URI });
		await client.listTools(); // SDK validates actual output envelopes against compact discovery schemas.
		t.true('text' in catalog.contents[0] && catalog.contents[0].text.includes('addComponent'));
		const resource = await client.readResource({ uri: `${OPENFAIRYGUI_OPERATION_CATALOG_URI}/addComponent` });
		t.true('text' in resource.contents[0] && resource.contents[0].text.includes('displayList'));
		const opened = await call('open_session', { projectPath: fixture.rootDir });
		sessionId = opened.sessionId;
		const project = await readProjectAsUam(new NodeIO(), fixture.fairyPath);
		const component = structuredClone(project.packages[0].resources.find((entry) => entry.kind === 'component')!);
		component.id = 'cmp002'; component.name = 'Copy';
		const renamed = await call('apply_transaction', { sessionId, expectedRevision: opened.revision, operations: [
			{ kind: 'renameResource', selector: { packageId: 'pkg001', resourceId: 'cmp001' }, newName: 'Renamed' },
		] });
		const applied = await call('apply_transaction', { sessionId, expectedRevision: renamed.revision, operations: [
			{ kind: 'setDisplayNodeProps', selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' }, props: { text: 'Contract-backed edit' } },
			{ kind: 'addComponent', selector: { packageId: 'pkg001' }, component, atIndex: 2 },
			{ kind: 'addResource', selector: { packageId: 'pkg001' }, resource: { kind: 'misc', id: 'data001', name: 'data', path: '/', exported: false, favorite: false, branch: '', branchItemIds: [], file: 'data.bin', sourceBytes: [1, 2, 3] } },
		] });
		const replaced = await call('apply_transaction', { sessionId, expectedRevision: applied.revision, operations: [
			{ kind: 'replaceResourceBytes', selector: { packageId: 'pkg001', resourceId: 'data001' }, sourceBytes: [0, 255, 42] },
		] });
		const saved = await call('save_session', { sessionId, expectedRevision: replaced.revision });
		t.false(saved.dirty);
		const reread = await readProjectAsUam(new NodeIO(), fixture.fairyPath);
		const resources = reread.packages[0].resources;
		const edited = resources.find((entry) => entry.id === 'cmp001');
		t.is(edited?.name, 'Renamed');
		assert(edited?.kind === 'component');
		t.is(edited.component.displayList.find((entry) => entry.kind === 'text')?.text, 'Contract-backed edit');
		t.deepEqual(resources.find((entry) => entry.id === 'cmp002'), component);
		t.deepEqual([...await fs.readFile(path.join(fixture.rootDir, 'assets', project.packages[0].name, 'data.bin'))], [0, 255, 42]);
	} finally {
		if (sessionId) await call('close_session', { sessionId });
		await client.close(); await server.close(); await fixture.cleanup();
	}
});
