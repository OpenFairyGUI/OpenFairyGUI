import test from 'ava';
import { createTestMovieClipJta, type TestMovieClipJtaOptions } from '@openfairygui/test-utils';
import {
	UamTransactionError,
	applyUamTransaction,
	applyUamTransactionAsync,
	createDefaultUamPlainTextProperties,
	createUamTransaction,
	deriveMovieClipModelFromJta,
	parseJta,
	validateTransactionSupport,
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
	options: TestMovieClipJtaOptions = {},
): Uint8Array {
	return createTestMovieClipJta(version, {
		fps: 25,
		speed: 2,
		repeatDelay: 4,
		swing: true,
		width,
		height,
		frames: [{ delay: 3, rectX: frameX, rectY: frameY, rectWidth: width, rectHeight: height, textureIndex: -1 }],
		...options,
	});
}

test('parseJta derives v100 bounds when frames stay on the negative axes', (t) => {
	const parsed = parseJta(createMovieClipJta(100, 20, 10, -30, -20));
	t.deepEqual(
		{ width: parsed.boundsWidth, height: parsed.boundsHeight },
		{ width: 20, height: 10 },
	);
});

test('parseJta and the shared MovieClip derivation cover v100, v101, and v102 timing and frames', (t) => {
	for (const version of [100, 101, 102] as const) {
		const bytes = createMovieClipJta(version, 96, 72, 0, 0);
		const parsed = parseJta(bytes);
		t.is(parsed.version, version);
		t.is(parsed.fps, 25);
		t.is(parsed.speed, 2);
		t.is(parsed.repeatDelay, 4);
		t.true(parsed.swing);
		t.is(parsed.frames.length, 1);

		const derived = deriveMovieClipModelFromJta(bytes);
		t.deepEqual(derived, {
			dimensions: { width: 96, height: 72 },
			interval: 80,
			repeatDelay: 160,
			swing: true,
			frames: [{ rectX: 0, rectY: 0, rectWidth: 96, rectHeight: 72, addDelay: 120, textureIndex: -1 }],
		});
		t.throws(() => parseJta(bytes.subarray(0, bytes.byteLength - 1)), { message: /Invalid \.jta file: truncated/ });
	}
	t.throws(() => parseJta(createMovieClipJta(102, 10, 10, 0, 0, { fps: -1 })), {
		message: /Invalid \.jta file: negative fps/,
	});
	t.throws(() => parseJta(createMovieClipJta(102, 10, 10, 0, 0, {
		frames: [{ delay: 0, rectX: 0, rectY: 0, rectWidth: 10, rectHeight: 10, textureIndex: 0 }],
	})), { message: /texture index 0 is outside/ });
	t.throws(() => parseJta(createMovieClipJta(102, 10, 10, 0, 0, {
		frames: [{ delay: 0, rectX: 0, rectY: 0, rectWidth: 10, rectHeight: 10, textureIndex: -2 }],
	})), { message: /texture index -2 is outside/ });
	for (const frame of [
		{ delay: -1, rectX: 0, rectY: 0, rectWidth: 10, rectHeight: 10, textureIndex: -1 },
		{ delay: 0, rectX: 0, rectY: 0, rectWidth: -1, rectHeight: 10, textureIndex: -1 },
		{ delay: 0, rectX: 0, rectY: 0, rectWidth: 10, rectHeight: -1, textureIndex: -1 },
	]) {
		t.throws(() => parseJta(createMovieClipJta(102, 10, 10, 0, 0, { frames: [frame] })), {
			message: /negative delay or dimensions/,
		});
	}
});

test('project settings transactions validate, detach, preserve unknown JSON, and support an explicit inverse', (t) => {
	const project = createSupportedProject();
	project.settings = {
		publish: { binaryFormat: true, atlasSetting: { maxSize: 2048 }, codeGeneration: { codePath: 'generated' } },
		common: { font: 'Arial', scrollBars: { vertical: 'ui://scroll' } },
		adaptation: { designResolutionX: 1280, devices: [{ name: 'tablet' }] },
		customProperties: { groups: [{ name: 'Gameplay' }] },
		i18n: { langFiles: [{ name: 'English', path: 'locale/en.xml' }] },
		pluginData: { enabled: true },
	};
	const original = structuredClone(project.settings);
	const updated = {
		publish: { binaryFormat: false, atlasSetting: { maxSize: 1024 }, codeGeneration: { codePath: 'src/ui' } },
		common: { font: 'Noto Sans', scrollBars: { vertical: 'ui://new-scroll' } },
		adaptation: { designResolutionX: 1920, devices: [{ name: 'desktop' }] },
		customProperties: { groups: [{ name: 'UI' }] },
		i18n: { langFiles: [{ name: 'French', path: 'locale/fr.xml' }] },
		pluginData: { enabled: false, nested: [1, 2, 3] },
	};
	const operation = { kind: 'updateProjectSettings' as const, settings: updated };

	t.deepEqual(validateTransactionSupport(project, [operation]), []);
	const result = applyUamTransaction(project, [operation]);
	updated.publish.atlasSetting.maxSize = 1;
	updated.i18n.langFiles[0]!.name = 'Mutated caller';
	t.is(result.settings.publish?.atlasSetting?.maxSize, 1024);
	t.is(result.settings.i18n?.langFiles[0]?.name, 'French');
	t.deepEqual(project.settings, original);
	t.deepEqual(result.settings.pluginData, { enabled: false, nested: [1, 2, 3] });

	const restored = applyUamTransaction(result, [{ kind: 'updateProjectSettings', settings: original }]);
	t.deepEqual(restored.settings, original);
	const unchanged = validateTransactionSupport(project, [{ kind: 'updateProjectSettings', settings: original }]);
	t.is(unchanged[0]?.code, 'project_settings_unchanged');
	const unchangedError = t.throws(() => applyUamTransaction(project, [{ kind: 'updateProjectSettings', settings: original }]));
	t.true(unchangedError instanceof UamTransactionError);

	const circular: Record<string, unknown> = {};
	circular.self = circular;
	for (const settings of [
		null,
		{ publish: { binaryFormat: 'yes' } },
		{ common: { scrollBars: { vertical: 1 } } },
		{ adaptation: { devices: {} } },
		{ customProperties: [] },
		{ i18n: { langFiles: [{ name: 'English', path: 1 }] } },
		{ unknown: Number.POSITIVE_INFINITY },
		{ unknown: circular },
		{ unknown: new Date() },
	]) {
		const issues = validateTransactionSupport(project, [{ kind: 'updateProjectSettings', settings } as never]);
		t.is(issues[0]?.code, 'invalid_project_settings');
	}
});

test('resource exported transactions support assets, components, inverse, and source immutability', (t) => {
	const project = createSupportedProject();
	const operations = [
		{ kind: 'setResourceExported' as const, selector: { packageId: 'pkg001', resourceId: 'img001' }, exported: false },
		{ kind: 'setResourceExported' as const, selector: { packageId: 'pkg001', resourceId: 'cmp001' }, exported: false },
	];

	t.deepEqual(validateTransactionSupport(project, operations), []);
	const result = applyUamTransaction(project, operations);
	t.true(project.packages[0]?.resources.find((resource) => resource.id === 'img001')?.exported);
	t.true(project.packages[0]?.resources.find((resource) => resource.id === 'cmp001')?.exported);
	t.false(result.packages[0]?.resources.find((resource) => resource.id === 'img001')?.exported);
	t.false(result.packages[0]?.resources.find((resource) => resource.id === 'cmp001')?.exported);

	const restored = applyUamTransaction(result, operations.map((operation) => ({ ...operation, exported: true })));
	t.true(restored.packages[0]?.resources.find((resource) => resource.id === 'img001')?.exported);
	t.true(restored.packages[0]?.resources.find((resource) => resource.id === 'cmp001')?.exported);

	const invalid = validateTransactionSupport(project, [{ ...operations[0]!, exported: 'true' as unknown as boolean }]);
	t.is(invalid[0]?.code, 'invalid_resource_payload');
	t.is(invalid[0]?.path, 'operations[0].exported');

	const unknown = validateTransactionSupport(project, [{ kind: 'unknownResourceOperation' } as never]);
	t.is(unknown[0]?.code, 'unsupported_operation');
	t.is(unknown[0]?.path, 'operations[0].kind');

	const mixed = applyUamTransaction(project, [
		operations[0]!,
		{ kind: 'addResourceFolder', selector: { packageId: 'pkg001' }, path: '/mixed/' },
		{ kind: 'renameResource', selector: { packageId: 'pkg001', resourceId: 'cmp001' }, newName: 'RenamedView' },
	]);
	t.false(mixed.packages[0]?.resources.find((resource) => resource.id === 'img001')?.exported);
	t.true(mixed.packages[0]?.folders.some((folder) => folder.path === '/mixed/'));
	t.is(mixed.packages[0]?.resources.find((resource) => resource.id === 'cmp001')?.name, 'RenamedView');
});

test('resource folder favorite supports non-empty and branch folders, inverse, and atomic resource updates', (t) => {
	const project = createSupportedProject();
	project.branches = ['mobile'];
	project.packages[0]!.folders.push(
		{ branch: '', path: '/other/', favorite: false, atlas: '' },
		{ branch: 'mobile', path: '/branch/', favorite: false, atlas: '' },
	);
	const operations = [
		{ kind: 'setResourceFolderFavorite' as const, selector: { packageId: 'pkg001', path: '/images/' }, favorite: true },
		{ kind: 'setResourceFavorite' as const, selector: { packageId: 'pkg001', resourceId: 'img001' }, favorite: true },
		{ kind: 'setResourceFolderFavorite' as const, selector: { packageId: 'pkg001', branch: 'mobile', path: '/branch/' }, favorite: true },
	];

	t.deepEqual(validateTransactionSupport(project, operations), []);
	const result = applyUamTransaction(project, operations);
	t.false(project.packages[0]!.folders.find((folder) => folder.path === '/images/')?.favorite);
	t.false(project.packages[0]!.resources.find((resource) => resource.id === 'img001')?.favorite);
	t.true(result.packages[0]!.folders.find((folder) => folder.path === '/images/')?.favorite);
	t.true(result.packages[0]!.folders.find((folder) => folder.branch === 'mobile')?.favorite);
	t.false(result.packages[0]!.folders.find((folder) => folder.path === '/other/')?.favorite);
	t.true(result.packages[0]!.resources.find((resource) => resource.id === 'img001')?.favorite);

	const restored = applyUamTransaction(result, operations.map((operation) => ({ ...operation, favorite: false })));
	t.deepEqual(restored, project);

	const invalid = validateTransactionSupport(project, [
		{ kind: 'setResourceFolderFavorite', selector: { packageId: 'pkg001', path: '/' }, favorite: true },
		{ kind: 'setResourceFolderFavorite', selector: { packageId: 'pkg001', path: '/missing/' }, favorite: true },
		{ kind: 'setResourceFolderFavorite', selector: { packageId: 'pkg001', path: '/images/' }, favorite: 'true' as unknown as boolean },
	]);
	t.true(invalid.filter((issue) => issue.code === 'invalid_resource_folder_selector').length >= 2);
	t.true(invalid.some((issue) => issue.path === 'operations[2].favorite' && issue.code === 'invalid_resource_payload'));

	const documentBacked = applyUamTransaction(project, [
		operations[0]!,
		{ kind: 'renameResource', selector: { packageId: 'pkg001', resourceId: 'cmp001' }, newName: 'RenamedView' },
	]);
	t.true(documentBacked.packages[0]!.folders.find((folder) => folder.path === '/images/')?.favorite);
	t.is(documentBacked.packages[0]!.resources.find((resource) => resource.id === 'cmp001')?.name, 'RenamedView');
});

test('resource folder favorite follows sequential folder lifecycle projection', (t) => {
	const project = createSupportedProject();
	project.branches = ['mobile'];
	project.packages[0]!.folders.push(
		{ branch: '', path: '/empty/', favorite: false, atlas: '' },
		{ branch: '', path: '/target/', favorite: false, atlas: '' },
	);
	const original = structuredClone(project);
	const operations = [
		{ kind: 'addResourceFolder' as const, selector: { packageId: 'pkg001' }, path: '/work/' },
		{ kind: 'setResourceFolderFavorite' as const, selector: { packageId: 'pkg001', path: '/work/' }, favorite: true },
		{ kind: 'renameResourceFolder' as const, selector: { packageId: 'pkg001', path: '/work/' }, newName: 'renamed' },
		{ kind: 'setResourceFolderFavorite' as const, selector: { packageId: 'pkg001', path: '/renamed/' }, favorite: false },
		{ kind: 'moveResourceFolder' as const, selector: { packageId: 'pkg001', path: '/renamed/' }, toPath: '/target/' },
		{ kind: 'setResourceFolderFavorite' as const, selector: { packageId: 'pkg001', path: '/target/renamed/' }, favorite: true },
		{ kind: 'addResourceFolder' as const, selector: { packageId: 'pkg001' }, branch: 'mobile', path: '/branch-root/' },
		{ kind: 'setResourceFolderFavorite' as const, selector: { packageId: 'pkg001', branch: 'mobile', path: '/branch-root/' }, favorite: true },
		{ kind: 'addResourceFolder' as const, selector: { packageId: 'pkg001' }, branch: 'mobile', path: '/branch-root/nested/' },
		{ kind: 'setResourceFolderFavorite' as const, selector: { packageId: 'pkg001', branch: 'mobile', path: '/branch-root/nested/' }, favorite: true },
	];

	t.deepEqual(validateTransactionSupport(project, operations), []);
	const result = applyUamTransaction(project, operations);
	t.true(result.packages[0]!.folders.find((folder) => folder.path === '/target/renamed/')?.favorite);
	t.true(result.packages[0]!.folders.find((folder) => folder.branch === 'mobile' && folder.path === '/branch-root/')?.favorite);
	t.true(result.packages[0]!.folders.find((folder) => folder.branch === 'mobile' && folder.path === '/branch-root/nested/')?.favorite);
	t.deepEqual(project, original);

	const staleCases = [
		[
			{ kind: 'renameResourceFolder' as const, selector: { packageId: 'pkg001', path: '/empty/' }, newName: 'renamed' },
			{ kind: 'setResourceFolderFavorite' as const, selector: { packageId: 'pkg001', path: '/empty/' }, favorite: true },
		],
		[
			{ kind: 'moveResourceFolder' as const, selector: { packageId: 'pkg001', path: '/empty/' }, toPath: '/target/' },
			{ kind: 'setResourceFolderFavorite' as const, selector: { packageId: 'pkg001', path: '/empty/' }, favorite: true },
		],
		[
			{ kind: 'removeResourceFolder' as const, selector: { packageId: 'pkg001', path: '/empty/' } },
			{ kind: 'setResourceFolderFavorite' as const, selector: { packageId: 'pkg001', path: '/empty/' }, favorite: true },
		],
	];
	for (const stale of staleCases) {
		const issues = validateTransactionSupport(project, stale);
		t.true(issues.some((issue) => issue.code === 'invalid_resource_folder_selector' && issue.path === 'operations[1].selector'));
		const error = t.throws(() => applyUamTransaction(project, stale), { instanceOf: UamTransactionError });
		t.is(error?.code, 'transaction_unsupported');
		t.deepEqual(project, original);
	}
});

test('resource folder lifecycle supports empty-folder forward, inverse, and atomic groups', (t) => {
	const project = createSupportedProject();
	project.packages[0]!.folders = [
		{ branch: '', path: '/images/', favorite: false, atlas: '' },
		{ branch: '', path: '/empty/', favorite: true, atlas: 'atlas0' },
	];
	const originalFolders = structuredClone(project.packages[0]!.folders);

	const atomic = [
		{ kind: 'addResourceFolder' as const, selector: { packageId: 'pkg001' }, path: '/work/' },
		{ kind: 'renameResourceFolder' as const, selector: { packageId: 'pkg001', path: '/work/' }, newName: 'renamed' },
		{ kind: 'moveResourceFolder' as const, selector: { packageId: 'pkg001', path: '/renamed/' }, toPath: '/empty/' },
		{ kind: 'removeResourceFolder' as const, selector: { packageId: 'pkg001', path: '/empty/renamed/' } },
	];
	t.deepEqual(validateTransactionSupport(project, atomic), []);
	t.deepEqual(applyUamTransaction(project, atomic).packages[0]!.folders, originalFolders);
	t.deepEqual(project.packages[0]!.folders, originalFolders);

	const added = applyUamTransaction(project, [{
		kind: 'addResourceFolder', selector: { packageId: 'pkg001' }, path: '/added/',
	}]);
	t.deepEqual(applyUamTransaction(added, [{
		kind: 'removeResourceFolder', selector: { packageId: 'pkg001', path: '/added/' },
	}]).packages[0]!.folders, originalFolders);

	const renamed = applyUamTransaction(project, [{
		kind: 'renameResourceFolder', selector: { packageId: 'pkg001', path: '/empty/' }, newName: 'renamed',
	}]);
	t.deepEqual(applyUamTransaction(renamed, [{
		kind: 'renameResourceFolder', selector: { packageId: 'pkg001', path: '/renamed/' }, newName: 'empty',
	}]).packages[0]!.folders, originalFolders);

	const moved = applyUamTransaction(project, [{
		kind: 'moveResourceFolder', selector: { packageId: 'pkg001', path: '/empty/' }, toPath: '/images/',
	}]);
	t.deepEqual(applyUamTransaction(moved, [{
		kind: 'moveResourceFolder', selector: { packageId: 'pkg001', path: '/images/empty/' }, toPath: '/',
	}]).packages[0]!.folders, originalFolders);

	const removed = applyUamTransaction(project, [{
		kind: 'removeResourceFolder',
		selector: { packageId: 'pkg001', path: '/empty/' },
	}]);
	t.false(removed.packages[0]!.folders.some((folder) => folder.path === '/empty/'));
	const restored = applyUamTransaction(removed, [{
		kind: 'addResourceFolder',
		selector: { packageId: 'pkg001' },
		path: '/empty/',
		favorite: true,
		atlas: 'atlas0',
	}]);
	t.deepEqual(restored.packages[0]!.folders, originalFolders);
});

test('resource folder preflight rejects invalid selectors, conflicts, and non-empty changes', (t) => {
	const project = createSupportedProject();
	project.packages[0]!.folders = [
		{ branch: '', path: '/images/', favorite: false, atlas: '' },
		{ branch: '', path: '/empty/', favorite: false, atlas: '' },
	];
	const operations = [
		{ kind: 'removeResourceFolder' as const, selector: { packageId: 'pkg001', path: '/' } },
		{ kind: 'addResourceFolder' as const, selector: { packageId: 'pkg001' }, path: '/missing/child/' },
		{ kind: 'addResourceFolder' as const, selector: { packageId: 'pkg001' }, path: '/empty/' },
		{ kind: 'addResourceFolder' as const, selector: { packageId: 'pkg001' }, path: '/images/background.png/' },
		{ kind: 'renameResourceFolder' as const, selector: { packageId: 'pkg001', path: '/images/' }, newName: 'renamed' },
		{ kind: 'moveResourceFolder' as const, selector: { packageId: 'pkg001', path: '/images/' }, toPath: '/empty/' },
		{ kind: 'removeResourceFolder' as const, selector: { packageId: 'pkg001', path: '/images/' } },
	];
	const issues = validateTransactionSupport(project, operations);
	t.true(issues.some((issue) => issue.code === 'invalid_resource_folder_selector'));
	t.true(issues.some((issue) => issue.code === 'invalid_resource_folder_path'));
	t.true(issues.some((issue) => issue.code === 'resource_folder_conflict'));
	t.true(issues.filter((issue) => issue.code === 'resource_folder_not_empty').length >= 3);
	t.throws(() => applyUamTransaction(project, operations), { instanceOf: UamTransactionError });
	t.deepEqual(project.packages[0]!.folders.map((folder) => folder.path), ['/images/', '/empty/']);
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
				...createDefaultUamPlainTextProperties(),
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
	t.true(result.packages[0]!.folders.some((folder) => folder.path === '/moved/'));
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
					...createDefaultUamPlainTextProperties(),
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

test('text color snapshots canonicalize before save and reload', async (t) => {
	const textProperties = {
		...createDefaultUamPlainTextProperties(),
		text: 'Canonical colors',
		color: '#FF000000',
		strokeColor: '#DDEEFF',
		shadowColor: '#ABCDEF',
		shadowOffset: { x: 0, y: 0 },
	};
	const updated = applyUamTransaction(createSupportedProject(), [{
		kind: 'setDisplayNodeProps',
		selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
		props: { textProperties },
	}]);
	const updatedComponent = updated.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	const updatedText = updatedComponent?.kind === 'component'
		? updatedComponent.component.displayList.find((node) => node.id === 'n1')
		: null;
	if (updatedText?.kind !== 'text') {
		t.fail('expected updated text node');
		return;
	}
	t.is(updatedText.color, '#000000');
	t.is(updatedText.strokeColor, '#ddeeff');
	t.is(updatedText.shadowColor, '#abcdef');

	const reloaded = await roundTripCommittedProject(updated);
	const reloadedComponent = reloaded.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	const reloadedText = reloadedComponent?.kind === 'component'
		? reloadedComponent.component.displayList.find((node) => node.id === 'n1')
		: null;
	t.like(reloadedText, updatedText);
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

test('ProjectReader and MovieClip replacement hydrate the complete typed JTA model with inverse support', async (t) => {
	const project = createSupportedProject();
	for (const version of [100, 101, 102] as const) {
		const sourceBytes = createMovieClipJta(version, 96, 72, 0, 0);
		const derived = deriveMovieClipModelFromJta(sourceBytes);
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
			dimensions: derived.dimensions,
			movieClip: {
				interval: derived.interval,
				repeatDelay: derived.repeatDelay,
				swing: derived.swing,
				smoothing: version !== 102,
				frames: derived.frames.map(({ textureIndex: _textureIndex, ...frame }) => ({ ...frame, spriteId: '' })),
			},
			sourceBytes,
		});
	}

	const reloaded = await roundTripCommittedProject(project);
	for (const version of [100, 101, 102] as const) {
		const movieClip = reloaded.packages[0]!.resources.find((resource) => resource.id === `movie${version}`);
		t.is(movieClip?.kind, 'movieClip');
		if (movieClip?.kind !== 'movieClip') continue;
		t.deepEqual(movieClip.dimensions, { width: 96, height: 72 });
		t.deepEqual(movieClip.movieClip, {
			interval: 80,
			repeatDelay: 160,
			swing: true,
			smoothing: version !== 102,
			frames: [{ rectX: 0, rectY: 0, rectWidth: 96, rectHeight: 72, addDelay: 120, spriteId: '' }],
		});
	}
	const movie102 = reloaded.packages[0]!.resources.find((resource) => resource.id === 'movie102');
	if (movie102?.kind === 'movieClip') movie102.movieClip.smoothing = false;
	const originalMovie102 = structuredClone(movie102);
	const replacementBytes = createMovieClipJta(102, 120, 84, 5, 7, {
		fps: 50,
		speed: 3,
		repeatDelay: 2,
		swing: false,
		frames: [
			{ delay: 5, rectX: 5, rectY: 7, rectWidth: 40, rectHeight: 30, textureIndex: 0 },
			{ delay: 1, rectX: 45, rectY: 37, rectWidth: 75, rectHeight: 47, textureIndex: 0 },
		],
		textures: [new Uint8Array([1])],
	});
	const replaced = applyUamTransaction(reloaded, [{
		kind: 'replaceResourceBytes',
		selector: { packageId: 'pkg001', resourceId: 'movie102' },
		sourceBytes: replacementBytes,
	}]);
	const replacedMovieClip = replaced.packages[0]!.resources.find((resource) => resource.id === 'movie102');
	t.is(replacedMovieClip?.kind, 'movieClip');
	if (replacedMovieClip?.kind === 'movieClip') {
		t.deepEqual(replacedMovieClip.dimensions, { width: 120, height: 84 });
		t.deepEqual(replacedMovieClip.movieClip, {
			interval: 60,
			repeatDelay: 40,
			swing: false,
			smoothing: false,
			frames: [
				{ rectX: 5, rectY: 7, rectWidth: 40, rectHeight: 30, addDelay: 100, spriteId: '' },
				{ rectX: 45, rectY: 37, rectWidth: 75, rectHeight: 47, addDelay: 20, spriteId: '' },
			],
		});
	}
	t.deepEqual(reloaded.packages[0]!.resources.find((resource) => resource.id === 'movie102'), originalMovie102);
	const replacedReloaded = await roundTripCommittedProject(replaced);
	const replacedReloadedMovieClip = replacedReloaded.packages[0]!.resources.find((resource) => resource.id === 'movie102');
	if (replacedMovieClip?.kind === 'movieClip' && replacedReloadedMovieClip?.kind === 'movieClip') {
		t.deepEqual(replacedReloadedMovieClip.dimensions, replacedMovieClip.dimensions);
		t.deepEqual(replacedReloadedMovieClip.movieClip, replacedMovieClip.movieClip);
	}

	if (!originalMovie102 || originalMovie102.kind !== 'movieClip' || !(originalMovie102.sourceBytes instanceof Uint8Array)) {
		t.fail('expected original hydrated MovieClip source');
		return;
	}
	const { sourcePath: _sourcePath, ...portableMovieClip } = originalMovie102;
	const staleMovieClip = {
		...portableMovieClip,
		id: 'movieAdded',
		name: 'added',
		path: '/',
		fileName: 'added.jta',
		dimensions: { width: 1, height: 1 },
		movieClip: {
			...portableMovieClip.movieClip,
			interval: 1,
			repeatDelay: 1,
			frames: [],
		},
		sourceBytes: replacementBytes,
	};
	const addedResourceProject = applyUamTransaction(reloaded, [{
		kind: 'addResource',
		selector: { packageId: 'pkg001' },
		resource: staleMovieClip,
	}]);
	const addedResource = addedResourceProject.packages[0]!.resources.find((resource) => resource.id === 'movieAdded');
	t.is(addedResource?.kind, 'movieClip');
	if (addedResource?.kind === 'movieClip') {
		t.deepEqual(addedResource.dimensions, { width: 120, height: 84 });
		t.is(addedResource.movieClip.interval, 60);
		t.is(addedResource.movieClip.repeatDelay, 40);
		t.is(addedResource.movieClip.frames.length, 2);
		t.false(addedResource.movieClip.smoothing);
	}

	const addedPackageProject = applyUamTransaction(reloaded, [{
		kind: 'addPackage',
		atIndex: reloaded.packages.length,
		package: {
			id: 'pkgmovie',
			name: 'MoviePackage',
			publish: null,
			folders: [],
			resources: [{ ...staleMovieClip, id: 'moviePackaged', name: 'packaged', fileName: 'packaged.jta' }],
		},
	}]);
	const addedPackageResource = addedPackageProject.packages.at(-1)?.resources[0];
	t.is(addedPackageResource?.kind, 'movieClip');
	if (addedPackageResource?.kind === 'movieClip') {
		t.deepEqual(addedPackageResource.dimensions, { width: 120, height: 84 });
		t.is(addedPackageResource.movieClip.interval, 60);
		t.is(addedPackageResource.movieClip.frames.length, 2);
	}

	const restored = applyUamTransaction(replacedReloaded, [{
		kind: 'replaceResourceBytes',
		selector: { packageId: 'pkg001', resourceId: 'movie102' },
		sourceBytes: originalMovie102.sourceBytes,
	}]);
	const restoredReloaded = await roundTripCommittedProject(restored);
	const restoredMovieClip = restoredReloaded.packages[0]!.resources.find((resource) => resource.id === 'movie102');
	if (restoredMovieClip?.kind === 'movieClip') {
		t.deepEqual(restoredMovieClip.dimensions, originalMovie102.dimensions);
		const { smoothing: _restoredSmoothing, ...restoredDerived } = restoredMovieClip.movieClip;
		const { smoothing: _originalSmoothing, ...originalDerived } = originalMovie102.movieClip;
		t.deepEqual(restoredDerived, originalDerived);
		t.deepEqual(restoredMovieClip.sourceBytes, originalMovie102.sourceBytes);
	}

	const invalidBytes = replacementBytes.subarray(0, replacementBytes.byteLength - 1);
	const beforeInvalid = structuredClone(replacedReloaded);
	const invalidError = t.throws(() => applyUamTransaction(replacedReloaded, [{
		kind: 'replaceResourceBytes',
		selector: { packageId: 'pkg001', resourceId: 'movie102' },
		sourceBytes: invalidBytes,
	}]), { instanceOf: UamTransactionError });
	t.true(invalidError?.issues?.some((issue) => 'code' in issue && issue.code === 'invalid_movie_clip_jta') ?? false);
	t.deepEqual(replacedReloaded, beforeInvalid);
	const beforeInvalidAdds = structuredClone(reloaded);
	for (const operation of [{
		kind: 'addResource' as const,
		selector: { packageId: 'pkg001' },
		resource: { ...staleMovieClip, id: 'invalidMovie', name: 'invalid', fileName: 'invalid.jta', sourceBytes: invalidBytes },
	}, {
		kind: 'addResource' as const,
		selector: { packageId: 'pkg001' },
		resource: {
			...staleMovieClip,
			id: 'negativeFrameMovie',
			name: 'negativeFrame',
			fileName: 'negative-frame.jta',
			sourceBytes: createMovieClipJta(102, 10, 10, 0, 0, {
				frames: [{ delay: -1, rectX: 0, rectY: 0, rectWidth: 10, rectHeight: 10, textureIndex: -1 }],
			}),
		},
	}, {
		kind: 'addPackage' as const,
		atIndex: reloaded.packages.length,
		package: {
			id: 'invalidPackage',
			name: 'InvalidMoviePackage',
			publish: null,
			folders: [],
			resources: [{ ...staleMovieClip, id: 'invalidPackagedMovie', sourceBytes: invalidBytes }],
		},
	}]) {
		const error = t.throws(() => applyUamTransaction(reloaded, [operation]), { instanceOf: UamTransactionError });
		t.true(error?.issues?.some((issue) => 'code' in issue && issue.code === 'invalid_movie_clip_jta') ?? false);
	}
	t.deepEqual(reloaded, beforeInvalidAdds);

	const asyncReplaced = await applyUamTransactionAsync(reloaded, [{
		kind: 'replaceResourceBytes',
		selector: { packageId: 'pkg001', resourceId: 'movie102' },
		sourceBytes: replacementBytes,
	}]);
	t.deepEqual(asyncReplaced, replaced);
});
