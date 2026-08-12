import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBackendRuntime, createTempBackendProject } from './helpers.js';

test('canonical path logic collapses project root and fairy file aliases to one backend identity', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const runtime = createBackendRuntime();
		const rootOpened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(rootOpened.ok);
		if (!rootOpened.ok) return;

		const aliasOpened = await runtime.openSession({ projectPath: fixture.fairyPath });
		t.false(aliasOpened.ok);
		if (aliasOpened.ok) return;
		const failure = aliasOpened as Extract<typeof aliasOpened, { ok: false }>;

		t.is(failure.error.code, 'lock_conflict');
		if (failure.error.code === 'lock_conflict') {
			t.is(failure.error.kind, 'in_process_session_exists');
		}
	} finally {
		await fixture.cleanup();
	}
});

test('openSession rejects symbolic links inside a Node project', async (t) => {
	const fixture = await createTempBackendProject();
	const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-outside-'));
	try {
		try {
			await fs.symlink(outside, path.join(fixture.rootDir, 'assets', 'Main', 'outside-link'), 'dir');
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code === 'EPERM' || code === 'ENOSYS') {
				t.pass('symlinks are unavailable in this environment');
				return;
			}
			throw error;
		}
		await t.throwsAsync(createBackendRuntime().openSession({ projectPath: fixture.rootDir }), {
			message: /Symbolic links are not supported/,
		});
	} finally {
		await fixture.cleanup();
		await fs.rm(outside, { recursive: true, force: true });
	}
});

test('saveSession rejects disallowed save targets structurally', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const runtime = createBackendRuntime();
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (!opened.ok) return;

		const saved = await runtime.saveSession({
			sessionId: opened.data.sessionId,
			targetPath: `${fixture.rootDir}\\other.fairy`,
		});
		t.false(saved.ok);
		if (saved.ok) return;
		const failure = saved as Extract<typeof saved, { ok: false }>;

		t.is(failure.error.code, 'path_policy_violation');
		if (failure.error.code === 'path_policy_violation') {
			t.is(failure.error.policy, 'save_target');
		}
	} finally {
		await fixture.cleanup();
	}
});
