import test from 'ava';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getFixtureProjectPath } from '@openfairygui/test-utils';
import { ProjectReader } from '@openfairygui/core/project-io';
import {
	liftDocumentToUamProject,
	normalizeUamProject,
	type UamGearBinding,
	type UamProject,
} from '@openfairygui/core/uam';
import { BackendRuntime, createBackendStorageFileSystem, type BackendAsyncStorageAdapter } from '../src/index.js';
import { createBackendFixtureProject } from './helpers.js';

const LAYABOX_PROJECT_PATH = getFixtureProjectPath(
	'FairyGUI-layabox',
	'demo/UIProject/FairyGUI-layabox-demo.fairy',
);

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

class FailingMemoryBrowserStorage extends MemoryBrowserStorage {
	private failRawWritePath: string | null = null;

	public failRawWritesAt(filePath: string): void {
		this.failRawWritePath = filePath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '');
	}

	public override async writeFileRaw(filePath: string, data: Uint8Array): Promise<void> {
		const normalized = filePath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '');
		if (normalized === this.failRawWritePath) {
			throw new Error(`Injected browser storage raw write failure: ${filePath}`);
		}
		await super.writeFileRaw(filePath, data);
	}
}

async function copyDirectoryToStorage(
	storage: MemoryBrowserStorage,
	sourceDirectory: string,
	targetDirectory: string,
): Promise<void> {
	await storage.mkdir(targetDirectory, { recursive: true });
	for (const entry of await fs.readdir(sourceDirectory, { withFileTypes: true })) {
		const sourcePath = path.join(sourceDirectory, entry.name);
		const targetPath = `${targetDirectory}/${entry.name}`;
		if (entry.isDirectory()) {
			await copyDirectoryToStorage(storage, sourcePath, targetPath);
			continue;
		}
		if (!entry.isFile()) continue;
		const data = await fs.readFile(sourcePath);
		await storage.writeFileRaw(targetPath, new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
	}
}

function findHydratedImage(project: UamProject): {
	packageId: string;
	packageName: string;
	resourceId: string;
	name: string;
	path: string;
	fileName: string;
	bytes: Uint8Array;
} {
	for (const pkg of project.packages) {
		for (const resource of pkg.resources) {
			if (resource.kind !== 'image' || !(resource.sourceBytes instanceof Uint8Array)) continue;
			return {
				packageId: pkg.id,
				packageName: pkg.name,
				resourceId: resource.id,
				name: resource.name,
				path: resource.path,
				fileName: resource.fileName ?? '',
				bytes: new Uint8Array(resource.sourceBytes),
			};
		}
	}
	throw new Error('Expected the LayaBox fixture to contain a hydrated image resource.');
}

function findGearTarget(project: UamProject): {
	packageId: string;
	componentResourceId: string;
	displayNodeId: string;
	controllerName: string;
} {
	for (const pkg of project.packages) {
		for (const resource of pkg.resources) {
			if (resource.kind !== 'component') continue;
			for (const controller of resource.component.controllers) {
				if (controller.pages.length === 0) continue;
				for (const node of resource.component.displayList) {
					if (node.gears.some((gear) => gear.controllerName === controller.name)) continue;
					return {
						packageId: pkg.id,
						componentResourceId: resource.id,
						displayNodeId: node.id,
						controllerName: controller.name,
					};
				}
			}
		}
	}
	throw new Error('Expected the LayaBox fixture to contain a display node without controller gears.');
}

function findDisplayNode(project: UamProject, target: ReturnType<typeof findGearTarget>) {
	const pkg = project.packages.find((candidate) => candidate.id === target.packageId);
	const component = pkg?.resources.find((resource) => resource.id === target.componentResourceId);
	if (component?.kind !== 'component') return null;
	return component.component.displayList.find((node) => node.id === target.displayNodeId) ?? null;
}

function createNonLookGears(controllerName: string, pageIds: readonly string[]): UamGearBinding[] {
	const [firstPageId, secondPageId = firstPageId] = pageIds;
	if (!firstPageId) throw new Error('Expected controller page ids.');
	const common = {
		controllerName,
		condition: '',
		positionsInPercent: false,
		tween: false,
		tweenDuration: 0.3,
		tweenDelay: 0,
		easeType: 5,
		customEasePath: '',
	};
	return [
		{ kind: 'display', name: 'display', controllerName, visibleOnPageIds: [firstPageId] },
		{ kind: 'display2', name: 'display2', controllerName, visibleOnPageIds: [secondPageId], condition: '1' },
		{ kind: 'xy', name: 'xy', ...common, states: [{ pageId: firstPageId, value: { x: 12, y: 18 } }], defaultValue: { x: 0, y: 0 } },
		{ kind: 'size', name: 'size', ...common, states: [{ pageId: firstPageId, value: { width: 48, height: 36, scaleX: 1.2, scaleY: 0.8 } }], defaultValue: { width: 24, height: 20, scaleX: 1, scaleY: 1 } },
		{ kind: 'color', name: 'color', ...common, states: [{ pageId: firstPageId, value: { color: '#ff00ff', outlineColor: null } }], defaultValue: { color: '#ffffff', outlineColor: null } },
		{ kind: 'animation', name: 'animation', ...common, states: [{ pageId: firstPageId, value: { frame: 3, playing: false, animationName: 'run', skinName: 'hero' } }], defaultValue: { frame: 0, playing: true, animationName: '', skinName: '' } },
		{ kind: 'text', name: 'text', ...common, states: [{ pageId: firstPageId, value: { text: 'Alert' } }], defaultValue: { text: 'Idle' } },
		{ kind: 'icon', name: 'icon', ...common, states: [{ pageId: firstPageId, value: { icon: 'ui://icon' } }], defaultValue: { icon: '' } },
		{ kind: 'fontSize', name: 'font-size', ...common, states: [{ pageId: firstPageId, value: { fontSize: 28 } }], defaultValue: { fontSize: 16 } },
	];
}

function updateNonLookGear(gear: UamGearBinding, pageId: string): UamGearBinding {
	switch (gear.kind) {
		case 'display': return { ...gear, visibleOnPageIds: [pageId] };
		case 'display2': return { ...gear, visibleOnPageIds: [pageId], condition: '2' };
		case 'xy': return { ...gear, states: [{ pageId, value: { x: 30, y: 40 } }], defaultValue: { x: 3, y: 4 } };
		case 'size': return { ...gear, states: [{ pageId, value: { width: 60, height: 44, scaleX: 1.1, scaleY: 1.3 } }], defaultValue: { width: 30, height: 28, scaleX: 1, scaleY: 1 } };
		case 'color': return { ...gear, states: [{ pageId, value: { color: '#00ff00', outlineColor: null } }], defaultValue: { color: '#111111', outlineColor: null } };
		case 'animation': return { ...gear, states: [{ pageId, value: { frame: 7, playing: true, animationName: 'idle', skinName: 'alt' } }], defaultValue: { frame: 1, playing: false, animationName: '', skinName: '' } };
		case 'text': return { ...gear, states: [{ pageId, value: { text: 'Updated' } }], defaultValue: { text: 'Default' } };
		case 'icon': return { ...gear, states: [{ pageId, value: { icon: 'ui://updated-icon' } }], defaultValue: { icon: 'ui://default-icon' } };
		case 'fontSize': return { ...gear, states: [{ pageId, value: { fontSize: 32 } }], defaultValue: { fontSize: 18 } };
		case 'look': throw new Error('Expected a non-look gear.');
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

test('browser-safe save failure keeps the prior resource source file intact', async (t) => {
	const project = createBackendFixtureProject();
	const image = project.packages[0]?.resources.find((resource) => resource.id === 'img001');
	if (image?.kind !== 'image') {
		t.fail('expected fixture image');
		return;
	}
	image.sourceBytes = new Uint8Array([9, 8, 7]);
	image.sourcePath = '/images/background.png';

	const storage = new FailingMemoryBrowserStorage();
	const fileSystem = createBackendStorageFileSystem(storage);
	const runtime = new BackendRuntime({ fileSystem });
	const opened = runtime.openProjectSession({
		project,
		storage: { fileSystem, fairyPath: 'FailureProject/Project.fairy' },
	});
	t.true(opened.ok);
	if (!opened.ok) return;
	const sessionId = opened.data.sessionId;
	try {
		const initialSave = await runtime.saveSession({ sessionId, force: true });
		t.true(initialSave.ok);
		if (!initialSave.ok) return;
		const oldSourcePath = 'FailureProject/assets/Main/images/background.png';
		t.true(storage.hasFile(oldSourcePath));

		const applied = await runtime.applyTransaction({
			sessionId,
			expectedRevision: 0,
			operations: [
				{
					kind: 'renameResource',
					selector: { packageId: 'pkg001', resourceId: 'img001' },
					newName: 'will-fail.png',
				},
				{
					kind: 'moveResource',
					selector: { packageId: 'pkg001', resourceId: 'img001' },
					toPath: '/moved',
				},
			],
		});
		t.true(applied.ok);
		if (!applied.ok) return;
		storage.failRawWritesAt('FailureProject/assets/Main/moved/will-fail.png');
		const failedSave = await runtime.saveSession({ sessionId, expectedRevision: applied.data.revision });
		t.false(failedSave.ok);
		t.true(storage.hasFile(oldSourcePath));
		t.deepEqual([...await storage.readFileRaw(oldSourcePath)], [9, 8, 7]);
	} finally {
		await runtime.closeSession({ sessionId });
	}
});

test('bound browser storage is not replaced by a saveSession filesystem override', async (t) => {
	const project = createBackendFixtureProject();
	const image = project.packages[0]?.resources.find((resource) => resource.id === 'img001');
	if (image?.kind !== 'image') {
		t.fail('expected fixture image');
		return;
	}
	image.sourceBytes = new Uint8Array([9, 8, 7]);
	const sourceStorage = new MemoryBrowserStorage();
	const overrideStorage = new MemoryBrowserStorage();
	const sourceFileSystem = createBackendStorageFileSystem(sourceStorage);
	const overrideFileSystem = createBackendStorageFileSystem(overrideStorage);
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({
		project,
		storage: { fileSystem: sourceFileSystem, fairyPath: 'Project.fairy' },
	});
	t.true(opened.ok);
	if (!opened.ok) return;
	const sessionId = opened.data.sessionId;
	try {
		t.true((await runtime.saveSession({ sessionId, force: true })).ok);
		const oldPath = 'assets/Main/images/background.png';
		await overrideStorage.writeFileRaw(oldPath, new Uint8Array([1, 2, 3]));

		const applied = await runtime.applyTransaction({
			sessionId,
			expectedRevision: 0,
			operations: [{
				kind: 'moveResource',
				selector: { packageId: 'pkg001', resourceId: 'img001' },
				toPath: '/moved',
			}],
		});
		t.true(applied.ok);
		if (!applied.ok) return;
		const saved = await runtime.saveSession({
			sessionId,
			expectedRevision: applied.data.revision,
			fileSystem: overrideFileSystem,
		});
		t.true(saved.ok);
		t.false(sourceStorage.hasFile(oldPath));
		t.true(sourceStorage.hasFile('assets/Main/moved/background.png'));
		t.deepEqual([...await overrideStorage.readFileRaw(oldPath)], [1, 2, 3]);
	} finally {
		await runtime.closeSession({ sessionId });
	}
});

test('browser-safe LayaBox storage sessions persist resource bytes and non-look gears through reload', async (t) => {
	const storage = new MemoryBrowserStorage();
	const projectRoot = 'LayaBoxProject';
	const fairyPath = `${projectRoot}/${path.basename(LAYABOX_PROJECT_PATH)}`;
	await copyDirectoryToStorage(storage, path.dirname(LAYABOX_PROJECT_PATH), projectRoot);

	const fileSystem = createBackendStorageFileSystem(storage);
	const reader = new ProjectReader(fileSystem);
	const initial = normalizeUamProject(liftDocumentToUamProject(await reader.read(fairyPath, { hydrateResourceBytes: true })));
	const image = findHydratedImage(initial);
	const gearTarget = findGearTarget(initial);
	const targetNode = findDisplayNode(initial, gearTarget);
	if (!targetNode) {
		t.fail('expected LayaBox display node target');
		return;
	}
	const initialComponent = initial.packages
		.find((pkg) => pkg.id === gearTarget.packageId)
		?.resources.find((resource) => resource.id === gearTarget.componentResourceId);
	if (initialComponent?.kind !== 'component') {
		t.fail('expected LayaBox component target');
		return;
	}
	const controller = initialComponent.component.controllers.find((candidate) => candidate.name === gearTarget.controllerName);
	if (!controller) {
		t.fail('expected LayaBox controller target');
		return;
	}

	const runtime = new BackendRuntime({ fileSystem });
	let sessionId: string | null = null;
	try {
		const opened = await runtime.openSession({ projectPath: projectRoot });
		t.true(opened.ok);
		if (!opened.ok) return;
		sessionId = opened.data.sessionId;
		let revision = opened.data.revision;

		const extension = path.extname(image.fileName) || '.bin';
		const renamedFileName = `browser-renamed-${image.resourceId}${extension}`;
		const movedPath = '/browser-edited';
		const appliedRename = await runtime.applyTransaction({
			sessionId,
			expectedRevision: revision,
			operations: [
				{
					kind: 'renameResource',
					selector: { packageId: image.packageId, resourceId: image.resourceId },
					newName: renamedFileName,
				},
				{
					kind: 'moveResource',
					selector: { packageId: image.packageId, resourceId: image.resourceId },
					toPath: movedPath,
				},
				{
					kind: 'setDisplayNodeProps',
					selector: gearTarget,
					props: { alpha: targetNode.alpha === 0.65 ? 0.55 : 0.65 },
				},
			],
		});
		t.true(appliedRename.ok);
		if (!appliedRename.ok) return;
		revision = appliedRename.data.revision;
		const renamedSave = await runtime.saveSession({ sessionId, expectedRevision: revision });
		t.true(renamedSave.ok);
		if (!renamedSave.ok) return;

		const renamedReload = normalizeUamProject(liftDocumentToUamProject(await reader.read(fairyPath, { hydrateResourceBytes: true })));
		const renamedImage = renamedReload.packages
			.find((pkg) => pkg.id === image.packageId)
			?.resources.find((resource) => resource.id === image.resourceId);
		if (renamedImage?.kind !== 'image') {
			t.fail('expected renamed image after browser storage reload');
			return;
		}
		t.is(renamedImage.name, renamedFileName.slice(0, -extension.length));
		t.is(renamedImage.fileName, renamedFileName);
		t.is(renamedImage.path, movedPath);
		t.is(renamedImage.sourcePath, `/browser-edited/${renamedFileName}`);
		t.deepEqual([...renamedImage.sourceBytes ?? []], [...image.bytes]);
		const oldImageSource = `${projectRoot}/assets/${image.packageName}/${image.path.replace(/^\/+|\/+$/g, '')}/${image.fileName}`.replace(/\/+/g, '/');
		const newImageSource = `${projectRoot}/assets/${image.packageName}/browser-edited/${renamedFileName}`;
		t.false(storage.hasFile(oldImageSource));
		t.true(storage.hasFile(newImageSource));
		const reloadedNodeAfterProps = findDisplayNode(renamedReload, gearTarget);
		if (!reloadedNodeAfterProps) {
			t.fail('expected display node after property reload');
			return;
		}
		t.is(reloadedNodeAfterProps.alpha, targetNode.alpha === 0.65 ? 0.55 : 0.65);

		const miscId = 'browser_misc_bytes';
		const miscFileName = 'browser-payload.bin';
		const addedMisc = await runtime.applyTransaction({
			sessionId,
			expectedRevision: revision,
			operations: [{
				kind: 'addResource',
				selector: { packageId: image.packageId },
				resource: {
					kind: 'misc',
					id: miscId,
					name: 'browser-payload',
					path: movedPath,
					exported: true,
					branch: '',
					branchItemIds: [],
					file: miscFileName,
					metadata: null,
					sourceBytes: new Uint8Array([1, 2, 3]),
				},
			}],
		});
		t.true(addedMisc.ok);
		if (!addedMisc.ok) return;
		revision = addedMisc.data.revision;
		const addedSave = await runtime.saveSession({ sessionId, expectedRevision: revision });
		t.true(addedSave.ok);
		if (!addedSave.ok) return;
		const addedReload = normalizeUamProject(liftDocumentToUamProject(await reader.read(fairyPath, { hydrateResourceBytes: true })));
		const addedReloadMisc = addedReload.packages
			.find((pkg) => pkg.id === image.packageId)
			?.resources.find((resource) => resource.id === miscId);
		t.is(addedReloadMisc?.kind, 'misc');
		if (addedReloadMisc?.kind === 'misc') t.deepEqual([...addedReloadMisc.sourceBytes ?? []], [1, 2, 3]);

		const replacedMisc = await runtime.applyTransaction({
			sessionId,
			expectedRevision: revision,
			operations: [{
				kind: 'replaceResourceBytes',
				selector: { packageId: image.packageId, resourceId: miscId },
				sourceBytes: new Uint8Array([4, 5, 6]),
			}],
		});
		t.true(replacedMisc.ok);
		if (!replacedMisc.ok) return;
		revision = replacedMisc.data.revision;
		const replacedSave = await runtime.saveSession({ sessionId, expectedRevision: revision });
		t.true(replacedSave.ok);
		if (!replacedSave.ok) return;

		const replacedReload = normalizeUamProject(liftDocumentToUamProject(await reader.read(fairyPath, { hydrateResourceBytes: true })));
		const reloadedMisc = replacedReload.packages
			.find((pkg) => pkg.id === image.packageId)
			?.resources.find((resource) => resource.id === miscId);
		if (reloadedMisc?.kind !== 'misc') {
			t.fail('expected added misc resource after browser storage reload');
			return;
		}
		t.deepEqual([...reloadedMisc.sourceBytes ?? []], [4, 5, 6]);

		const removedMisc = await runtime.applyTransaction({
			sessionId,
			expectedRevision: revision,
			operations: [{
				kind: 'removeResource',
				selector: { packageId: image.packageId, resourceId: miscId },
			}],
		});
		t.true(removedMisc.ok);
		if (!removedMisc.ok) return;
		revision = removedMisc.data.revision;
		const removedSave = await runtime.saveSession({ sessionId, expectedRevision: revision });
		t.true(removedSave.ok);
		if (!removedSave.ok) return;
		const removedReload = normalizeUamProject(liftDocumentToUamProject(await reader.read(fairyPath, { hydrateResourceBytes: true })));
		t.false(removedReload.packages
			.find((pkg) => pkg.id === image.packageId)
			?.resources.some((resource) => resource.id === miscId) ?? true);
		t.false(storage.hasFile(`${projectRoot}/assets/${image.packageName}/browser-edited/${miscFileName}`));

		const gears = createNonLookGears(gearTarget.controllerName, controller.pages.map((page) => page.id));
		const addedGears = await runtime.applyTransaction({
			sessionId,
			expectedRevision: revision,
			operations: gears.map((gear) => ({
				kind: 'addGear' as const,
				selector: { ...gearTarget, kind: gear.kind, controllerName: gearTarget.controllerName },
				gear,
			})),
		});
		t.true(addedGears.ok);
		if (!addedGears.ok) return;
		revision = addedGears.data.revision;
		const addedGearsSave = await runtime.saveSession({ sessionId, expectedRevision: revision });
		t.true(addedGearsSave.ok);
		if (!addedGearsSave.ok) return;
		const addedGearsReload = normalizeUamProject(liftDocumentToUamProject(await reader.read(fairyPath, { hydrateResourceBytes: true })));
		const addedNode = findDisplayNode(addedGearsReload, gearTarget);
		const addedGearsByKind = new Map(addedNode?.gears
			.filter((gear) => gear.controllerName === gearTarget.controllerName)
			.map((gear) => [gear.kind, gear]));
		for (const expected of gears) {
			const actual = addedGearsByKind.get(expected.kind);
			t.truthy(actual, `expected added ${expected.kind} gear after browser storage reload`);
			if (!actual) continue;
			t.is(actual.controllerName, gearTarget.controllerName);
			if (expected.kind === 'display') {
				t.deepEqual(actual.kind === 'display' ? actual.visibleOnPageIds : null, expected.visibleOnPageIds);
				continue;
			}
			if (expected.kind === 'display2') {
				t.deepEqual(actual.kind === 'display2' ? actual.visibleOnPageIds : null, expected.visibleOnPageIds);
				t.is(actual.kind === 'display2' ? actual.condition : null, expected.condition);
				continue;
			}
			t.deepEqual(actual.kind === expected.kind ? actual.states : null, expected.states);
			t.deepEqual(actual.kind === expected.kind ? actual.defaultValue : null, expected.defaultValue);
		}

		const updatedGears = gears.map((gear) => updateNonLookGear(gear, controller.pages[0]!.id));
		const updatedGearsResult = await runtime.applyTransaction({
			sessionId,
			expectedRevision: revision,
			operations: updatedGears.map((gear) => ({
				kind: 'updateGear' as const,
				selector: { ...gearTarget, kind: gear.kind, controllerName: gearTarget.controllerName },
				gear,
			})),
		});
		t.true(updatedGearsResult.ok);
		if (!updatedGearsResult.ok) return;
		revision = updatedGearsResult.data.revision;
		const updatedGearsSave = await runtime.saveSession({ sessionId, expectedRevision: revision });
		t.true(updatedGearsSave.ok);
		if (!updatedGearsSave.ok) return;

		const updatedReload = normalizeUamProject(liftDocumentToUamProject(await reader.read(fairyPath, { hydrateResourceBytes: true })));
		const updatedNode = findDisplayNode(updatedReload, gearTarget);
		const persistedGears = new Map(updatedNode?.gears
			.filter((gear) => gear.controllerName === gearTarget.controllerName)
			.map((gear) => [gear.kind, gear]));
		for (const expected of updatedGears) {
			const actual = persistedGears.get(expected.kind);
			t.truthy(actual, `expected ${expected.kind} gear after browser storage reload`);
			if (!actual) continue;
			if (expected.kind === 'display') {
				t.deepEqual(actual.kind === 'display' ? actual.visibleOnPageIds : null, expected.visibleOnPageIds);
				continue;
			}
			if (expected.kind === 'display2') {
				t.deepEqual(actual.kind === 'display2' ? actual.visibleOnPageIds : null, expected.visibleOnPageIds);
				t.is(actual.kind === 'display2' ? actual.condition : null, expected.condition);
				continue;
			}
			t.deepEqual(actual.kind === expected.kind ? actual.states : null, expected.states);
			t.deepEqual(actual.kind === expected.kind ? actual.defaultValue : null, expected.defaultValue);
		}

		const removedGears = await runtime.applyTransaction({
			sessionId,
			expectedRevision: revision,
			operations: gears.map((gear) => ({
				kind: 'removeGear' as const,
				selector: { ...gearTarget, kind: gear.kind, controllerName: gearTarget.controllerName },
			})),
		});
		t.true(removedGears.ok);
		if (!removedGears.ok) return;
		revision = removedGears.data.revision;
		const removedGearsSave = await runtime.saveSession({ sessionId, expectedRevision: revision });
		t.true(removedGearsSave.ok);
		if (!removedGearsSave.ok) return;
		const finalReload = normalizeUamProject(liftDocumentToUamProject(await reader.read(fairyPath, { hydrateResourceBytes: true })));
		const finalNode = findDisplayNode(finalReload, gearTarget);
		t.false(finalNode?.gears.some((gear) => gear.controllerName === gearTarget.controllerName && gears.some((candidate) => candidate.kind === gear.kind)) ?? true);
	} finally {
		if (sessionId) await runtime.closeSession({ sessionId });
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
