import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createNodeBackendFileSystem } from '../src/node.js';
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
		const opened = await createBackendRuntime().openSession({ projectPath: fixture.rootDir });
		t.false(opened.ok);
		if (!opened.ok) t.like(opened.error, { code: 'project_open_failed', reason: 'symbolic_link_unsupported' });
	} finally {
		await fixture.cleanup();
		await fs.rm(outside, { recursive: true, force: true });
	}
});

test('openSession reports why a project could not be opened', async (t) => {
	const fixture = await createTempBackendProject();
	const runtime = createBackendRuntime();
	const reasonFor = async (projectPath: string) => {
		const opened = await runtime.openSession({ projectPath });
		t.false(opened.ok);
		return opened.ok ? undefined : opened.error;
	};
	try {
		t.like(await reasonFor(path.join(fixture.rootDir, 'missing')), {
			code: 'project_open_failed',
			reason: 'project_not_found',
		});
		t.like(await reasonFor(path.join(fixture.rootDir, 'assets')), {
			code: 'project_open_failed',
			reason: 'no_project_file',
		});
		await fs.writeFile(path.join(fixture.rootDir, 'notes.txt'), '');
		t.like(await reasonFor(path.join(fixture.rootDir, 'notes.txt')), {
			code: 'project_open_failed',
			reason: 'not_a_project_file',
		});
		await fs.writeFile(path.join(fixture.rootDir, 'Second.fairy'), '');
		const ambiguous = await reasonFor(fixture.rootDir);
		t.like(ambiguous, { code: 'project_open_failed', reason: 'multiple_project_files' });
		t.regex(ambiguous?.message ?? '', /Second.fairy/);
	} finally {
		await fixture.cleanup();
	}
});

test('openSession enforces canonical allowed project roots before project reads', async (t) => {
	const allowed = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-allowed-'));
	const fixture = await createTempBackendProject();
	try {
		const runtime = createBackendRuntime({ allowedProjectRoots: [allowed] });
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.false(opened.ok);
		if (!opened.ok) t.is(opened.error.code, 'project_root_not_allowed');
	} finally {
		await fixture.cleanup();
		await fs.rm(allowed, { recursive: true, force: true });
	}
});

test('allowed-root containment follows the file system case sensitivity', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const caseVariantRoot = path.join(path.dirname(fixture.rootDir), path.basename(fixture.rootDir).toUpperCase());
		t.not(caseVariantRoot, fixture.rootDir);
		// Resolve paths verbatim so the comparison, not the host volume, decides containment.
		const withCase = (caseSensitivePaths: boolean) => ({
			...createNodeBackendFileSystem(),
			resolvePath: async (filePath: string) => path.resolve(filePath),
			caseSensitivePaths,
		});

		const sensitive = createBackendRuntime({ fileSystem: withCase(true), allowedProjectRoots: [caseVariantRoot] });
		t.is(sensitive.getCapabilities().data.runtime.pathPolicy.canonicalization, 'realpath+normalized');
		const denied = await sensitive.openSession({ projectPath: fixture.rootDir });
		t.false(denied.ok);
		if (!denied.ok) t.is(denied.error.code, 'project_root_not_allowed');

		const insensitive = createBackendRuntime({
			fileSystem: withCase(false),
			allowedProjectRoots: [caseVariantRoot],
		});
		t.is(insensitive.getCapabilities().data.runtime.pathPolicy.canonicalization, 'realpath+normalized-casefold');
		const opened = await insensitive.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (opened.ok) await insensitive.closeSession({ sessionId: opened.data.sessionId });
	} finally {
		await fixture.cleanup();
	}
});

test('Node containment uses actual volume identities for case variants', async (t) => {
	const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-case-'));
	t.teardown(() => fs.rm(parent, { recursive: true, force: true }));
	const upper = path.join(parent, 'Project');
	const lower = path.join(parent, 'project');
	await fs.mkdir(upper);
	await fs.mkdir(lower, { recursive: true });
	const base = createNodeBackendFileSystem();
	const [first, second] = await Promise.all([fs.stat(upper), fs.stat(lower)]);
	if (first.ino === second.ino && first.dev === second.dev) {
		t.is(await base.resolvePath(upper), await base.resolvePath(lower));
	} else {
		t.not(await base.resolvePath(upper), await base.resolvePath(lower));
		const denied = await createBackendRuntime({ fileSystem: base, allowedProjectRoots: [upper] }).openSession({
			projectPath: lower,
		});
		t.false(denied.ok);
		if (!denied.ok) t.is(denied.error.code, 'project_root_not_allowed');
	}
});

test('openSession treats an empty allowed-roots list as allowing no projects', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const opened = await createBackendRuntime({ allowedProjectRoots: [] }).openSession({
			projectPath: fixture.rootDir,
		});
		t.false(opened.ok);
		if (!opened.ok) t.is(opened.error.code, 'project_root_not_allowed');
	} finally {
		await fixture.cleanup();
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
