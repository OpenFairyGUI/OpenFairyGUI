import assert from 'node:assert/strict';
import test from 'ava';
import { normalizeUamProject } from '@openfairygui/core/uam';
import { BackendRuntime, BACKEND_ENTITY_QUERY_LIMITS, type QueryEntityInput } from '../src/index.js';
import { createBackendFixtureProject } from './helpers.js';

const nodeTarget = { kind: 'displayNode', selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' } } as const;

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
	for (const [text, reason] of [['你'.repeat(100000), 'response_budget_exceeded'], [new Uint8Array([1]), 'non_json_value']] as const) {
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
