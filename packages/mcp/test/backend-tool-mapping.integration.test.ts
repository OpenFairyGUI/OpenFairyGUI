import test from 'ava';
import { BackendRuntime } from '@openfairygui/backend';
import {
	callOpenFairyGuiBackendTool,
	OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS,
	OPENFAIRYGUI_BACKEND_TOOL_NAMES,
	type OpenFairyGuiBackendToolName,
} from '../src/index.js';
import { createTempMcpProject } from './helpers.js';

interface BackendToolResult {
	ok: boolean;
	data?: unknown;
	error?: {
		code: string;
	};
}

function backendResultOf(result: Awaited<ReturnType<typeof callOpenFairyGuiBackendTool>>): BackendToolResult {
	const structured = result.structuredContent as { backendResult?: BackendToolResult } | undefined;
	if (!structured?.backendResult) throw new Error('Missing structured backendResult');
	return structured.backendResult;
}

async function callTool(
	runtime: BackendRuntime,
	name: OpenFairyGuiBackendToolName,
	input: Record<string, unknown> = {},
): Promise<BackendToolResult> {
	const result = await callOpenFairyGuiBackendTool(runtime, name, input);
	return backendResultOf(result);
}

test('MCP P0 tool definitions exactly map backend P2 methods', (t) => {
	const runtime = new BackendRuntime();
	const capabilities = runtime.getCapabilities();
	t.true(capabilities.ok);
	if (!capabilities.ok) return;

	const mappedMethods = OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS.map((definition) => definition.backendMethod);
	t.deepEqual(mappedMethods, [...capabilities.data.methods]);
	t.deepEqual(OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS.map((definition) => definition.name), [...OPENFAIRYGUI_BACKEND_TOOL_NAMES]);
	t.is(new Set(OPENFAIRYGUI_BACKEND_TOOL_NAMES).size, capabilities.data.methods.length);
});

test('MCP P0 direct tool handler can call every backend P2 method without redefining backend semantics', async (t) => {
	const fixture = await createTempMcpProject();
	const runtime = new BackendRuntime();
	try {
		const capabilities = await callTool(runtime, 'openfairygui_backend_get_capabilities');
		t.true(capabilities.ok);

		const opened = await callTool(runtime, 'openfairygui_backend_open_session', { projectPath: fixture.rootDir });
		t.true(opened.ok);
		const sessionId = (opened.data as { sessionId: string }).sessionId;

		const session = await callTool(runtime, 'openfairygui_backend_get_session', { sessionId });
		t.true(session.ok);

		const applied = await callTool(runtime, 'openfairygui_backend_apply_transaction', {
			sessionId,
			expectedRevision: 0,
			operations: [
				{
					kind: 'setDisplayNodeProps',
					selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
					props: { text: 'MCP P0' },
				},
			],
		});
		t.true(applied.ok);

		const saved = await callTool(runtime, 'openfairygui_backend_save_session', { sessionId, expectedRevision: 1 });
		t.true(saved.ok);

		const events = await callTool(runtime, 'openfairygui_backend_get_events', { sessionId, after: '0', limit: 10 });
		t.true(events.ok);

		const cache = await callTool(runtime, 'openfairygui_backend_get_cache_snapshot', { sessionId });
		t.true(cache.ok);

		const refresh = await callTool(runtime, 'openfairygui_backend_refresh_cache', { sessionId, reason: 'manual' });
		t.true(refresh.ok);
		const jobId = (refresh.data as { jobId: string }).jobId;

		const job = await callTool(runtime, 'openfairygui_backend_get_job', { sessionId, jobId });
		t.true(job.ok);

		const jobs = await callTool(runtime, 'openfairygui_backend_list_jobs', { sessionId, kind: 'cache.refresh' });
		t.true(jobs.ok);

		const cancellableRefresh = await callTool(runtime, 'openfairygui_backend_refresh_cache', { sessionId, reason: 'manual' });
		t.true(cancellableRefresh.ok);
		const cancellableJobId = (cancellableRefresh.data as { jobId: string }).jobId;
		const cancelled = await callTool(runtime, 'openfairygui_backend_cancel_job', { sessionId, jobId: cancellableJobId });
		t.true(cancelled.ok);

		const closed = await callTool(runtime, 'openfairygui_backend_close_session', { sessionId });
		t.true(closed.ok);
	} finally {
		await fixture.cleanup();
	}
});
