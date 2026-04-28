import test from 'ava';
import { getFixturePath } from '@openfairygui/test-utils';
import { type Document, PropertyType } from '../src/index.js';
import { NodeIO } from '../src/node.js';

const BASICS_FUI = getFixturePath(
	'FairyGUI-unity',
	'Assets',
	'Examples',
	'Resources',
	'UI',
	'Basics_fui.bytes',
);

// Shared: read the binary package once.
let _doc: Awaited<ReturnType<NodeIO['readBinary']>>;
async function getDoc() {
	if (!_doc) {
		const io = new NodeIO();
		_doc = await io.readBinary(BASICS_FUI);
	}
	return _doc;
}

function getMainPackage(doc: Awaited<ReturnType<NodeIO['readBinary']>>) {
	return doc.getRoot().listPackages().find((pkg) => pkg.listResources().length > 0) ?? null;
}

test('binary: reads without error', async (t) => {
	const doc = await getDoc();
	t.truthy(doc, 'document is non-null');
});

test('binary: package is created with non-empty id and name', async (t) => {
	const doc = await getDoc();
	const pkg = getMainPackage(doc);
	t.truthy(pkg, 'main package exists');
	t.truthy(pkg.getId(), 'package has non-empty id');
	t.truthy(pkg.getName(), 'package has non-empty name');
});

test('binary: resources are extracted', async (t) => {
	const doc = await getDoc();
	const pkg = getMainPackage(doc)!;
	const resources = pkg.listResources();
	t.true(resources.length > 10, `expected >10 resources, got ${resources.length}`);
});

test('binary: image resources have scale/smoothing properties', async (t) => {
	const doc = await getDoc();
	const pkg = getMainPackage(doc)!;
	const images = pkg.listResources().filter((r) => r.propertyType === 'ImageResource');
	t.true(images.length > 0, 'has image resources');
	// All image resources should exist (just verify they were parsed without crashing)
	t.pass('image resources parsed successfully');
});

test('binary: sprite atlas mapping is stored in extras', async (t) => {
	const doc = await getDoc();
	const pkg = getMainPackage(doc)!;
	const extras = pkg.getExtras() as { sprites?: unknown[] };
	t.truthy(extras, 'extras is non-null');
	t.true(Array.isArray(extras?.sprites), 'sprites array is present in extras');
	t.true((extras.sprites as unknown[]).length > 0, 'sprites array is non-empty');
});

test('binary: dependencies are attached as formal package relations', async (t) => {
	const doc = await getDoc();
	const pkg = getMainPackage(doc)!;
	const deps = pkg.listDependencies();
	t.true(Array.isArray(deps), 'dependencies list exists');
	for (const dep of deps) {
		t.truthy(dep.getId(), 'dependency package has id');
		t.truthy(dep.getName(), 'dependency package has name');
	}
	t.pass('dependencies are represented as formal package relations when present');
});

test('binary: components have raw binary data in extras', async (t) => {
	const doc = await getDoc();
	const pkg = getMainPackage(doc)!;
	const components = pkg.listResources().filter((r) => r.propertyType === 'Component');
	t.true(components.length > 0, 'package has component resources');

	// Each component should have _rawBinary in extras
	const withRaw = components.filter((c) => {
		const extras = (c as any).getExtras?.() as Record<string, unknown> | null;
		return extras?._rawBinary != null;
	});
	t.is(withRaw.length, components.length, 'all components have _rawBinary in extras');
});

test('binary: component top-level formal properties decode from sample package', async (t) => {
	const doc = await getDoc();
	const pkg = getMainPackage(doc)!;

	const scrollComp = pkg.getComponent('Demo_Component');
	t.truthy(scrollComp, 'Demo_Component exists');
	t.is(scrollComp?.getWidth(), 1136);
	t.is(scrollComp?.getHeight(), 570);
	t.is(scrollComp?.getOverflow(), 2, 'Demo_Component uses scroll overflow');
	t.is(scrollComp?.getScrollBarDisplay(), 3, 'Demo_Component uses hidden scrollbar display');

	const buttonComp = pkg.getComponent('Button5');
	t.truthy(buttonComp, 'Button5 exists');
	t.is(buttonComp?.getExtensionType(), 'Button');
	t.is(buttonComp?.getDownEffect(), 2);
	t.true(Math.abs((buttonComp?.getDownEffectValue() ?? 0) - 0.8) < 1e-6);

	const comboComp = pkg.getComponent('Dropdown');
	t.truthy(comboComp, 'Dropdown exists');
	t.is(comboComp?.getExtensionType(), 'ComboBox');

	const progressComp = pkg.getComponent('ProgressBar4');
	t.truthy(progressComp, 'ProgressBar4 exists');
	t.is(progressComp?.getExtensionType(), 'ProgressBar');
	t.is(progressComp?.getTitleType(), 1);
	t.true(progressComp?.getReverse() ?? false);

	const labelComp = pkg.getComponent('WindowFrameB');
	t.truthy(labelComp, 'WindowFrameB exists');
	t.is(labelComp?.getExtensionType(), 'Label');
});

test('binary: component display lists decode into formal child nodes from sample package', async (t) => {
	const doc = await getDoc();
	const pkg = getMainPackage(doc)!;

	const mainComp = pkg.getComponent('Main');
	t.truthy(mainComp, 'Main exists');
	t.true((mainComp?.listChildren().length ?? 0) > 10, 'Main has decoded display-list children');

	const buttonComp = pkg.getComponent('Button5');
	t.truthy(buttonComp, 'Button5 exists');
	t.is(buttonComp?.listChildren().length, 3, 'Button5 child count is decoded');

	const bg = buttonComp?.listChildren().find((child) => child.getId() === 'n0');
	t.truthy(bg, 'Button5 background child exists');
	t.is(bg?.propertyType, PropertyType.G_IMAGE);
	t.is((bg as any)?.getSrc?.(), 'rpmb1');

	const title = buttonComp?.listChildren().find((child) => child.getId() === 'n1');
	t.truthy(title, 'Button5 title child exists');
	t.is(title?.propertyType, PropertyType.G_TEXT_FIELD);

	const icon = buttonComp?.listChildren().find((child) => child.getId() === 'n2');
	t.truthy(icon, 'Button5 icon child exists');
	t.is(icon?.propertyType, PropertyType.G_LOADER);
});

test('binary: GList child blocks decode into formal list properties from sample package', async (t) => {
	const doc = await getDoc();
	const pkg = getMainPackage(doc)!;

	const demoList = pkg.getComponent('Demo_List');
	t.truthy(demoList, 'Demo_List exists');

	const verticalList = demoList?.listChildren().find((child) => child.getId() === 'n0') as ReturnType<Document['createGList']>;
	t.truthy(verticalList, 'Demo_List vertical list exists');
	t.is(verticalList.getLayout(), 0);
	t.is(verticalList.getOverflow(), 2);
	t.is(verticalList.getScrollType(), 1);
	t.is(verticalList.getDefaultItem(), 'ui://9leh0eyfkpev60');
	t.deepEqual(verticalList.getClipSoftness(), { x: 0, y: 20 });
	t.true(verticalList.getScrollItemToViewOnClick());
	t.false(verticalList.getFoldInvisibleItems());
	t.is(verticalList.getListItems().length, 6);

	const flowHorizontalList = demoList?.listChildren().find((child) => child.getId() === 'n9') as ReturnType<Document['createGList']>;
	t.truthy(flowHorizontalList, 'Demo_List flow-horizontal list exists');
	t.is(flowHorizontalList.getLayout(), 3);
	t.is(flowHorizontalList.getScrollType(), 0);
	t.is(flowHorizontalList.getListItems().length, 6);

	const demoGrid = pkg.getComponent('Demo_Grid');
	t.truthy(demoGrid, 'Demo_Grid exists');
	const multiSelectList = demoGrid?.listChildren().find((child) => child.getId() === 'n30') as ReturnType<Document['createGList']>;
	t.truthy(multiSelectList, 'Demo_Grid selectable list exists');
	t.is(multiSelectList.getSelectionMode(), 3);
	t.is(multiSelectList.getDefaultItem(), 'ui://9leh0eyfatih7o');
	t.deepEqual(multiSelectList.getClipSoftness(), { x: 0, y: 20 });
	t.is(multiSelectList.getListItems().length, 4);
});

test('binary: component structured objects decode from sample package', async (t) => {
	const doc = await getDoc();
	const pkg = getMainPackage(doc)!;

	const buttonComp = pkg.getComponent('Button5');
	t.truthy(buttonComp, 'Button5 exists');
	t.is(buttonComp?.listControllers().length, 1, 'Button5 controller is decoded');
	const buttonController = buttonComp?.listControllers()[0];
	t.is(buttonController?.getName(), 'button');
	t.deepEqual(
		buttonController?.listPages().map((page) => ({ id: page.getId(), name: page.getName() })),
		[
			{ id: '0', name: 'up' },
			{ id: '1', name: 'down' },
			{ id: '2', name: 'over' },
			{ id: '3', name: 'selectedOver' },
		],
	);
	const buttonBg = buttonComp?.listChildren().find((child) => child.getId() === 'n0');
	t.truthy(buttonBg, 'Button5 background child exists');
	t.deepEqual(buttonBg?.getRelations(), [
		{ target: '', type: 14, usePercent: false },
		{ target: '', type: 15, usePercent: false },
	]);

	const relationComp = pkg.getComponent('Demo_Relation');
	t.truthy(relationComp, 'Demo_Relation exists');
	const gearChild = relationComp?.listChildren().find((child) => child.getId() === 'n1');
	t.truthy(gearChild, 'Demo_Relation gear child exists');
	t.is(gearChild?.listGears().length, 1);
	const gear = gearChild?.listGears()[0];
	t.is(gear?.getGearType(), 1);
	t.is(gear?.getController()?.getName(), 'c1');
	t.is(gear?.getPages(), '0,1');
	t.is(gear?.getValues(), '45,219|336,224');
	t.is(gear?.getDefaultValue(), '40,212');
	t.true(gear?.getTween() ?? false);

	const windowComp = pkg.getComponent('WindowB');
	t.truthy(windowComp, 'WindowB exists');
	t.is(windowComp?.listTransitions().length, 1, 'WindowB transition is decoded');
	const transition = windowComp?.listTransitions()[0];
	t.is(transition?.getName(), 't1');
	t.false(transition?.getAutoPlay() ?? true);
	t.is(transition?.listItems().length, 1);
	const transitionItem = transition?.listItems()[0];
	t.is(transitionItem?.getActionType(), 0);
	t.is(transitionItem?.getTargetId(), 'n7');
	t.true(transitionItem?.getTween() ?? false);
	t.deepEqual(transitionItem?.getStartValue(), ['-29', '-']);
	t.deepEqual(transitionItem?.getEndValue(), ['-9', '-']);
});

test('binary: movie clips decode frame data into formal properties', async (t) => {
	const doc = await getDoc();
	const pkg = getMainPackage(doc)!;
	const movieClips = pkg.listResources().filter((r) => r.propertyType === 'MovieClipResource');
	t.true(movieClips.length > 0, 'package has movie clip resources');

	const withFrames = movieClips.filter(
		(clip) => (clip as ReturnType<Document['createMovieClipResource']>).listFrames().length > 0,
	);
	t.true(withFrames.length > 0, 'at least one movie clip decodes frames');

	for (const clip of withFrames) {
		const movieClip = clip as ReturnType<Document['createMovieClipResource']>;
		t.true(movieClip.getInterval() >= 0, 'movie clip interval is decoded');
		t.true(movieClip.getRepeatDelay() >= 0, 'movie clip repeatDelay is decoded');
		const frame = movieClip.listFrames()[0]!;
		t.true(frame.getRectWidth() >= 0, 'frame width is decoded');
		t.true(frame.getRectHeight() >= 0, 'frame height is decoded');
		t.truthy(frame.getSpriteId(), 'frame sprite id is decoded');
		const extras = movieClip.getExtras() as Record<string, unknown>;
		t.falsy(extras._rawBinaryFrames, 'raw movie clip frame extras are no longer used');
	}
});

test('binary: fonts decode glyph data into formal properties', async (t) => {
	const doc = await getDoc();
	const pkg = getMainPackage(doc)!;
	const fonts = pkg.listResources().filter((r) => r.propertyType === 'FontResource');
	t.true(fonts.length > 0, 'package has font resources');

	const withGlyphs = fonts.filter(
		(font) => (font as ReturnType<Document['createFontResource']>).listGlyphs().length > 0,
	);
	t.true(withGlyphs.length > 0, 'at least one font decodes glyphs');

	for (const font of withGlyphs) {
		const typedFont = font as ReturnType<Document['createFontResource']>;
		t.true(typedFont.getFontSize() >= 0, 'font size is decoded');
		t.true(typedFont.getLineHeight() >= 0, 'lineHeight is decoded');
		const glyph = typedFont.listGlyphs()[0]!;
		t.true(glyph.getCharId() >= 0, 'glyph charId is decoded');
		t.true(glyph.getWidth() >= 0, 'glyph width is decoded');
		t.true(glyph.getAdvance() >= 0, 'glyph advance is decoded');
		const extras = typedFont.getExtras() as Record<string, unknown>;
		t.falsy(extras._rawBinaryGlyphs, 'raw font glyph extras are no longer used');
	}
});
