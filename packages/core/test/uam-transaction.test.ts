import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
	NodeIO,
	UamTransactionError,
	applyUamTransaction,
	assertTransactionSupported,
	createUamTransaction,
	normalizeUamProject,
	type UamControllerModel,
	type UamLookGearBinding,
	type UamProject,
	type UamTextNode,
} from '../src/index.js';
import { readProjectAsUam, writeProjectFromUam } from '../src/uam/index.js';

function createSupportedProject(): UamProject {
	return normalizeUamProject({
		projectId: 'uam-transaction',
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
	} as UamProject);
}

function createControllerModel(name = 'state'): UamControllerModel {
	return {
		name,
		selectedIndex: 0,
		autoRadioGroupDepth: false,
		pages: [
			{ id: '0', name: 'Idle' },
			{ id: '1', name: 'Alert' },
		],
		actions: [],
	};
}

function createTransitionModel(name = 'intro') {
	return {
		name,
		autoPlay: true,
		autoPlayTimes: 1,
		autoPlayDelay: 0,
		options: 3,
		fps: 30,
		items: [
			{
				name: 'move',
				time: 0,
				actionType: 0,
				targetNodeId: 'n0',
				tween: true,
				duration: 12,
				startValue: [0, 0],
				endValue: [40, 24],
				easeType: 5,
				repeat: 0,
				yoyo: false,
				label: '',
				endLabel: '',
				path: '',
				customEasePath: '',
			},
		],
	};
}

function createLookGear(controllerName = 'state', alpha = 1): UamLookGearBinding {
	return {
		kind: 'look',
		name: 'bg-look',
		controllerName,
		states: [
			{ pageId: '0', value: { alpha, rotation: 0, grayed: false, touchable: true } },
			{ pageId: '1', value: { alpha: 0.5, rotation: 180, grayed: true, touchable: false } },
		],
		defaultValue: { alpha, rotation: 0, grayed: false, touchable: true },
		condition: '',
		positionsInPercent: false,
		tween: true,
		tweenDuration: 0.5,
		tweenDelay: 0,
		easeType: 5,
		customEasePath: '',
	};
}

async function roundTripCommittedProject(project: UamProject): Promise<UamProject> {
	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-uam-transaction-'));
	const outFairy = path.join(tmpDir, 'out.fairy');
	try {
		await writeProjectFromUam(io, project, outFairy);
		return await readProjectAsUam(io, outFairy);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
}

test('assertTransactionSupported rejects unsupported baseline project shapes', (t) => {
	const componentNodeProject = createSupportedProject();
	const componentResource = componentNodeProject.packages[0]!.resources[1];
	if (componentResource?.kind !== 'component') {
		t.fail('expected component resource');
		return;
	}
	componentResource.component.displayList.push({
		kind: 'component',
		id: 'n2',
		name: 'sub',
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
	});
	t.throws(
		() => assertTransactionSupported(componentNodeProject),
		{ instanceOf: UamTransactionError },
	);

	const nonLookGearProject = createSupportedProject();
	const nonLookComponent = nonLookGearProject.packages[0]!.resources[1];
	if (nonLookComponent?.kind !== 'component') {
		t.fail('expected component resource');
		return;
	}
	(nonLookComponent.component.displayList[0]!.gears as any[]).push({
		kind: 'xy',
		name: 'xy-gear',
		controllerName: 'state',
		states: [],
		defaultValue: { x: 0, y: 0 },
		condition: '',
		positionsInPercent: false,
		tween: false,
		tweenDuration: 0.3,
		tweenDelay: 0,
		easeType: 5,
		customEasePath: '',
	});
	t.throws(
		() => assertTransactionSupported(nonLookGearProject),
		{ instanceOf: UamTransactionError },
	);

	const crossPackageImageRefProject = createSupportedProject();
	crossPackageImageRefProject.packages.push({
		id: 'pkg002',
		name: 'Shared',
		publish: null,
		resources: [
			{
				kind: 'image',
				id: 'img002',
				name: 'shared.png',
				path: '/',
				exported: true,
				branch: '',
				branchItemIds: [],
				fileName: 'shared.png',
				dimensions: { width: 16, height: 16 },
				metadata: null,
			},
		],
	});
	const crossPackageComponent = crossPackageImageRefProject.packages[0]!.resources[1];
	if (crossPackageComponent?.kind !== 'component') {
		t.fail('expected component resource');
		return;
	}
	(crossPackageComponent.component.displayList[0] as any).resource = {
		packageId: 'pkg002',
		resourceId: 'img002',
	};
	t.throws(
		() => assertTransactionSupported(crossPackageImageRefProject),
		{ instanceOf: UamTransactionError },
	);
});

test('assertTransactionSupported rejects duplicate transition names and duplicate look-gear-per-controller', (t) => {
	const duplicateTransitionProject = createSupportedProject();
	const componentResource = duplicateTransitionProject.packages[0]!.resources[1];
	if (componentResource?.kind !== 'component') {
		t.fail('expected component resource');
		return;
	}
	componentResource.component.transitions.push(createTransitionModel('intro'));
	componentResource.component.transitions.push(createTransitionModel('intro'));
	t.throws(
		() => assertTransactionSupported(duplicateTransitionProject),
		{ instanceOf: UamTransactionError },
	);

	const duplicateLookGearProject = createSupportedProject();
	const duplicateLookComponent = duplicateLookGearProject.packages[0]!.resources[1];
	if (duplicateLookComponent?.kind !== 'component') {
		t.fail('expected component resource');
		return;
	}
	duplicateLookComponent.component.controllers.push(createControllerModel('state'));
	duplicateLookComponent.component.displayList[0]!.gears.push(createLookGear('state'));
	duplicateLookComponent.component.displayList[0]!.gears.push(createLookGear('state', 0.75));
	t.throws(
		() => assertTransactionSupported(duplicateLookGearProject),
		{ instanceOf: UamTransactionError },
	);
});

test('resource and display-list operations respect the frozen Phase A contracts', (t) => {
	const project = createSupportedProject();
	const result = applyUamTransaction(project, [
		{
			kind: 'moveResource',
			opId: 'move-resource',
			selector: { packageId: 'pkg001', resourceId: 'img001' },
			toPath: '/moved',
		},
		{
			kind: 'setDisplayNodeProps',
			opId: 'set-title',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
			props: {
				position: { x: 20, y: 24 },
				alpha: 0.8,
				text: 'Updated Title',
				fontSize: 24,
				color: '#00ff00',
			},
		},
		{
			kind: 'attachDisplayNode',
			opId: 'attach-subtitle',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001' },
			atIndex: 1,
			node: {
				kind: 'text',
				id: 'n2',
				name: 'subtitle',
				position: { x: 18, y: 52 },
				size: { width: 200, height: 20 },
				visible: true,
				touchable: true,
				grayed: false,
				alpha: 1,
				rotation: 0,
				customData: '',
				relations: [],
				gears: [],
				text: 'Subtitle',
				font: '',
				fontSize: 14,
				color: '#cccccc',
			},
		},
		{
			kind: 'detachDisplayNode',
			opId: 'detach-title',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
		},
	]);

	const movedImage = result.packages[0]!.resources.find((resource) => resource.id === 'img001');
	t.is(movedImage?.path, '/moved');
	t.is(movedImage?.name, 'background.png');
	t.is(movedImage?.branch, '');
	t.deepEqual(movedImage?.branchItemIds, []);
	if (movedImage?.kind === 'image') {
		t.is(movedImage.fileName, 'background.png');
	}

	const updatedComponent = result.packages[0]!.resources.find((resource) => resource.id === 'cmp001');
	if (updatedComponent?.kind !== 'component') {
		t.fail('expected component resource after transaction');
		return;
	}
	t.deepEqual(updatedComponent.component.displayList.map((node) => node.id), ['n0', 'n2']);
	const subtitleNode = updatedComponent.component.displayList[1] as UamTextNode | undefined;
	t.is(subtitleNode?.kind, 'text');
	t.is(subtitleNode?.text, 'Subtitle');

	const forbiddenFieldError = t.throws(
		() => applyUamTransaction(project, [
			{
				kind: 'setDisplayNodeProps',
				opId: 'bad-props',
				selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
				props: {
					resource: { resourceId: 'img001' },
				} as never,
			},
		]),
		{ instanceOf: UamTransactionError },
	);
	t.is(forbiddenFieldError?.code, 'transaction_unsupported');

	const duplicateAttachError = t.throws(
		() => applyUamTransaction(project, [
			{
				kind: 'attachDisplayNode',
				opId: 'duplicate-node',
				selector: { packageId: 'pkg001', componentResourceId: 'cmp001' },
				atIndex: 1,
				node: {
					kind: 'text',
					id: 'n1',
					name: 'duplicate',
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
					text: 'dup',
					font: '',
					fontSize: 12,
					color: '#ffffff',
				},
			},
		]),
		{ instanceOf: UamTransactionError },
	);
	t.is(duplicateAttachError?.opIndex, 0);
});

test('behavior operations add and update controllers, transitions, and look gears through the full transaction API', async (t) => {
	const project = createSupportedProject();
	const result = createUamTransaction(project)
		.add({
			kind: 'addController',
			opId: 'add-controller',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', controllerName: 'state' },
			controller: createControllerModel('state'),
		})
		.add({
			kind: 'updateController',
			opId: 'update-controller',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', controllerName: 'state' },
			controller: {
				...createControllerModel('state'),
				selectedIndex: 1,
				actions: [
					{
						name: 'activate',
						actionType: 1,
						fromPageIds: ['0'],
						toPageIds: ['1'],
						transitionName: '',
						playTimes: 1,
						delay: 0,
						stopOnExit: false,
						targetNodeId: 'n0',
						controllerName: '',
						targetPage: '',
					},
				],
			},
		})
		.add({
			kind: 'addTransition',
			opId: 'add-transition',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', transitionName: 'intro' },
			transition: createTransitionModel('intro'),
		})
		.add({
			kind: 'updateTransition',
			opId: 'update-transition',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', transitionName: 'intro' },
			transition: {
				...createTransitionModel('intro'),
				options: 7,
				items: [
					{
						...createTransitionModel('intro').items[0]!,
						endValue: [80, 60],
					},
				],
			},
		})
		.add({
			kind: 'addLookGear',
			opId: 'add-look-gear',
			selector: {
				packageId: 'pkg001',
				componentResourceId: 'cmp001',
				displayNodeId: 'n0',
				kind: 'look',
				controllerName: 'state',
			},
			gear: createLookGear('state'),
		})
		.add({
			kind: 'updateLookGear',
			opId: 'update-look-gear',
			selector: {
				packageId: 'pkg001',
				componentResourceId: 'cmp001',
				displayNodeId: 'n0',
				kind: 'look',
				controllerName: 'state',
			},
			gear: {
				...createLookGear('state'),
				defaultValue: { alpha: 0.9, rotation: 12, grayed: false, touchable: true },
				tweenDuration: 0.75,
			},
		})
		.commit();

	const componentResource = result.packages[0]!.resources.find((resource) => resource.id === 'cmp001');
	if (componentResource?.kind !== 'component') {
		t.fail('expected component resource after behavior transaction');
		return;
	}

	t.is(componentResource.component.controllers.length, 1);
	t.is(componentResource.component.controllers[0]?.selectedIndex, 1);
	t.is(componentResource.component.controllers[0]?.actions.length, 1);

	t.is(componentResource.component.transitions.length, 1);
	t.is(componentResource.component.transitions[0]?.options, 7);
	t.deepEqual(componentResource.component.transitions[0]?.items[0]?.endValue, [80, 60]);

	const lookGear = componentResource.component.displayList[0]?.gears[0];
	t.is(lookGear?.kind, 'look');
	if (lookGear?.kind === 'look') {
		t.is(lookGear.controllerName, 'state');
		t.true(Math.abs(lookGear.tweenDuration - 0.75) < 1e-6);
		t.true(Math.abs(lookGear.defaultValue.alpha - 0.9) < 1e-6);
		t.is(lookGear.defaultValue.rotation, 12);
	}

	const roundTripped = await roundTripCommittedProject(result);
	const roundTrippedComponent = roundTripped.packages[0]!.resources.find((resource) => resource.id === 'cmp001');
	if (roundTrippedComponent?.kind !== 'component') {
		t.fail('expected round-tripped component resource');
		return;
	}
	t.is(roundTrippedComponent.component.controllers[0]?.name, 'state');
	t.is(roundTrippedComponent.component.transitions[0]?.name, 'intro');
	t.is(roundTrippedComponent.component.displayList[0]?.gears[0]?.kind, 'look');
});

test('behavior remove operations remove look gears, transitions, and controllers with frozen selectors', (t) => {
	const base = createSupportedProject();
	const seeded = applyUamTransaction(base, [
		{
			kind: 'addController',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', controllerName: 'state' },
			controller: createControllerModel('state'),
		},
		{
			kind: 'addTransition',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', transitionName: 'intro' },
			transition: createTransitionModel('intro'),
		},
		{
			kind: 'addLookGear',
			selector: {
				packageId: 'pkg001',
				componentResourceId: 'cmp001',
				displayNodeId: 'n0',
				kind: 'look',
				controllerName: 'state',
			},
			gear: createLookGear('state'),
		},
	]);

	const result = applyUamTransaction(seeded, [
		{
			kind: 'removeLookGear',
			selector: {
				packageId: 'pkg001',
				componentResourceId: 'cmp001',
				displayNodeId: 'n0',
				kind: 'look',
				controllerName: 'state',
			},
		},
		{
			kind: 'removeTransition',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', transitionName: 'intro' },
		},
		{
			kind: 'removeController',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', controllerName: 'state' },
		},
	]);

	const componentResource = result.packages[0]!.resources.find((resource) => resource.id === 'cmp001');
	if (componentResource?.kind !== 'component') {
		t.fail('expected component resource after remove transaction');
		return;
	}

	t.is(componentResource.component.controllers.length, 0);
	t.is(componentResource.component.transitions.length, 0);
	t.is(componentResource.component.displayList[0]?.gears.length, 0);
});

test('failing mid-batch preserves input project, leaks no earlier success, and reports stable op identity', (t) => {
	const project = createSupportedProject();
	const snapshot = structuredClone(project);

	const error = t.throws(
		() => applyUamTransaction(project, [
			{
				kind: 'renameResource',
				opId: 'rename-first',
				selector: { packageId: 'pkg001', resourceId: 'img001' },
				newName: 'renamed.png',
			},
			{
				kind: 'addController',
				opId: 'bad-controller',
				selector: { packageId: 'pkg001', componentResourceId: 'cmp001', controllerName: 'state' },
				controller: {
					...createControllerModel('state'),
					actions: [
						{
							name: 'bad',
							actionType: 1,
							fromPageIds: ['0'],
							toPageIds: ['1'],
							transitionName: '',
							playTimes: 1,
							delay: 0,
							stopOnExit: false,
							targetNodeId: 'missing-node',
							controllerName: '',
							targetPage: '',
						},
					],
				},
			},
		]),
		{ instanceOf: UamTransactionError },
	);

	t.is(error?.code, 'execution_failure');
	t.is(error?.opIndex, 1);
	t.is(error?.opId, 'bad-controller');
	t.is(error?.opKind, 'addController');
	t.deepEqual(project, snapshot);
	t.is(project.packages[0]!.resources[0]!.name, 'background.png');
});
