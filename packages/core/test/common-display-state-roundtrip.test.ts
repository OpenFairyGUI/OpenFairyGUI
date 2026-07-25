import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Document } from '../src/index.js';
import { NodeIO } from '../src/node.js';

type CommonDisplayState = {
	getAlpha(): number;
	getRotation(): number;
	getVisible(): boolean;
	getTouchable(): boolean;
	getGrayed(): boolean;
};

function setCommonDisplayState<T extends {
	setAlpha(value: number): T;
	setRotation(value: number): T;
	setVisible(value: boolean): T;
	setTouchable(value: boolean): T;
	setGrayed(value: boolean): T;
}>(object: T): T {
	return object
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
			const object = roundTripComponent?.getChildById(source.getId()) as CommonDisplayState | null;
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
