import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
	createDefaultUamComponentProperties,
	type UamProject,
	type UamTransactionOperation,
	readProjectAsUam,
	writeProjectFromUam,
} from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';
import {
	applyUamTransactionApp,
	type ApplyUamTransactionAppInput,
	type ApplyUamTransactionAppResult,
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
						metadata: { textureSetMode: 'atlas' },
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
