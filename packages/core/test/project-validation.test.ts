import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMinimalUamProject } from '@openfairygui/test-utils';
import {
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
	component.component.displayList[0]!.resource = { resourceId: 'missing' };

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

test('source validation rejects SVG external references before host decoding', (t) => {
	const project = createMinimalUamProject('validation');
	const image = project.packages[0]!.resources[0]!;
	if (image.kind !== 'image') throw new Error('Expected image fixture');
	image.fileName = 'external.svg';
	image.sourceBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/x.png"/></svg>');

	t.true(validateUamSourceBytes(project).diagnostics.some((diagnostic) => diagnostic.code === 'corrupt_source'));
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
