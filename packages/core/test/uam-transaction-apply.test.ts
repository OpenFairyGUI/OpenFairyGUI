import test from 'ava';
import {
	UamTransactionError,
	applyUamTransaction,
	createUamTransaction,
	parseJta,
	type UamTextNode,
} from '../src/index.js';

import {
	createControllerModel,
	createLookGear,
	createSupportedProject,
	createTransitionModel,
	roundTripCommittedProject,
} from './uam-transaction-fixtures.js';

function createMovieClipJta(
	version: 100 | 101 | 102,
	width: number,
	height: number,
	frameX = -3,
	frameY = -2,
): Uint8Array {
	const bytes = new Uint8Array(version === 100 ? 34 : 30);
	const view = new DataView(bytes.buffer);
	let offset = 0;
	view.setUint16(offset, 5); offset += 2;
	bytes.set(new TextEncoder().encode('yytou'), offset); offset += 5;
	view.setInt32(offset, version); offset += 4;
	offset += 4;
	if (version === 102) {
		view.setUint16(offset, 0); offset += 2;
		view.setUint16(offset, 0); offset += 2;
		view.setUint16(offset, width); offset += 2;
		view.setUint16(offset, height); offset += 2;
	}
	offset += 3;
	view.setInt16(offset, version === 100 ? 1 : 0); offset += 2;
	if (version === 100) {
		view.setInt16(offset, 0); offset += 2;
		view.setInt16(offset, frameX); offset += 2;
		view.setInt16(offset, frameY); offset += 2;
		view.setInt16(offset, width); offset += 2;
		view.setInt16(offset, height); offset += 2;
		view.setInt16(offset, -1); offset += 2;
	}
	view.setInt16(offset, 0);
	offset += 2;
	if (version === 101) {
		view.setUint16(offset, 0); offset += 2;
		view.setUint16(offset, 0); offset += 2;
		view.setUint16(offset, width); offset += 2;
		view.setUint16(offset, height);
	}
	return bytes;
}

test('parseJta derives v100 bounds when frames stay on the negative axes', (t) => {
	const parsed = parseJta(createMovieClipJta(100, 20, 10, -30, -20));
	t.deepEqual(
		{ width: parsed.boundsWidth, height: parsed.boundsHeight },
		{ width: 20, height: 10 },
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

test('binary resource transactions require hydrated source bytes and survive write/reload', async (t) => {
	const unhydrated = createSupportedProject();
	const unhydratedImage = unhydrated.packages[0]!.resources[0];
	if (unhydratedImage?.kind !== 'image') {
		t.fail('expected image resource');
		return;
	}
	unhydratedImage.sourceBytes = null;
	const missingBytesError = t.throws(
		() => applyUamTransaction(unhydrated, [{
			kind: 'moveResource',
			selector: { packageId: 'pkg001', resourceId: 'img001' },
			toPath: '/moved',
		}]),
		{ instanceOf: UamTransactionError },
	);
	t.true(missingBytesError?.issues?.some((issue) => issue.code === 'unavailable_resource_source_bytes') ?? false);

	const renamed = applyUamTransaction(createSupportedProject(), [
		{
			kind: 'renameResource',
			selector: { packageId: 'pkg001', resourceId: 'img001' },
			newName: 'renamed.png',
		},
		{
			kind: 'moveResource',
			selector: { packageId: 'pkg001', resourceId: 'img001' },
			toPath: '/moved',
		},
	]);
	const renamedImage = renamed.packages[0]!.resources.find((resource) => resource.id === 'img001');
	if (renamedImage?.kind !== 'image') {
		t.fail('expected renamed image resource');
		return;
	}
	t.is(renamedImage.name, 'renamed');
	t.is(renamedImage.fileName, 'renamed.png');
	t.is(renamedImage.path, '/moved');
	t.deepEqual([...renamedImage.sourceBytes ?? []], [0x89, 0x50, 0x4e, 0x47]);
	t.is(renamedImage.sourcePath, '/images/background.png');

	const added = applyUamTransaction(renamed, [{
		kind: 'addResource',
		selector: { packageId: 'pkg001' },
		resource: {
			kind: 'misc',
			id: 'misc001',
			name: 'payload.bin',
			path: '/generated',
			exported: true,
			favorite: false,
			branch: '',
			branchItemIds: [],
			file: 'payload.bin',
			metadata: null,
			sourceBytes: new Uint8Array([1, 2, 3]),
		},
	}]);
	const replaced = applyUamTransaction(added, [{
		kind: 'replaceResourceBytes',
		selector: { packageId: 'pkg001', resourceId: 'misc001' },
		sourceBytes: new Uint8Array([4, 5, 6]),
	}]);
	const reloaded = await roundTripCommittedProject(replaced);
	const reloadedImage = reloaded.packages[0]!.resources.find((resource) => resource.id === 'img001');
	const reloadedMisc = reloaded.packages[0]!.resources.find((resource) => resource.id === 'misc001');
	if (reloadedImage?.kind !== 'image' || reloadedMisc?.kind !== 'misc') {
		t.fail('expected reloaded binary resources');
		return;
	}
	t.is(reloadedImage.name, 'renamed');
	t.is(reloadedImage.path, '/moved');
	t.is(reloadedImage.sourcePath, '/moved/renamed.png');
	t.deepEqual([...reloadedImage.sourceBytes ?? []], [0x89, 0x50, 0x4e, 0x47]);
	t.deepEqual([...reloadedMisc.sourceBytes ?? []], [4, 5, 6]);

	const removed = applyUamTransaction(reloaded, [{
		kind: 'removeResource',
		selector: { packageId: 'pkg001', resourceId: 'misc001' },
	}]);
	const reloadedAfterRemove = await roundTripCommittedProject(removed);
	t.false(reloadedAfterRemove.packages[0]!.resources.some((resource) => resource.id === 'misc001'));
});

test('ProjectReader hydrates MovieClip dimensions from JTA source bytes', async (t) => {
	const project = createSupportedProject();
	for (const version of [100, 101, 102] as const) {
		project.packages[0]!.resources.push({
			kind: 'movieClip',
			id: `movie${version}`,
			name: `pulse${version}`,
			path: '/movieclips',
			exported: true,
			favorite: false,
			branch: '',
			branchItemIds: [],
			fileName: `pulse${version}.jta`,
			dimensions: { width: 0, height: 0 },
			metadata: { interval: 0, swing: false, repeatDelay: 0, smoothing: true },
			sourceBytes: createMovieClipJta(version, 96, 72),
		});
	}

	const reloaded = await roundTripCommittedProject(project);
	for (const [version, dimensions] of [[100, { width: 96, height: 72 }], [101, { width: 96, height: 72 }], [102, { width: 96, height: 72 }]] as const) {
		const movieClip = reloaded.packages[0]!.resources.find((resource) => resource.id === `movie${version}`);
		t.is(movieClip?.kind, 'movieClip');
		if (movieClip?.kind === 'movieClip') t.deepEqual(movieClip.dimensions, dimensions);
	}

	const replaced = applyUamTransaction(reloaded, [{
		kind: 'replaceResourceBytes',
		selector: { packageId: 'pkg001', resourceId: 'movie102' },
		sourceBytes: createMovieClipJta(102, 120, 84),
	}]);
	const replacedMovieClip = replaced.packages[0]!.resources.find((resource) => resource.id === 'movie102');
	t.is(replacedMovieClip?.kind, 'movieClip');
	if (replacedMovieClip?.kind === 'movieClip') {
		t.deepEqual(replacedMovieClip.dimensions, { width: 120, height: 84 });
	}
	const replacedReloaded = await roundTripCommittedProject(replaced);
	const replacedReloadedMovieClip = replacedReloaded.packages[0]!.resources.find((resource) => resource.id === 'movie102');
	t.is(replacedReloadedMovieClip?.kind, 'movieClip');
	if (replacedReloadedMovieClip?.kind === 'movieClip') {
		t.deepEqual(replacedReloadedMovieClip.dimensions, { width: 120, height: 84 });
	}
});
