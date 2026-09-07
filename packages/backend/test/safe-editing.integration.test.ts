import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import test from 'ava';
import { liftDocumentToUamProject, materializeUamProject, normalizeUamProject, validateTransactionSupport, type UamTransactionOperation } from '@openfairygui/core/uam';
import { BackendRuntime, BACKEND_ENTITY_QUERY_LIMITS, BACKEND_SESSION_READ_LIMITS, BACKEND_TRANSACTION_PREVIEW_LIMITS, type ApplySessionTransactionInput, type QueryEntityInput, type ReadResourceBytesInput } from '../src/index.js';
import type { BackendContext } from '../src/services/context.js';
import type { AuthoringService } from '../src/services/authoring-service.js';
import { createBackendFixtureProject, createBackendRuntime, createTempBackendProject } from './helpers.js';

const nodeTarget = { kind: 'displayNode', selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' } } as const;
const controllerTarget = { kind: 'controller', selector: { packageId: 'pkg001', componentResourceId: 'cmp001', controllerName: 'state' } } as const;
const transitionTarget = { kind: 'transition', selector: { packageId: 'pkg001', componentResourceId: 'cmp001', transitionName: 'intro' } } as const;

test('session reads capture committed unsaved UAM and detached primary bytes without changing any state', async (t) => {
	const { project } = complexQueryProject();
	const image = project.packages[0].resources.find((entry) => entry.kind === 'image');
	assert(image?.kind === 'image');
	project.settings.customProperties = { sourceBytes: [7, 8], nested: { sourcePath: 'keep' } };
	image.sourcePath = 'assets/Main/original.png';
	image.sourceBytes = new Uint8Array(await sharp({ create: { width: 320, height: 180, channels: 4, background: '#123456' } }).png().toBuffer());
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({ project });
	assert(opened.ok);
	const sessionId = opened.data.sessionId;
	try {
		const selector = { packageId: 'pkg001', resourceId: image.id };
		const before = sessionState(runtime, sessionId);
		const state = runtime.readSessionState({ sessionId });
		const bytes = runtime.readResourceBytes({ sessionId, expectedRevision: 0, selector });
		assert(state.ok && bytes.ok);
		const expected = structuredClone(before.project);
		for (const pkg of expected.packages) for (const resource of pkg.resources) if (resource.kind !== 'component') delete resource.sourceBytes;
		t.deepEqual(state.data.project, expected);
		t.is(state.data.revision, 0); t.is(state.data.lastSavedRevision, 0); t.false(state.data.dirty);
		t.true(state.data.readComplete); t.is(state.data.uamFidelity, 'full'); t.deepEqual(state.data.readDiagnostics, []);
		t.deepEqual(bytes.data.sourceBytes, image.sourceBytes);
		state.data.project.packages[0].resources.length = 0; bytes.data.sourceBytes.fill(0); bytes.data.selector.resourceId = 'caller mutation';
		t.deepEqual(sessionState(runtime, sessionId), before);
		const { authoringService } = runtime as unknown as { authoringService: AuthoringService };
		let release = (): void => undefined;
		const blocking = authoringService.runSessionExclusive(sessionId, () => new Promise<void>((resolve) => { release = resolve; }));
		await Promise.resolve();
		const applying = runtime.applyTransaction({ sessionId, expectedRevision: 0, operations: [{ kind: 'setDisplayNodeProps', selector: nodeTarget.selector, props: { text: 'unsaved read' } }] });
		t.deepEqual(runtime.readSessionState({ sessionId }).ok && sessionState(runtime, sessionId), before);
		release(); await blocking;
		assert((await applying).ok);
		const current = runtime.readSessionState({ sessionId, expectedRevision: 1 });
		assert(current.ok);
		t.is(current.data.revision, 1); t.true(current.data.dirty); t.is(current.data.lastSavedRevision, 0);
		const component = current.data.project.packages[0].resources.find((entry) => entry.id === 'cmp001');
		assert(component?.kind === 'component');
		const title = component.component.displayList.find((entry) => entry.id === 'n1');
		assert(title?.kind === 'text'); t.is(title.text, 'unsaved read');
		for (const result of [runtime.readSessionState({ sessionId, expectedRevision: 0 }), runtime.readResourceBytes({ sessionId, expectedRevision: 0, selector })]) {
			assert(!result.ok && result.error.code === 'stale_read');
			t.is(result.error.actualRevision, 1); t.is(result.error.expectedRevision, 0); t.is(result.meta.revision, 1);
		}
		t.true(runtime.readResourceBytes({ sessionId, expectedRevision: 1, selector }).ok);
	} finally { await runtime.closeSession({ sessionId }); }
	t.false(runtime.readSessionState({ sessionId }).ok);
	const closed = runtime.readResourceBytes({ sessionId, expectedRevision: 1, selector: { packageId: 'pkg001', resourceId: image.id } });
	assert(!closed.ok); t.is(closed.error.code, 'session_not_found');
});

test('session reads reject invalid inputs, unavailable bytes and ambiguous identities without hydration', async (t) => {
	const runtime = new BackendRuntime();
	const project = createBackendFixtureProject();
	const image = project.packages[0].resources[0]; assert(image.kind === 'image'); delete image.sourceBytes;
	const opened = runtime.openProjectSession({ project }); assert(opened.ok);
	const sessionId = opened.data.sessionId;
	try {
		const before = sessionState(runtime, sessionId);
		for (const [input, reason] of [
			[{ selector: { packageId: 'pkg001', resourceId: 'img001' } }, 'bytes_unavailable'],
			[{ expectedRevision: undefined, selector: { packageId: 'pkg001', resourceId: 'img001' } }, 'invalid_query'],
			[{ expectedRevision: -1, selector: { packageId: 'pkg001', resourceId: 'img001' } }, 'invalid_query'],
			[{ selector: { packageId: 'pkg001', resourceId: 'img001', extra: true } }, 'invalid_query'],
			[{ selector: { packageId: 'pkg001', resourceId: 'cmp001' } }, 'unsupported_resource'],
			[{ selector: { packageId: 'missing', resourceId: 'img001' } }, 'not_found'],
			[{ selector: { packageId: 'pkg001', resourceId: 'missing' } }, 'not_found'],
		] as const) {
			const result = runtime.readResourceBytes({ sessionId, expectedRevision: 0, ...input } as ReadResourceBytesInput);
			assert(!result.ok && result.error.code === 'session_read_failed'); t.is(result.error.reason, reason);
		}
		for (const expectedRevision of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			const result = runtime.readSessionState({ sessionId, expectedRevision });
			assert(!result.ok && result.error.code === 'session_read_failed'); t.is(result.error.reason, 'invalid_query');
		}
		t.true(runtime.readSessionState({ sessionId }).ok);
		t.deepEqual(sessionState(runtime, sessionId), before);
	} finally { await runtime.closeSession({ sessionId }); }
	for (const duplicate of ['package', 'resource']) {
		const ambiguous = structuredClone(project);
		if (duplicate === 'package') ambiguous.packages.push(structuredClone(ambiguous.packages[0]));
		else ambiguous.packages[0].resources.push(structuredClone(ambiguous.packages[0].resources[0]));
		const session = runtime.openProjectSession({ project: ambiguous }); assert(session.ok);
		const result = runtime.readResourceBytes({ sessionId: session.data.sessionId, expectedRevision: 0, selector: { packageId: 'pkg001', resourceId: 'img001' } });
		assert(!result.ok && result.error.code === 'session_read_failed'); t.is(result.error.reason, 'ambiguous');
		await runtime.closeSession({ sessionId: session.data.sessionId });
	}
});

test('session model budgets and fidelity failures are explicit; resource buffers are bounded independently', async (t) => {
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({ project: createBackendFixtureProject() }); assert(opened.ok);
	const sessionId = opened.data.sessionId;
	const { context } = runtime as unknown as { context: BackendContext };
	const session = context.sessions.get(sessionId)!;
	const image = session.project.packages[0].resources[0]; assert(image.kind === 'image');
	try {
		session.readComplete = false; session.uamFidelity = 'unsupported';
		session.readDiagnostics = [{ code: 'unreadable_source', severity: 'error', path: 'source.png', message: 'Retain source diagnostic' }];
		const read = runtime.readSessionState({ sessionId }); assert(read.ok);
		t.false(read.data.readComplete); t.is(read.data.uamFidelity, 'unsupported'); t.deepEqual(read.data.readDiagnostics, session.readDiagnostics);
		read.data.readDiagnostics.length = 0; t.is(session.readDiagnostics.length, 1);
		let deep: unknown = 'leaf'; for (let i = 0; i < 65; i++) deep = { deep };
		for (const [metadata, reason] of [
			[{ large: '界'.repeat(BACKEND_SESSION_READ_LIMITS.model.maxBytes / 2) }, 'response_budget_exceeded'],
			[{ large: Array(BACKEND_SESSION_READ_LIMITS.model.maxNodes).fill(0) }, 'response_budget_exceeded'],
			[deep, 'response_budget_exceeded'], [{ big: 1n }, 'non_json_value'], [{ number: Infinity }, 'non_json_value'],
		] as const) {
			session.project.settings.customProperties = { probe: metadata } as typeof session.project.settings.customProperties;
			const result = runtime.readSessionState({ sessionId });
			assert(!result.ok && result.error.code === 'session_read_failed'); t.is(result.error.reason, reason);
		}
		session.project.settings.customProperties = {};
		for (const size of [0, BACKEND_SESSION_READ_LIMITS.resourceBytes, BACKEND_SESSION_READ_LIMITS.resourceBytes + 1]) {
			image.sourceBytes = new Uint8Array(size);
			const result = runtime.readResourceBytes({ sessionId, expectedRevision: 0, selector: { packageId: 'pkg001', resourceId: 'img001' } });
			if (size > BACKEND_SESSION_READ_LIMITS.resourceBytes) {
				assert(!result.ok && result.error.code === 'session_read_failed'); t.is(result.error.reason, 'response_budget_exceeded');
			} else { assert(result.ok); t.is(result.data.sourceBytes.length, size); }
			t.true(runtime.readSessionState({ sessionId }).ok);
		}
	} finally { await runtime.closeSession({ sessionId }); }
});

function complexQueryProject() {
	const project = liftDocumentToUamProject(materializeUamProject(createBackendFixtureProject()));
	const resource = project.packages[0].resources[1];
	assert(resource.kind === 'component');
	resource.component.controllers = [{
		name: 'state', selectedIndex: 0, autoRadioGroupDepth: true, alias: 'State', exported: true,
		homePageType: 'specific', homePage: '0', pages: [{ id: '0', name: 'Idle', remark: 'Keep' }, { id: '1', name: 'Active', remark: 'Also keep' }],
		actions: [{ name: 'play', actionType: 0, fromPageIds: ['0'], toPageIds: ['1'], transitionName: 'intro', playTimes: 2, delay: 0.25, stopOnExit: true, targetNodeId: '', controllerName: '', targetPage: '' }],
	}];
	resource.component.transitions = [{
		name: 'intro', autoPlay: false, autoPlayTimes: 2, autoPlayDelay: 0.25, options: 1, fps: 24,
		items: [{ name: 'move', time: 0, actionType: 0, targetNodeId: 'n1', tween: true, duration: 0.5, startValue: [16, 18], endValue: [96, 48], easeType: 5, repeat: 0, yoyo: false, label: 'move-title', endLabel: 'done', path: '', customEasePath: '' }],
	}];
	resource.component.displayList[1].gears = [{ kind: 'display', name: 'display', controllerName: 'state', visibleOnPageIds: ['0', '1'] }];
	resource.component.transitions.push({ ...structuredClone(resource.component.transitions[0]), name: 'outro' });
	const other = structuredClone(resource);
	other.id = 'other-component'; other.name = 'OtherView';
	other.component.controllers[0].alias = 'Other state';
	other.component.transitions[0].autoPlayDelay = 9;
	project.packages[0].resources.unshift(other);
	return { project, component: resource.component };
}

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
	assert(node.target.kind === 'displayNode');
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
		[{ kind: 'project', selector: {} }, 'invalid_query'],
		[{ kind: 'package', selector: {} }, 'invalid_query'],
		[{ kind: 'package', selector: { packageId: 'missing' } }, 'not_found'],
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

test('settings queries provide detached complete payloads for revision-checked project and package updates', async (t) => {
	const project = liftDocumentToUamProject(materializeUamProject(createBackendFixtureProject()));
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
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({ project });
	assert(opened.ok);
	const sessionId = opened.data.sessionId;
	try {
		const before = sessionState(runtime, sessionId);
		const projectQuery = runtime.queryEntity({ sessionId, target: { kind: 'project' } });
		const packageQuery = runtime.queryEntity({ sessionId, target: { kind: 'package', selector: { packageId: pkg.id } } });
		assert(projectQuery.ok && projectQuery.data.entity.kind === 'project');
		assert(packageQuery.ok && packageQuery.data.entity.kind === 'package');
		t.deepEqual(projectQuery.data.entity.properties, { projectId: project.projectId, settings: project.settings });
		t.deepEqual(packageQuery.data.entity.properties, {
			id: pkg.id, name: pkg.name, settings: { compressPNG: pkg.compressPNG, jpegQuality: pkg.jpegQuality, publish: pkg.publish },
		});
		for (const result of [projectQuery, packageQuery]) {
			t.is(result.meta.revision, 0); t.is(result.data.revision, 0); t.is(result.data.sessionId, sessionId);
		}
		const projectSettings = projectQuery.data.entity.properties.settings;
		const packageSettings = packageQuery.data.entity.properties.settings;
		assert(projectSettings.common && packageSettings.publish);
		projectSettings.common.fontSize = 24;
		packageSettings.publish.atlases[0].name = 'edited';
		t.deepEqual(sessionState(runtime, sessionId), before);
		const transaction: ApplySessionTransactionInput = { sessionId, expectedRevision: projectQuery.data.revision, operations: [
			{ kind: 'updateProjectSettings', settings: projectSettings },
			{ kind: 'updatePackageSettings', selector: { packageId: pkg.id }, settings: packageSettings },
		] };
		const applied = await runtime.applyTransaction(transaction);
		assert(applied.ok);
		t.true(applied.data.dirty);
		const projectAgain = runtime.queryEntity({ sessionId, target: projectQuery.data.target });
		const packageAgain = runtime.queryEntity({ sessionId, target: packageQuery.data.target });
		assert(projectAgain.ok && projectAgain.data.entity.kind === 'project');
		assert(packageAgain.ok && packageAgain.data.entity.kind === 'package');
		t.is(projectAgain.data.revision, 1); t.is(packageAgain.meta.revision, 1);
		t.deepEqual(projectAgain.data.entity.properties.settings, projectSettings);
		t.deepEqual(packageAgain.data.entity.properties.settings, packageSettings);
		const stale = await runtime.applyTransaction(transaction);
		assert(!stale.ok); t.is(stale.error.code, 'stale_write');
	} finally { await runtime.closeSession({ sessionId }); }
	project.packages.push(structuredClone(pkg));
	const duplicate = runtime.openProjectSession({ project });
	assert(duplicate.ok);
	try {
		const result = runtime.queryEntity({ sessionId: duplicate.data.sessionId, target: { kind: 'package', selector: { packageId: pkg.id } } });
		assert(!result.ok && result.error.code === 'entity_query_failed');
		t.is(result.error.reason, 'ambiguous');
	} finally { await runtime.closeSession({ sessionId: duplicate.data.sessionId }); }
});

test('settings queries retain response budgets and reject non-JSON native settings', async (t) => {
	for (const kind of ['project', 'package'] as const) {
		for (const [value, reason] of [['你'.repeat(100000), 'response_budget_exceeded'], [new Uint8Array([1]), 'non_json_value']] as const) {
			const project = liftDocumentToUamProject(materializeUamProject(createBackendFixtureProject()));
			assert(project.packages[0].publish);
			if (kind === 'project') project.settings.common = { font: value as string };
			else project.packages[0].publish.codePath = value as string;
			const runtime = new BackendRuntime();
			const opened = runtime.openProjectSession({ project });
			assert(opened.ok);
			const sessionId = opened.data.sessionId;
			try {
				const before = sessionState(runtime, sessionId);
				const target: QueryEntityInput['target'] = kind === 'project' ? { kind } : { kind, selector: { packageId: 'pkg001' } };
				const result = runtime.queryEntity({ sessionId, target });
				assert(!result.ok && result.error.code === 'entity_query_failed');
				t.is(result.error.reason, reason); t.false('data' in result);
				t.deepEqual(sessionState(runtime, sessionId), before);
			} finally { await runtime.closeSession({ sessionId }); }
		}
	}
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

test('complex queries retain complete pages/actions/items and gears, detach deeply, and follow clean/dirty revisions without side effects', async (t) => {
	const { project, component } = complexQueryProject();
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({ project });
	assert(opened.ok);
	const sessionId = opened.data.sessionId;
	t.deepEqual(opened.data.capabilities.read.entityQuery.kinds, ['project', 'package', 'resource', 'component', 'displayNode', 'controller', 'transition']);
	try {
		for (const revision of [0, 1]) {
			const before = sessionState(runtime, sessionId);
			const controller = runtime.queryEntity({ sessionId, target: controllerTarget });
			const transition = runtime.queryEntity({ sessionId, target: transitionTarget });
			const node = runtime.queryEntity({ sessionId, target: nodeTarget });
			assert(controller.ok && controller.data.entity.kind === 'controller');
			assert(transition.ok && transition.data.entity.kind === 'transition');
			assert(node.ok && node.data.entity.kind === 'displayNode');
			t.deepEqual(controller.data.entity.properties, component.controllers[0]);
			t.deepEqual(transition.data.entity.properties, component.transitions[0]);
			t.deepEqual(node.data.entity.properties.gears, component.displayList[1].gears);
			for (const result of [controller, transition]) {
				t.is(result.data.revision, revision); t.is(result.meta.revision, revision);
				t.is(result.data.sessionId, sessionId);
				assert(result.data.target.kind !== 'project');
				result.data.target.selector.packageId = 'outside';
			}
			controller.data.entity.properties.pages[0].name = 'outside';
			controller.data.entity.properties.actions[0].fromPageIds.push('outside');
			transition.data.entity.properties.items[0].endValue[0] = { outside: true };
			node.data.entity.properties.gears.length = 0;
			t.deepEqual(sessionState(runtime, sessionId), before);
			if (revision === 0) {
				component.controllers[0].alias = 'Updated state';
				component.transitions[0].autoPlayDelay = 0.5;
				const expected = normalizeUamProject(project);
				const result = await runtime.applyTransaction({ sessionId, expectedRevision: 0, operations: [
					{ kind: 'updateController', selector: controllerTarget.selector, controller: component.controllers[0] },
					{ kind: 'updateTransition', selector: transitionTarget.selector, transition: component.transitions[0] },
				] });
				assert(result.ok, JSON.stringify(result)); t.true(result.data.dirty);
				t.deepEqual(sessionState(runtime, sessionId).project, expected);
			}
		}
	} finally { await runtime.closeSession({ sessionId }); }
});

test('complex selectors are exact, component-scoped and reject missing or ambiguous identities without writes', async (t) => {
	for (const target of [controllerTarget, transitionTarget]) {
		const field = target.kind === 'controller' ? 'controllerName' : 'transitionName';
		const { project, component } = complexQueryProject();
		const runtime = new BackendRuntime();
		const opened = runtime.openProjectSession({ project });
		assert(opened.ok);
		const sessionId = opened.data.sessionId;
		const before = sessionState(runtime, sessionId);
		for (const [selector, reason] of [
			[{ packageId: 'pkg001', componentResourceId: 'cmp001' }, 'invalid_query'],
			[{ ...target.selector, [field]: '' }, 'invalid_query'],
			[{ ...target.selector, [field]: 'x'.repeat(257) }, 'invalid_query'],
			[{ ...target.selector, [field]: 1 }, 'invalid_query'],
			[{ ...target.selector, displayNodeId: 'n1' }, 'invalid_query'],
			[{ ...target.selector, [field]: 'missing' }, 'not_found'],
			[{ ...target.selector, [field]: target.kind === 'controller' ? 'State' : 'Intro' }, 'not_found'],
			[{ ...target.selector, packageId: 'missing' }, 'not_found'],
			[{ ...target.selector, componentResourceId: 'img001' }, 'not_found'],
		] as const) {
			const result = runtime.queryEntity({ sessionId, target: { kind: target.kind, selector } } as QueryEntityInput);
			assert(!result.ok && result.error.code === 'entity_query_failed');
			t.is(result.error.reason, reason); t.is(result.meta.revision, 0); t.false('data' in result);
		}
		t.deepEqual(sessionState(runtime, sessionId), before);
		await runtime.closeSession({ sessionId });
		const closed = runtime.queryEntity({ sessionId, target });
		assert(!closed.ok); t.is(closed.error.code, 'session_not_found');
		if (target.kind === 'controller') component.controllers.push(structuredClone(component.controllers[0]));
		else component.transitions.push(structuredClone(component.transitions[0]));
		const duplicate = runtime.openProjectSession({ project });
		assert(duplicate.ok);
		const duplicateId = duplicate.data.sessionId;
		const duplicateBefore = sessionState(runtime, duplicateId);
		const ambiguous = runtime.queryEntity({ sessionId: duplicateId, target });
		assert(!ambiguous.ok && ambiguous.error.code === 'entity_query_failed');
		t.is(ambiguous.error.reason, 'ambiguous');
		t.deepEqual(sessionState(runtime, duplicateId), duplicateBefore);
		await runtime.closeSession({ sessionId: duplicateId });
	}
});

test('complex nested payloads share response limits and non-JSON refusal without truncation or mutation', async (t) => {
	const deep = Array.from({ length: BACKEND_ENTITY_QUERY_LIMITS.maxDepth + 1 }).reduce((value: unknown) => [value], 0);
	for (const target of [controllerTarget, transitionTarget]) for (const [value, reason] of [
		['你'.repeat(100000), 'response_budget_exceeded'],
		[new Array(BACKEND_ENTITY_QUERY_LIMITS.maxNodes + 1), 'response_budget_exceeded'],
		[deep, 'response_budget_exceeded'],
		[new Uint8Array([1]), 'non_json_value'], [Infinity, 'non_json_value'], [1n, 'non_json_value'],
	] as const) {
		const { project, component } = complexQueryProject();
		if (target.kind === 'controller') component.controllers[0].actions[0].fromPageIds = [value as string];
		else component.transitions[0].items[0].startValue = [value];
		const runtime = new BackendRuntime();
		const opened = runtime.openProjectSession({ project });
		assert(opened.ok);
		const sessionId = opened.data.sessionId;
		const before = sessionState(runtime, sessionId);
		const result = runtime.queryEntity({ sessionId, target });
		assert(!result.ok && result.error.code === 'entity_query_failed');
		t.is(result.error.reason, reason); t.false('data' in result);
		t.deepEqual(sessionState(runtime, sessionId), before);
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
			t.is(preview.data.sessionId, sessionId);
			t.is(preview.data.baseRevision, expectedRevision);
			t.is(preview.data.projectedRevision, expectedRevision + 1);
			t.is(preview.data.mode, 'execute-and-discard');
			t.deepEqual(preview.data.persistence, { requiredAfterApply: true, nextAction: 'saveSession', fileSystemAvailable: true, uamFidelity: 'full', writeVerified: false });
			t.deepEqual(preview.data.impact.entities, expectedRevision === 0
				? [{ target: { kind: 'resource', selector: { packageId: 'pkg001', resourceId: 'cmp001' } }, change: 'updated', fields: ['name'] },
					{ target: { kind: 'displayNode', selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n0' } }, change: 'updated', fields: ['resource'] }]
				: [{ target: nodeTarget, change: 'updated', fields: ['text'] }]);
			t.deepEqual(preview.data.impact.files, expectedRevision === 0 ? [
				{ path: 'assets/Main/MainView.xml', kind: 'file', change: 'removed' },
				{ path: 'assets/Main/RenamedView.xml', kind: 'file', change: 'added' },
				{ path: 'assets/Main/package.xml', kind: 'file', change: 'updated' },
			] : [{ path: 'assets/Main/RenamedView.xml', kind: 'file', change: 'updated' }]);
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
		const saved = await runtime.saveSession({ sessionId, expectedRevision: 2 }); assert(saved.ok);
		const disk = new Map(await diskState(fixture.rootDir) as Array<[string, Buffer | null]>);
		t.false(disk.has(path.join('assets', 'Main', 'MainView.xml')));
		t.true(disk.get(path.join('assets', 'Main', 'RenamedView.xml'))!.toString().includes('committed only by apply'));
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
	t.is(preview.data.persistence.nextAction, 'host-action');
	t.false(preview.data.persistence.fileSystemAvailable);
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

test('preview summarizes complex snapshots, empty batches, source bytes and fail-closed budgets', async (t) => {
	const { project, component } = complexQueryProject();
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({ project });
	assert(opened.ok);
	const sessionId = opened.data.sessionId;
	const before = sessionState(runtime, sessionId);
	try {
		const empty = await runtime.preflightTransaction({ sessionId, expectedRevision: 0, operations: [] });
		assert(empty.ok, JSON.stringify(empty));
		t.deepEqual(empty.data.impact, { entities: [], files: [] });
		t.is(empty.data.projectedRevision, 1);
		const controller = structuredClone(component.controllers[0]); controller.alias = 'New alias';
		const transition = structuredClone(component.transitions[0]); transition.autoPlayDelay = 1;
		const preview = await runtime.preflightTransaction({ sessionId, expectedRevision: 0, operations: [
			{ kind: 'updateController', selector: controllerTarget.selector, controller },
			{ kind: 'updateTransition', selector: transitionTarget.selector, transition },
			{ kind: 'addResource', selector: { packageId: 'pkg001' }, resource: {
				kind: 'misc', id: 'added', name: 'new.bin', path: '/', file: 'new.bin', exported: false, favorite: false,
				branch: '', branchItemIds: [], sourceBytes: new Uint8Array([17, 23]),
			} },
		] });
		assert(preview.ok, JSON.stringify(preview));
		t.true(preview.data.impact.entities.some((entry) => entry.target.kind === 'controller' && entry.fields.join() === 'alias'));
		t.true(preview.data.impact.entities.some((entry) => entry.target.kind === 'transition' && entry.fields.join() === 'autoPlayDelay'));
		t.true(preview.data.impact.files.some((entry) => entry.path === 'assets/Main/new.bin' && entry.change === 'added'));
		t.false(JSON.stringify(preview.data).includes('[17,23]'));
		preview.data.impact.entities.length = 0;
		t.deepEqual(sessionState(runtime, sessionId), before);
	} finally { await runtime.closeSession({ sessionId }); }
	const large = createBackendFixtureProject();
	const resource = large.packages[0].resources[1]; assert(resource.kind === 'component');
	for (let i = 0; i < BACKEND_TRANSACTION_PREVIEW_LIMITS.maxEntries; i++) {
		const node = structuredClone(resource.component.displayList[1]); node.id = `extra${i}`; node.name = `Extra${i}`;
		resource.component.displayList.push(node);
	}
	const largeSession = runtime.openProjectSession({ project: large }); assert(largeSession.ok);
	const largeId = largeSession.data.sessionId;
	const largeBefore = sessionState(runtime, largeId);
	try {
		const rejected = await runtime.preflightTransaction({ sessionId: largeId, expectedRevision: 0, operations: [
			{ kind: 'removeComponent', selector: { packageId: 'pkg001', componentResourceId: 'cmp001' } },
		] });
		assert(!rejected.ok && rejected.error.code === 'transaction_preview_failed', JSON.stringify(rejected));
		t.is(rejected.error.reason, 'response_budget_exceeded'); t.false('data' in rejected);
		t.is(rejected.meta.diagnostics[0].owner, 'backend');
		t.deepEqual(sessionState(runtime, largeId), largeBefore);
	} finally { await runtime.closeSession({ sessionId: largeId }); }
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
