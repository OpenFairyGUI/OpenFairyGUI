import test from 'ava';
import { createBackendRuntime, createTempBackendProject } from './helpers.js';

test('requests are tagged by service concern via meta.stage', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const runtime = createBackendRuntime();

		const capabilities = runtime.getCapabilities();
		t.true(capabilities.ok);
		if (!capabilities.ok) return;
		t.is(capabilities.meta.stage, 'read');

		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (!opened.ok) return;
		t.is(opened.meta.stage, 'runtime');

		const session = runtime.getSession({ sessionId: opened.data.sessionId });
		t.true(session.ok);
		if (!session.ok) return;
		t.is(session.meta.stage, 'read');

		const applied = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: 0,
			operations: [
				{
					kind: 'setDisplayNodeProps',
					selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
					props: { text: 'P1' },
				},
			],
		});
		t.true(applied.ok);
		if (!applied.ok) return;
		t.is(applied.meta.stage, 'authoring');

		const saved = await runtime.saveSession({ sessionId: opened.data.sessionId });
		t.true(saved.ok);
		if (!saved.ok) return;
		t.is(saved.meta.stage, 'authoring');

		const closed = await runtime.closeSession({ sessionId: opened.data.sessionId });
		t.true(closed.ok);
		if (!closed.ok) return;
		t.is(closed.meta.stage, 'runtime');
	} finally {
		await fixture.cleanup();
	}
});
