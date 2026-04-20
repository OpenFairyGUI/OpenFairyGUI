import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getFixtureProjectPath } from '@openfairygui/test-utils';
import {
	ControllerActionType,
	Document,
	GearType,
	NodeIO,
	TransitionActionType,
} from '../src/index.js';

const REAL_PROJECT_PATH = getFixtureProjectPath('FairyGUI-unity', 'UIProject/FairyGUI-Unity-Examples.fairy');

const EDITING_MATRIX = [
	'project-create-save',
	'component-create-save',
	'display-object-property-edit',
	'display-list-append-remove',
	'controller-edit',
	'transition-edit',
	'gear-edit',
] as const;

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
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-editing-foundation-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);
		return await io.readProject(outFairy);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
}

function childIds(component: ReturnType<Document['createComponent']>): string[] {
	return component.listChildren().map((child) => child.getId());
}

test('editing matrix covers all approved stage-1 capability domains', (t) => {
	t.deepEqual(EDITING_MATRIX, [
		'project-create-save',
		'component-create-save',
		'display-object-property-edit',
		'display-list-append-remove',
		'controller-edit',
		'transition-edit',
		'gear-edit',
	]);
});

test('project creation survives save -> re-read semantic round-trip', async (t) => {
	const doc = createProjectDocument('editing-project');
	const pkg = doc.createPackage('Authoring');
	pkg.setId('pkgedit1');

	const component = doc.createComponent('Main');
	component
		.setId('cmpedit1')
		.setPath('/')
		.setExported(true)
		.setSize(320, 180);

	const title = doc.createGTextField('title');
	title
		.setId('n0')
		.setText('Hello OpenFairyGUI')
		.setXY(12, 18)
		.setSize(180, 32);

	component.addChild(title);
	pkg.addResource(component);

	const doc2 = await roundTripProject(doc);
	const root2 = doc2.getRoot();
	const pkg2 = root2.getPackage('Authoring');
	const component2 = pkg2?.getComponent('Main');
	const title2 = component2?.getChildById('n0') as ReturnType<Document['createGTextField']> | null;

	t.is(root2.getProjectId(), 'editing-project');
	t.is(root2.getProjectType(), 0);
	t.is(root2.getVersion(), '3.0');
	t.truthy(pkg2, 'package should survive round-trip');
	t.is(pkg2?.getId(), 'pkgedit1');
	t.truthy(component2, 'component should survive round-trip');
	t.is(component2?.getId(), 'cmpedit1');
	t.deepEqual(childIds(component2!), ['n0']);
	t.truthy(title2, 'child text should survive round-trip');
	t.is(title2?.getText(), 'Hello OpenFairyGUI');
	t.is(title2?.getX(), 12);
	t.is(title2?.getY(), 18);
});

test('component creation survives save -> re-read semantic round-trip', async (t) => {
	const doc = createProjectDocument('component-create-project');
	const pkg = doc.createPackage('Inventory');
	pkg.setId('pkgcomp1');

	const component = doc.createComponent('Card');
	component
		.setId('cmpcard1')
		.setPath('/')
		.setExported(true)
		.setSize(240, 120);

	const background = doc.createGImage('background');
	background
		.setId('n0')
		.setXY(0, 0)
		.setSize(240, 120)
		.setColor('#FFFFFF');

	const label = doc.createGTextField('label');
	label
		.setId('n1')
		.setText('Card Label')
		.setXY(16, 14)
		.setSize(120, 24);

	component.addChild(background);
	component.addChild(label);
	pkg.addResource(component);

	const doc2 = await roundTripProject(doc);
	const component2 = doc2.getRoot().getPackage('Inventory')?.getComponent('Card');
	const background2 = component2?.getChildById('n0') as ReturnType<Document['createGImage']> | null;
	const label2 = component2?.getChildById('n1') as ReturnType<Document['createGTextField']> | null;

	t.truthy(component2, 'component should survive round-trip');
	t.is(component2?.getWidth(), 240);
	t.is(component2?.getHeight(), 120);
	t.deepEqual(childIds(component2!), ['n0', 'n1']);
	t.truthy(background2, 'background image should survive round-trip');
	t.is(background2?.getWidth(), 240);
	t.is(background2?.getHeight(), 120);
	t.truthy(label2, 'label should survive round-trip');
	t.is(label2?.getText(), 'Card Label');
});

test('display-object property edits survive save -> re-read semantic round-trip on a real project fixture', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject(REAL_PROJECT_PATH);
	const basics = doc.getRoot().getPackage('Basics');
	const demoImage = basics?.getComponent('Demo_Image');
	const editedImage = demoImage?.getChildById('n8') as ReturnType<Document['createGImage']> | null;

	t.truthy(editedImage, 'expected real fixture image child to exist');

	editedImage!
		.setAlpha(0.42)
		.setRotation(17)
		.setVisible(false)
		.setTooltips('edited-in-regression-matrix');

	const doc2 = await roundTripProject(doc);
	const editedImage2 = doc2
		.getRoot()
		.getPackage('Basics')
		?.getComponent('Demo_Image')
		?.getChildById('n8') as ReturnType<Document['createGImage']> | null;

	t.truthy(editedImage2, 'edited fixture image should survive round-trip');
	t.true(Math.abs((editedImage2?.getAlpha() ?? 0) - 0.42) < 1e-6);
	t.is(editedImage2?.getRotation(), 17);
	t.false(editedImage2?.getVisible() ?? true);
});

test('display-list append/remove edits survive save -> re-read semantic round-trip with ordered persistence', async (t) => {
	const doc = createProjectDocument('display-list-project');
	const pkg = doc.createPackage('Lists');
	pkg.setId('pkglist1');

	const component = doc.createComponent('Host');
	component
		.setId('cmplist1')
		.setPath('/')
		.setExported(true)
		.setSize(300, 200);

	const first = doc.createGTextField('first');
	first.setId('n0').setText('first').setXY(0, 0).setSize(60, 20);

	const removed = doc.createGTextField('removed');
	removed.setId('n1').setText('removed').setXY(0, 30).setSize(80, 20);

	const third = doc.createGTextField('third');
	third.setId('n2').setText('third').setXY(0, 60).setSize(60, 20);

	component.addChild(first);
	component.addChild(removed);
	component.addChild(third);
	component.removeChild(removed);

	const appended = doc.createGTextField('appended');
	appended.setId('n3').setText('appended').setXY(0, 90).setSize(90, 20);
	component.addChild(appended);

	pkg.addResource(component);

	const doc2 = await roundTripProject(doc);
	const component2 = doc2.getRoot().getPackage('Lists')?.getComponent('Host');

	t.truthy(component2, 'component should survive round-trip');
	t.deepEqual(childIds(component2!), ['n0', 'n2', 'n3']);
	t.is(
		(component2?.getChildById('n3') as ReturnType<Document['createGTextField']> | null)?.getText(),
		'appended',
	);
});

test('controller edits survive save -> re-read semantic round-trip', async (t) => {
	const doc = createProjectDocument('controller-edit-project');
	const pkg = doc.createPackage('Controllers');
	pkg.setId('pkgctrl1');

	const component = doc.createComponent('Panel');
	component
		.setId('cmpctrl1')
		.setPath('/')
		.setExported(true)
		.setSize(240, 140);

	const child = doc.createGComponent('content');
	child.setId('n0');
	component.addChild(child);

	const controller = doc.createController('state');
	controller.setSelectedIndex(1);

	const page0 = doc.createControllerPage('Idle');
	page0.setId('0');
	const page1 = doc.createControllerPage('Active');
	page1.setId('1');
	controller.addPage(page0);
	controller.addPage(page1);

	const action = doc.createControllerAction('goActive');
	action
		.setActionType(ControllerActionType.ChangePage)
		.setFromPage(['0'])
		.setToPage(['1'])
		.setObjectId('n0')
		.setControllerName('nested')
		.setTargetPage('~1');
	controller.addAction(action);

	component.addController(controller);
	pkg.addResource(component);

	const doc2 = await roundTripProject(doc);
	const controller2 = doc2.getRoot().getPackage('Controllers')?.getComponent('Panel')?.getController('state');
	const action2 = controller2?.listActions()[0];

	t.truthy(controller2, 'controller should survive round-trip');
	t.is(controller2?.getSelectedIndex(), 1);
	t.deepEqual(controller2?.listPages().map((page) => ({ id: page.getId(), name: page.getName() })), [
		{ id: '0', name: 'Idle' },
		{ id: '1', name: 'Active' },
	]);
	t.truthy(action2, 'controller action should survive round-trip');
	t.is(action2?.getActionType(), ControllerActionType.ChangePage);
	t.deepEqual(action2?.getFromPage(), ['0']);
	t.deepEqual(action2?.getToPage(), ['1']);
	t.is(action2?.getObjectId(), 'n0');
	t.is(action2?.getControllerName(), 'nested');
	t.is(action2?.getTargetPage(), '~1');
});

test('transition edits survive save -> re-read semantic round-trip', async (t) => {
	const doc = createProjectDocument('transition-edit-project');
	const pkg = doc.createPackage('Transitions');
	pkg.setId('pkgtran1');

	const component = doc.createComponent('Animator');
	component
		.setId('cmptran1')
		.setPath('/')
		.setExported(true)
		.setSize(200, 120);

	const child = doc.createGImage('hero');
	child.setId('n0').setXY(0, 0).setSize(100, 100);
	component.addChild(child);

	const transition = doc.createTransition('intro');
	transition
		.setAutoPlay(true)
		.setAutoPlayTimes(2)
		.setAutoPlayDelay(0.25)
		.setOptions(3)
		.setFps(30);

	const item = doc.createTransitionItem('move');
	item
		.setTime(3)
		.setTargetId('n0')
		.setActionType(TransitionActionType.XY)
		.setTween(true)
		.setDuration(12)
		.setStartValue([0, 0])
		.setEndValue([120, 40])
		.setRepeat(1)
		.setYoyo(true)
		.setLabel('start')
		.setEndLabel('end');
	transition.addItem(item);

	component.addTransition(transition);
	pkg.addResource(component);

	const doc2 = await roundTripProject(doc);
	const transition2 = doc2.getRoot().getPackage('Transitions')?.getComponent('Animator')?.getTransition('intro');
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
	t.true(item2?.getTween() ?? false);
	t.is(item2?.getDuration(), 12);
	t.deepEqual(item2?.getStartValue(), ['0', '0']);
	t.deepEqual(item2?.getEndValue(), ['120', '40']);
	t.is(item2?.getLabel(), 'start');
	t.is(item2?.getEndLabel(), 'end');
});

test('gear edits survive save -> re-read semantic round-trip', async (t) => {
	const doc = createProjectDocument('gear-edit-project');
	const pkg = doc.createPackage('Gears');
	pkg.setId('pkggear1');

	const component = doc.createComponent('StateHost');
	component
		.setId('cmpgear1')
		.setPath('/')
		.setExported(true)
		.setSize(220, 140);

	const controller = doc.createController('state');
	const page0 = doc.createControllerPage('Idle');
	page0.setId('0');
	const page1 = doc.createControllerPage('Alert');
	page1.setId('1');
	controller.addPage(page0);
	controller.addPage(page1);
	component.addController(controller);

	const image = doc.createGImage('icon');
	image
		.setId('n0')
		.setXY(10, 10)
		.setSize(80, 80);

	const gear = doc.createGear('look');
	gear
		.setGearType(GearType.Look)
		.setController(controller)
		.setPages('0,1')
		.setValues('1,1,0|0.35,0.35,1')
		.setDefaultValue('1,1,0')
		.setTween(true)
		.setTweenDuration(0.5)
		.setCondition('1');
	image.addGear(gear);

	component.addChild(image);
	pkg.addResource(component);

	const doc2 = await roundTripProject(doc);
	const image2 = doc2
		.getRoot()
		.getPackage('Gears')
		?.getComponent('StateHost')
		?.getChildById('n0') as ReturnType<Document['createGImage']> | null;
	const gear2 = image2?.listGears()[0];

	t.truthy(gear2, 'gear should survive round-trip');
	t.is(gear2?.getGearType(), GearType.Look);
	t.is(gear2?.getController()?.getName(), 'state');
	t.is(gear2?.getPages(), '0,1');
	t.is(gear2?.getValues(), '1.00,1,0|0.35,0.35,1');
	t.is(gear2?.getDefaultValue(), '1.00,1,0');
	t.true(gear2?.getTween() ?? false);
	t.true(Math.abs((gear2?.getTweenDuration() ?? 0) - 0.5) < 1e-6);
	t.is(gear2?.getCondition(), '1');
});
