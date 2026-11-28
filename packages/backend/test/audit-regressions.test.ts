import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'ava';
import { Document, liftDocumentToUamProject } from '@openfairygui/core';
import { createNodeBackendFileSystem, createNodeBackendRuntime, disposeBackendRuntime } from '../src/node.js';
import { assertProjectPathContained, normalizeComparablePath } from '../src/path-policy.js';
import type { BackendFileSystem } from '../src/index.js';
import { createTempBackendProject } from './helpers.js';

function createMemoryBackendFileSystem(): BackendFileSystem {
	const files = new Map<string, string | Uint8Array>();
	return {
		caseSensitivePaths: true,
		async readFile(filePath: string): Promise<string> {
			const value = files.get(filePath);
			if (typeof value === 'string') return value;
			throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
		},
		async readFileRaw(filePath: string): Promise<Uint8Array> {
			const value = files.get(filePath);
			if (value instanceof Uint8Array) return value;
			throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
		},
		async writeFile(filePath: string, content: string): Promise<void> {
			files.set(filePath, content);
		},
		async writeFileRaw(filePath: string, data: Uint8Array): Promise<void> {
			files.set(filePath, data);
		},
		async mkdir(): Promise<void> {},
		async readdir(): Promise<string[]> {
			return [];
		},
		async stat(filePath: string) {
			if (files.has(filePath)) {
				return { isFile: () => true, isDirectory: () => false };
			}
			throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
		},
		async unlink(filePath: string): Promise<void> {
			files.delete(filePath);
		},
		async rmdir(): Promise<void> {},
		async resolvePath(filePath: string): Promise<string> {
			return filePath;
		},
		resolve(...parts: string[]): string {
			return path.posix.resolve(...parts);
		},
		join(...parts: string[]): string {
			return path.posix.join(...parts);
		},
		dirname(filePath: string): string {
			return path.posix.dirname(filePath);
		},
		async acquireSessionLock() {
			return {
				writeMetadata: async () => {},
				release: async () => {},
			};
		},
	};
}

test('normalizeComparablePath and assertProjectPathContained handle /, ., UNC, and extended Windows prefixes', async (t) => {
	t.is(normalizeComparablePath('/'), '/');
	t.is(normalizeComparablePath('/a/..'), '/');
	t.is(normalizeComparablePath('\\\\?\\C:\\Work\\Proj', true), 'c:/Work/Proj');
	t.is(normalizeComparablePath('\\\\?\\UNC\\server\\share\\dir', true), '//server/share/dir');

	const memFs = createMemoryBackendFileSystem();
	await t.notThrowsAsync(assertProjectPathContained(memFs, '/', '/var/project'));
	await t.throwsAsync(assertProjectPathContained(memFs, '.', '../outside'));
	await t.throwsAsync(assertProjectPathContained(memFs, '.', '/etc/passwd'));
	await t.notThrowsAsync(assertProjectPathContained(memFs, '.', 'assets/Main/package.xml'));
});

test('allowedProjectRoots rejects a symlinked .fairy pointing outside allowed roots', async (t) => {
	const fixture = await createTempBackendProject();
	const allowedDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-allowed-root-'));
	t.teardown(async () => {
		await fixture.cleanup();
		await fs.rm(allowedDir, { recursive: true, force: true });
	});

	const linkPath = path.join(allowedDir, 'Escape.fairy');
	try {
		await fs.symlink(fixture.fairyPath, linkPath, 'file');
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === 'EPERM' || code === 'ENOSYS') {
			t.pass('symlinks are unavailable in this environment');
			return;
		}
		throw error;
	}

	const runtime = createNodeBackendRuntime({ allowedProjectRoots: [allowedDir] });
	try {
		const opened = await runtime.openSession({ projectPath: linkPath });
		t.false(opened.ok);
		if (!opened.ok) {
			t.is(opened.error.code, 'project_root_not_allowed');
		}
	} finally {
		await disposeBackendRuntime(runtime);
	}
});

test('NodeBackendFileSystem rejects dangling symlinks with ELOOP', async (t) => {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-dangling-link-'));
	t.teardown(() => fs.rm(dir, { recursive: true, force: true }));
	const dangling = path.join(dir, 'dangling.txt');
	try {
		await fs.symlink(path.join(dir, 'does-not-exist.txt'), dangling, 'file');
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === 'EPERM' || code === 'ENOSYS') {
			t.pass('symlinks are unavailable in this environment');
			return;
		}
		throw error;
	}

	const backendFs = createNodeBackendFileSystem();
	await t.throwsAsync(backendFs.resolvePath(dangling), { code: 'ELOOP' });
	await t.throwsAsync(backendFs.writeFile(dangling, 'payload'), { code: 'ELOOP' });
});

test('materializeSession to an external FileSystem preserves dirty state on openProjectSession', async (t) => {
	const doc = new Document();
	doc.createPackage('Main')
		.setId('pkgdemo1')
		.addResource(doc.createComponent('MainView').setId('cmpdemo1').setPath('/').setSize(64, 64));
	const runtime = createNodeBackendRuntime();
	try {
		const opened = runtime.openProjectSession({
			project: liftDocumentToUamProject(doc),
			canonicalProjectPath: '/virtual/Demo.fairy',
		});
		t.true(opened.ok);
		if (!opened.ok) return;
		const sessionId = opened.data.sessionId;

		const primaryFs = createMemoryBackendFileSystem();
		const bound = await runtime.materializeSession({
			sessionId,
			expectedRevision: opened.data.revision,
			fileSystem: primaryFs,
		});
		t.true(bound.ok, bound.ok ? '' : JSON.stringify(bound.error));

		const applied = await runtime.applyTransaction({
			sessionId,
			expectedRevision: opened.data.revision,
			operations: [
				{
					kind: 'renameResource',
					selector: { packageId: 'pkgdemo1', resourceId: 'cmpdemo1' },
					newName: 'ExportedView',
				},
			],
		});
		t.true(applied.ok);
		if (!applied.ok) return;

		const externalFs = createMemoryBackendFileSystem();
		const exported = await runtime.materializeSession({
			sessionId,
			expectedRevision: applied.data.revision,
			fileSystem: externalFs,
		});
		t.true(exported.ok, exported.ok ? '' : JSON.stringify(exported.error));
		const afterExport = runtime.getSession({ sessionId });
		t.true(afterExport.ok);
		if (afterExport.ok) {
			t.true(afterExport.data.dirty);
			t.is(afterExport.data.lastSavedRevision, 0);
		}
	} finally {
		await disposeBackendRuntime(runtime);
	}
});

test('disposeBackendRuntime closes active file sessions and releases locks', async (t) => {
	const fixture = await createTempBackendProject();
	t.teardown(() => fixture.cleanup());

	const runtimeA = createNodeBackendRuntime();
	const opened = await runtimeA.openSession({ projectPath: fixture.rootDir });
	t.true(opened.ok);

	await disposeBackendRuntime(runtimeA);

	const runtimeB = createNodeBackendRuntime();
	try {
		const reopened = await runtimeB.openSession({ projectPath: fixture.rootDir });
		t.true(reopened.ok, 'Disposing runtimeA must release session locks for runtimeB');
	} finally {
		await disposeBackendRuntime(runtimeB);
	}
});
