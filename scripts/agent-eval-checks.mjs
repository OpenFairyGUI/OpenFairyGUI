import assert from 'node:assert/strict';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export const EVAL_METHODS = ['getCapabilities', 'openSession', 'getSession', 'getProjectOutline', 'queryEntity', 'validateSession', 'preflightTransaction', 'applyTransaction', 'saveSession', 'closeSession'];
export const CONCURRENT_TEXT = 'Title edited concurrently';
export const PENDING_TEXT = 'Unsaved host work';
export const BLOCKERS = { 'missing-source-bytes': 'unavailable_resource_source_bytes', 'path-policy': 'path_policy_violation' };
export const FINAL_SCHEMA = {
	type: 'object', additionalProperties: false, required: ['summary', 'facts', 'outcome', 'blocker'],
	properties: {
		summary: { type: 'string' },
		outcome: { type: 'string', enum: ['completed', 'blocked'] },
		blocker: { type: ['string', 'null'], description: 'Exact diagnostic code only, without explanatory text; null when completed. Put the explanation and required host action in summary.' },
		facts: {
			type: 'object', additionalProperties: false, required: ['packageCount', 'resourceCount', 'validationStatus'],
			properties: { packageCount: { type: ['integer', 'null'] }, resourceCount: { type: ['integer', 'null'] }, validationStatus: { type: ['string', 'null'], description: 'Exact validation status returned by the product, without explanatory text, or null when not applicable.' } },
		},
	},
};

export function assertWithin(root, candidate) {
	const relative = path.relative(root, candidate);
	assert(relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), `Evaluation scope violation: ${candidate}`);
}

export function scopedFileSystem(base, workspace, record) {
	const guarded = { ...base };
	async function check(file) {
		try { assertWithin(workspace, await base.resolvePath(file)); }
		catch (error) { record({ type: 'scope-violation', file, message: error.message }); throw error; }
	}
	for (const method of ['stat', 'readdir', 'readFile', 'readFileRaw', 'writeFile', 'writeFileRaw', 'mkdir', 'unlink', 'rmdir', 'validateProjectRoot', 'acquireSessionLock']) {
		if (!base[method]) continue;
		guarded[method] = async (file, ...args) => {
			await check(file);
			if (/^(write|mkdir|unlink|rmdir|acquire)/.test(method)) record({ type: 'filesystem-write', method, file });
			return base[method](file, ...args);
		};
	}
	if (base.runProjectWriteTransaction) guarded.runProjectWriteTransaction = async (root, write) => {
		await check(root);
		record({ type: 'filesystem-write', method: 'runProjectWriteTransaction', file: root });
		return base.runProjectWriteTransaction(root, (staged) => write(scopedFileSystem(staged, workspace, record)));
	};
	return guarded;
}

export function expectedProject(before, taskId) {
	assert(['inspect-validate', 'rename-save', 'stale-revision-recovery', 'edit-display-node', 'edit-controller', 'edit-transition', ...Object.keys(BLOCKERS)].includes(taskId), `No oracle for task: ${taskId}`);
	const project = structuredClone(before);
	const component = project.packages[0].resources[0];
	assert.equal(component.kind, 'component');
	if (['rename-save', 'stale-revision-recovery'].includes(taskId)) component.name = 'RenamedView';
	if (taskId === 'stale-revision-recovery') component.component.displayList[0].text = CONCURRENT_TEXT;
	if (taskId === 'edit-display-node') Object.assign(component.component.displayList.find((node) => node.id === 'title'), { text: 'Ready to edit', position: { x: 40, y: 56 } });
	if (taskId === 'edit-controller') component.component.controllers.find((controller) => controller.name === 'state').pages.find((page) => page.id === '1').name = 'Ready';
	// XML reads CSV transition values as strings; the oracle compares the saved/reread UAM, not the in-memory edit payload.
	if (taskId === 'edit-transition') Object.assign(component.component.transitions.find((transition) => transition.name === 'intro').items.find((item) => item.label === 'move-title'), { duration: 18, endValue: ['120', '64'] });
	return project;
}

export function changedPaths(before, after) {
	return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => before[key] !== after[key]).sort();
}

export function completedCalls(trace) {
	const requests = new Map();
	const calls = [];
	for (const entry of trace) {
		if (entry.type === 'request') requests.set(entry.message.id, entry);
		if (entry.type !== 'response') continue;
		const request = requests.get(entry.message.id);
		if (request) calls.push({ request: request.message, response: entry.message, durationMs: entry.at - request.at });
	}
	return calls;
}

function stable(value) {
	if (Array.isArray(value)) return value.map(stable);
	if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
	return value;
}

export function observations(trace, durationMs, events = []) {
	const calls = completedCalls(trace);
	const tools = calls.filter((call) => call.request.method === 'tools/call');
	const submissions = tools.filter((call) => call.request.params.name.endsWith('_apply_transaction'));
	const duplicates = (values) => values.length - new Set(values.map((value) => JSON.stringify(stable(value)))).size;
	const discoveries = calls.filter((call) => call.request.method === 'tools/list' && call.response.result?.tools).map(({ response }) => {
		const tools = response.result.tools.map((tool) => ({ name: tool.name, inputBytes: Buffer.byteLength(JSON.stringify(tool.inputSchema)), outputBytes: Buffer.byteLength(JSON.stringify(tool.outputSchema ?? {})) }));
		return { tools, inputBytes: tools.reduce((sum, tool) => sum + tool.inputBytes, 0), outputBytes: tools.reduce((sum, tool) => sum + tool.outputBytes, 0) };
	});
	return {
		durationMs, toolCalls: tools.length,
		discoveries, // Compact UTF-8 JSON bytes, not model tokens or a billing estimate.
		clientToolCalls: events.filter((event) => event.type === 'item.completed' && event.item?.type === 'mcp_tool_call').length,
		clientFailedCalls: events.filter((event) => event.type === 'item.completed' && event.item?.type === 'mcp_tool_call' && (event.item.error || event.item.status === 'failed')).length,
		failedCalls: calls.filter(({ response }) => response.error || response.result?.isError).length,
		staleRejections: tools.filter(({ response }) => response.result?.structuredContent?.backendResult?.error?.code === 'stale_write').length,
		documentationReads: calls.filter(({ request, response }) => request.method === 'resources/read' && /openfairygui:\/\/(docs|contracts)\//.test(request.params.uri) && !response.error).map(({ request }) => request.params.uri),
		previews: tools.filter((call) => call.request.params.name.endsWith('_preflight_transaction')).length,
		repeatedApplyArguments: duplicates(submissions.map((call) => call.request.params.arguments)),
		repeatedSuccessfulOperations: duplicates(submissions.filter((call) => call.response.result?.structuredContent?.backendResult?.ok).map((call) => call.request.params.arguments.operations)),
		usage: events.filter((event) => event.type === 'turn.completed').map((event) => event.usage),
	};
}

export function isolatedCodexEvents(events) {
	const allowed = new Set(['agent_message', 'reasoning', 'mcp_tool_call', 'plan_update', 'error']);
	return events.every(({ item }) => {
		if (!item) return true;
		if (!allowed.has(item.type)) return false;
		if (item.type !== 'mcp_tool_call' || item.server === 'ofgui') return true;
		// Codex labels its own MCP discovery helpers as server=codex, not the target server.
		return item.server === 'codex' && ['list_mcp_resources', 'list_mcp_resource_templates'].includes(item.tool) && (!item.arguments?.server || item.arguments.server === 'ofgui');
	});
}

export function gradeEvaluation({ taskId, expected, actual, expectedFiles, actualFiles, trace, final, runnerOk, isolated, validation }) {
	const calls = completedCalls(trace);
	const backend = calls.map((call) => ({ ...call, result: call.response.result?.structuredContent?.backendResult }));
	const changes = changedPaths(expectedFiles, actualFiles);
	const injection = trace.find((entry) => entry.type === 'injection');
	const blocker = BLOCKERS[taskId];
	const states = trace.filter((entry) => entry.type === 'session-state');
	const initial = states.find((entry) => entry.phase === 'before')?.state;
	const checks = {
		runnerCompleted: runnerOk,
		isolatedTools: isolated,
		projectReadable: actual !== null,
		validProject: validation === 'valid',
		exactSemantics: isDeepStrictEqual(expected, actual),
		exactFiles: changes.length === 0,
		noOutOfScopeAccess: !trace.some((entry) => entry.type === 'scope-violation'),
		observedValidation: backend.some((call) => call.request.params?.name?.endsWith('_validate_session') && call.result?.ok && call.result.data.status === (blocker ? initial?.validation?.status : 'valid')),
	};
	if (blocker) {
		checks.honestStop = final?.outcome === 'blocked' && final?.blocker === blocker;
		checks.observedBlocker = backend.some((call) => !call.result?.ok && call.result?.meta?.diagnostics?.some((diagnostic) => diagnostic.code === blocker));
		checks.noMutation = !backend.some((call) => /_(apply_transaction|save_session|close_session)$/.test(call.request.params?.name) && call.result?.ok);
		checks.pendingWorkPreserved = !!initial?.session?.dirty && initial.session.revision === 1
			&& states.filter((entry) => entry.phase === 'before').length === 1
			&& states.some((entry) => entry.phase === 'after')
			&& states.every((entry) => isDeepStrictEqual(entry.state, initial));
	} else if (taskId === 'inspect-validate') {
		checks.inspectionFacts = isDeepStrictEqual(final?.facts, { packageCount: actual?.packages.length, resourceCount: actual?.packages.reduce((sum, pkg) => sum + pkg.resources.length, 0), validationStatus: validation });
		checks.noEdit = !backend.some((call) => /_(apply_transaction|save_session)$/.test(call.request.params?.name) && call.result?.ok);
	} else {
		checks.saved = backend.some((call) => call.request.params?.name?.endsWith('_save_session') && call.result?.ok && !call.result.data.dirty);
	}
	if (taskId === 'stale-revision-recovery') {
		checks.conflictExercised = !!injection?.ok && injection.revision === injection.previousRevision + 1 && backend.some((call) => call.request.id === injection.requestId && call.result?.error?.code === 'stale_write');
	}
	if (taskId === 'edit-controller' || taskId === 'edit-transition') {
		const kind = taskId === 'edit-controller' ? 'controller' : 'transition';
		checks.observedEntityQuery = backend.some((call) => call.request.params?.name?.endsWith('_query_entity') && call.result?.ok
			&& call.result.data.entity.kind === kind && call.result.data.target.kind === kind
			&& call.result.data.target.selector.packageId === expected.packages[0].id
			&& call.result.data.target.selector.componentResourceId === expected.packages[0].resources[0].id
			&& (kind === 'controller' ? call.result.data.target.selector.controllerName === 'state' : call.result.data.target.selector.transitionName === 'intro'));
	}
	return { passed: Object.values(checks).every(Boolean), checks, unexpectedFiles: changes };
}

export function codexArguments({ cwd, server, schema, output, instructions, model, enabledTools }) {
	const args = ['exec', '--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '--json', '-C', cwd, '--output-schema', schema, '-o', output];
	if (model) args.push('--model', model);
	for (const feature of ['shell_tool', 'unified_exec', 'shell_snapshot', 'plugins', 'apps', 'memories', 'multi_agent', 'multi_agent_v2', 'browser_use', 'browser_use_external', 'browser_use_full_cdp_access', 'computer_use', 'in_app_browser', 'image_generation', 'hooks', 'skill_search', 'skill_mcp_dependency_install', 'workspace_dependencies', 'goals', 'sleep_tool']) args.push('--disable', feature);
	args.push('--enable', 'skip_host_skill_discovery', '--enable', 'code_mode_host');
	for (const config of ['approval_policy="never"', 'web_search="disabled"', 'tools.view_image=false', 'project_doc_max_bytes=0', 'history.persistence="none"', 'suppress_unstable_features_warning=true', `model_instructions_file=${JSON.stringify(instructions)}`, `mcp_servers.ofgui={command=${JSON.stringify(process.execPath)},args=${JSON.stringify(server)},required=true,enabled_tools=${JSON.stringify(enabledTools)},default_tools_approval_mode="approve",tool_timeout_sec=60}`]) args.push('-c', config);
	return [...args, '-'];
}
