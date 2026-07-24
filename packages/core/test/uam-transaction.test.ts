import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getFixtureProjectPath } from '@openfairygui/test-utils';
import {
	UamTransactionError,
	applyUamTransaction,
	assertTransactionSupported,
	createUamTransaction,
	normalizeUamProject,
	validateTransactionSupport,
	type UamButtonNode,
	type UamComponentResource,
	type UamComponentRefNode,
	type UamControllerModel,
	type UamDisplayNode,
	type UamDisplayNodePropsUpdate,
	type UamGearBinding,
	type UamListNode,
	type UamLookGearBinding,
	type UamPackage,
	type UamProject,
	type UamTextNode,
	type UamTransactionOperation,
} from '../src/index.js';
import { NodeIO } from '../src/node.js';
import { readProjectAsUam, writeProjectFromUam } from '../src/uam/index.js';

const LAYABOX_PROJECT_PATH = getFixtureProjectPath(
	'FairyGUI-layabox',
	'demo/UIProject/FairyGUI-layabox-demo.fairy',
);

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
						sourceBytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
						sourcePath: '/images/background.png',
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

function createNonLookGears(controllerName = 'state'): UamGearBinding[] {
	const common = {
		controllerName,
		condition: '',
		positionsInPercent: false,
		tween: false,
		tweenDuration: 0.3,
		tweenDelay: 0,
		easeType: 5,
		customEasePath: '',
	};
	return [
		{ kind: 'display', name: 'display', controllerName, visibleOnPageIds: ['0'] },
		{ kind: 'display2', name: 'display2', controllerName, visibleOnPageIds: ['1'], condition: '1' },
		{
			kind: 'xy', name: 'xy', ...common,
			states: [{ pageId: '0', value: { x: 12, y: 18 } }],
			defaultValue: { x: 0, y: 0 },
		},
		{
			kind: 'size', name: 'size', ...common,
			states: [{ pageId: '0', value: { width: 48, height: 36, scaleX: 1.2, scaleY: 0.8 } }],
			defaultValue: { width: 24, height: 20, scaleX: 1, scaleY: 1 },
		},
		{
			kind: 'color', name: 'color', ...common,
			states: [{ pageId: '0', value: { color: '#ff00ff', outlineColor: null } }],
			defaultValue: { color: '#ffffff', outlineColor: null },
		},
		{
			kind: 'animation', name: 'animation', ...common,
			states: [{ pageId: '0', value: { frame: 3, playing: false, animationName: 'run', skinName: 'hero' } }],
			defaultValue: { frame: 0, playing: true, animationName: '', skinName: '' },
		},
		{
			kind: 'text', name: 'text', ...common,
			states: [{ pageId: '0', value: { text: 'Alert' } }],
			defaultValue: { text: 'Idle' },
		},
		{
			kind: 'icon', name: 'icon', ...common,
			states: [{ pageId: '0', value: { icon: 'ui://pkg001/icon' } }],
			defaultValue: { icon: '' },
		},
		{
			kind: 'fontSize', name: 'font-size', ...common,
			states: [{ pageId: '0', value: { fontSize: 28 } }],
			defaultValue: { fontSize: 16 },
		},
	];
}

function updateNonLookGear(gear: UamGearBinding): UamGearBinding {
	switch (gear.kind) {
		case 'display':
			return { ...gear, visibleOnPageIds: ['1'] };
		case 'display2':
			return { ...gear, visibleOnPageIds: ['0'], condition: '2' };
		case 'xy':
			return { ...gear, states: [{ pageId: '1', value: { x: 30, y: 40 } }], defaultValue: { x: 3, y: 4 } };
		case 'size':
			return { ...gear, states: [{ pageId: '1', value: { width: 60, height: 44, scaleX: 1.1, scaleY: 1.3 } }], defaultValue: { width: 30, height: 28, scaleX: 1, scaleY: 1 } };
		case 'color':
			return { ...gear, states: [{ pageId: '1', value: { color: '#00ff00', outlineColor: null } }], defaultValue: { color: '#111111', outlineColor: null } };
		case 'animation':
			return { ...gear, states: [{ pageId: '1', value: { frame: 7, playing: true, animationName: 'idle', skinName: 'alt' } }], defaultValue: { frame: 1, playing: false, animationName: '', skinName: '' } };
		case 'text':
			return { ...gear, states: [{ pageId: '1', value: { text: 'Updated' } }], defaultValue: { text: 'Default' } };
		case 'icon':
			return { ...gear, states: [{ pageId: '1', value: { icon: 'ui://pkg001/updated-icon' } }], defaultValue: { icon: 'ui://pkg001/default-icon' } };
		case 'fontSize':
			return { ...gear, states: [{ pageId: '1', value: { fontSize: 32 } }], defaultValue: { fontSize: 18 } };
		case 'look':
			throw new Error('Expected a non-look gear.');
	}
}

type UamDisplayNodeBaseFixture = Pick<
	UamDisplayNode,
	'id' | 'name' | 'position' | 'size' | 'visible' | 'touchable' | 'grayed' | 'alpha' | 'rotation' | 'customData' | 'relations' | 'gears'
>;

function createDisplayNodeBase(id: string, name: string, offset = 0): UamDisplayNodeBaseFixture {
	return {
		id,
		name,
		position: { x: offset, y: offset + 4 },
		size: { width: 80 + offset, height: 24 + offset },
		visible: true,
		touchable: true,
		grayed: false,
		alpha: 1,
		rotation: 0,
		customData: '',
		relations: [],
		gears: [],
	};
}

function createLifecyclePackage(id = 'pkg002', name = 'Overlay'): UamPackage {
	return {
		id,
		name,
		publish: null,
		resources: [],
	};
}

function createLifecycleComponent(id = 'cmp002', name = 'Popup'): UamComponentResource {
	return {
		kind: 'component',
		id,
		name,
		path: '/',
		exported: true,
		branch: '',
		branchItemIds: [],
		component: {
			size: { width: 160, height: 80 },
			customData: '',
			displayList: [{
				...createDisplayNodeBase('popup-title', 'title'),
				kind: 'text',
				text: 'Popup',
				font: '',
				fontSize: 16,
				color: '#ffffff',
			}],
			controllers: [],
			transitions: [],
		},
	};
}

function createListNodeBase(id: string, name: string, offset = 0): Omit<UamListNode, 'kind'> {
	return {
		...createDisplayNodeBase(id, name, offset),
		group: '',
		layout: 2,
		align: 0,
		vAlign: 0,
		lineGap: 3,
		columnGap: 4,
		lineCount: 0,
		columnCount: 0,
		selectionMode: 1,
		defaultItem: 'ui://pkg001/item',
		autoResizeItem: true,
		childrenRenderOrder: 0,
		apexIndex: 0,
		src: '',
		overflow: 2,
		scrollType: 1,
		scrollBarFlags: 0,
		scrollBarMargin: { top: 0, bottom: 0, left: 0, right: 0 },
		vtScrollBarRes: '',
		hzScrollBarRes: '',
		headerRes: '',
		footerRes: '',
		margin: { top: 1, bottom: 1, left: 1, right: 1 },
		clipSoftness: { x: 0, y: 0 },
		scrollItemToViewOnClick: true,
		foldInvisibleItems: false,
		listItems: [
			{
				title: 'Item',
				icon: null,
				url: 'ui://pkg001/item',
				name: 'item0',
				selectedTitle: null,
				selectedIcon: null,
				level: 0,
				isFolder: null,
				controllers: null,
			},
		],
		pageController: '',
		controllerOverrides: '',
		selectionController: '',
	};
}

async function roundTripCommittedProject(project: UamProject): Promise<UamProject> {
	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-uam-transaction-'));
	const outFairy = path.join(tmpDir, 'out.fairy');
	try {
		await writeProjectFromUam(io, project, outFairy);
		return await readProjectAsUam(io, outFairy, { hydrateResourceBytes: true });
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
}

test('assertTransactionSupported accepts current materialization scope and rejects unsupported cross-package refs', (t) => {
	const buttonNodeProject = createSupportedProject();
	const componentResource = buttonNodeProject.packages[0]!.resources[1];
	if (componentResource?.kind !== 'component') {
		t.fail('expected component resource');
		return;
	}
	componentResource.component.displayList.push({
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
	});
	t.notThrows(() => assertTransactionSupported(buttonNodeProject));

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
	t.notThrows(() => assertTransactionSupported(nonLookGearProject));

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

test('validateTransactionSupport accepts supported baseline nodes and fields', (t) => {
	const project = createSupportedProject();
	const componentResource = project.packages[0]!.resources[1];
	if (componentResource?.kind !== 'component') {
		t.fail('expected component resource');
		return;
	}
	const supportedComponentNode: UamComponentRefNode = {
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
		resource: { packageId: 'pkg001', resourceId: 'cmp001' },
	};
	const supportedListNode: UamListNode = {
		kind: 'list',
		id: 'n3',
		name: 'menu',
		position: { x: 8, y: 12 },
		size: { width: 180, height: 96 },
		visible: true,
		touchable: true,
		grayed: false,
		alpha: 0.9,
		rotation: 0,
		customData: 'list-passthrough',
		relations: [],
		gears: [],
		group: '',
		layout: 2,
		align: 1,
		vAlign: 0,
		lineGap: 4,
		columnGap: 6,
		lineCount: 2,
		columnCount: 3,
		selectionMode: 1,
		defaultItem: 'ui://pkg001/item',
		autoResizeItem: false,
		childrenRenderOrder: 1,
		apexIndex: 0,
		src: 'ui://pkg001/list',
		overflow: 2,
		scrollType: 1,
		scrollBarFlags: 7,
		scrollBarMargin: { top: 1, bottom: 2, left: 3, right: 4 },
		vtScrollBarRes: 'ui://pkg001/vbar',
		hzScrollBarRes: 'ui://pkg001/hbar',
		headerRes: 'ui://pkg001/header',
		footerRes: 'ui://pkg001/footer',
		margin: { top: 5, bottom: 6, left: 7, right: 8 },
		clipSoftness: { x: 2, y: 3 },
		scrollItemToViewOnClick: false,
		foldInvisibleItems: true,
		listItems: [
			{
				title: 'Item',
				icon: 'ui://pkg001/icon',
				url: 'ui://pkg001/item',
				name: 'item0',
				selectedTitle: 'Item selected',
				selectedIcon: 'ui://pkg001/icon-selected',
				level: 0,
				isFolder: null,
				controllers: 'state',
			},
		],
		pageController: 'state',
		controllerOverrides: 'state=0',
		selectionController: 'state',
	};
	const unsupportedButtonNode: UamButtonNode = {
		kind: 'button',
		id: 'n4',
		name: 'button',
		position: { x: 30, y: 40 },
		size: { width: 96, height: 28 },
		visible: true,
		touchable: true,
		grayed: false,
		alpha: 1,
		rotation: 0,
		customData: 'button-passthrough',
		relations: [],
		gears: [],
		src: 'ui://pkg001/button',
		packageId: 'pkg001',
		title: 'Button',
		icon: 'ui://pkg001/button-icon',
		titleColor: '#112233',
		titleFontSize: 14,
		sound: 'click',
		soundVolumeScale: 0.75,
		selectedTitle: 'Selected',
		selectedIcon: 'ui://pkg001/button-selected-icon',
		mode: 2,
		downEffect: 1,
		downEffectValue: 0.6,
	};
	componentResource.component.displayList.push(supportedComponentNode, supportedListNode, unsupportedButtonNode);
	componentResource.component.controllers.push(createControllerModel('state'));
	(componentResource.component.displayList[0]!.gears as any[]).push({
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

	const normalizedProject = normalizeUamProject(project);
	const normalizedComponent = normalizedProject.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	if (normalizedComponent?.kind !== 'component') {
		t.fail('expected normalized component resource');
		return;
	}
	const untouchedComponentSnapshot = structuredClone(normalizedComponent.component.displayList.find((node) => node.id === 'n2'));
	const untouchedListSnapshot = structuredClone(normalizedComponent.component.displayList.find((node) => node.id === 'n3'));
	const untouchedButtonSnapshot = structuredClone(normalizedComponent.component.displayList.find((node) => node.id === 'n4'));

	t.deepEqual(validateTransactionSupport(normalizedProject), []);
	t.deepEqual(validateTransactionSupport(normalizedProject, []), []);
	t.deepEqual(validateTransactionSupport(normalizedProject, [
		{
			kind: 'setDisplayNodeProps',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
			props: { text: 'Scoped Update' },
		},
	]), []);

	const result = applyUamTransaction(normalizedProject, [
		{
			kind: 'setDisplayNodeProps',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
			props: { text: 'Scoped Update' },
		},
	]);
	const resultComponent = result.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	t.is(resultComponent?.kind, 'component');
	if (resultComponent?.kind !== 'component') return;
	const textNode = resultComponent.component.displayList.find((node) => node.id === 'n1');
	t.is(textNode?.kind, 'text');
	if (textNode?.kind === 'text') t.is(textNode.text, 'Scoped Update');
	t.deepEqual(resultComponent.component.displayList.find((node) => node.id === 'n2'), untouchedComponentSnapshot);
	t.deepEqual(resultComponent.component.displayList.find((node) => node.id === 'n3'), untouchedListSnapshot);
	t.deepEqual(resultComponent.component.displayList.find((node) => node.id === 'n4'), untouchedButtonSnapshot);

	const buttonNodeIssues = validateTransactionSupport(normalizedProject, [
		{
			kind: 'setDisplayNodeProps',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n4' },
			props: { alpha: 0.5 },
		},
	]);
	t.deepEqual(buttonNodeIssues, []);
});

test('applyUamTransaction leaves untouched invalid baseline refs as passthrough for simple display props', (t) => {
	const project = createSupportedProject();
	const componentResource = project.packages[0]!.resources[1];
	if (componentResource?.kind !== 'component') {
		t.fail('expected component resource');
		return;
	}
	componentResource.component.displayList[0]!.relations.push({
		targetNodeId: '',
		type: 0,
		usePercent: false,
	});

	const result = applyUamTransaction(project, [
		{
			kind: 'setDisplayNodeProps',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
			props: {
				position: { x: 24, y: 32 },
				text: 'Scoped edit',
			},
		},
	]);
	const resultComponent = result.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	t.is(resultComponent?.kind, 'component');
	if (resultComponent?.kind !== 'component') return;
	t.deepEqual(resultComponent.component.displayList[0]?.relations, [
		{
			targetNodeId: '',
			type: 0,
			usePercent: false,
		},
	]);
	const title = resultComponent.component.displayList.find((node) => node.id === 'n1');
	t.is(title?.kind, 'text');
	if (title?.kind === 'text') {
		t.deepEqual(title.position, { x: 24, y: 32 });
		t.is(title.text, 'Scoped edit');
	}
});

test('Phase A transactions support common FairyGUI display node kinds for common props', (t) => {
	const project = createSupportedProject();
	const componentResource = project.packages[0]!.resources[1];
	if (componentResource?.kind !== 'component') {
		t.fail('expected component resource');
		return;
	}

	const nodes: UamDisplayNode[] = [
		{
			kind: 'component',
			...createDisplayNodeBase('n2', 'component-ref', 8),
			resource: { packageId: 'pkg001', resourceId: 'cmp001' },
		},
		{
			kind: 'graph',
			...createDisplayNodeBase('n3', 'graph', 16),
			locked: false,
			minWidth: 0,
			maxWidth: 0,
			minHeight: 0,
			maxHeight: 0,
			pivot: { x: 0, y: 0 },
			pivotAsAnchor: false,
			group: '',
			skew: { x: 0, y: 0 },
			graphType: 1,
			lineSize: 1,
			lineColor: '#111111',
			fillColor: '#eeeeee',
			cornerRadius: null,
			points: null,
			sides: 0,
			startAngle: 0,
			distances: null,
		},
		{
			kind: 'group',
			...createDisplayNodeBase('n4', 'group', 24),
			locked: false,
			group: '',
			layout: 1,
			lineGap: 2,
			columnGap: 2,
			advanced: false,
			excludeInvisibles: false,
			autoSizeDisabled: false,
			mainGridIndex: -1,
		},
		{
			kind: 'list',
			...createListNodeBase('n5', 'list', 32),
		},
		{
			kind: 'loader',
			...createDisplayNodeBase('n6', 'loader', 40),
			pivot: { x: 0, y: 0 },
			scale: { x: 1, y: 1 },
			url: 'ui://pkg001/img001',
			filter: '',
			filterData: '',
			fill: 0,
			shrinkOnly: false,
			autoSize: false,
			useResize: false,
			align: 0,
			vAlign: 0,
			frame: 0,
			playing: true,
			color: '#ffffff',
			fillMethod: 0,
			fillOrigin: 0,
			fillClockwise: true,
			fillAmount: 100,
			clearOnPublish: false,
		},
		{
			kind: 'richText',
			...createDisplayNodeBase('n7', 'rich-text', 48),
			text: '[b]Rich[/b]',
			font: '',
			fontSize: 14,
			color: '#ffaa00',
		},
		{
			kind: 'textInput',
			...createDisplayNodeBase('n8', 'text-input', 56),
			text: 'Input',
			font: '',
			fontSize: 14,
			color: '#222222',
			promptText: 'Prompt',
			maxLength: 32,
			restrict: '',
			password: false,
			keyboardType: 0,
		},
		{
			kind: 'tree',
			...createListNodeBase('n9', 'tree', 64),
			treeView: true,
			indent: 20,
			clickToExpand: 1,
		},
	];
	componentResource.component.displayList.push(...nodes);

	const operations: UamTransactionOperation[] = nodes.map((node, index) => {
		const props: UamDisplayNodePropsUpdate = {
			position: { x: 100 + index, y: 120 + index },
			size: { width: 200 + index, height: 40 + index },
			alpha: 0.5,
			rotation: 5 + index,
			customData: `phase-a-${node.kind}`,
		};
		if (node.kind === 'richText') {
			props.text = '[i]Updated rich text[/i]';
			props.fontSize = 18;
			props.color = '#ff00ff';
		}
		if (node.kind === 'textInput') {
			props.text = 'Updated input';
			props.font = 'Arial';
			props.color = '#00aaee';
		}
		return {
			kind: 'setDisplayNodeProps',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: node.id },
			props,
		};
	});

	const normalizedProject = normalizeUamProject(project);
	t.deepEqual(validateTransactionSupport(normalizedProject), []);
	t.deepEqual(validateTransactionSupport(normalizedProject, operations), []);

	const result = applyUamTransaction(normalizedProject, operations);
	const resultComponent = result.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	t.is(resultComponent?.kind, 'component');
	if (resultComponent?.kind !== 'component') return;

	for (const [index, sourceNode] of nodes.entries()) {
		const updatedNode = resultComponent.component.displayList.find((node) => node.id === sourceNode.id);
		t.is(updatedNode?.kind, sourceNode.kind);
		t.deepEqual(updatedNode?.position, { x: 100 + index, y: 120 + index });
		t.deepEqual(updatedNode?.size, { width: 200 + index, height: 40 + index });
		t.is(updatedNode?.alpha, 0.5);
		t.is(updatedNode?.rotation, 5 + index);
		t.is(updatedNode?.customData, `phase-a-${sourceNode.kind}`);
	}

	const richText = resultComponent.component.displayList.find((node) => node.id === 'n7');
	t.is(richText?.kind, 'richText');
	if (richText?.kind === 'richText') {
		t.is(richText.text, '[i]Updated rich text[/i]');
		t.is(richText.fontSize, 18);
		t.is(richText.color, '#ff00ff');
	}

	const textInput = resultComponent.component.displayList.find((node) => node.id === 'n8');
	t.is(textInput?.kind, 'textInput');
	if (textInput?.kind === 'textInput') {
		t.is(textInput.text, 'Updated input');
		t.is(textInput.font, 'Arial');
		t.is(textInput.color, '#00aaee');
	}
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

test('resource lifecycle preflight projects batches and rejects unsafe source paths', (t) => {
	const addResource = {
		kind: 'misc' as const,
		id: 'generated',
		name: 'generated',
		path: '/generated',
		exported: true,
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

	const replacedId = applyUamTransaction(createSupportedProject(), [
		{ kind: 'removeResource', selector: { packageId: 'pkg001', resourceId: 'img001' } },
		{ kind: 'addResource', selector: { packageId: 'pkg001' }, resource: { ...addResource, id: 'img001' } },
	]);
	t.is(replacedId.packages[0]?.resources.find((resource) => resource.id === 'img001')?.kind, 'misc');

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
	t.true(batchIssues.some((issue) => issue.code === 'unsupported_operation_batch'));
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

		const removed = applyUamTransaction(renamed, [{
			kind: 'removeResource',
			selector: { packageId: 'pkg001', resourceId: 'img001' },
		}]);
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
