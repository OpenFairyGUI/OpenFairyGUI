import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getFixtureProjectPath } from '@openfairygui/test-utils';
import { Document, GearType, } from '../src/index.js';
import { NodeIO } from '../src/node.js';

const _PROJECT_PATH = getFixtureProjectPath('FairyGUI-unity', 'UIProject/FairyGUI-Unity-Examples.fairy');

// ─── Round-trip: read → write → read ──────────────────────────────────────

test('round-trip: gear pages values and condition survive write→read', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('test-project').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('Demo4');
	pkg.setId('pkg004');

	const comp = doc.createComponent('GearHost');
	comp.setId('comp004');
	comp.setPath('/');
	comp.setSize(200, 120);

	const ctrl = doc.createController('state');
	const page0 = doc.createControllerPage('up');
	page0.setId('0');
	const page1 = doc.createControllerPage('down');
	page1.setId('1');
	ctrl.addPage(page0);
	ctrl.addPage(page1);
	comp.addController(ctrl);

	const image = doc.createGImage('gear-image');
	image.setId('n0');

	const textGear = doc.createGear();
	textGear.setGearType(GearType.Text);
	textGear.setController(ctrl);
	textGear.setPages('0,1');
	textGear.setValues('hello|world');
	textGear.setDefaultValue('fallback');
	textGear.setTween(true);
	textGear.setEaseType(5);
	textGear.setTweenDuration(0.5);

	const display2Gear = doc.createGear();
	display2Gear.setGearType(GearType.Display2);
	display2Gear.setController(ctrl);
	display2Gear.setPages('0,1');
	display2Gear.setCondition('1');

	const lookGear = doc.createGear();
	lookGear.setGearType(GearType.Look);
	lookGear.setController(ctrl);
	lookGear.setPages('1');
	lookGear.setValues('0.54,180,false,false');
	lookGear.setDefaultValue('1,0,false,true');
	lookGear.setTween(true);

	const colorGear = doc.createGear();
	colorGear.setGearType(GearType.Color);
	colorGear.setController(ctrl);
	colorGear.setPages('1');
	colorGear.setValues('#66FF99,#000000');
	colorGear.setDefaultValue('#FFFFFF,#000000');

	const title = doc.createGTextField('title');
	title.setId('n1');
	title.setColor('#FFFFFF');
	title.setStrokeColor('#000000');
	const titleGear = doc.createGear();
	titleGear.setGearType(GearType.Color);
	titleGear.setController(ctrl);
	titleGear.setPages('0,1');
	titleGear.setValues('#FFFFFF,#000000|-');
	titleGear.setDefaultValue('#DFB536,#000000');
	title.addGear(titleGear);

	const loader = doc.createGLoader('icon');
	loader.setId('n2');
	const loaderLookGear = doc.createGear();
	loaderLookGear.setGearType(GearType.Look);
	loaderLookGear.setController(ctrl);
	loaderLookGear.setPages('0,1');
	loaderLookGear.setValues('1,0,false,true|-');
	loaderLookGear.setDefaultValue('1,0,true,true');
	loader.addGear(loaderLookGear);

	const bgImage = doc.createGImage('bg');
	bgImage.setId('n3');
	const sizeGear = doc.createGear();
	sizeGear.setGearType(GearType.Size);
	sizeGear.setController(ctrl);
	sizeGear.setPages('0,1');
	sizeGear.setValues('181,70,1,1|178,68,1,1');
	sizeGear.setDefaultValue('181,70,1,1');
	bgImage.addGear(sizeGear);

	image.addGear(textGear);
	image.addGear(display2Gear);
	image.addGear(lookGear);
	image.addGear(colorGear);
	comp.addChild(image);
	comp.addChild(title);
	comp.addChild(loader);
	comp.addChild(bgImage);
	pkg.addResource(comp);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const componentXml = await fs.readFile(path.join(tmpDir, 'assets', 'Demo4', 'GearHost.xml'), 'utf-8');
		t.true(/<gearText\b[^>]*tween(?:="true")?/.test(componentXml), 'gear writes tween attr');
		t.true(componentXml.includes('ease="Quad.Out"'), 'gear writes canonical ease attr');
		t.true(componentXml.includes('duration="0.5"'), 'gear writes canonical duration attr');
		t.true(componentXml.includes('<gearLook controller="state" pages="1" values="0.54,180,0,0" default="1,0,0"'), 'gearLook compresses bool payload to editor-style numeric tokens');
		t.true(componentXml.includes('<gearColor controller="state" pages="1" values="#66ff99" default="#ffffff"'), 'gearColor omits redundant black outline payload for non-text objects');
		t.true(componentXml.includes('<gearColor controller="state" pages="0,1" values="#ffffff|-" default="#dfb536"'), 'title text gearColor omits redundant black outline payloads');
		t.true(componentXml.includes('<gearLook controller="state" pages="0,1" values="1.00,0,0|-" default="1.00,0,1"'), 'loader gearLook keeps editor-style fixed alpha precision');
		t.true(componentXml.includes('<gearSize controller="state" pages="0,1" values="181,70,1.00,1.00|178,68,1.00,1.00" default="181,70,1.00,1.00"'), 'non-tween gearSize keeps editor-style fixed scale precision');

		const doc2 = await io.readProject(outFairy);
		const comp2 = doc2.getRoot().getPackage('Demo4')?.listComponents().find((item) => item.getName() === 'GearHost');
		t.truthy(comp2, 'GearHost component exists');

		const image2 = comp2!.listChildren().find((child) => child.getId() === 'n0');
		t.truthy(image2, 'gear image exists');
		const gears = image2!.listGears();
		t.is(gears.length, 4);

		const textGear2 = gears.find((gear) => gear.getGearType() === GearType.Text);
		t.truthy(textGear2, 'text gear exists');
		t.is(textGear2!.getPages(), '0,1');
		t.is(textGear2!.getValues(), 'hello|world');
		t.is(textGear2!.getDefaultValue(), 'fallback');
		t.true(textGear2!.getTween(), 'text gear tween survives');
		t.is(textGear2!.getEaseType(), 5, 'text gear ease survives');
		t.is(textGear2!.getTweenDuration(), 0.5, 'text gear duration survives');

		const display2Gear2 = gears.find((gear) => gear.getGearType() === GearType.Display2);
		t.truthy(display2Gear2, 'display2 gear exists');
		t.is(display2Gear2!.getPages(), '0,1');
		t.is(display2Gear2!.getCondition(), '1');

		const lookGear2 = gears.find((gear) => gear.getGearType() === GearType.Look);
		t.truthy(lookGear2, 'look gear exists');
		t.is(lookGear2!.getPages(), '1');
		t.is(lookGear2!.getValues(), '0.54,180,0,0');
		t.is(lookGear2!.getDefaultValue(), '1,0,0');

		const colorGear2 = gears.find((gear) => gear.getGearType() === GearType.Color);
		t.truthy(colorGear2, 'color gear exists');
		t.is(colorGear2!.getPages(), '1');
		t.is(colorGear2!.getValues(), '#66ff99');
		t.is(colorGear2!.getDefaultValue(), '#ffffff');

		const title2 = comp2!.listChildren().find((child) => child.getId() === 'n1');
		t.truthy(title2, 'title text exists');
		const titleColorGear2 = title2!.listGears().find((gear) => gear.getGearType() === GearType.Color);
		t.truthy(titleColorGear2, 'title text color gear exists');
		t.is(titleColorGear2!.getValues(), '#ffffff|-');
		t.is(titleColorGear2!.getDefaultValue(), '#dfb536');

		const loader2 = comp2!.listChildren().find((child) => child.getId() === 'n2');
		t.truthy(loader2, 'loader exists');
		const loaderLookGear2 = loader2!.listGears().find((gear) => gear.getGearType() === GearType.Look);
		t.truthy(loaderLookGear2, 'loader look gear exists');
		t.is(loaderLookGear2!.getValues(), '1.00,0,0|-');
		t.is(loaderLookGear2!.getDefaultValue(), '1.00,0,1');

		const bgImage2 = comp2!.listChildren().find((child) => child.getId() === 'n3');
		t.truthy(bgImage2, 'bg image exists');
		const sizeGear2 = bgImage2!.listGears().find((gear) => gear.getGearType() === GearType.Size);
		t.truthy(sizeGear2, 'size gear exists');
		t.is(sizeGear2!.getValues(), '181,70,1.00,1.00|178,68,1.00,1.00');
		t.is(sizeGear2!.getDefaultValue(), '181,70,1.00,1.00');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: component extension definition and instance extension attrs survive write→read', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('test-project').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('Demo5');
	pkg.setId('pkg005');

	const buttonDef = doc.createComponent('ExtendedButton');
	buttonDef.setId('cmpExt');
	buttonDef.setPath('/');
	buttonDef.setExtensionType('Button');
	buttonDef.setButtonMode(2);
	buttonDef.setSound('ui://pkg005/click');
	buttonDef.setSoundVolumeScale(0.6);
	buttonDef.setDownEffect(1);
	buttonDef.setDownEffectValue(0.75);
	pkg.addResource(buttonDef);

	const host = doc.createComponent('Host');
	host.setId('comp005');
	host.setPath('/');
	host.setSize(300, 200);

	const ctrl = doc.createController('state');
	const page0 = doc.createControllerPage('up');
	page0.setId('0');
	const page1 = doc.createControllerPage('down');
	page1.setId('1');
	ctrl.addPage(page0);
	ctrl.addPage(page1);
	host.addController(ctrl);

	const child = doc.createGComponent('btn-inst');
	child.setId('n0');
	child.setSrc('cmpExt');
	child.setPageController('state');
	child.setControllerOverrides('button,1');
	child.setInstanceExtType('Button');
	child.setInstanceTitle('点我');
	child.setInstanceSelectedTitle('已选');
	child.setInstanceIcon('ui://pkg005/icon');
	child.setInstanceSelectedIcon('ui://pkg005/icon-selected');
	child.setInstanceTitleColor('#ffcc00');
	child.setInstanceTitleFontSize(24);
	child.setInstanceController('state');
	child.setInstancePage('1');
	child.setInstanceChecked(true);
	child.setInstanceSound('ui://pkg005/click');
	child.setInstanceSoundVolumeScale(0.45);

	const comboDef = doc.createComponent('ExtendedCombo');
	comboDef.setId('cmpCombo');
	comboDef.setPath('/');
	comboDef.setExtensionType('ComboBox');
	comboDef.setDropdown('ui://pkg005/dropdown');
	comboDef.setSelectionController('qualityOption');
	pkg.addResource(comboDef);

	const labelDef = doc.createComponent('ExtendedLabel');
	labelDef.setId('cmpLabel');
	labelDef.setPath('/');
	labelDef.setExtensionType('Label');
	labelDef.setPromptText('[color=#959595]查找...[/color]');
	pkg.addResource(labelDef);

	const comboChild = doc.createGComponent('combo-inst');
	comboChild.setId('n1');
	comboChild.setSrc('cmpCombo');
	comboChild.setInstanceExtType('ComboBox');
	comboChild.setInstanceTitle('选项A');
	comboChild.setInstanceIcon('ui://pkg005/iconA');
	comboChild.setInstanceTitleColor('#336699');
	comboChild.setInstancePopupDirection(2);
	comboChild.setInstanceSound('ui://pkg005/combo-click');
	comboChild.setInstanceSoundVolumeScale(0.55);
	comboChild.setInstanceSelectionController('qualityOption');
	comboChild.setInstanceVisibleItemCount(6);
	comboChild.setInstanceComboItems([
		{ title: 'A', value: '1', icon: 'ui://pkg005/a' },
		{ title: 'B', value: '2', icon: null },
	]);

	const labelChild = doc.createGComponent('label-inst');
	labelChild.setId('n3');
	labelChild.setSrc('cmpLabel');
	labelChild.setInstanceExtType('Label');
	labelChild.setInstancePromptText('[color=#959595]查找...[/color]');
	labelChild.setInstanceSound('ui://pkg005/label-click');
	labelChild.setInstanceSoundVolumeScale(0.65);

	const progressChild = doc.createGComponent('progress-inst');
	progressChild.setId('n4');
	progressChild.setInstanceExtType('ProgressBar');
	progressChild.setInstanceValue(25);
	progressChild.setInstanceMax(50);
	progressChild.setInstanceMin(5);
	progressChild.setInstanceSound('ui://pkg005/progress-click');
	progressChild.setInstanceSoundVolumeScale(0.75);

	const listChild = doc.createGList('list-inst');
	listChild.setId('n2');
	listChild.setSrc('ui://pkg005/list');
	listChild.setPageController('state');
	listChild.setControllerOverrides('list,0');

	host.addChild(child);
	host.addChild(comboChild);
	host.addChild(listChild);
	host.addChild(labelChild);
	host.addChild(progressChild);
	pkg.addResource(host);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);
		const hostXml = await fs.readFile(path.join(tmpDir, 'assets', 'Demo5', 'Host.xml'), 'utf-8');
		const buttonDefXml = await fs.readFile(path.join(tmpDir, 'assets', 'Demo5', 'ExtendedButton.xml'), 'utf-8');
		const comboDefXml = await fs.readFile(path.join(tmpDir, 'assets', 'Demo5', 'ExtendedCombo.xml'), 'utf-8');
		const labelDefXml = await fs.readFile(path.join(tmpDir, 'assets', 'Demo5', 'ExtendedLabel.xml'), 'utf-8');

		t.true(buttonDefXml.includes('<Button'), 'button definition writes Button extension node');
		t.true(buttonDefXml.includes('mode="Radio"'), 'button definition writes canonical mode attr');
		t.true(buttonDefXml.includes('sound="ui://pkg005/click"'), 'button definition writes canonical sound attr');
		t.true(buttonDefXml.includes('volume="60"'), 'button definition writes canonical percent volume attr');
		t.true(buttonDefXml.includes('downEffect="1"'), 'button definition writes canonical downEffect attr');
		t.true(buttonDefXml.includes('downEffectValue="0.75"'), 'button definition writes explicit downEffectValue when downEffect is enabled');
		t.true(comboDefXml.includes('<ComboBox'), 'combo definition writes ComboBox extension node');
		t.true(comboDefXml.includes('dropdown="ui://pkg005/dropdown"'), 'combo definition writes canonical dropdown attr');
		t.true(comboDefXml.includes('selectionController="qualityOption"'), 'combo definition writes canonical selectionController attr');
		t.true(labelDefXml.includes('<Label'), 'label definition writes Label extension node');
		t.true(labelDefXml.includes('prompt="[color=#959595]查找...[/color]"'), 'label definition writes canonical prompt attr');
		t.true(hostXml.includes('controller="button,1"'), 'component instance writes canonical controller override attr');
		t.true(hostXml.includes('pageController="state"'), 'component instance writes canonical pageController attr');
		t.true(hostXml.includes('<Button '), 'button instance writes Button overlay node');
		t.true(hostXml.includes('title="点我"'), 'button instance writes canonical title attr');
		t.true(hostXml.includes('selectedTitle="已选"'), 'button instance writes canonical selectedTitle attr');
		t.true(hostXml.includes('selectedIcon="ui://pkg005/icon-selected"'), 'button instance writes canonical selectedIcon attr');
		t.true(hostXml.includes('titleColor="#ffcc00"'), 'button instance writes canonical titleColor attr');
		t.true(hostXml.includes('titleFontSize="24"'), 'button instance writes canonical titleFontSize attr');
		t.true(hostXml.includes('page="1"'), 'button instance writes canonical page attr');
		t.true(hostXml.includes('checked="1"'), 'button instance writes canonical checked attr');
		t.regex(hostXml, /<Button\b[^>]*sound="ui:\/\/pkg005\/click"[^>]*volume="45"/, 'button instance writes canonical sound and percent volume attrs');
		t.regex(hostXml, /<Button\b[^>]*title="点我"[^>]*\/>/, 'button instance without children writes a self-closing overlay node');
		t.true(hostXml.includes('<ComboBox '), 'combo instance writes ComboBox overlay node');
		t.true(hostXml.includes('selectionController="qualityOption"'), 'combo instance writes canonical selectionController attr');
		t.true(hostXml.includes('visibleItemCount="6"'), 'combo instance writes canonical visibleItemCount attr');
		t.regex(hostXml, /<ComboBox\b[^>]*titleColor="#336699"[^>]*direction="down"[^>]*sound="ui:\/\/pkg005\/combo-click"[^>]*volume="55"/, 'combo instance writes all desktop overlay attrs');
		t.regex(hostXml, /<item\b[^>]*title="A"[^>]*value="1"[^>]*icon="ui:\/\/pkg005\/a"[^>]*\/>/, 'combo instance item writes canonical item attrs');
		t.regex(hostXml, /<Label\b[^>]*prompt="\[color=#959595\]查找\.\.\.\[\/color\]"/, 'label instance writes canonical prompt attr');
		t.regex(hostXml, /<Label\b[^>]*sound="ui:\/\/pkg005\/label-click"[^>]*volume="65"/, 'label instance writes canonical sound attrs');
		t.regex(hostXml, /<ProgressBar\b[^>]*sound="ui:\/\/pkg005\/progress-click"[^>]*volume="75"/, 'progress instance writes canonical sound attrs');

		const doc2 = await io.readProject(outFairy);
		const pkg2 = doc2.getRoot().getPackage('Demo5');
		t.truthy(pkg2, 'Demo5 package exists');

		const buttonDef2 = pkg2!.listComponents().find((item) => item.getName() === 'ExtendedButton');
		t.truthy(buttonDef2, 'ExtendedButton exists');
		t.is(buttonDef2!.getExtensionType(), 'Button');
		t.is(buttonDef2!.getButtonMode(), 2);
		t.is(buttonDef2!.getSound(), 'ui://pkg005/click');
		t.is(buttonDef2!.getSoundVolumeScale(), 0.6);
		t.is(buttonDef2!.getDownEffect(), 1);
		t.is(buttonDef2!.getDownEffectValue(), 0.75);

		const comboDef2 = pkg2!.listComponents().find((item) => item.getName() === 'ExtendedCombo');
		t.truthy(comboDef2, 'ExtendedCombo exists');
		t.is(comboDef2!.getExtensionType(), 'ComboBox');
		t.is(comboDef2!.getDropdown(), 'ui://pkg005/dropdown');
		t.is(comboDef2!.getSelectionController(), 'qualityOption');

		const labelDef2 = pkg2!.listComponents().find((item) => item.getName() === 'ExtendedLabel');
		t.truthy(labelDef2, 'ExtendedLabel exists');
		t.is(labelDef2!.getExtensionType(), 'Label');
		t.is(labelDef2!.getPromptText(), '[color=#959595]查找...[/color]');

		const host2 = pkg2!.listComponents().find((item) => item.getName() === 'Host');
		t.truthy(host2, 'Host exists');

		const child2 = host2!.listChildren().find((item) => item.getId() === 'n0') as ReturnType<Document['createGComponent']>;
		t.truthy(child2, 'button instance exists');
		t.is(child2.getPageController(), 'state');
		t.is(child2.getControllerOverrides(), 'button,1');
		t.is(child2.getInstanceExtType(), 'Button');
		t.is(child2.getInstanceTitle(), '点我');
		t.is(child2.getInstanceSelectedTitle(), '已选');
		t.is(child2.getInstanceIcon(), 'ui://pkg005/icon');
		t.is(child2.getInstanceSelectedIcon(), 'ui://pkg005/icon-selected');
		t.is(child2.getInstanceTitleColor(), '#ffcc00');
		t.is(child2.getInstanceTitleFontSize(), 24);
		t.is(child2.getInstanceController(), 'state');
		t.is(child2.getInstancePage(), '1');
		t.true(child2.getInstanceChecked());
		t.is(child2.getInstanceSound(), 'ui://pkg005/click');
		t.is(child2.getInstanceSoundVolumeScale(), 0.45);

		const comboChild2 = host2!.listChildren().find((item) => item.getId() === 'n1') as ReturnType<Document['createGComponent']>;
		t.truthy(comboChild2, 'combo instance exists');
		t.is(comboChild2.getInstanceExtType(), 'ComboBox');
		t.is(comboChild2.getInstanceTitle(), '选项A');
		t.is(comboChild2.getInstanceIcon(), 'ui://pkg005/iconA');
		t.is(comboChild2.getInstanceTitleColor(), '#336699');
		t.is(comboChild2.getInstancePopupDirection(), 2);
		t.is(comboChild2.getInstanceSound(), 'ui://pkg005/combo-click');
		t.is(comboChild2.getInstanceSoundVolumeScale(), 0.55);
		t.is(comboChild2.getInstanceSelectionController(), 'qualityOption');
		t.is(comboChild2.getInstanceVisibleItemCount(), 6);
		t.deepEqual(comboChild2.getInstanceComboItems(), [
			{ title: 'A', value: '1', icon: 'ui://pkg005/a' },
			{ title: 'B', value: '2', icon: null },
		]);

		const labelChild2 = host2!.listChildren().find((item) => item.getId() === 'n3') as ReturnType<Document['createGComponent']>;
		t.truthy(labelChild2, 'label instance exists');
		t.is(labelChild2.getInstanceExtType(), 'Label');
		t.is(labelChild2.getInstancePromptText(), '[color=#959595]查找...[/color]');
		t.is(labelChild2.getInstanceSound(), 'ui://pkg005/label-click');
		t.is(labelChild2.getInstanceSoundVolumeScale(), 0.65);

		const progressChild2 = host2!.listChildren().find((item) => item.getId() === 'n4') as ReturnType<Document['createGComponent']>;
		t.truthy(progressChild2, 'progress instance exists');
		t.is(progressChild2.getInstanceExtType(), 'ProgressBar');
		t.is(progressChild2.getInstanceValue(), 25);
		t.is(progressChild2.getInstanceMax(), 50);
		t.is(progressChild2.getInstanceMin(), 5);
		t.is(progressChild2.getInstanceSound(), 'ui://pkg005/progress-click');
		t.is(progressChild2.getInstanceSoundVolumeScale(), 0.75);

		const listChild2 = host2!.listChildren().find((item) => item.getId() === 'n2') as ReturnType<Document['createGList']>;
		t.truthy(listChild2, 'list instance exists');
		t.is(listChild2.getPageController(), 'state');
		t.is(listChild2.getControllerOverrides(), 'list,0');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('writer: extension child nodes require extension metadata before being emitted', async (t) => {
	const io = new NodeIO();
	const doc = new Document();
	doc.getRoot().setProjectId('proj-ext-gate').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('DemoExtGate');
	pkg.setId('pkgExtGate');

	const plainDef = doc.createComponent('PlainComponent');
	plainDef.setId('cmpPlain');
	plainDef.setPath('/');
	plainDef.setButtonMode?.(2);
	pkg.addResource(plainDef);

	const buttonDef = doc.createComponent('ButtonComponent');
	buttonDef.setId('cmpButton');
	buttonDef.setPath('/');
	buttonDef.setExtensionType('Button');
	buttonDef.setButtonMode?.(2);
	pkg.addResource(buttonDef);

	const host = doc.createComponent('Host');
	host.setId('cmpHost');
	host.setPath('/');

	const plainChild = doc.createGComponent('plainChild');
	plainChild.setId('n0');
	plainChild.setSrc('cmpPlain');
	plainChild.setInstanceTitle?.('不应写出');

	const buttonChildWithoutExt = doc.createGComponent('buttonChildWithoutExt');
	buttonChildWithoutExt.setId('n1');
	buttonChildWithoutExt.setSrc('cmpButton');
	buttonChildWithoutExt.setInstanceTitle?.('仍不应写出');

	const buttonChildWithExt = doc.createGComponent('buttonChildWithExt');
	buttonChildWithExt.setId('n2');
	buttonChildWithExt.setSrc('cmpButton');
	buttonChildWithExt.setInstanceExtType?.('Button');
	buttonChildWithExt.setInstanceTitle?.('应该写出');

	host.addChild(plainChild);
	host.addChild(buttonChildWithoutExt);
	host.addChild(buttonChildWithExt);
	pkg.addResource(host);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-ext-gate-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const plainXml = await fs.readFile(path.join(tmpDir, 'assets', 'DemoExtGate', 'PlainComponent.xml'), 'utf-8');
		const buttonXml = await fs.readFile(path.join(tmpDir, 'assets', 'DemoExtGate', 'ButtonComponent.xml'), 'utf-8');
		const hostXml = await fs.readFile(path.join(tmpDir, 'assets', 'DemoExtGate', 'Host.xml'), 'utf-8');

		t.false(plainXml.includes('<Button'), 'root component without extention must not emit Button extension child');
		t.true(buttonXml.includes('<Button'), 'root component with Button extention emits Button extension child');
		t.false(hostXml.includes('不应写出'), 'instance overlay attrs must not be emitted without instance extension type');
		t.true(hostXml.includes('<Button '), 'instance with extension metadata emits overlay child');
		t.true(hostXml.includes('title="应该写出"'), 'instance overlay attrs are emitted when instance extension type is set');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: advanced groups survive write→read', async (t) => {
	const io = new NodeIO();
	const doc = new Document();
	doc.getRoot().setProjectId('proj-groups').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('Demo');
	pkg.setId('pkg1');

	const comp = doc.createComponent('Host');
	comp.setId('comp1');
	comp.setPath('/');
	comp.setSize(300, 200);

	const plainGroup = doc.createGGroup('plain');
	plainGroup.setId('g0');

	const advancedGroup = doc.createGGroup('advanced');
	advancedGroup.setId('g1');
	advancedGroup.setAdvanced(true);

	const text = doc.createGTextField('label');
	text.setId('n0');
	text.setText('hello');
	text.setGroup('g1');

	comp.addChild(plainGroup);
	comp.addChild(advancedGroup);
	comp.addChild(text);
	pkg.addResource(comp);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);
		const doc2 = await io.readProject(outFairy);
		const comp2 = doc2.getRoot().getPackage('Demo')?.listComponents().find((item) => item.getName() === 'Host');
		t.truthy(comp2, 'Host component exists');

		const groups = comp2!.listChildren().filter((child) => child.propertyType === 'GGroup');
		t.is(groups.length, 2, 'both editor groups remain in project model');
		const advanced2 = groups.find((child) => child.getId() === 'g1');
		const plain2 = groups.find((child) => child.getId() === 'g0');
		t.true((advanced2 as ReturnType<Document['createGGroup']>)?.getAdvanced?.() ?? false, 'advanced group flag survives');
		t.false((plain2 as ReturnType<Document['createGGroup']>)?.getAdvanced?.() ?? true, 'plain group stays non-advanced');

		const text2 = comp2!.listChildren().find((child) => child.getId() === 'n0') as ReturnType<Document['createGTextField']> | undefined;
		t.is(text2?.getGroup(), 'g1', 'child group reference survives');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});
