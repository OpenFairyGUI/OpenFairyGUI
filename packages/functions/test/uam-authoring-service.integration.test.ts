import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
	createDefaultUamComponentProperties,
	createDefaultUamImageResourceProperties,
	createDefaultUamPlainTextProperties,
	readProjectAsUam,
	type UamProject,
	type UamTransactionOperation,
	writeProjectFromUam,
} from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';
import { getFixturePath } from '@openfairygui/test-utils';
import test from 'ava';
import {
	type ApplyUamTransactionAppInput,
	type ApplyUamTransactionAppResult,
	applyUamTransactionApp,
	applyUamTransactionAppAsync,
} from '../src/index.js';

function createSupportedProject(): UamProject {
	return {
		projectId: 'functions-uam-transaction',
		projectType: 0,
		version: '3.0',
		branches: [],
		settings: {
			publish: {},
			common: {},
			adaptation: {},
		},
		packages: [
			{
				id: 'pkg001',
				name: 'Main',
				publish: null,
				folders: [{ branch: '', path: '/images/', favorite: false, atlas: '' }],
				resources: [
					{
						kind: 'image',
						id: 'img001',
						name: 'background.png',
						path: '/images',
						exported: true,
						favorite: false,
						branch: '',
						branchItemIds: [],
						fileName: 'background.png',
						dimensions: { width: 320, height: 180 },
						image: {
							...createDefaultUamImageResourceProperties(),
							textureSetMode: 'atlas',
						},
					},
					{
						kind: 'component',
						id: 'cmp001',
						name: 'MainView',
						path: '/',
						exported: true,
						favorite: false,
						branch: '',
						branchItemIds: [],
						component: {
							size: { width: 320, height: 180 },
							properties: createDefaultUamComponentProperties(),
							customData: '',
							displayList: [
								{
									kind: 'image',
									id: 'n0',
									name: 'bg',
									position: { x: 0, y: 0 },
									size: { width: 320, height: 180 },
									visible: true,
									touchable: true,
									grayed: false,
									alpha: 1,
									rotation: 0,
									customData: '',
									relations: [],
									gears: [],
									resource: { resourceId: 'img001' },
								},
								{
									kind: 'text',
									...createDefaultUamPlainTextProperties(),
									id: 'n1',
									name: 'title',
									position: { x: 16, y: 18 },
									size: { width: 180, height: 32 },
									visible: true,
									touchable: true,
									grayed: false,
									alpha: 1,
									rotation: 0,
									customData: '',
									relations: [],
									gears: [],
									text: 'Title',
									font: '',
									fontSize: 18,
									color: '#ffffff',
								},
							],
							controllers: [],
							transitions: [],
						},
					},
				],
			},
		],
	};
}

function createUnsupportedProject(): UamProject {
	const project = createSupportedProject();
	const component = project.packages[0]!.resources[1];
	if (component?.kind !== 'component') {
		throw new Error('expected component resource');
	}
	component.component.displayList.push({
		kind: 'button',
		id: 'n2',
		name: 'button',
		position: { x: 0, y: 0 },
		size: { width: 10, height: 10 },
		visible: true,
		touchable: true,
		grayed: false,
		alpha: 1,
		rotation: 0,
		customData: '',
		relations: [],
		gears: [],
		src: '',
		packageId: '',
		title: 'Button',
		icon: '',
		titleColor: '#000000',
		titleFontSize: 12,
		sound: '',
		soundVolumeScale: 1,
		selectedTitle: '',
		selectedIcon: '',
		mode: 0,
		downEffect: 0,
		downEffectValue: 0.8,
	} as never);
	return project;
}

test('applyUamTransactionApp returns committed UAM and survives write/read vertical slice', async (t) => {
	const operations: UamTransactionOperation[] = [
		{
			kind: 'setDisplayNodeProps',
			opId: 'set-title',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
			props: {
				text: 'Updated Title',
				fontSize: 24,
				color: '#00ff00',
			},
		},
	];
	const input: ApplyUamTransactionAppInput = {
		project: createSupportedProject(),
		operations,
	};

	const result: ApplyUamTransactionAppResult = applyUamTransactionApp(input);
	t.true(result.ok);
	if (!result.ok) {
		return;
	}

	const component = result.project.packages[0]!.resources[1];
	t.is(component?.kind, 'component');
	if (component?.kind !== 'component') {
		return;
	}
	t.is(component.component.displayList[1]?.kind, 'text');
	t.is((component.component.displayList[1] as any).text, 'Updated Title');

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-functions-uam-service-'));
	const outFairy = path.join(tmpDir, 'out.fairy');
	try {
		await writeProjectFromUam(io, result.project, outFairy);
		const roundTripped = await readProjectAsUam(io, outFairy);
		const roundTrippedComponent = roundTripped.packages[0]!.resources.find((resource) => resource.id === 'cmp001');
		t.is(roundTrippedComponent?.kind, 'component');
		if (roundTrippedComponent?.kind === 'component') {
			t.is((roundTrippedComponent.component.displayList[1] as any).text, 'Updated Title');
		}
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('applyUamTransactionApp leaves untouched baseline nodes as passthrough', (t) => {
	const result = applyUamTransactionApp({
		project: createUnsupportedProject(),
		operations: [],
	});

	t.true(result.ok);
	if (!result.ok) return;
	const component = result.project.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	t.is(component?.kind, 'component');
	if (component?.kind === 'component') {
		t.is(component.component.displayList[2]?.kind, 'button');
	}
});

test('applyUamTransactionApp exposes stable operation-scoped diagnostics', (t) => {
	const result = applyUamTransactionApp({
		project: createUnsupportedProject(),
		operations: [
			{
				kind: 'renameResource',
				opId: 'rename-without-bytes',
				selector: { packageId: 'pkg001', resourceId: 'img001' },
				newName: 'renamed.png',
			},
		],
	});

	t.false(result.ok);
	if (result.ok) return;
	const failure = result as Extract<ApplyUamTransactionAppResult, { ok: false }>;
	const diagnostic = failure.error.diagnostics[0];
	t.deepEqual(diagnostic, {
		code: 'unavailable_resource_source_bytes',
		message: 'Resource "pkg001/img001" has no hydrated primary source bytes.',
		severity: 'error',
		path: 'operations[0].selector.resourceId',
		resourceKind: 'image',
		operationKind: 'renameResource',
	});
});

test.serial('async app transaction uses browser worker raster validation', async (t) => {
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
	let validationCount = 0;
	class FakeWorker {
		public onmessage:
			| ((event: MessageEvent<{ format: 'png'; width: number; height: number } | null>) => void)
			| null = null;
		public onerror: (() => void) | null = null;

		public postMessage(message: ArrayBuffer): void {
			validationCount += 1;
			const result = message.byteLength > 4 ? { format: 'png' as const, width: 60, height: 74 } : null;
			queueMicrotask(() => this.onmessage?.({ data: result } as MessageEvent<typeof result>));
		}

		public terminate(): void {}
	}
	try {
		Object.defineProperty(globalThis, 'Worker', {
			configurable: true,
			value: FakeWorker,
		});
		const project = createSupportedProject();
		const image = project.packages[0]!.resources[0];
		if (image?.kind !== 'image') throw new Error('expected image resource');
		const bytes = new Uint8Array(
			await fs.readFile(getFixturePath('FairyGUI-layabox', 'demo/UIProject/assets/Bag/images/0.png')),
		);
		image.sourceBytes = bytes;
		image.sourcePath = '/images/background.png';
		image.dimensions = { width: 60, height: 74 };
		const input: ApplyUamTransactionAppInput = {
			project,
			operations: [
				{
					kind: 'replaceResourceBytes',
					selector: { packageId: 'pkg001', resourceId: 'img001' },
					sourceBytes: bytes,
				},
			],
		};

		const syncResult = applyUamTransactionApp(input);
		t.false(syncResult.ok);
		if ('error' in syncResult) t.is(syncResult.error.diagnostics[0]?.code, 'unsupported_resource_mutation');
		const asyncResult = await applyUamTransactionAppAsync(input);
		t.true(asyncResult.ok, JSON.stringify(asyncResult));
		t.is(validationCount, 1);
		const invalidResult = await applyUamTransactionAppAsync({
			...input,
			operations: [
				{
					kind: 'replaceResourceBytes',
					selector: { packageId: 'pkg001', resourceId: 'img001' },
					sourceBytes: new Uint8Array([1, 2, 3, 4]),
				},
			],
		});
		t.false(invalidResult.ok);
		if ('error' in invalidResult) t.is(invalidResult.error.diagnostics[0]?.code, 'invalid_resource_bytes');
		const malformedResult = await applyUamTransactionAppAsync({
			...input,
			operations: [
				{
					kind: 'replaceResourceBytes',
					selector: { packageId: 'pkg001', resourceId: 'img001' },
					sourceBytes: null as never,
				},
			],
		});
		t.false(malformedResult.ok);
		if ('error' in malformedResult)
			t.is(malformedResult.error.diagnostics[0]?.code, 'unavailable_resource_source_bytes');
	} finally {
		if (descriptor) Object.defineProperty(globalThis, 'Worker', descriptor);
		else Reflect.deleteProperty(globalThis, 'Worker');
	}
});
