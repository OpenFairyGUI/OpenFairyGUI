import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'ava';
import { createBackendRuntime, createTempBackendProject } from './helpers.js';

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
	const lockPath = path.join(fixture.rootDir, '.openfairygui.backend.lock');
	try {
		await fs.writeFile(lockPath, 'occupied', 'utf-8');
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
	const lockPath = path.join(fixture.rootDir, '.openfairygui.backend.lock');
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
