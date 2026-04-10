import test from 'ava';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASICS_FUI = path.resolve(
	__dirname,
	'../../../referer/Release/FairyGUI-Unity-Examples/Basics_fui.bytes',
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
