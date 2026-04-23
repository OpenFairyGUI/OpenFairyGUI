import test from 'ava';
import path from 'node:path';
import { BackendRuntime } from '../src/index.js';
import { createFailingFileSystem, createTempBackendProject } from './helpers.js';

test('saveSession success updates lastSavedRevision and clears dirty state', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const runtime = new BackendRuntime();
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (!opened.ok) return;

		const applied = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: 0,
			operations: [
				{
					kind: 'setDisplayNodeProps',
					selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
					props: { text: 'Saved Title' },
				},
			],
		});
		t.true(applied.ok);
		if (!applied.ok) return;

		const saved = await runtime.saveSession({ sessionId: opened.data.sessionId });
		t.true(saved.ok);
		if (!saved.ok) return;
		t.is(saved.data.revision, 1);
		t.is(saved.data.lastSavedRevision, 1);
		t.false(saved.data.dirty);
	} finally {
		await fixture.cleanup();
	}
});

test('saveSession partial failure keeps dirty state and reports partial update risk', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const failingFs = createFailingFileSystem((filePath) => filePath.endsWith(`${path.sep}package.xml`));
		const runtime = new BackendRuntime({ fileSystem: failingFs });
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (!opened.ok) return;

		const applied = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: 0,
			operations: [
				{
					kind: 'setDisplayNodeProps',
					selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
					props: { text: 'Half Saved' },
				},
			],
		});
		t.true(applied.ok);
		if (!applied.ok) return;

		const saved = await runtime.saveSession({ sessionId: opened.data.sessionId });
		t.false(saved.ok);
		if (saved.ok) return;
		const failure = saved as Extract<typeof saved, { ok: false }> & {
			error: { diskMayBePartiallyUpdated: true };
		};
		t.is(failure.error.code, 'save_partial_failure');
		t.true(failure.error.diskMayBePartiallyUpdated);
		t.truthy(failure.session);
		t.true(failure.session?.dirty ?? false);
		t.is(failure.session?.lastSavedRevision, 0);
	} finally {
		await fixture.cleanup();
	}
});
