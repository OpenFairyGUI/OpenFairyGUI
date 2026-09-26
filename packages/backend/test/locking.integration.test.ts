import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'ava';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createNodeBackendFileSystem } from '../src/node.js';
import { createBackendRuntime, createTempBackendProject } from './helpers.js';

function lockPathFor(projectRoot: string): string {
	return path.join(path.dirname(projectRoot), `.${path.basename(projectRoot)}.openfairygui.backend.lock`);
}

test('same runtime rejects second open on the same canonical path', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const runtime = createBackendRuntime();
		const first = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(first.ok);
		if (!first.ok) return;

		const second = await runtime.openSession({ projectPath: fixture.rootDir });
		t.false(second.ok);
		if (second.ok) return;
		const failure = second as Extract<typeof second, { ok: false }>;
		t.is(failure.error.code, 'lock_conflict');
		if (failure.error.code === 'lock_conflict') {
			t.is(failure.error.kind, 'in_process_session_exists');
		}
	} finally {
		await fixture.cleanup();
	}
});

test('advisory lock conflict is surfaced before session creation', async (t) => {
	const fixture = await createTempBackendProject();
	const lockPath = lockPathFor(fixture.rootDir);
	try {
		await fs.writeFile(lockPath, '{not valid lock metadata', 'utf-8');
		const runtime = createBackendRuntime();
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.false(opened.ok);
		if (opened.ok) return;
		const failure = opened as Extract<typeof opened, { ok: false }>;
		t.is(failure.error.code, 'lock_conflict');
		if (failure.error.code === 'lock_conflict') {
			t.is(failure.error.kind, 'advisory_lock_conflict');
		}
	} finally {
		await fixture.cleanup();
	}
});

test('closeSession releases the Node file lock for another runtime', async (t) => {
	const fixture = await createTempBackendProject();
	const lockPath = lockPathFor(fixture.rootDir);
	try {
		const firstRuntime = createBackendRuntime();
		const first = await firstRuntime.openSession({ projectPath: fixture.rootDir });
		t.true(first.ok);
		if (!first.ok) return;
		t.true(
			await fs.stat(lockPath).then(
				() => true,
				() => false,
			),
		);
		t.true((await firstRuntime.closeSession({ sessionId: first.data.sessionId })).ok);
		t.false(
			await fs.stat(lockPath).then(
				() => true,
				() => false,
			),
		);

		const secondRuntime = createBackendRuntime();
		const second = await secondRuntime.openSession({ projectPath: fixture.rootDir });
		t.true(second.ok);
		if (second.ok) await secondRuntime.closeSession({ sessionId: second.data.sessionId });
	} finally {
		await fixture.cleanup();
	}
});

test('stale Node lock is recovered without reclaiming a reused current pid', async (t) => {
	const fixture = await createTempBackendProject();
	const lockPath = lockPathFor(fixture.rootDir);
	const metadata = {
		schemaVersion: 2,
		processIdentity: 'previous-process',
		pid: process.pid,
		processStartTime: 0,
		hostname: os.hostname(),
		token: 'stale-owner',
		createdAt: new Date(0).toISOString(),
	};
	try {
		await fs.writeFile(lockPath, JSON.stringify(metadata), 'utf-8');
		const runtime = createBackendRuntime();
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (opened.ok) {
			const current = JSON.parse(await fs.readFile(lockPath, 'utf-8')) as { token: string };
			t.not(current.token, metadata.token);
			await runtime.closeSession({ sessionId: opened.data.sessionId });
		}
	} finally {
		await fs.rm(lockPath, { force: true });
		await fixture.cleanup();
	}
});

test('dead Node lock owner is recovered', async (t) => {
	const fixture = await createTempBackendProject();
	const lockPath = lockPathFor(fixture.rootDir);
	try {
		await fs.writeFile(
			lockPath,
			JSON.stringify({
				schemaVersion: 2,
				processIdentity: 'previous-process',
				pid: 2_147_483_647,
				processStartTime: 1,
				hostname: os.hostname(),
				token: 'dead-owner',
			}),
			'utf-8',
		);
		const runtime = createBackendRuntime();
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (opened.ok) await runtime.closeSession({ sessionId: opened.data.sessionId });
	} finally {
		await fs.rm(lockPath, { force: true });
		await fixture.cleanup();
	}
});

test('an old lock left without metadata by a crashed creator is recovered', async (t) => {
	const fixture = await createTempBackendProject();
	const lockPath = lockPathFor(fixture.rootDir);
	try {
		await fs.writeFile(lockPath, '', 'utf-8');
		const old = new Date(Date.now() - 60_000);
		await fs.utimes(lockPath, old, old);
		const runtime = createBackendRuntime();
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (opened.ok) await runtime.closeSession({ sessionId: opened.data.sessionId });
		const siblings = await fs.readdir(path.dirname(lockPath));
		t.false(
			siblings.some((name) => name.startsWith(`${path.basename(lockPath)}.stale-`)),
			'no claimed lock copy remains',
		);
	} finally {
		await fs.rm(lockPath, { force: true });
		await fixture.cleanup();
	}
});

test('an old lock with unrecognized JSON metadata remains an advisory conflict', async (t) => {
	const fixture = await createTempBackendProject();
	const lockPath = lockPathFor(fixture.rootDir);
	try {
		await fs.writeFile(lockPath, JSON.stringify({ schemaVersion: 99 }), 'utf-8');
		const old = new Date(Date.now() - 60_000);
		await fs.utimes(lockPath, old, old);
		const opened = await createBackendRuntime().openSession({ projectPath: fixture.rootDir });
		t.false(opened.ok);
		if (!opened.ok) t.like(opened.error, { code: 'lock_conflict', kind: 'advisory_lock_conflict' });
		t.is(await fs.readFile(lockPath, 'utf-8'), JSON.stringify({ schemaVersion: 99 }));
	} finally {
		await fs.rm(lockPath, { force: true });
		await fixture.cleanup();
	}
});

test('active Node lock metadata remains an advisory conflict', async (t) => {
	const fixture = await createTempBackendProject();
	const lockPath = lockPathFor(fixture.rootDir);
	try {
		const first = createBackendRuntime();
		const opened = await first.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (!opened.ok) return;
		const metadata = JSON.parse(await fs.readFile(lockPath, 'utf-8')) as Record<string, unknown>;
		t.is(metadata.schemaVersion, 2);
		t.is(metadata.pid, process.pid);
		t.is(metadata.hostname, os.hostname());
		t.is(typeof metadata.processStartTime, 'number');
		t.is(typeof metadata.token, 'string');

		const second = await createBackendRuntime().openSession({ projectPath: fixture.rootDir });
		t.false(second.ok);
		await first.closeSession({ sessionId: opened.data.sessionId });
	} finally {
		await fs.rm(lockPath, { force: true });
		await fixture.cleanup();
	}
});

test('a live foreign PID with a different OS creation identity does not keep a stale lock', async (t) => {
	const fixture = await createTempBackendProject();
	t.teardown(() => fixture.cleanup());
	const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
		stdio: 'ignore',
		windowsHide: true,
	});
	await once(child, 'spawn');
	t.teardown(() => {
		child.kill();
	});
	const base = createNodeBackendFileSystem();
	const lockPath = base.getSessionLockPath!(fixture.rootDir);
	await fs.writeFile(
		lockPath,
		JSON.stringify({
			schemaVersion: 2,
			pid: child.pid,
			processStartTime: 0,
			processIdentity: 'previous-process',
			hostname: os.hostname(),
			token: 'old',
		}),
	);
	const lock = await base.acquireSessionLock(lockPath);
	t.not(JSON.parse(await fs.readFile(lockPath, 'utf8')).token, 'old');
	await lock.release();
});

test('concurrent stale-lock contenders publish exactly one owner before host metadata', async (t) => {
	const fixture = await createTempBackendProject();
	t.teardown(() => fixture.cleanup());
	const base = createNodeBackendFileSystem();
	const lockPath = base.getSessionLockPath!(fixture.rootDir);
	await fs.writeFile(lockPath, '');
	const old = new Date(Date.now() - 60_000);
	await fs.utimes(lockPath, old, old);
	const results = await Promise.allSettled(Array.from({ length: 8 }, () => base.acquireSessionLock(lockPath)));
	const winners = results.filter((result) => result.status === 'fulfilled');
	t.is(winners.length, 1);
	t.is(typeof JSON.parse(await fs.readFile(lockPath, 'utf8')).processIdentity, 'string');
	for (const winner of winners) await winner.value.release();
	t.deepEqual(await fs.readdir(lockPath + '.coordination'), []);
});

test('independent Node processes racing a stale lock cannot both acquire it', async (t) => {
	t.timeout(30_000);
	const fixture = await createTempBackendProject();
	t.teardown(() => fixture.cleanup());
	const lockPath = lockPathFor(fixture.rootDir);
	await fs.writeFile(lockPath, '');
	const old = new Date(Date.now() - 60_000);
	await fs.utimes(lockPath, old, old);
	const entry = new URL('../src/node.ts', import.meta.url).href;
	const script = `
		import { createNodeBackendFileSystem } from ${JSON.stringify(entry)};
		process.once('message', async () => {
			try {
				const lock = await createNodeBackendFileSystem().acquireSessionLock(${JSON.stringify(lockPath)});
				process.send({ acquired: true });
				process.once('message', async () => { await lock.release(); process.exit(0); });
			} catch (error) { process.send({ acquired: false, code: error.code }); process.exit(0); }
		});
		process.send({ ready: true });
	`;
	const children = Array.from({ length: 3 }, () =>
		spawn(process.execPath, ['--import', 'tsx/esm', '--input-type=module', '-e', script], {
			stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
			windowsHide: true,
		}),
	);
	t.teardown(() => {
		for (const child of children) child.kill();
	});
	await Promise.all(children.map((child) => once(child, 'message')));
	const outcomes = children.map((child) => once(child, 'message'));
	for (const child of children) child.send('acquire');
	const results = (await Promise.all(outcomes)).map(([value]) => value as { acquired: boolean; code?: string });
	t.is(results.filter((result) => result.acquired).length, 1);
	for (const result of results.filter((result) => !result.acquired)) t.is(result.code, 'EEXIST');
	const winner = children[results.findIndex((result) => result.acquired)]!;
	const exited = once(winner, 'exit');
	winner.send('release');
	await exited;
	t.deepEqual(await fs.readdir(lockPath + '.coordination'), []);
});

test.serial('Windows retries transient lock publication without losing ownership', async (t) => {
	if (process.platform !== 'win32') {
		t.pass('Windows-specific retry');
		return;
	}
	const fixture = await createTempBackendProject();
	t.teardown(() => fixture.cleanup());
	const base = createNodeBackendFileSystem();
	const lockPath = lockPathFor(fixture.rootDir);
	const link = fs.link;
	let failures = 0;
	fs.link = async (source, target) => {
		if (String(target) === lockPath && failures++ < 2)
			throw Object.assign(new Error('temporarily occupied'), { code: 'EPERM' });
		return link(source, target);
	};
	let lock;
	try {
		lock = await base.acquireSessionLock(lockPath);
	} finally {
		fs.link = link;
	}
	t.true(failures >= 3);
	const before = await fs.readFile(lockPath, 'utf8');
	await lock.writeMetadata('{"host":"test"}');
	t.is(await fs.readFile(lockPath, 'utf8'), before, 'host metadata never replaces ownership');
	const owner = JSON.parse(before);
	t.is(
		JSON.parse(await fs.readFile(path.join(lockPath + '.coordination', '.host-' + owner.token), 'utf8')).host,
		'test',
	);
	await lock.release();
	t.deepEqual(await fs.readdir(lockPath + '.coordination'), []);
});

test('Windows lock identity survives a failed probe and slow PowerShell startup', async (t) => {
	if (process.platform !== 'win32') {
		t.pass('Windows-specific process identity probe');
		return;
	}
	const fixture = await createTempBackendProject();
	t.teardown(() => fixture.cleanup());
	const entry = new URL('../src/node-session-lock.ts', import.meta.url).href;
	const lockPath = lockPathFor(fixture.rootDir);
	// A separate process starts with an empty identity cache and isolates the OS-probe injection.
	const script = `
		import assert from 'node:assert/strict';
		import cp from 'node:child_process';
		import fs from 'node:fs/promises';
		import { syncBuiltinESMExports } from 'node:module';
		import { promisify } from 'node:util';
		const original = cp.execFile;
		const execute = promisify(original);
		let probes = 0;
		const wrapped = (...args) => original(...args);
		wrapped[promisify.custom] = async (file, args, options) => {
			if (file !== 'powershell.exe') return execute(file, args, options);
			probes++;
			if (probes === 1) throw new Error('transient OS identity probe failure');
			return execute(file, [...args.slice(0, -1), 'Start-Sleep -Seconds 6; ' + args.at(-1)], options);
		};
		cp.execFile = wrapped;
		syncBuiltinESMExports();
		const { acquireNodeSessionLock } = await import(${JSON.stringify(entry)});
		const lockPath = ${JSON.stringify(lockPath)};
		await assert.rejects(acquireNodeSessionLock(lockPath), /owner creation identity/);
		await assert.rejects(fs.stat(lockPath), { code: 'ENOENT' });
		const locks = await Promise.all([
			acquireNodeSessionLock(lockPath),
			acquireNodeSessionLock(lockPath + '-second'),
		]);
		await Promise.all(locks.map(lock => lock.release()));
		assert.equal(probes, 2, 'successful identity is shared and cached; failure is not cached');
	`;
	const child = spawn(process.execPath, ['--import', 'tsx/esm', '--input-type=module', '-e', script], {
		stdio: ['ignore', 'ignore', 'pipe'],
		windowsHide: true,
		timeout: 30_000,
	});
	t.teardown(() => child.kill());
	let stderr = '';
	child.stderr!.on('data', (chunk) => {
		stderr += chunk;
	});
	const [code] = await once(child, 'exit');
	t.is(code, 0, stderr);
});
