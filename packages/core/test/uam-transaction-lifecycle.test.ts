import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
	UamTransactionError,
	applyUamTransaction,
	validateTransactionSupport,
	type UamComponentRefNode,
	type UamTransactionOperation,
} from '../src/index.js';
import { NodeIO } from '../src/node.js';
import { readProjectAsUam, writeProjectFromUam } from '../src/uam/index.js';
import { applyUamNativeOperations } from '../src/uam/transaction-uam-apply.js';

import {
	LAYABOX_PROJECT_PATH,
	createControllerModel,
	createDisplayNodeBase,
	createLifecycleComponent,
	createLifecyclePackage,
	createNonLookGears,
	createSupportedProject,
	createTransitionModel,
	roundTripCommittedProject,
	updateNonLookGear,
} from './uam-transaction-fixtures.js';

test('resource lifecycle preflight projects batches and rejects unsafe source paths', (t) => {
	const addResource = {
		kind: 'misc' as const,
		id: 'generated',
		name: 'generated',
		path: '/generated',
		exported: true,
		favorite: false,
		branch: '',
		branchItemIds: [],
		file: 'generated.bin',
		metadata: null,
		sourceBytes: new Uint8Array([1]),
	};
	const duplicateIssues = validateTransactionSupport(createSupportedProject(), [
		{ kind: 'addResource', selector: { packageId: 'pkg001' }, resource: addResource },
		{ kind: 'addResource', selector: { packageId: 'pkg001' }, resource: addResource },
	]);
	t.true(duplicateIssues.some((issue) => issue.code === 'duplicate_resource_id'));
	const removedTargetIssues = validateTransactionSupport(createSupportedProject(), [
		{ kind: 'removeResource', selector: { packageId: 'pkg001', resourceId: 'img001' } },
		{ kind: 'replaceResourceBytes', selector: { packageId: 'pkg001', resourceId: 'img001' }, sourceBytes: new Uint8Array([2]) },
	]);
	t.true(removedTargetIssues.some((issue) => issue.code === 'invalid_resource_selector'));

	const replacementProject = createSupportedProject();
	const replacementImage = replacementProject.packages[0]?.resources.find((resource) => resource.id === 'img001');
	if (replacementImage?.kind !== 'image') {
		t.fail('expected image replacement fixture');
		return;
	}
	const replacementImagePayload = structuredClone(replacementImage);
	delete replacementImagePayload.sourcePath;
	const replacedId = applyUamTransaction(replacementProject, [
		{ kind: 'removeResource', selector: { packageId: 'pkg001', resourceId: 'img001' } },
		{ kind: 'addResource', selector: { packageId: 'pkg001' }, resource: replacementImagePayload },
	]);
	t.is(replacedId.packages[0]?.resources.find((resource) => resource.id === 'img001')?.kind, 'image');

	const sourcePathIssues = validateTransactionSupport(createSupportedProject(), [{
		kind: 'addResource',
		selector: { packageId: 'pkg001' },
		resource: { ...addResource, sourcePath: '/package.xml' },
	}]);
	t.true(sourcePathIssues.some((issue) => issue.code === 'invalid_resource_payload'));

	const collisionError = t.throws(
		() => applyUamTransaction(createSupportedProject(), [{
			kind: 'addResource',
			selector: { packageId: 'pkg001' },
			resource: { ...addResource, id: 'package-descriptor', path: '/', file: 'package.xml' },
		}]),
		{ instanceOf: UamTransactionError },
	);
	t.true(collisionError?.issues?.some((issue) => issue.message.includes('conflicts with the package descriptor')) ?? false);

	const referencedSoundProject = createSupportedProject();
	referencedSoundProject.packages[0]?.resources.push({
		kind: 'sound',
		id: 'snd001',
		name: 'click',
		path: '/sounds',
		exported: true,
		favorite: false,
		branch: '',
		branchItemIds: [],
		file: 'click.mp3',
		metadata: null,
		sourceBytes: new Uint8Array([1]),
	});
	const referencedSoundComponent = referencedSoundProject.packages[0]?.resources
		.find((resource) => resource.id === 'cmp001');
	if (referencedSoundComponent?.kind !== 'component') {
		t.fail('expected referenced sound component fixture');
		return;
	}
	referencedSoundComponent.component.properties.sound = 'ui://pkg001/snd001';
	t.true(validateTransactionSupport(referencedSoundProject, [{
		kind: 'removeResource',
		selector: { packageId: 'pkg001', resourceId: 'snd001' },
	}]).some((issue) => issue.code === 'invalid_resource_reference'));
	t.deepEqual(validateTransactionSupport(referencedSoundProject, [
		{
			kind: 'setComponentProps',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001' },
			props: { properties: { ...referencedSoundComponent.component.properties, sound: '' } },
		},
		{ kind: 'removeResource', selector: { packageId: 'pkg001', resourceId: 'snd001' } },
	]), []);

	for (const source of ['text', 'transition', 'gear'] as const) {
		const referencedProject = createSupportedProject();
		const component = referencedProject.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
		const sourceImage = referencedProject.packages[0]?.resources.find((resource) => resource.id === 'img001');
		if (component?.kind !== 'component' || sourceImage?.kind !== 'image') continue;
		referencedProject.packages[0]?.resources.push({
			...structuredClone(sourceImage),
			id: 'embedded',
			name: 'embedded.png',
			fileName: 'embedded.png',
			sourcePath: '/images/embedded.png',
		});
		if (source === 'text') {
			const textNode = component.component.displayList.find((node) => node.id === 'n1');
			if (textNode?.kind === 'text') textNode.text = '<img src="ui://pkg001embedded">';
		} else if (source === 'transition') {
			const transition = createTransitionModel();
			transition.items[0]!.startValue = ['ui://pkg001embedded'];
			component.component.transitions.push(transition);
		} else {
			component.component.controllers.push(createControllerModel('embedded-state'));
			const textNode = component.component.displayList.find((node) => node.id === 'n1');
			textNode?.gears.push({
				kind: 'text',
				name: 'resource-text',
				controllerName: 'embedded-state',
				states: [],
				defaultValue: { text: 'ui://pkg001embedded' },
				condition: '',
				positionsInPercent: false,
				tween: false,
				tweenDuration: 0.3,
				tweenDelay: 0,
				easeType: 5,
				customEasePath: '',
			});
		}
		t.true(validateTransactionSupport(referencedProject, [{
			kind: 'removeResource',
			selector: { packageId: 'pkg001', resourceId: 'embedded' },
		}]).some((issue) => issue.code === 'invalid_resource_reference'), source);
	}
});

test('UAM-native execution failure leaves the input project unchanged', (t) => {
	const project = createSupportedProject();
	const before = structuredClone(project);
	t.throws(() => applyUamNativeOperations(project, [
		{
			kind: 'addResource',
			selector: { packageId: 'pkg001' },
			resource: {
				kind: 'misc',
				id: 'temporary',
				name: 'temporary',
				path: '/',
				exported: true,
				favorite: false,
				branch: '',
				branchItemIds: [],
				file: 'temporary.bin',
				metadata: null,
				sourceBytes: new Uint8Array([1]),
			},
		},
		{ kind: 'removeResource', selector: { packageId: 'pkg001', resourceId: 'missing' } },
	]));
	t.deepEqual(project, before);
	t.false(project.packages[0]?.resources.some((resource) => resource.id === 'temporary'));
});

test('package and component lifecycle transactions survive write, reload, and inverse operations', async (t) => {
	const original = createSupportedProject();
	const created = applyUamTransaction(original, [
		{ kind: 'addPackage', package: createLifecyclePackage(), atIndex: 1 },
		{
			kind: 'addComponent',
			selector: { packageId: 'pkg002' },
			component: createLifecycleComponent(),
			atIndex: 0,
		},
	]);
	const createdPackage = created.packages.find((pkg) => pkg.id === 'pkg002');
	const createdComponent = createdPackage?.resources.find((resource) => resource.id === 'cmp002');
	t.is(createdPackage?.name, 'Overlay');
	t.is(createdComponent?.kind, 'component');
	if (createdComponent?.kind !== 'component') return;
	t.is(createdComponent.component.displayList[0]?.id, 'popup-title');

	const moved = applyUamTransaction(created, [
		{ kind: 'renamePackage', selector: { packageId: 'pkg002' }, newName: 'OverlayRenamed' },
		{
			kind: 'moveComponent',
			selector: { packageId: 'pkg002', componentResourceId: 'cmp002' },
			toPackageId: 'pkg001',
			toIndex: 2,
		},
	]);
	const reloaded = await roundTripCommittedProject(moved);
	const movedPackage = reloaded.packages.find((pkg) => pkg.id === 'pkg002');
	const movedComponent = reloaded.packages
		.find((pkg) => pkg.id === 'pkg001')?.resources
		.find((resource) => resource.id === 'cmp002');
	t.is(movedPackage?.name, 'OverlayRenamed');
	t.is(movedComponent?.kind, 'component');

	const restored = applyUamTransaction(reloaded, [
		{
			kind: 'moveComponent',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp002' },
			toPackageId: 'pkg002',
			toIndex: 0,
		},
		{ kind: 'renamePackage', selector: { packageId: 'pkg002' }, newName: 'Overlay' },
	]);
	const packageSnapshot = restored.packages.find((pkg) => pkg.id === 'pkg002');
	if (!packageSnapshot) {
		t.fail('expected restored package snapshot');
		return;
	}
	const removed = applyUamTransaction(restored, [
		{ kind: 'removeComponent', selector: { packageId: 'pkg002', componentResourceId: 'cmp002' } },
		{ kind: 'removePackage', selector: { packageId: 'pkg002' } },
	]);
	t.false(removed.packages.some((pkg) => pkg.id === 'pkg002'));

	const restoredFromInverse = applyUamTransaction(removed, [
		{ kind: 'addPackage', package: packageSnapshot, atIndex: 1 },
	]);
	const inverseComponent = restoredFromInverse.packages
		.find((pkg) => pkg.id === 'pkg002')?.resources
		.find((resource) => resource.id === 'cmp002');
	t.is(inverseComponent?.kind, 'component');
});

test('package and component lifecycle preflight reports dependency and batch diagnostics', (t) => {
	const project = createSupportedProject();
	const host = createLifecycleComponent('cmp003', 'Host');
	host.component.displayList = [{
		...createDisplayNodeBase('component-ref', 'component-ref'),
		kind: 'component',
		resource: { packageId: 'pkg001', resourceId: 'cmp001' },
	}];
	project.packages.push({ ...createLifecyclePackage(), resources: [host] });

	const removeIssues = validateTransactionSupport(project, [
		{ kind: 'removeComponent', selector: { packageId: 'pkg001', componentResourceId: 'cmp001' } },
		{ kind: 'removePackage', selector: { packageId: 'pkg001' } },
	]);
	t.true(removeIssues.some((issue) => issue.code === 'component_referenced'));
	t.true(removeIssues.some((issue) => issue.code === 'package_referenced'));

	const movedComponent = project.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	const movedImage = movedComponent?.kind === 'component'
		? movedComponent.component.displayList.find((node) => node.id === 'n0')
		: null;
	if (movedImage?.kind !== 'image') {
		t.fail('expected movable image dependency fixture');
		return;
	}
	movedImage.resource.packageId = 'pkg001';
	const moveIssues = validateTransactionSupport(project, [{
		kind: 'moveComponent',
		selector: { packageId: 'pkg001', componentResourceId: 'cmp001' },
		toPackageId: 'pkg002',
		toIndex: 1,
	}]);
	t.true(moveIssues.some((issue) => issue.code === 'component_has_package_dependencies'));

	const addIssues = validateTransactionSupport(createSupportedProject(), [{
		kind: 'addPackage',
		package: createLifecyclePackage('pkg001', '../unsafe'),
		atIndex: -1,
	}]);
	t.true(addIssues.some((issue) => issue.code === 'duplicate_package_id'));
	t.true(addIssues.some((issue) => issue.code === 'invalid_package_payload'));
	t.true(addIssues.some((issue) => issue.code === 'invalid_package_index'));

	const batchIssues = validateTransactionSupport(createSupportedProject(), [
		{ kind: 'addPackage', package: createLifecyclePackage(), atIndex: 1 },
		{
			kind: 'setDisplayNodeProps',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
			props: { text: 'Separate transaction' },
		},
	]);
	t.deepEqual(batchIssues, []);
});

test('display-list projection validates and applies properties on a newly attached node', (t) => {
	const project = createSupportedProject();
	const node = structuredClone(createLifecycleComponent().component.displayList[0]!);
	const operations: UamTransactionOperation[] = [
		{
			kind: 'attachDisplayNode',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001' },
			atIndex: 2,
			node,
		},
		{
			kind: 'setDisplayNodeProps',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: node.id },
			props: { alpha: 0.5 },
		},
	];
	t.deepEqual(validateTransactionSupport(project, operations), []);
	const updated = applyUamTransaction(project, operations);
	const component = updated.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	t.is(component?.kind === 'component'
		? component.component.displayList.find((candidate) => candidate.id === node.id)?.alpha
		: null, 0.5);
});

test('package-local dependencies resolve from a component destination after an atomic copy and move', (t) => {
	const project = createSupportedProject();
	const sourcePackage = project.packages[0]!;
	const image = sourcePackage.resources.find((resource) => resource.id === 'img001');
	if (image?.kind !== 'image') {
		t.fail('expected image dependency fixture');
		return;
	}
	project.packages.push(createLifecyclePackage());
	const copiedImage = structuredClone(image);
	delete copiedImage.sourcePath;
	const operations: UamTransactionOperation[] = [
		{
			kind: 'addResource',
			selector: { packageId: 'pkg002' },
			resource: copiedImage,
		},
		{
			kind: 'moveComponent',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001' },
			toPackageId: 'pkg002',
			toIndex: 0,
		},
	];
	t.deepEqual(validateTransactionSupport(project, operations), []);
	const moved = applyUamTransaction(project, operations);
	const target = moved.packages.find((pkg) => pkg.id === 'pkg002');
	t.true(target?.resources.some((resource) => resource.id === 'img001'));
	t.true(target?.resources.some((resource) => resource.id === 'cmp001'));
});

test('component lifecycle atomically rewrites inbound display references', async (t) => {
	const project = createSupportedProject();
	const movable = createLifecycleComponent('cmp002', 'Movable');
	const host = createLifecycleComponent('cmp003', 'Host');
	const originalReference: UamComponentRefNode = {
		...createDisplayNodeBase('component-ref', 'component-ref'),
		kind: 'component',
		group: '',
		resource: { packageId: '', resourceId: 'cmp002' },
	};
	host.component.displayList = [originalReference];
	project.packages.push({ ...createLifecyclePackage(), resources: [movable, host] });

	const forward: UamTransactionOperation[] = [
		{
			kind: 'detachDisplayNode',
			selector: { packageId: 'pkg002', componentResourceId: 'cmp003', displayNodeId: 'component-ref' },
		},
		{
			kind: 'attachDisplayNode',
			selector: { packageId: 'pkg002', componentResourceId: 'cmp003' },
			atIndex: 0,
			node: { ...originalReference, resource: { packageId: 'pkg001', resourceId: 'cmp002' } },
		},
		{
			kind: 'moveComponent',
			selector: { packageId: 'pkg002', componentResourceId: 'cmp002' },
			toPackageId: 'pkg001',
			toIndex: 2,
		},
	];
	t.deepEqual(validateTransactionSupport(project, forward), []);
	const moved = await roundTripCommittedProject(applyUamTransaction(project, forward));
	const movedTarget = moved.packages.find((pkg) => pkg.id === 'pkg001')?.resources.find((resource) => resource.id === 'cmp002');
	const movedHost = moved.packages.find((pkg) => pkg.id === 'pkg002')?.resources.find((resource) => resource.id === 'cmp003');
	t.is(movedTarget?.kind, 'component');
	if (movedHost?.kind !== 'component') {
		t.fail('expected moved host component');
		return;
	}
	const movedReference = movedHost.component.displayList.find((node) => node.id === 'component-ref');
	t.is(movedReference?.kind, 'component');
	if (movedReference?.kind === 'component') {
		t.deepEqual(movedReference.resource, { packageId: 'pkg001', resourceId: 'cmp002' });
	}

	const inverse: UamTransactionOperation[] = [
		{
			kind: 'detachDisplayNode',
			selector: { packageId: 'pkg002', componentResourceId: 'cmp003', displayNodeId: 'component-ref' },
		},
		{
			kind: 'attachDisplayNode',
			selector: { packageId: 'pkg002', componentResourceId: 'cmp003' },
			atIndex: 0,
			node: originalReference,
		},
		{
			kind: 'moveComponent',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp002' },
			toPackageId: 'pkg002',
			toIndex: 0,
		},
	];
	t.deepEqual(validateTransactionSupport(moved, inverse), []);
	const restored = await roundTripCommittedProject(applyUamTransaction(moved, inverse));
	const restoredPackage = restored.packages.find((pkg) => pkg.id === 'pkg002');
	const restoredTarget = restoredPackage?.resources.find((resource) => resource.id === 'cmp002');
	const restoredHost = restoredPackage?.resources.find((resource) => resource.id === 'cmp003');
	if (restoredTarget?.kind !== 'component' || restoredHost?.kind !== 'component') {
		t.fail('expected restored components');
		return;
	}
	t.deepEqual(restoredHost.component.displayList.find((node) => node.id === 'component-ref'), {
		...originalReference,
		pivot: { x: 0, y: 0 },
		pivotAsAnchor: false,
		resource: { packageId: 'pkg002', resourceId: 'cmp002' },
	});

	const unsafeRemove = validateTransactionSupport(restored, [{
		kind: 'removeComponent',
		selector: { packageId: 'pkg002', componentResourceId: 'cmp002' },
	}]);
	t.true(unsafeRemove.some((issue) => issue.code === 'component_referenced'));
	const implicitReplace = validateTransactionSupport(restored, [
		{ kind: 'removeComponent', selector: { packageId: 'pkg002', componentResourceId: 'cmp002' } },
		{ kind: 'addComponent', selector: { packageId: 'pkg002' }, component: restoredTarget, atIndex: 0 },
	]);
	t.true(implicitReplace.some((issue) => issue.code === 'component_referenced'));

	const removed = await roundTripCommittedProject(applyUamTransaction(restored, [
		{
			kind: 'detachDisplayNode',
			selector: { packageId: 'pkg002', componentResourceId: 'cmp003', displayNodeId: 'component-ref' },
		},
		{
			kind: 'removeComponent',
			selector: { packageId: 'pkg002', componentResourceId: 'cmp002' },
		},
	]));
	t.false(removed.packages.find((pkg) => pkg.id === 'pkg002')?.resources.some((resource) => resource.id === 'cmp002') ?? true);

	const restoredAfterRemove = await roundTripCommittedProject(applyUamTransaction(removed, [
		{
			kind: 'addComponent',
			selector: { packageId: 'pkg002' },
			component: restoredTarget,
			atIndex: 0,
		},
		{
			kind: 'attachDisplayNode',
			selector: { packageId: 'pkg002', componentResourceId: 'cmp003' },
			atIndex: 0,
			node: originalReference,
		},
	]));
	const reattachedHost = restoredAfterRemove.packages.find((pkg) => pkg.id === 'pkg002')?.resources.find((resource) => resource.id === 'cmp003');
	if (reattachedHost?.kind !== 'component') {
		t.fail('expected reattached host component');
		return;
	}
	t.deepEqual(reattachedHost.component.displayList.find((node) => node.id === 'component-ref'), {
		...originalReference,
		pivot: { x: 0, y: 0 },
		pivotAsAnchor: false,
		resource: { packageId: 'pkg002', resourceId: 'cmp002' },
	});

	const invalidReference = validateTransactionSupport(project, [
		{
			kind: 'addComponent',
			selector: { packageId: 'pkg002' },
			component: createLifecycleComponent('cmp004', 'Added'),
			atIndex: 2,
		},
		{
			kind: 'attachDisplayNode',
			selector: { packageId: 'pkg002', componentResourceId: 'cmp003' },
			atIndex: 1,
			node: { ...originalReference, id: 'missing-component-ref', resource: { packageId: 'pkg002', resourceId: 'missing' } },
		},
	]);
	t.true(invalidReference.some((issue) => issue.code === 'invalid_component_reference'));
});

test('resource writes clean only explicit prior project sources and commit their current paths', async (t) => {
	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-uam-lifecycle-'));
	const outFairy = path.join(tmpDir, 'out.fairy');
	try {
		const original = createSupportedProject();
		await writeProjectFromUam(io, original, outFairy);
		const renamed = applyUamTransaction(original, [
			{ kind: 'renameResource', selector: { packageId: 'pkg001', resourceId: 'img001' }, newName: 'renamed.png' },
			{ kind: 'moveResource', selector: { packageId: 'pkg001', resourceId: 'img001' }, toPath: '/moved' },
		]);
		await writeProjectFromUam(io, renamed, outFairy, { previousProject: original });
		const renamedImage = renamed.packages[0]?.resources.find((resource) => resource.id === 'img001');
		if (renamedImage?.kind !== 'image') {
			t.fail('expected renamed image resource');
			return;
		}
		t.is(renamedImage.sourcePath, '/moved/renamed.png');
		await t.throwsAsync(fs.access(path.join(tmpDir, 'assets', 'Main', 'images', 'background.png')));

		const removed = applyUamTransaction(renamed, [
			{
				kind: 'detachDisplayNode',
				selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n0' },
			},
			{
				kind: 'removeResource',
				selector: { packageId: 'pkg001', resourceId: 'img001' },
			},
		]);
		await writeProjectFromUam(io, removed, outFairy, { previousProject: renamed });
		await t.throwsAsync(fs.access(path.join(tmpDir, 'assets', 'Main', 'moved', 'renamed.png')));

		const withPackage = applyUamTransaction(removed, [
			{ kind: 'addPackage', package: createLifecyclePackage(), atIndex: 1 },
			{
				kind: 'addComponent',
				selector: { packageId: 'pkg002' },
				component: createLifecycleComponent(),
			atIndex: 0,
			},
		]);
		await writeProjectFromUam(io, withPackage, outFairy, { previousProject: removed });
		const renamedPackage = applyUamTransaction(withPackage, [
			{ kind: 'renamePackage', selector: { packageId: 'pkg002' }, newName: 'OverlayRenamed' },
		]);
		await writeProjectFromUam(io, renamedPackage, outFairy, { previousProject: withPackage });
		await t.throwsAsync(fs.access(path.join(tmpDir, 'assets', 'Overlay', 'package.xml')));
		await fs.access(path.join(tmpDir, 'assets', 'OverlayRenamed', 'package.xml'));
		await fs.access(path.join(tmpDir, 'assets', 'OverlayRenamed', 'Popup.xml'));

		const withoutPackage = applyUamTransaction(renamedPackage, [
			{ kind: 'removeComponent', selector: { packageId: 'pkg002', componentResourceId: 'cmp002' } },
			{ kind: 'removePackage', selector: { packageId: 'pkg002' } },
		]);
		await writeProjectFromUam(io, withoutPackage, outFairy, { previousProject: renamedPackage });
		await t.throwsAsync(fs.access(path.join(tmpDir, 'assets', 'OverlayRenamed', 'package.xml')));
		await t.throwsAsync(fs.access(path.join(tmpDir, 'assets', 'OverlayRenamed', 'Popup.xml')));
		const reloaded = await readProjectAsUam(io, outFairy, { hydrateResourceBytes: true });
		t.false(reloaded.packages.some((pkg) => pkg.id === 'pkg002'));
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('controller updates cannot leave display gears bound to removed pages', (t) => {
	const project = createSupportedProject();
	const component = project.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	if (component?.kind !== 'component') {
		t.fail('expected component resource');
		return;
	}
	component.component.controllers.push(createControllerModel());
	component.component.displayList[0]?.gears.push({
		kind: 'display',
		name: 'visibility',
		controllerName: 'state',
		visibleOnPageIds: ['0'],
	});
	const error = t.throws(
		() => applyUamTransaction(project, [{
			kind: 'updateController',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', controllerName: 'state' },
			controller: { ...createControllerModel(), pages: [{ id: '2', name: 'New' }] },
		}]),
		{ instanceOf: UamTransactionError },
	);
	t.true(error?.issues?.some((issue) => issue.message.includes('Unknown gear page id "0"')) ?? false);
});

test('controller and display gear page changes can commit in one transaction', (t) => {
	const project = createSupportedProject();
	const component = project.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	if (component?.kind !== 'component') {
		t.fail('expected component resource');
		return;
	}
	component.component.controllers.push(createControllerModel());
	component.component.displayList[0]?.gears.push({
		kind: 'display',
		name: 'visibility',
		controllerName: 'state',
		visibleOnPageIds: ['0'],
	});

	const updated = applyUamTransaction(project, [
		{
			kind: 'updateController',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', controllerName: 'state' },
			controller: { ...createControllerModel(), pages: [{ id: '2', name: 'New' }] },
		},
		{
			kind: 'updateGear',
			selector: {
				packageId: 'pkg001',
				componentResourceId: 'cmp001',
				displayNodeId: 'n0',
				kind: 'display',
				controllerName: 'state',
			},
			gear: {
				kind: 'display',
				name: 'visibility',
				controllerName: 'state',
				visibleOnPageIds: ['2'],
			},
		},
	]);
	const updatedComponent = updated.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	const gear = updatedComponent?.kind === 'component'
		? updatedComponent.component.displayList[0]?.gears.find((candidate) => candidate.kind === 'display')
		: null;
	t.deepEqual(gear?.kind === 'display' ? gear.visibleOnPageIds : null, ['2']);
});

test('non-look gear transactions validate references and persist every supported gear kind', async (t) => {
	const seeded = applyUamTransaction(createSupportedProject(), [{
		kind: 'addController',
		selector: { packageId: 'pkg001', componentResourceId: 'cmp001', controllerName: 'state' },
		controller: createControllerModel('state'),
	}]);
	const gears = createNonLookGears();
	const added = applyUamTransaction(seeded, gears.map((gear): UamTransactionOperation => ({
		kind: 'addGear',
		selector: {
			packageId: 'pkg001',
			componentResourceId: 'cmp001',
			displayNodeId: 'n0',
			kind: gear.kind,
			controllerName: 'state',
		},
		gear,
	})));

	const duplicateError = t.throws(
		() => applyUamTransaction(added, [{
			kind: 'addGear',
			selector: {
				packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n0', kind: 'xy', controllerName: 'state',
			},
			gear: createNonLookGears().find((gear) => gear.kind === 'xy')!,
		}]),
		{ instanceOf: UamTransactionError },
	);
	t.true(duplicateError?.issues?.some((issue) => issue.code === 'duplicate_gear_controller') ?? false);

	const invalidPageGear = createNonLookGears().find((gear) => gear.kind === 'text')!;
	if (invalidPageGear.kind !== 'text') {
		t.fail('expected text gear');
		return;
	}
	invalidPageGear.states[0]!.pageId = 'missing';
	const invalidPageError = t.throws(
		() => applyUamTransaction(seeded, [{
			kind: 'addGear',
			selector: {
				packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n0', kind: 'text', controllerName: 'state',
			},
			gear: invalidPageGear,
		}]),
		{ instanceOf: UamTransactionError },
	);
	t.true(invalidPageError?.issues?.some((issue) => issue.code === 'invalid_gear_payload') ?? false);

	const updatedGears = gears.map((gear) => updateNonLookGear(gear));
	const updated = applyUamTransaction(added, updatedGears.map((gear): UamTransactionOperation => ({
		kind: 'updateGear',
		selector: {
			packageId: 'pkg001',
			componentResourceId: 'cmp001',
			displayNodeId: 'n0',
			kind: gear.kind,
			controllerName: 'state',
		},
		gear,
	})));
	const reloaded = await roundTripCommittedProject(updated);
	const reloadedComponent = reloaded.packages[0]!.resources.find((resource) => resource.id === 'cmp001');
	if (reloadedComponent?.kind !== 'component') {
		t.fail('expected reloaded component resource');
		return;
	}
	const reloadedNode = reloadedComponent.component.displayList.find((node) => node.id === 'n0');
	const reloadedGearsByKind = new Map(reloadedNode?.gears.map((gear) => [gear.kind, gear]));
	for (const expected of updatedGears) {
		const actual = reloadedGearsByKind.get(expected.kind);
		t.truthy(actual, `expected ${expected.kind} gear after reload`);
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

	const removed = applyUamTransaction(reloaded, gears.map((gear): UamTransactionOperation => ({
		kind: 'removeGear',
		selector: {
			packageId: 'pkg001',
			componentResourceId: 'cmp001',
			displayNodeId: 'n0',
			kind: gear.kind,
			controllerName: 'state',
		},
	})));
	const removedComponent = removed.packages[0]!.resources.find((resource) => resource.id === 'cmp001');
	if (removedComponent?.kind === 'component') t.is(removedComponent.component.displayList.find((node) => node.id === 'n0')?.gears.length, 0);
});

test('preflight validation rejects invalid controller references without mutating input', (t) => {
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

	t.is(error?.code, 'transaction_unsupported');
	t.true(error?.issues?.some((issue) => (
		issue.code === 'invalid_display_node_selector' && issue.operationKind === 'addController'
	)) ?? false);
	t.deepEqual(project, snapshot);
	t.is(project.packages[0]!.resources[0]!.name, 'background.png');
});

test('updateTransition preflight rejects legacy dangling targets without blocking unrelated edits', async (t) => {
	const project = await readProjectAsUam(new NodeIO(), LAYABOX_PROJECT_PATH);
	const pkg = project.packages.find((candidate) => candidate.id === 'c0hnre6o');
	const component = pkg?.resources.find((resource) => resource.id === 'lvxry');
	if (component?.kind !== 'component') {
		t.fail('expected the LayaBox BOSS component');
		return;
	}
	const transition = component.component.transitions.find((candidate) => candidate.name === 't0');
	if (!transition) {
		t.fail('expected the LayaBox BOSS transition');
		return;
	}

	const operation: UamTransactionOperation = {
		kind: 'updateTransition',
		opId: 'update-legacy-boss-transition',
		selector: { packageId: pkg.id, componentResourceId: component.id, transitionName: transition.name },
		transition: {
			...structuredClone(transition),
			items: transition.items.map((item, index) => index === 0 ? { ...item, label: 'preflight-check' } : item),
		},
	};
	const issues = validateTransactionSupport(project, [operation]);
	t.true(issues.some((issue) => (
		issue.code === 'invalid_display_node_selector'
		&& issue.operationKind === 'updateTransition'
		&& issue.path === 'operations[0].transition.items[2].targetNodeId'
	)));

	const snapshot = structuredClone(project);
	const error = t.throws(
		() => applyUamTransaction(project, [operation]),
		{ instanceOf: UamTransactionError },
	);
	t.is(error?.code, 'transaction_unsupported');
	t.true(error?.issues?.some((issue) => issue.code === 'invalid_display_node_selector') ?? false);
	t.deepEqual(project, snapshot);

	const unrelated = applyUamTransaction(project, [{
		kind: 'setDisplayNodeProps',
		selector: { packageId: pkg.id, componentResourceId: component.id, displayNodeId: 'n4' },
		props: { alpha: 0.9 },
	}]);
	const unrelatedComponent = unrelated.packages
		.find((candidate) => candidate.id === pkg.id)
		?.resources.find((resource) => resource.id === component.id);
	if (unrelatedComponent?.kind !== 'component') {
		t.fail('expected the updated LayaBox BOSS component');
		return;
	}
	t.is(unrelatedComponent.component.displayList.find((node) => node.id === 'n4')?.alpha, 0.9);
});
