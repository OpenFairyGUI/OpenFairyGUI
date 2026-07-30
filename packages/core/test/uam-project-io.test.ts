import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getFixtureProjectPath } from '@openfairygui/test-utils';
import {
	assertValidUamProject,
	Document,
	GearType,
	normalizeUamProject,
	RelationType,
	UAM_SUPPORTED_MATERIALIZATION_SCOPE,
	validateUamProject,
	type UamProject,
} from '../src/index.js';
import { NodeIO } from '../src/node.js';
import { liftDocumentToUamProject, materializeUamProject, readProjectAsUam, writeProjectFromUam } from '../src/uam/index.js';

const LAYABOX_PROJECT_PATH = getFixtureProjectPath(
	'FairyGUI-layabox',
	'demo/UIProject/FairyGUI-layabox-demo.fairy',
);
const MOTION_PATH = '0,0,0,0,120,40';
const CUSTOM_EASE_PATH = '2,0,0,0.07,0.5575,0.8925,0.41,1,0,1,1';

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
						favorite: false,
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
						favorite: false,
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
											easeType: 31,
											repeat: 1,
											yoyo: true,
											label: 'start',
											endLabel: 'end',
											path: MOTION_PATH,
											customEasePath: CUSTOM_EASE_PATH,
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
		const componentXml = await fs.readFile(path.join(tmpDir, 'assets', 'Main', 'MainView.xml'), 'utf-8');
		t.true(componentXml.includes('ease="Custom"'));
		t.true(componentXml.includes(`customEase="${CUSTOM_EASE_PATH}"`));
		t.true(componentXml.includes(`path="${MOTION_PATH}"`));

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
		t.is(componentResource.component.transitions[0]?.items[0]?.easeType, 31);
		t.is(componentResource.component.transitions[0]?.items[0]?.path, MOTION_PATH);
		t.is(componentResource.component.transitions[0]?.items[0]?.customEasePath, CUSTOM_EASE_PATH);

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

test('real LayaBox UIProject lift produces a materializable save baseline', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject(LAYABOX_PROJECT_PATH);
	const project = normalizeUamProject(liftDocumentToUamProject(doc));

	t.deepEqual(validateUamProject(project), []);
	t.notThrows(() => materializeUamProject(project));
});

test('UAM materialization scope covers every current concrete display node kind', (t) => {
	t.deepEqual([...UAM_SUPPORTED_MATERIALIZATION_SCOPE.nodeKinds].sort(), [
		'button',
		'comboBox',
		'component',
		'graph',
		'group',
		'image',
		'label',
		'list',
		'loader',
		'loader3D',
		'movieClip',
		'progressBar',
		'richText',
		'scrollBar',
		'slider',
		'text',
		'textInput',
		'tree',
	].sort());
});

test('UAM project lift and materialize preserve component-derived control display nodes', (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('ControlShapes').setId('pkg-controls');
	const component = doc.createComponent('ControlHost')
		.setId('cmp-control-host')
		.setPath('/')
		.setExported(true)
		.setSize(480, 320);
	const controller = doc.createController('control-state');
	controller.addPage(doc.createControllerPage('Idle').setId('idle'));
	controller.addPage(doc.createControllerPage('Active').setId('active'));
	component.addController(controller);
	const buttonControl = doc.createGButton('button')
		.setId('button-node')
		.setXY(1, 2)
		.setSize(80, 24)
		.setVisible(false)
		.setTouchable(false)
		.setGrayed(true)
		.setAlpha(0.42)
		.setRotation(15)
		.setCustomData('button-data')
		.setRelations([{ target: 'label-node', type: RelationType.Left_Left, usePercent: true }])
		.setSrc('button-src')
		.setPackageId('pkg-controls')
		.setTitle('Play')
		.setIcon('play-icon')
		.setSelectedTitle('Playing')
		.setSelectedIcon('pause-icon')
		.setTitleColor('#112233')
		.setTitleFontSize(14)
		.setSound('click')
		.setSoundVolumeScale(0.5)
		.setMode(2)
		.setDownEffect(1)
		.setDownEffectValue(0.25);
	buttonControl.addGear(doc.createGear('button-look')
		.setGearType(GearType.Look)
		.setController(controller)
		.setPages('idle,active')
		.setValues('1,0,false,true|0.5,15,true,false')
		.setDefaultValue('1,0,false,true')
		.setTween(true)
		.setTweenDuration(0.2));
	component.addChild(buttonControl);
	component.addChild(doc.createGLabel('label')
		.setId('label-node')
		.setXY(3, 4)
		.setSize(90, 26)
		.setSrc('label-src')
		.setPackageId('pkg-controls')
		.setTitle('Name')
		.setIcon('label-icon')
		.setTitleColor('#445566')
		.setTitleFontSize(16)
		.setSound('label-sound')
		.setSoundVolumeScale(0.75));
	component.addChild(doc.createGComboBox('combo')
		.setId('combo-node')
		.setXY(5, 6)
		.setSize(120, 30)
		.setSrc('combo-src')
		.setPackageId('pkg-controls')
		.setTitle('Two')
		.setIcon('combo-icon')
		.setTitleColor('#778899')
		.setTitleFontSize(12)
		.setItems(['One', 'Two'])
		.setIcons(['one-icon', 'two-icon'])
		.setValues(['1', '2'])
		.setSelectedIndex(1)
		.setVisibleItemCount(8)
		.setPopupDirection(2)
		.setSound('combo-sound')
		.setSoundVolumeScale(0.9));
	component.addChild(doc.createGProgressBar('progress')
		.setId('progress-node')
		.setXY(7, 8)
		.setSize(140, 20)
		.setSrc('progress-src')
		.setPackageId('pkg-controls')
		.setTitleType(3)
		.setMin(10)
		.setMax(200)
		.setValue(120)
		.setReverse(true)
		.setSound('progress-sound')
		.setSoundVolumeScale(0.6));
	component.addChild(doc.createGSlider('slider')
		.setId('slider-node')
		.setXY(9, 10)
		.setSize(160, 22)
		.setSrc('slider-src')
		.setPackageId('pkg-controls')
		.setTitleType(2)
		.setMin(1)
		.setMax(10)
		.setValue(7)
		.setWholeNumbers(true));
	component.addChild(doc.createGScrollBar('scroll')
		.setId('scroll-node')
		.setXY(11, 12)
		.setSize(16, 100)
		.setSrc('scroll-src')
		.setPackageId('pkg-controls')
		.setFixedGripSize(true));
	pkg.addResource(component);

	const lifted = liftDocumentToUamProject(doc);
	const rematerialized = liftDocumentToUamProject(materializeUamProject(lifted));
	const host = rematerialized.packages[0]?.resources.find((resource) => resource.id === 'cmp-control-host');
	t.is(host?.kind, 'component');
	if (host?.kind !== 'component') return;

	const nodes = new Map(host.component.displayList.map((node) => [node.id, node]));
	t.is(nodes.get('button-node')?.kind, 'button');
	t.is(nodes.get('label-node')?.kind, 'label');
	t.is(nodes.get('combo-node')?.kind, 'comboBox');
	t.is(nodes.get('progress-node')?.kind, 'progressBar');
	t.is(nodes.get('slider-node')?.kind, 'slider');
	t.is(nodes.get('scroll-node')?.kind, 'scrollBar');

	const button = nodes.get('button-node');
	if (button?.kind === 'button') {
		t.deepEqual(button.position, { x: 1, y: 2 });
		t.deepEqual(button.size, { width: 80, height: 24 });
		t.false(button.visible);
		t.false(button.touchable);
		t.true(button.grayed);
		t.true(Math.abs(button.alpha - 0.42) < 1e-6);
		t.is(button.rotation, 15);
		t.is(button.customData, 'button-data');
		t.deepEqual(button.relations, [{ targetNodeId: 'label-node', type: RelationType.Left_Left, usePercent: true }]);
		t.is(button.gears.length, 1);
		t.is(button.gears[0]?.kind, 'look');
		if (button.gears[0]?.kind === 'look') {
			t.is(button.gears[0].controllerName, 'control-state');
			t.true(button.gears[0].tween);
			t.true(Math.abs(button.gears[0].tweenDuration - 0.2) < 1e-6);
			t.deepEqual(button.gears[0].states.map((state) => state.pageId), ['idle', 'active']);
			t.deepEqual(button.gears[0].defaultValue, { alpha: 1, rotation: 0, grayed: false, touchable: true });
		}
		t.is(button.src, 'button-src');
		t.is(button.packageId, 'pkg-controls');
		t.is(button.title, 'Play');
		t.is(button.icon, 'play-icon');
		t.is(button.selectedTitle, 'Playing');
		t.is(button.selectedIcon, 'pause-icon');
		t.is(button.titleColor, '#112233');
		t.is(button.titleFontSize, 14);
		t.is(button.sound, 'click');
		t.true(Math.abs(button.soundVolumeScale - 0.5) < 1e-6);
		t.is(button.mode, 2);
		t.is(button.downEffect, 1);
		t.true(Math.abs(button.downEffectValue - 0.25) < 1e-6);
	}

	const label = nodes.get('label-node');
	if (label?.kind === 'label') {
		t.is(label.src, 'label-src');
		t.is(label.packageId, 'pkg-controls');
		t.is(label.title, 'Name');
		t.is(label.icon, 'label-icon');
		t.is(label.titleColor, '#445566');
		t.is(label.titleFontSize, 16);
		t.is(label.sound, 'label-sound');
		t.true(Math.abs(label.soundVolumeScale - 0.75) < 1e-6);
	}

	const combo = nodes.get('combo-node');
	if (combo?.kind === 'comboBox') {
		t.is(combo.src, 'combo-src');
		t.is(combo.packageId, 'pkg-controls');
		t.is(combo.title, 'Two');
		t.is(combo.icon, 'combo-icon');
		t.is(combo.titleColor, '#778899');
		t.is(combo.titleFontSize, 12);
		t.deepEqual(combo.items, ['One', 'Two']);
		t.deepEqual(combo.icons, ['one-icon', 'two-icon']);
		t.deepEqual(combo.values, ['1', '2']);
		t.is(combo.selectedIndex, 1);
		t.is(combo.visibleItemCount, 8);
		t.is(combo.popupDirection, 2);
		t.is(combo.sound, 'combo-sound');
		t.true(Math.abs(combo.soundVolumeScale - 0.9) < 1e-6);
	}

	const progress = nodes.get('progress-node');
	if (progress?.kind === 'progressBar') {
		t.is(progress.src, 'progress-src');
		t.is(progress.packageId, 'pkg-controls');
		t.is(progress.titleType, 3);
		t.is(progress.min, 10);
		t.is(progress.max, 200);
		t.is(progress.value, 120);
		t.true(progress.reverse);
		t.is(progress.sound, 'progress-sound');
		t.true(Math.abs(progress.soundVolumeScale - 0.6) < 1e-6);
	}

	const slider = nodes.get('slider-node');
	if (slider?.kind === 'slider') {
		t.is(slider.titleType, 2);
		t.is(slider.min, 1);
		t.is(slider.max, 10);
		t.is(slider.value, 7);
		t.true(slider.wholeNumbers);
	}

	const scrollBar = nodes.get('scroll-node');
	if (scrollBar?.kind === 'scrollBar') {
		t.is(scrollBar.src, 'scroll-src');
		t.true(scrollBar.fixedGripSize);
	}
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
		.setCustomData('list-data')
		.setLayout(2)
		.setDefaultItem('ui://pkg-display-nodes/item')
		.setListItems([{ title: 'Item', icon: null, url: null, name: 'item0', selectedTitle: null, selectedIcon: null, level: 0, isFolder: null }]));
	component.addChild(doc.createGTree('tree')
		.setId('tree-node')
		.setXY(3, 4)
		.setSize(110, 130)
		.setCustomData('tree-data')
		.setIndent(24)
		.setClickToExpand(1)
		.setListItems([{ title: 'Folder', icon: null, url: null, name: 'folder0', selectedTitle: null, selectedIcon: null, level: 0, isFolder: true }]));
	component.addChild(doc.createGGraph('shape')
		.setId('graph-node')
		.setXY(5, 6)
		.setSize(20, 30)
		.setCustomData('graph-data')
		.setGraphType(1)
		.setLineColor('#112233')
		.setFillColor('#445566')
		.setCornerRadius([1, 2, 3, 4]));
	component.addChild(doc.createGGroup('group')
		.setId('group-node')
		.setXY(7, 8)
		.setSize(200, 40)
		.setCustomData('group-data')
		.setLayout(1)
		.setAdvanced(true));
	component.addChild(doc.createGLoader('loader')
		.setId('loader-node')
		.setXY(9, 10)
		.setSize(64, 64)
		.setCustomData('loader-data')
		.setUrl('ui://pkg-display-nodes/image')
		.setColor('#abcdef')
		.setFillAmount(75));
	component.addChild(doc.createGLoader3D('loader3d')
		.setId('loader3d-node')
		.setXY(11, 12)
		.setSize(80, 90)
		.setCustomData('loader3d-data')
		.setUrl('ui://pkg-display-nodes/spine')
		.setAnimationName('idle')
		.setSkinName('default')
		.setLoop(false));
	component.addChild(doc.createGMovieClip('movie')
		.setId('movie-node')
		.setXY(13, 14)
		.setSize(96, 72)
		.setCustomData('movie-data')
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
	if (listNode?.kind === 'list') {
		t.is(listNode.customData, 'list-data');
		t.is(listNode.listItems[0]?.title, 'Item');
	}
	const treeNode = nodes.get('tree-node');
	if (treeNode?.kind === 'tree') {
		t.is(treeNode.customData, 'tree-data');
		t.is(treeNode.indent, 24);
	}
	const graphNode = nodes.get('graph-node');
	if (graphNode?.kind === 'graph') {
		t.is(graphNode.customData, 'graph-data');
		t.deepEqual(graphNode.cornerRadius, [1, 2, 3, 4]);
	}
	const groupNode = nodes.get('group-node');
	if (groupNode?.kind === 'group') t.is(groupNode.customData, 'group-data');
	const loaderNode = nodes.get('loader-node');
	if (loaderNode?.kind === 'loader') {
		t.is(loaderNode.customData, 'loader-data');
		t.is(loaderNode.fillAmount, 75);
	}
	const loader3DNode = nodes.get('loader3d-node');
	if (loader3DNode?.kind === 'loader3D') {
		t.is(loader3DNode.customData, 'loader3d-data');
		t.false(loader3DNode.loop);
	}
	const movieNode = nodes.get('movie-node');
	if (movieNode?.kind === 'movieClip') {
		t.is(movieNode.customData, 'movie-data');
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
