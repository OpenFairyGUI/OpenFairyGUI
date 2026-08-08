import test from 'ava';
import {
	createDefaultUamComponentProperties,
	createDefaultUamImageResourceProperties,
	createDefaultUamMovieClipResourceProperties,
	normalizeUamProject,
	validateUamProject,
	type UamProject,
} from '../src/index.js';

test('normalizeUamProject fills schema-local defaults into a canonical shape', (t) => {
	const project: UamProject = {
		projectId: 'uam-project',
		projectType: 0,
		version: '',
		branches: [],
		settings: {} as never,
		packages: [
			{
				id: 'pkg001',
				name: 'Main',
				compressPNG: null,
				jpegQuality: null,
				publish: null,
				branchNames: [],
				folders: [],
				resources: [
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
							displayList: [],
							controllers: [],
							transitions: [],
						},
					},
				],
			},
		],
	};

	const normalized = normalizeUamProject(project);
	t.is(normalized.version, '3.0');
	t.deepEqual(normalized.settings, {
		publish: {},
		common: {},
		adaptation: {},
	});
	t.is(normalized.packages[0]?.resources[0]?.kind, 'component');
});

test('MovieClip resources normalize and validate a typed model without metadata fallback', (t) => {
	const movieClip = createDefaultUamMovieClipResourceProperties();
	movieClip.interval = 83;
	movieClip.repeatDelay = 166;
	movieClip.swing = true;
	movieClip.smoothing = false;
	movieClip.frames.push({
		rectX: -4,
		rectY: 7,
		rectWidth: 32,
		rectHeight: 18,
		addDelay: 41,
		spriteId: 'movie001_0',
	});
	const project = normalizeUamProject({
		projectId: 'uam-movieclip',
		projectType: 0,
		version: '3.0',
		branches: [],
		settings: {} as never,
		packages: [{
			id: 'pkg001',
			name: 'Main',
			compressPNG: null,
			jpegQuality: null,
			publish: null,
			branchNames: [],
			folders: [],
			resources: [{
				kind: 'movieClip',
				id: 'movie001',
				name: 'Spinner',
				path: '/',
				exported: true,
				favorite: false,
				branch: '',
				branchItemIds: [],
				fileName: 'Spinner.jta',
				dimensions: { width: 32, height: 25 },
				movieClip,
			}],
		}],
	});

	t.deepEqual(validateUamProject(project), []);
	const normalizedResource = project.packages[0]?.resources[0];
	t.is(normalizedResource?.kind, 'movieClip');
	if (normalizedResource?.kind !== 'movieClip') return;
	t.not(normalizedResource.movieClip, movieClip);
	t.not(normalizedResource.movieClip.frames, movieClip.frames);
	t.not(normalizedResource.movieClip.frames[0], movieClip.frames[0]);
	t.deepEqual(normalizedResource.movieClip, movieClip);

	const legacyMetadataOnly = normalizeUamProject({
		...project,
		packages: [{
			...project.packages[0]!,
			resources: [{
				...normalizedResource,
				movieClip: undefined,
				metadata: { interval: 83, frames: movieClip.frames },
			} as never],
		}],
	});
	const issues = validateUamProject(legacyMetadataOnly);
	t.true(issues.some((issue) => issue.path === 'packages[0].resources[0].movieClip'));
});

test('validateUamProject rejects unknown hard references before graph assembly', (t) => {
	const project = normalizeUamProject({
		projectId: 'uam-invalid',
		projectType: 0,
		version: '3.0',
		branches: [],
		settings: {} as never,
		packages: [
			{
				id: 'pkg001',
				name: 'Main',
				compressPNG: null,
				jpegQuality: null,
				publish: null,
				branchNames: [],
				folders: [],
				resources: [
					{
						kind: 'image',
						id: 'img001',
						name: 'owned.png',
						path: '/',
						exported: true,
						favorite: false,
						branch: '',
						branchItemIds: [],
						fileName: 'owned.png',
						image: createDefaultUamImageResourceProperties(),
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
									id: 'img-node',
									name: 'owned-image',
									position: { x: 0, y: 0 },
									size: { width: 16, height: 16 },
									visible: true,
									touchable: true,
									grayed: false,
									alpha: 1,
									rotation: 0,
									customData: '',
									relations: [
										{ targetNodeId: '', type: 0, usePercent: false },
									],
									gears: [],
									resource: { packageId: '', resourceId: 'img001' },
								},
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
											name: 'look',
											controllerName: 'missing-controller',
											states: [{ pageId: 'missing-page', value: { alpha: 1, rotation: 0, grayed: false, touchable: true } }],
											defaultValue: { alpha: 1, rotation: 0, grayed: false, touchable: true },
											condition: '',
											positionsInPercent: false,
											tween: false,
											tweenDuration: 0.3,
											tweenDelay: 0,
											easeType: 5,
											customEasePath: '',
										},
									],
									resource: { resourceId: 'missing-image' },
								},
							],
							controllers: [],
							transitions: [
								{
									name: 'intro',
									autoPlay: false,
									autoPlayTimes: 1,
									autoPlayDelay: 0,
									options: 0,
									fps: 24,
									items: [
										{
											name: 'move',
											time: 0,
											actionType: 0,
											targetNodeId: 'missing-node',
											tween: false,
											duration: 0,
											startValue: [],
											endValue: [],
											easeType: 5,
											repeat: 0,
											yoyo: false,
											label: '',
											endLabel: '',
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

	const issues = validateUamProject(project);
	t.true(issues.some((issue) => issue.message.includes('Unknown gear controller')));
	t.false(issues.some((issue) => issue.message.includes('Unknown resource ref "missing-image"')));
	t.false(issues.some((issue) => issue.message.includes('Relation targetNodeId must not be empty')));
	t.false(issues.some((issue) => issue.message.includes('Unknown resource ref "img001"')));
	t.false(issues.some((issue) => issue.message.includes('Unknown transition target node id')));
	const componentResource = project.packages[0]?.resources[1];
	t.is(componentResource?.kind, 'component');
	if (componentResource?.kind !== 'component') return;
	const imageNode = componentResource.component.displayList[0];
	t.is(imageNode?.kind, 'image');
	if (imageNode?.kind === 'image') t.is(imageNode.resource.packageId, undefined);
});
