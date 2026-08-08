import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMinimalUamProject } from '@openfairygui/test-utils';
import {
	readProjectAsUam,
	writeProjectFromUam,
	validateTransactionSupport,
	validateUamProject,
	validateUamReferences,
	validateUamSourceBytes,
} from '../src/index.js';
import { NodeIO } from '../src/node.js';

test('project validation reports portable path collisions and dangling references', (t) => {
	const project = createMinimalUamProject('validation');
	const pkg = project.packages[0]!;
	const image = pkg.resources[0]!;
	pkg.resources.push({
		...structuredClone(image),
		id: 'img002',
		name: 'BACKGROUND.PNG',
		path: '/IMAGES',
	});
	const component = pkg.resources[1]!;
	if (component.kind !== 'component') throw new Error('Expected component fixture');
	const displayNode = component.component.displayList[0]!;
	if (displayNode.kind !== 'image') throw new Error('Expected image display fixture');
	displayNode.resource = { resourceId: 'missing' };

	const diagnostics = validateUamProject(project);
	t.true(diagnostics.some((diagnostic) => diagnostic.code === 'path_collision'));
	t.true(validateUamReferences(project).some((diagnostic) => diagnostic.code === 'dangling_resource_reference'));
});

test('project validation treats package names as portable identities', (t) => {
	const project = createMinimalUamProject('validation');
	project.packages.push({ ...structuredClone(project.packages[0]!), id: 'pkg002', name: 'main' });

	t.true(validateUamProject(project).some((diagnostic) => diagnostic.code === 'duplicate_package_name'));
});

test('transaction lifecycle preflight reuses project reference checks', (t) => {
	const project = createMinimalUamProject('validation');
	const image = project.packages[0]!.resources[0]!;
	if (image.kind !== 'image') throw new Error('Expected image fixture');
	image.sourceBytes = new Uint8Array([1]);

	const issues = validateTransactionSupport(project, [
		{ kind: 'removeResource', selector: { packageId: 'pkg001', resourceId: 'img001' } },
	]);
	t.true(issues.some((issue) => issue.code === 'invalid_resource_reference'));
});

test('UAM write/read/validate preserves cross-package image references', async (t) => {
	const project = createMinimalUamProject('cross-package-image');
	const ownerPackage = project.packages[0]!;
	const image = ownerPackage.resources.find((resource) => resource.kind === 'image')!;
	const component = ownerPackage.resources.find((resource) => resource.kind === 'component')!;
	if (component.kind !== 'component') throw new Error('Expected component fixture');
	const imageNode = component.component.displayList[0]!;
	if (imageNode.kind !== 'image') throw new Error('Expected image node fixture');

	ownerPackage.resources = [component];
	project.packages.push({
		...structuredClone(ownerPackage),
		id: 'pkg002',
		name: 'Shared',
		resources: [image],
	});
	imageNode.resource = { packageId: 'pkg002', resourceId: image.id };
	t.deepEqual(validateUamReferences(project), []);

	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-cross-package-image-'));
	try {
		const fairyPath = path.join(root, 'CrossPackage.fairy');
		const io = new NodeIO();
		await writeProjectFromUam(io, project, fairyPath);
		const xml = await fs.readFile(path.join(root, 'assets', 'Main', 'MainView.xml'), 'utf8');
		t.regex(xml, /\bpkg="pkg002"/u);

		const read = await readProjectAsUam(io, fairyPath);
		const readComponent = read.packages[0]?.resources.find((resource) => resource.id === component.id);
		if (readComponent?.kind !== 'component') throw new Error('Expected written component');
		const readImageNode = readComponent.component.displayList[0];
		if (readImageNode?.kind !== 'image') throw new Error('Expected written image node');
		t.deepEqual(readImageNode.resource, { packageId: 'pkg002', resourceId: image.id });
		t.deepEqual(validateUamReferences(read), []);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});

test('source validation accepts the standard SVG namespace and rejects external references', (t) => {
	const project = createMinimalUamProject('validation');
	const image = project.packages[0]!.resources[0]!;
	if (image.kind !== 'image') throw new Error('Expected image fixture');
	image.fileName = 'external.svg';

	image.sourceBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
	t.false(validateUamSourceBytes(project).diagnostics.some((diagnostic) => diagnostic.code === 'corrupt_source'));

	for (const source of [
		'<svg xmlns="http://www.w3.org/2000/svg"><use href="https://example.com/x.svg#shape"/></svg>',
		'<svg xmlns="http://www.w3.org/2000/svg"><rect src="https://example.com/x.png"/></svg>',
		'<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(https://example.com/x.svg#shape)"/></svg>',
		'<svg xmlns="http://www.w3.org/2000/svg"><use href="javascript:alert(1)"/></svg>',
	]) {
		image.sourceBytes = new TextEncoder().encode(source);
		t.true(
			validateUamSourceBytes(project).diagnostics.some((diagnostic) => diagnostic.code === 'corrupt_source'),
			source,
		);
	}
});

test('detailed project reads retain settings and missing-source diagnostics', async (t) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-read-diagnostics-'));
	try {
		const fairyPath = path.join(root, 'Project.fairy');
		const io = new NodeIO();
		await writeProjectFromUam(io, createMinimalUamProject('validation'), fairyPath);
		await fs.writeFile(path.join(root, 'settings', 'Publish.json'), '{', 'utf8');

		const read = await io.readProjectDetailed(fairyPath, { hydrateResourceBytes: true });
		t.truthy(read.document);
		t.false(read.complete);
		t.true(read.diagnostics.some((diagnostic) => diagnostic.code === 'invalid_settings_json'));
		t.true(read.diagnostics.some((diagnostic) => diagnostic.code === 'missing_source'));

		await fs.writeFile(fairyPath, '<projectDescription>', 'utf8');
		const malformed = await io.readProjectDetailed(fairyPath);
		t.is(malformed.document, null);
		t.true(malformed.diagnostics.some((diagnostic) => diagnostic.code === 'invalid_project_xml'));
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});

test('detailed project reads report FairyGUI Desktop-incompatible integer geometry', async (t) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-read-geometry-'));
	try {
		const fairyPath = path.join(root, 'Project.fairy');
		const componentPath = path.join(root, 'assets', 'Main', 'MainView.xml');
		const io = new NodeIO();
		await writeProjectFromUam(io, createMinimalUamProject('validation'), fairyPath);
		await fs.writeFile(componentPath, `<?xml version="1.0" encoding="utf-8"?>
<component size="320.5,180" scale="1.25,0.75" designImageOffsetX="2147483648">
  <displayList>
    <image id="n0" name="bg" src="img001" xy="2.625,5.25" size="320,180">
      <gearXY values="1.5,2,0.25,0.5" default="-"/>
    </image>
    <list id="n1" xy="0,0" size="100,100" margin="1,2.5,3,4"/>
  </displayList>
</component>`, 'utf8');

		const read = await io.readProjectDetailed(fairyPath);
		const geometryDiagnostics = read.diagnostics.filter((diagnostic) => diagnostic.code === 'desktop_incompatible_geometry');
		t.truthy(read.document);
		t.true(read.complete);
		t.deepEqual(geometryDiagnostics.map((diagnostic) => diagnostic.path), [
			'components.cmp001.component.size',
			'components.cmp001.component.designImageOffsetX',
			'components.cmp001.displayList.0.xy',
			'components.cmp001.displayList.0.gearXY.0.values',
			'components.cmp001.displayList.1.margin',
		]);
		t.true(geometryDiagnostics.every((diagnostic) => diagnostic.sourcePath === componentPath));
		t.false(geometryDiagnostics.some((diagnostic) => diagnostic.path.endsWith('.scale')));
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});

test('detailed project reads report invalid raw component values before tolerant parsing', async (t) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-read-values-'));
	try {
		const fairyPath = path.join(root, 'Project.fairy');
		const componentPath = path.join(root, 'assets', 'Main', 'MainView.xml');
		const io = new NodeIO();
		await writeProjectFromUam(io, createMinimalUamProject('validation'), fairyPath);
		await fs.writeFile(componentPath, `<?xml version="1.0" encoding="utf-8"?>
<component size="320,180" pivot="0.5,NaN" overflow="clip" opaque="yes" designImageAlpha="50.5">
  <displayList>
    <text id="n0" xy="0,0" size="100,20" scale="1.25,0.75" visible="yes" alpha="1.5" rotation="90deg" fontSize="12.5" align="sideways" shadowColor="#000000" shadowOffset="1"/>
    <list id="n1" xy="0,20" size="100,100" layout="grid" autoItemSize="sometimes" lineGap="2.5"/>
    <group id="n2" xy="0,0" size="100,100" advanced="true" layout="hz"/>
  </displayList>
</component>`, 'utf8');

		const read = await io.readProjectDetailed(fairyPath);
		const valueDiagnostics = read.diagnostics.filter((diagnostic) => diagnostic.code === 'invalid_project_value');
		t.truthy(read.document);
		t.true(read.complete);
		t.deepEqual(valueDiagnostics.map((diagnostic) => diagnostic.path).sort(), [
			'components.cmp001.component.designImageAlpha',
			'components.cmp001.component.opaque',
			'components.cmp001.component.overflow',
			'components.cmp001.component.pivot',
			'components.cmp001.displayList.0.align',
			'components.cmp001.displayList.0.alpha',
			'components.cmp001.displayList.0.fontSize',
			'components.cmp001.displayList.0.rotation',
			'components.cmp001.displayList.0.shadowOffset',
			'components.cmp001.displayList.0.visible',
			'components.cmp001.displayList.1.autoItemSize',
			'components.cmp001.displayList.1.layout',
			'components.cmp001.displayList.1.lineGap',
		].sort());
		t.true(valueDiagnostics.every((diagnostic) => diagnostic.sourcePath === componentPath));
		t.false(valueDiagnostics.some((diagnostic) => diagnostic.path.endsWith('.scale')));
		const group = read.document!.getRoot().listPackages()[0]!.listComponents()[0]!.listChildren()
			.find((child) => child.getId() === 'n2') as { getLayout(): number } | undefined;
		t.is(group?.getLayout(), 1);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});
