import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { codexArguments, CONCURRENT_TEXT, expectedProject, gradeEvaluation, isolatedCodexEvents, observations, scopedFileSystem } from './agent-eval-checks.mjs';
import { evaluationOptions } from './agent-evals.mjs';

const before = { packages: [{ resources: [{ id: 'cmpdemo1', name: 'MainView', kind: 'component', component: { displayList: [{ id: 'title', text: 'Original' }] } }] }] };
function call(id, method, args, result) {
	return [
		{ at: 10, type: 'request', message: { id, method: 'tools/call', params: { name: `openfairygui_backend_${method}`, arguments: args } } },
		{ at: 20, type: 'response', message: { id, result: { isError: !result.ok, structuredContent: { backendResult: result } } } },
	];
}
function input(taskId = 'rename-save') {
	const project = expectedProject(before, taskId);
	return {
		taskId, expected: project, actual: structuredClone(project), expectedFiles: { 'package.xml': 'expected', 'notes.txt': 'untouched' }, actualFiles: { 'package.xml': 'expected', 'notes.txt': 'untouched' },
		trace: [
			...call(1, 'validate_session', {}, { ok: true, data: { status: 'valid' } }),
			...call(2, 'save_session', { expectedRevision: 1 }, { ok: true, data: { dirty: false } }),
		],
		final: null, runnerOk: true, isolated: true, validation: 'valid',
	};
}

test('eval oracles require real state, exact bytes and a saved result, not a completion claim or a prescribed tool order', () => {
	const valid = input();
	assert(gradeEvaluation(valid).passed); // No prescribed preflight/query sequence.
	assert.equal(before.packages[0].resources[0].name, 'MainView');
	assert.throws(() => expectedProject(before, 'unregistered-task'), /No oracle/);
	for (const broken of [
		{ actual: before, final: { summary: 'I finished successfully!' } },
		{ actual: null }, { validation: 'incomplete' }, { runnerOk: false }, { isolated: false },
		{ actualFiles: { ...valid.actualFiles, 'unrelated.txt': 'added' } },
		{ actualFiles: { 'package.xml': 'expected', 'notes.txt': 'changed' } },
		{ trace: valid.trace.filter((entry) => entry.message.id !== 2) },
		{ trace: [...valid.trace, { type: 'scope-violation' }] },
	]) assert(!gradeEvaluation({ ...valid, ...broken }).passed, JSON.stringify(broken));
	const inspect = input('inspect-validate');
	inspect.trace = inspect.trace.filter((entry) => entry.message.id === 1);
	inspect.final = { facts: { packageCount: 1, resourceCount: 1, validationStatus: 'valid' } };
	assert(gradeEvaluation(inspect).passed);
	assert(!gradeEvaluation({ ...inspect, final: { facts: { packageCount: 2, resourceCount: 1, validationStatus: 'valid' } } }).passed);
	assert(!gradeEvaluation({ ...inspect, trace: [] }).passed);
});

test('stale evaluation binds rejection to the injected concurrent write and preserves its data', () => {
	const valid = input('stale-revision-recovery');
	assert.equal(valid.expected.packages[0].resources[0].component.displayList[0].text, CONCURRENT_TEXT);
	valid.trace.push({ type: 'injection', ok: true, requestId: 3, previousRevision: 0, revision: 1 }, ...call(3, 'apply_transaction', { expectedRevision: 0 }, { ok: false, error: { code: 'stale_write' } }));
	assert(gradeEvaluation(valid).passed);
	assert(!gradeEvaluation({ ...valid, actual: expectedProject(before, 'rename-save') }).passed);
	assert(!gradeEvaluation({ ...valid, trace: valid.trace.filter((entry) => entry.type !== 'injection') }).passed);
	assert(!gradeEvaluation({ ...valid, trace: valid.trace.map((entry) => entry.type === 'injection' ? { ...entry, requestId: 99 } : entry) }).passed);
});

test('observations count failures, docs, previews and exact resubmissions separately from success', () => {
	const args = { expectedRevision: 0, operations: [{ kind: 'renameResource' }] };
	const trace = [
		...call(1, 'apply_transaction', args, { ok: false, error: { code: 'stale_write' } }),
		...call(2, 'apply_transaction', { operations: args.operations, expectedRevision: 0 }, { ok: false }),
		...call(3, 'preflight_transaction', args, { ok: true }),
		{ at: 1, type: 'request', message: { id: 4, method: 'resources/read', params: { uri: 'openfairygui://docs/workflow' } } },
		{ at: 2, type: 'response', message: { id: 4, result: {} } },
	];
	const metrics = observations(trace, 100);
	assert.equal(metrics.failedCalls, 2); assert.equal(metrics.staleRejections, 1);
	assert.equal(metrics.repeatedApplyArguments, 1); assert.equal(metrics.previews, 1);
	assert.deepEqual(metrics.documentationReads, ['openfairygui://docs/workflow']);
});

test('evaluation host rejects realpath escapes, including staged callbacks, before invoking filesystem writes', async () => {
	const workspace = path.resolve('eval-workspace');
	const outside = path.resolve('eval-workspace-other', 'secret');
	const records = []; let writes = 0;
	const base = { resolvePath: async (file) => file.endsWith('link') ? outside : path.resolve(file), writeFile: async () => { writes++; } };
	base.runProjectWriteTransaction = async (_root, write) => write({ ...base, runProjectWriteTransaction: undefined });
	const fs = scopedFileSystem(base, workspace, (entry) => records.push(entry));
	await fs.writeFile(path.join(workspace, 'safe'), 'yes');
	await assert.rejects(fs.writeFile(outside, 'no'), /scope violation/);
	await assert.rejects(fs.writeFile(path.join(workspace, 'link'), 'no'), /scope violation/);
	await assert.rejects(fs.runProjectWriteTransaction(workspace, (staged) => staged.writeFile(outside, 'no')), /scope violation/);
	assert.equal(writes, 1); assert.equal(records.filter((entry) => entry.type === 'scope-violation').length, 3);
});

test('manual model execution is explicit, bounded, tool-only and shell-free', () => {
	assert.throws(() => evaluationOptions({}), /Choose --runner/);
	assert.throws(() => evaluationOptions({ runner: 'codex' }), /Supply --codex/);
	assert.throws(() => evaluationOptions({ runner: 'codex', codex: 'codex.cmd' }), /shell interpolation/);
	assert.throws(() => evaluationOptions({ runner: 'reference', case: '../escape' }), /Unknown --case/);
	assert.throws(() => evaluationOptions({ runner: 'reference', 'timeout-seconds': '0' }), /integer/);
	assert.equal(evaluationOptions({ runner: 'reference' }).tasks.length, 3);
	const args = codexArguments({ cwd: '/isolated/agent', server: ['/isolated/host.mjs', '--serve', '/isolated/task.json'], schema: '/answer.json', output: '/final.json', instructions: '/instructions.txt', enabledTools: ['read'] });
	for (const flag of ['--ignore-user-config', '--ephemeral', '--skip-git-repo-check']) assert(args.includes(flag));
	assert(args.includes('project_doc_max_bytes=0'));
	assert(args.includes('web_search="disabled"'));
	for (const feature of ['shell_tool', 'unified_exec', 'plugins', 'apps', 'memories', 'multi_agent', 'hooks']) assert.equal(args[args.indexOf(feature) - 1], '--disable');
	assert(!args.includes('--dangerously-bypass-approvals-and-sandbox'));
	assert(args.some((arg) => arg.includes('default_tools_approval_mode="approve"')));
	assert(isolatedCodexEvents([{ item: { type: 'mcp_tool_call', server: 'codex', tool: 'list_mcp_resources', arguments: {} } }]));
	assert(!isolatedCodexEvents([{ item: { type: 'command_execution' } }]));
	assert(!isolatedCodexEvents([{ item: { type: 'mcp_tool_call', server: 'other' } }]));
	assert(!isolatedCodexEvents([{ item: { type: 'mcp_tool_call', server: 'codex', tool: 'list_mcp_resources', arguments: { server: 'other' } } }]));
});
