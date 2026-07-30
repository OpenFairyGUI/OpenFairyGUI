import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getFixtureProjectPath } from '@openfairygui/test-utils';
import { Document, PropertyType } from '../src/index.js';
import { NodeIO } from '../src/node.js';

const PROJECT_PATH = getFixtureProjectPath('FairyGUI-unity', 'UIProject/FairyGUI-Unity-Examples.fairy');

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

	const movieClip = doc.createGMovieClip('mc');
	movieClip.setId('n4');
	movieClip.setSrc('mc001');
	movieClip.setColor('#FFFFFF');

	comp.addChild(image);
	comp.addChild(loader);
	comp.addChild(text);
	comp.addChild(list);
	comp.addChild(movieClip);
	pkg.addResource(comp);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-defaults-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);
		const buttonXml = await fs.readFile(path.join(tmpDir, 'assets', 'DefaultNoise', 'DefaultButton.xml'), 'utf-8');
		const compXml = await fs.readFile(path.join(tmpDir, 'assets', 'DefaultNoise', 'Defaults.xml'), 'utf-8');
		t.false(buttonXml.includes('downEffectValue='), 'button omits float-noise default downEffectValue');
		t.false(compXml.includes('color="#FFFFFF"'), 'writer omits default white image/loader color');
		t.false(/<jta\b[^>]*color="#ffffff"/.test(compXml), 'writer omits default white jta color');
		t.false(compXml.includes('color="#000000"'), 'writer omits default black text color');
		t.false(compXml.includes('fill="none"'), 'loader omits default fill');
		t.false(compXml.includes('selectionMode="single"'), 'list omits default selectionMode');
		t.false(compXml.includes('level="0"'), 'list items omit default level');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});
