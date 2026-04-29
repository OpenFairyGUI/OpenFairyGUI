import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
	assertValidUamProject,
	Document,
	normalizeUamProject,
	type UamProject,
} from '../src/index.js';
import { NodeIO } from '../src/node.js';
import { liftDocumentToUamProject, materializeUamProject, readProjectAsUam, writeProjectFromUam } from '../src/uam/index.js';

function createEngineeringScaleUamProject(): UamProject {
	return normalizeUamProject({
		projectId: 'uam-gate-a',
		projectType: 0,
		version: '3.0',
		branches: [],
		settings: {
			publish: {
				binaryFormat: true,
				fileExtension: 'bytes',
				compressDesc: false,
			},
			common: {},
			adaptation: {},
		},
		packages: [
			{
				id: 'pkg001',
				name: 'Main',
				publish: {
					name: 'Main',
					path: 'dist/main',
					branchPath: '',
					packageCount: 1,
					genCode: false,
					codePath: '',
				},
				resources: [
					{
						kind: 'image',
						id: 'img001',
						name: 'background.png',
						path: '/',
						exported: true,
						branch: '',
						branchItemIds: [],
						fileName: 'background.png',
						dimensions: { width: 320, height: 180 },
						metadata: {
							textureSetMode: 'atlas',
						},
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
							customData: 'uam-owned',
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
									gears: [
										{
											kind: 'look',
											name: 'bg-look',
											controllerName: 'state',
											states: [
												{ pageId: '0', value: { alpha: 1, rotation: 0, grayed: false, touchable: true } },
												{ pageId: '1', value: { alpha: 0.5, rotation: 180, grayed: true, touchable: false } },
											],
											defaultValue: { alpha: 1, rotation: 0, grayed: false, touchable: true },
											condition: '',
											positionsInPercent: false,
											tween: true,
											tweenDuration: 0.5,
											tweenDelay: 0,
											easeType: 5,
											customEasePath: '',
										},
									],
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
									relations: [
										{
											targetNodeId: 'n0',
											type: 0,
											usePercent: false,
										},
									],
									gears: [],
									text: 'Unified Authoring Model',
									font: '',
									fontSize: 18,
									color: '#ffffff',
								},
							],
							controllers: [
								{
									name: 'state',
									selectedIndex: 1,
									autoRadioGroupDepth: false,
									pages: [
										{ id: '0', name: 'Idle' },
										{ id: '1', name: 'Alert' },
									],
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
											controllerName: 'nested',
											targetPage: '~1',
										},
									],
								},
							],
							transitions: [
								{
									name: 'intro',
									autoPlay: true,
									autoPlayTimes: 2,
									autoPlayDelay: 0.25,
									options: 3,
									fps: 30,
									items: [
										{
											name: 'move',
											time: 3,
											actionType: 0,
											targetNodeId: 'n0',
											tween: true,
											duration: 12,
											startValue: [0, 0],
											endValue: [120, 40],
											easeType: 5,
											repeat: 1,
											yoyo: true,
											label: 'start',
											endLabel: 'end',
											path: '',
											customEasePath: '',
										},
									],
								},
							],
						},
					},
				],
			},
		],
	} as UamProject);
}

test('Gate A proves one engineering-scale UAM-owned project read/write path', async (t) => {
	const io = new NodeIO();
	const project = createEngineeringScaleUamProject();
	assertValidUamProject(project);

	const doc = materializeUamProject(project);
	const lifted = liftDocumentToUamProject(doc);
	t.is(lifted.packages[0]?.resources[1]?.kind, 'component');

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-uam-gate-a-'));
	const outFairy = path.join(tmpDir, 'out.fairy');
	try {
		await writeProjectFromUam(io, project, outFairy);
		const roundTripped = await readProjectAsUam(io, outFairy);

		t.is(roundTripped.projectId, project.projectId);
		t.is(roundTripped.packages[0]?.id, 'pkg001');
		const imageResource = roundTripped.packages[0]?.resources.find((resource) => resource.id === 'img001');
		t.is(imageResource?.kind, 'image');
		const componentResource = roundTripped.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
		t.is(componentResource?.kind, 'component');
		if (componentResource?.kind !== 'component') {
			t.fail('component resource should survive round-trip');
			return;
		}

		t.is(componentResource.component.size.width, 320);
		t.is(componentResource.component.displayList.length, 2);
		t.is(componentResource.component.controllers[0]?.name, 'state');
		t.is(componentResource.component.controllers[0]?.pages[1]?.name, 'Alert');
		t.is(componentResource.component.transitions[0]?.name, 'intro');
		t.is(componentResource.component.transitions[0]?.items[0]?.targetNodeId, 'n0');

		const lookGear = componentResource.component.displayList[0]?.gears[0];
		t.is(lookGear?.kind, 'look');
		if (lookGear?.kind === 'look') {
			t.is(lookGear.controllerName, 'state');
			t.is(lookGear.states[1]?.pageId, '1');
			t.true(Math.abs((lookGear.states[1]?.value?.alpha ?? 0) - 0.5) < 1e-6);
			t.true(lookGear.states[1]?.value?.grayed ?? false);
			t.false(lookGear.states[1]?.value?.touchable ?? true);
			t.true(lookGear.tween);
			t.true(Math.abs(lookGear.tweenDuration - 0.5) < 1e-6);
		}
		const titleNode = componentResource.component.displayList.find((node) => node.id === 'n1');
		t.is(titleNode?.relations[0]?.targetNodeId, 'n0');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('liftDocumentToUamProject reports remaining unsupported real display node types explicitly', (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('RealProjectShapes').setId('pkg-real');
	const component = doc.createComponent('ButtonHost')
		.setId('cmp-button-host')
		.setPath('/')
		.setExported(true)
		.setSize(320, 180);
	const button = doc.createGButton('button').setId('button-node');
	component.addChild(button);
	pkg.addResource(component);

	const error = t.throws(() => liftDocumentToUamProject(doc), { instanceOf: Error });
	t.is(error?.message, 'UAM lift does not support display node type "GButton" in Gate A.');
});

test('liftDocumentToUamProject preserves component reference display nodes', (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('ComponentRefs').setId('pkg-component-refs');
	const childComponent = doc.createComponent('Child')
		.setId('child-component')
		.setPath('/')
		.setExported(true)
		.setSize(40, 30);
	const hostComponent = doc.createComponent('Host')
		.setId('host-component')
		.setPath('/')
		.setExported(true)
		.setSize(320, 180);
	const childRef = doc.createGComponent('childRef')
		.setId('child-ref-node')
		.setXY(12, 18)
		.setSize(40, 30)
		.setSrc('child-component')
		.setPackageId('pkg-component-refs')
		.setCustomData('ref-data');
	hostComponent.addChild(childRef);
	pkg.addResource(childComponent);
	pkg.addResource(hostComponent);

	const lifted = liftDocumentToUamProject(doc);
	const host = lifted.packages[0]?.resources.find((resource) => resource.id === 'host-component');
	t.is(host?.kind, 'component');
	if (host?.kind !== 'component') return;
	const node = host.component.displayList[0];
	t.is(node?.kind, 'component');
	if (node?.kind !== 'component') return;
	t.deepEqual(node.resource, { packageId: 'pkg-component-refs', resourceId: 'child-component' });
	t.is(node.customData, 'ref-data');
});

test('UAM project lift and materialize preserve list, tree, graph, group, loader, and movie clip display nodes', (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('DisplayNodes').setId('pkg-display-nodes');
	const component = doc.createComponent('Host')
		.setId('host-component')
		.setPath('/')
		.setExported(true)
		.setSize(640, 480);
	pkg.addResource(doc.createMovieClipResource('movie.xml')
		.setId('movie-resource')
		.setPath('/')
		.setFileName('movie.xml')
		.setWidth(96)
		.setHeight(72));

	component.addChild(doc.createGList('items')
		.setId('list-node')
		.setXY(1, 2)
		.setSize(100, 120)
		.setLayout(2)
		.setDefaultItem('ui://pkg-display-nodes/item')
		.setListItems([{ title: 'Item', icon: null, url: null, name: 'item0', selectedTitle: null, selectedIcon: null, level: 0, isFolder: null }]));
	component.addChild(doc.createGTree('tree')
		.setId('tree-node')
		.setXY(3, 4)
		.setSize(110, 130)
		.setIndent(24)
		.setClickToExpand(1)
		.setListItems([{ title: 'Folder', icon: null, url: null, name: 'folder0', selectedTitle: null, selectedIcon: null, level: 0, isFolder: true }]));
	component.addChild(doc.createGGraph('shape')
		.setId('graph-node')
		.setXY(5, 6)
		.setSize(20, 30)
		.setGraphType(1)
		.setLineColor('#112233')
		.setFillColor('#445566')
		.setCornerRadius([1, 2, 3, 4]));
	component.addChild(doc.createGGroup('group')
		.setId('group-node')
		.setXY(7, 8)
		.setSize(200, 40)
		.setLayout(1)
		.setAdvanced(true));
	component.addChild(doc.createGLoader('loader')
		.setId('loader-node')
		.setXY(9, 10)
		.setSize(64, 64)
		.setUrl('ui://pkg-display-nodes/image')
		.setColor('#abcdef')
		.setFillAmount(75));
	component.addChild(doc.createGLoader3D('loader3d')
		.setId('loader3d-node')
		.setXY(11, 12)
		.setSize(80, 90)
		.setUrl('ui://pkg-display-nodes/spine')
		.setAnimationName('idle')
		.setSkinName('default')
		.setLoop(false));
	component.addChild(doc.createGMovieClip('movie')
		.setId('movie-node')
		.setXY(13, 14)
		.setSize(96, 72)
		.setSrc('movie-resource')
		.setPackageId('pkg-display-nodes')
		.setFileName('movie.xml')
		.setPlaying(false)
		.setFrame(3)
		.setColor('#123456'));
	component.addChild(doc.createGRichTextField('rich')
		.setId('rich-text-node')
		.setXY(15, 16)
		.setSize(140, 30)
		.setText('[b]Rich[/b]')
		.setFontSize(16)
		.setColor('#654321'));
	component.addChild(doc.createGTextInput('input')
		.setId('text-input-node')
		.setXY(17, 18)
		.setSize(160, 32)
		.setText('typed')
		.setPromptText('prompt')
		.setMaxLength(12)
		.setRestrict('0-9')
		.setPassword(true)
		.setKeyboardType(2));
	pkg.addResource(component);

	const lifted = liftDocumentToUamProject(doc);
	const rematerialized = liftDocumentToUamProject(materializeUamProject(lifted));
	const host = rematerialized.packages[0]?.resources.find((resource) => resource.id === 'host-component');
	t.is(host?.kind, 'component');
	if (host?.kind !== 'component') return;

	const nodes = new Map(host.component.displayList.map((node) => [node.id, node]));
	t.is(nodes.get('list-node')?.kind, 'list');
	t.is(nodes.get('tree-node')?.kind, 'tree');
	t.is(nodes.get('graph-node')?.kind, 'graph');
	t.is(nodes.get('group-node')?.kind, 'group');
	t.is(nodes.get('loader-node')?.kind, 'loader');
	t.is(nodes.get('loader3d-node')?.kind, 'loader3D');
	t.is(nodes.get('movie-node')?.kind, 'movieClip');
	t.is(nodes.get('rich-text-node')?.kind, 'richText');
	t.is(nodes.get('text-input-node')?.kind, 'textInput');
	const listNode = nodes.get('list-node');
	if (listNode?.kind === 'list') t.is(listNode.listItems[0]?.title, 'Item');
	const treeNode = nodes.get('tree-node');
	if (treeNode?.kind === 'tree') t.is(treeNode.indent, 24);
	const graphNode = nodes.get('graph-node');
	if (graphNode?.kind === 'graph') t.deepEqual(graphNode.cornerRadius, [1, 2, 3, 4]);
	const loaderNode = nodes.get('loader-node');
	if (loaderNode?.kind === 'loader') t.is(loaderNode.fillAmount, 75);
	const loader3DNode = nodes.get('loader3d-node');
	if (loader3DNode?.kind === 'loader3D') t.false(loader3DNode.loop);
	const movieNode = nodes.get('movie-node');
	if (movieNode?.kind === 'movieClip') {
		t.is(movieNode.resource.resourceId, 'movie-resource');
		t.false(movieNode.playing);
		t.is(movieNode.frame, 3);
	}
	const inputNode = nodes.get('text-input-node');
	if (inputNode?.kind === 'textInput') {
		t.is(inputNode.promptText, 'prompt');
		t.true(inputNode.password);
	}
});
