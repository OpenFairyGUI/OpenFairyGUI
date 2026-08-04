import test from 'ava';
import { Document, liftDocumentToUamProject } from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';
import { getFixtureProjectPath } from '@openfairygui/test-utils';
import { inspect, validateProject, prune, rename } from '../src/index.js';

const PROJECT_PATH = getFixtureProjectPath('FairyGUI-unity', 'UIProject/FairyGUI-Unity-Examples.fairy');

// Shared: read the project once.
let _doc: Document;
async function getDoc(): Promise<Document> {
	if (!_doc) {
		const io = new NodeIO();
		_doc = await io.readProject(PROJECT_PATH);
	}
	return _doc;
}

// ─── inspect() ───────────────────────────────────────────────────────────

test('inspect: produces a valid report', async (t) => {
	const doc = await getDoc();
	const report = inspect(doc);

	t.truthy(report.projectId, 'has project ID');
	t.is(report.projectType, 0, 'Unity project type');
	t.true(report.totals.packages >= 20, `has ≥20 packages (got ${report.totals.packages})`);
	t.true(report.totals.components >= 100, `has ≥100 components (got ${report.totals.components})`);
	t.true(report.totals.displayObjects >= 500, `has ≥500 display objects (got ${report.totals.displayObjects})`);
	t.true(report.totals.gears >= 100, `has ≥100 gears (got ${report.totals.gears})`);
});

test('inspect: Basics package report has details', async (t) => {
	const doc = await getDoc();
	const report = inspect(doc);
	const basics = report.packages.find((p) => p.name === 'Basics');
	t.truthy(basics, 'Basics package found');
	t.true(basics!.resources.images.count > 0, 'has images');
	t.true(basics!.resources.components.count > 0, 'has components');
	t.true(basics!.componentDetails.length > 0, 'has component details');
});

// ─── validateProject() ───────────────────────────────────────────────────

test('validate: runs without throwing on the demo project', async (t) => {
	const doc = await getDoc();
	const report = validateProject(liftDocumentToUamProject(doc));
	t.true(['valid', 'invalid'].includes(report.status));
	t.true(Array.isArray(report.diagnostics));
});

test('validate: detects errors in a broken project', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('test');
	pkg.setId('test0001');

	// Component with a broken src reference
	const comp = doc.createComponent('broken');
	comp.setId('c001');
	const child = doc.createGComponent('ref');
	child.setId('n0');
	child.setSrc('ui://test0001nonexist');
	comp.addChild(child);
	pkg.addResource(comp);

	const report = validateProject(liftDocumentToUamProject(doc));
	t.is(report.status, 'invalid');
	t.true(report.diagnostics.some((diagnostic) => diagnostic.code === 'dangling_resource_reference'));
});

// ─── prune() ─────────────────────────────────────────────────────────────

test('prune: removes unused non-exported resources', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('test');
	pkg.setId('test0001');

	// Create an image that's not referenced by any component
	const img = doc.createImageResource('unused');
	img.setId('img001').setExported(false);
	pkg.addResource(img);

	// Create a component (no children referencing the image)
	const comp = doc.createComponent('Main');
	comp.setId('c001');
	pkg.addResource(comp);

	const resBefore = pkg.listResources().length;
	await doc.transform(prune());
	const resAfter = pkg.listResources().length;

	t.true(resAfter < resBefore, `resources pruned: ${resBefore} → ${resAfter}`);
});

test('prune: keeps exported resources', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('test');
	pkg.setId('test0001');

	const img = doc.createImageResource('exported');
	img.setId('img001').setExported(true);
	pkg.addResource(img);

	await doc.transform(prune());
	const remaining = pkg.listResources().filter((r) => r.getName() === 'exported');
	t.is(remaining.length, 1, 'exported resource is preserved');
});

// ─── rename() ────────────────────────────────────────────────────────────

test('rename: renames a resource', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('test');
	pkg.setId('test0001');

	const comp = doc.createComponent('OldName');
	comp.setId('c001');
	pkg.addResource(comp);

	await doc.transform(rename({
		packageName: 'test',
		resourceName: 'OldName',
		newName: 'NewName',
	}));

	const renamed = pkg.listComponents().find((c) => c.getName() === 'NewName');
	t.truthy(renamed, 'component renamed to NewName');
	const old = pkg.listComponents().find((c) => c.getName() === 'OldName');
	t.falsy(old, 'old name no longer exists');
});

// ─── transform pipeline ─────────────────────────────────────────────────

test('transform pipeline: prune runs on a validatable document', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('test');
	pkg.setId('test0001');

	const img = doc.createImageResource('unused');
	img.setId('img001').setExported(false);
	pkg.addResource(img);

	const comp = doc.createComponent('Main');
	comp.setId('c001');
	pkg.addResource(comp);

	await doc.transform(
		prune(),
	);
	t.truthy(validateProject(liftDocumentToUamProject(doc)));
	// Image should be pruned
	const images = pkg.listResources().filter((r) => r.propertyType === 'ImageResource');
	t.is(images.length, 0, 'unused image was pruned');
});
