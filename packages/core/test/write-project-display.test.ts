import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getFixtureProjectPath } from '@openfairygui/test-utils';
import { Document, PropertyType } from '../src/index.js';
import { NodeIO } from '../src/node.js';

const PROJECT_PATH = getFixtureProjectPath('FairyGUI-unity', 'UIProject/FairyGUI-Unity-Examples.fairy');

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
		const comp2 = doc2.getRoot().getPackage('Demo2')?.listComponents().find((item) => item.getName() === 'Shapes');
		t.truthy(comp2, 'Shapes component exists');

		const rect2 = comp2!.listChildren().find((child) => child.getId() === 'n0') as ReturnType<Document['createGGraph']>;
		t.truthy(rect2, 'rect graph exists');
		t.deepEqual(rect2.getCornerRadius(), [1, 2, 3, 4]);

		const polygon2 = comp2!.listChildren().find((child) => child.getId() === 'n1') as ReturnType<Document['createGGraph']>;
		t.truthy(polygon2, 'polygon graph exists');
		t.is(polygon2.getSides(), 5);
		t.is(polygon2.getStartAngle(), 12.5);
		t.deepEqual(polygon2.getDistances(), [1, 0.8, 0.6]);

		const points2 = comp2!.listChildren().find((child) => child.getId() === 'n2') as ReturnType<Document['createGGraph']>;
		t.truthy(points2, 'points graph exists');
		t.deepEqual(points2.getPoints(), [0, 0, 20, 0, 20, 10]);

		const loader2 = comp2!.listChildren().find((child) => child.getId() === 'n3') as ReturnType<Document['createGLoader']>;
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
	text.setShadowColor('#112233');
	text.setShadowOffset({ x: 2, y: 3 });

	const rich = doc.createGRichTextField('rich');
	rich.setId('n1');
	rich.setText('world');
	rich.setShadowColor('#445566');
	rich.setShadowOffset({ x: 4, y: 5 });
	rich.setUnderlaySoftness(0.056);

	text.setFaceDilate(0.324);
	text.setUnderlaySoftness(1);

	comp.addChild(text);
	comp.addChild(rich);
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
		t.true(/<text\b[^>]*underlaySoftness="1"/.test(componentXml), 'text writes canonical underlaySoftness attr');
		t.true(/<richtext\b[^>]*underlaySoftness="0.056"/.test(componentXml), 'richtext writes canonical underlaySoftness attr');

		const doc2 = await io.readProject(outFairy);
		const comp2 = doc2.getRoot().getPackage('DemoText')?.listComponents().find((item) => item.getName() === 'TextShadow');
		t.truthy(comp2, 'TextShadow component exists');

		const text2 = comp2!.listChildren().find((child) => child.getId() === 'n0') as ReturnType<Document['createGTextField']>;
		t.truthy(text2, 'plain text exists');
		t.is(text2.getDemoText?.(), 'preview');
		t.true(text2.getTemplateVarsEnabled?.());
		t.is(text2.getFaceDilate?.(), 0.324);
		t.is(text2.getUnderlaySoftness?.(), 1);
		t.is(text2.getShadowColor(), '#112233');
		t.deepEqual(text2.getShadowOffset(), { x: 2, y: 3 });

		const rich2 = comp2!.listChildren().find((child) => child.getId() === 'n1') as ReturnType<Document['createGRichTextField']>;
		t.truthy(rich2, 'rich text exists');
		t.is(rich2.getUnderlaySoftness?.(), 0.056);
		t.is(rich2.getShadowColor(), '#445566');
		t.deepEqual(rich2.getShadowOffset(), { x: 4, y: 5 });
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
		t.true(componentXml.includes('text="&lt;a href=&apos;event:xx&apos;&gt;click&lt;/a&gt;"'), 'text attrs escape apostrophes and angle brackets');
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
		const comp2 = doc2.getRoot().getPackage('DemoVersion7')?.listComponents().find((item) => item.getName() === 'Version7Attrs');
		t.truthy(comp2, 'Version7Attrs component exists');

		const text2 = comp2!.listChildren().find((child) => child.getId() === 'n0') as ReturnType<Document['createGTextField']>;
		t.truthy(text2, 'text exists');
		t.true(text2.getStrikethrough());

		const loader2 = comp2!.listChildren().find((child) => child.getId() === 'n1') as ReturnType<Document['createGLoader']>;
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
	comp.setDesignImageAlpha(100);
	comp.setDesignImageLayer(1);
	comp.setDesignImageOffsetX(-428);
	comp.setDesignImageOffsetY(-238);
	comp.setIdNum(7);
	comp.setInitName('frame');
	comp.setOverflow(2);
	comp.setScrollType(2);
	comp.setScrollBarDisplay(2);
	comp.setScrollBarFlags(1184);

	const group = doc.createGGroup('toolbar');
	group.setId('g0');
	group.setAdvanced(true);
	group.setColumnGap(5);
	group.setExcludeInvisibles(true);

	const loader = doc.createGLoader('icon');
	loader.setId('n-1');
	loader.setUrl('ui://pkgProtocol/icon');
	loader.setFill(1);
	loader.setShrinkOnly(true);
	loader.setUseResize(true);
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

		const componentXml = await fs.readFile(path.join(tmpDir, 'assets', 'ProtocolDemo', 'CanonicalAttrs.xml'), 'utf-8');
		t.true(componentXml.includes('pivot="0.5,0.5"'), 'component root writes canonical pivot attr');
		t.true(/anchor(?:="true")?/.test(componentXml), 'component root writes canonical anchor attr');
		t.true(componentXml.includes('restrictSize="120,0,0,0"'), 'component root writes canonical restrictSize attr');
		t.true(/bgColorEnabled(?:="true")?/.test(componentXml), 'component root writes canonical bgColorEnabled attr');
		t.true(componentXml.includes('bgColor="#383838"'), 'component root writes canonical bgColor attr');
		t.true(componentXml.includes('designImageAlpha="100"'), 'component root writes canonical designImageAlpha attr');
		t.true(componentXml.includes('designImageLayer="1"'), 'component root writes canonical designImageLayer attr');
		t.true(componentXml.includes('designImageOffsetX="-428"'), 'component root writes canonical designImageOffsetX attr');
		t.true(componentXml.includes('designImageOffsetY="-238"'), 'component root writes canonical designImageOffsetY attr');
		t.true(componentXml.includes('idnum="7"'), 'component root writes canonical idnum attr');
		t.true(componentXml.includes('initName="frame"'), 'component root writes canonical initName attr');
		t.true(componentXml.includes('scrollBarFlags="1184"'), 'component root writes canonical scrollBarFlags attr');
		t.true(componentXml.includes('<loader'), 'loader node is written');
		t.true(componentXml.includes('useResize="1"'), 'loader writes canonical useResize attr');
		t.true(componentXml.includes('fill="scale"'), 'loader writes canonical fill attr');
		t.true(/<loader\b[^>]*clearOnPublish(?:="true")?/.test(componentXml), 'loader writes canonical clearOnPublish attr');
		t.false(/<loader\b[^>]*\balign=/.test(componentXml), 'loader omits default align attr');
		t.false(/<loader\b[^>]*\bvAlign=/.test(componentXml), 'loader omits default vAlign attr');
		t.true(componentXml.includes('<richtext'), 'richtext node is written');
		t.true(componentXml.includes('font="ui://pkgProtocol/font"'), 'richtext writes canonical font attr');
		t.true(componentXml.includes('color="#ccff00"'), 'text color attrs are normalized to lowercase');
		t.true(/singleLine(?:="true")?/.test(componentXml), 'richtext writes canonical singleLine attr');
		t.true(/<richtext\b[^>]*autoClearText(?:="true")?/.test(componentXml), 'richtext writes canonical autoClearText attr');
		t.true(/ubb(?:="true")?/.test(componentXml), 'richtext writes canonical ubb attr');
		t.true(componentXml.includes('strokeColor="#ffffff"'), 'richtext writes canonical strokeColor attr');
		t.true(componentXml.includes('shadowColor="#000000"'), 'text shadowColor attrs are normalized to lowercase');
		t.true(componentXml.includes('shadowOffset="1,2"'), 'richtext writes canonical shadowOffset attr');
		t.true(/<richtext\b[^>]*rotation="30"[^>]*alpha="0.55"[^>]*touchable="false"[^>]*grayed(?:="true")?/.test(componentXml), 'richtext writes canonical common display attrs');
		t.true(componentXml.includes('animation="idle"'), 'loader3D uses canonical animation attr');
		t.false(componentXml.includes('animationName='), 'loader3D no longer writes model field name');
		t.false(/<loader3d\b[^>]*\balign=/.test(componentXml), 'loader3D omits default align attr');
		t.false(/<loader3d\b[^>]*\bvAlign=/.test(componentXml), 'loader3D omits default vAlign attr');
		t.true(componentXml.includes('prompt="Search here"'), 'text input uses canonical prompt attr');
		t.true(/<inputtext\b[^>]*text=""[^>]*color="#ff3300"/.test(componentXml), 'text input preserves explicit empty text and lowercases color attrs');
		t.true(/<inputtext\b[^>]*autoClearText(?:="true")?/.test(componentXml), 'text input writes canonical autoClearText attr');
		t.true(/<inputtext\b[^>]*rotation="15"[^>]*alpha="0.65"[^>]*touchable="false"[^>]*grayed(?:="true")?/.test(componentXml), 'text input writes canonical common display attrs');
		t.false(componentXml.includes('promptText='), 'text input no longer writes model field name');
		t.true(componentXml.includes('colGap="5"'), 'group uses canonical colGap attr');
		t.true(/excludeInvisibles(?:="true")?/.test(componentXml), 'group writes excludeInvisibles attr');
		t.true(componentXml.includes('colGap="8"'), 'list uses canonical colGap attr');
		t.true(componentXml.includes('layout="flow_hz"'), 'list uses editor layout attr values');
		t.true(componentXml.includes('lineItemCount="9999"'), 'list uses canonical lineItemCount attr');
		t.true(componentXml.includes('autoItemSize="false"'), 'list uses canonical autoItemSize attr');
		t.false(componentXml.includes('columnGap='), 'writer no longer emits legacy columnGap attr');
		t.true(componentXml.includes('selectionController="page"'), 'list writes selectionController attr');

		const doc2 = await io.readProject(outFairy);
		const comp2 = doc2.getRoot().getPackage('ProtocolDemo')?.listComponents().find((item) => item.getName() === 'CanonicalAttrs');
		t.truthy(comp2, 'CanonicalAttrs component exists after round-trip');
		t.true(comp2?.getPivotAsAnchor?.(), 'component root anchor survives round-trip');
		t.is(comp2?.getMinWidth?.(), 120, 'component root restrictSize survives round-trip');
		t.true(comp2?.getBgColorEnabled?.(), 'component root bgColorEnabled survives round-trip');
		t.is(comp2?.getBgColor?.(), '#383838', 'component root bgColor survives round-trip');
		t.is(comp2?.getDesignImageAlpha?.(), 100, 'component root designImageAlpha survives round-trip');
		t.is(comp2?.getDesignImageLayer?.(), 1, 'component root designImageLayer survives round-trip');
		t.is(comp2?.getDesignImageOffsetX?.(), -428, 'component root designImageOffsetX survives round-trip');
		t.is(comp2?.getDesignImageOffsetY?.(), -238, 'component root designImageOffsetY survives round-trip');
		t.is(comp2?.getIdNum?.(), 7, 'component root idnum survives round-trip');
		t.is(comp2?.getInitName?.(), 'frame', 'component root initName survives round-trip');
		t.is(comp2?.getOverflow?.(), 2, 'component root overflow survives round-trip');
		t.is(comp2?.getScrollBarFlags?.(), 1184, 'component root scrollBarFlags survive round-trip');

		const byId = new Map(comp2!.listChildren().map((child) => [child.getId(), child as any]));
		t.true(byId.get('n-1')?.getUseResize?.(), 'loader useResize survives round-trip');
		t.is(byId.get('n-1')?.getFill?.(), 1, 'loader fill survives round-trip');
		t.true(byId.get('n-1')?.getClearOnPublish?.(), 'loader clearOnPublish survives round-trip');
		t.is(byId.get('g0')?.getColumnGap?.(), 5, 'group colGap survives round-trip');
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

		const doc2 = await io.readProject(outFairy);
		const comp2 = doc2.getRoot().getPackage('Demo3')?.listComponents().find((item) => item.getName() === 'Lists');
		t.truthy(comp2, 'Lists component exists');

		const list2 = comp2!.listChildren().find((child) => child.getId() === 'n0') as ReturnType<Document['createGList']>;
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
		const decodedTree = decodedComp?.listChildren().find((child) => child.getId() === 'tree01') as ReturnType<Document['createGTree']>;
		t.truthy(decodedTree, 'tree exists after round-trip');
		t.deepEqual(decodedTree.getListItems().map((item) => ({
			title: item.title,
			level: item.level,
			isFolder: item.isFolder,
		})), [
			{ title: 'Empty folder', level: 0, isFolder: true },
		]);
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
		t.true(treeXml.includes('<item title="Folder 1" level="0" isFolder="true"/>'), 'tree root folders keep their inferred folder state');
		t.true(treeXml.includes('<item title="Folder 2" level="0" isFolder="true"/>'), 'second tree root folder keeps its inferred folder state');
		t.regex(treeXml, /<item title="Leaf 1"[^>]* level="1" isFolder="false"\/>/, 'tree leaves keep their inferred leaf state');

		const doc2 = await io.readProject(outFairy);
		const treeViewPkg = doc2.getRoot().listPackages().find((pkg) => pkg.getName() === 'TreeView');
		const main = treeViewPkg?.listComponents().find((comp) => comp.getName() === 'Main');
		t.truthy(main, 'TreeView/Main exists after round-trip');

		const tree = main?.listChildren().find((child) => child.getName?.() === 'tree') as ReturnType<Document['createGTree']> | undefined;
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
		t.deepEqual(runtimeRoot?.children.map((node) => node.title), ['Folder 1', 'Folder 2']);
		t.deepEqual(runtimeRoot?.children[0]?.children.map((node) => node.title), ['Leaf 1', 'Leaf 2', 'Leaf 3', 'Leaf 4']);
		t.deepEqual(runtimeRoot?.children[1]?.children.map((node) => node.title), ['Leaf 1']);

		const collapsed = tree?.collapseAll();
		t.deepEqual(tree?.listVisibleRuntimeNodes(collapsed).map((node) => node.title), ['Folder 1', 'Folder 2']);

		const selectedLeaf = tree?.selectRuntimeNode(collapsed ?? {}, 6);
		t.deepEqual(selectedLeaf, {
			expandedItemIndices: [5],
			selectedItemIndices: [6],
			lastSelectedItemIndex: 6,
		});
		t.is(tree?.getSelectedRuntimeNode(selectedLeaf)?.title, 'Leaf 1');
		t.deepEqual(tree?.listVisibleRuntimeNodes(selectedLeaf).map((node) => node.title), ['Folder 1', 'Folder 2', 'Leaf 1']);

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
