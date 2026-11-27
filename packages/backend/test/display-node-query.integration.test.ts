import assert from 'node:assert/strict';
import test from 'ava';
import { Document, GearType, RelationType } from '@openfairygui/core';
import { liftDocumentToUamProject, normalizeUamProject } from '@openfairygui/core/uam';
import {
	BACKEND_DISPLAY_NODE_FILTER_FIELDS,
	BACKEND_DISPLAY_NODE_QUERY_LIMITS,
	BackendRuntime,
	type QueryDisplayNodesInput,
} from '../src/index.js';
import { createBackendFixtureProject } from './helpers.js';

function createRichDisplayNodeQueryProject() {
	const doc = new Document();
	doc.getRoot().setProjectId('display-node-query').setProjectType(0).setVersion('3.0');
	const pkg = doc.createPackage('Main').setId('pkg001');
	pkg.addResource(doc.createImageResource('bg.png').setId('img001').setPath('/images/').setWidth(120).setHeight(40));
	pkg.addResource(doc.createComponent('SubButton').setId('sub001').setPath('/widgets/').setSize(80, 32));
	const component = doc.createComponent('MainView').setId('cmp001').setPath('/').setSize(640, 360);

	const ctrl = doc.createController('state');
	ctrl.addPage(doc.createControllerPage('0').setName('Normal'));
	ctrl.addPage(doc.createControllerPage('1').setName('Active'));
	component.addController(ctrl);

	const groupNode = doc.createGGroup('headerGroup').setId('grp0').setXY(0, 0).setSize(300, 60);

	const distractorTitle = doc
		.createGTextField('title')
		.setId('n_distractor')
		.setXY(10, 10)
		.setSize(180, 30)
		.setText('Distractor Title')
		.setGroup('grp0')
		.setVisible(false)
		.setLocked(true)
		.setTouchable(false);

	const targetTitle = doc
		.createGTextField('title')
		.setId('n_target')
		.setXY(20, 48)
		.setSize(220, 36)
		.setText('Hello OpenFairyGUI')
		.setGroup('grp0');
	const gear = doc.createGear('gearDisplay').setGearType(GearType.Display);
	gear.setController(ctrl).setPages('0,1');
	targetTitle.addGear(gear);
	targetTitle.setRelations([{ target: '', type: RelationType.Center_Center, usePercent: false }]);

	const rich = doc
		.createGRichTextField('richCopy')
		.setId('n_rich')
		.setXY(20, 90)
		.setSize(200, 30)
		.setText('Rich <b>copy</b>');

	const inputNode = doc.createGTextInput('userInput').setId('n_input').setXY(20, 130).setSize(200, 30).setText('');

	const imgNode = doc
		.createGImage('banner')
		.setId('n_img')
		.setSrc('img001')
		.setXY(0, 0)
		.setSize(120, 40)
		.setGroup('grp0');

	const btnComp = doc
		.createGComponent('confirmBtn')
		.setId('n_btn_comp')
		.setSrc('sub001')
		.setXY(20, 170)
		.setSize(80, 32)
		.setInstanceExtType('Button')
		.setInstanceTitle('Confirm');

	const pbComp = doc
		.createGComponent('loadingBar')
		.setId('n_pb_comp')
		.setSrc('sub001')
		.setXY(120, 170)
		.setSize(100, 16)
		.setInstanceExtType('ProgressBar')
		.setInstanceValue(50)
		.setInstanceMax(100);

	const derivedBtn = doc
		.createGButton('cancelBtn')
		.setId('n_derived_btn')
		.setSrc('sub001')
		.setPackageId('pkg001')
		.setTitle('Cancel')
		.setXY(240, 170)
		.setSize(80, 32);

	const listNode = doc.createGList('items').setId('n_list').setSrc('sub001').setXY(20, 220).setSize(200, 100);

	const loaderNode = doc
		.createGLoader('iconLoader')
		.setId('n_loader')
		.setUrl('ui://pkg001/img001')
		.setXY(240, 220)
		.setSize(48, 48);

	const loader3DNode = doc
		.createGLoader3D('heroSpine')
		.setId('n_loader3d')
		.setUrl('ui://pkg001/spine001')
		.setXY(300, 220)
		.setSize(64, 64);

	for (const child of [
		groupNode,
		distractorTitle,
		targetTitle,
		rich,
		inputNode,
		imgNode,
		btnComp,
		pbComp,
		derivedBtn,
		listNode,
		loaderNode,
		loader3DNode,
	]) {
		component.addChild(child);
	}
	pkg.addResource(component);
	return normalizeUamProject(liftDocumentToUamProject(doc));
}

const componentSelector = { packageId: 'pkg001', componentResourceId: 'cmp001' } as const;

test('queryDisplayNodes filters by every modeled property, preserves displayList order, and advertises capabilities', async (t) => {
	const project = createRichDisplayNodeQueryProject();
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({ project });
	assert(opened.ok);
	const sessionId = opened.data.sessionId;
	t.teardown(() => runtime.closeSession({ sessionId }).then(() => undefined));

	t.deepEqual(opened.data.capabilities.read.displayNodeQuery, {
		scope: 'component',
		filterFields: BACKEND_DISPLAY_NODE_FILTER_FIELDS,
		projection: 'summary',
		sourceBytes: false,
		limits: BACKEND_DISPLAY_NODE_QUERY_LIMITS,
	});

	const all = runtime.queryDisplayNodes({ sessionId, selector: componentSelector });
	assert(all.ok);
	t.is(all.data.revision, 0);
	t.is(all.meta.revision, 0);
	t.is(all.data.totalMatched, 12);
	t.false(all.data.truncated);
	t.deepEqual(
		all.data.nodes.map((node) => [node.index, node.id, node.kind]),
		[
			[0, 'grp0', 'group'],
			[1, 'n_distractor', 'text'],
			[2, 'n_target', 'text'],
			[3, 'n_rich', 'richText'],
			[4, 'n_input', 'textInput'],
			[5, 'n_img', 'image'],
			[6, 'n_btn_comp', 'component'],
			[7, 'n_pb_comp', 'component'],
			[8, 'n_derived_btn', 'button'],
			[9, 'n_list', 'list'],
			[10, 'n_loader', 'loader'],
			[11, 'n_loader3d', 'loader3D'],
		],
	);

	const emptyFilter = runtime.queryDisplayNodes({ sessionId, selector: componentSelector, filter: {} });
	assert(emptyFilter.ok);
	t.is(emptyFilter.data.totalMatched, 12);

	const exactTarget = runtime.queryDisplayNodes({
		sessionId,
		selector: componentSelector,
		filter: { kind: 'text', name: 'title', text: 'Hello OpenFairyGUI' },
	});
	assert(exactTarget.ok);
	t.is(exactTarget.data.totalMatched, 1);
	t.false(exactTarget.data.truncated);
	t.deepEqual(exactTarget.data.nodes, [
		{
			id: 'n_target',
			name: 'title',
			kind: 'text',
			index: 2,
			position: { x: 20, y: 48 },
			size: { width: 220, height: 36 },
			visible: true,
			locked: false,
			touchable: true,
			group: 'grp0',
			text: 'Hello OpenFairyGUI',
			gearCount: 1,
			relationCount: 1,
		},
	]);

	const idsOf = (filter: NonNullable<QueryDisplayNodesInput['filter']>) => {
		const res = runtime.queryDisplayNodes({ sessionId, selector: componentSelector, filter });
		assert(res.ok, JSON.stringify(res));
		return res.data.nodes.map((node) => node.id);
	};

	t.deepEqual(idsOf({ name: 'title' }), ['n_distractor', 'n_target']);
	t.deepEqual(idsOf({ nameContains: 'Btn' }), ['n_btn_comp', 'n_derived_btn']);
	t.deepEqual(idsOf({ text: '' }), ['n_input']);
	t.deepEqual(idsOf({ textContains: 'copy' }), ['n_rich']);
	t.deepEqual(idsOf({ title: 'Confirm' }), ['n_btn_comp']);
	t.deepEqual(idsOf({ title: 'Cancel' }), ['n_derived_btn']);
	t.deepEqual(idsOf({ titleContains: 'onf' }), ['n_btn_comp']);
	t.deepEqual(idsOf({ group: 'grp0' }), ['n_distractor', 'n_target', 'n_img']);
	t.deepEqual(idsOf({ group: '', kind: 'richText' }), ['n_rich']);
	t.deepEqual(idsOf({ group: '', kind: 'loader' }), []);
	t.deepEqual(idsOf({ resourceId: 'img001' }), ['n_img']);
	t.deepEqual(idsOf({ resourceId: 'sub001' }), ['n_btn_comp', 'n_pb_comp', 'n_derived_btn', 'n_list']);
	t.deepEqual(idsOf({ url: 'ui://pkg001/img001' }), ['n_loader']);
	t.deepEqual(idsOf({ url: 'ui://pkg001/spine001' }), ['n_loader3d']);
	t.deepEqual(idsOf({ visible: false }), ['n_distractor']);
	t.deepEqual(idsOf({ locked: true }), ['n_distractor']);
	t.deepEqual(idsOf({ touchable: false }), ['n_distractor']);
	t.deepEqual(idsOf({ hasGears: true }), ['n_target']);
	t.deepEqual(idsOf({ hasRelations: true }), ['n_target']);
	t.deepEqual(idsOf({ kind: 'text', hasGears: false, hasRelations: false }), ['n_distractor']);
	t.deepEqual(idsOf({ name: 'does-not-exist' }), []);

	const resourceNodes = runtime.queryDisplayNodes({
		sessionId,
		selector: componentSelector,
		filter: { resourceId: 'sub001' },
	});
	assert(resourceNodes.ok);
	t.deepEqual(resourceNodes.data.nodes.find((node) => node.id === 'n_derived_btn')?.resource, {
		packageId: 'pkg001',
		resourceId: 'sub001',
	});
	t.deepEqual(resourceNodes.data.nodes.find((node) => node.id === 'n_list')?.resource, {
		resourceId: 'sub001',
	});
});

test('queryDisplayNodes enforces limit truncation and UTF-8 / non-JSON budgets without silent field truncation', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('limit-test').setProjectType(0).setVersion('3.0');
	const pkg = doc.createPackage('Main').setId('pkg001');
	const component = doc.createComponent('Many').setId('cmp001').setPath('/').setSize(400, 400);
	for (let index = 0; index < 55; index += 1) {
		component.addChild(
			doc
				.createGTextField(`item_${index}`)
				.setId(`n_${index}`)
				.setXY(0, index * 10)
				.setSize(100, 10)
				.setText(`Label ${index}`),
		);
	}
	pkg.addResource(component);
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({ project: normalizeUamProject(liftDocumentToUamProject(doc)) });
	assert(opened.ok);
	const sessionId = opened.data.sessionId;
	t.teardown(() => runtime.closeSession({ sessionId }).then(() => undefined));

	const defaultLimited = runtime.queryDisplayNodes({ sessionId, selector: componentSelector });
	assert(defaultLimited.ok);
	t.is(defaultLimited.data.totalMatched, 55);
	t.is(defaultLimited.data.nodes.length, 50);
	t.true(defaultLimited.data.truncated);

	const smallLimit = runtime.queryDisplayNodes({ sessionId, selector: componentSelector, limit: 2 });
	assert(smallLimit.ok);
	t.is(smallLimit.data.totalMatched, 55);
	t.is(smallLimit.data.nodes.length, 2);
	t.true(smallLimit.data.truncated);
	t.deepEqual(
		smallLimit.data.nodes.map((node) => [node.index, node.id]),
		[
			[0, 'n_0'],
			[1, 'n_1'],
		],
	);

	const fullLimit = runtime.queryDisplayNodes({ sessionId, selector: componentSelector, limit: 60 });
	assert(fullLimit.ok);
	t.is(fullLimit.data.totalMatched, 55);
	t.is(fullLimit.data.nodes.length, 55);
	t.false(fullLimit.data.truncated);

	for (const [badValue, reason] of [
		['你'.repeat(100_000), 'response_budget_exceeded'],
		[new Uint8Array([1, 2, 3]), 'non_json_value'],
	] as const) {
		const budgetProject = createBackendFixtureProject();
		const comp = budgetProject.packages[0]!.resources[1]!;
		assert(comp.kind === 'component');
		const textNode = comp.component.displayList[1]!;
		assert(textNode.kind === 'text');
		textNode.text = badValue as unknown as string;
		const budgetRuntime = new BackendRuntime();
		const budgetOpened = budgetRuntime.openProjectSession({ project: budgetProject });
		assert(budgetOpened.ok);
		const res = budgetRuntime.queryDisplayNodes({
			sessionId: budgetOpened.data.sessionId,
			selector: componentSelector,
		});
		assert(!res.ok && res.error.code === 'entity_query_failed');
		t.is(res.error.reason, reason);
		t.false('data' in res);
		await budgetRuntime.closeSession({ sessionId: budgetOpened.data.sessionId });
	}
});

test('queryDisplayNodes validates inputs strictly, detaches responses, and tracks dirty revisions without side effects', async (t) => {
	const project = createBackendFixtureProject();
	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({ project });
	assert(opened.ok);
	const sessionId = opened.data.sessionId;
	t.teardown(() => runtime.closeSession({ sessionId }).then(() => undefined));

	const missingSession = runtime.queryDisplayNodes({ sessionId: 'missing', selector: componentSelector });
	assert(!missingSession.ok && missingSession.error.code === 'session_not_found');

	const invalidInputs: unknown[] = [
		{ sessionId, selector: componentSelector, extra: true },
		{ sessionId, selector: { packageId: 'pkg001' } },
		{ sessionId, selector: { packageId: '', componentResourceId: 'cmp001' } },
		{ sessionId, selector: { packageId: 'pkg001', componentResourceId: 'x'.repeat(257) } },
		{ sessionId, selector: componentSelector, limit: 0 },
		{ sessionId, selector: componentSelector, limit: 201 },
		{ sessionId, selector: componentSelector, limit: 1.5 },
		{ sessionId, selector: componentSelector, filter: [] },
		{ sessionId, selector: componentSelector, filter: { unknownField: 'x' } },
		{ sessionId, selector: componentSelector, filter: { kind: 'notAKind' } },
		{ sessionId, selector: componentSelector, filter: { name: 'x'.repeat(1025) } },
		{ sessionId, selector: componentSelector, filter: { nameContains: '' } },
		{ sessionId, selector: componentSelector, filter: { textContains: '' } },
		{ sessionId, selector: componentSelector, filter: { titleContains: '' } },
		{ sessionId, selector: componentSelector, filter: { resourceId: '' } },
		{ sessionId, selector: componentSelector, filter: { resourceId: 'x'.repeat(257) } },
		{ sessionId, selector: componentSelector, filter: { visible: 'true' } },
	];
	for (const input of invalidInputs) {
		const res = runtime.queryDisplayNodes(input as QueryDisplayNodesInput);
		assert(!res.ok && res.error.code === 'entity_query_failed', JSON.stringify(input));
		t.is(res.error.reason, 'invalid_query', JSON.stringify(input));
	}

	for (const selector of [
		{ packageId: 'missing', componentResourceId: 'cmp001' },
		{ packageId: 'pkg001', componentResourceId: 'missing' },
		{ packageId: 'pkg001', componentResourceId: 'img001' },
	]) {
		const res = runtime.queryDisplayNodes({ sessionId, selector });
		assert(!res.ok && res.error.code === 'entity_query_failed');
		t.is(res.error.reason, 'not_found');
	}

	const dupPkgProject = createBackendFixtureProject();
	dupPkgProject.packages.push(structuredClone(dupPkgProject.packages[0]!));
	const dupPkgRuntime = new BackendRuntime();
	const dupPkgOpened = dupPkgRuntime.openProjectSession({ project: dupPkgProject });
	assert(dupPkgOpened.ok);
	const dupPkgRes = dupPkgRuntime.queryDisplayNodes({
		sessionId: dupPkgOpened.data.sessionId,
		selector: componentSelector,
	});
	assert(!dupPkgRes.ok && dupPkgRes.error.code === 'entity_query_failed');
	t.is(dupPkgRes.error.reason, 'ambiguous');
	await dupPkgRuntime.closeSession({ sessionId: dupPkgOpened.data.sessionId });

	const dupCompProject = createBackendFixtureProject();
	dupCompProject.packages[0]!.resources.push(structuredClone(dupCompProject.packages[0]!.resources[1]!));
	const dupCompRuntime = new BackendRuntime();
	const dupCompOpened = dupCompRuntime.openProjectSession({ project: dupCompProject });
	assert(dupCompOpened.ok);
	const dupCompRes = dupCompRuntime.queryDisplayNodes({
		sessionId: dupCompOpened.data.sessionId,
		selector: componentSelector,
	});
	assert(!dupCompRes.ok && dupCompRes.error.code === 'entity_query_failed');
	t.is(dupCompRes.error.reason, 'ambiguous');
	await dupCompRuntime.closeSession({ sessionId: dupCompOpened.data.sessionId });

	const queried = runtime.queryDisplayNodes({
		sessionId,
		selector: componentSelector,
		filter: { kind: 'text', name: 'title' },
	});
	assert(queried.ok);
	queried.data.selector.packageId = 'mutated';
	queried.data.nodes[0]!.position.x = 9999;

	const applied = await runtime.applyTransaction({
		sessionId,
		expectedRevision: queried.data.revision,
		operations: [
			{
				kind: 'setDisplayNodeProps',
				selector: {
					packageId: 'pkg001',
					componentResourceId: 'cmp001',
					displayNodeId: queried.data.nodes[0]!.id,
				},
				props: { text: 'Updated Heading' },
			},
		],
	});
	assert(applied.ok);
	const afterEdit = runtime.queryDisplayNodes({
		sessionId,
		selector: componentSelector,
		filter: { kind: 'text', text: 'Updated Heading' },
	});
	assert(afterEdit.ok);
	t.is(afterEdit.data.revision, 1);
	t.is(afterEdit.data.nodes.length, 1);
	t.is(afterEdit.data.nodes[0]?.id, 'n1');
	t.not(afterEdit.data.nodes[0]?.position.x, 9999);
});
