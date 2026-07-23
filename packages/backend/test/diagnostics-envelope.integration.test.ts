import test from 'ava';
import { BackendRuntime } from '../src/index.js';
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
		t.is(opened.meta.contractVersion, '1.1.0-p2');
		t.is(opened.meta.capabilitySchemaVersion, 2);

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
		t.deepEqual(stale.meta.diagnostics, [
			{
				code: 'stale_write',
				message: 'Expected revision 99 does not match current revision 0.',
				severity: 'error',
			},
		]);
		t.is(stale.meta.stage, 'authoring');
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
	t.deepEqual(rejected.meta.diagnostics, [
		{
			code: 'unavailable_resource_source_bytes',
			message: 'Resource "pkg001/img001" has no hydrated primary source bytes.',
			severity: 'error',
			path: 'operations[0].selector.resourceId',
			resourceKind: 'image',
			operationKind: 'renameResource',
		},
	]);

	const events = runtime.getEvents({ sessionId: opened.data.sessionId });
	t.true(events.ok);
	if (!events.ok) return;
	const rejectedEvent = events.data.events.find((event) => event.kind === 'transaction.rejected');
	t.deepEqual(rejectedEvent?.diagnostics, rejected.meta.diagnostics);
});
