import test from 'ava';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createNodeBackendFileSystem } from '../src/node.js';
import { createBackendFixtureProject, createBackendRuntime, createTempBackendProject } from './helpers.js';

test('an unreadable asset directory cannot become a writable empty session', async (t) => {
	const fixture = await createTempBackendProject();
	t.teardown(() => fixture.cleanup());
	const base = createNodeBackendFileSystem();
	const runtime = createBackendRuntime({ fileSystem: { ...base, readdir: async (directory) => {
		if (directory === path.join(fixture.rootDir, 'assets')) throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
		return base.readdir(directory);
	} } });
	const opened = await runtime.openSession({ projectPath: fixture.fairyPath });
	t.true(opened.ok);
	if (!opened.ok) return;
	t.is(opened.data.uamFidelity, 'unsupported');
	const saved = await runtime.materializeSession({ sessionId: opened.data.sessionId });
	t.false(saved.ok);
	if (!saved.ok) t.is(saved.error.code, 'uam_fidelity_unsupported');
	t.true((await fs.stat(path.join(fixture.rootDir, 'assets', 'Main', 'MainView.xml'))).isFile());
	await runtime.closeSession({ sessionId: opened.data.sessionId });
});

test('a failed lock release keeps the session retryable and blocks a second owner', async (t) => {
	const fixture = await createTempBackendProject();
	t.teardown(() => fixture.cleanup());
	const base = createNodeBackendFileSystem();
	let failRelease = true;
	const runtime = createBackendRuntime({ fileSystem: { ...base, acquireSessionLock: async (lockPath) => {
		const lock = await base.acquireSessionLock(lockPath);
		return { ...lock, release: async () => {
			if (failRelease) throw new Error('injected lock release failure');
			await lock.release();
		} };
	} } });
	const opened = await runtime.openSession({ projectPath: fixture.fairyPath });
	t.true(opened.ok);
	if (!opened.ok) return;
	const input = { sessionId: opened.data.sessionId };
	const failed = await runtime.closeSession(input);
	t.false(failed.ok);
	if (!failed.ok) t.is(failed.error.code, 'session_close_failed');
	const retained = runtime.getSession(input);
	t.true(retained.ok && retained.data.lockHeld);
	t.false((await createBackendRuntime().openSession({ projectPath: fixture.fairyPath })).ok);
	failRelease = false;
	t.true((await runtime.closeSession(input)).ok);
	const next = createBackendRuntime();
	const reopened = await next.openSession({ projectPath: fixture.fairyPath });
	t.true(reopened.ok);
	if (reopened.ok) await next.closeSession({ sessionId: reopened.data.sessionId });
});

test('a locked file session rejects storage rebinding before writing the new target', async (t) => {
	const fixture = await createTempBackendProject();
	t.teardown(() => fixture.cleanup());
	const fileSystem = createNodeBackendFileSystem();
	const runtime = createBackendRuntime({ fileSystem });
	const opened = await runtime.openSession({ projectPath: fixture.fairyPath });
	t.true(opened.ok);
	if (!opened.ok) return;
	const target = path.join(fixture.rootDir, 'other', 'Other.fairy');
	const result = await runtime.materializeSession({ sessionId: opened.data.sessionId, storage: { fileSystem, fairyPath: target } });
	t.false(result.ok);
	if (!result.ok) t.is(result.error.code, 'path_policy_violation');
	await t.throwsAsync(fs.stat(path.dirname(target)), { code: 'ENOENT' });
	const session = runtime.getSession({ sessionId: opened.data.sessionId });
	t.true(session.ok && session.data.lockHeld && session.data.canonicalProjectPath === opened.data.canonicalProjectPath);
	t.false((await createBackendRuntime().openSession({ projectPath: fixture.fairyPath })).ok);
	t.true((await runtime.closeSession({ sessionId: opened.data.sessionId })).ok);
});

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
