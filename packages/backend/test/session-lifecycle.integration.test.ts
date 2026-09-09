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

test.serial('Node lock read failures keep the session retryable and block a second owner', async (t) => {
	const fixture = await createTempBackendProject();
	t.teardown(() => fixture.cleanup());
	const base = createNodeBackendFileSystem();
	const runtime = createBackendRuntime({ fileSystem: base });
	const opened = await runtime.openSession({ projectPath: fixture.fairyPath });
	t.true(opened.ok);
	if (!opened.ok) return;
	const input = { sessionId: opened.data.sessionId };
	const lockPath = base.getSessionLockPath!(opened.data.canonicalProjectPath!);
	const readFile = fs.readFile;
	for (const code of ['EIO', 'EACCES']) {
		fs.readFile = ((...args: Parameters<typeof fs.readFile>) => {
			if (args[0] === lockPath) return Promise.reject(Object.assign(new Error('injected lock read failure'), { code }));
			return readFile(...args);
		}) as typeof fs.readFile;
		try {
			const failed = await runtime.closeSession(input);
			t.false(failed.ok);
			if (!failed.ok) t.is(failed.error.code, 'session_close_failed');
		} finally {
			fs.readFile = readFile;
		}
		const retained = runtime.getSession(input);
		t.true(retained.ok && retained.data.lockHeld);
		t.true((await fs.stat(lockPath)).isFile());
		t.false((await createBackendRuntime().openSession({ projectPath: fixture.fairyPath })).ok);
	}
	t.true((await runtime.closeSession(input)).ok);
	const next = createBackendRuntime();
	const reopened = await next.openSession({ projectPath: fixture.fairyPath });
	t.true(reopened.ok);
	if (reopened.ok) await next.closeSession({ sessionId: reopened.data.sessionId });
});

test('Node lock release rejects corrupt or foreign metadata without unlinking and tolerates a missing lock', async (t) => {
	const fixture = await createTempBackendProject();
	t.teardown(() => fixture.cleanup());
	const base = createNodeBackendFileSystem();
	const lockPath = base.getSessionLockPath!(fixture.rootDir);
	const lock = await base.acquireSessionLock(lockPath);
	await lock.writeMetadata('{}');
	const original = await fs.readFile(lockPath, 'utf8');
	for (const content of ['invalid json', JSON.stringify({ ...JSON.parse(original), token: 'another-owner' })]) {
		await fs.writeFile(lockPath, content);
		await t.throwsAsync(lock.release(), { message: /Cannot release session lock:/ });
		t.is(await fs.readFile(lockPath, 'utf8'), content);
	}
	await fs.writeFile(lockPath, original);
	await lock.release();
	await t.throwsAsync(fs.stat(lockPath), { code: 'ENOENT' });
	const missing = await base.acquireSessionLock(lockPath);
	await missing.writeMetadata('{}');
	await fs.unlink(lockPath);
	await t.notThrowsAsync(missing.release());
	await t.notThrowsAsync(missing.release());
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
