import test from 'ava';
import { BackendRuntime, getBackendDiagnosticCatalog, getBackendDiagnosticGuide } from '../src/index.js';
import { createMeta } from '../src/services/context.js';
import { createBackendFixtureProject, createBackendRuntime, createTempBackendProject } from './helpers.js';

test('backend responses carry unified diagnostics metadata', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const runtime = createBackendRuntime();
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (!opened.ok) return;

		t.true(opened.meta.requestId.length > 0);
		t.is(opened.meta.sessionId, opened.data.sessionId);
		t.is(opened.meta.revision, 0);
		t.true(opened.meta.durationMs >= 0);
		t.deepEqual(opened.meta.warnings, []);
		t.deepEqual(opened.meta.diagnostics, []);
		t.is(opened.meta.contractVersion, '2.0.0-p2');
		t.is(opened.meta.capabilitySchemaVersion, 11);

		const stale = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: 99,
			operations: [],
		});
		t.false(stale.ok);
		if (stale.ok) return;
		t.true(stale.meta.requestId.length > 0);
		t.is(stale.meta.sessionId, opened.data.sessionId);
		t.is(stale.meta.revision, 0);
		t.true(stale.meta.durationMs >= 0);
		t.deepEqual(stale.meta.warnings, []);
		t.deepEqual(stale.meta.diagnostics.map(({ owner, docsUri, remediation, ...original }) => original), [
			{
				code: 'stale_write',
				message: 'Expected revision 99 does not match current revision 0.',
				severity: 'error',
			},
		]);
		t.is(stale.meta.stage, 'authoring');
		const recovery = stale.meta.diagnostics[0]!;
		t.is(recovery.owner, 'backend');
		t.is(recovery.docsUri, 'openfairygui://docs/diagnostics/stale_write');
		t.is(recovery.remediation?.kind, 'refresh-and-replan');
		t.deepEqual(recovery.remediation?.read, { method: 'getProjectOutline', input: { sessionId: opened.data.sessionId } });
		const read = recovery.remediation!.read!;
		const refreshed = runtime[read.method](read.input);
		t.true(refreshed.ok);
		t.is(refreshed.meta.revision, 0);
		t.is(stale.error.code, 'stale_write');
	} finally {
		await fixture.cleanup();
	}
});

test('transaction failures expose stable editor-targeted diagnostics', async (t) => {
	const project = createBackendFixtureProject();

	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({ project, canonicalProjectPath: 'memory://diagnostics' });
	t.true(opened.ok);
	if (!opened.ok) return;

	const rejected = await runtime.applyTransaction({
		sessionId: opened.data.sessionId,
		expectedRevision: 0,
		operations: [
			{
				kind: 'renameResource',
				selector: { packageId: 'pkg001', resourceId: 'img001' },
				newName: 'renamed.png',
			},
		],
	});
	t.false(rejected.ok);
	if (rejected.ok) return;
	t.deepEqual(rejected.meta.diagnostics.map(({ owner, docsUri, remediation, ...original }) => original), [
		{
			code: 'unavailable_resource_source_bytes',
			message: 'Resource "pkg001/img001" has no hydrated primary source bytes.',
			severity: 'error',
			path: 'operations[0].selector.resourceId',
			resourceKind: 'image',
			operationKind: 'renameResource',
		},
	]);
	t.is(rejected.meta.diagnostics[0]?.owner, 'core.transaction');
	t.is(rejected.meta.diagnostics[0]?.remediation?.kind, 'host-action');
	t.is(rejected.meta.diagnostics[0]?.remediation?.read, undefined);
	t.false(JSON.stringify(rejected.error).includes('remediation'));

	const events = runtime.getEvents({ sessionId: opened.data.sessionId });
	t.true(events.ok);
	if (!events.ok) return;
	const rejectedEvent = events.data.events.find((event) => event.kind === 'transaction.rejected');
	t.deepEqual(rejectedEvent?.diagnostics, rejected.meta.diagnostics);
});

test('recovery keeps invalid selectors, source validation and unknown diagnostics distinct', async (t) => {
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({ project: createBackendFixtureProject() });
	if (!opened.ok) throw new Error(opened.error.message);
	const sessionId = opened.data.sessionId;
	const before = runtime.getSession({ sessionId });
	const rejected = await runtime.preflightTransaction({ sessionId, expectedRevision: 0, operations: [
		{ kind: 'renameResource', selector: { packageId: 'pkg001', resourceId: 'missing' }, newName: 'new.png' },
	] });
	t.false(rejected.ok);
	t.is(rejected.meta.diagnostics[0]?.code, 'invalid_resource_selector');
	t.is(rejected.meta.diagnostics[0]?.owner, 'core.transaction');
	t.is(rejected.meta.diagnostics[0]?.remediation?.kind, 'revise-selector');
	t.truthy(rejected.meta.diagnostics[0]?.path);
	const validation = runtime.validateSession({ sessionId });
	if (!validation.ok) throw new Error(validation.error.message);
	t.is(validation.data.status, 'incomplete');
	t.true(validation.data.diagnostics.some((entry) => entry.code === 'decode_capability_unavailable'));
	t.is(validation.meta.diagnostics.find((entry) => entry.code === 'decode_capability_unavailable')?.owner, 'core.validation');
	t.false(JSON.stringify(validation.data).includes('remediation'));
	const unknown = { code: 'host_extension_error', message: 'Host detail', severity: 'warning' as const, path: 'custom' };
	// @ts-expect-error Unknown host extensions are outside the formal diagnostic contract.
	t.deepEqual(createMeta('read', Date.now(), { diagnostics: [unknown] }).diagnostics, [unknown]);
	const after = runtime.getSession({ sessionId });
	if (before.ok && after.ok) t.deepEqual(after.data, before.data);
	await runtime.closeSession({ sessionId });
	const closed = runtime.getProjectOutline({ sessionId });
	t.false(closed.ok);
	t.is(closed.meta.diagnostics[0]?.code, 'session_not_found');
	t.is(closed.meta.diagnostics[0]?.remediation?.kind, 'host-action');
	t.is(closed.meta.diagnostics[0]?.remediation?.read, undefined);
});

test('path denial recovery never grants wider access; catalog is detached and fails unknown codes', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const denied = await createBackendRuntime({ allowedProjectRoots: [fixture.rootDir + '-other'] }).openSession({ projectPath: fixture.rootDir });
		t.false(denied.ok);
		t.is(denied.meta.diagnostics[0]?.code, 'project_root_not_allowed');
		t.is(denied.meta.diagnostics[0]?.remediation?.kind, 'host-action');
		t.is(denied.meta.diagnostics[0]?.remediation?.read, undefined);
		const runtime = createBackendRuntime();
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		if (!opened.ok) throw new Error(opened.error.message);
		const saved = await runtime.saveSession({ sessionId: opened.data.sessionId, expectedRevision: 0, targetPath: fixture.rootDir + '-other' });
		t.false(saved.ok);
		t.is(saved.meta.diagnostics[0]?.code, 'path_policy_violation');
		t.is(saved.meta.diagnostics[0]?.remediation?.kind, 'host-action');
		await runtime.closeSession({ sessionId: opened.data.sessionId });
	} finally { await fixture.cleanup(); }
	const catalog = getBackendDiagnosticCatalog();
	t.is(new Set(catalog.map((guide) => guide.code)).size, 104);
	for (const guide of catalog) t.deepEqual(getBackendDiagnosticGuide(guide.code), guide);
	catalog.pop();
	t.is(getBackendDiagnosticCatalog().length, 104);
	t.deepEqual(getBackendDiagnosticGuide('invalid_uam').owners, ['core.transaction', 'core.validation']);
	t.is(createMeta('read', Date.now(), { diagnostics: [{ code: 'invalid_uam', severity: 'error', message: 'Invalid source', owner: 'core.validation' }] }).diagnostics[0]?.owner, 'core.validation');
	t.throws(() => getBackendDiagnosticGuide('constructor'), { instanceOf: RangeError });
});
