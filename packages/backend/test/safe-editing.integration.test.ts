import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import test from 'ava';
import { normalizeUamProject, validateTransactionSupport, type UamTransactionOperation } from '@openfairygui/core/uam';
import { BackendRuntime, BACKEND_ENTITY_QUERY_LIMITS, type ApplySessionTransactionInput, type QueryEntityInput } from '../src/index.js';
import type { BackendContext } from '../src/services/context.js';
import type { AuthoringService } from '../src/services/authoring-service.js';
import { createBackendFixtureProject, createBackendRuntime, createTempBackendProject } from './helpers.js';

const nodeTarget = { kind: 'displayNode', selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' } } as const;

function sessionState(runtime: BackendRuntime, sessionId: string) {
	// Inspect authoritative state, not just the public outline, to catch hidden preview writes.
	const { context, eventSequence } = runtime as unknown as { context: BackendContext; eventSequence: number };
	const session = context.sessions.get(sessionId);
	assert(session);
	const snapshot = runtime.getSession({ sessionId });
	assert(snapshot.ok);
	return structuredClone({
		snapshot: snapshot.data, project: session.project,
		pendingFiles: session.pendingStaleSourceFiles, pendingFolders: session.pendingStaleResourceFolders,
		pendingBranches: session.pendingStaleBranchDirectories,
		cache: context.cacheBySession, events: context.eventsBySession, jobs: context.jobsBySession, eventSequence,
	});
}

async function diskState(root: string) {
	const entries = await fs.readdir(root, { recursive: true, withFileTypes: true });
	return Promise.all(entries.map(async (entry) => {
		const file = path.join(entry.parentPath, entry.name);
		return [path.relative(root, file), entry.isDirectory() ? null : await fs.readFile(file)];
	}));
}

test('fixed entity projections are revision-bound, byte-free and detached without changing session state', async (t) => {
	const project = createBackendFixtureProject();
	assert(project.packages[0].resources[0].kind === 'image');
	project.packages[0].resources[0].sourceBytes = new Uint8Array([1, 2, 3]);
	project.packages[0].resources[0].sourcePath = 'private-source-bookkeeping';
	const normalized = normalizeUamProject(project);
	assert(normalized.packages[0].resources[0].kind === 'image');
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({ project });
	assert(opened.ok);
	const sessionId = opened.data.sessionId;
	const state = () => [runtime.getSession({ sessionId }), runtime.getProjectOutline({ sessionId }), runtime.getCacheSnapshot({ sessionId }), runtime.getEvents({ sessionId }), runtime.listJobs({ sessionId })].map((result) => {
		assert(result.ok); return result.data;
	});
	const before = state();
	const query = (target: QueryEntityInput['target']) => {
		const result = runtime.queryEntity({ sessionId, target });
		assert(result.ok, JSON.stringify(result));
		t.is(result.meta.revision, 0);
		t.is(result.data.sessionId, sessionId);
		t.is(result.data.revision, 0);
		return result.data;
	};
	const resource = query({ kind: 'resource', selector: { packageId: 'pkg001', resourceId: 'img001' } });
	assert(resource.entity.kind === 'resource' && resource.entity.properties.kind === 'image');
	t.deepEqual(resource.entity.properties.image, normalized.packages[0].resources[0].image);
	t.false(JSON.stringify(resource).includes('sourceBytes'));
	t.false(JSON.stringify(resource).includes('private-source-bookkeeping'));
	resource.entity.properties.image.smoothing = !resource.entity.properties.image.smoothing;
	const component = query({ kind: 'component', selector: { packageId: 'pkg001', componentResourceId: 'cmp001' } });
	assert(component.entity.kind === 'component');
	t.false('displayList' in component.entity.properties);
	t.false('controllers' in component.entity.properties);
	component.entity.properties.properties.pivot.x = 900;
	const node = query(nodeTarget);
	assert(node.entity.kind === 'displayNode' && node.entity.properties.kind === 'text');
	const originalText = node.entity.properties.text;
	node.entity.properties.text = 'outside mutation';
	node.entity.properties.position.x = 900;
	node.target.selector.packageId = 'outside';
	const again = query(nodeTarget);
	assert(again.entity.kind === 'displayNode' && again.entity.properties.kind === 'text');
	t.is(again.entity.properties.text, originalText);
	t.not(again.entity.properties.position.x, 900);
	const componentAgain = query({ kind: 'component', selector: { packageId: 'pkg001', componentResourceId: 'cmp001' } });
	assert(componentAgain.entity.kind === 'component');
	t.not(componentAgain.entity.properties.properties.pivot.x, 900);
	const imageAgain = query({ kind: 'resource', selector: { packageId: 'pkg001', resourceId: 'img001' } });
	assert(imageAgain.entity.kind === 'resource' && imageAgain.entity.properties.kind === 'image');
	t.deepEqual(imageAgain.entity.properties.image, normalized.packages[0].resources[0].image);
	t.deepEqual(state(), before);
	const applied = await runtime.applyTransaction({ sessionId, expectedRevision: 0, operations: [{ kind: 'setDisplayNodeProps', selector: nodeTarget.selector, props: { text: 'committed' } }] });
	assert(applied.ok);
	const current = runtime.queryEntity({ sessionId, target: nodeTarget });
	assert(current.ok && current.data.entity.kind === 'displayNode' && current.data.entity.properties.kind === 'text');
	t.is(current.data.revision, 1);
	t.is(current.meta.revision, 1);
	t.is(current.data.entity.properties.text, 'committed');
	await runtime.closeSession({ sessionId });
});

test('entity query rejects invalid, missing and ambiguous selectors, and closed sessions', async (t) => {
	const runtime = new BackendRuntime();
	const project = createBackendFixtureProject();
	const opened = runtime.openProjectSession({ project });
	assert(opened.ok);
	const sessionId = opened.data.sessionId;
	for (const [target, reason] of [
		[Object.assign([], nodeTarget), 'invalid_query'],
		[{ kind: 'resource', selector: { packageId: 'pkg001' } }, 'invalid_query'],
		[{ ...nodeTarget, selector: { ...nodeTarget.selector, invented: true } }, 'invalid_query'],
		[{ ...nodeTarget, selector: { ...nodeTarget.selector, displayNodeId: 'missing' } }, 'not_found'],
		[{ kind: 'component', selector: { packageId: 'pkg001', componentResourceId: 'img001' } }, 'not_found'],
	] as const) {
		const result = runtime.queryEntity({ sessionId, target } as QueryEntityInput);
		assert(!result.ok && result.error.code === 'entity_query_failed');
		t.is(result.error.reason, reason);
		t.is(result.meta.revision, 0);
	}
	await runtime.closeSession({ sessionId });
	const closed = runtime.queryEntity({ sessionId, target: nodeTarget });
	assert(!closed.ok); t.is(closed.error.code, 'session_not_found');
	project.packages[0].resources.push(structuredClone(project.packages[0].resources[1]));
	const duplicate = runtime.openProjectSession({ project });
	assert(duplicate.ok);
	const ambiguous = runtime.queryEntity({ sessionId: duplicate.data.sessionId, target: nodeTarget });
	assert(!ambiguous.ok && ambiguous.error.code === 'entity_query_failed');
	t.is(ambiguous.error.reason, 'ambiguous');
	await runtime.closeSession({ sessionId: duplicate.data.sessionId });
});

test('entity query applies UTF-8 response budgets and rejects non-JSON native payloads without truncation', async (t) => {
	const tooDeep = Array.from({ length: BACKEND_ENTITY_QUERY_LIMITS.maxDepth + 1 }).reduce((value: unknown) => ({ child: value }), 'leaf');
	for (const [text, reason] of [
		['你'.repeat(100000), 'response_budget_exceeded'],
		[new Array(BACKEND_ENTITY_QUERY_LIMITS.maxNodes + 1), 'response_budget_exceeded'],
		[tooDeep, 'response_budget_exceeded'],
		[new Uint8Array([1]), 'non_json_value'],
	] as const) {
		const project = createBackendFixtureProject();
		const component = project.packages[0].resources[1];
		assert(component.kind === 'component');
		const node = component.component.displayList[1];
		assert(node.kind === 'text');
		node.text = text as string;
		const runtime = new BackendRuntime();
		const opened = runtime.openProjectSession({ project });
		assert(opened.ok);
		const sessionId = opened.data.sessionId;
		const result = runtime.queryEntity({ sessionId, target: nodeTarget });
		assert(!result.ok && result.error.code === 'entity_query_failed');
		t.is(result.error.reason, reason);
		t.false('data' in result);
		t.deepEqual(runtime.getSession({ sessionId }).ok, true);
		t.deepEqual(opened.data.capabilities.read.entityQuery.limits, BACKEND_ENTITY_QUERY_LIMITS);
		await runtime.closeSession({ sessionId });
	}
});

test('transaction preview executes and discards on clean and dirty file-backed sessions', async (t) => {
	const fixture = await createTempBackendProject();
	const runtime = createBackendRuntime();
	const opened = await runtime.openSession({ projectPath: fixture.fairyPath });
	assert(opened.ok);
	const sessionId = opened.data.sessionId;
	try {
		const files = await diskState(fixture.rootDir);
		const operations: UamTransactionOperation[] = [{ kind: 'renameResource', selector: { packageId: 'pkg001', resourceId: 'cmp001' }, newName: 'RenamedView' }];
		for (const expectedRevision of [0, 1]) {
			const input = { sessionId, expectedRevision, operations };
			const before = sessionState(runtime, sessionId);
			const preview = await runtime.preflightTransaction(input);
			assert(preview.ok, JSON.stringify(preview));
			t.deepEqual(preview.data, { sessionId, baseRevision: expectedRevision, mode: 'execute-and-discard' });
			t.is(preview.meta.revision, expectedRevision);
			t.deepEqual(preview.meta.diagnostics, []);
			t.deepEqual(sessionState(runtime, sessionId), before);
			t.deepEqual(await diskState(fixture.rootDir), files);
			const rejected = await runtime.preflightTransaction({ ...input, operations: [...operations,
				{ kind: 'removeController', selector: { packageId: 'pkg001', componentResourceId: 'cmp001', controllerName: 'missing' } },
			] });
			t.false(rejected.ok);
			t.deepEqual(sessionState(runtime, sessionId), before);
			t.deepEqual(await diskState(fixture.rootDir), files);
			const applied = await runtime.applyTransaction(input);
			assert(applied.ok, JSON.stringify(applied));
			t.is(applied.data.revision, expectedRevision + 1);
			t.true(applied.data.dirty);
			operations[0] = { kind: 'setDisplayNodeProps', selector: nodeTarget.selector, props: { text: 'committed only by apply' } };
		}
		t.deepEqual(await diskState(fixture.rootDir), files);
	} finally {
		await runtime.closeSession({ sessionId }); await fixture.cleanup();
	}
});

test('preview preserves real execution failures and diagnostics, not just support-check results', async (t) => {
	const project = createBackendFixtureProject();
	const operations: UamTransactionOperation[] = [
		{ kind: 'setDisplayNodeProps', selector: nodeTarget.selector, props: { text: 'must not leak' } },
		{ kind: 'removeController', opId: 'missing-controller', selector: { packageId: 'pkg001', componentResourceId: 'cmp001', controllerName: 'missing' } },
	];
	t.deepEqual(validateTransactionSupport(project, operations), []);
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({ project });
	assert(opened.ok);
	const sessionId = opened.data.sessionId;
	try {
		const input = { sessionId, expectedRevision: 0, operations };
		const before = sessionState(runtime, sessionId);
		const preview = await runtime.preflightTransaction(input);
		assert(!preview.ok && preview.error.code === 'execution_failure', JSON.stringify(preview));
		t.is(preview.error.stage, 'execution');
		t.is(preview.error.opIndex, 1);
		t.is(preview.error.opId, 'missing-controller');
		t.deepEqual(sessionState(runtime, sessionId), before);
		const applied = await runtime.applyTransaction(input);
		assert(!applied.ok);
		t.deepEqual(preview.error, applied.error);
		t.deepEqual(preview.meta.diagnostics, applied.meta.diagnostics);
		t.deepEqual(sessionState(runtime, sessionId).project, before.project);
		t.deepEqual(sessionState(runtime, sessionId).snapshot, before.snapshot);
	} finally { await runtime.closeSession({ sessionId }); }
});

test('preview and apply share invalid payload and selector outcomes without preview side effects', async (t) => {
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({ project: createBackendFixtureProject() });
	assert(opened.ok);
	const sessionId = opened.data.sessionId;
	try {
		const batches: UamTransactionOperation[][] = [
			[{ kind: 'setDisplayNodeProps', selector: { ...nodeTarget.selector, displayNodeId: 'missing' }, props: { text: 'bad selector' } }],
			[{ kind: 'replaceResourceBytes', selector: { packageId: 'pkg001', resourceId: 'img001' }, sourceBytes: new Uint8Array([1, 2, 3]) }],
			[{ kind: 'addResource', selector: { packageId: 'pkg001' }, resource: {
				kind: 'misc', id: 'new-asset', name: 'new.bin', path: '/', file: 'new.bin', exported: false,
				favorite: false, branch: '', branchItemIds: [], metadata: null,
			} }],
		];
		for (const operations of batches) {
			const input = { sessionId, expectedRevision: 0, operations };
			const before = sessionState(runtime, sessionId);
			const preview = await runtime.preflightTransaction(input);
			assert(!preview.ok, JSON.stringify(preview));
			t.is(preview.meta.revision, 0);
			t.true(preview.meta.diagnostics.length > 0);
			t.deepEqual(sessionState(runtime, sessionId), before);
			const applied = await runtime.applyTransaction(input);
			assert(!applied.ok);
			t.deepEqual(preview.error, applied.error);
			t.deepEqual(preview.meta.diagnostics, applied.meta.diagnostics);
			t.deepEqual(sessionState(runtime, sessionId).project, before.project);
		}
	} finally { await runtime.closeSession({ sessionId }); }
});

test('preview reserves no revision and does not promise save capabilities', async (t) => {
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({ project: createBackendFixtureProject() });
	assert(opened.ok);
	const sessionId = opened.data.sessionId;
	const input: ApplySessionTransactionInput = { sessionId, expectedRevision: 0, operations: [{ kind: 'setDisplayNodeProps', selector: nodeTarget.selector, props: { text: 'planned' } }] };
	const preview = await runtime.preflightTransaction(input);
	assert(preview.ok);
	t.true((await runtime.applyTransaction({ ...input, operations: [{ kind: 'setDisplayNodeProps', selector: nodeTarget.selector, props: { text: 'intervening edit' } }] })).ok);
	const before = sessionState(runtime, sessionId);
	const stalePreview = await runtime.preflightTransaction(input);
	assert(!stalePreview.ok);
	t.is(stalePreview.error.code, 'stale_write');
	t.deepEqual(sessionState(runtime, sessionId), before);
	const staleApply = await runtime.applyTransaction(input);
	assert(!staleApply.ok);
	t.deepEqual(staleApply.error, stalePreview.error);
	t.deepEqual(sessionState(runtime, sessionId).project, before.project);
	const queried = runtime.queryEntity({ sessionId, target: nodeTarget });
	assert(queried.ok);
	input.expectedRevision = queried.data.revision;
	t.true((await runtime.preflightTransaction(input)).ok);
	const applied = await runtime.applyTransaction(input);
	assert(applied.ok);
	const saved = await runtime.saveSession({ sessionId, expectedRevision: applied.data.revision });
	assert(!saved.ok); t.is(saved.error.code, 'capability_unavailable');
	await runtime.closeSession({ sessionId });
	const closed = await runtime.preflightTransaction(input);
	assert(!closed.ok); t.is(closed.error.code, 'session_not_found');
});

test('preview snapshots queued input and shared bytes before waiting for the session', async (t) => {
	const png = await sharp({ create: { width: 1, height: 1, channels: 4, background: '#ffffff' } }).png().toBuffer();
	const bytes = new Uint8Array(new SharedArrayBuffer(png.length));
	bytes.set(png);
	const project = createBackendFixtureProject();
	assert(project.packages[0].resources[0].kind === 'image');
	project.packages[0].resources[0].sourceBytes = new Uint8Array(png);
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({ project });
	assert(opened.ok);
	const sessionId = opened.data.sessionId;
	const before = sessionState(runtime, sessionId);
	let release = (): void => undefined;
	const gate = new Promise<void>((resolve) => { release = resolve; });
	const { authoringService } = runtime as unknown as { authoringService: AuthoringService };
	const blocking = authoringService.runSessionExclusive(sessionId, () => gate);
	const input: ApplySessionTransactionInput = { sessionId, expectedRevision: 0, operations: [
		{ kind: 'replaceResourceBytes', selector: { packageId: 'pkg001', resourceId: 'img001' }, sourceBytes: bytes },
	] };
	const previewing = runtime.preflightTransaction(input);
	input.expectedRevision = 99;
	input.operations.length = 0;
	bytes.fill(0);
	release();
	await blocking;
	try {
		const preview = await previewing;
		assert(preview.ok, JSON.stringify(preview));
		t.is(preview.data.baseRevision, 0);
		t.deepEqual(sessionState(runtime, sessionId), before);
	} finally { await runtime.closeSession({ sessionId }); }
});
