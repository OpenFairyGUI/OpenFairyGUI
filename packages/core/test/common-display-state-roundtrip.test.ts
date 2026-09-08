import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Document } from '../src/index.js';
import { NodeIO } from '../src/node.js';

type CommonDisplayState = {
	getX(): number;
	getY(): number;
	getWidth(): number;
	getHeight(): number;
	getLocked(): boolean;
	getAspect(): boolean;
	getMinWidth(): number;
	getMaxHeight(): number;
	getPivotX(): number;
	getPivotY(): number;
	getPivotAsAnchor(): boolean;
	getScaleX(): number;
	getScaleY(): number;
	getFilter(): string;
	getFilterData(): string;
	getAlpha(): number;
	getRotation(): number;
	getVisible(): boolean;
	getTouchable(): boolean;
	getGrayed(): boolean;
};

function setCommonDisplayState<T extends {
	setXY(x: number, y: number): T;
	setSize(width: number, height: number): T;
	setLocked(value: boolean): T;
	setAspect(value: boolean): T;
	setMinWidth(value: number): T;
	setMaxHeight(value: number): T;
	setPivot(x: number, y: number, anchor: boolean): T;
	setScale(x: number, y: number): T;
	setFilter(value: string): T;
	setFilterData(value: string): T;
	setAlpha(value: number): T;
	setRotation(value: number): T;
	setVisible(value: boolean): T;
	setTouchable(value: boolean): T;
	setGrayed(value: boolean): T;
}>(object: T): T {
	return object
		.setXY(10, -20)
		.setSize(80, 40)
		.setLocked(true)
		.setAspect(true)
		.setMinWidth(5)
		.setMaxHeight(200)
		.setPivot(0.5, 0.25, true)
		.setScale(2, 3)
		.setFilter('Color')
		.setFilterData('0.1,0.2,0.3,0.4')
		.setAlpha(0.4)
		.setRotation(17)
		.setVisible(false)
		.setTouchable(false)
		.setGrayed(true);
}

function assertCommonDisplayState(
	t: import('ava').ExecutionContext,
	object: CommonDisplayState,
	label: string,
): void {
	t.deepEqual([object.getX(), object.getY(), object.getWidth(), object.getHeight()], [10, -20, 80, 40], `${label} geometry survives round-trip`);
	t.true(object.getLocked(), `${label} locked survives round-trip`);
	t.true(object.getAspect(), `${label} aspect survives round-trip`);
	t.deepEqual([object.getMinWidth(), object.getMaxHeight()], [5, 200], `${label} size limits survive round-trip`);
	t.deepEqual([object.getPivotX(), object.getPivotY(), object.getPivotAsAnchor()], [0.5, 0.25, true], `${label} pivot survives round-trip`);
	t.deepEqual([object.getScaleX(), object.getScaleY()], [2, 3], `${label} scale survives round-trip`);
	t.deepEqual([object.getFilter(), object.getFilterData()], ['Color', '0.1,0.2,0.3,0.4'], `${label} filter survives round-trip`);
	t.is(object.getAlpha(), 0.4, `${label} alpha survives round-trip`);
	t.is(object.getRotation(), 17, `${label} rotation survives round-trip`);
	t.false(object.getVisible(), `${label} visible survives round-trip`);
	t.false(object.getTouchable(), `${label} touchable survives round-trip`);
	t.true(object.getGrayed(), `${label} grayed survives round-trip`);
}

test('XML round-trip preserves every modeled common display state on V1 node types', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('common-display-state').setProjectType(0).setVersion('3.0');
	const pkg = doc.createPackage('CommonDisplay');
	pkg.setId('pkgstate');
	const component = doc.createComponent('Main');
	component.setId('main1').setPath('/').setSize(320, 240);

	const image = setCommonDisplayState(doc.createGImage('image'))
		.setId('n0')
		.setSkew(3, 4);
	const objects = [
		image,
		setCommonDisplayState(doc.createGTextField('text')).setId('n1'),
		setCommonDisplayState(doc.createGRichTextField('richText')).setId('n2'),
		setCommonDisplayState(doc.createGTextInput('inputText')).setId('n3'),
		setCommonDisplayState(doc.createGLoader('loader')).setId('n4'),
		setCommonDisplayState(doc.createGGraph('graph')).setId('n5'),
		setCommonDisplayState(doc.createGMovieClip('movieClip')).setId('n6'),
		setCommonDisplayState(doc.createGGroup('group')).setId('n7'),
		setCommonDisplayState(doc.createGList('list')).setId('n8'),
		setCommonDisplayState(doc.createGLoader3D('loader3D')).setId('n9'),
		setCommonDisplayState(doc.createGComponent('component')).setId('n10'),
		setCommonDisplayState(doc.createGTree('tree')).setId('n11'),
		setCommonDisplayState(doc.createGButton('button')).setId('n12'),
		setCommonDisplayState(doc.createGLabel('label')).setId('n13'),
		setCommonDisplayState(doc.createGComboBox('comboBox')).setId('n14'),
		setCommonDisplayState(doc.createGProgressBar('progressBar')).setId('n15'),
		setCommonDisplayState(doc.createGSlider('slider')).setId('n16'),
		setCommonDisplayState(doc.createGScrollBar('scrollBar')).setId('n17'),
	];
	for (const object of objects) component.addChild(object);
	pkg.addResource(component);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-common-state-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);
		const xml = await fs.readFile(
			path.join(tmpDir, 'assets', 'CommonDisplay', 'Main.xml'),
			'utf8',
		);

		for (const id of objects.map((object) => object.getId())) {
			const tag = xml.match(new RegExp(`<[^>]+\\bid="${id}"[^>]*>`))?.[0];
			t.truthy(tag, `${id} is serialized`);
			t.regex(tag ?? '', /\balpha="0\.4"/, `${id} writes alpha`);
			t.regex(tag ?? '', /\brotation="17"/, `${id} writes rotation`);
			t.regex(tag ?? '', /\bvisible="false"/, `${id} writes visible`);
			t.regex(tag ?? '', /\btouchable="false"/, `${id} writes touchable`);
			t.regex(tag ?? '', /\bgrayed="true"/, `${id} writes grayed`);
		}

		const roundTrip = await io.readProject(outFairy);
		const roundTripComponent = roundTrip
			.getRoot()
			.getPackage('CommonDisplay')
			?.listComponents()
			.find((item) => item.getName() === 'Main');
		t.truthy(roundTripComponent);

		for (const source of objects) {
			const object = roundTripComponent?.getChildById(source.getId()) as unknown as CommonDisplayState | null;
			t.truthy(object, `${source.getName()} survives round-trip`);
			assertCommonDisplayState(t, object!, source.getName());
		}
		const imageTag = xml.match(/<image\b[^>]*\bid="n0"[^>]*>/)?.[0];
		t.regex(imageTag ?? '', /\bskew="3,4"/, 'image writes modeled skew');
		const roundTripImage = roundTripComponent?.getChildById('n0') as
			| ReturnType<Document['createGImage']>
			| null;
		t.is(roundTripImage?.getSkewX(), 3);
		t.is(roundTripImage?.getSkewY(), 4);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});
