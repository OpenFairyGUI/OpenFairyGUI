import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getFixtureProjectPath } from '@openfairygui/test-utils';
import {
	createDefaultUamComponentProperties,
	createDefaultUamImageResourceProperties,
	normalizeUamProject,
	type UamComponentResource,
	type UamControllerModel,
	type UamDisplayNode,
	type UamGearBinding,
	type UamListNode,
	type UamLookGearBinding,
	type UamPackage,
	type UamProject,
} from '../src/index.js';
import { NodeIO } from '../src/node.js';
import { readProjectAsUam, writeProjectFromUam } from '../src/uam/index.js';

export const LAYABOX_PROJECT_PATH = getFixtureProjectPath(
	'FairyGUI-layabox',
	'demo/UIProject/FairyGUI-layabox-demo.fairy',
);

export function createSupportedProject(): UamProject {
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
						favorite: false,
						branch: '',
						branchItemIds: [],
						fileName: 'background.png',
						dimensions: { width: 320, height: 180 },
						image: {
							...createDefaultUamImageResourceProperties(),
							textureSetMode: 'atlas',
						},
						sourceBytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
						sourcePath: '/images/background.png',
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
	} as UamProject);
}

export function createControllerModel(name = 'state'): UamControllerModel {
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

export function createTransitionModel(name = 'intro') {
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

export function createLookGear(controllerName = 'state', alpha = 1): UamLookGearBinding {
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

export function createNonLookGears(controllerName = 'state'): UamGearBinding[] {
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

export function updateNonLookGear(gear: UamGearBinding): UamGearBinding {
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

export type UamDisplayNodeBaseFixture = Pick<
	UamDisplayNode,
	'id' | 'name' | 'position' | 'size' | 'visible' | 'touchable' | 'grayed' | 'alpha' | 'rotation' | 'customData' | 'relations' | 'gears'
>;

export function createDisplayNodeBase(id: string, name: string, offset = 0): UamDisplayNodeBaseFixture {
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

export function createLifecyclePackage(id = 'pkg002', name = 'Overlay'): UamPackage {
	return {
		id,
		name,
		publish: null,
		resources: [],
	};
}

export function createLifecycleComponent(id = 'cmp002', name = 'Popup'): UamComponentResource {
	return {
		kind: 'component',
		id,
		name,
		path: '/',
		exported: true,
		favorite: false,
		branch: '',
		branchItemIds: [],
		component: {
			size: { width: 160, height: 80 },
			properties: createDefaultUamComponentProperties(),
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

export function createListNodeBase(id: string, name: string, offset = 0): Omit<UamListNode, 'kind'> {
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

export async function roundTripCommittedProject(project: UamProject): Promise<UamProject> {
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
