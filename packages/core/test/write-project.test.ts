import test from 'ava';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { getFixtureProjectPath } from '@openfairygui/test-utils';
import { Document, GearType, NodeIO, PropertyType } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_PATH = getFixtureProjectPath('FairyGUI-Unity-Examples');

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

test('round-trip: misc/spine/dragonbones resources survive package.xml write→read', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('skeleton-project').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('Loader');
	pkg.setId('loader001');

	const misc = doc.createMiscResource('alien-pma');
	misc.setId('misc001');
	misc.setPath('/images/');
	misc.setFile('alien-pma.atlas');
	pkg.addResource(misc);

	const image = doc.createImageResource('alien-pma.png');
	image.setId('img001');
	image.setPath('/images/');
	pkg.addResource(image);

	const spine = doc.createSpineResource('alien-pro');
	spine.setId('spine001');
	spine.setPath('/images/');
	spine.setFile('alien-pro.skel');
	spine.setWidth(368);
	spine.setHeight(384);
	spine.setRequireIds(['misc001', 'img001']);
	spine.setAtlasNames(['alien-pma']);
	spine.setAnchor(176, 380);
	pkg.addResource(spine);

	const dragonMisc = doc.createMiscResource('dragon-tex');
	dragonMisc.setId('misc002');
	dragonMisc.setPath('/images/');
	dragonMisc.setFile('dragon_tex.json');
	pkg.addResource(dragonMisc);

	const dragonImage = doc.createImageResource('dragon.png');
	dragonImage.setId('img002');
	dragonImage.setPath('/images/');
	pkg.addResource(dragonImage);

	const dragon = doc.createDragonBonesResource('dragon_ske');
	dragon.setId('dragon001');
	dragon.setPath('/images/');
	dragon.setFile('dragon_ske.json');
	dragon.setWidth(0);
	dragon.setHeight(0);
	dragon.setRequireIds(['misc002', 'img002']);
	dragon.setAtlasNames([]);
	dragon.setAnchor(0, 0);
	pkg.addResource(dragon);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-skeleton-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const pkgXml = await fs.readFile(path.join(tmpDir, 'assets', 'Loader', 'package.xml'), 'utf-8');
		t.true(pkgXml.includes('<misc id="misc001" name="alien-pma.atlas" path="/images/">') || pkgXml.includes('<misc id="misc001" name="alien-pma.atlas" path="/images/"'), 'misc resource writes file name');
		t.true(pkgXml.includes('require="misc001,img001"'), 'spine writes require ids');
		t.true(pkgXml.includes('atlasNames="alien-pma"'), 'spine writes atlasNames');
		t.true(pkgXml.includes('anchor="176,380"'), 'spine writes anchor');
		t.true(pkgXml.includes('<dragonbones id="dragon001" name="dragon_ske.json" path="/images/" width="0" height="0" require="misc002,img002" atlasNames="" anchor="0,0"'), 'dragonbones writes canonical attrs');

		const doc2 = await io.readProject(outFairy);
		const pkg2 = doc2.getRoot().getPackage('Loader');
		t.truthy(pkg2, 'Loader exists after round-trip');

		const misc2 = pkg2!.listResources().find((res) => res.getId?.() === 'misc001') as any;
		t.truthy(misc2, 'misc resource exists after round-trip');
		t.is(misc2.propertyType, PropertyType.MISC_RESOURCE);
		t.is(misc2.getFile?.(), 'alien-pma.atlas');

		const spine2 = pkg2!.listResources().find((res) => res.getId?.() === 'spine001') as any;
		t.truthy(spine2, 'spine resource exists after round-trip');
		t.is(spine2.propertyType, PropertyType.SPINE_RESOURCE);
		t.deepEqual(spine2.getRequireIds?.(), ['misc001', 'img001']);
		t.deepEqual(spine2.getAtlasNames?.(), ['alien-pma']);
		t.is(spine2.getAnchorX?.(), 176);
		t.is(spine2.getAnchorY?.(), 380);

		const dragon2 = pkg2!.listResources().find((res) => res.getId?.() === 'dragon001') as any;
		t.truthy(dragon2, 'dragonbones resource exists after round-trip');
		t.is(dragon2.propertyType, PropertyType.DRAGON_BONES_RESOURCE);
		t.deepEqual(dragon2.getRequireIds?.(), ['misc002', 'img002']);
		t.deepEqual(dragon2.getAtlasNames?.(), []);
		t.is(dragon2.getAnchorX?.(), 0);
		t.is(dragon2.getAnchorY?.(), 0);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: branch package resources write into package_branch.xml and survive read→write', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('branch-project').setProjectType(0).setVersion('3.0').setBranches(['dev']);

	const pkg = doc.createPackage('Branch');
	pkg.setId('branch001');

	const mainComponent = doc.createComponent('Main');
	mainComponent.setId('kn7w0');
	mainComponent.setPath('/');
	mainComponent.setExported(true);
	mainComponent.setSize(200, 120);
	mainComponent.setBranchItemIds(['kn7w3']);
	pkg.addResource(mainComponent);

	const mainImage = doc.createImageResource('face.png');
	mainImage.setId('kn7w1');
	mainImage.setPath('/');
	mainImage.setExported(true);
	mainImage.setBranchItemIds(['kn7w2']);
	pkg.addResource(mainImage);

	const devImage = doc.createImageResource('face.png');
	devImage.setId('kn7w2');
	devImage.setPath('/');
	devImage.setExported(true);
	devImage.setBranch('dev');
	pkg.addResource(devImage);

	const devComponent = doc.createComponent('Main');
	devComponent.setId('kn7w3');
	devComponent.setPath('/');
	devComponent.setExported(true);
	devComponent.setSize(320, 180);
	devComponent.setBranch('dev');
	const devLoader = doc.createGLoader('n0');
	devLoader.setId('n0_kn7w');
	devLoader.setUrl('ui://branch001kn7w2');
	devLoader.setSize(62, 60);
	devComponent.addChild(devLoader);
	pkg.addResource(devComponent);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-branch-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const mainPackageXml = await fs.readFile(path.join(tmpDir, 'assets', 'Branch', 'package.xml'), 'utf-8');
		t.true(mainPackageXml.includes('id="kn7w1"'), 'main package.xml keeps main resource');
		t.false(mainPackageXml.includes('id="kn7w2"'), 'main package.xml excludes branch resource');

		const branchPackageXml = await fs.readFile(path.join(tmpDir, 'assets_dev', 'Branch', 'package_branch.xml'), 'utf-8');
		t.true(branchPackageXml.includes('<branchDescription>'), 'branchDescription root is written');
		t.true(branchPackageXml.includes('id="kn7w2"'), 'package_branch.xml keeps branch resource');
		t.true(branchPackageXml.includes('id="kn7w3"'), 'package_branch.xml keeps branch component resource');

		const doc2 = await io.readProject(outFairy);
		const pkg2 = doc2.getRoot().getPackage('Branch');
		t.truthy(pkg2, 'Branch package exists after round-trip');
		t.deepEqual(doc2.getRoot().listBranches(), ['dev']);

		const roundTripMainImage = pkg2!.listResources().find((res) => res.getId?.() === 'kn7w1') as any;
		const roundTripDevImage = pkg2!.listResources().find((res) => res.getId?.() === 'kn7w2') as any;
		const roundTripMainComponent = pkg2!.listResources().find((res) => res.getId?.() === 'kn7w0') as any;
		const roundTripDevComponent = pkg2!.listResources().find((res) => res.getId?.() === 'kn7w3') as any;
		t.is(roundTripMainImage?.getBranch?.(), '');
		t.is(roundTripDevImage?.getBranch?.(), 'dev');
		t.is(roundTripMainComponent?.getBranch?.(), '');
		t.is(roundTripDevComponent?.getBranch?.(), 'dev');
		t.is(roundTripDevComponent?.getWidth?.(), 320);
		t.is(roundTripDevComponent?.getHeight?.(), 180);
		const roundTripDevLoader = roundTripDevComponent?.listChildren?.().find((child: any) => child.getId?.() === 'n0_kn7w');
		t.is(roundTripDevLoader?.getUrl?.(), 'ui://branch001kn7w2');
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

		const bossXml = await fs.readFile(path.join(tmpDir, 'assets', 'Transition', 'BOSS.xml'), 'utf-8');
		t.false(/<item\b[^>]*\btarget=""/.test(bossXml), 'transition items omit empty target attr');
		t.true(bossXml.includes('<item time="0" type="Sound" value="ui://zgmoraj4gkq03"/>'), 'transition sound omits default volume payload');
		t.true(bossXml.includes('ease="Expo.Out"'), 'transition tween preserves dotted ease names');
		t.true(bossXml.includes('ease="Back.Out"'), 'transition tween preserves non-default ease names');

		const pathDemoXml = await fs.readFile(path.join(tmpDir, 'assets', 'Transition', 'PathDemo.xml'), 'utf-8');
		t.true(pathDemoXml.includes('<item time="0" type="Transition" value="t1"/>'), 'transition action omits default play-times payload');
		t.true(pathDemoXml.includes('path="2,0,0,'), 'transition path payload is written');
		t.true(pathDemoXml.includes('ease="Linear"'), 'transition linear ease is written');
		t.true(pathDemoXml.includes('startValue="0.38,0.00,0.00,0.00"'), 'transition color filter startValue keeps editor-style fixed decimals');
		t.true(pathDemoXml.includes('endValue="0.00,0.00,0.00,0.00"'), 'transition color filter endValue keeps editor-style fixed decimals');

		const powerUpXml = await fs.readFile(path.join(tmpDir, 'assets', 'Transition', 'PowerUp.xml'), 'utf-8');
		t.true(powerUpXml.includes('label2="end"'), 'transition end label is written');
		t.true(powerUpXml.includes('<item time="0" type="Alpha" value="1.00"/>'), 'non-tween alpha writes value attr with editor-style fixed decimals');
		t.true(powerUpXml.includes('<item time="0" type="XY" value="0,0"/>'), 'non-tween XY writes value attr instead of startValue');
		t.true(/<jta\b[^>]*id="n5"/.test(powerUpXml), 'movie clip instances write jta display tags');

		const goodHitXml = await fs.readFile(path.join(tmpDir, 'assets', 'Transition', 'GoodHit.xml'), 'utf-8');
		t.true(goodHitXml.includes('duration="7"'), 'transition duration rounds float noise back to editor frame integers');
		t.true(goodHitXml.includes('<item time="7" type="Shake" value="3,0.5"/>'), 'transition time rounds float noise back to editor frame integers');

		const demoListXml = await fs.readFile(path.join(tmpDir, 'assets', 'Basics', 'Demo_List.xml'), 'utf-8');
		t.false(demoListXml.includes('selectionMode="single"'), 'list omits default selectionMode');
		t.false(demoListXml.includes('level="0"'), 'list items omit default level');

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

test('writer: suppresses restored-like default attrs and float-noise defaults', async (t) => {
	const io = new NodeIO();
	const doc = new Document();
	doc.getRoot().setProjectId('proj-defaults').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('DefaultNoise');
	pkg.setId('pkgDefaults');

	const imageRes = doc.createImageResource('img.png');
	imageRes.setId('img001');
	imageRes.setPath('/');
	pkg.addResource(imageRes);

	const comp = doc.createComponent('Defaults');
	comp.setId('cmpDefaults');
	comp.setPath('/');
	comp.setSize(400, 300);

	const buttonDef = doc.createComponent('DefaultButton');
	buttonDef.setId('cmpButton');
	buttonDef.setPath('/');
	buttonDef.setExtensionType('Button');
	buttonDef.setDownEffectValue(0.800000011920929);
	pkg.addResource(buttonDef);

	const image = doc.createGImage('img');
	image.setId('n0');
	image.setSrc('img001');
	image.setColor('#FFFFFF');

	const loader = doc.createGLoader('loader');
	loader.setId('n1');
	loader.setColor('#FFFFFF');
	loader.setFill(0);

	const text = doc.createGTextField('text');
	text.setId('n2');
	text.setColor('#000000');
	text.setText('Hello');

	const list = doc.createGList('list');
	list.setId('n3');
	list.setSelectionMode(0);
	list.setListItems([
		{
			title: 'A',
			icon: 'ui://pkgDefaults/iconA',
			url: null,
			name: null,
			selectedTitle: null,
			selectedIcon: null,
			level: 0,
			isFolder: null,
		},
	]);

	comp.addChild(image);
	comp.addChild(loader);
	comp.addChild(text);
	comp.addChild(list);
	pkg.addResource(comp);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-defaults-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);
		const buttonXml = await fs.readFile(path.join(tmpDir, 'assets', 'DefaultNoise', 'DefaultButton.xml'), 'utf-8');
		const compXml = await fs.readFile(path.join(tmpDir, 'assets', 'DefaultNoise', 'Defaults.xml'), 'utf-8');
		t.false(buttonXml.includes('downEffectValue='), 'button omits float-noise default downEffectValue');
		t.false(compXml.includes('color="#FFFFFF"'), 'writer omits default white image/loader color');
		t.false(compXml.includes('color="#000000"'), 'writer omits default black text color');
		t.false(compXml.includes('fill="none"'), 'loader omits default fill');
		t.false(compXml.includes('selectionMode="single"'), 'list omits default selectionMode');
		t.false(compXml.includes('level="0"'), 'list items omit default level');
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

test('writer: uses canonical XML attr names for component root, loader, richtext, loader3D, input text, group, and list nodes', async (t) => {
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

	const list = doc.createGList('tabs');
	list.setId('n2');
	list.setLayout(2);
	list.setColumnGap(8);
	list.setLineCount(9999);
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
		t.true(componentXml.includes('animation="idle"'), 'loader3D uses canonical animation attr');
		t.false(componentXml.includes('animationName='), 'loader3D no longer writes model field name');
		t.false(/<loader3d\b[^>]*\balign=/.test(componentXml), 'loader3D omits default align attr');
		t.false(/<loader3d\b[^>]*\bvAlign=/.test(componentXml), 'loader3D omits default vAlign attr');
		t.true(componentXml.includes('prompt="Search here"'), 'text input uses canonical prompt attr');
		t.true(/<inputtext\b[^>]*text=""[^>]*color="#ff3300"/.test(componentXml), 'text input preserves explicit empty text and lowercases color attrs');
		t.true(/<inputtext\b[^>]*autoClearText(?:="true")?/.test(componentXml), 'text input writes canonical autoClearText attr');
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
		t.is(byId.get('n1_5')?.getFont?.(), 'ui://pkgProtocol/font', 'richtext font survives round-trip');
		t.true(byId.get('n1_5')?.getAutoClearText?.(), 'richtext autoClearText survives round-trip');
		t.true(byId.get('n1_5')?.getUbbEnabled?.(), 'richtext ubb survives round-trip');
		t.true(byId.get('n1_5')?.getSingleLine?.(), 'richtext singleLine survives round-trip');
		t.is(byId.get('n1_5')?.getStrokeSize?.(), 2, 'richtext strokeSize survives round-trip');
		t.is(byId.get('n2')?.getColumnGap?.(), 8, 'list colGap survives round-trip');
		t.is(byId.get('n2')?.getLineCount?.(), 9999, 'list lineItemCount survives round-trip');
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

test('round-trip: tree view list attrs and static item hierarchy survive write→read', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject(PROJECT_PATH);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);
		const treeXml = await fs.readFile(path.join(tmpDir, 'assets', 'TreeView', 'Main.xml'), 'utf-8');
		t.false(treeXml.includes('isFolder='), 'tree static items omit inferred isFolder attrs in editor xml');

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

	const listChild = doc.createGList('list-inst');
	listChild.setId('n2');
	listChild.setSrc('ui://pkg005/list');
	listChild.setPageController('state');
	listChild.setControllerOverrides('list,0');

	host.addChild(child);
	host.addChild(comboChild);
	host.addChild(listChild);
	host.addChild(labelChild);
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
		t.true(buttonDefXml.includes('downEffect="1"'), 'button definition writes canonical downEffect attr');
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
		t.regex(hostXml, /<Button\b[^>]*title="点我"[^>]*\/>/, 'button instance without children writes a self-closing overlay node');
		t.true(hostXml.includes('<ComboBox '), 'combo instance writes ComboBox overlay node');
		t.true(hostXml.includes('selectionController="qualityOption"'), 'combo instance writes canonical selectionController attr');
		t.true(hostXml.includes('visibleItemCount="6"'), 'combo instance writes canonical visibleItemCount attr');
		t.regex(hostXml, /<item\b[^>]*title="A"[^>]*value="1"[^>]*icon="ui:\/\/pkg005\/a"[^>]*\/>/, 'combo instance item writes canonical item attrs');
		t.true(hostXml.includes('<Label prompt="[color=#959595]查找...[/color]"'), 'label instance writes canonical prompt attr');

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

		const comboChild2 = host2!.listChildren().find((item) => item.getId() === 'n1') as ReturnType<Document['createGComponent']>;
		t.truthy(comboChild2, 'combo instance exists');
		t.is(comboChild2.getInstanceExtType(), 'ComboBox');
		t.is(comboChild2.getInstanceTitle(), '选项A');
		t.is(comboChild2.getInstanceIcon(), 'ui://pkg005/iconA');
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

test('round-trip: display object fileName/pkg/filter metadata survives write→read', async (t) => {
	const io = new NodeIO();
	const doc = new Document();
	doc.getRoot().setProjectId('proj-display-meta').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('DemoMeta');
	pkg.setId('pkgMeta');

	const host = doc.createComponent('Host');
	host.setId('cmpMeta');
	host.setPath('/');
	host.setSize(400, 300);

	const image = doc.createGImage('img');
	image.setId('n0');
	image.setSrc('img001');
	image.setFileName('images/pic.png');
	image.setPackageId('pkgA');
	image.setAspect(true);
	image.setFilter('color');
	image.setFilterData('0.00,0.00,0.00,1.00');

	const movieClip = doc.createGMovieClip('mc');
	movieClip.setId('n1');
	movieClip.setSrc('mc001');
	movieClip.setFileName('pet.jta');
	movieClip.setFilter('color');
	movieClip.setFilterData('0.10,0.20,0.30,1.00');

	const child = doc.createGComponent('child');
	child.setId('n2');
	child.setSrc('cmp001');
	child.setFileName('Button/Button5.xml');
	child.setPackageId('pkgB');
	child.setAspect(true);
	child.setFilter('blur');
	child.setFilterData('4');

	host.addChild(image);
	host.addChild(movieClip);
	host.addChild(child);
	pkg.addResource(host);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-meta-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);
		const hostXml = await fs.readFile(path.join(tmpDir, 'assets', 'DemoMeta', 'Host.xml'), 'utf-8');
		t.false(/<image\b[^>]*\bfileName=/.test(hostXml), 'image omits fileName attr');
		t.true(hostXml.includes('pkg="pkgA"'), 'image writes canonical pkg attr');
		t.true(/\baspect(?:="true")?(?=[\s>])/.test(hostXml), 'display object writes canonical aspect attr');
		t.true(hostXml.includes('filter="color"'), 'display object writes canonical filter attr');
		t.true(hostXml.includes('filterData="0.00,0.00,0.00,1.00"'), 'display object writes canonical filterData attr');
		t.true(hostXml.includes('fileName="pet.jta"'), 'movieclip writes canonical fileName attr');
		t.true(hostXml.includes('fileName="Button/Button5.xml"'), 'component writes canonical fileName attr');
		t.true(hostXml.includes('pkg="pkgB"'), 'component writes canonical pkg attr');
		t.true(/<component\b[^>]*\baspect(?:="true")?(?=[\s>])/.test(hostXml), 'component writes canonical aspect attr');

		const doc2 = await io.readProject(outFairy);
		const host2 = doc2.getRoot().getPackage('DemoMeta')?.listComponents().find((item) => item.getName() === 'Host');
		t.truthy(host2, 'Host exists after round-trip');
		const byId = new Map(host2!.listChildren().map((item) => [item.getId(), item as any]));

		t.is(byId.get('n0')?.getFileName?.(), '');
		t.is(byId.get('n0')?.getPackageId?.(), 'pkgA');
		t.true(byId.get('n0')?.getAspect?.());
		t.is(byId.get('n0')?.getFilter?.(), 'color');
		t.is(byId.get('n0')?.getFilterData?.(), '0.00,0.00,0.00,1.00');

		t.is(byId.get('n1')?.getFileName?.(), 'pet.jta');
		t.is(byId.get('n1')?.getFilterData?.(), '0.10,0.20,0.30,1.00');

		t.is(byId.get('n2')?.getFileName?.(), 'Button/Button5.xml');
		t.is(byId.get('n2')?.getPackageId?.(), 'pkgB');
		t.true(byId.get('n2')?.getAspect?.());
		t.is(byId.get('n2')?.getFilter?.(), 'blur');
		t.is(byId.get('n2')?.getFilterData?.(), '4');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: component tooltips, text customData, and graph skew survive write→read', async (t) => {
	const io = new NodeIO();
	const doc = new Document();
	doc.getRoot().setProjectId('proj-display-specific').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('SpecificDisplay');
	pkg.setId('pkgSpecific');

	const host = doc.createComponent('Host');
	host.setId('cmpSpecific');
	host.setPath('/');
	host.setSize(320, 240);

	const child = doc.createGComponent('child');
	child.setId('n0');
	child.setSrc('cmp001');
	child.setTooltips('左对齐');

	const text = doc.createGTextField('title');
	text.setId('n1');
	text.setText('hello');
	text.setCustomData('k');

	const graph = doc.createGGraph('shape');
	graph.setId('n2');
	graph.setGraphType(1);
	graph.setFillColor('#ff006600');
	graph.setSkew(60, 30);

	host.addChild(child);
	host.addChild(text);
	host.addChild(graph);
	pkg.addResource(host);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-specific-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);
		const hostXml = await fs.readFile(path.join(tmpDir, 'assets', 'SpecificDisplay', 'Host.xml'), 'utf-8');
		t.true(hostXml.includes('tooltips="左对齐"'), 'component writes canonical tooltips attr');
		t.true(hostXml.includes('customData="k"'), 'text writes canonical customData attr');
		t.true(hostXml.includes('skew="60,30"'), 'graph writes canonical skew attr');

		const doc2 = await io.readProject(outFairy);
		const host2 = doc2.getRoot().getPackage('SpecificDisplay')?.listComponents().find((item) => item.getName() === 'Host');
		t.truthy(host2, 'Host exists after round-trip');
		const byId = new Map(host2!.listChildren().map((item) => [item.getId(), item as any]));

		t.is(byId.get('n0')?.getTooltips?.(), '左对齐');
		t.is(byId.get('n1')?.getCustomData?.(), 'k');
		t.is(byId.get('n2')?.getSkewX?.(), 60);
		t.is(byId.get('n2')?.getSkewY?.(), 30);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: tag-scoped alpha/rotation/visible/touchable/grayed survive write→read', async (t) => {
	const io = new NodeIO();
	const doc = new Document();
	doc.getRoot().setProjectId('proj-display-state').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('DisplayState');
	pkg.setId('pkgState');

	const host = doc.createComponent('Host');
	host.setId('cmpState');
	host.setPath('/');
	host.setSize(320, 240);

	const image = doc.createGImage('img');
	image.setId('n0');
	image.setSrc('img001');
	image.setAlpha(0.62);
	image.setFlip(2);
	image.setRotation(-39);
	image.setVisible(false);
	image.setGrayed(true);

	const child = doc.createGComponent('child');
	child.setId('n1');
	child.setSrc('cmp001');
	child.setAlpha(0.75);
	child.setRotation(12);
	child.setVisible(false);
	child.setTouchable(false);
	child.setGrayed(true);

	const graph = doc.createGGraph('shape');
	graph.setId('n2');
	graph.setGraphType(1);
	graph.setFillColor('#ff006600');
	graph.setAlpha(0.5);
	graph.setRotation(-30);
	graph.setVisible(false);
	graph.setTouchable(false);

	const group = doc.createGGroup('group');
	group.setId('n3');
	group.setVisible(false);

	const list = doc.createGList('list');
	list.setId('n4');
	list.setTouchable(false);

	const loader = doc.createGLoader('loader');
	loader.setId('n5');
	loader.setGrayed(true);
	loader.setUrl('ui://pkg001/icon');

	host.addChild(image);
	host.addChild(child);
	host.addChild(graph);
	host.addChild(group);
	host.addChild(list);
	host.addChild(loader);
	pkg.addResource(host);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-state-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);
		const hostXml = await fs.readFile(path.join(tmpDir, 'assets', 'DisplayState', 'Host.xml'), 'utf-8');
		t.true(hostXml.includes('alpha="0.62"'), 'image writes alpha on image tag');
		t.true(hostXml.includes('flip="vt"'), 'image writes editor-style flip token on image tag');
		t.true(hostXml.includes('rotation="-39"'), 'image writes rotation on image tag');
		t.true(/<image\b[^>]*visible="false"/.test(hostXml), 'image writes visible on image tag');
		t.true(/<image\b[^>]*grayed(?:="true")?/.test(hostXml), 'image writes grayed on image tag');
		t.true(/<component\b[^>]*touchable="false"/.test(hostXml), 'component writes touchable on component tag');
		t.true(/<component\b[^>]*alpha="0.75"/.test(hostXml), 'component writes alpha on component tag');
		t.true(/<graph\b[^>]*rotation="-30"/.test(hostXml), 'graph writes rotation on graph tag');
		t.true(/<graph\b[^>]*touchable="false"/.test(hostXml), 'graph writes touchable on graph tag');
		t.true(/<group\b[^>]*visible="false"/.test(hostXml), 'group writes visible on group tag');
		t.true(/<list\b[^>]*touchable="false"/.test(hostXml), 'list writes touchable on list tag');
		t.true(/<loader\b[^>]*grayed(?:="true")?/.test(hostXml), 'loader writes grayed on loader tag');

		const doc2 = await io.readProject(outFairy);
		const host2 = doc2.getRoot().getPackage('DisplayState')?.listComponents().find((item) => item.getName() === 'Host');
		t.truthy(host2, 'Host exists after round-trip');
		const byId = new Map(host2!.listChildren().map((item) => [item.getId(), item as any]));

		t.true(Math.abs((byId.get('n0')?.getAlpha?.() ?? 0) - 0.62) < 1e-6);
		t.is(byId.get('n0')?.getFlip?.(), 2);
		t.is(byId.get('n0')?.getRotation?.(), -39);
		t.false(byId.get('n0')?.getVisible?.());
		t.true(byId.get('n0')?.getGrayed?.());

		t.true(Math.abs((byId.get('n1')?.getAlpha?.() ?? 0) - 0.75) < 1e-6);
		t.is(byId.get('n1')?.getRotation?.(), 12);
		t.false(byId.get('n1')?.getVisible?.());
		t.false(byId.get('n1')?.getTouchable?.());
		t.true(byId.get('n1')?.getGrayed?.());

		t.true(Math.abs((byId.get('n2')?.getAlpha?.() ?? 0) - 0.5) < 1e-6);
		t.is(byId.get('n2')?.getRotation?.(), -30);
		t.false(byId.get('n2')?.getVisible?.());
		t.false(byId.get('n2')?.getTouchable?.());

		t.false(byId.get('n3')?.getVisible?.());
		t.false(byId.get('n4')?.getTouchable?.());
		t.true(byId.get('n5')?.getGrayed?.());
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: tag-scoped pivot/anchor/scale survive write→read', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('test-project').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('DemoPivot');
	pkg.setId('pkgPivot');

	const comp = doc.createComponent('PivotAttrs');
	comp.setId('compPivot');
	comp.setPath('/');
	comp.setSize(320, 240);

	const image = doc.createGImage('image');
	image.setId('n0');
	image.setPivot(0.5, 0.25, true);
	image.setScale(1.5, 0.75);

	const childComp = doc.createGComponent('child');
	childComp.setId('n1');
	childComp.setSrc('ui://pkgPivot/child');
	childComp.setPivot(0.5, 0.5, true);
	childComp.setScale(0.7, 1);

	const graph = doc.createGGraph('graph');
	graph.setId('n2');
	graph.setPivot(0.5, 0.5, true);

	const loader = doc.createGLoader('loader');
	loader.setId('n3');
	loader.setPivot(0.5, 0.5);
	loader.setScale(2, 2);

	const movieClip = doc.createGMovieClip('movie');
	movieClip.setId('n4');
	movieClip.setSrc('ui://pkgPivot/movie');
	movieClip.setPivot(0.5, 0.5);

	comp.addChild(image);
	comp.addChild(childComp);
	comp.addChild(graph);
	comp.addChild(loader);
	comp.addChild(movieClip);
	pkg.addResource(comp);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const componentXml = await fs.readFile(path.join(tmpDir, 'assets', 'DemoPivot', 'PivotAttrs.xml'), 'utf-8');
		t.true(componentXml.includes('<image id="n0"'), 'image tag exists');
		t.true(componentXml.includes('pivot="0.5,0.25"'), 'image writes pivot attr');
		t.true(/<image\b[^>]*anchor(?:="true")?/.test(componentXml), 'image writes anchor attr');
		t.true(componentXml.includes('scale="1.5,0.75"'), 'image writes scale attr');
		t.true(/<component\b[^>]*id="n1"[^>]*pivot="0.5,0.5"/.test(componentXml), 'component instance writes pivot attr');
		t.true(/<component\b[^>]*id="n1"[^>]*anchor(?:="true")?/.test(componentXml), 'component instance writes anchor attr');
		t.true(/<component\b[^>]*id="n1"[^>]*scale="0.7,1"/.test(componentXml), 'component instance writes scale attr');
		t.true(/<graph\b[^>]*id="n2"[^>]*pivot="0.5,0.5"/.test(componentXml), 'graph writes pivot attr');
		t.true(/<graph\b[^>]*id="n2"[^>]*anchor(?:="true")?/.test(componentXml), 'graph writes anchor attr');
		t.true(/<loader\b[^>]*id="n3"[^>]*pivot="0.5,0.5"/.test(componentXml), 'loader writes pivot attr');
		t.true(/<loader\b[^>]*id="n3"[^>]*scale="2,2"/.test(componentXml), 'loader writes scale attr');
		t.true(/<jta\b[^>]*id="n4"[^>]*pivot="0.5,0.5"/.test(componentXml), 'jta writes pivot attr');

		const doc2 = await io.readProject(outFairy);
		const comp2 = doc2.getRoot().getPackage('DemoPivot')?.listComponents().find((item) => item.getName() === 'PivotAttrs');
		t.truthy(comp2, 'PivotAttrs component exists');

		const byId = new Map(comp2!.listChildren().map((child) => [child.getId(), child as any]));
		t.is(byId.get('n0')?.getPivotX?.(), 0.5);
		t.is(byId.get('n0')?.getPivotY?.(), 0.25);
		t.true(byId.get('n0')?.getPivotAsAnchor?.());
		t.is(byId.get('n0')?.getScaleX?.(), 1.5);
		t.is(byId.get('n0')?.getScaleY?.(), 0.75);
		t.is(byId.get('n1')?.getPivotX?.(), 0.5);
		t.is(byId.get('n1')?.getPivotY?.(), 0.5);
		t.true(byId.get('n1')?.getPivotAsAnchor?.());
		t.is(byId.get('n1')?.getScaleX?.(), 0.7);
		t.is(byId.get('n1')?.getScaleY?.(), 1);
		t.is(byId.get('n2')?.getPivotX?.(), 0.5);
		t.is(byId.get('n2')?.getPivotY?.(), 0.5);
		t.true(byId.get('n2')?.getPivotAsAnchor?.());
		t.is(byId.get('n3')?.getPivotX?.(), 0.5);
		t.is(byId.get('n3')?.getPivotY?.(), 0.5);
		t.is(byId.get('n3')?.getScaleX?.(), 2);
		t.is(byId.get('n3')?.getScaleY?.(), 2);
		t.is(byId.get('n4')?.getPivotX?.(), 0.5);
		t.is(byId.get('n4')?.getPivotY?.(), 0.5);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: tag-scoped group survives write→read', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('test-project').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('DemoGroup');
	pkg.setId('pkgGroup');

	const comp = doc.createComponent('GroupAttrs');
	comp.setId('compGroup');
	comp.setPath('/');
	comp.setSize(320, 240);

	const image = doc.createGImage('image');
	image.setId('n0');
	image.setGroup('groot');

	const childComp = doc.createGComponent('child');
	childComp.setId('n1');
	childComp.setSrc('ui://pkgGroup/child');
	childComp.setGroup('groot');

	const text = doc.createGTextField('text');
	text.setId('n2');
	text.setText('hello');
	text.setGroup('groot');

	const graph = doc.createGGraph('graph');
	graph.setId('n3');
	graph.setGraphType(1);
	graph.setGroup('groot');

	const nestedGroup = doc.createGGroup('group');
	nestedGroup.setId('n4');
	nestedGroup.setGroup('groot');

	const list = doc.createGList('list');
	list.setId('n5');
	list.setGroup('groot');

	const movieClip = doc.createGMovieClip('movie');
	movieClip.setId('n6');
	movieClip.setSrc('ui://pkgGroup/movie');
	movieClip.setGroup('groot');

	comp.addChild(image);
	comp.addChild(childComp);
	comp.addChild(text);
	comp.addChild(graph);
	comp.addChild(nestedGroup);
	comp.addChild(list);
	comp.addChild(movieClip);
	pkg.addResource(comp);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const componentXml = await fs.readFile(path.join(tmpDir, 'assets', 'DemoGroup', 'GroupAttrs.xml'), 'utf-8');
		t.true(/<image\b[^>]*group="groot"/.test(componentXml), 'image writes group attr');
		t.true(/<component\b[^>]*id="n1"[^>]*group="groot"/.test(componentXml), 'component instance writes group attr');
		t.true(/<text\b[^>]*id="n2"[^>]*group="groot"/.test(componentXml), 'text writes group attr');
		t.true(/<graph\b[^>]*id="n3"[^>]*group="groot"/.test(componentXml), 'graph writes group attr');
		t.true(/<group\b[^>]*id="n4"[^>]*group="groot"/.test(componentXml), 'group writes group attr');
		t.true(/<list\b[^>]*id="n5"[^>]*group="groot"/.test(componentXml), 'list writes group attr');
		t.true(/<jta\b[^>]*id="n6"[^>]*group="groot"/.test(componentXml), 'jta writes group attr');

		const doc2 = await io.readProject(outFairy);
		const comp2 = doc2.getRoot().getPackage('DemoGroup')?.listComponents().find((item) => item.getName() === 'GroupAttrs');
		t.truthy(comp2, 'GroupAttrs component exists');

		const byId = new Map(comp2!.listChildren().map((child) => [child.getId(), child as any]));
		t.is(byId.get('n0')?.getGroup?.(), 'groot');
		t.is(byId.get('n1')?.getGroup?.(), 'groot');
		t.is(byId.get('n2')?.getGroup?.(), 'groot');
		t.is(byId.get('n3')?.getGroup?.(), 'groot');
		t.is(byId.get('n4')?.getGroup?.(), 'groot');
		t.is(byId.get('n5')?.getGroup?.(), 'groot');
		t.is(byId.get('n6')?.getGroup?.(), 'groot');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: tag-scoped xy survive write→read', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('test-project').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('DemoXY');
	pkg.setId('pkgXY');

	const comp = doc.createComponent('XYAttrs');
	comp.setId('compXY');
	comp.setPath('/');
	comp.setSize(320, 240);

	const image = doc.createGImage('image');
	image.setId('n0');
	image.setXY(10, 20);

	const childComp = doc.createGComponent('child');
	childComp.setId('n1');
	childComp.setSrc('ui://pkgXY/child');
	childComp.setXY(30, 40);

	const text = doc.createGTextField('text');
	text.setId('n2');
	text.setText('hello');
	text.setXY(50, 60);

	const graph = doc.createGGraph('graph');
	graph.setId('n3');
	graph.setGraphType(1);
	graph.setXY(70, 80);

	const nestedGroup = doc.createGGroup('group');
	nestedGroup.setId('n4');
	nestedGroup.setXY(90, 100);

	const list = doc.createGList('list');
	list.setId('n5');
	list.setXY(110, 120);

	const loader = doc.createGLoader('loader');
	loader.setId('n6');
	loader.setXY(130, 140);

	const loader3d = doc.createGLoader3D('loader3d');
	loader3d.setId('n7');
	loader3d.setXY(150, 160);

	const movieClip = doc.createGMovieClip('movie');
	movieClip.setId('n8');
	movieClip.setSrc('ui://pkgXY/movie');
	movieClip.setXY(170, 180);

	const zeroImage = doc.createGImage('zeroImage');
	zeroImage.setId('n9');

	const zeroText = doc.createGTextField('zeroText');
	zeroText.setId('n10');
	zeroText.setText('');

	const zeroComponent = doc.createGComponent('zeroComponent');
	zeroComponent.setId('n11');
	zeroComponent.setSrc('ui://pkgXY/zero');

	comp.addChild(image);
	comp.addChild(childComp);
	comp.addChild(text);
	comp.addChild(graph);
	comp.addChild(nestedGroup);
	comp.addChild(list);
	comp.addChild(loader);
	comp.addChild(loader3d);
	comp.addChild(movieClip);
	comp.addChild(zeroImage);
	comp.addChild(zeroText);
	comp.addChild(zeroComponent);
	pkg.addResource(comp);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const componentXml = await fs.readFile(path.join(tmpDir, 'assets', 'DemoXY', 'XYAttrs.xml'), 'utf-8');
		t.true(/<image\b[^>]*id="n0"[^>]*xy="10,20"/.test(componentXml), 'image writes xy attr');
		t.true(/<component\b[^>]*id="n1"[^>]*xy="30,40"/.test(componentXml), 'component instance writes xy attr');
		t.true(/<text\b[^>]*id="n2"[^>]*xy="50,60"/.test(componentXml), 'text writes xy attr');
		t.true(/<graph\b[^>]*id="n3"[^>]*xy="70,80"/.test(componentXml), 'graph writes xy attr');
		t.true(/<group\b[^>]*id="n4"[^>]*xy="90,100"/.test(componentXml), 'group writes xy attr');
		t.true(/<list\b[^>]*id="n5"[^>]*xy="110,120"/.test(componentXml), 'list writes xy attr');
		t.true(/<loader\b[^>]*id="n6"[^>]*xy="130,140"/.test(componentXml), 'loader writes xy attr');
		t.true(/<loader3d\b[^>]*id="n7"[^>]*xy="150,160"/.test(componentXml), 'loader3D writes xy attr');
		t.true(/<jta\b[^>]*id="n8"[^>]*xy="170,180"/.test(componentXml), 'jta writes xy attr');
		t.true(/<image\b[^>]*id="n9"[^>]*xy="0,0"/.test(componentXml), 'image writes explicit zero xy attr');
		t.true(/<text\b[^>]*id="n10"[^>]*xy="0,0"/.test(componentXml), 'text writes explicit zero xy attr');
		t.true(/<component\b[^>]*id="n11"[^>]*xy="0,0"/.test(componentXml), 'component instance writes explicit zero xy attr');

		const doc2 = await io.readProject(outFairy);
		const comp2 = doc2.getRoot().getPackage('DemoXY')?.listComponents().find((item) => item.getName() === 'XYAttrs');
		t.truthy(comp2, 'XYAttrs component exists');

		const byId = new Map(comp2!.listChildren().map((child) => [child.getId(), child as any]));
		t.is(byId.get('n0')?.getX?.(), 10);
		t.is(byId.get('n0')?.getY?.(), 20);
		t.is(byId.get('n1')?.getX?.(), 30);
		t.is(byId.get('n1')?.getY?.(), 40);
		t.is(byId.get('n2')?.getX?.(), 50);
		t.is(byId.get('n2')?.getY?.(), 60);
		t.is(byId.get('n3')?.getX?.(), 70);
		t.is(byId.get('n3')?.getY?.(), 80);
		t.is(byId.get('n4')?.getX?.(), 90);
		t.is(byId.get('n4')?.getY?.(), 100);
		t.is(byId.get('n5')?.getX?.(), 110);
		t.is(byId.get('n5')?.getY?.(), 120);
		t.is(byId.get('n6')?.getX?.(), 130);
		t.is(byId.get('n6')?.getY?.(), 140);
		t.is(byId.get('n7')?.getX?.(), 150);
		t.is(byId.get('n7')?.getY?.(), 160);
		t.is(byId.get('n9')?.getX?.(), 0);
		t.is(byId.get('n9')?.getY?.(), 0);
		t.is(byId.get('n10')?.getX?.(), 0);
		t.is(byId.get('n10')?.getY?.(), 0);
		t.is(byId.get('n11')?.getX?.(), 0);
		t.is(byId.get('n11')?.getY?.(), 0);
		t.is(byId.get('n8')?.getX?.(), 170);
		t.is(byId.get('n8')?.getY?.(), 180);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: tag-scoped size survive write→read', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('test-project').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('DemoSize');
	pkg.setId('pkgSize');

	const comp = doc.createComponent('SizeAttrs');
	comp.setId('compSize');
	comp.setPath('/');
	comp.setSize(320, 240);

	const image = doc.createGImage('image');
	image.setId('n0');
	image.setSize(11, 21);

	const childComp = doc.createGComponent('child');
	childComp.setId('n1');
	childComp.setSrc('ui://pkgSize/child');
	childComp.setSize(31, 41);

	const text = doc.createGTextField('text');
	text.setId('n2');
	text.setText('hello');
	text.setSize(51, 61);

	const graph = doc.createGGraph('graph');
	graph.setId('n3');
	graph.setGraphType(1);
	graph.setSize(71, 81);

	const nestedGroup = doc.createGGroup('group');
	nestedGroup.setId('n4');
	nestedGroup.setSize(91, 101);

	const list = doc.createGList('list');
	list.setId('n5');
	list.setSize(111, 121);

	const loader = doc.createGLoader('loader');
	loader.setId('n6');
	loader.setSize(131, 141);

	const loader3d = doc.createGLoader3D('loader3d');
	loader3d.setId('n7');
	loader3d.setSize(151, 161);

	const movieClip = doc.createGMovieClip('movie');
	movieClip.setId('n8');
	movieClip.setSrc('ui://pkgSize/movie');
	movieClip.setSize(171, 181);

	comp.addChild(image);
	comp.addChild(childComp);
	comp.addChild(text);
	comp.addChild(graph);
	comp.addChild(nestedGroup);
	comp.addChild(list);
	comp.addChild(loader);
	comp.addChild(loader3d);
	comp.addChild(movieClip);
	pkg.addResource(comp);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const componentXml = await fs.readFile(path.join(tmpDir, 'assets', 'DemoSize', 'SizeAttrs.xml'), 'utf-8');
		t.true(/<image\b[^>]*id="n0"[^>]*size="11,21"/.test(componentXml), 'image writes size attr');
		t.true(/<component\b[^>]*id="n1"[^>]*size="31,41"/.test(componentXml), 'component instance writes size attr');
		t.true(/<text\b[^>]*id="n2"[^>]*size="51,61"/.test(componentXml), 'text writes size attr');
		t.true(/<graph\b[^>]*id="n3"[^>]*size="71,81"/.test(componentXml), 'graph writes size attr');
		t.true(/<group\b[^>]*id="n4"[^>]*size="91,101"/.test(componentXml), 'group writes size attr');
		t.true(/<list\b[^>]*id="n5"[^>]*size="111,121"/.test(componentXml), 'list writes size attr');
		t.true(/<loader\b[^>]*id="n6"[^>]*size="131,141"/.test(componentXml), 'loader writes size attr');
		t.true(/<loader3d\b[^>]*id="n7"[^>]*size="151,161"/.test(componentXml), 'loader3D writes size attr');
		t.true(/<jta\b[^>]*id="n8"[^>]*size="171,181"/.test(componentXml), 'jta writes size attr');

		const doc2 = await io.readProject(outFairy);
		const comp2 = doc2.getRoot().getPackage('DemoSize')?.listComponents().find((item) => item.getName() === 'SizeAttrs');
		t.truthy(comp2, 'SizeAttrs component exists');

		const byId = new Map(comp2!.listChildren().map((child) => [child.getId(), child as any]));
		t.is(byId.get('n0')?.getWidth?.(), 11);
		t.is(byId.get('n0')?.getHeight?.(), 21);
		t.is(byId.get('n1')?.getWidth?.(), 31);
		t.is(byId.get('n1')?.getHeight?.(), 41);
		t.is(byId.get('n2')?.getWidth?.(), 51);
		t.is(byId.get('n2')?.getHeight?.(), 61);
		t.is(byId.get('n3')?.getWidth?.(), 71);
		t.is(byId.get('n3')?.getHeight?.(), 81);
		t.is(byId.get('n4')?.getWidth?.(), 91);
		t.is(byId.get('n4')?.getHeight?.(), 101);
		t.is(byId.get('n5')?.getWidth?.(), 111);
		t.is(byId.get('n5')?.getHeight?.(), 121);
		t.is(byId.get('n6')?.getWidth?.(), 131);
		t.is(byId.get('n6')?.getHeight?.(), 141);
		t.is(byId.get('n7')?.getWidth?.(), 151);
		t.is(byId.get('n7')?.getHeight?.(), 161);
		t.is(byId.get('n8')?.getWidth?.(), 171);
		t.is(byId.get('n8')?.getHeight?.(), 181);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: tag-scoped locked and restrictSize survive write→read', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('test-project').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('DemoMeta');
	pkg.setId('pkgMeta');

	const comp = doc.createComponent('MetaAttrs');
	comp.setId('compMeta');
	comp.setPath('/');
	comp.setSize(320, 240);

	const image = doc.createGImage('image');
	image.setId('n0');
	image.setLocked(true);

	const childComp = doc.createGComponent('child');
	childComp.setId('n1');
	childComp.setSrc('ui://pkgMeta/child');
	childComp.setLocked(true);
	childComp.setMinWidth(10);
	childComp.setMaxWidth(20);
	childComp.setMinHeight(30);
	childComp.setMaxHeight(40);

	const text = doc.createGTextField('text');
	text.setId('n2');
	text.setText('hello');
	text.setMinWidth(0);
	text.setMaxWidth(60);
	text.setMinHeight(0);
	text.setMaxHeight(0);

	const richText = doc.createGRichTextField('rich');
	richText.setId('n3');
	richText.setText('[b]hi[/b]');
	richText.setMinWidth(1);
	richText.setMaxWidth(61);
	richText.setMinHeight(2);
	richText.setMaxHeight(62);

	const graph = doc.createGGraph('graph');
	graph.setId('n4');
	graph.setGraphType(1);
	graph.setLocked(true);
	graph.setMinWidth(0);
	graph.setMaxWidth(1);
	graph.setMinHeight(0);
	graph.setMaxHeight(0);

	const nestedGroup = doc.createGGroup('group');
	nestedGroup.setId('n5');
	nestedGroup.setLocked(true);

	comp.addChild(image);
	comp.addChild(childComp);
	comp.addChild(text);
	comp.addChild(richText);
	comp.addChild(graph);
	comp.addChild(nestedGroup);
	pkg.addResource(comp);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const componentXml = await fs.readFile(path.join(tmpDir, 'assets', 'DemoMeta', 'MetaAttrs.xml'), 'utf-8');
		t.true(/<image\b(?=[^>]*id="n0")(?=[^>]*locked(?:="true")?)/.test(componentXml), 'image writes locked attr');
		t.true(/<component\b(?=[^>]*id="n1")(?=[^>]*locked(?:="true")?)(?=[^>]*restrictSize="10,20,30,40")/.test(componentXml), 'component writes locked and restrictSize attrs');
		t.true(/<text\b(?=[^>]*id="n2")(?=[^>]*restrictSize="0,60,0,0")/.test(componentXml), 'text writes restrictSize attr');
		t.true(/<richtext\b(?=[^>]*id="n3")(?=[^>]*restrictSize="1,61,2,62")/.test(componentXml), 'richtext writes restrictSize attr');
		t.true(/<graph\b(?=[^>]*id="n4")(?=[^>]*locked(?:="true")?)(?=[^>]*restrictSize="0,1,0,0")/.test(componentXml), 'graph writes locked and restrictSize attrs');
		t.true(/<group\b(?=[^>]*id="n5")(?=[^>]*locked(?:="true")?)/.test(componentXml), 'group writes locked attr');

		const doc2 = await io.readProject(outFairy);
		const comp2 = doc2.getRoot().getPackage('DemoMeta')?.listComponents().find((item) => item.getName() === 'MetaAttrs');
		t.truthy(comp2, 'MetaAttrs component exists');

		const byId = new Map(comp2!.listChildren().map((child) => [child.getId(), child as any]));
		t.true(byId.get('n0')?.getLocked?.());
		t.true(byId.get('n1')?.getLocked?.());
		t.is(byId.get('n1')?.getMinWidth?.(), 10);
		t.is(byId.get('n1')?.getMaxWidth?.(), 20);
		t.is(byId.get('n1')?.getMinHeight?.(), 30);
		t.is(byId.get('n1')?.getMaxHeight?.(), 40);
		t.is(byId.get('n2')?.getMaxWidth?.(), 60);
		t.is(byId.get('n3')?.getMinWidth?.(), 1);
		t.is(byId.get('n3')?.getMaxWidth?.(), 61);
		t.is(byId.get('n3')?.getMinHeight?.(), 2);
		t.is(byId.get('n3')?.getMaxHeight?.(), 62);
		t.true(byId.get('n4')?.getLocked?.());
		t.is(byId.get('n4')?.getMaxWidth?.(), 1);
		t.true(byId.get('n5')?.getLocked?.());
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

test('round-trip: package image width/height/gridTile survive package.xml write→read', async (t) => {
	const io = new NodeIO();
	const doc = new Document();
	doc.getRoot().setProjectId('proj-image-size').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('DemoImageMeta');
	pkg.setId('pkgImageMeta');

	const image = doc.createImageResource('icon.svg');
	image.setId('imgMeta');
	image.setPath('/icons/');
	image.setWidth(16);
	image.setHeight(18);
	image.setTileGridIndice(3);
	pkg.addResource(image);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-image-meta-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const pkgXml = await fs.readFile(path.join(tmpDir, 'assets', 'DemoImageMeta', 'package.xml'), 'utf-8');
		t.true(pkgXml.includes('width="16"'), 'package image writes width attr');
		t.true(pkgXml.includes('height="18"'), 'package image writes height attr');
		t.true(pkgXml.includes('gridTile="3"'), 'package image writes gridTile attr');

		const doc2 = await io.readProject(outFairy);
		const image2 = doc2.getRoot().getPackage('DemoImageMeta')?.listResources().find((res) => res.getId?.() === 'imgMeta');
		t.truthy(image2, 'image exists after round-trip');
		t.is((image2 as ReturnType<Document['createImageResource']>).getWidth(), 16, 'width survives');
		t.is((image2 as ReturnType<Document['createImageResource']>).getHeight(), 18, 'height survives');
		t.is((image2 as ReturnType<Document['createImageResource']>).getTileGridIndice(), 3, 'gridTile survives');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: packageDescription id and publish attrs survive package.xml write→read', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('pkg-meta').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('DemoPkg');
	pkg.setId('pkgmeta');
	pkg.setCompressPNG(true);
	pkg.setJpegQuality(80);
	pkg.setPublishName('DemoPublish');
	pkg.setPublishPath('dist/ui');
	pkg.setPublishBranchPath('dist/branches');
	pkg.setPublishPackageCount(1);
	pkg.setGenCode(true);
	pkg.setCodePath('src/ui-gen');

	const image = doc.createImageResource('hero.png');
	image.setId('imgmeta');
	image.setPath('/images/');
	pkg.addResource(image);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);
		const packageXml = await fs.readFile(path.join(tmpDir, 'assets', 'DemoPkg', 'package.xml'), 'utf-8');
		t.true(packageXml.includes('<packageDescription id="pkgmeta" compressPNG="true" jpegQuality="80">'), 'packageDescription writes canonical id and publish image attrs');
		t.true(
			packageXml.includes('<publish name="DemoPublish" path="dist/ui" branchPath="dist/branches" packageCount="1" genCode="true" codePath="src/ui-gen">')
				|| packageXml.includes('<publish name="DemoPublish" path="dist/ui" branchPath="dist/branches" packageCount="1" genCode="true" codePath="src/ui-gen"/>'),
			'publish writes canonical name, path, branchPath, packageCount, genCode and codePath attrs',
		);

		const doc2 = await io.readProject(outFairy);
		const pkg2 = doc2.getRoot().getPackage('DemoPkg');
		t.truthy(pkg2, 'DemoPkg exists after round-trip');
		t.is(pkg2?.getId(), 'pkgmeta');
		t.is(pkg2?.getCompressPNG?.(), true);
		t.is(pkg2?.getJpegQuality?.(), 80);
		t.is(pkg2?.getPublishName(), 'DemoPublish');
		t.is(pkg2?.getPublishPath?.(), 'dist/ui');
		t.is(pkg2?.getPublishBranchPath?.(), 'dist/branches');
		t.is(pkg2?.getPublishPackageCount?.(), 1);
		t.true(pkg2?.getGenCode?.(), 'genCode survives');
		t.is(pkg2?.getCodePath?.(), 'src/ui-gen', 'codePath survives');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: package image qualityOption and font TMP import attrs survive package.xml write→read', async (t) => {
	const io = new NodeIO();
	const doc = new Document();
	doc.getRoot().setProjectId('proj-package-meta').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('DemoPackageMeta');
	pkg.setId('pkgMeta1');

	const image = doc.createImageResource('icon.png');
	image.setId('imgMeta1');
	image.setPath('/icons/');
	image.setQualityOption('source');
	pkg.addResource(image);

	const font = doc.createFontResource('TmpFont');
	font.setId('fontMeta1');
	font.setPath('/fonts/');
	font.setFileName('TmpFont.ttf');
	font.setRenderMode('sdfaa');
	font.setSamplePointSize(60);
	pkg.addResource(font);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-package-meta-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const pkgXml = await fs.readFile(path.join(tmpDir, 'assets', 'DemoPackageMeta', 'package.xml'), 'utf-8');
		t.true(pkgXml.includes('qualityOption="source"'), 'package image writes qualityOption attr');
		t.true(pkgXml.includes('renderMode="sdfaa"'), 'font writes renderMode attr');
		t.true(pkgXml.includes('samplePointSize="60"'), 'font writes samplePointSize attr');

		const doc2 = await io.readProject(outFairy);
		const pkg2 = doc2.getRoot().getPackage('DemoPackageMeta');
		t.truthy(pkg2, 'DemoPackageMeta exists after round-trip');

		const image2 = pkg2!.listResources().find((res) => res.getId?.() === 'imgMeta1') as ReturnType<Document['createImageResource']>;
		t.truthy(image2, 'image resource exists after round-trip');
		t.is(image2.getQualityOption(), 'source', 'qualityOption survives');

		const font2 = pkg2!.listResources().find((res) => res.getId?.() === 'fontMeta1') as ReturnType<Document['createFontResource']>;
		t.truthy(font2, 'font resource exists after round-trip');
		t.is(font2.getRenderMode(), 'sdfaa', 'renderMode survives');
		t.is(font2.getSamplePointSize(), 60, 'samplePointSize survives');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: package image textureSetMode survives package.xml write→read', async (t) => {
	const io = new NodeIO();
	const doc = new Document();
	doc.getRoot().setProjectId('proj-package-atlas').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('DemoTextureSetMode');
	pkg.setId('pkgTextureSetMode');

	const image = doc.createImageResource('timeline_frame.png');
	image.setId('imgAtlas');
	image.setPath('/timeline/');
	image.setTextureSetMode('alone_npot');
	image.setScaleOption(2);
	pkg.addResource(image);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-package-atlas-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const pkgXml = await fs.readFile(path.join(tmpDir, 'assets', 'DemoTextureSetMode', 'package.xml'), 'utf-8');
		t.true(pkgXml.includes('atlas="alone_npot"'), 'package image writes atlas attr');

		const doc2 = await io.readProject(outFairy);
		const pkg2 = doc2.getRoot().getPackage('DemoTextureSetMode');
		t.truthy(pkg2, 'DemoTextureSetMode exists after round-trip');

		const image2 = pkg2!.listResources().find((res) => res.getId?.() === 'imgAtlas') as ReturnType<Document['createImageResource']>;
		t.truthy(image2, 'image resource exists after round-trip');
		t.is(image2.getTextureSetMode(), 'alone_npot', 'textureSetMode survives');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});
