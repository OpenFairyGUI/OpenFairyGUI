import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'ava';
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
		schemaVersion: 1,
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
		await fs.writeFile(lockPath, JSON.stringify({
			schemaVersion: 1,
			pid: 2_147_483_647,
			processStartTime: 1,
			hostname: os.hostname(),
			token: 'dead-owner',
		}), 'utf-8');
		const runtime = createBackendRuntime();
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (opened.ok) await runtime.closeSession({ sessionId: opened.data.sessionId });
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
		t.is(metadata.schemaVersion, 1);
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
