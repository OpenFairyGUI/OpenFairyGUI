import test from 'ava';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Document, GearType, NodeIO, PropertyType } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_PATH = path.resolve(
	__dirname,
	'../../../referer/UIProject/FairyGUI-Unity-Examples/FairyGUI-Unity-Examples.fairy',
);

// ─── Round-trip: read → write → read ──────────────────────────────────────

test('round-trip: written project preserves package count', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject(PROJECT_PATH);
	const srcPackages = doc.getRoot().listPackages();

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const doc2 = await io.readProject(outFairy);
		t.is(
			doc2.getRoot().listPackages().length,
			srcPackages.length,
			'written project has same package count',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: package.xml is written for each package', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject(PROJECT_PATH);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		// Each package folder should have a package.xml
		const assetsDir = path.join(tmpDir, 'assets');
		const pkgDirs = await fs.readdir(assetsDir);
		t.true(pkgDirs.length > 0, 'at least one package directory written');

		for (const dir of pkgDirs) {
			const pkgXml = path.join(assetsDir, dir, 'package.xml');
			const stat = await fs.stat(pkgXml).catch(() => null);
			t.truthy(stat, `package.xml exists for package ${dir}`);
		}
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: written components are re-parseable', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject(PROJECT_PATH);

	const srcBasics = doc.getRoot().listPackages().find((p) => p.getName() === 'Basics')!;
	const srcCompCount = srcBasics.listComponents().length;

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const doc2 = await io.readProject(outFairy);
		const dstBasics = doc2.getRoot().listPackages().find((p) => p.getName() === 'Basics');
		t.truthy(dstBasics, 'Basics package exists in round-tripped project');
		t.is(dstBasics!.listComponents().length, srcCompCount, 'same component count after round-trip');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: Button controller pages survive write→read', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject(PROJECT_PATH);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const doc2 = await io.readProject(outFairy);
		const basics = doc2.getRoot().listPackages().find((p) => p.getName() === 'Basics')!;
		const button = basics.listComponents().find((c) => c.getName() === 'Button');
		t.truthy(button, 'Button exists in round-tripped project');
		const ctrl = button!.listControllers()[0];
		t.is(ctrl.listPages().length, 4, 'button controller still has 4 pages');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: .fairy file content is valid XML with projectDescription', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject(PROJECT_PATH);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);
		const content = await fs.readFile(outFairy, 'utf-8');
		t.true(content.includes('projectDescription'), '.fairy file contains projectDescription');
		t.true(content.includes('id='), '.fairy file has id attribute');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: font fileName and textureId survive package.xml write→read', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('font-project').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('FontPkg');
	pkg.setId('pkgfont1');

	const texture = doc.createImageResource('fontTexture.png');
	texture.setId('img001');
	texture.setPath('/');
	pkg.addResource(texture);

	const font = doc.createFontResource('DemoFont');
	font.setId('font001');
	font.setPath('/fonts/');
	font.setFileName('DemoFont.fnt');
	font.setTextureId('img001');
	pkg.addResource(font);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-font-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const pkgXml = await fs.readFile(path.join(tmpDir, 'assets', 'FontPkg', 'package.xml'), 'utf-8');
		t.true(pkgXml.includes('name="DemoFont.fnt"'), 'font file name is written to package.xml');
		t.true(pkgXml.includes('texture="img001"'), 'font texture id is written to package.xml');

		const doc2 = await io.readProject(outFairy);
		const pkg2 = doc2.getRoot().getPackage('FontPkg');
		t.truthy(pkg2, 'FontPkg exists after round-trip');
		const font2 = pkg2!.listResources().find((item) => item.propertyType === PropertyType.FONT_RESOURCE);
		t.truthy(font2, 'font resource exists after round-trip');
		t.is(font2!.getName(), 'DemoFont');
		t.is((font2 as ReturnType<Document['createFontResource']>).getFileName(), 'DemoFont.fnt');
		t.is((font2 as ReturnType<Document['createFontResource']>).getTextureId(), 'img001');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: controller action payload survives project write→read', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('controller-action-project').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('ActionPkg');
	pkg.setId('pkgAction');

	const comp = doc.createComponent('ActionHost');
	comp.setId('cmpAction');
	comp.setPath('/');
	comp.setSize(200, 120);

	const child = doc.createGComponent('panel');
	child.setId('n3');
	comp.addChild(child);

	const ctrl = doc.createController('state');
	const page0 = doc.createControllerPage('up');
	page0.setId('0');
	const page1 = doc.createControllerPage('down');
	page1.setId('1');
	ctrl.addPage(page0);
	ctrl.addPage(page1);

	const changePage = doc.createControllerAction('change');
	changePage
		.setActionType(1)
		.setFromPage(['0'])
		.setToPage(['1'])
		.setObjectId('n3')
		.setControllerName('modified')
		.setTargetPage('~1');
	ctrl.addAction(changePage);

	const playTransition = doc.createControllerAction('play');
	playTransition
		.setActionType(0)
		.setFromPage(['1'])
		.setToPage(['0'])
		.setTransitionName('t0')
		.setPlayTimes(2)
		.setDelay(0.25)
		.setStopOnExit(true);
	ctrl.addAction(playTransition);

	comp.addController(ctrl);
	pkg.addResource(comp);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-action-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const componentXml = await fs.readFile(path.join(tmpDir, 'assets', 'ActionPkg', 'ActionHost.xml'), 'utf-8');
		t.true(componentXml.includes('type="change_page"'), 'change_page action is written');
		t.true(componentXml.includes('objectId="n3"'), 'change_page payload is written');
		t.true(componentXml.includes('controller="modified"'), 'target controller name is written');
		t.true(componentXml.includes('targetPage="~1"'), 'target page is written');
		t.true(componentXml.includes('type="play_transition"'), 'play_transition action is written');
		t.true(componentXml.includes('transition="t0"'), 'transition name is written');
		t.true(componentXml.includes('repeat="2"'), 'repeat count is written');
		t.true(componentXml.includes('delay="0.25"'), 'delay is written');
		t.true(/stopOnExit(?:="true")?/.test(componentXml), 'stopOnExit is written');

		const doc2 = await io.readProject(outFairy);
		const comp2 = doc2.getRoot().getPackage('ActionPkg')?.getComponent('ActionHost');
		t.truthy(comp2, 'ActionHost exists after round-trip');

		const actions = comp2?.listControllers()[0]?.listActions() ?? [];
		t.deepEqual(
			actions.map((item) => ({
				actionType: item.getActionType(),
				fromPage: item.getFromPage(),
				toPage: item.getToPage(),
				objectId: item.getObjectId(),
				controllerName: item.getControllerName(),
				targetPage: item.getTargetPage(),
				transitionName: item.getTransitionName(),
				playTimes: item.getPlayTimes(),
				delay: item.getDelay(),
				stopOnExit: item.getStopOnExit(),
			})),
			[
				{
					actionType: 1,
					fromPage: ['0'],
					toPage: ['1'],
					objectId: 'n3',
					controllerName: 'modified',
					targetPage: '~1',
					transitionName: '',
					playTimes: 1,
					delay: 0,
					stopOnExit: false,
				},
				{
					actionType: 0,
					fromPage: ['1'],
					toPage: ['0'],
					objectId: '',
					controllerName: '',
					targetPage: '',
					transitionName: 't0',
					playTimes: 2,
					delay: 0.25,
					stopOnExit: true,
				},
			],
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: sample list ptrRes and transition value attrs survive write→read', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject(PROJECT_PATH);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const doc2 = await io.readProject(outFairy);
		const pullToRefresh = doc2.getRoot().listPackages().find((pkg) => pkg.getName() === 'PullToRefresh');
		const main = pullToRefresh?.listComponents().find((comp) => comp.getName() === 'Main');
		t.truthy(main, 'PullToRefresh/Main exists after round-trip');
		const list1 = main?.listChildren().find((child) => child.getName?.() === 'list1') as ReturnType<Document['createGList']> | undefined;
		const list2 = main?.listChildren().find((child) => child.getName?.() === 'list2') as ReturnType<Document['createGList']> | undefined;
		t.is(list1?.getHeaderRes?.(), 'ui://3u9795n0n3qdr');
		t.is(list2?.getFooterRes?.(), 'ui://3u9795n09sflu');

		const transitionPkg = doc2.getRoot().listPackages().find((pkg) => pkg.getName() === 'Transition');
		const boss = transitionPkg?.listComponents().find((comp) => comp.getName() === 'BOSS');
		const soundItem = boss?.listTransitions?.()[0]?.listItems?.().find((item) => item.getActionType() === 9);
		t.truthy(soundItem, 'BOSS transition sound action exists after round-trip');
		t.deepEqual(soundItem?.getStartValue(), ['ui://zgmoraj4gkq03'], 'transition value is parsed through the formal startValue model');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

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
	text.setShadowColor('#112233');
	text.setShadowOffset({ x: 2, y: 3 });

	const rich = doc.createGRichTextField('rich');
	rich.setId('n1');
	rich.setText('world');
	rich.setShadowColor('#445566');
	rich.setShadowOffset({ x: 4, y: 5 });

	comp.addChild(text);
	comp.addChild(rich);
	pkg.addResource(comp);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const doc2 = await io.readProject(outFairy);
		const comp2 = doc2.getRoot().getPackage('DemoText')?.listComponents().find((item) => item.getName() === 'TextShadow');
		t.truthy(comp2, 'TextShadow component exists');

		const text2 = comp2!.listChildren().find((child) => child.getId() === 'n0') as ReturnType<Document['createGTextField']>;
		t.truthy(text2, 'plain text exists');
		t.is(text2.getShadowColor(), '#112233');
		t.deepEqual(text2.getShadowOffset(), { x: 2, y: 3 });

		const rich2 = comp2!.listChildren().find((child) => child.getId() === 'n1') as ReturnType<Document['createGRichTextField']>;
		t.truthy(rich2, 'rich text exists');
		t.is(rich2.getShadowColor(), '#445566');
		t.deepEqual(rich2.getShadowOffset(), { x: 4, y: 5 });
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

		const doc2 = await io.readProject(outFairy);
		const comp2 = doc2.getRoot().getPackage('Demo3')?.listComponents().find((item) => item.getName() === 'Lists');
		t.truthy(comp2, 'Lists component exists');

		const list2 = comp2!.listChildren().find((child) => child.getId() === 'n0') as ReturnType<Document['createGList']>;
		t.truthy(list2, 'list exists');
		t.is(list2.getLayout(), 4);
		t.is(list2.getLineGap(), 6);
		t.is(list2.getColumnGap(), 8);
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

test('round-trip: tree view list attrs and static item hierarchy survive write→read', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject(PROJECT_PATH);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

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
				{ title: 'Folder 1', level: 0, isFolder: null },
				{ title: 'Leaf 1', level: 1, isFolder: null },
				{ title: 'Leaf 2', level: 1, isFolder: null },
				{ title: 'Leaf 3', level: 1, isFolder: null },
				{ title: 'Leaf 4', level: 1, isFolder: null },
				{ title: 'Folder 2', level: 0, isFolder: null },
				{ title: 'Leaf 1', level: 1, isFolder: null },
			],
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

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

	const display2Gear = doc.createGear();
	display2Gear.setGearType(GearType.Display2);
	display2Gear.setController(ctrl);
	display2Gear.setPages('0,1');
	display2Gear.setCondition('1');

	image.addGear(textGear);
	image.addGear(display2Gear);
	comp.addChild(image);
	pkg.addResource(comp);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const doc2 = await io.readProject(outFairy);
		const comp2 = doc2.getRoot().getPackage('Demo4')?.listComponents().find((item) => item.getName() === 'GearHost');
		t.truthy(comp2, 'GearHost component exists');

		const image2 = comp2!.listChildren().find((child) => child.getId() === 'n0');
		t.truthy(image2, 'gear image exists');
		const gears = image2!.listGears();
		t.is(gears.length, 2);

		const textGear2 = gears.find((gear) => gear.getGearType() === GearType.Text);
		t.truthy(textGear2, 'text gear exists');
		t.is(textGear2!.getPages(), '0,1');
		t.is(textGear2!.getValues(), 'hello|world');
		t.is(textGear2!.getDefaultValue(), 'fallback');

		const display2Gear2 = gears.find((gear) => gear.getGearType() === GearType.Display2);
		t.truthy(display2Gear2, 'display2 gear exists');
		t.is(display2Gear2!.getPages(), '0,1');
		t.is(display2Gear2!.getCondition(), '1');
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

	const comboDef = doc.createComponent('ExtendedCombo');
	comboDef.setId('cmpCombo');
	comboDef.setPath('/');
	comboDef.setExtensionType('ComboBox');
	comboDef.setDropdown('ui://pkg005/dropdown');
	pkg.addResource(comboDef);

	const comboChild = doc.createGComponent('combo-inst');
	comboChild.setId('n1');
	comboChild.setSrc('cmpCombo');
	comboChild.setInstanceExtType('ComboBox');
	comboChild.setInstanceTitle('选项A');
	comboChild.setInstanceIcon('ui://pkg005/iconA');
	comboChild.setInstanceVisibleItemCount(6);
	comboChild.setInstanceComboItems([
		{ title: 'A', value: '1', icon: 'ui://pkg005/a' },
		{ title: 'B', value: '2', icon: null },
	]);

	const listChild = doc.createGList('list-inst');
	listChild.setId('n2');
	listChild.setSrc('ui://pkg005/list');
	listChild.setPageController('state');
	listChild.setControllerOverrides('list,0');

	host.addChild(child);
	host.addChild(comboChild);
	host.addChild(listChild);
	pkg.addResource(host);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

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

		const comboChild2 = host2!.listChildren().find((item) => item.getId() === 'n1') as ReturnType<Document['createGComponent']>;
		t.truthy(comboChild2, 'combo instance exists');
		t.is(comboChild2.getInstanceExtType(), 'ComboBox');
		t.is(comboChild2.getInstanceTitle(), '选项A');
		t.is(comboChild2.getInstanceIcon(), 'ui://pkg005/iconA');
		t.is(comboChild2.getInstanceVisibleItemCount(), 6);
		t.deepEqual(comboChild2.getInstanceComboItems(), [
			{ title: 'A', value: '1', icon: 'ui://pkg005/a' },
			{ title: 'B', value: '2', icon: null },
		]);

		const listChild2 = host2!.listChildren().find((item) => item.getId() === 'n2') as ReturnType<Document['createGList']>;
		t.truthy(listChild2, 'list instance exists');
		t.is(listChild2.getPageController(), 'state');
		t.is(listChild2.getControllerOverrides(), 'list,0');
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

		const text2 = comp2!.listChildren().find((child) => child.getId() === 'n0');
		t.is(text2?.getGroup?.(), 'g1', 'child group reference survives');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: image duplicatePadding survives write→read', async (t) => {
	const io = new NodeIO();
	const doc = new Document();
	doc.getRoot().setProjectId('proj-image').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('Demo');
	pkg.setId('pkg1');

	const image = doc.createImageResource('bg.png');
	image.setId('img1');
	image.setPath('/');
	image.setDuplicatePadding(true);
	pkg.addResource(image);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);
		const doc2 = await io.readProject(outFairy);
		const image2 = doc2.getRoot().getPackage('Demo')?.listResources().find((res) => res.getId?.() === 'img1');
		t.truthy(image2, 'image exists after round-trip');
		t.true((image2 as ReturnType<Document['createImageResource']>).getDuplicatePadding(), 'duplicatePadding survives');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});
