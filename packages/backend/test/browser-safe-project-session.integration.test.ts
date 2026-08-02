import test from 'ava';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createTestMovieClipJta, getFixtureProjectPath } from '@openfairygui/test-utils';
import { deriveMovieClipModelFromJta } from '@openfairygui/core';
import { ProjectReader, ProjectWriter } from '@openfairygui/core/project-io';
import {
	createDefaultUamComponentProperties,
	createDefaultUamPlainTextProperties,
	createDefaultUamTextProperties,
	liftDocumentToUamProject,
	normalizeUamProject,
	type UamComponentRefNode,
	type UamComponentResource,
	type UamGearBinding,
	type UamGraphProperties,
	type UamGroupProperties,
	type UamListNode,
	type UamPackage,
	type UamProject,
	type UamTransactionOperation,
	type UamMovieClipResource,
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

	public hasDirectory(dirPath: string): boolean {
		return this.directories.has(this.normalize(dirPath));
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

	public async rmdir(dirPath: string): Promise<void> {
		const normalized = this.normalize(dirPath);
		const prefix = `${normalized}/`;
		if (!this.directories.has(normalized)) throw new Error(`Missing directory: ${dirPath}`);
		if ([...this.directories].some((directory) => directory !== normalized && directory.startsWith(prefix))
			|| [...this.files.keys()].some((filePath) => filePath.startsWith(prefix))
		) {
			throw new Error(`Directory is not empty: ${dirPath}`);
		}
		this.directories.delete(normalized);
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

class PausingMemoryBrowserStorage extends MemoryBrowserStorage {
	private releaseWrite = (): void => undefined;
	private readonly resumeWrite = new Promise<void>((resolve) => {
		this.releaseWrite = resolve;
	});
	private markWriteStarted = (): void => undefined;
	public readonly writeStarted = new Promise<void>((resolve) => {
		this.markWriteStarted = resolve;
	});
	private paused = true;

	public continueWrite(): void {
		this.releaseWrite();
	}

	public override async writeFileRaw(filePath: string, data: Uint8Array): Promise<void> {
		if (this.paused) {
			this.paused = false;
			this.markWriteStarted();
			await this.resumeWrite;
		}
		await super.writeFileRaw(filePath, data);
	}
}

function createMovieClipResource(
	id: string,
	fileName: string,
	sourceBytes: Uint8Array,
	smoothing = true,
): UamMovieClipResource {
	const derived = deriveMovieClipModelFromJta(sourceBytes);
	return {
		kind: 'movieClip',
		id,
		name: fileName.replace(/\.jta$/i, ''),
		path: '/movieclips',
		exported: true,
		favorite: false,
		branch: '',
		branchItemIds: [],
		fileName,
		dimensions: derived.dimensions,
		movieClip: {
			interval: derived.interval,
			repeatDelay: derived.repeatDelay,
			swing: derived.swing,
			smoothing,
			frames: derived.frames.map(({ textureIndex: _textureIndex, ...frame }) => ({ ...frame, spriteId: '' })),
		},
		sourceBytes,
	};
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

function findComponent(project: UamProject, packageId: string, componentResourceId: string): UamComponentResource | null {
	const resource = project.packages
		.find((pkg) => pkg.id === packageId)
		?.resources.find((candidate) => candidate.id === componentResourceId);
	return resource?.kind === 'component' ? resource : null;
}

function createLifecyclePackage(): UamPackage {
	return {
		id: 'pkg002',
		name: 'Overlay',
		compressPNG: null,
		jpegQuality: null,
		publish: {
			name: '',
			path: '',
			branchPath: '',
			packageCount: 0,
			genCode: false,
			codePath: '',
			useGlobalAtlasSettings: true,
			maxAtlasSize: 2048,
			sizeOption: 'pot',
			forceSquare: false,
			allowRotation: false,
			paging: true,
			extractAlpha: false,
			maxAtlasIndex: 10,
			atlases: [],
			excludedResourceIds: [],
		},
		branchNames: [],
		folders: [],
		resources: [],
	};
}

function createLifecyclePlainTextProperties() {
	return {
		...createDefaultUamPlainTextProperties(),
		text: 'Popup',
		fontSize: 16,
		color: '#ffffff',
		align: 1,
		vAlign: 2,
		leading: 5,
		letterSpacing: 2,
		autoSize: 3,
		singleLine: true,
		autoClearText: true,
		underlaySoftness: 0.25,
		ubbEnabled: true,
		underline: true,
		italic: true,
		bold: true,
		strikethrough: true,
		strokeColor: '#112233',
		strokeSize: 0.5,
		shadowColor: '#445566',
		shadowOffset: { x: 0, y: 2 },
		demoText: 'Popup preview',
		templateVarsEnabled: true,
		faceDilate: 0.125,
	};
}

function createLifecycleComponent(id = 'cmp002', name = 'Popup'): UamComponentResource {
	return {
		kind: 'component',
		id,
		name,
		path: '/',
		exported: true,
		favorite: false,
		branch: '',
		branchItemIds: [],
		component: {
			size: { width: 160, height: 80 },
			properties: createDefaultUamComponentProperties(),
			customData: '',
			displayList: [
				{
					kind: 'text',
					...createLifecyclePlainTextProperties(),
					id: 'popup-title',
					name: 'title',
					position: { x: 8, y: 8 },
					size: { width: 120, height: 24 },
					visible: true,
					touchable: true,
					grayed: false,
					alpha: 1,
					rotation: 0,
					customData: '',
					relations: [],
					gears: [],
					group: '',
				},
				{
					kind: 'richText',
					...createDefaultUamTextProperties(),
					id: 'popup-rich',
					name: 'rich',
					position: { x: 8, y: 34 },
					size: { width: 120, height: 20 },
					visible: true,
					touchable: true,
					grayed: false,
					alpha: 1,
					rotation: 0,
					customData: '',
					relations: [],
					gears: [],
					group: '',
					text: '[b]Rich[/b]',
					fontSize: 15,
					color: '#aabbcc',
					autoSize: 4,
					underlaySoftness: 0.125,
					strokeColor: '#223344',
					strokeSize: 0.25,
					shadowColor: '#556677',
					shadowOffset: { x: 0, y: 1 },
				},
				{
					kind: 'textInput',
					...createDefaultUamPlainTextProperties(),
					id: 'popup-input',
					name: 'input',
					position: { x: 8, y: 56 },
					size: { width: 120, height: 20 },
					visible: true,
					touchable: true,
					grayed: false,
					alpha: 1,
					rotation: 0,
					customData: '',
					relations: [],
					gears: [],
					group: '',
					text: 'Input',
					fontSize: 14,
					color: '#ddeeff',
					autoSize: 4,
					demoText: 'Input preview',
					templateVarsEnabled: true,
					faceDilate: 0.25,
					underlaySoftness: 0.5,
					ubbEnabled: true,
					strokeColor: '#334455',
					strokeSize: 0.75,
					shadowColor: '#667788',
					shadowOffset: { x: 0, y: 3 },
					promptText: 'Type',
					maxLength: 20,
					restrict: 'A-Z',
					password: false,
					keyboardType: 3,
				},
			],
			controllers: [],
			transitions: [],
		},
	};
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

test('browser storage adapters require file and folder cleanup primitives', (t) => {
	const storage = new MemoryBrowserStorage();
	Object.defineProperty(storage, 'unlink', { value: undefined });

	const error = t.throws(() => createBackendStorageFileSystem(storage as unknown as BackendAsyncStorageAdapter));
	t.is(error?.message, 'Storage adapter must provide unlink() for project resource lifecycle writes.');

	const noRmdir = new MemoryBrowserStorage();
	Object.defineProperty(noRmdir, 'rmdir', { value: undefined });
	const rmdirError = t.throws(() => createBackendStorageFileSystem(noRmdir as unknown as BackendAsyncStorageAdapter));
	t.is(rmdirError?.message, 'Storage adapter must provide rmdir() for project resource folder lifecycle writes.');
});

test('browser-safe project session saves through injected async storage', async (t) => {
	const storage = new MemoryBrowserStorage();
	const fileSystem = createBackendStorageFileSystem(storage);
	const runtime = new BackendRuntime();
	const project = createBackendFixtureProject();
	const sourceComponent = project.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	if (sourceComponent?.kind !== 'component') {
		t.fail('expected backend fixture component');
		return;
	}
	sourceComponent.component.displayList.push({
		kind: 'graph',
		id: 'graph1',
		name: 'graph',
		position: { x: 0, y: 0 },
		size: { width: 40, height: 30 },
		locked: false,
		aspect: false,
		minSize: { width: 0, height: 0 },
		maxSize: { width: 0, height: 0 },
		pivot: { x: 0, y: 0 },
		pivotAsAnchor: false,
		scale: { x: 1, y: 1 },
		skew: { x: 0, y: 0 },
		visible: true,
		touchable: true,
		grayed: false,
		alpha: 1,
		rotation: 0,
		tooltips: '',
		blendMode: 'normal',
		filter: '',
		filterData: '',
		customData: '',
		relations: [],
		gears: [],
		group: '',
		graphType: 1,
		lineSize: 1,
		lineColor: '#000000',
		fillColor: '#FFFFFF',
		cornerRadius: null,
		points: null,
		sides: 0,
		startAngle: 0,
		distances: null,
	});
	sourceComponent.component.displayList.push({
		kind: 'group',
		id: 'group1',
		name: 'group',
		position: { x: 0, y: 0 },
		size: { width: 40, height: 30 },
		locked: false,
		aspect: false,
		minSize: { width: 0, height: 0 },
		maxSize: { width: 0, height: 0 },
		pivot: { x: 0, y: 0 },
		pivotAsAnchor: false,
		scale: { x: 1, y: 1 },
		skew: { x: 0, y: 0 },
		visible: true,
		touchable: true,
		grayed: false,
		alpha: 1,
		rotation: 0,
		tooltips: '',
		blendMode: 'normal',
		filter: '',
		filterData: '',
		customData: '',
		relations: [],
		gears: [],
		group: '',
		layout: 0,
		lineGap: 0,
		columnGap: 0,
		advanced: false,
		excludeInvisibles: false,
		autoSizeDisabled: false,
		mainGridIndex: -1,
	});
	const graphProperties: UamGraphProperties = {
		graphType: 3,
		lineSize: 2,
		lineColor: '#112233',
		fillColor: '#445566',
		cornerRadius: null,
		points: [0, 0, 40, 0, 20, 30],
		sides: 0,
		startAngle: 0,
		distances: null,
	};
	const groupProperties: UamGroupProperties = {
		layout: 1,
		lineGap: 4,
		columnGap: 6,
		advanced: true,
		excludeInvisibles: true,
		autoSizeDisabled: false,
		mainGridIndex: 0,
	};
	const opened = runtime.openProjectSession({
		project,
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
					locked: true,
					aspect: true,
					minSize: { width: 10, height: 8 },
					maxSize: { width: 140, height: 32 },
					scale: { x: 1.25, y: 0.75 },
					skew: { x: 2, y: 3 },
					touchable: false,
					grayed: true,
					alpha: 0.65,
					rotation: 15,
					tooltips: 'browser tip',
					blendMode: 'add',
					filter: 'color',
					filterData: '1,0.5,0.25,1',
				},
			},
			{
				kind: 'setDisplayNodeProps',
				selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'graph1' },
				props: { graphProperties },
			},
			{
				kind: 'setDisplayNodeProps',
				selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'group1' },
				props: { groupProperties },
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
		t.true(title.locked);
		t.true(title.aspect);
		t.deepEqual(title.minSize, { width: 10, height: 8 });
		t.deepEqual(title.maxSize, { width: 140, height: 32 });
		t.deepEqual(title.scale, { x: 1.25, y: 0.75 });
		t.deepEqual(title.skew, { x: 2, y: 3 });
		t.is(title.tooltips, 'browser tip');
		t.is(title.blendMode, 'add');
		t.is(title.filter, 'color');
		t.is(title.filterData, '1,0.5,0.25,1');
	}
	const graph = component.component.displayList.find((node) => node.id === 'graph1');
	t.is(graph?.kind, 'graph');
	if (graph?.kind === 'graph') {
		for (const [key, value] of Object.entries(graphProperties)) {
			t.deepEqual((graph as unknown as Record<string, unknown>)[key], value);
		}
	}
	const group = component.component.displayList.find((node) => node.id === 'group1');
	t.is(group?.kind, 'group');
	if (group?.kind === 'group') {
		for (const [key, value] of Object.entries(groupProperties)) {
			t.deepEqual((group as unknown as Record<string, unknown>)[key], value);
		}
	}
});

test('browser-safe addResource indexes survive multi-resource inverse save and reload', async (t) => {
	const createMisc = (id: string, byte: number) => ({
		kind: 'misc' as const,
		id,
		name: `${id}.bin`,
		path: '/',
		exported: true,
		favorite: false,
		branch: '',
		branchItemIds: [],
		file: `${id}.bin`,
		metadata: null,
		sourceBytes: new Uint8Array([byte]),
	});
	const storage = new MemoryBrowserStorage();
	const fileSystem = createBackendStorageFileSystem(storage);
	const project = createBackendFixtureProject();
	const pkg = project.packages[0]!;
	const orderedA = createMisc('zz0001', 11);
	const orderedB = createMisc('aa0001', 22);
	pkg.resources = [orderedA, pkg.resources[0]!, pkg.resources[1]!, orderedB];
	const originalOrder = pkg.resources.map((resource) => resource.id);
	const snapshots = [orderedA, orderedB].map((resource) => structuredClone(resource));
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({
		project,
		storage: { fileSystem, fairyPath: 'ResourceOrder/Project.fairy' },
	});
	t.true(opened.ok);
	if (!opened.ok) return;

	try {
		const removed = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: 0,
			operations: snapshots.map((resource) => ({
				kind: 'removeResource' as const,
				selector: { packageId: pkg.id, resourceId: resource.id },
			})),
		});
		t.true(removed.ok);
		if (!removed.ok) return;

		const restored = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: removed.data.revision,
			operations: snapshots.map((resource, index) => ({
				kind: 'addResource' as const,
				selector: { packageId: pkg.id },
				resource,
				atIndex: index === 0 ? 0 : 3,
			})),
		});
		t.true(restored.ok);
		if (!restored.ok) return;

		const saved = await runtime.saveSession({
			sessionId: opened.data.sessionId,
			expectedRevision: restored.data.revision,
		});
		t.true(saved.ok);
		if (!saved.ok) return;
		const reader = new ProjectReader(fileSystem);
		const reloadedDocument = await reader.read(
			'ResourceOrder/Project.fairy',
			{ hydrateResourceBytes: true },
		);
		t.is(
			reloadedDocument.getRoot().listPackages().find((candidate) => candidate.getId() === pkg.id)
				?.getExtras()._preservePackageResourceOrder,
			true,
		);
		await new ProjectWriter(fileSystem).write(reloadedDocument, 'ResourceOrderCopy/Project.fairy');
		const reloaded = normalizeUamProject(liftDocumentToUamProject(await reader.read(
			'ResourceOrderCopy/Project.fairy',
			{ hydrateResourceBytes: true },
		)));
		const reloadedPackage = reloaded.packages.find((candidate) => candidate.id === pkg.id)!;
		t.deepEqual(reloadedPackage.resources.map((resource) => resource.id), originalOrder);
		for (const [index, snapshot] of snapshots.entries()) {
			const resource = reloadedPackage.resources.find((candidate) => candidate.id === snapshot.id);
			if (!resource || resource.kind === 'component') {
				t.fail(`expected restored binary resource ${snapshot.id}`);
				continue;
			}
			t.deepEqual([...resource.sourceBytes ?? []], [index === 0 ? 11 : 22]);
		}
	} finally {
		await runtime.closeSession({ sessionId: opened.data.sessionId });
	}
});

test('browser-safe resource favorite transactions survive save, reload, and inverse', async (t) => {
	const storage = new MemoryBrowserStorage();
	const fileSystem = createBackendStorageFileSystem(storage);
	const project = createBackendFixtureProject();
	const pkg = project.packages.find((candidate) => candidate.id === 'pkg001');
	const image = pkg?.resources.find((resource) => resource.id === 'img001');
	const component = pkg?.resources.find((resource) => resource.id === 'cmp001');
	t.truthy(image);
	t.truthy(component);
	if (!image || !component) return;
	image.favorite = true;

	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({
		project,
		storage: { fileSystem, fairyPath: 'Favorites/Project.fairy' },
	});
	t.true(opened.ok);
	if (!opened.ok) return;

	const rejected = await runtime.applyTransaction({
		sessionId: opened.data.sessionId,
		expectedRevision: 0,
		operations: [{
			kind: 'setResourceFavorite',
			selector: { packageId: 'pkg001', resourceId: 'cmp001' },
			favorite: 'true' as unknown as boolean,
		}],
	});
	t.false(rejected.ok);
	if (rejected.ok) return;
	t.is(rejected.error.code, 'transaction_unsupported');
	t.is(rejected.meta.diagnostics[0]?.path, 'operations[0].favorite');

	const applied = await runtime.applyTransaction({
		sessionId: opened.data.sessionId,
		expectedRevision: 0,
		operations: [{
			kind: 'setResourceFavorite',
			selector: { packageId: 'pkg001', resourceId: 'cmp001' },
			favorite: true,
		}],
	});
	t.true(applied.ok);
	if (!applied.ok) return;

	const saved = await runtime.saveSession({ sessionId: opened.data.sessionId });
	t.true(saved.ok);
	if (!saved.ok) return;
	const packageXml = await storage.readFile('Favorites/assets/Main/package.xml');
	t.regex(packageXml, /<packageDescription[^>]*hasFavorites="true"/);

	const reloaded = normalizeUamProject(
		liftDocumentToUamProject(await new ProjectReader(fileSystem).read('Favorites/Project.fairy')),
	);
	const reloadedResources = reloaded.packages.find((candidate) => candidate.id === 'pkg001')?.resources ?? [];
	t.true(reloadedResources.find((resource) => resource.id === 'img001')?.favorite);
	t.true(reloadedResources.find((resource) => resource.id === 'cmp001')?.favorite);

	const inverse = await runtime.applyTransaction({
		sessionId: opened.data.sessionId,
		expectedRevision: 1,
		operations: [{
			kind: 'setResourceFavorite',
			selector: { packageId: 'pkg001', resourceId: 'cmp001' },
			favorite: false,
		}],
	});
	t.true(inverse.ok);
	if (!inverse.ok) return;
	const savedInverse = await runtime.saveSession({ sessionId: opened.data.sessionId });
	t.true(savedInverse.ok);
	if (!savedInverse.ok) return;

	const restored = normalizeUamProject(
		liftDocumentToUamProject(await new ProjectReader(fileSystem).read('Favorites/Project.fairy')),
	);
	const restoredResources = restored.packages.find((candidate) => candidate.id === 'pkg001')?.resources ?? [];
	t.true(restoredResources.find((resource) => resource.id === 'img001')?.favorite);
	t.false(restoredResources.find((resource) => resource.id === 'cmp001')?.favorite);
});

test('browser-safe project settings transactions survive save, reload, inverse, and optional sidecar removal', async (t) => {
	const storage = new MemoryBrowserStorage();
	const fileSystem = createBackendStorageFileSystem(storage);
	const project = createBackendFixtureProject();
	project.settings = {
		publish: { binaryFormat: true, atlasSetting: { maxSize: 2048 }, codeGeneration: { codePath: 'generated' } },
		common: { font: 'Arial', scrollBars: { vertical: 'ui://scroll' } },
		adaptation: { designResolutionX: 1280, devices: [{ name: 'tablet' }] },
		customProperties: { groups: [{ name: 'Gameplay' }] },
		i18n: { langFiles: [{ name: 'English', path: 'locale/en.xml' }] },
	};
	const original = structuredClone(project.settings);
	const updated = {
		publish: { binaryFormat: false, atlasSetting: { maxSize: 1024 }, codeGeneration: { codePath: 'src/ui' } },
		common: { font: 'Noto Sans', scrollBars: { vertical: 'ui://new-scroll' } },
		adaptation: { designResolutionX: 1920, devices: [{ name: 'desktop' }] },
		customProperties: { groups: [{ name: 'UI' }] },
		i18n: { langFiles: [{ name: 'French', path: 'locale/fr.xml' }] },
	};
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({
		project,
		storage: { fileSystem, fairyPath: 'Settings/Project.fairy' },
	});
	t.true(opened.ok);
	if (!opened.ok) return;
	const sessionId = opened.data.sessionId;
	t.true((await runtime.saveSession({ sessionId, force: true })).ok);

	const pending = runtime.applyTransaction({
		sessionId,
		expectedRevision: 0,
		operations: [{ kind: 'updateProjectSettings', settings: updated }],
	});
	updated.publish.atlasSetting.maxSize = 1;
	updated.i18n.langFiles[0]!.name = 'Mutated caller';
	const applied = await pending;
	t.true(applied.ok);
	if (!applied.ok) return;
	t.is(applied.data.revision, 1);
	t.true(applied.data.dirty);
	t.true((await runtime.saveSession({ sessionId, expectedRevision: 1 })).ok);
	const reloaded = await new ProjectReader(fileSystem).read('Settings/Project.fairy');
	t.is(reloaded.getRoot().getSettings().publish?.atlasSetting?.maxSize, 1024);
	t.is(reloaded.getRoot().getSettings().i18n?.langFiles[0]?.name, 'French');

	const inverse = await runtime.applyTransaction({
		sessionId,
		expectedRevision: 1,
		operations: [{ kind: 'updateProjectSettings', settings: original }],
	});
	t.true(inverse.ok);
	if (!inverse.ok) return;
	t.true((await runtime.saveSession({ sessionId, expectedRevision: 2 })).ok);
	t.deepEqual((await new ProjectReader(fileSystem).read('Settings/Project.fairy')).getRoot().getSettings(), original);

	const { customProperties: _customProperties, i18n: _i18n, ...withoutOptional } = original;
	const removed = await runtime.applyTransaction({
		sessionId,
		expectedRevision: 2,
		operations: [{ kind: 'updateProjectSettings', settings: withoutOptional }],
	});
	t.true(removed.ok);
	if (!removed.ok) return;
	t.true((await runtime.saveSession({ sessionId, expectedRevision: 3 })).ok);
	t.false(storage.hasFile('Settings/settings/CustomProperties.json'));
	t.false(storage.hasFile('Settings/settings/i18n.json'));
	const unchanged = await runtime.applyTransaction({
		sessionId,
		expectedRevision: 3,
		operations: [{ kind: 'updateProjectSettings', settings: structuredClone(withoutOptional) }],
	});
	t.false(unchanged.ok);
	if (unchanged.ok) return;
	t.is(unchanged.meta.diagnostics[0]?.code, 'project_settings_unchanged');

	const publishBeforeInvalid = await storage.readFile('Settings/settings/Publish.json');
	const rejected = await runtime.applyTransaction({
		sessionId,
		expectedRevision: 3,
		operations: [{ kind: 'updateProjectSettings', settings: { publish: { packageCount: Number.NaN } } }],
	});
	t.false(rejected.ok);
	if (rejected.ok) return;
	t.is(rejected.error.code, 'transaction_unsupported');
	t.is(rejected.meta.diagnostics[0]?.code, 'invalid_project_settings');
	t.is((runtime.getSession({ sessionId }) as { ok: true; data: { revision: number; dirty: boolean } }).data.revision, 3);
	t.false((runtime.getSession({ sessionId }) as { ok: true; data: { revision: number; dirty: boolean } }).data.dirty);
	t.is(await storage.readFile('Settings/settings/Publish.json'), publishBeforeInvalid);
});

test('browser-safe package settings transactions survive save, reload, inverse, and invalid preflight', async (t) => {
	const storage = new MemoryBrowserStorage();
	const fileSystem = createBackendStorageFileSystem(storage);
	const project = createBackendFixtureProject();
	const pkg = project.packages[0]!;
	pkg.compressPNG = false;
	pkg.jpegQuality = 80;
	pkg.publish = {
		name: 'Main', path: '', branchPath: '', packageCount: 0, genCode: false, codePath: '',
		useGlobalAtlasSettings: true, maxAtlasSize: 2048, sizeOption: 'pot', forceSquare: false,
		allowRotation: false, paging: true, extractAlpha: false, maxAtlasIndex: 10,
		atlases: [{ index: 0, name: 'Default', compression: false }], excludedResourceIds: [],
	};
	const original = { compressPNG: pkg.compressPNG, jpegQuality: pkg.jpegQuality, publish: structuredClone(pkg.publish) };
	const updated = {
		compressPNG: true,
		jpegQuality: 73,
		publish: {
			name: 'Release', path: 'dist/ui', branchPath: 'dist/branch', packageCount: 2, genCode: true, codePath: 'generated/ui',
			useGlobalAtlasSettings: false, maxAtlasSize: 1024, sizeOption: 'npot' as const, forceSquare: true,
			allowRotation: true, paging: false, extractAlpha: true, maxAtlasIndex: 4,
			atlases: [{ index: 0, name: 'Main', compression: false }, { index: 3, name: 'Effects', compression: true }],
			excludedResourceIds: ['img001', 'missing-resource'],
		},
	};
	const resourceIds = pkg.resources.map((resource) => resource.id);
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({
		project,
		storage: { fileSystem, fairyPath: 'PackageSettings/Project.fairy' },
	});
	t.true(opened.ok);
	if (!opened.ok) return;
	const sessionId = opened.data.sessionId;
	t.true((await runtime.saveSession({ sessionId, force: true })).ok);

	const pending = runtime.applyTransaction({
		sessionId,
		expectedRevision: 0,
		operations: [{ kind: 'updatePackageSettings', selector: { packageId: pkg.id }, settings: updated }],
	});
	updated.publish.atlases[0]!.name = 'caller-mutated';
	const applied = await pending;
	t.true(applied.ok);
	if (!applied.ok) return;
	t.true((await runtime.saveSession({ sessionId, expectedRevision: 1 })).ok);

	const reloaded = normalizeUamProject(liftDocumentToUamProject(
		await new ProjectReader(fileSystem).read('PackageSettings/Project.fairy'),
	));
	const reloadedPackage = reloaded.packages.find((candidate) => candidate.id === pkg.id)!;
	t.is(reloadedPackage.jpegQuality, 73);
	t.is(reloadedPackage.publish?.atlases[0]?.name, 'Main');
	t.deepEqual(reloadedPackage.publish?.excludedResourceIds, ['img001', 'missing-resource']);
	t.deepEqual(reloadedPackage.resources.map((resource) => resource.id), resourceIds);

	const inverse = await runtime.applyTransaction({
		sessionId,
		expectedRevision: 1,
		operations: [{ kind: 'updatePackageSettings', selector: { packageId: pkg.id }, settings: original }],
	});
	t.true(inverse.ok);
	if (!inverse.ok) return;
	t.true((await runtime.saveSession({ sessionId, expectedRevision: 2 })).ok);
	const restored = normalizeUamProject(liftDocumentToUamProject(
		await new ProjectReader(fileSystem).read('PackageSettings/Project.fairy'),
	)).packages.find((candidate) => candidate.id === pkg.id)!;
	t.deepEqual({ compressPNG: restored.compressPNG, jpegQuality: restored.jpegQuality, publish: restored.publish }, original);

	const descriptorBeforeInvalid = await storage.readFile('PackageSettings/assets/Main/package.xml');
	const unchanged = await runtime.applyTransaction({
		sessionId,
		expectedRevision: 2,
		operations: [{ kind: 'updatePackageSettings', selector: { packageId: pkg.id }, settings: structuredClone(original) }],
	});
	t.false(unchanged.ok);
	if (unchanged.ok) return;
	t.is(unchanged.meta.diagnostics[0]?.code, 'package_settings_unchanged');
	const rejected = await runtime.applyTransaction({
		sessionId,
		expectedRevision: 2,
		operations: [{
			kind: 'updatePackageSettings',
			selector: { packageId: pkg.id },
			settings: { ...original, publish: { ...original.publish!, path: '../escape' } },
		}],
	});
	t.false(rejected.ok);
	if (rejected.ok) return;
	t.is(rejected.meta.diagnostics[0]?.code, 'invalid_package_settings');
	t.is((runtime.getSession({ sessionId }) as { ok: true; data: { revision: number; dirty: boolean } }).data.revision, 2);
	t.false((runtime.getSession({ sessionId }) as { ok: true; data: { revision: number; dirty: boolean } }).data.dirty);
	t.is(await storage.readFile('PackageSettings/assets/Main/package.xml'), descriptorBeforeInvalid);
});

test('browser-safe resource folder favorite transactions survive atomic save, reload, and inverse', async (t) => {
	const storage = new MemoryBrowserStorage();
	const fileSystem = createBackendStorageFileSystem(storage);
	const project = createBackendFixtureProject();
	project.branches = ['mobile'];
	project.packages[0]!.folders.push(
		{ branch: '', path: '/empty/', favorite: false, atlas: '' },
		{ branch: 'mobile', path: '/branch/', favorite: false, atlas: '' },
	);
	const original = structuredClone(project);
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({
		project,
		storage: { fileSystem, fairyPath: 'FolderFavorites/Project.fairy' },
	});
	t.true(opened.ok);
	if (!opened.ok) return;
	const rejected = await runtime.applyTransaction({
		sessionId: opened.data.sessionId,
		expectedRevision: 0,
		operations: [
			{ kind: 'removeResourceFolder', selector: { packageId: 'pkg001', path: '/empty/' } },
			{ kind: 'setResourceFolderFavorite', selector: { packageId: 'pkg001', path: '/empty/' }, favorite: true },
		],
	});
	t.false(rejected.ok);
	if (rejected.ok) return;
	t.is(rejected.error.code, 'transaction_unsupported');
	t.is(rejected.meta.diagnostics[0]?.path, 'operations[1].selector');
	t.is(rejected.session?.revision, 0);
	t.false(rejected.session?.dirty ?? true);
	t.deepEqual(project, original);

	const operations = [
		{ kind: 'setResourceFolderFavorite' as const, selector: { packageId: 'pkg001', path: '/images/' }, favorite: true },
		{ kind: 'setResourceFavorite' as const, selector: { packageId: 'pkg001', resourceId: 'img001' }, favorite: true },
		{ kind: 'setResourceFolderFavorite' as const, selector: { packageId: 'pkg001', branch: 'mobile', path: '/branch/' }, favorite: true },
	];
	const applied = await runtime.applyTransaction({
		sessionId: opened.data.sessionId,
		expectedRevision: 0,
		operations,
	});
	t.true(applied.ok);
	if (!applied.ok) return;
	t.true((await runtime.saveSession({ sessionId: opened.data.sessionId })).ok);

	const packageXml = await storage.readFile('FolderFavorites/assets/Main/package.xml');
	const branchXml = await storage.readFile('FolderFavorites/assets_mobile/Main/package_branch.xml');
	t.regex(packageXml, /<packageDescription[^>]*hasFavorites="true"/);
	t.regex(packageXml, /<folder[^>]*name="images"[^>]*favorite="true"/);
	t.regex(branchXml, /<folder[^>]*name="branch"[^>]*favorite="true"/);

	const reloaded = normalizeUamProject(
		liftDocumentToUamProject(await new ProjectReader(fileSystem).read('FolderFavorites/Project.fairy')),
	);
	t.true(reloaded.packages[0]!.folders.find((folder) => folder.path === '/images/')?.favorite);
	t.true(reloaded.packages[0]!.folders.find((folder) => folder.branch === 'mobile')?.favorite);
	t.true(reloaded.packages[0]!.resources.find((resource) => resource.id === 'img001')?.favorite);

	const inverse = await runtime.applyTransaction({
		sessionId: opened.data.sessionId,
		expectedRevision: 1,
		operations: operations.map((operation) => ({ ...operation, favorite: false })),
	});
	t.true(inverse.ok);
	if (!inverse.ok) return;
	t.true((await runtime.saveSession({ sessionId: opened.data.sessionId })).ok);
	const clearedPackageXml = await storage.readFile('FolderFavorites/assets/Main/package.xml');
	t.notRegex(clearedPackageXml, /\bhasFavorites=/);

	const restored = normalizeUamProject(
		liftDocumentToUamProject(await new ProjectReader(fileSystem).read('FolderFavorites/Project.fairy')),
	);
	t.false(restored.packages[0]!.folders.find((folder) => folder.path === '/images/')?.favorite);
	t.false(restored.packages[0]!.folders.find((folder) => folder.branch === 'mobile')?.favorite);
	t.false(restored.packages[0]!.resources.find((resource) => resource.id === 'img001')?.favorite);
});

test('browser-safe resource exported transactions survive save, reload, and inverse', async (t) => {
	const storage = new MemoryBrowserStorage();
	const fileSystem = createBackendStorageFileSystem(storage);
	const project = createBackendFixtureProject();
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({
		project,
		storage: { fileSystem, fairyPath: 'Exported/Project.fairy' },
	});
	t.true(opened.ok);
	if (!opened.ok) return;

	const rejected = await runtime.applyTransaction({
		sessionId: opened.data.sessionId,
		expectedRevision: 0,
		operations: [{
			kind: 'setResourceExported',
			selector: { packageId: 'pkg001', resourceId: 'cmp001' },
			exported: 'false' as unknown as boolean,
		}],
	});
	t.false(rejected.ok);
	if (rejected.ok) return;
	t.is(rejected.error.code, 'transaction_unsupported');
	t.is(rejected.meta.diagnostics[0]?.path, 'operations[0].exported');

	const operations = ['img001', 'cmp001'].map((resourceId) => ({
		kind: 'setResourceExported' as const,
		selector: { packageId: 'pkg001', resourceId },
		exported: false,
	}));
	const applied = await runtime.applyTransaction({
		sessionId: opened.data.sessionId,
		expectedRevision: 0,
		operations,
	});
	t.true(applied.ok);
	if (!applied.ok) return;
	t.true((await runtime.saveSession({ sessionId: opened.data.sessionId })).ok);

	const reloaded = normalizeUamProject(
		liftDocumentToUamProject(await new ProjectReader(fileSystem).read('Exported/Project.fairy')),
	);
	for (const resourceId of ['img001', 'cmp001']) {
		t.false(reloaded.packages[0]?.resources.find((resource) => resource.id === resourceId)?.exported);
	}

	const inverse = await runtime.applyTransaction({
		sessionId: opened.data.sessionId,
		expectedRevision: 1,
		operations: operations.map((operation) => ({ ...operation, exported: true })),
	});
	t.true(inverse.ok);
	if (!inverse.ok) return;
	t.true((await runtime.saveSession({ sessionId: opened.data.sessionId })).ok);
	const restored = normalizeUamProject(
		liftDocumentToUamProject(await new ProjectReader(fileSystem).read('Exported/Project.fairy')),
	);
	for (const resourceId of ['img001', 'cmp001']) {
		t.true(restored.packages[0]?.resources.find((resource) => resource.id === resourceId)?.exported);
	}
});

test('browser-safe empty resource folders survive lifecycle saves and reloads', async (t) => {
	const storage = new MemoryBrowserStorage();
	const fileSystem = createBackendStorageFileSystem(storage);
	const runtime = new BackendRuntime();
	const project = createBackendFixtureProject();
	project.branches = ['mobile'];
	const opened = runtime.openProjectSession({
		project,
		storage: { fileSystem, fairyPath: 'Folders/Project.fairy' },
	});
	t.true(opened.ok);
	if (!opened.ok) return;

	const added = await runtime.applyTransaction({
		sessionId: opened.data.sessionId,
		expectedRevision: 0,
		operations: [
			{
				kind: 'addResourceFolder',
				selector: { packageId: 'pkg001' },
				path: '/empty/',
				favorite: true,
				atlas: 'atlas0',
			},
			{ kind: 'addResourceFolder', selector: { packageId: 'pkg001' }, path: '/target/' },
			{ kind: 'addResourceFolder', selector: { packageId: 'pkg001' }, branch: 'mobile', path: '/branch-empty/' },
		],
	});
	t.true(added.ok);
	if (!added.ok) return;
	t.true((await runtime.saveSession({ sessionId: opened.data.sessionId })).ok);
	t.true(storage.hasDirectory('Folders/assets/Main/empty'));
	t.true(storage.hasDirectory('Folders/assets_mobile/Main/branch-empty'));
	const packageXml = await storage.readFile('Folders/assets/Main/package.xml');
	t.regex(packageXml, /<folder[^>]*name="empty"[^>]*favorite="true"[^>]*atlas="atlas0"/);

	const reloaded = normalizeUamProject(
		liftDocumentToUamProject(await new ProjectReader(fileSystem).read('Folders/Project.fairy')),
	);
	const empty = reloaded.packages[0]?.folders.find((folder) => folder.path === '/empty/');
	t.deepEqual(empty, { branch: '', path: '/empty/', favorite: true, atlas: 'atlas0' });
	t.true(reloaded.packages[0]?.folders.some((folder) => folder.branch === '' && folder.path === '/target/'));
	t.true(reloaded.packages[0]?.folders.some((folder) => folder.branch === 'mobile' && folder.path === '/branch-empty/'));

	const rejected = await runtime.applyTransaction({
		sessionId: opened.data.sessionId,
		expectedRevision: 1,
		operations: [{
			kind: 'removeResourceFolder',
			selector: { packageId: 'pkg001', path: '/images/' },
		}],
	});
	t.false(rejected.ok);
	if (rejected.ok) return;
	t.is(rejected.meta.diagnostics[0]?.code, 'resource_folder_not_empty');
	t.is(await storage.readFile('Folders/assets/Main/package.xml'), packageXml);
	t.true(storage.hasDirectory('Folders/assets/Main/images'));

	const renamed = await runtime.applyTransaction({
		sessionId: opened.data.sessionId,
		expectedRevision: 1,
		operations: [{
			kind: 'renameResourceFolder',
			selector: { packageId: 'pkg001', path: '/empty/' },
			newName: 'renamed',
		}],
	});
	t.true(renamed.ok);
	if (!renamed.ok) return;
	t.true((await runtime.saveSession({ sessionId: opened.data.sessionId })).ok);
	t.false(storage.hasDirectory('Folders/assets/Main/empty'));
	t.true(storage.hasDirectory('Folders/assets/Main/renamed'));

	const moved = await runtime.applyTransaction({
		sessionId: opened.data.sessionId,
		expectedRevision: 2,
		operations: [{
			kind: 'moveResourceFolder',
			selector: { packageId: 'pkg001', path: '/renamed/' },
			toPath: '/target/',
		}],
	});
	t.true(moved.ok);
	if (!moved.ok) return;
	t.true((await runtime.saveSession({ sessionId: opened.data.sessionId })).ok);
	t.false(storage.hasDirectory('Folders/assets/Main/renamed'));
	t.true(storage.hasDirectory('Folders/assets/Main/target/renamed'));

	const removed = await runtime.applyTransaction({
		sessionId: opened.data.sessionId,
		expectedRevision: 3,
		operations: [{
			kind: 'removeResourceFolder',
			selector: { packageId: 'pkg001', path: '/target/renamed/' },
		}],
	});
	t.true(removed.ok);
	if (!removed.ok) return;
	t.true((await runtime.saveSession({ sessionId: opened.data.sessionId })).ok);
	t.false(storage.hasDirectory('Folders/assets/Main/target/renamed'));

	const removedBranch = await runtime.applyTransaction({
		sessionId: opened.data.sessionId,
		expectedRevision: 4,
		operations: [{
			kind: 'removeResourceFolder',
			selector: { packageId: 'pkg001', branch: 'mobile', path: '/branch-empty/' },
		}],
	});
	t.true(removedBranch.ok);
	if (!removedBranch.ok) return;
	t.true((await runtime.saveSession({ sessionId: opened.data.sessionId })).ok);
	t.false(storage.hasDirectory('Folders/assets_mobile/Main/branch-empty'));
	t.false(storage.hasFile('Folders/assets_mobile/Main/package_branch.xml'));
	const finalReload = normalizeUamProject(
		liftDocumentToUamProject(await new ProjectReader(fileSystem).read('Folders/Project.fairy')),
	);
	t.false(finalReload.packages[0]?.folders.some((folder) => folder.path === '/target/renamed/'));
	t.false(finalReload.packages[0]?.folders.some((folder) => folder.branch === 'mobile'));
});

test('browser-safe empty branches survive save, reload, cleanup, and inverse operations', async (t) => {
	const storage = new MemoryBrowserStorage();
	const fileSystem = createBackendStorageFileSystem(storage);
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({
		project: createBackendFixtureProject(),
		storage: { fileSystem, fairyPath: 'Branches/Project.fairy' },
	});
	t.true(opened.ok);
	if (!opened.ok) return;
	const sessionId = opened.data.sessionId;

	const rejected = await runtime.applyTransaction({
		sessionId,
		expectedRevision: 0,
		operations: [{ kind: 'addBranch', branch: '../unsafe' }],
	});
	t.false(rejected.ok);
	const unchanged = runtime.getSession({ sessionId });
	t.true(unchanged.ok);
	if (!unchanged.ok) return;
	t.is(unchanged.data.revision, 0);
	t.false(unchanged.data.dirty);
	t.false(storage.hasDirectory('Branches/assets_../unsafe'));

	const transactAndSave = async (expectedRevision: number, operations: UamTransactionOperation[]) => {
		const applied = await runtime.applyTransaction({ sessionId, expectedRevision, operations });
		t.true(applied.ok);
		if (!applied.ok) return false;
		const saved = await runtime.saveSession({ sessionId });
		t.true(saved.ok);
		return saved.ok;
	};
	const readBranches = async () => (
		await new ProjectReader(fileSystem).read('Branches/Project.fairy')
	).getRoot().listBranches();

	if (!await transactAndSave(0, [{ kind: 'addBranch', branch: 'zeta' }])) return;
	t.true(storage.hasDirectory('Branches/assets_zeta'));
	t.deepEqual(await readBranches(), ['zeta']);

	if (!await transactAndSave(1, [{ kind: 'renameBranch', selector: { branch: 'zeta' }, newName: 'alpha' }])) return;
	t.false(storage.hasDirectory('Branches/assets_zeta'));
	t.true(storage.hasDirectory('Branches/assets_alpha'));
	t.deepEqual(await readBranches(), ['alpha']);

	if (!await transactAndSave(2, [{ kind: 'renameBranch', selector: { branch: 'alpha' }, newName: 'zeta' }])) return;
	t.false(storage.hasDirectory('Branches/assets_alpha'));
	t.deepEqual(await readBranches(), ['zeta']);

	if (!await transactAndSave(3, [{ kind: 'removeBranch', selector: { branch: 'zeta' } }])) return;
	t.false(storage.hasDirectory('Branches/assets_zeta'));
	t.deepEqual(await readBranches(), []);

	if (!await transactAndSave(4, [{ kind: 'addBranch', branch: 'zeta' }])) return;
	t.true(storage.hasDirectory('Branches/assets_zeta'));
	t.deepEqual(await readBranches(), ['zeta']);
});

test('browser-safe sessions materialize package and component lifecycle operations through inverse reloads', async (t) => {
	const storage = new MemoryBrowserStorage();
	const fileSystem = createBackendStorageFileSystem(storage);
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({
		project: createBackendFixtureProject(),
		storage: { fileSystem, fairyPath: 'Lifecycle/Project.fairy' },
	});
	t.true(opened.ok);
	if (!opened.ok) return;
	const lifecycleComponent = createLifecycleComponent();

	const added = await runtime.applyTransaction({
		sessionId: opened.data.sessionId,
		expectedRevision: 0,
		operations: [
			{ kind: 'addPackage', package: createLifecyclePackage(), atIndex: 1 },
			{
				kind: 'addComponent',
				selector: { packageId: 'pkg002' },
				component: lifecycleComponent,
				atIndex: 0,
			},
		],
	});
	t.true(added.ok);
	if (!added.ok) return;
	const savedAdded = await runtime.saveSession({ sessionId: opened.data.sessionId });
	t.true(savedAdded.ok);
	if (!savedAdded.ok) return;
	t.true(storage.hasFile('Lifecycle/assets/Overlay/package.xml'));
	t.true(storage.hasFile('Lifecycle/assets/Overlay/Popup.xml'));

	const addedReload = normalizeUamProject(
		liftDocumentToUamProject(await new ProjectReader(fileSystem).read('Lifecycle/Project.fairy')),
	);
	const addedComponent = addedReload.packages
		.find((pkg) => pkg.id === 'pkg002')?.resources
		.find((resource) => resource.id === 'cmp002');
	t.is(addedComponent?.kind, 'component');
	if (addedComponent?.kind !== 'component') return;
	for (const expected of lifecycleComponent.component.displayList) {
		t.like(addedComponent.component.displayList.find((node) => node.id === expected.id), expected);
	}

	const updatedTextProperties = {
		...createLifecyclePlainTextProperties(),
		text: 'Updated popup',
		autoSize: 4,
		strokeColor: '#778899',
		strokeSize: 0.244,
		shadowColor: '#112244',
		shadowOffset: { x: 0, y: 0 },
	};
	const updated = await runtime.applyTransaction({
		sessionId: opened.data.sessionId,
		expectedRevision: added.data.revision,
		operations: [{
			kind: 'setDisplayNodeProps',
			selector: { packageId: 'pkg002', componentResourceId: lifecycleComponent.id, displayNodeId: 'popup-title' },
			props: { textProperties: updatedTextProperties },
		}],
	});
	t.true(updated.ok);
	if (!updated.ok) return;
	t.true((await runtime.saveSession({ sessionId: opened.data.sessionId, expectedRevision: updated.data.revision })).ok);
	const updatedReload = normalizeUamProject(
		liftDocumentToUamProject(await new ProjectReader(fileSystem).read('Lifecycle/Project.fairy')),
	);
	const updatedTitle = findComponent(updatedReload, 'pkg002', lifecycleComponent.id)?.component.displayList
		.find((node) => node.id === 'popup-title');
	t.like(updatedTitle, updatedTextProperties);

	const restoredText = await runtime.applyTransaction({
		sessionId: opened.data.sessionId,
		expectedRevision: updated.data.revision,
		operations: [{
			kind: 'setDisplayNodeProps',
			selector: { packageId: 'pkg002', componentResourceId: lifecycleComponent.id, displayNodeId: 'popup-title' },
			props: { textProperties: createLifecyclePlainTextProperties() },
		}],
	});
	t.true(restoredText.ok);
	if (!restoredText.ok) return;
	t.true((await runtime.saveSession({ sessionId: opened.data.sessionId, expectedRevision: restoredText.data.revision })).ok);
	const restoredTextReload = normalizeUamProject(
		liftDocumentToUamProject(await new ProjectReader(fileSystem).read('Lifecycle/Project.fairy')),
	);
	const restoredTitle = findComponent(restoredTextReload, 'pkg002', lifecycleComponent.id)?.component.displayList
		.find((node) => node.id === 'popup-title');
	t.like(restoredTitle, createLifecyclePlainTextProperties());

	const moved = await runtime.applyTransaction({
		sessionId: opened.data.sessionId,
		expectedRevision: restoredText.data.revision,
		operations: [{
			kind: 'moveComponent',
			selector: { packageId: 'pkg002', componentResourceId: lifecycleComponent.id },
			toPackageId: 'pkg001',
			toIndex: 2,
		}],
	});
	t.true(moved.ok);
	if (!moved.ok) return;
	t.true((await runtime.saveSession({ sessionId: opened.data.sessionId, expectedRevision: moved.data.revision })).ok);
	const movedReload = normalizeUamProject(
		liftDocumentToUamProject(await new ProjectReader(fileSystem).read('Lifecycle/Project.fairy')),
	);
	const movedComponent = findComponent(movedReload, 'pkg001', lifecycleComponent.id);
	for (const expected of lifecycleComponent.component.displayList) {
		t.like(movedComponent?.component.displayList.find((node) => node.id === expected.id), expected);
	}

	const restoredMove = await runtime.applyTransaction({
		sessionId: opened.data.sessionId,
		expectedRevision: moved.data.revision,
		operations: [{
			kind: 'moveComponent',
			selector: { packageId: 'pkg001', componentResourceId: lifecycleComponent.id },
			toPackageId: 'pkg002',
			toIndex: 0,
		}],
	});
	t.true(restoredMove.ok);
	if (!restoredMove.ok) return;
	t.true((await runtime.saveSession({ sessionId: opened.data.sessionId, expectedRevision: restoredMove.data.revision })).ok);
	const restoredMoveReload = normalizeUamProject(
		liftDocumentToUamProject(await new ProjectReader(fileSystem).read('Lifecycle/Project.fairy')),
	);
	const restoredMoveComponent = findComponent(restoredMoveReload, 'pkg002', lifecycleComponent.id);
	for (const expected of lifecycleComponent.component.displayList) {
		t.like(restoredMoveComponent?.component.displayList.find((node) => node.id === expected.id), expected);
	}

	const removed = await runtime.applyTransaction({
		sessionId: opened.data.sessionId,
		expectedRevision: restoredMove.data.revision,
		operations: [
			{ kind: 'removeComponent', selector: { packageId: 'pkg002', componentResourceId: 'cmp002' } },
			{ kind: 'removePackage', selector: { packageId: 'pkg002' } },
		],
	});
	t.true(removed.ok);
	if (!removed.ok) return;
	const savedRemoved = await runtime.saveSession({ sessionId: opened.data.sessionId });
	t.true(savedRemoved.ok);
	if (!savedRemoved.ok) return;
	t.false(storage.hasFile('Lifecycle/assets/Overlay/package.xml'));
	t.false(storage.hasFile('Lifecycle/assets/Overlay/Popup.xml'));

	const removedReload = normalizeUamProject(
		liftDocumentToUamProject(await new ProjectReader(fileSystem).read('Lifecycle/Project.fairy')),
	);
	t.false(removedReload.packages.some((pkg) => pkg.id === 'pkg002'));
});

test('real LayaBox UAM sessions persist atomic resource dependency moves in browser storage', async (t) => {
	const storage = new MemoryBrowserStorage();
	const sourceRoot = 'LayaBoxInput';
	await copyDirectoryToStorage(storage, path.dirname(LAYABOX_PROJECT_PATH), sourceRoot);
	const fileSystem = createBackendStorageFileSystem(storage);
	const reader = new ProjectReader(fileSystem);
	const inputFairyPath = `${sourceRoot}/${path.basename(LAYABOX_PROJECT_PATH)}`;
	const input = normalizeUamProject(liftDocumentToUamProject(await reader.read(inputFairyPath, { hydrateResourceBytes: true })));
	const destination = input.packages[0];
	if (!destination) {
		t.fail('expected a LayaBox package destination');
		return;
	}

	const hydratedImage = findHydratedImage(input);
	const fixtureImage = input.packages
		.find((pkg) => pkg.id === hydratedImage.packageId)?.resources
		.find((resource) => resource.id === hydratedImage.resourceId);
	if (fixtureImage?.kind !== 'image') {
		t.fail('expected a hydrated LayaBox image');
		return;
	}
	const extension = path.extname(fixtureImage.fileName ?? '') || '.png';
	const sourceImage = structuredClone(fixtureImage);
	sourceImage.id = 'issue34sourceimage';
	sourceImage.name = 'issue34-source';
	sourceImage.path = '/issue34-source';
	sourceImage.fileName = `issue34-source${extension}`;
	delete sourceImage.sourcePath;
	const copiedImage = structuredClone(sourceImage);
	copiedImage.id = 'issue34copiedimage';
	copiedImage.name = 'issue34-copy';
	copiedImage.path = '/issue34-target';
	copiedImage.fileName = `issue34-copy${extension}`;

	const sourcePackage: UamPackage = {
		...createLifecyclePackage(),
		id: 'issue9pkg',
		name: 'Issue9',
	};
	const nested = createLifecycleComponent('issue34nested', 'Issue34Nested');
	nested.component.displayList = [{
		kind: 'image',
		id: 'issue34-image-ref',
		name: 'issue34-image-ref',
		position: { x: 0, y: 0 },
		size: { width: 32, height: 32 },
		visible: true,
		touchable: true,
		grayed: false,
		alpha: 1,
		rotation: 0,
		customData: '',
		relations: [],
		gears: [],
		group: '',
		resource: { packageId: '', resourceId: sourceImage.id },
	}];
	const copiedNested = structuredClone(nested);
	copiedNested.id = 'issue34copiednested';
	copiedNested.name = 'Issue34CopiedNested';
	const copiedImageNode = copiedNested.component.displayList[0];
	if (copiedImageNode?.kind !== 'image') {
		t.fail('expected copied nested image node');
		return;
	}
	copiedImageNode.resource = { packageId: '', resourceId: copiedImage.id };
	const movable = createLifecycleComponent('issue9cmp', 'Issue9Movable');
	const originalNestedReference: UamComponentRefNode = {
		kind: 'component',
		id: 'issue34-nested-ref',
		name: 'issue34-nested-ref',
		position: { x: 0, y: 0 },
		size: { width: 80, height: 24 },
		visible: true,
		touchable: true,
		grayed: false,
		alpha: 1,
		rotation: 0,
		customData: '',
		relations: [],
		gears: [],
		group: '',
		resource: { packageId: '', resourceId: nested.id },
	};
	movable.component.displayList = [originalNestedReference];
	const host = createLifecycleComponent('issue9host', 'Issue9Host');
	host.component.displayList = [];
	const originalReference: UamComponentRefNode = {
		kind: 'component',
		id: 'issue9-ref',
		name: 'issue9-ref',
		position: { x: 0, y: 0 },
		size: { width: 80, height: 24 },
		visible: true,
		touchable: true,
		grayed: false,
		alpha: 1,
		rotation: 0,
		customData: '',
		relations: [],
		gears: [],
		group: '',
		resource: { packageId: '', resourceId: movable.id },
	};
	const runtime = new BackendRuntime();
	const outputFairyPath = 'LayaBoxOutput/Project.fairy';
	const opened = runtime.openProjectSession({
		project: input,
		storage: { fileSystem, fairyPath: outputFairyPath },
	});
	t.true(opened.ok);
	if (!opened.ok) return;

	let revision = 0;
	try {
		const added = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: revision,
			operations: [
				{ kind: 'addPackage', package: sourcePackage, atIndex: input.packages.length },
				{ kind: 'addResource', selector: { packageId: sourcePackage.id }, resource: sourceImage },
				{ kind: 'addComponent', selector: { packageId: sourcePackage.id }, component: nested, atIndex: 1 },
				{ kind: 'addComponent', selector: { packageId: sourcePackage.id }, component: movable, atIndex: 2 },
				{ kind: 'addComponent', selector: { packageId: sourcePackage.id }, component: host, atIndex: 3 },
				{
					kind: 'attachDisplayNode',
					selector: { packageId: sourcePackage.id, componentResourceId: host.id },
					atIndex: 0,
					node: originalReference,
				},
			],
		});
		t.true(added.ok);
		if (!added.ok) return;
		revision = added.data.revision;
		t.true((await runtime.saveSession({ sessionId: opened.data.sessionId, expectedRevision: revision })).ok);

		const moved = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: revision,
			operations: [
				{ kind: 'addResource', selector: { packageId: destination.id }, resource: copiedImage },
				{
					kind: 'addComponent',
					selector: { packageId: destination.id },
					component: copiedNested,
					atIndex: destination.resources.length + 1,
				},
				{
					kind: 'detachDisplayNode',
					selector: { packageId: sourcePackage.id, componentResourceId: movable.id, displayNodeId: originalNestedReference.id },
				},
				{
					kind: 'attachDisplayNode',
					selector: { packageId: sourcePackage.id, componentResourceId: movable.id },
					atIndex: 0,
					node: {
						...originalNestedReference,
						resource: { packageId: destination.id, resourceId: copiedNested.id },
					},
				},
				{
					kind: 'detachDisplayNode',
					selector: { packageId: sourcePackage.id, componentResourceId: host.id, displayNodeId: originalReference.id },
				},
				{
					kind: 'attachDisplayNode',
					selector: { packageId: sourcePackage.id, componentResourceId: host.id },
					atIndex: 0,
					node: { ...originalReference, resource: { packageId: destination.id, resourceId: movable.id } },
				},
				{
					kind: 'moveComponent',
					selector: { packageId: sourcePackage.id, componentResourceId: movable.id },
					toPackageId: destination.id,
					toIndex: destination.resources.length + 2,
				},
			],
		});
		t.true(moved.ok);
		if (!moved.ok) return;
		revision = moved.data.revision;
		t.true((await runtime.saveSession({ sessionId: opened.data.sessionId, expectedRevision: revision })).ok);
		const movedReload = normalizeUamProject(liftDocumentToUamProject(await reader.read(outputFairyPath, { hydrateResourceBytes: true })));
		t.is(findComponent(movedReload, destination.id, movable.id)?.kind, 'component');
		const movedNested = findComponent(movedReload, destination.id, copiedNested.id);
		t.is(movedNested?.kind, 'component');
		const movedNestedImage = movedNested?.component.displayList.find((node) => node.id === copiedImageNode.id);
		if (movedNestedImage?.kind === 'image') {
			t.deepEqual(movedNestedImage.resource, { packageId: undefined, resourceId: copiedImage.id });
		} else {
			t.fail('expected copied nested image reference');
			return;
		}
		const movedImage = movedReload.packages
			.find((pkg) => pkg.id === destination.id)?.resources
			.find((resource) => resource.id === copiedImage.id);
		t.is(movedImage?.kind, 'image');
		if (movedImage?.kind === 'image') {
			t.deepEqual([...movedImage.sourceBytes ?? []], [...copiedImage.sourceBytes ?? []]);
		}
		const movedNestedReference = findComponent(movedReload, destination.id, movable.id)?.component.displayList
			.find((node) => node.id === originalNestedReference.id);
		if (movedNestedReference?.kind === 'component') {
			t.deepEqual(movedNestedReference.resource, { packageId: destination.id, resourceId: copiedNested.id });
		} else {
			t.fail('expected moved nested component reference');
			return;
		}
		const movedReference = findComponent(movedReload, sourcePackage.id, host.id)?.component.displayList.find((node) => node.id === originalReference.id);
		if (movedReference?.kind === 'component') {
			t.deepEqual(movedReference.resource, { packageId: destination.id, resourceId: movable.id });
		} else {
			t.fail('expected moved LayaBox component reference');
			return;
		}

		const restored = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: revision,
			operations: [
				{
					kind: 'detachDisplayNode',
					selector: { packageId: destination.id, componentResourceId: movable.id, displayNodeId: originalNestedReference.id },
				},
				{
					kind: 'attachDisplayNode',
					selector: { packageId: destination.id, componentResourceId: movable.id },
					atIndex: 0,
					node: {
						...originalNestedReference,
						resource: { packageId: sourcePackage.id, resourceId: nested.id },
					},
				},
				{
					kind: 'detachDisplayNode',
					selector: { packageId: sourcePackage.id, componentResourceId: host.id, displayNodeId: originalReference.id },
				},
				{
					kind: 'attachDisplayNode',
					selector: { packageId: sourcePackage.id, componentResourceId: host.id },
					atIndex: 0,
					node: originalReference,
				},
				{
					kind: 'moveComponent',
					selector: { packageId: destination.id, componentResourceId: movable.id },
					toPackageId: sourcePackage.id,
					toIndex: 3,
				},
				{ kind: 'removeComponent', selector: { packageId: destination.id, componentResourceId: copiedNested.id } },
				{ kind: 'removeResource', selector: { packageId: destination.id, resourceId: copiedImage.id } },
			],
		});
		t.true(restored.ok);
		if (!restored.ok) return;
		revision = restored.data.revision;
		t.true((await runtime.saveSession({ sessionId: opened.data.sessionId, expectedRevision: revision })).ok);
		const restoredReload = normalizeUamProject(liftDocumentToUamProject(await reader.read(outputFairyPath, { hydrateResourceBytes: true })));
		t.is(findComponent(restoredReload, sourcePackage.id, movable.id)?.kind, 'component');
		const restoredNestedReference = findComponent(restoredReload, sourcePackage.id, movable.id)?.component.displayList
			.find((node) => node.id === originalNestedReference.id);
		if (restoredNestedReference?.kind === 'component') {
			t.deepEqual(restoredNestedReference.resource, { packageId: sourcePackage.id, resourceId: nested.id });
		} else {
			t.fail('expected restored nested component reference');
			return;
		}
		t.is(findComponent(restoredReload, destination.id, copiedNested.id), null);
		t.false(restoredReload.packages
			.find((pkg) => pkg.id === destination.id)?.resources
			.some((resource) => resource.id === copiedImage.id) ?? true);
		t.false(storage.hasFile(`LayaBoxOutput/assets/${destination.name}/issue34-target/${copiedImage.fileName}`));
		const restoredReference = findComponent(restoredReload, sourcePackage.id, host.id)?.component.displayList.find((node) => node.id === originalReference.id);
		if (restoredReference?.kind === 'component') {
			t.deepEqual(restoredReference.resource, { packageId: sourcePackage.id, resourceId: movable.id });
		} else {
			t.fail('expected restored local LayaBox component reference');
			return;
		}

		const failedImage = structuredClone(copiedImage);
		failedImage.id = 'issue34failedimage';
		failedImage.name = 'issue34-failed';
		failedImage.fileName = `issue34-failed${extension}`;
		const failedBatch = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: revision,
			operations: [
				{ kind: 'addResource', selector: { packageId: destination.id }, resource: failedImage },
				{
					kind: 'moveComponent',
					selector: { packageId: sourcePackage.id, componentResourceId: 'missing-component' },
					toPackageId: destination.id,
					toIndex: destination.resources.length,
				},
			],
		});
		t.false(failedBatch.ok);
		t.true((await runtime.saveSession({
			sessionId: opened.data.sessionId,
			expectedRevision: revision,
			force: true,
		})).ok);
		const failedReload = normalizeUamProject(liftDocumentToUamProject(await reader.read(outputFairyPath, { hydrateResourceBytes: true })));
		t.false(failedReload.packages
			.find((pkg) => pkg.id === destination.id)?.resources
			.some((resource) => resource.id === failedImage.id) ?? true);
		t.false(storage.hasFile(`LayaBoxOutput/assets/${destination.name}/issue34-target/${failedImage.fileName}`));

		const unsafeRemove = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: revision,
			operations: [{
				kind: 'removeComponent',
				selector: { packageId: sourcePackage.id, componentResourceId: movable.id },
			}],
		});
		t.false(unsafeRemove.ok);

		const removed = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: revision,
			operations: [
				{
					kind: 'detachDisplayNode',
					selector: { packageId: sourcePackage.id, componentResourceId: host.id, displayNodeId: originalReference.id },
				},
				{
					kind: 'removeComponent',
					selector: { packageId: sourcePackage.id, componentResourceId: movable.id },
				},
			],
		});
		t.true(removed.ok);
		if (!removed.ok) return;
		revision = removed.data.revision;
		t.true((await runtime.saveSession({ sessionId: opened.data.sessionId, expectedRevision: revision })).ok);
		const removedReload = normalizeUamProject(liftDocumentToUamProject(await reader.read(outputFairyPath, { hydrateResourceBytes: true })));
		t.is(findComponent(removedReload, sourcePackage.id, movable.id), null);

		const restoredAfterRemove = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: revision,
			operations: [
				{ kind: 'addComponent', selector: { packageId: sourcePackage.id }, component: movable, atIndex: 0 },
				{
					kind: 'attachDisplayNode',
					selector: { packageId: sourcePackage.id, componentResourceId: host.id },
					atIndex: 0,
					node: originalReference,
				},
			],
		});
		t.true(restoredAfterRemove.ok);
		if (!restoredAfterRemove.ok) return;
		revision = restoredAfterRemove.data.revision;
		t.true((await runtime.saveSession({ sessionId: opened.data.sessionId, expectedRevision: revision })).ok);
		const finalReload = normalizeUamProject(liftDocumentToUamProject(await reader.read(outputFairyPath, { hydrateResourceBytes: true })));
		t.is(findComponent(finalReload, sourcePackage.id, movable.id)?.kind, 'component');
		const finalReference = findComponent(finalReload, sourcePackage.id, host.id)?.component.displayList.find((node) => node.id === originalReference.id);
		if (finalReference?.kind === 'component') {
			t.deepEqual(finalReference.resource, { packageId: sourcePackage.id, resourceId: movable.id });
		} else {
			t.fail('expected restored LayaBox component reference');
		}
	} finally {
		await runtime.closeSession({ sessionId: opened.data.sessionId });
	}
});

test('real LayaBox Bag dependency closure moves and inverts atomically in browser storage', async (t) => {
	const storage = new MemoryBrowserStorage();
	const sourceRoot = 'BagClosureInput';
	await copyDirectoryToStorage(storage, path.dirname(LAYABOX_PROJECT_PATH), sourceRoot);
	const fileSystem = createBackendStorageFileSystem(storage);
	const reader = new ProjectReader(fileSystem);
	const input = normalizeUamProject(liftDocumentToUamProject(await reader.read(
		`${sourceRoot}/${path.basename(LAYABOX_PROJECT_PATH)}`,
		{ hydrateResourceBytes: true },
	)));
	const sourcePackage = input.packages.find((pkg) => pkg.name === 'Bag');
	const movable = sourcePackage?.resources.find((resource) => resource.kind === 'component' && resource.name === 'Main');
	const nested = sourcePackage?.resources.find((resource) => resource.kind === 'component' && resource.name === 'BagButton');
	const image = sourcePackage?.resources.find((resource) => resource.id === 'thi7d');
	const movieClip = sourcePackage?.resources.find((resource) => resource.id === 'thi7j');
	if (
		!sourcePackage
		|| movable?.kind !== 'component'
		|| nested?.kind !== 'component'
		|| image?.kind !== 'image'
		|| movieClip?.kind !== 'movieClip'
		|| !(image.sourceBytes instanceof Uint8Array)
		|| !(movieClip.sourceBytes instanceof Uint8Array)
	) {
		t.fail('expected the real Bag/Main -> BagButton -> image + MovieClip closure');
		return;
	}
	const nestedReference = movable.component.displayList.find((node) => (
		node.kind === 'component' && node.resource.resourceId === nested.id
	));
	if (nestedReference?.kind !== 'component') {
		t.fail('expected Main to reference BagButton');
		return;
	}
	const copiedImage = structuredClone(image);
	const copiedMovieClip = structuredClone(movieClip);
	delete copiedImage.sourcePath;
	delete copiedMovieClip.sourcePath;
	const targetPackage: UamPackage = {
		...createLifecyclePackage(),
		id: 'issue34real',
		name: 'Issue34Real',
	};
	const copiedNested = structuredClone(nested);
	for (const node of copiedNested.component.displayList) {
		if (node.kind === 'image' || node.kind === 'movieClip') {
			node.resource.packageId = targetPackage.id;
		}
	}
	const originalIndex = sourcePackage.resources.indexOf(movable);
	const outputFairyPath = 'BagClosureOutput/Project.fairy';
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({
		project: input,
		storage: { fileSystem, fairyPath: outputFairyPath },
	});
	t.true(opened.ok);
	if (!opened.ok) return;

	let revision = opened.data.revision;
	try {
		const moved = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: revision,
			operations: [
				{ kind: 'addPackage', package: targetPackage, atIndex: input.packages.length },
				{ kind: 'addResource', selector: { packageId: targetPackage.id }, resource: copiedImage },
				{ kind: 'addResource', selector: { packageId: targetPackage.id }, resource: copiedMovieClip },
				{ kind: 'addComponent', selector: { packageId: targetPackage.id }, component: copiedNested, atIndex: 2 },
				{
					kind: 'detachDisplayNode',
					selector: { packageId: sourcePackage.id, componentResourceId: movable.id, displayNodeId: nestedReference.id },
				},
				{
					kind: 'attachDisplayNode',
					selector: { packageId: sourcePackage.id, componentResourceId: movable.id },
					atIndex: 0,
					node: {
						...nestedReference,
						resource: { packageId: targetPackage.id, resourceId: nested.id },
					},
				},
				{
					kind: 'moveComponent',
					selector: { packageId: sourcePackage.id, componentResourceId: movable.id },
					toPackageId: targetPackage.id,
					toIndex: 3,
				},
			],
		});
		t.true(moved.ok);
		if (!moved.ok) return;
		revision = moved.data.revision;
		t.true((await runtime.saveSession({ sessionId: opened.data.sessionId, expectedRevision: revision })).ok);

		const movedReload = normalizeUamProject(liftDocumentToUamProject(await reader.read(
			outputFairyPath,
			{ hydrateResourceBytes: true },
		)));
		const movedMain = findComponent(movedReload, targetPackage.id, movable.id);
		const movedButton = findComponent(movedReload, targetPackage.id, nested.id);
		t.is(movedMain?.kind, 'component');
		t.is(movedButton?.kind, 'component');
		for (const node of movedButton?.component.displayList ?? []) {
			if (node.kind === 'image' || node.kind === 'movieClip') {
				t.is(node.resource.packageId ?? targetPackage.id, targetPackage.id);
			}
		}
		const movedReference = movedMain?.component.displayList.find((node) => node.id === nestedReference.id);
		t.deepEqual(
			movedReference?.kind === 'component' ? movedReference.resource : null,
			{ packageId: targetPackage.id, resourceId: nested.id },
		);
		const movedImage = movedReload.packages
			.find((pkg) => pkg.id === targetPackage.id)?.resources
			.find((resource) => resource.id === image.id);
		const movedMovieClip = movedReload.packages
			.find((pkg) => pkg.id === targetPackage.id)?.resources
			.find((resource) => resource.id === movieClip.id);
		t.deepEqual(movedImage?.kind === 'image' ? [...movedImage.sourceBytes ?? []] : null, [...image.sourceBytes]);
		t.deepEqual(movedMovieClip?.kind === 'movieClip' ? [...movedMovieClip.sourceBytes ?? []] : null, [...movieClip.sourceBytes]);

		const restored = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: revision,
			operations: [
				{
					kind: 'detachDisplayNode',
					selector: { packageId: targetPackage.id, componentResourceId: movable.id, displayNodeId: nestedReference.id },
				},
				{
					kind: 'attachDisplayNode',
					selector: { packageId: targetPackage.id, componentResourceId: movable.id },
					atIndex: 0,
					node: {
						...nestedReference,
						resource: { packageId: sourcePackage.id, resourceId: nested.id },
					},
				},
				{
					kind: 'moveComponent',
					selector: { packageId: targetPackage.id, componentResourceId: movable.id },
					toPackageId: sourcePackage.id,
					toIndex: originalIndex,
				},
				{ kind: 'removeComponent', selector: { packageId: targetPackage.id, componentResourceId: nested.id } },
				{ kind: 'removeResource', selector: { packageId: targetPackage.id, resourceId: image.id } },
				{ kind: 'removeResource', selector: { packageId: targetPackage.id, resourceId: movieClip.id } },
				{ kind: 'removePackage', selector: { packageId: targetPackage.id } },
			],
		});
		t.true(restored.ok);
		if (!restored.ok) return;
		revision = restored.data.revision;
		t.true((await runtime.saveSession({ sessionId: opened.data.sessionId, expectedRevision: revision })).ok);
		const restoredReload = normalizeUamProject(liftDocumentToUamProject(await reader.read(
			outputFairyPath,
			{ hydrateResourceBytes: true },
		)));
		t.false(restoredReload.packages.some((pkg) => pkg.id === targetPackage.id));
		const restoredMain = findComponent(restoredReload, sourcePackage.id, movable.id);
		const restoredReference = restoredMain?.component.displayList.find((node) => node.id === nestedReference.id);
		t.deepEqual(
			restoredReference?.kind === 'component' ? restoredReference.resource : null,
			{ packageId: sourcePackage.id, resourceId: nested.id },
		);

		const failedPackage: UamPackage = {
			...createLifecyclePackage(),
			id: 'issue34failed',
			name: 'Issue34Failed',
		};
		const failed = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: revision,
			operations: [
				{ kind: 'addPackage', package: failedPackage, atIndex: input.packages.length },
				{ kind: 'addResource', selector: { packageId: failedPackage.id }, resource: copiedImage },
				{
					kind: 'moveComponent',
					selector: { packageId: sourcePackage.id, componentResourceId: 'missing-component' },
					toPackageId: failedPackage.id,
					toIndex: 1,
				},
			],
		});
		t.false(failed.ok);
		t.true((await runtime.saveSession({
			sessionId: opened.data.sessionId,
			expectedRevision: revision,
			force: true,
		})).ok);
		const failedReload = normalizeUamProject(liftDocumentToUamProject(await reader.read(
			outputFairyPath,
			{ hydrateResourceBytes: true },
		)));
		t.false(failedReload.packages.some((pkg) => pkg.id === failedPackage.id));

		const unsafeRemove = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: revision,
			operations: [{
				kind: 'removeComponent',
				selector: { packageId: sourcePackage.id, componentResourceId: nested.id },
			}],
		});
		t.false(unsafeRemove.ok);
	} finally {
		await runtime.closeSession({ sessionId: opened.data.sessionId });
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

test('browser-safe LayaBox storage sessions reject lossy UAM saves before touching storage', async (t) => {
	const storage = new MemoryBrowserStorage();
	const projectRoot = 'LayaBoxProject';
	const fairyPath = `${projectRoot}/${path.basename(LAYABOX_PROJECT_PATH)}`;
	await copyDirectoryToStorage(storage, path.dirname(LAYABOX_PROJECT_PATH), projectRoot);
	const originalFairy = await storage.readFileRaw(fairyPath);

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
		t.is(opened.data.uamFidelity, 'unsupported');
		sessionId = opened.data.sessionId;
		let revision = opened.data.revision;

		const imageSourcePath = [projectRoot, 'assets', image.packageName, image.path, image.fileName]
			.join('/')
			.replace(/\/+/g, '/');
		const sourceBytesBeforeRejectedApply = await storage.readFileRaw(imageSourcePath);
		const rejectedImageBytes = await runtime.applyTransaction({
			sessionId,
			expectedRevision: revision,
			operations: [
				{
					kind: 'setResourceFavorite',
					selector: { packageId: image.packageId, resourceId: image.resourceId },
					favorite: true,
				},
				{
					kind: 'replaceResourceBytes',
					selector: { packageId: image.packageId, resourceId: image.resourceId },
					sourceBytes: new Uint8Array([1, 2, 3, 4]),
				},
			],
		});
		t.false(rejectedImageBytes.ok);
		if (!('error' in rejectedImageBytes)) return;
		t.is(rejectedImageBytes.error.code, 'transaction_unsupported');
		t.true(rejectedImageBytes.meta.diagnostics.some((diagnostic) => diagnostic.code === 'invalid_resource_bytes'));
		t.deepEqual(await storage.readFileRaw(imageSourcePath), sourceBytesBeforeRejectedApply);

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
		t.false(renamedSave.ok);
		if (!renamedSave.ok) {
			t.is(renamedSave.error.code, 'uam_fidelity_unsupported');
			t.deepEqual(await storage.readFileRaw(fairyPath), originalFairy);
			return;
		}

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
					favorite: false,
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

test('browser-safe MovieClip replacement, save, inverse, and invalid JTA keep session and storage atomic', async (t) => {
	const storage = new MemoryBrowserStorage();
	const fileSystem = createBackendStorageFileSystem(storage);
	const initialBytes = createTestMovieClipJta(102, {
		fps: 25,
		speed: 2,
		repeatDelay: 4,
		swing: true,
		width: 96,
		height: 72,
		frames: [{ delay: 3, rectX: 0, rectY: 0, rectWidth: 96, rectHeight: 72, textureIndex: -1 }],
	});
	const replacementBytes = createTestMovieClipJta(102, {
		fps: 50,
		speed: 3,
		repeatDelay: 2,
		swing: false,
		width: 120,
		height: 84,
		frames: [
			{ delay: 5, rectX: 5, rectY: 7, rectWidth: 40, rectHeight: 30, textureIndex: 0 },
			{ delay: 1, rectX: 45, rectY: 37, rectWidth: 75, rectHeight: 47, textureIndex: 0 },
		],
		textures: [new Uint8Array([1])],
	});
	const project = createBackendFixtureProject();
	project.packages[0]!.resources.push(createMovieClipResource('movie001', 'pulse.jta', initialBytes));
	const runtime = new BackendRuntime();
	const fairyPath = 'MovieClip/Project.fairy';
	const sourcePath = 'MovieClip/assets/Main/movieclips/pulse.jta';
	const packagePath = 'MovieClip/assets/Main/package.xml';
	const opened = runtime.openProjectSession({ project, storage: { fileSystem, fairyPath } });
	t.true(opened.ok);
	if (!opened.ok) return;
	const sessionId = opened.data.sessionId;

	const materialized = await runtime.materializeSession({
		sessionId,
		expectedRevision: 0,
		mode: 'fullProject',
		reason: 'workspace_bootstrap',
	});
	t.true(materialized.ok);
	if (!materialized.ok) return;
	t.deepEqual(await storage.readFileRaw(sourcePath), initialBytes);

	const applied = await runtime.applyTransaction({
		sessionId,
		expectedRevision: 0,
		operations: [{
			kind: 'replaceResourceBytes',
			selector: { packageId: 'pkg001', resourceId: 'movie001' },
			sourceBytes: replacementBytes,
		}],
	});
	t.true(applied.ok);
	if (!applied.ok) return;
	t.is(applied.data.revision, 1);
	t.true(applied.data.dirty);
	const saved = await runtime.saveSession({ sessionId, expectedRevision: 1 });
	t.true(saved.ok);
	if (!saved.ok) return;
	t.false(saved.data.dirty);
	t.deepEqual(await storage.readFileRaw(sourcePath), replacementBytes);

	const replacementReload = normalizeUamProject(liftDocumentToUamProject(
		await new ProjectReader(fileSystem).read(fairyPath, { hydrateResourceBytes: true }),
	));
	const replacementMovieClip = replacementReload.packages[0]?.resources.find((resource) => resource.id === 'movie001');
	if (replacementMovieClip?.kind !== 'movieClip') {
		t.fail('expected reloaded MovieClip resource');
		return;
	}
	t.deepEqual(replacementMovieClip.dimensions, { width: 120, height: 84 });
	t.deepEqual(replacementMovieClip.movieClip.frames, [
		{ rectX: 5, rectY: 7, rectWidth: 40, rectHeight: 30, addDelay: 100, spriteId: '' },
		{ rectX: 45, rectY: 37, rectWidth: 75, rectHeight: 47, addDelay: 20, spriteId: '' },
	]);
	t.like(replacementMovieClip.movieClip, { interval: 60, repeatDelay: 40, swing: false });

	const inverse = await runtime.applyTransaction({
		sessionId,
		expectedRevision: 1,
		operations: [{
			kind: 'replaceResourceBytes',
			selector: { packageId: 'pkg001', resourceId: 'movie001' },
			sourceBytes: initialBytes,
		}],
	});
	t.true(inverse.ok);
	if (!inverse.ok) return;
	t.is(inverse.data.revision, 2);
	t.true((await runtime.saveSession({ sessionId, expectedRevision: 2 })).ok);
	t.deepEqual(await storage.readFileRaw(sourcePath), initialBytes);
	const inverseReload = normalizeUamProject(liftDocumentToUamProject(
		await new ProjectReader(fileSystem).read(fairyPath, { hydrateResourceBytes: true }),
	));
	const inverseMovieClip = inverseReload.packages[0]?.resources.find((resource) => resource.id === 'movie001');
	if (inverseMovieClip?.kind === 'movieClip') {
		t.deepEqual(inverseMovieClip.movieClip, createMovieClipResource('expected', 'expected.jta', initialBytes).movieClip);
	}

	const fairyBeforeInvalid = await storage.readFileRaw(fairyPath);
	const packageBeforeInvalid = await storage.readFileRaw(packagePath);
	const sourceBeforeInvalid = await storage.readFileRaw(sourcePath);
	const invalid = await runtime.applyTransaction({
		sessionId,
		expectedRevision: 2,
		operations: [{
			kind: 'replaceResourceBytes',
			selector: { packageId: 'pkg001', resourceId: 'movie001' },
			sourceBytes: replacementBytes.subarray(0, replacementBytes.byteLength - 1),
		}],
	});
	t.false(invalid.ok);
	if (invalid.ok) return;
	t.is(invalid.error.code, 'transaction_unsupported');
	t.true(invalid.meta.diagnostics.some((diagnostic) => diagnostic.code === 'invalid_movie_clip_jta'));
	t.is(invalid.session?.revision, 2);
	t.false(invalid.session?.dirty ?? true);
	t.deepEqual(await storage.readFileRaw(fairyPath), fairyBeforeInvalid);
	t.deepEqual(await storage.readFileRaw(packagePath), packageBeforeInvalid);
	t.deepEqual(await storage.readFileRaw(sourcePath), sourceBeforeInvalid);
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

test('browser-safe clean save preserves property overrides and autoClearItems', async (t) => {
	const project = createBackendFixtureProject();
	const resource = project.packages[0]?.resources.find((candidate) => candidate.id === 'cmp001');
	if (resource?.kind !== 'component') {
		t.fail('expected component fixture');
		return;
	}
	resource.component.properties.extensionType = 'ComboBox';
	resource.component.properties.autoClearItems = true;
	const image = resource.component.displayList[0];
	if (image?.kind !== 'image') {
		t.fail('expected image fixture');
		return;
	}
	const { resource: _imageResource, ...base } = structuredClone(image);
	const list: UamListNode = {
		...base,
		kind: 'list',
		id: 'list-overrides',
		name: 'list-overrides',
		layout: 0,
		align: 0,
		vAlign: 0,
		lineGap: 0,
		columnGap: 0,
		lineCount: 0,
		columnCount: 0,
		selectionMode: 0,
		defaultItem: '',
		autoResizeItem: true,
		childrenRenderOrder: 0,
		apexIndex: 0,
		src: '',
		overflow: 0,
		scrollType: 1,
		scrollBarFlags: 0,
		scrollBarMargin: { top: 0, bottom: 0, left: 0, right: 0 },
		vtScrollBarRes: '',
		hzScrollBarRes: '',
		headerRes: '',
		footerRes: '',
		margin: { top: 0, bottom: 0, left: 0, right: 0 },
		clipSoftness: { x: 0, y: 0 },
		scrollItemToViewOnClick: true,
		foldInvisibleItems: false,
		autoClearItems: true,
		listItems: [{
			title: 'First',
			icon: null,
			url: null,
			name: null,
			selectedTitle: null,
			selectedIcon: null,
			level: 0,
			isFolder: null,
			controllers: null,
			propertyOverrides: [
				{ target: 'title', propertyId: 0, value: '  First override  ' },
				{ target: 'space', propertyId: 1, value: ' ' },
				{ target: 'empty', propertyId: 2, value: '' },
			],
		}],
		pageController: '',
		controllerOverrides: '',
		selectionController: '',
	};
	const instance: UamComponentRefNode = {
		...base,
		kind: 'component',
		id: 'component-overrides',
		name: 'component-overrides',
		resource: { resourceId: 'cmp001' },
		propertyOverrides: [
			{ target: 'title', propertyId: 0, value: ' Instance override ' },
			{ target: 'space', propertyId: 1, value: ' ' },
			{ target: 'empty', propertyId: 2, value: '' },
		],
		instanceProperties: {
			extensionType: 'ComboBox',
			title: '',
			icon: '',
			visibleItemCount: 0,
			selectionController: '',
			autoClearItems: true,
			items: [],
		},
	};
	resource.component.displayList.push(list, instance);

	const storage = new MemoryBrowserStorage();
	const fileSystem = createBackendStorageFileSystem(storage);
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({
		project,
		storage: { fileSystem, fairyPath: 'Project.fairy' },
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
	const savedXml = await storage.readFile('assets/Main/MainView.xml');
	t.regex(savedXml, /<component\b[^>]*id="component-overrides"[^>]*>[\s\S]*?<property\b[^>]*target="title"/);

	const reloaded = normalizeUamProject(liftDocumentToUamProject(await new ProjectReader(fileSystem).read('Project.fairy')));
	const reloadedResource = reloaded.packages[0]?.resources.find((candidate) => candidate.id === 'cmp001');
	if (reloadedResource?.kind !== 'component') {
		t.fail('expected reloaded component');
		return;
	}
	const reloadedList = reloadedResource.component.displayList.find((node) => node.id === list.id);
	const reloadedInstance = reloadedResource.component.displayList.find((node) => node.id === instance.id);
	t.true(reloadedResource.component.properties.autoClearItems);
	t.deepEqual(reloadedList?.kind === 'list' ? reloadedList.listItems[0]?.propertyOverrides : null, list.listItems[0]?.propertyOverrides);
	t.true(reloadedList?.kind === 'list' && reloadedList.autoClearItems);
	t.deepEqual(reloadedInstance?.kind === 'component' ? reloadedInstance.propertyOverrides : null, instance.propertyOverrides);
	t.true(reloadedInstance?.kind === 'component'
		&& reloadedInstance.instanceProperties?.extensionType === 'ComboBox'
		&& reloadedInstance.instanceProperties.autoClearItems);
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

test('applyTransaction snapshots queued operations and shared source bytes before waiting', async (t) => {
	const storage = new PausingMemoryBrowserStorage();
	const fileSystem = createBackendStorageFileSystem(storage);
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({
		project: createBackendFixtureProject(),
		storage: { fileSystem, fairyPath: 'Project.fairy' },
	});
	t.true(opened.ok);
	if (!opened.ok) return;

	const blockingSave = runtime.saveSession({
		sessionId: opened.data.sessionId,
		expectedRevision: 0,
		force: true,
		mode: 'materializeCleanSession',
	});
	await storage.writeStarted;

	const sourceBuffer = typeof SharedArrayBuffer === 'undefined' ? new ArrayBuffer(3) : new SharedArrayBuffer(3);
	const sourceBytes = new Uint8Array(sourceBuffer);
	sourceBytes.set([1, 2, 3]);
	const operations: Parameters<typeof runtime.applyTransaction>[0]['operations'] = [
		{
			kind: 'addResource',
			selector: { packageId: 'pkg001' },
			resource: {
				kind: 'misc',
				id: 'queued-bytes',
				name: 'queued-bytes',
				path: '/queued',
				exported: true,
				favorite: false,
				branch: '',
				branchItemIds: [],
				file: 'queued-bytes.bin',
				metadata: null,
				sourceBytes,
			},
		},
	];
	const applying = runtime.applyTransaction({
		sessionId: opened.data.sessionId,
		expectedRevision: 0,
		operations,
	});
	sourceBytes.fill(9);
	operations.length = 0;
	storage.continueWrite();

	t.true((await blockingSave).ok);
	const applied = await applying;
	t.true(applied.ok);
	if (!applied.ok) return;
	t.is(applied.data.revision, 1);
	t.true((await runtime.saveSession({ sessionId: opened.data.sessionId, expectedRevision: 1 })).ok);

	const reloaded = normalizeUamProject(
		liftDocumentToUamProject(
			await new ProjectReader(fileSystem).read('Project.fairy', { hydrateResourceBytes: true }),
		),
	);
	const resource = reloaded.packages[0]?.resources.find((candidate) => candidate.id === 'queued-bytes');
	t.is(resource?.kind, 'misc');
	if (resource?.kind === 'misc') t.deepEqual([...(resource.sourceBytes ?? [])], [1, 2, 3]);
});

test.serial('applyTransaction rejects when its session closes during browser image validation', async (t) => {
	const workerDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
	let releaseValidation = (): void => undefined;
	let markValidationStarted = (): void => undefined;
	const validationStarted = new Promise<void>((resolve) => {
		markValidationStarted = resolve;
	});
	class PausingImageWorker {
		public onmessage: ((event: MessageEvent<{ format: 'png'; width: number; height: number }>) => void) | null = null;
		public onerror: (() => void) | null = null;

		public postMessage(): void {
			markValidationStarted();
			releaseValidation = () => {
				this.onmessage?.({ data: { format: 'png', width: 1, height: 1 } } as MessageEvent<{
					format: 'png';
					width: number;
					height: number;
				}>);
			};
		}

		public terminate(): void {}
	}

	try {
		Object.defineProperty(globalThis, 'Worker', {
			configurable: true,
			value: PausingImageWorker,
		});
		const project = createBackendFixtureProject();
		const image = project.packages[0]?.resources.find((resource) => resource.id === 'img001');
		if (image?.kind !== 'image') {
			t.fail('expected fixture image resource');
			return;
		}
		image.sourceBytes = new Uint8Array([1]);
		const runtime = new BackendRuntime();
		const opened = runtime.openProjectSession({
			project,
			canonicalProjectPath: 'memory://close-during-image-validation',
		});
		t.true(opened.ok);
		if (!opened.ok) return;

		const applying = runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: 0,
			operations: [
				{
					kind: 'replaceResourceBytes',
					selector: { packageId: 'pkg001', resourceId: 'img001' },
					sourceBytes: new Uint8Array([1, 2, 3, 4, 5]),
				},
			],
		});
		await validationStarted;
		t.true((await runtime.closeSession({ sessionId: opened.data.sessionId })).ok);
		releaseValidation();

		const applied = await applying;
		t.false(applied.ok);
		if (!applied.ok) t.is(applied.error.code, 'session_not_found');
		t.false(runtime.getSession({ sessionId: opened.data.sessionId }).ok);
	} finally {
		if (workerDescriptor) Object.defineProperty(globalThis, 'Worker', workerDescriptor);
		else Reflect.deleteProperty(globalThis, 'Worker');
	}
});
