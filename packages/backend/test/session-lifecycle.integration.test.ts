import test from 'ava';
import { createBackendFixtureProject, createBackendRuntime, createTempBackendProject } from './helpers.js';

test('openSession -> getSession -> closeSession reports revision and dirty state', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const runtime = createBackendRuntime();
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

		const outline = runtime.getProjectOutline({ sessionId: opened.data.sessionId });
		t.true(outline.ok);
		if (!outline.ok) return;
		t.is(outline.meta.stage, 'read');
		t.is(outline.data.revision, 0);
		t.is(outline.data.projectId, 'backend-p0');
		t.deepEqual(outline.data.packages.map((pkg) => [pkg.id, pkg.name]), [['pkg001', 'Main']]);
		t.deepEqual(outline.data.packages[0]?.folders, [{ branch: '', path: '/images/' }]);
		t.deepEqual(
			outline.data.packages[0]?.resources.map((resource) => [resource.id, resource.kind]),
			[['img001', 'image'], ['cmp001', 'component']],
		);
		t.deepEqual(
			outline.data.packages[0]?.resources.find((resource) => resource.id === 'cmp001')?.component?.displayList,
			[
				{ id: 'n0', name: 'bg', kind: 'image' },
				{ id: 'n1', name: 'title', kind: 'text' },
			],
		);
		t.false(JSON.stringify(outline.data).includes('sourceBytes'));

		const closed = await runtime.closeSession({ sessionId: opened.data.sessionId });
		t.true(closed.ok);
	} finally {
		await fixture.cleanup();
	}
});

test('openProjectSession rejects duplicate caller-provided session ids', (t) => {
	const runtime = createBackendRuntime();
	const first = runtime.openProjectSession({
		project: createBackendFixtureProject(),
		sessionId: 'stable-session',
		canonicalProjectPath: 'memory://first',
	});
	t.true(first.ok);
	const second = runtime.openProjectSession({
		project: createBackendFixtureProject(),
		sessionId: 'stable-session',
		canonicalProjectPath: 'memory://second',
	});
	t.false(second.ok);
	if (!second.ok) {
		t.is(second.error.code, 'session_id_conflict');
		t.true(runtime.getSession({ sessionId: 'stable-session' }).ok);
	}
});
