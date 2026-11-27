import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getFixtureProjectPath } from '@openfairygui/test-utils';
import {
	Document,
	GearType,
	liftDocumentToUamProject,
	materializeUamProject,
	PropertyType,
	RelationType,
	TransitionActionType,
} from '../src/index.js';
import { assertDisplayListTagAllowed, createDisplayObject } from '../src/io/display-object-xml-reader.js';
import { NodeIO } from '../src/node.js';

const PROJECT_PATH = getFixtureProjectPath('FairyGUI-unity', 'UIProject/FairyGUI-Unity-Examples.fairy');

test('zero pivot retains anchor semantics on component roots and display children', async (t) => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-zero-pivot-'));
	t.teardown(() => fs.rm(directory, { recursive: true, force: true }));
	const doc = new Document();
	const pkg = doc.createPackage('Pivot').setId('pivot');
	const comp = doc.createComponent('Panel').setId('panel').setPivotAsAnchor(true);
	comp.addChild(doc.createGGraph('shape').setId('shape').setPivot(0, 0, true));
	pkg.addResource(comp);
	const io = new NodeIO();
	const target = path.join(directory, 'Pivot.fairy');
	await io.writeProject(doc, target);
	const restored = (await io.readProject(target)).getRoot().listPackages()[0]!.listComponents()[0]!;
	t.true(restored.getPivotAsAnchor());
	t.true(restored.listChildren()[0]!.getPivotAsAnchor());
	const binaryPath = path.join(directory, 'Pivot.bytes');
	await io.writeBinary(doc, binaryPath);
	const binaryComponent = (await io.readBinary(binaryPath)).getRoot().listPackages()[0]!.listComponents()[0]!;
	t.true(binaryComponent.getPivotAsAnchor());
	t.true(binaryComponent.listChildren()[0]!.getPivotAsAnchor());
});

// ─── Round-trip: read → write → read ──────────────────────────────────────

test('round-trip: component scrollpane/mask/hittest and image fill attrs survive write→read', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('test-project').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('Demo');
	pkg.setId('pkg001');

	const imageRes = doc.createImageResource('bg.png');
	imageRes.setId('img001');
	imageRes.setPath('/');
	pkg.addResource(imageRes);

	const comp = doc.createComponent('Panel');
	comp.setId('comp001');
	comp.setPath('/');
	comp.setSize(300, 200);
	comp.setOverflow(2);
	comp.setMask('n0');
	comp.setReversedMask(true);
	comp.setHitTest('n1');
	comp.setCustomData('payload');
	comp.setScrollType(2);
	comp.setScrollBarDisplay(2);
	comp.setScrollBarFlags(7);
	comp.setScrollBarMargin({ top: 1, bottom: 2, left: 3, right: 4 });
	comp.setVtScrollBarRes('ui://pkg001/vt');
	comp.setHzScrollBarRes('ui://pkg001/hz');
	comp.setHeaderRes('ui://pkg001/header');
	comp.setFooterRes('ui://pkg001/footer');

	const mask = doc.createGImage('mask');
	mask.setId('n0');
	mask.setSrc('img001');

	const image = doc.createGImage('filled');
	image.setId('n1');
	image.setSrc('img001');
	image.setFillMethod(5);
	image.setFillOrigin(2);
	image.setFillClockwise(false);
	image.setFillAmount(0.35);

	comp.addChild(mask);
	comp.addChild(image);
	pkg.addResource(comp);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const doc2 = await io.readProject(outFairy);
		const pkg2 = doc2.getRoot().getPackage('Demo');
		t.truthy(pkg2, 'Demo package exists');
		const comp2 = pkg2!.listComponents().find((item) => item.getName() === 'Panel');
		t.truthy(comp2, 'Panel component exists');
		t.is(comp2!.getMask(), 'n0');
		t.true(comp2!.getReversedMask());
		t.is(comp2!.getHitTest(), 'n1');
		t.is(comp2!.getCustomData(), 'payload');
		t.is(comp2!.getScrollType(), 2);
		t.is(comp2!.getScrollBarDisplay(), 2);
		t.is(comp2!.getScrollBarFlags(), 7);
		t.deepEqual(comp2!.getScrollBarMargin(), { top: 1, bottom: 2, left: 3, right: 4 });
		t.is(comp2!.getVtScrollBarRes(), 'ui://pkg001/vt');
		t.is(comp2!.getHzScrollBarRes(), 'ui://pkg001/hz');
		t.is(comp2!.getHeaderRes(), 'ui://pkg001/header');
		t.is(comp2!.getFooterRes(), 'ui://pkg001/footer');

		const image2 = comp2!.listChildren().find((child) => child.getId() === 'n1');
		t.truthy(image2, 'filled child exists');
		t.is((image2 as ReturnType<Document['createGImage']>).getFillMethod(), 5);
		t.is((image2 as ReturnType<Document['createGImage']>).getFillOrigin(), 2);
		t.false((image2 as ReturnType<Document['createGImage']>).getFillClockwise());
		t.is((image2 as ReturnType<Document['createGImage']>).getFillAmount(), 0.35);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('writer: component root omits default vertical scroll and default scrollBar mode', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('test-project').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('DemoScrollDefaults');
	pkg.setId('pkgScrollDefaults');

	const comp = doc.createComponent('Panel');
	comp.setId('compScrollDefaults');
	comp.setPath('/');
	comp.setSize(300, 200);
	comp.setOverflow(2);
	comp.setScrollType(1);
	comp.setScrollBarDisplay(0);

	pkg.addResource(comp);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-scroll-defaults-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);
		const componentXml = await fs.readFile(path.join(tmpDir, 'assets', 'DemoScrollDefaults', 'Panel.xml'), 'utf-8');
		t.true(componentXml.includes('overflow="scroll"'), 'component keeps scroll overflow');
		t.false(componentXml.includes('scroll="vertical"'), 'component omits default vertical scroll attr');
		t.false(componentXml.includes('scrollBar="default"'), 'component omits default scrollBar mode attr');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: loader fill and graph geometry attrs survive write→read', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('test-project').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('Demo2');
	pkg.setId('pkg002');

	const comp = doc.createComponent('Shapes');
	comp.setId('comp002');
	comp.setPath('/');
	comp.setSize(400, 300);

	const graphRect = doc.createGGraph('rect');
	graphRect.setId('n0');
	graphRect.setGraphType(1);
	graphRect.setLineSize(2);
	graphRect.setLineColor('#112233');
	graphRect.setFillColor('#445566');
	graphRect.setCornerRadius([1, 2, 3, 4]);

	const graphPolygon = doc.createGGraph('polygon');
	graphPolygon.setId('n1');
	graphPolygon.setGraphType(4);
	graphPolygon.setSides(5);
	graphPolygon.setStartAngle(12.5);
	graphPolygon.setDistances([1, 0.8, 0.6]);

	const graphPoints = doc.createGGraph('points');
	graphPoints.setId('n2');
	graphPoints.setGraphType(3);
	graphPoints.setPoints([0, 0, 20, 0, 20, 10]);

	const loader = doc.createGLoader('loader');
	loader.setId('n3');
	loader.setUrl('ui://pkg002/demo');
	loader.setAlign(2);
	loader.setVAlign(1);
	loader.setFill(5);
	loader.setShrinkOnly(true);
	loader.setAutoSize(true);
	loader.setColor('#778899');
	loader.setPlaying(false);
	loader.setFrame(3);
	loader.setFillMethod(4);
	loader.setFillOrigin(1);
	loader.setFillClockwise(false);
	loader.setFillAmount(0.42);

	comp.addChild(graphRect);
	comp.addChild(graphPolygon);
	comp.addChild(graphPoints);
	comp.addChild(loader);
	pkg.addResource(comp);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const doc2 = await io.readProject(outFairy);
		const comp2 = doc2
			.getRoot()
			.getPackage('Demo2')
			?.listComponents()
			.find((item) => item.getName() === 'Shapes');
		t.truthy(comp2, 'Shapes component exists');

		const rect2 = comp2!.listChildren().find((child) => child.getId() === 'n0') as ReturnType<
			Document['createGGraph']
		>;
		t.truthy(rect2, 'rect graph exists');
		t.deepEqual(rect2.getCornerRadius(), [1, 2, 3, 4]);

		const polygon2 = comp2!.listChildren().find((child) => child.getId() === 'n1') as ReturnType<
			Document['createGGraph']
		>;
		t.truthy(polygon2, 'polygon graph exists');
		t.is(polygon2.getSides(), 5);
		t.is(polygon2.getStartAngle(), 12.5);
		t.deepEqual(polygon2.getDistances(), [1, 0.8, 0.6]);

		const points2 = comp2!.listChildren().find((child) => child.getId() === 'n2') as ReturnType<
			Document['createGGraph']
		>;
		t.truthy(points2, 'points graph exists');
		t.deepEqual(points2.getPoints(), [0, 0, 20, 0, 20, 10]);

		const loader2 = comp2!.listChildren().find((child) => child.getId() === 'n3') as ReturnType<
			Document['createGLoader']
		>;
		t.truthy(loader2, 'loader exists');
		t.is(loader2.getUrl(), 'ui://pkg002/demo');
		t.is(loader2.getAlign(), 2);
		t.is(loader2.getVAlign(), 1);
		t.is(loader2.getFill(), 5);
		t.true(loader2.getShrinkOnly());
		t.true(loader2.getAutoSize());
		t.is(loader2.getColor(), '#778899');
		t.false(loader2.getPlaying());
		t.is(loader2.getFrame(), 3);
		t.is(loader2.getFillMethod(), 4);
		t.is(loader2.getFillOrigin(), 1);
		t.false(loader2.getFillClockwise());
		t.is(loader2.getFillAmount(), 0.42);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: text shadow attrs survive write→read', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('test-project').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('DemoText');
	pkg.setId('pkgText');

	const comp = doc.createComponent('TextShadow');
	comp.setId('compText');
	comp.setPath('/');
	comp.setSize(200, 100);

	const text = doc.createGTextField('plain');
	text.setId('n0');
	text.setText('hello');
	text.setDemoText('preview');
	text.setTemplateVarsEnabled(true);
	text.setAutoSize(4);
	text.setStrokeColor('#778899');
	text.setStrokeSize(0.244);
	text.setShadowColor('#112233');
	text.setShadowOffset({ x: 0, y: 0 });

	const rich = doc.createGRichTextField('rich');
	rich.setId('n1');
	rich.setText('world');
	rich.setShadowColor('#445566');
	rich.setShadowOffset({ x: 4, y: 5 });
	rich.setOutlineSoftness(0.375);
	rich.setUnderlaySoftness(0.056);
	rich.setAutoSize(4);

	const input = doc.createGTextInput('input');
	input.setId('n2');
	input.setText('input');
	input.setDemoText('input preview');
	input.setTemplateVarsEnabled(true);
	input.setFaceDilate(0.125);
	input.setOutlineSoftness(0.5);
	input.setUnderlaySoftness(0.25);
	input.setUbbEnabled(true);
	input.setAutoSize(4);
	input.setStrokeColor('#aabbcc');
	input.setStrokeSize(0.5);
	input.setShadowColor('#ddeeff');
	input.setShadowOffset({ x: 0, y: 2 });

	text.setFaceDilate(0.324);
	text.setOutlineSoftness(0.75);
	text.setUnderlaySoftness(1);

	comp.addChild(text);
	comp.addChild(rich);
	comp.addChild(input);
	pkg.addResource(comp);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const componentXml = await fs.readFile(path.join(tmpDir, 'assets', 'DemoText', 'TextShadow.xml'), 'utf-8');
		t.true(/<text\b[^>]*demoText="preview"/.test(componentXml), 'text writes canonical demoText attr');
		t.true(/<text\b[^>]*vars(?:="true")?/.test(componentXml), 'text writes canonical vars attr');
		t.true(/<text\b[^>]*faceDilate="0.324"/.test(componentXml), 'text writes canonical faceDilate attr');
		t.true(/<text\b[^>]*outlineSoftness="0.75"/.test(componentXml), 'text writes canonical outlineSoftness attr');
		t.true(/<text\b[^>]*underlaySoftness="1"/.test(componentXml), 'text writes canonical underlaySoftness attr');
		t.true(
			/<richtext\b[^>]*outlineSoftness="0.375"/.test(componentXml),
			'richtext writes canonical outlineSoftness attr',
		);
		t.true(
			/<richtext\b[^>]*underlaySoftness="0.056"/.test(componentXml),
			'richtext writes canonical underlaySoftness attr',
		);
		t.true(
			/<text\b[^>]*demoText="input preview"[^>]*input="true"/.test(componentXml),
			'input text writes canonical plain-text attrs with input="true"',
		);

		const doc2 = await io.readProject(outFairy);
		const comp2 = doc2
			.getRoot()
			.getPackage('DemoText')
			?.listComponents()
			.find((item) => item.getName() === 'TextShadow');
		t.truthy(comp2, 'TextShadow component exists');

		const text2 = comp2!.listChildren().find((child) => child.getId() === 'n0') as ReturnType<
			Document['createGTextField']
		>;
		t.truthy(text2, 'plain text exists');
		t.is(text2.getDemoText?.(), 'preview');
		t.true(text2.getTemplateVarsEnabled?.());
		t.is(text2.getFaceDilate?.(), 0.324);
		t.is(text2.getOutlineSoftness?.(), 0.75);
		t.is(text2.getUnderlaySoftness?.(), 1);
		t.is(text2.getAutoSize(), 4);
		t.is(text2.getStrokeSize(), 0.244);
		t.is(text2.getShadowColor(), '#112233');
		t.deepEqual(text2.getShadowOffset(), { x: 0, y: 0 });

		const rich2 = comp2!.listChildren().find((child) => child.getId() === 'n1') as ReturnType<
			Document['createGRichTextField']
		>;
		t.truthy(rich2, 'rich text exists');
		t.is(rich2.getOutlineSoftness?.(), 0.375);
		t.is(rich2.getUnderlaySoftness?.(), 0.056);
		t.is(rich2.getAutoSize(), 4);
		t.is(rich2.getShadowColor(), '#445566');
		t.deepEqual(rich2.getShadowOffset(), { x: 4, y: 5 });

		const input2 = comp2!.listChildren().find((child) => child.getId() === 'n2') as ReturnType<
			Document['createGTextInput']
		>;
		t.is(input2.getDemoText(), 'input preview');
		t.true(input2.getTemplateVarsEnabled());
		t.is(input2.getFaceDilate(), 0.125);
		t.is(input2.getOutlineSoftness(), 0.5);
		t.is(input2.getUnderlaySoftness(), 0.25);
		t.true(input2.getUbbEnabled());
		t.is(input2.getAutoSize(), 4);
		t.is(input2.getStrokeSize(), 0.5);
		t.deepEqual(input2.getShadowOffset(), { x: 0, y: 2 });
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('writer: display object attribute values escape XML special characters', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('test-project').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('EscapeXml');
	pkg.setId('pkgEscape');

	const comp = doc.createComponent('Escapes');
	comp.setId('cmpEscapes');
	comp.setPath('/');
	comp.setSize(400, 240);

	const text = doc.createGTextField('text');
	text.setId('n0');
	text.setText('line1\nline2');

	const rich = doc.createGRichTextField('rich');
	rich.setId('n1');
	rich.setText("<a href='event:xx'>click</a>");

	comp.addChild(text);
	comp.addChild(rich);
	pkg.addResource(comp);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-escape-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);
		const componentXml = await fs.readFile(path.join(tmpDir, 'assets', 'EscapeXml', 'Escapes.xml'), 'utf-8');
		t.true(componentXml.includes('text="line1&#xA;line2"'), 'text attrs escape newline as XML entity');
		t.true(
			componentXml.includes('text="&lt;a href=&apos;event:xx&apos;&gt;click&lt;/a&gt;"'),
			'text attrs escape apostrophes and angle brackets',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: loader useResize and text strikethrough attrs survive write→read', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('test-project').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('DemoVersion7');
	pkg.setId('pkgv7');

	const comp = doc.createComponent('Version7Attrs');
	comp.setId('compV7');
	comp.setPath('/');
	comp.setSize(240, 120);

	const text = doc.createGTextField('plain');
	text.setId('n0');
	text.setText('strike');
	text.setStrikethrough(true);

	const loader = doc.createGLoader('loader');
	loader.setId('n1');
	loader.setUrl('ui://pkgv7/demo');
	loader.setUseResize(true);

	comp.addChild(text);
	comp.addChild(loader);
	pkg.addResource(comp);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const doc2 = await io.readProject(outFairy);
		const comp2 = doc2
			.getRoot()
			.getPackage('DemoVersion7')
			?.listComponents()
			.find((item) => item.getName() === 'Version7Attrs');
		t.truthy(comp2, 'Version7Attrs component exists');

		const text2 = comp2!.listChildren().find((child) => child.getId() === 'n0') as ReturnType<
			Document['createGTextField']
		>;
		t.truthy(text2, 'text exists');
		t.true(text2.getStrikethrough());

		const loader2 = comp2!.listChildren().find((child) => child.getId() === 'n1') as ReturnType<
			Document['createGLoader']
		>;
		t.truthy(loader2, 'loader exists');
		t.true(loader2.getUseResize());
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('writer: uses canonical XML attr names for component root, loader, text nodes, loader3D, group, and list nodes', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('proj-xml-protocol').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('ProtocolDemo');
	pkg.setId('pkgProtocol');

	const comp = doc.createComponent('CanonicalAttrs');
	comp.setId('compProtocol');
	comp.setPath('/');
	comp.setSize(320, 240);
	comp.setPivotX(0.5);
	comp.setPivotY(0.5);
	comp.setPivotAsAnchor(true);
	comp.setMinWidth(120);
	comp.setBgColorEnabled(true);
	comp.setBgColor('#383838');
	comp.setDesignImage('ui://pkgProtocol/design');
	comp.setDesignImageForTest(true);
	comp.setDesignImageAlpha(100);
	comp.setDesignImageLayer(1);
	comp.setDesignImageOffsetX(-428);
	comp.setDesignImageOffsetY(-238);
	comp.setIdNum(7);
	comp.setInitName('frame');
	comp.setCustomExtensionId('demo.extension');
	comp.setPageController('page');
	comp.setAddedToStageSound('ui://pkgProtocol/show');
	comp.setRemovedFromStageSound('ui://pkgProtocol/hide');
	comp.setOverflow(2);
	comp.setScrollType(2);
	comp.setScrollBarDisplay(2);
	comp.setScrollBarFlags(1184);
	const pageController = doc.createController('page');
	pageController.addPage(doc.createControllerPage('Default').setId('0').setRemark('Default page'));
	comp.addController(pageController);

	const group = doc.createGGroup('toolbar');
	group.setId('g0');
	group.setAdvanced(true);
	group.setLayout(1);
	group.setColumnGap(5);
	group.setExcludeInvisibles(true);

	const loader = doc.createGLoader('icon');
	loader.setId('n-1');
	loader.setUrl('ui://pkgProtocol/icon');
	loader.setFill(1);
	loader.setShrinkOnly(true);
	loader.setUseResize(true);
	loader.setShowErrorSign(true);
	loader.setClearOnPublish(true);

	const loader3d = doc.createGLoader3D('avatar');
	loader3d.setId('n0');
	loader3d.setUrl('ui://pkgProtocol/avatar');
	loader3d.setAnimationName('idle');
	loader3d.setLoop(false);

	const input = doc.createGTextInput('search');
	input.setId('n1');
	input.setText('');
	input.setColor('#FF3300');
	input.setPromptText('Search here');
	input.setMaxLength(24);
	input.setRestrict('A-Z');
	input.setPassword(true);
	input.setKeyboardType(2);
	input.setAutoClearText(true);
	input.setTouchable(false);
	input.setGrayed(true);
	input.setAlpha(0.65);
	input.setRotation(15);

	const richText = doc.createGRichTextField('summary');
	richText.setId('n1_5');
	richText.setText('[url=detail]detail[/url]');
	richText.setFont('ui://pkgProtocol/font');
	richText.setFontSize(18);
	richText.setAlign(1);
	richText.setVAlign(1);
	richText.setAutoSize(0);
	richText.setSingleLine(true);
	richText.setAutoClearText(true);
	richText.setUbbEnabled(true);
	richText.setLeading(6);
	richText.setBold(true);
	richText.setColor('#CCFF00');
	richText.setStrokeColor('#FFFFFF');
	richText.setStrokeSize(2);
	richText.setShadowColor('#000000');
	richText.setShadowOffset({ x: 1, y: 2 });
	richText.setTouchable(false);
	richText.setGrayed(true);
	richText.setAlpha(0.55);
	richText.setRotation(30);

	const list = doc.createGList('tabs');
	list.setId('n2');
	list.setLayout(2);
	list.setColumnGap(8);
	list.setColumnCount(9999);
	list.setAutoResizeItem(false);
	list.setSelectionController('page');
	list.setDefaultItem('ui://pkgProtocol/tab');

	comp.addChild(loader);
	comp.addChild(group);
	comp.addChild(loader3d);
	comp.addChild(input);
	comp.addChild(richText);
	comp.addChild(list);
	pkg.addResource(comp);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-protocol-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const componentXml = await fs.readFile(
			path.join(tmpDir, 'assets', 'ProtocolDemo', 'CanonicalAttrs.xml'),
			'utf-8',
		);
		t.true(componentXml.includes('pivot="0.5,0.5"'), 'component root writes canonical pivot attr');
		t.true(/anchor(?:="true")?/.test(componentXml), 'component root writes canonical anchor attr');
		t.true(componentXml.includes('restrictSize="120,0,0,0"'), 'component root writes canonical restrictSize attr');
		t.true(/bgColorEnabled(?:="true")?/.test(componentXml), 'component root writes canonical bgColorEnabled attr');
		t.true(componentXml.includes('bgColor="#383838"'), 'component root writes canonical bgColor attr');
		t.true(
			componentXml.includes('designImage="ui://pkgProtocol/design"'),
			'component root writes canonical designImage attr',
		);
		t.true(
			/designImageForTest(?:="true")?/.test(componentXml),
			'component root writes canonical designImageForTest attr',
		);
		t.true(
			componentXml.includes('designImageAlpha="100"'),
			'component root writes canonical designImageAlpha attr',
		);
		t.true(componentXml.includes('designImageLayer="1"'), 'component root writes canonical designImageLayer attr');
		t.true(
			componentXml.includes('designImageOffsetX="-428"'),
			'component root writes canonical designImageOffsetX attr',
		);
		t.true(
			componentXml.includes('designImageOffsetY="-238"'),
			'component root writes canonical designImageOffsetY attr',
		);
		t.true(componentXml.includes('idnum="7"'), 'component root writes canonical idnum attr');
		t.true(componentXml.includes('initName="frame"'), 'component root writes canonical initName attr');
		t.true(
			componentXml.includes('customExtention="demo.extension"'),
			'component root writes canonical customExtention attr',
		);
		t.true(
			componentXml.includes('<remark page="0" value="Default page"'),
			'controller page remark is written by page index',
		);
		t.true(componentXml.includes('pageController="page"'), 'component root writes canonical pageController attr');
		t.true(
			componentXml.includes('showSound="ui://pkgProtocol/show"'),
			'component root writes canonical showSound attr',
		);
		t.true(
			componentXml.includes('hideSound="ui://pkgProtocol/hide"'),
			'component root writes canonical hideSound attr',
		);
		t.true(componentXml.includes('scrollBarFlags="1184"'), 'component root writes canonical scrollBarFlags attr');
		t.true(componentXml.includes('<loader'), 'loader node is written');
		t.true(componentXml.includes('useResize="true"'), 'loader writes canonical useResize attr');
		t.true(/<loader\b[^>]*errorSign(?:="true")?/.test(componentXml), 'loader writes canonical errorSign attr');
		t.true(componentXml.includes('fill="scale"'), 'loader writes canonical fill attr');
		t.true(
			/<loader\b[^>]*clearOnPublish(?:="true")?/.test(componentXml),
			'loader writes canonical clearOnPublish attr',
		);
		t.false(/<loader\b[^>]*\balign=/.test(componentXml), 'loader omits default align attr');
		t.false(/<loader\b[^>]*\bvAlign=/.test(componentXml), 'loader omits default vAlign attr');
		t.true(componentXml.includes('<richtext'), 'richtext node is written');
		t.true(componentXml.includes('font="ui://pkgProtocol/font"'), 'richtext writes canonical font attr');
		t.true(componentXml.includes('color="#ccff00"'), 'text color attrs are normalized to lowercase');
		t.true(/singleLine(?:="true")?/.test(componentXml), 'richtext writes canonical singleLine attr');
		t.true(
			/<richtext\b[^>]*autoClearText(?:="true")?/.test(componentXml),
			'richtext writes canonical autoClearText attr',
		);
		t.true(/ubb(?:="true")?/.test(componentXml), 'richtext writes canonical ubb attr');
		t.true(componentXml.includes('strokeColor="#ffffff"'), 'richtext writes canonical strokeColor attr');
		t.true(componentXml.includes('shadowColor="#000000"'), 'text shadowColor attrs are normalized to lowercase');
		t.true(componentXml.includes('shadowOffset="1,2"'), 'richtext writes canonical shadowOffset attr');
		t.true(
			/<richtext\b(?=[^>]*rotation="30")(?=[^>]*alpha="0.55")(?=[^>]*touchable="false")(?=[^>]*grayed="true")/.test(
				componentXml,
			),
			'richtext writes canonical common display attrs',
		);
		t.true(/<loader3D\b/.test(componentXml), 'loader3D uses editor-compatible tag case');
		t.false(/<loader3d\b/.test(componentXml), 'loader3D does not use lowercase tag');
		t.true(componentXml.includes('animation="idle"'), 'loader3D uses canonical animation attr');
		t.false(componentXml.includes('animationName='), 'loader3D no longer writes model field name');
		t.false(/<loader3D\b[^>]*\balign=/.test(componentXml), 'loader3D omits default align attr');
		t.false(/<loader3D\b[^>]*\bvAlign=/.test(componentXml), 'loader3D omits default vAlign attr');
		t.true(componentXml.includes('prompt="Search here"'), 'text input uses canonical prompt attr');
		t.true(
			/<text\b[^>]*text=""[^>]*color="#ff3300"[^>]*input="true"/.test(componentXml),
			'text input preserves explicit empty text, lowercases color attrs, and writes input="true"',
		);
		t.true(
			/<text\b[^>]*autoClearText(?:="true")?[^>]*input="true"/.test(componentXml),
			'text input writes canonical autoClearText attr',
		);
		t.true(
			/<text\b(?=[^>]*input="true")(?=[^>]*rotation="15")(?=[^>]*alpha="0.65")(?=[^>]*touchable="false")(?=[^>]*grayed="true")/.test(
				componentXml,
			),
			'text input writes canonical common display attrs',
		);
		t.false(componentXml.includes('promptText='), 'text input no longer writes model field name');
		t.true(componentXml.includes('colGap="5"'), 'group uses canonical colGap attr');
		t.true(/<group\b[^>]*layout="hz"/.test(componentXml), 'group uses editor layout attr values');
		t.true(/excludeInvisibles(?:="true")?/.test(componentXml), 'group writes excludeInvisibles attr');
		t.true(componentXml.includes('colGap="8"'), 'list uses canonical colGap attr');
		t.true(componentXml.includes('layout="flow_hz"'), 'list uses editor layout attr values');
		t.true(componentXml.includes('lineItemCount="9999"'), 'list uses canonical lineItemCount attr');
		t.false(componentXml.includes('autoItemSize='), 'flow list omits its false autoItemSize default');
		t.false(componentXml.includes('columnGap='), 'writer no longer emits legacy columnGap attr');
		t.true(componentXml.includes('selectionController="page"'), 'list writes selectionController attr');

		const doc2 = await io.readProject(outFairy);
		const comp2 = doc2
			.getRoot()
			.getPackage('ProtocolDemo')
			?.listComponents()
			.find((item) => item.getName() === 'CanonicalAttrs');
		t.truthy(comp2, 'CanonicalAttrs component exists after round-trip');
		t.true(comp2?.getPivotAsAnchor?.(), 'component root anchor survives round-trip');
		t.is(comp2?.getMinWidth?.(), 120, 'component root restrictSize survives round-trip');
		t.true(comp2?.getBgColorEnabled?.(), 'component root bgColorEnabled survives round-trip');
		t.is(comp2?.getBgColor?.(), '#383838', 'component root bgColor survives round-trip');
		t.is(comp2?.getDesignImage?.(), 'ui://pkgProtocol/design', 'component root designImage survives round-trip');
		t.true(comp2?.getDesignImageForTest?.(), 'component root designImageForTest survives round-trip');
		t.is(comp2?.getDesignImageAlpha?.(), 100, 'component root designImageAlpha survives round-trip');
		t.is(comp2?.getDesignImageLayer?.(), 1, 'component root designImageLayer survives round-trip');
		t.is(comp2?.getDesignImageOffsetX?.(), -428, 'component root designImageOffsetX survives round-trip');
		t.is(comp2?.getDesignImageOffsetY?.(), -238, 'component root designImageOffsetY survives round-trip');
		t.is(comp2?.getIdNum?.(), 7, 'component root idnum survives round-trip');
		t.is(comp2?.getInitName?.(), 'frame', 'component root initName survives round-trip');
		t.is(comp2?.getCustomExtensionId?.(), 'demo.extension', 'component root customExtention survives round-trip');
		t.is(
			comp2?.getController('page')?.listPages()[0]?.getRemark(),
			'Default page',
			'controller page remark survives round-trip',
		);
		t.is(comp2?.getPageController?.(), 'page', 'component root pageController survives round-trip');
		t.is(comp2?.getAddedToStageSound?.(), 'ui://pkgProtocol/show', 'component root showSound survives round-trip');
		t.is(
			comp2?.getRemovedFromStageSound?.(),
			'ui://pkgProtocol/hide',
			'component root hideSound survives round-trip',
		);
		t.is(comp2?.getOverflow?.(), 2, 'component root overflow survives round-trip');
		t.is(comp2?.getScrollBarFlags?.(), 1184, 'component root scrollBarFlags survive round-trip');

		const byId = new Map(comp2!.listChildren().map((child) => [child.getId(), child as any]));
		t.true(byId.get('n-1')?.getUseResize?.(), 'loader useResize survives round-trip');
		t.true(byId.get('n-1')?.getShowErrorSign?.(), 'loader errorSign survives round-trip');
		t.is(byId.get('n-1')?.getFill?.(), 1, 'loader fill survives round-trip');
		t.true(byId.get('n-1')?.getClearOnPublish?.(), 'loader clearOnPublish survives round-trip');
		t.is(byId.get('g0')?.getColumnGap?.(), 5, 'group colGap survives round-trip');
		t.is(byId.get('g0')?.getLayout?.(), 1, 'group layout survives round-trip');
		t.true(byId.get('g0')?.getExcludeInvisibles?.(), 'group excludeInvisibles survives round-trip');
		t.is(byId.get('n0')?.getAnimationName?.(), 'idle', 'loader3D animation survives round-trip');
		t.false(byId.get('n0')?.getLoop?.(), 'loader3D loop survives round-trip');
		t.is(byId.get('n1')?.getPromptText?.(), 'Search here', 'text input prompt survives round-trip');
		t.is(byId.get('n1')?.getText?.(), '', 'text input empty text survives round-trip');
		t.true(byId.get('n1')?.getAutoClearText?.(), 'text input autoClearText survives round-trip');
		t.is(byId.get('n1')?.getMaxLength?.(), 24, 'text input maxLength survives round-trip');
		t.is(byId.get('n1')?.getRestrict?.(), 'A-Z', 'text input restrict survives round-trip');
		t.true(byId.get('n1')?.getPassword?.(), 'text input password survives round-trip');
		t.is(byId.get('n1')?.getKeyboardType?.(), 2, 'text input keyboardType survives round-trip');
		t.false(byId.get('n1')?.getTouchable?.(), 'text input touchable survives round-trip');
		t.true(byId.get('n1')?.getGrayed?.(), 'text input grayed survives round-trip');
		t.is(byId.get('n1')?.getAlpha?.(), 0.65, 'text input alpha survives round-trip');
		t.is(byId.get('n1')?.getRotation?.(), 15, 'text input rotation survives round-trip');
		t.is(byId.get('n1_5')?.getFont?.(), 'ui://pkgProtocol/font', 'richtext font survives round-trip');
		t.true(byId.get('n1_5')?.getAutoClearText?.(), 'richtext autoClearText survives round-trip');
		t.true(byId.get('n1_5')?.getUbbEnabled?.(), 'richtext ubb survives round-trip');
		t.true(byId.get('n1_5')?.getSingleLine?.(), 'richtext singleLine survives round-trip');
		t.is(byId.get('n1_5')?.getStrokeSize?.(), 2, 'richtext strokeSize survives round-trip');
		t.false(byId.get('n1_5')?.getTouchable?.(), 'richtext touchable survives round-trip');
		t.true(byId.get('n1_5')?.getGrayed?.(), 'richtext grayed survives round-trip');
		t.is(byId.get('n1_5')?.getAlpha?.(), 0.55, 'richtext alpha survives round-trip');
		t.is(byId.get('n1_5')?.getRotation?.(), 30, 'richtext rotation survives round-trip');
		t.is(byId.get('n2')?.getColumnGap?.(), 8, 'list colGap survives round-trip');
		t.is(byId.get('n2')?.getColumnCount?.(), 9999, 'flow list lineItemCount survives as columnCount');
		t.false(byId.get('n2')?.getAutoResizeItem?.(), 'list autoItemSize survives round-trip');
		t.is(byId.get('n2')?.getSelectionController?.(), 'page', 'list selectionController survives round-trip');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: list scroll attrs and static items survive write→read', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('test-project').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('Demo3');
	pkg.setId('pkg003');

	const comp = doc.createComponent('Lists');
	comp.setId('comp003');
	comp.setPath('/');
	comp.setSize(320, 240);

	const list = doc.createGList('main-list');
	list.setId('n0');
	list.setSrc('ui://pkg003/List');
	list.setLayout(4);
	list.setLineGap(6);
	list.setColumnGap(8);
	list.setLineCount(5);
	list.setColumnCount(3);
	list.setSelectionMode(1);
	list.setDefaultItem('ui://pkg003/item');
	list.setOverflow(2);
	list.setScrollType(2);
	list.setScrollBarDisplay(3);
	list.setScrollBarFlags(9);
	list.setMargin({ top: 1, bottom: 2, left: 3, right: 4 });
	list.setClipSoftness({ x: 5, y: 6 });
	list.setListItems([
		{
			title: 'A',
			icon: 'ui://pkg003/iconA',
			url: 'ui://pkg003/itemA',
			name: 'itemA',
			selectedTitle: 'A*',
			selectedIcon: 'ui://pkg003/iconASelected',
			level: 0,
			isFolder: null,
			controllers: 'bg,0,type,0',
		},
		{
			title: 'B',
			icon: null,
			url: null,
			name: 'itemB',
			selectedTitle: null,
			selectedIcon: null,
			level: 0,
			isFolder: null,
		},
	]);

	comp.addChild(list);
	pkg.addResource(comp);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);
		const listXml = await fs.readFile(path.join(tmpDir, 'assets', 'Demo3', 'Lists.xml'), 'utf-8');
		t.true(listXml.includes('controllers="bg,0,type,0"'), 'list static item writes canonical controllers attr');
		t.true(listXml.includes('lineItemCount="3"'), 'pagination list writes horizontal column count');
		t.true(listXml.includes('lineItemCount2="5"'), 'pagination list writes vertical row count');
		t.true(listXml.includes('scrollBar="hidden"'), 'list writes canonical scrollBar mode');

		const doc2 = await io.readProject(outFairy);
		const comp2 = doc2
			.getRoot()
			.getPackage('Demo3')
			?.listComponents()
			.find((item) => item.getName() === 'Lists');
		t.truthy(comp2, 'Lists component exists');

		const list2 = comp2!.listChildren().find((child) => child.getId() === 'n0') as ReturnType<
			Document['createGList']
		>;
		t.truthy(list2, 'list exists');
		t.is(list2.getLayout(), 4);
		t.is(list2.getLineGap(), 6);
		t.is(list2.getColumnGap(), 8);
		t.is(list2.getLineCount(), 5);
		t.is(list2.getColumnCount(), 3);
		t.is(list2.getSelectionMode(), 1);
		t.is(list2.getDefaultItem(), 'ui://pkg003/item');
		t.is(list2.getOverflow(), 2);
		t.is(list2.getScrollType(), 2);
		t.is(list2.getScrollBarDisplay(), 3);
		t.is(list2.getScrollBarFlags(), 9);
		t.deepEqual(list2.getMargin(), { top: 1, bottom: 2, left: 3, right: 4 });
		t.deepEqual(list2.getClipSoftness(), { x: 5, y: 6 });
		t.deepEqual(list2.getListItems(), [
			{
				title: 'A',
				icon: 'ui://pkg003/iconA',
				url: 'ui://pkg003/itemA',
				name: 'itemA',
				selectedTitle: 'A*',
				selectedIcon: 'ui://pkg003/iconASelected',
				level: 0,
				isFolder: null,
				controllers: 'bg,0,type,0',
			},
			{
				title: 'B',
				icon: null,
				url: null,
				name: 'itemB',
				selectedTitle: null,
				selectedIcon: null,
				level: 0,
				isFolder: null,
			},
		]);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: explicit empty tree folder survives write→read', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('tree-folder-project').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('TreePkg');
	pkg.setId('treepkg01');

	const comp = doc.createComponent('TreeHost');
	comp.setId('treehost01');
	comp.setPath('/');
	comp.setSize(320, 240);

	const tree = doc.createGTree('tree');
	tree.setId('tree01');
	tree.setListItems([
		{
			title: 'Empty folder',
			icon: null,
			url: null,
			name: null,
			selectedTitle: null,
			selectedIcon: null,
			level: 0,
			isFolder: true,
		},
	]);

	comp.addChild(tree);
	pkg.addResource(comp);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);
		const treeXml = await fs.readFile(path.join(tmpDir, 'assets', 'TreePkg', 'TreeHost.xml'), 'utf-8');
		t.true(
			treeXml.includes('<item title="Empty folder" level="0" isFolder="true"/>'),
			'explicit empty folder writes canonical isFolder attr',
		);

		const roundTripped = await io.readProject(outFairy);
		const decodedComp = roundTripped.getRoot().getPackage('TreePkg')?.getComponent('TreeHost');
		const decodedTree = decodedComp?.listChildren().find((child) => child.getId() === 'tree01') as ReturnType<
			Document['createGTree']
		>;
		t.truthy(decodedTree, 'tree exists after round-trip');
		t.deepEqual(
			decodedTree.getListItems().map((item) => ({
				title: item.title,
				level: item.level,
				isFolder: item.isFolder,
			})),
			[{ title: 'Empty folder', level: 0, isFolder: true }],
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: tree view list attrs and static item hierarchy survive write→read', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject(PROJECT_PATH);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);
		const treeXml = await fs.readFile(path.join(tmpDir, 'assets', 'TreeView', 'Main.xml'), 'utf-8');
		t.true(
			treeXml.includes('<item title="Folder 1" level="0" isFolder="true"/>'),
			'tree root folders keep their inferred folder state',
		);
		t.true(
			treeXml.includes('<item title="Folder 2" level="0" isFolder="true"/>'),
			'second tree root folder keeps its inferred folder state',
		);
		t.regex(
			treeXml,
			/<item title="Leaf 1"[^>]* level="1" isFolder="false"\/>/,
			'tree leaves keep their inferred leaf state',
		);

		const doc2 = await io.readProject(outFairy);
		const treeViewPkg = doc2
			.getRoot()
			.listPackages()
			.find((pkg) => pkg.getName() === 'TreeView');
		const main = treeViewPkg?.listComponents().find((comp) => comp.getName() === 'Main');
		t.truthy(main, 'TreeView/Main exists after round-trip');

		const tree = main?.listChildren().find((child) => child.getName?.() === 'tree') as
			| ReturnType<Document['createGTree']>
			| undefined;
		t.truthy(tree, 'tree list exists after round-trip');
		t.is(tree?.propertyType, PropertyType.G_TREE);
		t.true(tree?.getTreeView?.());
		t.is(tree?.getIndent?.(), 15);
		t.is(tree?.getClickToExpand?.(), 1);
		t.deepEqual(
			tree?.getListItems?.().map((item) => ({
				title: item.title,
				level: item.level,
				isFolder: item.isFolder,
			})),
			[
				{ title: 'Folder 1', level: 0, isFolder: true },
				{ title: 'Leaf 1', level: 1, isFolder: false },
				{ title: 'Leaf 2', level: 1, isFolder: false },
				{ title: 'Leaf 3', level: 1, isFolder: false },
				{ title: 'Leaf 4', level: 1, isFolder: false },
				{ title: 'Folder 2', level: 0, isFolder: true },
				{ title: 'Leaf 1', level: 1, isFolder: false },
			],
		);

		const template = tree?.inspectDefaultItemTemplate(doc2.getRoot());
		t.truthy(template, 'tree item template still resolves after round-trip');
		t.is(template?.component.getName(), 'TreeItem');
		t.is(template?.expandedController?.getName(), 'expanded');
		t.is(template?.leafController?.getName(), 'leaf');
		t.is(template?.indentChild?.getName(), 'indent');
		t.is(template?.expandButtonChild?.getName(), 'expandButton');

		const runtimeRoot = tree?.buildRuntimeTree();
		t.truthy(runtimeRoot, 'runtime tree hierarchy resolves after round-trip');
		t.is(runtimeRoot?.children.length, 2);
		t.deepEqual(
			runtimeRoot?.children.map((node) => node.title),
			['Folder 1', 'Folder 2'],
		);
		t.deepEqual(
			runtimeRoot?.children[0]?.children.map((node) => node.title),
			['Leaf 1', 'Leaf 2', 'Leaf 3', 'Leaf 4'],
		);
		t.deepEqual(
			runtimeRoot?.children[1]?.children.map((node) => node.title),
			['Leaf 1'],
		);

		const collapsed = tree?.collapseAll();
		t.deepEqual(
			tree?.listVisibleRuntimeNodes(collapsed).map((node) => node.title),
			['Folder 1', 'Folder 2'],
		);

		const selectedLeaf = tree?.selectRuntimeNode(collapsed ?? {}, 6);
		t.deepEqual(selectedLeaf, {
			expandedItemIndices: [5],
			selectedItemIndices: [6],
			lastSelectedItemIndex: 6,
		});
		t.is(tree?.getSelectedRuntimeNode(selectedLeaf)?.title, 'Leaf 1');
		t.deepEqual(
			tree?.listVisibleRuntimeNodes(selectedLeaf).map((node) => node.title),
			['Folder 1', 'Folder 2', 'Leaf 1'],
		);

		const keyboardExpand = tree?.navigateRuntimeSelection(tree.selectRuntimeNode(collapsed ?? {}, 0), 'right');
		t.deepEqual(keyboardExpand, {
			expandedItemIndices: [0],
			selectedItemIndices: [0],
			lastSelectedItemIndex: 0,
		});
		const keyboardEnterChild = tree?.navigateRuntimeSelection(keyboardExpand ?? {}, 'right');
		t.deepEqual(keyboardEnterChild, {
			expandedItemIndices: [0],
			selectedItemIndices: [1],
			lastSelectedItemIndex: 1,
		});
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('loader3D XML reader accepts both <loader3D> and legacy <loader3d>, writing canonical <loader3D>', async (t) => {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-loader3d-case-'));
	t.teardown(() => fs.rm(dir, { recursive: true, force: true }));

	const projectPath = path.join(dir, 'LoaderCase.fairy');
	const pkgDir = path.join(dir, 'assets', 'Main');
	await fs.mkdir(pkgDir, { recursive: true });
	await fs.writeFile(projectPath, '<projectDescription id="loader3dcase" type="Unity" version="3.0"/>\n', 'utf8');
	await fs.writeFile(
		path.join(pkgDir, 'package.xml'),
		'<packageDescription id="pkgcase"><resources><component id="cmp1" name="Main.xml" path="/" exported="true"/></resources></packageDescription>\n',
		'utf8',
	);
	await fs.writeFile(
		path.join(pkgDir, 'Main.xml'),
		`<component size="200,200">
  <displayList>
    <loader3D id="n0" name="canonical" xy="10,20" size="80,80" animation="idle"/>
    <loader3d id="n1" name="legacy" xy="90,20" size="80,80" animation="run"/>
  </displayList>
</component>
`,
		'utf8',
	);

	const io = new NodeIO();
	const doc = await io.readProject(projectPath);
	const comp = doc.getRoot().getPackage('Main')?.getComponent('Main');
	t.truthy(comp);
	const children = comp?.listChildren() ?? [];
	t.is(children.length, 2);
	t.is(children[0]?.propertyType, PropertyType.G_LOADER_3D);
	t.is(children[1]?.propertyType, PropertyType.G_LOADER_3D);

	const outDir = path.join(dir, 'out');
	await fs.mkdir(outDir, { recursive: true });
	const outFairy = path.join(outDir, 'LoaderCase.fairy');
	await io.writeProject(doc, outFairy);
	const outXml = await fs.readFile(path.join(outDir, 'assets', 'Main', 'Main.xml'), 'utf8');
	t.is(outXml.match(/<loader3D\b/g)?.length, 2, 'both GLoader3D nodes write canonical <loader3D>');
	t.false(/<loader3d\b/.test(outXml), 'written project XML contains no lowercase <loader3d>');

	const reread = await io.readProject(outFairy);
	t.is(reread.getRoot().getPackage('Main')?.getComponent('Main')?.listChildren().length, 2);

	const directDoc = new Document();
	const dummyCtx = {} as Parameters<typeof createDisplayObject>[0];
	const controllers = new Map();
	for (const tag of ['loader3D', 'loader3d']) {
		t.notThrows(() => assertDisplayListTagAllowed(tag, { '@_id': 'n0', '@_name': tag }, 'Direct'));
		const obj = createDisplayObject(dummyCtx, directDoc, tag, { '@_id': 'n0', '@_name': tag }, controllers);
		t.is(obj?.propertyType, PropertyType.G_LOADER_3D);
	}
});

test('XML protocol drift regressions: booleans, graph types, loader3D defaults, fillAmount, fileName, and extension overlays', async (t) => {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-xml-drift-a-'));
	t.teardown(() => fs.rm(dir, { recursive: true, force: true }));

	const doc = new Document();
	doc.getRoot().setProjectId('xml-drift-a').setProjectType(0).setVersion('3.0');
	const pkg = doc.createPackage('DriftA').setId('pkgdrifta');

	const imgRes = doc.createImageResource('bg.png').setId('img01').setPath('/images/');
	pkg.addResource(imgRes);
	for (const [id, name, ext] of [
		['btn01', 'Btn', 'Button'],
		['cmb01', 'Cmb', 'ComboBox'],
		['pb01', 'Pb', 'ProgressBar'],
		['sl01', 'Sl', 'Slider'],
		['sb01', 'Sb', 'ScrollBar'],
	] as const) {
		pkg.addResource(doc.createComponent(name).setId(id).setPath('/').setSize(40, 20).setExtensionType(ext));
	}

	const comp = doc
		.createComponent('Main')
		.setId('cmp01')
		.setPath('/')
		.setSize(400, 300)
		.setMask('n0')
		.setReversedMask(true)
		.setScrollType(0)
		.setScrollBarDisplay(2)
		.setScrollBarFlags(128)
		.setScrollBarMargin({ top: 1, bottom: 2, left: 3, right: 4 })
		.setVtScrollBarRes('ui://pkgdrifta/vbar')
		.setHzScrollBarRes('ui://pkgdrifta/hbar')
		.setHeaderRes('ui://pkgdrifta/hdr')
		.setFooterRes('ui://pkgdrifta/ftr');
	comp.setRelations([{ target: 'n0', type: RelationType.Width, usePercent: false }]);

	const image = doc.createGImage('img').setId('n0').setSrc('img01').setFileName('images/bg.png').setFillMethod(1);
	t.is(image.getFillAmount(), 1, 'new GImage defaults fillAmount to 1 on 0..1 scale');

	const text = doc.createGTextField('txt').setId('n1').setText('strike').setStrikethrough(true);

	const ellipse = doc.createGGraph('ellipse').setId('n2').setGraphType(2).setSize(40, 40);
	const regPoly = doc
		.createGGraph('star')
		.setId('n3')
		.setGraphType(4)
		.setSides(4)
		.setDistances([1, 0.5, 1, 0.5])
		.setSize(60, 60);

	const grp = doc.createGGroup('grp').setId('g0');
	const loader = doc
		.createGLoader('ldr')
		.setId('n4')
		.setGroup('g0')
		.setShrinkOnly(true)
		.setAutoSize(true)
		.setUseResize(true)
		.setFillMethod(1);
	t.is(loader.getFillAmount(), 1, 'new GLoader defaults fillAmount to 1 on 0..1 scale');

	const loader3dDefault = doc.createGLoader3D('l3dDefault').setId('n5').setGroup('g0').setUrl('ui://pkgdrifta/sk');
	t.false(loader3dDefault.getLoop(), 'new GLoader3D defaults loop to false');

	const loader3dLoop = doc.createGLoader3D('l3dLoop').setId('n6').setShrinkOnly(true).setAutoSize(true).setLoop(true);

	const btn = doc
		.createGButton('btn')
		.setId('n7')
		.setSrc('btn01')
		.setInstanceExtType('Button')
		.setInstanceChecked(true);
	const combo = doc
		.createGComboBox('combo')
		.setId('n8')
		.setSrc('cmb01')
		.setInstanceExtType('ComboBox')
		.setInstanceVisibleItemCount(5)
		.setInstanceSelectionController('c0');
	const pbar = doc
		.createGProgressBar('pbar')
		.setId('n9')
		.setSrc('pb01')
		.setInstanceExtType('ProgressBar')
		.setInstanceValue(30)
		.setInstanceMax(100);
	const slider = doc
		.createGSlider('slider')
		.setId('n10')
		.setSrc('sl01')
		.setInstanceExtType('Slider')
		.setInstanceValue(40)
		.setInstanceMax(100);
	const sbar = doc.createGScrollBar('sbar').setId('n11').setSrc('sb01').setControllerOverrides('c0,1');

	const ctrl = doc.createController('c0');
	ctrl.addPage(doc.createControllerPage('p0').setId('0'));
	ctrl.addPage(doc.createControllerPage('p1').setId('1'));
	comp.addController(ctrl);

	const untouchable = doc.createGImage('untouchable').setId('n12').setSrc('img01').setTouchable(false);
	const lookGear = doc
		.createGear()
		.setGearType(GearType.Look)
		.setController(ctrl)
		.setPages('0,1')
		.setValues('1,0,0,1|0.5,0,0,0')
		.setDefaultValue('1,0,0,1');
	untouchable.addGear(lookGear);

	const trans = doc.createTransition('t0');
	trans.addItem(
		doc
			.createTransitionItem()
			.setTime(0)
			.setActionType(TransitionActionType.Text)
			.setTargetId('n1')
			.setStartValue(['01,000']),
	);
	trans.addItem(
		doc
			.createTransitionItem()
			.setTime(0)
			.setActionType(TransitionActionType.Icon)
			.setTargetId('n4')
			.setStartValue(['ui://pkgdrifta/a,b']),
	);
	trans.addItem(
		doc
			.createTransitionItem()
			.setTime(0)
			.setActionType(TransitionActionType.XY)
			.setTargetId('n0')
			.setTween(true)
			.setDuration(6)
			.setStartValue(['0', '0', '0.125', '0.25'])
			.setEndValue(['10', '20', '0.375', '0.5']),
	);
	comp.addTransition(trans);

	for (const child of [
		image,
		text,
		ellipse,
		regPoly,
		grp,
		loader,
		loader3dDefault,
		loader3dLoop,
		btn,
		combo,
		pbar,
		slider,
		sbar,
		untouchable,
	]) {
		comp.addChild(child);
	}
	pkg.addResource(comp);

	const io = new NodeIO();
	const outFairy = path.join(dir, 'DriftA.fairy');
	await io.writeProject(doc, outFairy);
	const xml = await fs.readFile(path.join(dir, 'assets', 'DriftA', 'Main.xml'), 'utf8');

	// X1: boolean attrs use "true", never "1"
	t.true(xml.includes('reversedMask="true"'));
	t.true(xml.includes('strikethrough="true"'));
	t.true(xml.includes('checked="true"'));
	t.true(/<loader\b[^>]*id="n4"[^>]*shrinkOnly="true"[^>]*autoSize="true"[^>]*useResize="true"/.test(xml));
	t.true(/<loader3D\b[^>]*id="n6"[^>]*shrinkOnly="true"[^>]*autoSize="true"/.test(xml));
	t.false(/\b(?:reversedMask|strikethrough|checked|shrinkOnly|autoSize|useResize)="1"/.test(xml));

	// X2: graph types
	t.true(/<graph\b[^>]*id="n2"[^>]*type="eclipse"/.test(xml));
	t.true(/<graph\b[^>]*id="n3"[^>]*type="regular_polygon"/.test(xml));

	// X3: loader3D loop default false, omits default fill/color/loop
	t.false(/<loader3D\b[^>]*id="n5"[^>]*(?:fill=|color=|loop=)/.test(xml));
	t.true(/<loader3D\b[^>]*id="n6"[^>]*loop="true"/.test(xml));

	// X5: root component relation
	t.true(xml.includes('<relation target="n0" sidePair="width-width"/>'));

	// X7 & X18: fillAmount=100 (not 10000) & image fileName
	t.true(/<image\b[^>]*id="n0"[^>]*fileName="images\/bg\.png"[^>]*fillAmount="100"/.test(xml));
	t.true(/<loader\b[^>]*id="n4"[^>]*fillAmount="100"/.test(xml));
	t.false(xml.includes('fillAmount="10000"'));

	// X10: gearLook retains ",1" when owner touchable=false
	t.true(xml.includes('values="1,0,0,1|0.5,0,0,0"'));
	t.true(xml.includes('default="1,0,0,1"'));

	// X12: raw Text/Icon transition values & 3-decimal XY percents
	t.true(xml.includes('<item time="0" type="Text" target="n1" value="01,000"/>'));
	t.true(xml.includes('<item time="0" type="Icon" target="n4" value="ui://pkgdrifta/a,b"/>'));
	t.true(xml.includes('startValue="0,0,0.125,0.25"'));
	t.true(xml.includes('endValue="10,20,0.375,0.5"'));

	// X13: ComboBox / ProgressBar / Slider / ScrollBar child instances emit overlays & component instance attrs
	t.true(xml.includes('<ComboBox selectionController="c0" visibleItemCount="5"/>'));
	t.true(xml.includes('<ProgressBar value="30" max="100"/>'));
	t.true(xml.includes('<Slider value="40" max="100"/>'));
	t.true(/<component\b[^>]*id="n11"[^>]*controller="c0,1"/.test(xml));

	// X14: loader/loader3D group attr
	t.true(/<loader\b[^>]*id="n4"[^>]*group="g0"/.test(xml));
	t.true(/<loader3D\b[^>]*id="n5"[^>]*group="g0"/.test(xml));

	// X17: root scroll/scrollBarMargin/scrollBarRes/ptrRes preserved without overflow="scroll", scrollBar/scrollBarFlags still gated
	t.true(xml.includes('scroll="horizontal"'));
	t.true(xml.includes('scrollBarMargin="1,2,3,4"'));
	t.true(xml.includes('scrollBarRes="ui://pkgdrifta/vbar,ui://pkgdrifta/hbar"'));
	t.true(xml.includes('ptrRes="ui://pkgdrifta/hdr,ui://pkgdrifta/ftr"'));
	t.false(xml.includes('scrollBar="auto"'));
	t.false(xml.includes('scrollBarFlags="128"'));

	// Round-trip through XML + UAM
	const reread = await io.readProject(outFairy);
	const uam = liftDocumentToUamProject(reread);
	const matDoc = materializeUamProject(uam);
	const matComp = matDoc.getRoot().getPackage('DriftA')?.getComponent('Main');
	t.truthy(matComp);
	t.deepEqual(matComp?.getRelations(), [{ target: 'n0', type: RelationType.Width, usePercent: false }]);
	t.is((matComp?.getChildById('n4') as any)?.getGroup?.(), 'g0');
	t.is((matComp?.getChildById('n5') as any)?.getGroup?.(), 'g0');
	t.false((matComp?.getChildById('n5') as any)?.getLoop?.());
	t.true((matComp?.getChildById('n6') as any)?.getLoop?.());
	t.is((matComp?.getChildById('n0') as any)?.getFillAmount?.(), 1);
	t.is((matComp?.getChildById('n4') as any)?.getFillAmount?.(), 1);
	const rereadComp = reread.getRoot().getPackage('DriftA')?.getComponent('Main');
	t.is(rereadComp?.getScrollType(), 0);
	t.deepEqual(rereadComp?.getScrollBarMargin(), { top: 1, bottom: 2, left: 3, right: 4 });
	t.is(rereadComp?.getVtScrollBarRes(), 'ui://pkgdrifta/vbar');
	t.is(rereadComp?.getHzScrollBarRes(), 'ui://pkgdrifta/hbar');
	t.is(rereadComp?.getHeaderRes(), 'ui://pkgdrifta/hdr');
	t.is(rereadComp?.getFooterRes(), 'ui://pkgdrifta/ftr');
	const rereadTransItems = rereadComp?.listTransitions()[0]?.listItems() ?? [];
	t.deepEqual(rereadTransItems[0]?.getStartValue(), ['01,000']);
	t.deepEqual(rereadTransItems[1]?.getStartValue(), ['ui://pkgdrifta/a,b']);
});

test('XML protocol drift regressions: shorthand sidePair, explicit <tree>, graph distances, single-value margins, legacy tags', async (t) => {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-xml-drift-b-'));
	t.teardown(() => fs.rm(dir, { recursive: true, force: true }));

	const projectPath = path.join(dir, 'DriftB.fairy');
	const pkgDir = path.join(dir, 'assets', 'DriftB');
	await fs.mkdir(pkgDir, { recursive: true });
	await fs.writeFile(projectPath, '<projectDescription id="driftb" type="Unity" version="3.0"/>\n', 'utf8');
	await fs.writeFile(
		path.join(pkgDir, 'package.xml'),
		`<packageDescription id="pkgdriftb">
  <resources>
    <component id="cmp01" name="Main.xml" path="/" exported="true"/>
    <movieclip id="mc01" name="Anim.jta" path="/"/>
  </resources>
</packageDescription>
`,
		'utf8',
	);
	await fs.writeFile(
		path.join(pkgDir, 'Main.xml'),
		`<component size="300,200" margin="10" scrollBarMargin="8">
  <displayList>
    <graph id="g0" name="el" xy="0,0" size="50,50" type="ellipse">
      <relation target="" sidePair="width,height,center-center,middle-middle,width%"/>
    </graph>
    <graph id="g1" name="rp" xy="60,0" size="50,50" type="regularpolygon" sides="4" distances=",0.5,,0.5"/>
    <tree id="t0" name="treeObj" xy="0,60" size="120,100" margin="6" scrollBarMargin="4"/>
    <inputtext id="i0" name="legacyInput" xy="130,60" size="100,30" text="abc" prompt="hint"/>
    <jta id="m0" name="legacyMc" src="mc01" xy="130,100"/>
  </displayList>
  <relation target="g0" sidePair="width"/>
</component>
`,
		'utf8',
	);

	const io = new NodeIO();
	const doc = await io.readProject(projectPath);
	const comp = doc.getRoot().getPackage('DriftB')?.getComponent('Main');
	t.truthy(comp);
	t.deepEqual(comp?.getMargin(), { top: 10, bottom: 10, left: 10, right: 10 });
	t.deepEqual(comp?.getScrollBarMargin(), { top: 8, bottom: 8, left: 8, right: 8 });
	t.deepEqual(comp?.getRelations(), [{ target: 'g0', type: RelationType.Width, usePercent: false }]);

	const g0 = comp?.getChildById('g0') as any;
	t.is(g0?.getGraphType(), 2);
	t.deepEqual(g0?.getRelations(), [
		{ target: '', type: RelationType.Width, usePercent: false },
		{ target: '', type: RelationType.Height, usePercent: false },
		{ target: '', type: RelationType.Center_Center, usePercent: false },
		{ target: '', type: RelationType.Middle_Middle, usePercent: false },
		{ target: '', type: RelationType.Width, usePercent: true },
	]);

	const g1 = comp?.getChildById('g1') as any;
	t.is(g1?.getGraphType(), 4);
	t.deepEqual(g1?.getDistances(), [1, 0.5, 1, 0.5]);

	const t0 = comp?.getChildById('t0') as any;
	t.is(t0?.propertyType, PropertyType.G_TREE);
	t.deepEqual(t0?.getMargin(), { top: 6, bottom: 6, left: 6, right: 6 });
	t.deepEqual(t0?.getScrollBarMargin(), { top: 4, bottom: 4, left: 4, right: 4 });

	t.is(comp?.getChildById('i0')?.propertyType, PropertyType.G_TEXT_INPUT);
	t.is(comp?.getChildById('m0')?.propertyType, PropertyType.G_MOVIE_CLIP);

	// Re-write normalizes legacy tags and graph types to canonical editor XML
	const outDir = path.join(dir, 'out');
	await fs.mkdir(outDir, { recursive: true });
	await io.writeProject(doc, path.join(outDir, 'DriftB.fairy'));
	const outXml = await fs.readFile(path.join(outDir, 'assets', 'DriftB', 'Main.xml'), 'utf8');
	t.true(/<graph\b[^>]*id="g0"[^>]*type="eclipse"/.test(outXml));
	t.true(/<graph\b[^>]*id="g1"[^>]*type="regular_polygon"/.test(outXml));
	t.true(/<list\b[^>]*id="t0"[^>]*treeView="true"/.test(outXml));
	t.true(/<text\b[^>]*id="i0"[^>]*input="true"[^>]*prompt="hint"/.test(outXml));
	t.true(/<movieclip\b[^>]*id="m0"/.test(outXml));
	t.false(/<(?:inputtext|jta)\b/.test(outXml));

	// Pinned FairyGUI-Editor fixture verifies real-world root <relation> and shorthand sidePair
	const editorFairy = getFixtureProjectPath('FairyGUI-Editor', 'ui/FairyGUI-Editor.fairy');
	const editorDoc = await io.readProject(editorFairy);
	const basicPkg = editorDoc.getRoot().getPackage('Basic');
	const btnWithIcon = basicPkg?.listComponents().find((c) => c.getName() === 'ButtonWithIcon');
	t.truthy(btnWithIcon);
	t.true(
		(btnWithIcon?.getRelations().length ?? 0) > 0,
		'FairyGUI-Editor Basic/ButtonWithIcon root <relation> is preserved',
	);
	const btnLight = basicPkg?.listComponents().find((c) => c.getName() === 'Button_light');
	t.truthy(btnLight);
	const btnLightChildWithWidthHeight = btnLight
		?.listChildren()
		.find((child) => child.getRelations().some((r) => r.type === RelationType.Width));
	t.truthy(btnLightChildWithWidthHeight, 'FairyGUI-Editor Basic/Button_light shorthand sidePair parses');
});
