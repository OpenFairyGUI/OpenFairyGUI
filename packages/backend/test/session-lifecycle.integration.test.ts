import test from 'ava';
import { BackendRuntime } from '../src/index.js';
import { createTempBackendProject } from './helpers.js';

test('openSession -> getSession -> closeSession reports revision and dirty state', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const runtime = new BackendRuntime();
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (!opened.ok) return;

		t.is(opened.data.revision, 0);
		t.is(opened.data.lastSavedRevision, 0);
		t.false(opened.data.dirty);
		t.true(opened.data.lockHeld);

		const session = runtime.getSession({ sessionId: opened.data.sessionId });
		t.true(session.ok);
		if (!session.ok) return;
		t.is(session.data.revision, 0);
		t.false(session.data.dirty);

		const closed = await runtime.closeSession({ sessionId: opened.data.sessionId });
		t.true(closed.ok);
	} finally {
		await fixture.cleanup();
	}
});
