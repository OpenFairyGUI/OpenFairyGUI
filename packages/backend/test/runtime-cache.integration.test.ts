import test from 'ava';
import { createBackendRuntime, createTempBackendProject, waitForBackendJobStatus } from './helpers.js';

test('cache is derived, revision-bound, invalidated by transaction, and refreshed by job', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const runtime = createBackendRuntime();
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (!opened.ok) return;

		const initial = runtime.getCacheSnapshot({ sessionId: opened.data.sessionId });
		t.true(initial.ok);
		if (!initial.ok) return;
		t.true(initial.data.entries[0]?.valid ?? false);
		t.is(initial.data.entries[0]?.revision, 0);
		const mutableInitialEntry = initial.data.entries[0];
		if (!mutableInitialEntry) return;
		mutableInitialEntry.valid = false;
		mutableInitialEntry.summary.resourceCount = -1;
		const initialAgain = runtime.getCacheSnapshot({ sessionId: opened.data.sessionId });
		t.true(initialAgain.ok);
		if (!initialAgain.ok) return;
		t.true(initialAgain.data.entries[0]?.valid ?? false);
		t.not(initialAgain.data.entries[0]?.summary.resourceCount, -1);

		const applied = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: 0,
			operations: [
				{
					kind: 'setDisplayNodeProps',
					selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
					props: { text: 'P2 cache' },
				},
			],
		});
		t.true(applied.ok);

		const invalid = runtime.getCacheSnapshot({ sessionId: opened.data.sessionId });
		t.true(invalid.ok);
		if (!invalid.ok) return;
		t.false(invalid.data.entries[0]?.valid ?? true);
		t.is(invalid.data.entries[0]?.revision, 1);

		const refresh = runtime.refreshCache({ sessionId: opened.data.sessionId });
		t.true(refresh.ok);
		if (!refresh.ok) return;
		t.is(refresh.data.kind, 'cache.refresh');
		t.is(refresh.data.status, 'queued');
		const completed = await waitForBackendJobStatus(runtime, opened.data.sessionId, refresh.data.jobId, 'completed');
		t.is(completed.status, 'completed');

		const refreshed = runtime.getCacheSnapshot({ sessionId: opened.data.sessionId });
		t.true(refreshed.ok);
		if (!refreshed.ok) return;
		t.true(refreshed.data.entries[0]?.valid ?? false);
		t.is(refreshed.data.entries[0]?.summary.packageCount, 1);
		t.is(refreshed.data.entries[0]?.summary.resourceCount, 2);
	} finally {
		await fixture.cleanup();
	}
});

test('closeSession removes session-bound cache entry', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const runtime = createBackendRuntime();
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (!opened.ok) return;

		const closed = await runtime.closeSession({ sessionId: opened.data.sessionId });
		t.true(closed.ok);

		const cache = runtime.getCacheSnapshot({ sessionId: opened.data.sessionId });
		t.false(cache.ok);
		if (!cache.ok) {
			const failure = cache as Extract<typeof cache, { ok: false }>;
			t.is(failure.error.code, 'session_not_found');
		}
	} finally {
		await fixture.cleanup();
	}
});
