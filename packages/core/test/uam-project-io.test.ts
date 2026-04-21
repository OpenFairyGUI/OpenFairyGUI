import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
	NodeIO,
	assertValidUamProject,
	normalizeUamProject,
	type UamProject,
} from '../src/index.js';
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
