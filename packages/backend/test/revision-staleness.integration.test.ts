import test from 'ava';
import { BackendRuntime } from '../src/index.js';
import { createTempBackendProject } from './helpers.js';

test('applyTransaction rejects stale expectedRevision and preserves session state', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const runtime = new BackendRuntime();
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (!opened.ok) return;

		const success = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: 0,
			operations: [
				{
					kind: 'setDisplayNodeProps',
					selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
					props: { text: 'Updated' },
				},
			],
		});
		t.true(success.ok);
		if (!success.ok) return;
		t.is(success.data.revision, 1);
		t.true(success.data.dirty);

		const stale = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: 0,
			operations: [],
		});
		t.false(stale.ok);
		if (stale.ok) return;
		const failure = stale as Extract<typeof stale, { ok: false }>;
		t.is(failure.error.code, 'stale_write');
		t.truthy(failure.session);
		t.is(failure.session?.revision, 1);
		t.true(failure.session?.dirty ?? false);
	} finally {
		await fixture.cleanup();
	}
});
