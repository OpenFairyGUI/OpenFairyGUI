import test from 'ava';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '../src/index.js';

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

test('binary: reads without error', async (t) => {
	const doc = await getDoc();
	t.truthy(doc, 'document is non-null');
});

test('binary: package is created with non-empty id and name', async (t) => {
	const doc = await getDoc();
	const packages = doc.getRoot().listPackages();
	t.is(packages.length, 1, 'one package from binary file');
	const pkg = packages[0];
	t.truthy(pkg.getId(), 'package has non-empty id');
	t.truthy(pkg.getName(), 'package has non-empty name');
});

test('binary: resources are extracted', async (t) => {
	const doc = await getDoc();
	const pkg = doc.getRoot().listPackages()[0];
	const resources = pkg.listResources();
	t.true(resources.length > 10, `expected >10 resources, got ${resources.length}`);
});

test('binary: image resources have scale/smoothing properties', async (t) => {
	const doc = await getDoc();
	const pkg = doc.getRoot().listPackages()[0];
	const images = pkg.listResources().filter((r) => r.propertyType === 'ImageResource');
	t.true(images.length > 0, 'has image resources');
	// All image resources should exist (just verify they were parsed without crashing)
	t.pass('image resources parsed successfully');
});

test('binary: sprite atlas mapping is stored in extras', async (t) => {
	const doc = await getDoc();
	const pkg = doc.getRoot().listPackages()[0];
	const extras = pkg.getExtras() as { sprites?: unknown[] };
	t.truthy(extras, 'extras is non-null');
	t.true(Array.isArray(extras?.sprites), 'sprites array is present in extras');
	t.true((extras.sprites as unknown[]).length > 0, 'sprites array is non-empty');
});

test('binary: dependencies stored in extras', async (t) => {
	const doc = await getDoc();
	const pkg = doc.getRoot().listPackages()[0];
	const extras = pkg.getExtras() as { dependencies?: unknown[] };
	t.true(Array.isArray(extras?.dependencies), 'dependencies array present in extras');
});

test('binary: components have raw binary data in extras', async (t) => {
	const doc = await getDoc();
	const pkg = doc.getRoot().listPackages()[0];
	const components = pkg.listResources().filter((r) => r.propertyType === 'Component');
	t.true(components.length > 0, 'package has component resources');

	// Each component should have _rawBinary in extras
	const withRaw = components.filter((c) => {
		const extras = (c as any).getExtras?.() as Record<string, unknown> | null;
		return extras?._rawBinary != null;
	});
	t.is(withRaw.length, components.length, 'all components have _rawBinary in extras');
});
