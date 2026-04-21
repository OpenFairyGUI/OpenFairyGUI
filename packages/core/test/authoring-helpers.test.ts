import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
	ControllerActionType,
	Document,
	NodeIO,
	TransitionActionType,
	composeController,
	composeTransition,
} from '../src/index.js';

function createProjectDocument(projectId: string): Document {
	const doc = new Document();
	doc.getRoot()
		.setProjectId(projectId)
		.setProjectType(0)
		.setVersion('3.0')
		.setSettings({
			publish: {
				binaryFormat: true,
				fileExtension: 'bytes',
				compressDesc: false,
			},
			common: {},
			adaptation: {},
		});
	return doc;
}

async function roundTripProject(doc: Document): Promise<Document> {
	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-authoring-helpers-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);
		return await io.readProject(outFairy);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
}

test('composeController assembles pages/actions, attaches to the component, and survives round-trip', async (t) => {
	const doc = createProjectDocument('authoring-controller');
	const pkg = doc.createPackage('Helpers');
	pkg.setId('pkghelpers1');

	const component = doc.createComponent('Panel');
	component
		.setId('cmppanel1')
		.setPath('/')
		.setExported(true)
		.setSize(240, 140);

	const child = doc.createGComponent('content');
	child.setId('n0');
	component.addChild(child);
	pkg.addResource(component);

	const controller = composeController(doc, component, {
		name: 'state',
		selectedIndex: 1,
		pages: [
			{ id: '0', name: 'Idle' },
			{ id: '1', name: 'Active' },
		],
		actions: [
			{
				name: 'activate',
				actionType: ControllerActionType.ChangePage,
				fromPage: ['0'],
				toPage: ['1'],
				object: child,
				controllerName: 'nested',
				targetPage: '~1',
			},
		],
	});

	t.is(component.getController('state'), controller, 'helper should attach controller to the component');
	t.deepEqual(controller.listPages().map((page) => ({ id: page.getId(), name: page.getName() })), [
		{ id: '0', name: 'Idle' },
		{ id: '1', name: 'Active' },
	], 'helper should replace multi-step page assembly');
	t.is(controller.listActions()[0]?.getObjectId(), 'n0', 'helper should resolve child refs into ids');

	const doc2 = await roundTripProject(doc);
	const controller2 = doc2.getRoot().getPackage('Helpers')?.getComponent('Panel')?.getController('state');
	const action2 = controller2?.listActions()[0];

	t.truthy(controller2, 'controller should survive round-trip');
	t.is(controller2?.getSelectedIndex(), 1);
	t.deepEqual(controller2?.listPages().map((page) => ({ id: page.getId(), name: page.getName() })), [
		{ id: '0', name: 'Idle' },
		{ id: '1', name: 'Active' },
	]);
	t.truthy(action2, 'controller action should survive round-trip');
	t.is(action2?.getActionType(), ControllerActionType.ChangePage);
	t.is(action2?.getObjectId(), 'n0');
	t.is(action2?.getControllerName(), 'nested');
	t.is(action2?.getTargetPage(), '~1');
});

test('composeController rejects duplicate page ids before graph assembly', (t) => {
	const doc = createProjectDocument('authoring-controller-duplicate');
	const pkg = doc.createPackage('Helpers');
	pkg.setId('pkghelpers2');

	const component = doc.createComponent('Panel');
	component
		.setId('cmppanel2')
		.setPath('/')
		.setExported(true)
		.setSize(240, 140);
	pkg.addResource(component);

	const error = t.throws(() => {
		composeController(doc, component, {
			name: 'state',
			pages: [
				{ id: '0', name: 'Idle' },
				{ id: '0', name: 'Duplicate' },
			],
		});
	});

	t.regex(error?.message ?? '', /duplicate page id/i);
	t.is(component.listControllers().length, 0, 'failed composition should not attach a partial controller');
});

test('composeController rejects action page refs that do not belong to the controller page set', (t) => {
	const doc = createProjectDocument('authoring-controller-invalid-pages');
	const pkg = doc.createPackage('Helpers');
	pkg.setId('pkghelpers-invalid-pages');

	const component = doc.createComponent('Panel');
	component
		.setId('cmppanel-invalid-pages')
		.setPath('/')
		.setExported(true)
		.setSize(240, 140);

	const child = doc.createGComponent('content');
	child.setId('n0');
	component.addChild(child);
	pkg.addResource(component);

	const error = t.throws(() => {
		composeController(doc, component, {
			name: 'state',
			pages: [
				{ id: '0', name: 'Idle' },
				{ id: '1', name: 'Active' },
			],
			actions: [
				{
					actionType: ControllerActionType.ChangePage,
					fromPage: ['missing'],
					toPage: ['1'],
					object: child,
					controllerName: 'nested',
					targetPage: '~1',
				},
			],
		});
	});

	t.regex(error?.message ?? '', /unknown page id/i);
	t.is(component.listControllers().length, 0, 'failed composition should not attach a partial controller');
});

test('composeTransition assembles items, resolves child refs, attaches to the component, and survives round-trip', async (t) => {
	const doc = createProjectDocument('authoring-transition');
	const pkg = doc.createPackage('Helpers');
	pkg.setId('pkghelpers3');

	const component = doc.createComponent('Animator');
	component
		.setId('cmpanimator1')
		.setPath('/')
		.setExported(true)
		.setSize(220, 140);

	const child = doc.createGImage('hero');
	child.setId('n0').setXY(0, 0).setSize(100, 100);
	component.addChild(child);
	pkg.addResource(component);

	const transition = composeTransition(doc, component, {
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
				target: child,
				actionType: TransitionActionType.XY,
				tween: true,
				duration: 12,
				startValue: [0, 0],
				endValue: [120, 40],
				repeat: 1,
				yoyo: true,
				label: 'start',
				endLabel: 'end',
			},
		],
	});

	t.is(component.getTransition('intro'), transition, 'helper should attach transition to the component');
	t.is(transition.listItems()[0]?.getTargetId(), 'n0', 'helper should resolve child refs into target ids');

	const doc2 = await roundTripProject(doc);
	const transition2 = doc2.getRoot().getPackage('Helpers')?.getComponent('Animator')?.getTransition('intro');
	const item2 = transition2?.listItems()[0];

	t.truthy(transition2, 'transition should survive round-trip');
	t.true(transition2?.getAutoPlay() ?? false);
	t.is(transition2?.getAutoPlayTimes(), 2);
	t.true(Math.abs((transition2?.getAutoPlayDelay() ?? 0) - 0.25) < 1e-6);
	t.is(transition2?.getOptions(), 3);
	t.is(transition2?.getFps(), 30);
	t.truthy(item2, 'transition item should survive round-trip');
	t.is(item2?.getTargetId(), 'n0');
	t.is(item2?.getActionType(), TransitionActionType.XY);
	t.deepEqual(item2?.getStartValue(), ['0', '0']);
	t.deepEqual(item2?.getEndValue(), ['120', '40']);
});

test('composeTransition rejects a target that does not belong to the component', (t) => {
	const doc = createProjectDocument('authoring-transition-invalid-target');
	const pkg = doc.createPackage('Helpers');
	pkg.setId('pkghelpers4');

	const component = doc.createComponent('Animator');
	component
		.setId('cmpanimator2')
		.setPath('/')
		.setExported(true)
		.setSize(220, 140);
	pkg.addResource(component);

	const foreignChild = doc.createGImage('foreign');
	foreignChild.setId('n99').setXY(0, 0).setSize(100, 100);

	const error = t.throws(() => {
		composeTransition(doc, component, {
			name: 'intro',
			items: [
				{
					time: 0,
					target: foreignChild,
					actionType: TransitionActionType.XY,
				},
			],
		});
	});

	t.regex(error?.message ?? '', /does not belong to component/i);
	t.is(component.listTransitions().length, 0, 'failed composition should not attach a partial transition');
});
