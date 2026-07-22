import test from 'ava';
import { ProjectReader } from '@openfairygui/core/project-io';
import { liftDocumentToUamProject, normalizeUamProject } from '@openfairygui/core/uam';
import { BackendRuntime, createBackendStorageFileSystem, type BackendAsyncStorageAdapter } from '../src/index.js';
import { createBackendFixtureProject } from './helpers.js';

class MemoryBrowserStorage implements BackendAsyncStorageAdapter {
	private readonly files = new Map<string, Uint8Array>();
	private readonly directories = new Set<string>(['.']);

	public hasFile(filePath: string): boolean {
		return this.files.has(this.normalize(filePath));
	}

	public async readFile(filePath: string): Promise<string> {
		const data = await this.readFileRaw(filePath);
		return new TextDecoder().decode(data);
	}

	public async readFileRaw(filePath: string): Promise<Uint8Array> {
		const data = this.files.get(this.normalize(filePath));
		if (!data) throw new Error(`Missing file: ${filePath}`);
		return new Uint8Array(data);
	}

	public async writeFile(filePath: string, content: string): Promise<void> {
		await this.writeFileRaw(filePath, new TextEncoder().encode(content));
	}

	public async writeFileRaw(filePath: string, data: Uint8Array): Promise<void> {
		const normalized = this.normalize(filePath);
		await this.mkdir(this.parentDir(normalized), { recursive: true });
		this.files.set(normalized, new Uint8Array(data));
	}

	public async mkdir(dirPath: string, _options?: { recursive?: boolean }): Promise<void> {
		const normalized = this.normalize(dirPath);
		let current = '';
		for (const part of normalized.split('/').filter(Boolean)) {
			current = current ? `${current}/${part}` : part;
			this.directories.add(current);
		}
		this.directories.add(normalized || '.');
	}

	public async readdir(dirPath: string): Promise<string[]> {
		const normalized = this.normalize(dirPath);
		if (!this.directories.has(normalized)) throw new Error(`Missing directory: ${dirPath}`);
		const prefix = normalized === '.' ? '' : `${normalized}/`;
		const names = new Set<string>();
		for (const directory of this.directories) {
			if (directory === normalized || !directory.startsWith(prefix)) continue;
			const remainder = directory.slice(prefix.length);
			const [name] = remainder.split('/');
			if (name) names.add(name);
		}
		for (const filePath of this.files.keys()) {
			if (!filePath.startsWith(prefix)) continue;
			const remainder = filePath.slice(prefix.length);
			const [name] = remainder.split('/');
			if (name) names.add(name);
		}
		return [...names].sort();
	}

	public async exists(filePath: string): Promise<boolean> {
		const normalized = this.normalize(filePath);
		return this.files.has(normalized) || this.directories.has(normalized);
	}

	public async stat(filePath: string): Promise<{ kind: 'file' | 'directory' }> {
		const normalized = this.normalize(filePath);
		if (this.files.has(normalized)) return { kind: 'file' };
		if (this.directories.has(normalized)) return { kind: 'directory' };
		throw new Error(`Missing path: ${filePath}`);
	}

	public async unlink(filePath: string): Promise<void> {
		this.files.delete(this.normalize(filePath));
	}

	private normalize(filePath: string): string {
		return filePath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '').replace(/\/+$/, '') || '.';
	}

	private parentDir(filePath: string): string {
		const parts = this.normalize(filePath).split('/').filter(Boolean);
		parts.pop();
		return parts.join('/') || '.';
	}
}

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
	const saveFailure = saved as Extract<typeof saved, { ok: false }>;
	t.is(saveFailure.error.code, 'capability_unavailable');
	if (saveFailure.error.code === 'capability_unavailable') {
		t.is(saveFailure.error.capability, 'fileSystem');
	}
	t.deepEqual(saveFailure.meta.diagnostics, [
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
	const openFailure = opened as Extract<typeof opened, { ok: false }>;
	t.is(openFailure.error.code, 'capability_unavailable');
	if (openFailure.error.code === 'capability_unavailable') {
		t.is(openFailure.error.requiredAdapter, 'BackendFileSystem');
	}
	t.is(openFailure.meta.stage, 'runtime');
	t.is(openFailure.meta.diagnostics[0]?.code, 'capability_unavailable');
});

test('browser-safe project session saves through injected async storage', async (t) => {
	const storage = new MemoryBrowserStorage();
	const fileSystem = createBackendStorageFileSystem(storage);
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({
		project: createBackendFixtureProject(),
		storage: {
			fileSystem,
			fairyPath: 'Project.fairy',
		},
	});
	t.true(opened.ok);
	if (!opened.ok) return;
	t.false(opened.data.lockHeld);
	t.is(opened.data.canonicalProjectPath, '.');

	const applied = await runtime.applyTransaction({
		sessionId: opened.data.sessionId,
		expectedRevision: 0,
		operations: [
			{
				kind: 'setDisplayNodeProps',
				selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
				props: {
					text: 'Stored in browser storage',
					touchable: false,
					grayed: true,
					alpha: 0.65,
					rotation: 15,
				},
			},
		],
	});
	t.true(applied.ok);
	if (!applied.ok) return;

	const saved = await runtime.saveSession({ sessionId: opened.data.sessionId });
	t.true(saved.ok);
	if (!saved.ok) return;
	t.false(saved.data.dirty);
	t.is(saved.data.lastSavedRevision, 1);
	t.true(storage.hasFile('Project.fairy'));

	const reloaded = normalizeUamProject(liftDocumentToUamProject(await new ProjectReader(fileSystem).read('Project.fairy')));
	const pkg = reloaded.packages.find((candidate) => candidate.id === 'pkg001');
	const component = pkg?.resources.find((resource) => resource.id === 'cmp001');
	t.is(component?.kind, 'component');
	if (component?.kind !== 'component') return;
	const title = component.component.displayList.find((node) => node.id === 'n1');
	t.is(title?.kind, 'text');
	if (title?.kind === 'text') {
		t.is(title.text, 'Stored in browser storage');
		t.false(title.touchable);
		t.true(title.grayed);
		t.is(title.alpha, 0.65);
		t.is(title.rotation, 15);
	}
});

test('materializeSession writes a clean browser-safe session without advancing edit revision', async (t) => {
	const storage = new MemoryBrowserStorage();
	const fileSystem = createBackendStorageFileSystem(storage);
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({
		project: createBackendFixtureProject(),
		storage: {
			fileSystem,
			fairyPath: 'Workspace/Project.fairy',
		},
	});
	t.true(opened.ok);
	if (!opened.ok) return;
	t.false(opened.data.dirty);
	t.is(opened.data.revision, 0);
	t.is(opened.data.lastSavedRevision, 0);

	const materialized = await runtime.materializeSession({
		sessionId: opened.data.sessionId,
		expectedRevision: 0,
		mode: 'fullProject',
		reason: 'workspace_bootstrap',
	});
	t.true(materialized.ok);
	if (!materialized.ok) return;
	t.is(materialized.data.revision, 0);
	t.is(materialized.data.materializeRevision, 0);
	t.is(materialized.data.saveRevision, 0);
	t.is(materialized.data.lastSavedRevision, 0);
	t.false(materialized.data.dirty);
	t.is(materialized.data.reason, 'workspace_bootstrap');
	t.deepEqual(materialized.data.skippedPaths, []);
	t.true(materialized.data.writtenPaths.some((filePath) => filePath.endsWith('Project.fairy')));
	t.true(storage.hasFile('Workspace/Project.fairy'));
	t.deepEqual(materialized.meta.diagnostics, []);

	const reloaded = normalizeUamProject(liftDocumentToUamProject(await new ProjectReader(fileSystem).read('Workspace/Project.fairy')));
	t.deepEqual(reloaded.packages.map((pkg) => pkg.id), ['pkg001']);
});

test('materializeSession can bind storage to an existing memory session for workspace bootstrap', async (t) => {
	const storage = new MemoryBrowserStorage();
	const fileSystem = createBackendStorageFileSystem(storage);
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({
		project: createBackendFixtureProject(),
		canonicalProjectPath: 'memory://bootstrap',
	});
	t.true(opened.ok);
	if (!opened.ok) return;
	t.is(opened.data.canonicalProjectPath, 'memory://bootstrap');

	const materialized = await runtime.materializeSession({
		sessionId: opened.data.sessionId,
		expectedRevision: 0,
		storage: {
			fileSystem,
			fairyPath: 'Bootstrap/Project.fairy',
		},
		mode: 'fullProject',
		reason: 'workspace_bootstrap',
	});
	t.true(materialized.ok);
	if (!materialized.ok) return;
	t.is(materialized.data.canonicalProjectPath, 'Bootstrap');
	t.false(materialized.data.dirty);
	t.true(storage.hasFile('Bootstrap/Project.fairy'));

	const session = runtime.getSession({ sessionId: opened.data.sessionId });
	t.true(session.ok);
	if (session.ok) t.is(session.data.canonicalProjectPath, 'Bootstrap');
});

test('materializeSession rejects rebinding storage already owned by another session', async (t) => {
	const storage = new MemoryBrowserStorage();
	const fileSystem = createBackendStorageFileSystem(storage);
	const runtime = new BackendRuntime();
	const first = runtime.openProjectSession({
		project: createBackendFixtureProject(),
		storage: {
			fileSystem,
			fairyPath: 'Project.fairy',
		},
	});
	const second = runtime.openProjectSession({
		project: createBackendFixtureProject(),
		canonicalProjectPath: 'memory://second',
	});
	t.true(first.ok);
	t.true(second.ok);
	if (!first.ok || !second.ok) return;

	const materialized = await runtime.materializeSession({
		sessionId: second.data.sessionId,
		expectedRevision: 0,
		storage: {
			fileSystem,
			fairyPath: 'Project.fairy',
		},
		mode: 'fullProject',
		reason: 'workspace_bootstrap',
	});
	t.false(materialized.ok);
	if (materialized.ok) return;
	const materializeFailure = materialized as Extract<typeof materialized, { ok: false }>;
	t.is(materializeFailure.error.code, 'lock_conflict');
	if (materializeFailure.error.code === 'lock_conflict') {
		t.is(materializeFailure.error.holderSessionId, first.data.sessionId);
	}
});

test('saveSession force materializes a clean browser-safe session', async (t) => {
	const storage = new MemoryBrowserStorage();
	const fileSystem = createBackendStorageFileSystem(storage);
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({
		project: createBackendFixtureProject(),
		storage: {
			fileSystem,
			fairyPath: 'Project.fairy',
		},
	});
	t.true(opened.ok);
	if (!opened.ok) return;

	const saved = await runtime.saveSession({
		sessionId: opened.data.sessionId,
		expectedRevision: 0,
		force: true,
		mode: 'materializeCleanSession',
	});
	t.true(saved.ok);
	if (!saved.ok) return;
	t.false(saved.data.dirty);
	t.is(saved.data.revision, 0);
	t.true('writtenPaths' in saved.data);
	if ('writtenPaths' in saved.data) {
		t.true(saved.data.writtenPaths.some((filePath) => filePath.endsWith('Project.fairy')));
	}
	t.true(storage.hasFile('Project.fairy'));
});

test('materializeSession reports stable validation diagnostics before write', async (t) => {
	const project = createBackendFixtureProject();
	const component = project.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	if (component?.kind !== 'component') {
		t.fail('expected component resource');
		return;
	}
	component.component.displayList[1]!.id = 'n0';

	const storage = new MemoryBrowserStorage();
	const fileSystem = createBackendStorageFileSystem(storage);
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({
		project,
		storage: {
			fileSystem,
			fairyPath: 'Project.fairy',
		},
	});
	t.true(opened.ok);
	if (!opened.ok) return;

	const materialized = await runtime.materializeSession({
		sessionId: opened.data.sessionId,
		expectedRevision: 0,
		reason: 'workspace_bootstrap',
	});
	t.false(materialized.ok);
	if (materialized.ok) return;
	const materializeFailure = materialized as Extract<typeof materialized, { ok: false }>;
	t.is(materializeFailure.error.code, 'materialize_validation_failed');
	if (materializeFailure.error.code === 'materialize_validation_failed') {
		t.is(materializeFailure.error.issueCount, 1);
		t.is(materializeFailure.error.diagnostics[0]?.code, 'materialize_validation_failed');
		t.is(materializeFailure.error.diagnostics[0]?.operationKind, 'materializeSession');
		t.regex(materializeFailure.error.diagnostics[0]?.path ?? '', /displayList\[1\]\.id/u);
	}
	t.is(materializeFailure.meta.diagnostics[0]?.code, 'materialize_validation_failed');
	t.false(storage.hasFile('Project.fairy'));
});
