import test from 'ava';
import { setTimeout as delay } from 'node:timers/promises';
import { BackendRuntime } from '../src/index.js';
import { createNodeBackendFileSystem } from '../src/node.js';
import { createBackendFixtureProject, createBackendRuntime, createTempBackendProject } from './helpers.js';

test('runtime rejects sessions beyond maxSessions until one is closed', async (t) => {
	const runtime = new BackendRuntime({ maxSessions: 2 });
	t.is(runtime.getCapabilities().data.runtime.maxSessions, 2);
	const open = (name: string) =>
		runtime.openProjectSession({
			project: createBackendFixtureProject(),
			canonicalProjectPath: `memory://${name}`,
		});
	const first = open('first');
	t.true(first.ok && open('second').ok);

	const rejected = open('third');
	t.false(rejected.ok);
	if (!rejected.ok) t.like(rejected.error, { code: 'session_limit_exceeded', maxSessions: 2 });

	if (first.ok) await runtime.closeSession({ sessionId: first.data.sessionId });
	t.true(open('third').ok);
});

test('file-backed openSession counts toward the same session limit', async (t) => {
	const fixture = await createTempBackendProject();
	t.teardown(() => fixture.cleanup());
	const runtime = createBackendRuntime();
	t.is(runtime.getCapabilities().data.runtime.maxSessions, 32);

	const limited = new BackendRuntime({ fileSystem: createNodeBackendFileSystem(), maxSessions: 1 });
	t.true(
		limited.openProjectSession({ project: createBackendFixtureProject(), canonicalProjectPath: 'memory://held' })
			.ok,
	);
	const opened = await limited.openSession({ projectPath: fixture.rootDir });
	t.false(opened.ok);
	if (!opened.ok) t.is(opened.error.code, 'session_limit_exceeded');
});

test('maxSessions must be a positive integer', (t) => {
	t.throws(() => new BackendRuntime({ maxSessions: 0 }), { instanceOf: RangeError });
	t.throws(() => new BackendRuntime({ maxSessions: 1.5 }), { instanceOf: RangeError });
});

test('clean idle sessions expire and release their capacity while dirty sessions survive', async (t) => {
	const runtime = new BackendRuntime({ maxSessions: 2, idleSessionTimeoutMs: 30 });
	t.is(runtime.getCapabilities().data.runtime.idleSessionTimeoutMs, 30);
	const clean = runtime.openProjectSession({ project: createBackendFixtureProject(), sessionId: 'clean' });
	const dirty = runtime.openProjectSession({ project: createBackendFixtureProject(), sessionId: 'dirty' });
	t.true(clean.ok && dirty.ok);
	t.true(
		(
			await runtime.applyTransaction({
				sessionId: 'dirty',
				expectedRevision: 0,
				operations: [
					{
						kind: 'renameResource',
						selector: { packageId: 'pkg001', resourceId: 'cmp001' },
						newName: 'Unsaved',
					},
				],
			})
		).ok,
	);
	await delay(150);
	t.false(runtime.getSession({ sessionId: 'clean' }).ok);
	const retained = runtime.getSession({ sessionId: 'dirty' });
	t.true(retained.ok && retained.data.dirty);
	t.true(runtime.openProjectSession({ project: createBackendFixtureProject(), sessionId: 'replacement' }).ok);
	await runtime.closeSession({ sessionId: 'dirty' });
	await runtime.closeSession({ sessionId: 'replacement' });
});

test('zero idle timeout disables expiry and invalid timeout values fail early', async (t) => {
	for (const idleSessionTimeoutMs of [-1, 0.5, Infinity, 2_147_483_648]) {
		t.throws(() => new BackendRuntime({ idleSessionTimeoutMs }), { instanceOf: RangeError });
	}
	const runtime = new BackendRuntime({ idleSessionTimeoutMs: 0 });
	runtime.openProjectSession({ project: createBackendFixtureProject(), sessionId: 'held' });
	await delay(80);
	t.true(runtime.getSession({ sessionId: 'held' }).ok);
	await runtime.closeSession({ sessionId: 'held' });
});

test('idle file sessions release the advisory lock for another runtime', async (t) => {
	const fixture = await createTempBackendProject();
	t.teardown(() => fixture.cleanup());
	const runtime = new BackendRuntime({ fileSystem: createNodeBackendFileSystem(), idleSessionTimeoutMs: 30 });
	const opened = await runtime.openSession({ projectPath: fixture.rootDir });
	t.true(opened.ok);
	await delay(180);
	if (opened.ok) t.false(runtime.getSession({ sessionId: opened.data.sessionId }).ok);
	const other = createBackendRuntime();
	const reopened = await other.openSession({ projectPath: fixture.rootDir });
	t.true(reopened.ok);
	if (reopened.ok) await other.closeSession({ sessionId: reopened.data.sessionId });
});

test('active reads renew idle expiry', async (t) => {
	const runtime = new BackendRuntime({ idleSessionTimeoutMs: 100 });
	runtime.openProjectSession({ project: createBackendFixtureProject(), sessionId: 'active' });
	for (let i = 0; i < 5; i++) {
		await delay(20);
		t.true(runtime.getProjectOutline({ sessionId: 'active' }).ok);
	}
	await delay(160);
	t.false(runtime.getSession({ sessionId: 'active' }).ok);
});

test('idle expiry cannot close a session during an in-flight save', async (t) => {
	const fixture = await createTempBackendProject();
	t.teardown(() => fixture.cleanup());
	const base = createNodeBackendFileSystem();
	let unblock = (): void => undefined;
	const blocked = new Promise<void>((resolve) => {
		unblock = resolve;
	});
	let entered = (): void => undefined;
	const writing = new Promise<void>((resolve) => {
		entered = resolve;
	});
	const fileSystem = {
		...base,
		async runProjectWriteTransaction(
			root: string,
			write: Parameters<NonNullable<typeof base.runProjectWriteTransaction>>[1],
		) {
			entered();
			await blocked;
			return base.runProjectWriteTransaction!(root, write);
		},
	};
	const runtime = new BackendRuntime({ fileSystem, idleSessionTimeoutMs: 40 });
	const opened = await runtime.openSession({ projectPath: fixture.rootDir });
	t.true(opened.ok);
	if (!opened.ok) return;
	const sessionId = opened.data.sessionId;
	const saving = runtime.materializeSession({ sessionId, expectedRevision: 0 });
	await writing;
	await delay(160);
	t.true(runtime.getSession({ sessionId }).ok);
	unblock();
	t.true((await saving).ok);
	await delay(160);
	t.false(runtime.getSession({ sessionId }).ok);
});
