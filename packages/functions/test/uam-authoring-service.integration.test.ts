import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
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
						branch: '',
						branchItemIds: [],
						component: {
							size: { width: 320, height: 180 },
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
		kind: 'component',
		id: 'n2',
		name: 'nested',
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
		resource: { resourceId: 'cmp001' },
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

test('applyUamTransactionApp classifies unsupported baseline shapes as preflight failures', (t) => {
	const result = applyUamTransactionApp({
		project: createUnsupportedProject(),
		operations: [],
	});

	t.false(result.ok);
	if (result.ok) {
		return;
	}
	const failure = result as Extract<ApplyUamTransactionAppResult, { ok: false }>;

	t.is(failure.error.code, 'transaction_unsupported');
	t.is(failure.error.stage, 'preflight');
	t.truthy(failure.error.issues);
});
