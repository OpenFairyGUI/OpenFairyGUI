import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BackendRuntime } from '@openfairygui/backend';
import { createNodeBackendRuntime } from '@openfairygui/backend/node';
import { readProjectAsUam } from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';
import test from 'ava';
import { z } from 'zod';
import { callOpenFairyGuiBackendTool, createOpenFairyGuiMcpServer, type OpenFairyGuiMcpToolPolicy } from '../src/index.js';
import { createTempMcpProject } from './helpers.js';

const failureSchema = z.strictObject({
	ok: z.literal(false),
	error: z.strictObject({
		code: z.literal('save_approval_required'),
		message: z.string(),
		approval: z.strictObject({ approvalRequestId: z.string(), sessionId: z.string(), revision: z.number().int() }),
		approvalPath: z.literal('/#save-approvals'),
	}),
});
const approvalFailure = (sessionId: string, revision: number) => ({
	ok: false as const,
	error: {
		code: 'save_approval_required' as const, message: 'Host owner confirmation is required',
		approval: { approvalRequestId: 'host-request', sessionId, revision }, approvalPath: '/#save-approvals' as const,
	},
});

test('SDK discovery includes Host tools before and after connection and follows public handles', async (t) => {
	const instructions = 'Host writes require owner approval.';
	const server = createOpenFairyGuiMcpServer({ runtime: new BackendRuntime(), instructions });
	const probe = server.registerTool('host_probe', { inputSchema: z.object({}) }, async () => ({ content: [{ type: 'text', text: 'ok' }] }));
	const client = new Client({ name: 'host-discovery', version: 'test' });
	const [ct, st] = InMemoryTransport.createLinkedPair();
	await Promise.all([client.connect(ct), server.connect(st)]);
	try {
		t.is(client.getInstructions(), instructions);
		t.is((await client.listTools()).tools.length, 18);
		t.deepEqual((await client.callTool({ name: 'host_probe', arguments: {} })).content, [{ type: 'text', text: 'ok' }]);
		probe.disable();
		t.false((await client.listTools()).tools.some(({ name }) => name === 'host_probe'));
		t.true((await client.callTool({ name: 'host_probe', arguments: {} })).isError);
		probe.enable();
		probe.update({ title: 'Updated Host tool' });
		t.is((await client.listTools()).tools.find(({ name }) => name === 'host_probe')?.title, 'Updated Host tool');
		probe.remove();
		t.is((await client.listTools()).tools.length, 17);
		server.registerTool('host_late', {}, async () => ({ content: [{ type: 'text', text: 'late' }] }));
		t.true((await client.listTools()).tools.some(({ name }) => name === 'host_late'));
		t.deepEqual((await client.callTool({ name: 'host_late', arguments: {} })).content, [{ type: 'text', text: 'late' }]);
		t.true((await client.readResource({ uri: 'openfairygui://docs/workflow' })).contents.length > 0);
		t.true((await client.getPrompt({ name: 'openfairygui_save_session' })).messages.length > 0);
	} finally { await client.close(); await server.close(); }
});

for (const [method, name] of [['saveSession', 'openfairygui_backend_save_session'], ['materializeSession', 'openfairygui_backend_materialize_session']] as const) {
	test(`${method}: declared Host failure stops writes; a grant permits one unchanged Backend result`, async (t) => {
		const fixture = await createTempMcpProject();
		const runtime = createNodeBackendRuntime({ allowedProjectRoots: [fixture.rootDir] });
		const before = await readProjectAsUam(new NodeIO(), fixture.fairyPath);
		let grant: string | undefined;
		let policyCalls = 0;
		const backendResults: unknown[] = [];
		const monitored = new Proxy(runtime, {
			get(target, key) {
				if (key === method) return async (input: unknown) => {
					const result = await Reflect.apply(target[method], target, [input]);
					backendResults.push(result);
					return result;
				};
				const value = Reflect.get(target, key);
				return typeof value === 'function' ? value.bind(target) : value;
			},
		});
		const server = createOpenFairyGuiMcpServer({ runtime: monitored, toolPolicies: {
			[name]: { failureSchema, async beforeCall(input: Readonly<Record<string, unknown>>) {
				policyCalls++;
				if (grant === JSON.stringify(input)) { grant = undefined; return; }
				return approvalFailure(String(input.sessionId), Number(input.expectedRevision));
			} },
		} });
		const client = new Client({ name: 'host-save', version: 'test' });
		const [ct, st] = InMemoryTransport.createLinkedPair();
		await Promise.all([client.connect(ct), server.connect(st)]);
		let sessionId: string | undefined;
		try {
			const tools = (await client.listTools()).tools;
			const output = z.fromJSONSchema(tools.find((tool) => tool.name === name)!.outputSchema as Parameters<typeof z.fromJSONSchema>[0]);
			const opened = await runtime.openSession({ projectPath: fixture.fairyPath });
			assert(opened.ok); sessionId = opened.data.sessionId;
			assert((await runtime.applyTransaction({ sessionId, expectedRevision: 0, operations: [{ kind: 'renameResource', selector: { packageId: 'pkg001', resourceId: 'cmp001' }, newName: 'Approved' }] })).ok);
			const input = { sessionId, expectedRevision: 1 };
			const read = await client.callTool({ name: 'openfairygui_backend_read_session_state', arguments: input });
			t.false(read.isError); t.is(policyCalls, 0);
			const pending = await client.callTool({ name, arguments: input });
			t.true(pending.isError);
			t.deepEqual(pending.structuredContent, { backendResult: approvalFailure(sessionId, 1) });
			t.true(output.safeParse(pending.structuredContent).success);
			t.false(output.safeParse({ backendResult: { ok: false, error: { code: 'undeclared' } } }).success);
			const other = z.fromJSONSchema(tools.find((tool) => tool.name === 'openfairygui_backend_get_session')!.outputSchema as Parameters<typeof z.fromJSONSchema>[0]);
			t.false(other.safeParse(pending.structuredContent).success, 'Host branch applies only to the selected tool');
			t.is(backendResults.length, 0);
			t.deepEqual(await readProjectAsUam(new NodeIO(), fixture.fairyPath), before);
			grant = JSON.stringify(input); // Fixture owner approves; MCP has no approval tool.
			const retries = await Promise.all([client.callTool({ name, arguments: input }), client.callTool({ name, arguments: input })]);
			t.is(retries.filter((result) => !result.isError).length, 1);
			t.is(backendResults.length, 1);
			t.deepEqual(retries.find((result) => !result.isError)!.structuredContent, { backendResult: JSON.parse(JSON.stringify(backendResults[0])) });
			t.is((await readProjectAsUam(new NodeIO(), fixture.fairyPath)).packages[0].resources.find((resource) => resource.id === 'cmp001')?.name, 'Approved');
			const staleInput = { sessionId, expectedRevision: 0 };
			grant = JSON.stringify(staleInput);
			const stale = await client.callTool({ name, arguments: staleInput });
			t.true(stale.isError);
			t.deepEqual(stale.structuredContent, { backendResult: JSON.parse(JSON.stringify(backendResults[1])) });
			t.is((stale.structuredContent as { backendResult: { error: { code: string } } }).backendResult.error.code, 'stale_write');
			t.true(output.safeParse(stale.structuredContent).success);
			t.true((await client.callTool({ name, arguments: staleInput })).isError);
			t.is(backendResults.length, 2, 'A Backend failure consumes the grant without retry');
		} finally {
			if (sessionId) await runtime.closeSession({ sessionId });
			await client.close(); await server.close(); await fixture.cleanup();
		}
	});
}

test('Host policy cannot bypass input validation, alter Backend input or validate Backend-owned failures', async (t) => {
	const runtime = new BackendRuntime();
	const name = 'openfairygui_backend_get_session';
	let policyCalls = 0;
	let backendCalls = 0;
	let mode = 'allow';
	const getSession = runtime.getSession.bind(runtime);
	runtime.getSession = (input) => { backendCalls++; return mode === 'invalid-backend' ? approvalFailure('s', 0) as never : getSession(input); };
	const policy: OpenFairyGuiMcpToolPolicy = { failureSchema, beforeCall(input) {
		policyCalls++;
		(input as Record<string, unknown>).sessionId = 'mutated';
		if (mode === 'invalid-host') return { ok: false };
		if (mode === 'throw') throw new Error('private host details');
	} };
	await t.throwsAsync(callOpenFairyGuiBackendTool(runtime, name, { sessionId: 1 }, policy));
	let deep: unknown = null;
	for (let i = 0; i < 35; i++) deep = [deep];
	await t.throwsAsync(callOpenFairyGuiBackendTool(runtime, name, { deep }, policy));
	t.is(policyCalls, 0); t.is(backendCalls, 0);
	const result = await callOpenFairyGuiBackendTool(runtime, name, { sessionId: 'original' }, policy);
	t.is((result.structuredContent?.backendResult as { error: { sessionId: string } }).error.sessionId, 'original');
	for (mode of ['invalid-host', 'throw', 'invalid-backend']) {
		const result = await callOpenFairyGuiBackendTool(runtime, name, { sessionId: 's' }, policy);
		t.true(result.isError);
		t.is((result.structuredContent?.backendResult as { error: { code: string } }).error.code, 'backend_unhandled_error');
		t.false(JSON.stringify(result).includes('private host details'));
	}
	t.is(backendCalls, 2, 'Invalid/throwing policies must stop before Backend');
	t.throws(() => createOpenFairyGuiMcpServer({ runtime, toolPolicies: { misspelled_tool: policy } as never }), { instanceOf: RangeError });
});

test('Host failures obey the same complete-response budget without invoking Backend', async (t) => {
	const runtime = new BackendRuntime();
	let calls = 0;
	runtime.readSessionState = () => { calls++; throw new Error('Host failure must stop Backend'); };
	const result = await callOpenFairyGuiBackendTool(runtime, 'openfairygui_backend_read_session_state', { sessionId: 's' }, {
		failureSchema: z.strictObject({ ok: z.literal(false), error: z.strictObject({ code: z.literal('host_denied'), message: z.string() }) }),
		beforeCall: () => ({ ok: false, error: { code: 'host_denied', message: 'x'.repeat(9 * 1024 * 1024) } }),
	});
	t.is(calls, 0); t.true(result.isError);
	t.is((result.structuredContent?.backendResult as { error: { code: string } }).error.code, 'mcp_response_budget_exceeded');
	t.true(Buffer.byteLength(JSON.stringify(result)) < 2000);
});
