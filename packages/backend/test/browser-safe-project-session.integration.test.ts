import test from 'ava';
import { BackendRuntime } from '../src/index.js';
import { createBackendFixtureProject } from './helpers.js';

test('root backend entry opens pure UAM project sessions without a filesystem adapter', async (t) => {
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({
		project: createBackendFixtureProject(),
		canonicalProjectPath: 'memory://browser-project',
	});
	t.true(opened.ok);
	if (!opened.ok) return;
	t.false(opened.data.lockHeld);
	t.is(opened.data.canonicalProjectPath, 'memory://browser-project');
	t.true(opened.data.capabilities.manifest.browserSafe);

	const applied = await runtime.applyTransaction({
		sessionId: opened.data.sessionId,
		expectedRevision: 0,
		operations: [
			{
				kind: 'setDisplayNodeProps',
				selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
				props: { text: 'Browser session' },
			},
		],
	});
	t.true(applied.ok);
	if (!applied.ok) return;
	t.is(applied.data.revision, 1);
	t.true(applied.data.dirty);

	const saved = await runtime.saveSession({ sessionId: opened.data.sessionId });
	t.false(saved.ok);
	if (saved.ok) return;
	t.is(saved.error.code, 'capability_unavailable');
	t.is(saved.error.capability, 'fileSystem');
	t.deepEqual(saved.meta.diagnostics, [
		{
			code: 'capability_unavailable',
			message: 'saveSession requires an injected BackendFileSystem adapter.',
			severity: 'error',
		},
	]);
});

test('file-backed openSession declares the missing filesystem capability instead of loading Node', async (t) => {
	const runtime = new BackendRuntime();
	const opened = await runtime.openSession({ projectPath: './Project' });
	t.false(opened.ok);
	if (opened.ok) return;
	t.is(opened.error.code, 'capability_unavailable');
	t.is(opened.error.requiredAdapter, 'BackendFileSystem');
	t.is(opened.meta.stage, 'runtime');
	t.is(opened.meta.diagnostics[0]?.code, 'capability_unavailable');
});
