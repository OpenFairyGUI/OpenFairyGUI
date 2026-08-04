import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getFixtureProjectPath } from '@openfairygui/test-utils';
import test from 'ava';
import { Document, GearType } from '../src/index.js';
import { formatProjectInt32 } from '../src/io/display-object-xml-writer.js';
import { NodeIO } from '../src/node.js';

const _PROJECT_PATH = getFixtureProjectPath('FairyGUI-unity', 'UIProject/FairyGUI-Unity-Examples.fairy');

// ─── Round-trip: read → write → read ──────────────────────────────────────

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
	movieClip.setPackageId('pkgC');
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
		t.true(/<(?:movieclip|jta)\b[^>]*pkg="pkgC"/.test(hostXml), 'movieclip writes canonical pkg attr');
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
		t.is(byId.get('n1')?.getPackageId?.(), 'pkgC');
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

test('writer truncates desktop integer geometry without mutating document values', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('integer-geometry').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('IntegerGeometry');
	pkg.setId('pkgIntegerGeometry');

	const comp = doc.createComponent('Fractional');
	comp.setId('cmpFractional');
	comp.setPath('/');
	comp.setSize(320.75, 240.5);
	comp.setMinWidth(120.9);
	comp.setMargin({ top: 1.9, bottom: 2.9, left: -3.9, right: -4.9 });
	comp.setClipSoftness({ x: 5.9, y: -6.9 });
	comp.setOverflow(2);
	comp.setScrollBarMargin({ top: 7.9, bottom: 8.9, left: -9.9, right: -10.9 });
	comp.setDesignImageOffsetX(-428.9);
	comp.setDesignImageOffsetY(238.9);

	const ctrl = doc.createController('state');
	const page = doc.createControllerPage('default');
	page.setId('0');
	ctrl.addPage(page);
	comp.addController(ctrl);

	const image = doc.createGImage('fractional-image');
	image.setId('n0');
	image.setXY(2.625, -5.25);
	image.setSize(16.625, 10.5);
	image.setMinWidth(11.9);
	image.setMaxHeight(12.9);

	const xyGear = doc.createGear();
	xyGear.setGearType(GearType.XY);
	xyGear.setController(ctrl);
	xyGear.setPages('0');
	xyGear.setValues('2.625,-5.25,0.125,0.25');
	xyGear.setDefaultValue('-3.9,4.9,0.5,0.75');
	image.addGear(xyGear);

	const sizeGear = doc.createGear();
	sizeGear.setGearType(GearType.Size);
	sizeGear.setController(ctrl);
	sizeGear.setPages('0');
	sizeGear.setValues('16.625,10.5,1.25,0.75');
	sizeGear.setDefaultValue('-3.9,4.9,1.5,0.5');
	image.addGear(sizeGear);

	const list = doc.createGList('fractional-list');
	list.setId('n1');
	list.setMargin({ top: 13.9, bottom: 14.9, left: -15.9, right: -16.9 });
	list.setScrollBarMargin({ top: 17.9, bottom: 18.9, left: -19.9, right: -20.9 });
	list.setClipSoftness({ x: 21.9, y: -22.9 });

	comp.addChild(image);
	comp.addChild(list);
	pkg.addResource(comp);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-integer-geometry-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);
		const componentXml = await fs.readFile(path.join(tmpDir, 'assets', 'IntegerGeometry', 'Fractional.xml'), 'utf-8');

		t.regex(componentXml, /<component\b(?=[^>]*size="320,240")(?=[^>]*margin="1,2,-3,-4")(?=[^>]*restrictSize="120,0,0,0")(?=[^>]*designImageOffsetX="-428")(?=[^>]*designImageOffsetY="238")(?=[^>]*clipSoftness="5,-6")(?=[^>]*scrollBarMargin="7,8,-9,-10")/);
		t.regex(componentXml, /<image\b(?=[^>]*id="n0")(?=[^>]*xy="2,-5")(?=[^>]*size="16,10")(?=[^>]*restrictSize="11,0,0,12")/);
		t.true(componentXml.includes('<gearXY controller="state" pages="0" values="2,-5,0.125,0.25" default="-3,4,0.5,0.75"'));
		t.true(componentXml.includes('<gearSize controller="state" pages="0" values="16,10,1.25,0.75" default="-3,4,1.50,0.50"'));
		t.regex(componentXml, /<list\b(?=[^>]*id="n1")(?=[^>]*margin="13,14,-15,-16")(?=[^>]*scrollBarMargin="17,18,-19,-20")(?=[^>]*clipSoftness="21,-22")/);

		t.is(comp.getWidth(), 320.75);
		t.is(image.getX(), 2.625);
		t.is(image.getWidth(), 16.625);
		t.is(xyGear.getValues(), '2.625,-5.25,0.125,0.25');
		t.deepEqual(list.getMargin(), { top: 13.9, bottom: 14.9, left: -15.9, right: -16.9 });
		t.is(formatProjectInt32(-0.5), '0');
		t.throws(() => formatProjectInt32(Number.POSITIVE_INFINITY), { message: /must be finite/ });
		t.throws(() => formatProjectInt32(2_147_483_648), { message: /signed 32-bit integer/ });
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});
