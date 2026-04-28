import test from 'ava';
import { createBackendRuntime, createTempBackendProject } from './helpers.js';

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
