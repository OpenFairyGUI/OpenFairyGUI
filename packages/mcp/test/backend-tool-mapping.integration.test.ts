import test from 'ava';
import { BackendRuntime as BrowserSafeBackendRuntime } from '@openfairygui/backend';
import { createNodeBackendRuntime } from '@openfairygui/backend/node';
import {
	callOpenFairyGuiBackendTool,
	OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS,
	OPENFAIRYGUI_BACKEND_TOOL_NAMES,
	OPENFAIRYGUI_BACKEND_TOOL_OUTPUT_SCHEMA,
	type OpenFairyGuiBackendRuntime,
	type OpenFairyGuiBackendToolName,
} from '../src/index.js';
import { createMcpFixtureProject, createTempMcpProject } from './helpers.js';

interface BackendToolResult {
	ok: boolean;
	meta?: unknown;
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
	runtime: OpenFairyGuiBackendRuntime,
	name: OpenFairyGuiBackendToolName,
	input: Record<string, unknown> = {},
): Promise<BackendToolResult> {
	const result = await callOpenFairyGuiBackendTool(runtime, name, input);
	return backendResultOf(result);
}

test('MCP P0 tool definitions exactly map backend P2 methods', (t) => {
	const runtime = new BrowserSafeBackendRuntime();
	const capabilities = runtime.getCapabilities();
	t.true(capabilities.ok);
	if (!capabilities.ok) return;

	const mappedMethods = OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS.map((definition) => definition.backendMethod);
	t.deepEqual(mappedMethods, [...capabilities.data.methods]);
	t.deepEqual(OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS.map((definition) => definition.name), [...OPENFAIRYGUI_BACKEND_TOOL_NAMES]);
	t.is(new Set(OPENFAIRYGUI_BACKEND_TOOL_NAMES).size, capabilities.data.methods.length);
	t.true(OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS.every((definition) => definition.outputSchema === OPENFAIRYGUI_BACKEND_TOOL_OUTPUT_SCHEMA));
	t.false(OPENFAIRYGUI_BACKEND_TOOL_NAMES.some((name) => name.includes('artifact')));
	for (const name of OPENFAIRYGUI_BACKEND_TOOL_NAMES) {
		t.true(name.startsWith('openfairygui_backend_'));
	}
});

test('MCP P0 preserves backend failure envelopes as structured tool errors', async (t) => {
	const runtime = new BrowserSafeBackendRuntime();
	const result = await callOpenFairyGuiBackendTool(runtime, 'openfairygui_backend_get_session', {
		sessionId: 'missing-session',
	});
	const backendResult = backendResultOf(result);

	t.true(result.isError);
	t.false(backendResult.ok);
	t.truthy(backendResult.meta);
	t.is(backendResult.error?.code, 'session_not_found');
});

test('MCP P0 tool annotations reflect backend side effects and non-goals', (t) => {
	const definitionsByMethod = new Map(
		OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS.map((definition) => [definition.backendMethod, definition]),
	);

	for (const method of [
		'getCapabilities',
		'getSession',
		'getProjectOutline',
		'validateSession',
		'getEvents',
		'getJob',
		'listJobs',
		'getCacheSnapshot',
	] as const) {
		t.true(definitionsByMethod.get(method)?.annotations.readOnlyHint);
	}

	for (const method of [
		'openSession',
		'openProjectSession',
		'applyTransaction',
		'saveSession',
		'materializeSession',
		'closeSession',
		'cancelJob',
		'refreshCache',
	] as const) {
		t.false(definitionsByMethod.get(method)?.annotations.readOnlyHint ?? false);
	}

	const applyTransactionAnnotations = definitionsByMethod.get('applyTransaction')?.annotations;
	const saveSessionAnnotations = definitionsByMethod.get('saveSession')?.annotations;
	t.true(Boolean(applyTransactionAnnotations && 'destructiveHint' in applyTransactionAnnotations && applyTransactionAnnotations.destructiveHint));
	t.true(Boolean(saveSessionAnnotations && 'destructiveHint' in saveSessionAnnotations && saveSessionAnnotations.destructiveHint));
});

test('MCP P0 direct tool handler can call every backend P2 method without redefining backend semantics', async (t) => {
	const fixture = await createTempMcpProject();
	const runtime = createNodeBackendRuntime();
	try {
		const capabilities = await callTool(runtime, 'openfairygui_backend_get_capabilities');
		t.true(capabilities.ok);

		const memoryOpened = await callTool(runtime, 'openfairygui_backend_open_project_session', {
			project: createMcpFixtureProject(),
			canonicalProjectPath: 'memory://mcp-project',
		});
		t.true(memoryOpened.ok);
		const memorySessionId = (memoryOpened.data as { sessionId: string }).sessionId;
		await callTool(runtime, 'openfairygui_backend_close_session', { sessionId: memorySessionId });

		const opened = await callTool(runtime, 'openfairygui_backend_open_session', { projectPath: fixture.rootDir });
		t.true(opened.ok);
		const sessionId = (opened.data as { sessionId: string }).sessionId;

		const session = await callTool(runtime, 'openfairygui_backend_get_session', { sessionId });
		t.true(session.ok);
		const outline = await callTool(runtime, 'openfairygui_backend_get_project_outline', { sessionId });
		t.true(outline.ok);
		t.is((outline.data as { revision: number }).revision, 0);
		const validation = await callTool(runtime, 'openfairygui_backend_validate_session', { sessionId });
		t.true(validation.ok);

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
		const updatedOutline = await callTool(runtime, 'openfairygui_backend_get_project_outline', { sessionId });
		t.true(updatedOutline.ok);
		t.is((updatedOutline.data as { revision: number }).revision, 1);

		const saved = await callTool(runtime, 'openfairygui_backend_save_session', { sessionId, expectedRevision: 1 });
		t.true(saved.ok);

		const materialized = await callTool(runtime, 'openfairygui_backend_materialize_session', {
			sessionId,
			expectedRevision: 1,
			mode: 'fullProject',
			reason: 'mcp_mapping',
		});
		t.true(materialized.ok);

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
