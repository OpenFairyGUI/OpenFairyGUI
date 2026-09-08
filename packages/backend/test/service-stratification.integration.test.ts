import test from 'ava';
import { createBackendFixtureProject, createBackendRuntime, createTempBackendProject } from './helpers.js';
import { cloneReadData, readView, type SessionReadView } from '../src/services/context.js';

test('borrowed read views deny nested writes and only detached data becomes writable', (t) => {
	const assertReadPermissions = (view: SessionReadView) => {
		// @ts-expect-error Read services do not own revisions.
		view.revision += 1;
		// @ts-expect-error Read services cannot change the project through nested arrays.
		view.project.packages.length = 0;
		// @ts-expect-error Host filesystem capabilities are not part of a read view.
		view.fileSystem.writeFile('Project.fairy', '');
		const resource = view.project.packages[0].resources[0];
		if (resource.kind === 'image' && resource.sourceBytes) {
			// @ts-expect-error Primary resource bytes are also borrowed read-only.
			resource.sourceBytes[0] = 0;
		}
	};
	void assertReadPermissions;
	const project = createBackendFixtureProject();
	const view = readView(project);
	t.true(Object.is(view, project));
	const detached = cloneReadData<typeof project>(view);
	detached.packages[0].resources.length = 0;
	t.is(project.packages[0].resources.length, 2);
});

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
