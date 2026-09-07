import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { ARTIFACT_TOOLS, assertArtifactTool, BLOCKERS, codexArguments, CONCURRENT_TEXT, EVAL_METHODS, expectedProject, gradeArtifactEvaluation, gradeEvaluation, isolatedCodexEvents, observations, scopedFileSystem } from './agent-eval-checks.mjs';
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

test('node editing oracle changes only the selected ID, text and position', () => {
	const fixture = structuredClone(before);
	fixture.packages[0].resources[0].component.displayList.unshift({ id: 'other-title', name: 'title', text: 'Untouched', position: { x: 0, y: 1 } });
	const expected = expectedProject(fixture, 'edit-display-node');
	assert.deepEqual(expected.packages[0].resources[0].component.displayList[0], fixture.packages[0].resources[0].component.displayList[0]);
	assert.deepEqual(expected.packages[0].resources[0].component.displayList[1], { id: 'title', text: 'Ready to edit', position: { x: 40, y: 56 } });
	const valid = { ...input('edit-display-node'), expected, actual: structuredClone(expected) };
	assert(gradeEvaluation(valid).passed);
	for (const mutate of [
		(project) => { project.packages[0].resources[0].component.displayList[0].text = 'Ready to edit'; },
		(project) => { project.packages[0].resources[0].component.displayList[1].position.y = 57; },
		(project) => { project.packages[0].resources[0].id = 'replaced'; },
	]) { const actual = structuredClone(expected); mutate(actual); assert(!gradeEvaluation({ ...valid, actual }).passed); }
});

test('safe-stop grading requires a real diagnostic, intact live work and untouched files, never a claimed success', () => {
	for (const [taskId, code] of Object.entries(BLOCKERS)) {
		const state = { session: { sessionId: 'pending', revision: 1, lastSavedRevision: 0, dirty: true }, entities: [{ text: 'Unsaved' }], validation: { status: taskId === 'missing-source-bytes' ? 'incomplete' : 'valid' } };
		const valid = { ...input(taskId), final: { outcome: 'blocked', blocker: code }, trace: [
			{ type: 'session-state', phase: 'before', state },
			...call(1, 'validate_session', {}, { ok: true, data: state.validation }),
			...call(2, taskId === 'path-policy' ? 'save_session' : 'preflight_transaction', {}, { ok: false, meta: { diagnostics: [{ code }] } }),
			{ type: 'session-state', phase: 'after', state: structuredClone(state) },
		] };
		assert(gradeEvaluation(valid).passed);
		for (const broken of [
			{ final: { outcome: 'completed', blocker: null } }, { final: { outcome: 'blocked', blocker: 'made_up' } },
			{ final: { outcome: 'blocked', blocker: `${code}: explanation belongs in summary` } },
			{ trace: [] }, { trace: valid.trace.filter((entry) => entry.message?.id !== 2) },
			{ actualFiles: { ...valid.actualFiles, 'outside.txt': 'unexpected write' } },
			{ trace: [...valid.trace, { type: 'session-state', phase: 'after', state: { error: 'session_not_found' } }] },
			{ trace: [...valid.trace, { type: 'session-state', phase: 'after', state: { ...state, session: { ...state.session, revision: 2 } } }] },
			{ trace: [...valid.trace, { type: 'session-state', phase: 'after', state: { ...state, entities: [] } }] },
			{ trace: [...valid.trace, { type: 'session-state', phase: 'before', state }] },
			...['apply_transaction', 'save_session', 'close_session'].map((method) => ({ trace: [...valid.trace, ...call(3, method, {}, { ok: true, data: { dirty: false } })] })),
		]) assert(!gradeEvaluation({ ...valid, ...broken }).passed, `${taskId}: ${JSON.stringify(broken)}`);
	}
});

test('complex editing oracles preserve page IDs, actions, item order, targets and gears, and require the real query', () => {
	const fixture = structuredClone(before);
	fixture.packages[0].id = 'pkgdemo1';
	const component = fixture.packages[0].resources[0].component;
	component.controllers = [{ name: 'state', pages: [{ id: '0', name: 'Idle', remark: 'Keep' }, { id: '1', name: 'Active', remark: 'Keep too' }], actions: [{ toPageIds: ['1'], transitionName: 'intro' }] }];
	component.transitions = [{ name: 'intro', items: [{ label: 'keep', targetNodeId: 'title' }, { label: 'move-title', targetNodeId: 'title', duration: 12, endValue: ['96', '48'] }] }];
	component.displayList[0].gears = [{ controllerName: 'state', visibleOnPageIds: ['1'] }];
	fixture.packages[0].resources.push({ ...structuredClone(fixture.packages[0].resources[0]), id: 'cmpother' });
	for (const taskId of ['edit-controller', 'edit-transition']) {
		const expected = expectedProject(fixture, taskId);
		const kind = taskId === 'edit-controller' ? 'controller' : 'transition';
		const target = { kind, selector: { packageId: 'pkgdemo1', componentResourceId: 'cmpdemo1', [kind === 'controller' ? 'controllerName' : 'transitionName']: kind === 'controller' ? 'state' : 'intro' } };
		const valid = { ...input(), taskId, expected, actual: structuredClone(expected) };
		assert(!gradeEvaluation(valid).passed);
		valid.trace.push(...call(3, 'query_entity', { target }, { ok: true, data: { target, entity: { kind } } }));
		assert(gradeEvaluation(valid).passed);
		const planned = structuredClone(fixture);
		const model = planned.packages[0].resources[0].component;
		if (kind === 'controller') model.controllers[0].pages[1].name = 'Ready';
		else Object.assign(model.transitions[0].items[1], { duration: 18, endValue: ['120', '64'] });
		assert.deepEqual(expected, planned);
		for (const mutate of [
			(model) => { model.controllers[0].pages[1].id = 'replaced'; },
			(model) => { model.controllers[0].pages[0].remark = ''; },
			(model) => { model.controllers[0].actions[0].toPageIds = []; },
			(model) => { model.transitions[0].items.reverse(); },
			(model) => { model.transitions[0].items[1].targetNodeId = ''; },
			(model) => { model.displayList[0].gears = []; },
		]) {
			const actual = structuredClone(expected); mutate(actual.packages[0].resources[0].component);
			assert(!gradeEvaluation({ ...valid, actual }).passed);
		}
		const wrongScope = structuredClone(valid);
		wrongScope.trace.at(-1).message.result.structuredContent.backendResult.data.target.selector.componentResourceId = 'cmpother';
		assert(!gradeEvaluation(wrongScope).passed);
	}
});

test('observations count failures, docs, previews and exact resubmissions separately from success', () => {
	const args = { expectedRevision: 0, operations: [{ kind: 'renameResource' }] };
	const trace = [
		...call(1, 'apply_transaction', args, { ok: false, error: { code: 'stale_write' } }),
		...call(2, 'apply_transaction', { operations: args.operations, expectedRevision: 0 }, { ok: false }),
		...call(3, 'preflight_transaction', args, { ok: true }),
		{ at: 1, type: 'request', message: { id: 4, method: 'resources/read', params: { uri: 'openfairygui://docs/workflow' } } },
		{ at: 2, type: 'response', message: { id: 4, result: {} } },
		{ at: 3, type: 'request', message: { id: 5, method: 'tools/list' } },
		{ at: 4, type: 'response', message: { id: 5, result: { tools: [{ name: 'example', inputSchema: { type: 'object', description: '字节' }, outputSchema: { type: 'object' } }] } } },
	];
	const metrics = observations(trace, 100);
	assert.equal(metrics.failedCalls, 2); assert.equal(metrics.staleRejections, 1);
	assert.equal(metrics.repeatedApplyArguments, 1); assert.equal(metrics.previews, 1);
	assert.deepEqual(metrics.documentationReads, ['openfairygui://docs/workflow']);
	assert.deepEqual(metrics.discoveries, [{ tools: [{ name: 'example', inputBytes: Buffer.byteLength(JSON.stringify({ type: 'object', description: '字节' })), outputBytes: 17 }], inputBytes: 40, outputBytes: 17 }]);
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
	assert.equal(evaluationOptions({ runner: 'reference' }).tasks.length, 10);
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

test('artifact host never widens editing tools or accepts arbitrary execution inputs', () => {
	assert.equal(EVAL_METHODS.length, 10);
	assert(!EVAL_METHODS.some((method) => /publish|restore|exec/.test(method)));
	for (const tool of ARTIFACT_TOOLS) assertArtifactTool('publish-consume', tool.name, tool.name.endsWith('_inspect') ? { target: 'published' } : {});
	for (const [name, args] of [
		['ofgui_artifact_publish', { output: '../escape' }], ['ofgui_artifact_restore', { force: true }],
		['ofgui_artifact_context', { command: 'anything' }], ['ofgui_artifact_inspect', { target: '../escape' }],
		['ofgui_artifact_inspect', { target: 'published', path: '/other' }], ['openfairygui_backend_open_session', {}],
	]) assert.throws(() => assertArtifactTool('publish-consume', name, args));
	assert.throws(() => assertArtifactTool('restore-trusted', 'ofgui_artifact_publish', {}));
});

test('artifact grading needs real commands, decoded pixels, supported semantics and untouched inputs', () => {
	const expected = [{ id: 'pkg', resources: [{ id: 'component', reference: 'image' }, { id: 'image' }] }];
	const trace = [];
	for (const [index, [name, args]] of [['publish', {}], ['restore', {}], ['inspect', { target: 'published' }], ['inspect', { target: 'restored' }]].entries()) {
		trace.push({ type: 'request', message: { id: index, method: 'tools/call', params: { name: `ofgui_artifact_${name}`, arguments: args } } },
			{ type: 'response', message: { id: index, result: { structuredContent: { artifactResult: { success: true } } } } });
	}
	const valid = { expected, actual: { published: { semantics: expected, pixelsMatch: true }, restored: { semantics: expected, pixelsMatch: true, validation: { status: 'valid', complete: true } }, exactOutputFiles: true },
		beforeFiles: { 'source/keep': 'keep' }, actualFiles: { 'source/keep': 'keep', 'release/package.fui': 'binary', 'restored/project.fairy': 'project' },
		trace, final: { outcome: 'completed', blocker: null, facts: { packageCount: 1, resourceCount: 2, validationStatus: 'valid' } }, runnerOk: true, isolated: true, publishTask: true };
	assert(gradeArtifactEvaluation(valid).passed);
	for (const broken of [
		{ trace: [] }, { runnerOk: false }, { isolated: false }, { final: null },
		{ trace: trace.map((entry) => entry.type === 'response' ? { ...entry, message: { ...entry.message, result: { ...entry.message.result, isError: true } } } : entry) },
		{ trace: [...trace, { type: 'scope-violation' }] },
		{ actualFiles: { ...valid.actualFiles, 'source/keep': 'changed' } },
		{ actualFiles: { ...valid.actualFiles, '.restored.restore-staging/extra': 'leak' } },
		{ actual: { ...valid.actual, exactOutputFiles: false } },
		{ actual: { ...valid.actual, published: { semantics: expected, pixelsMatch: false } } },
		{ actual: { ...valid.actual, restored: { ...valid.actual.restored, semantics: [] } } },
		{ actual: { ...valid.actual, restored: { ...valid.actual.restored, validation: { status: 'valid', complete: false } } } },
	]) assert(!gradeArtifactEvaluation({ ...valid, ...broken }).passed, JSON.stringify(broken));
	const restoreOnly = { ...valid, publishTask: false, beforeFiles: { ...valid.beforeFiles, 'release/package.fui': 'binary' }, trace: trace.filter((entry) => entry.message.id !== 0) };
	assert(gradeArtifactEvaluation(restoreOnly).passed);
	assert(!gradeArtifactEvaluation({ ...restoreOnly, actualFiles: { ...valid.actualFiles, 'release/package.fui': 'replaced' } }).passed);
});
