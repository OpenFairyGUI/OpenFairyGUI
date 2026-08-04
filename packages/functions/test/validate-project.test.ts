import test from 'ava';
import { createMinimalUamProject } from '@openfairygui/test-utils';
import { validateProject } from '../src/index.js';
import { validateProjectWeb } from '../src/web.js';

test('validateProject returns a stable report without mutating the UAM project', (t) => {
	const project = createMinimalUamProject('validation');
	const before = structuredClone(project);
	const component = project.packages[0]!.resources[1]!;
	if (component.kind !== 'component' || component.component.displayList[0]!.kind !== 'image') {
		throw new Error('Expected image component fixture');
	}
	component.component.displayList[0]!.resource = { resourceId: 'missing' };

	const report = validateProject(project);
	t.is(report.status, 'invalid');
	t.true(report.diagnostics.some((diagnostic) => diagnostic.code === 'dangling_resource_reference'));
	component.component.displayList[0]!.resource = { resourceId: 'img001' };
	t.deepEqual(project, before);
});

test('validateProject distinguishes an incomplete capability result', (t) => {
	const report = validateProject(createMinimalUamProject('validation'), { complete: false });
	t.is(report.status, 'incomplete');
	t.false(report.complete);
});

test('validateProjectWeb reports unavailable browser decoding as incomplete', async (t) => {
	const project = createMinimalUamProject('validation');
	const image = project.packages[0]!.resources[0]!;
	if (image.kind !== 'image') throw new Error('Expected image fixture');
	image.sourceBytes = Uint8Array.from(Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
		'base64',
	));

	const report = await validateProjectWeb(project);
	t.is(report.status, 'incomplete');
	t.true(report.diagnostics.some((diagnostic) => diagnostic.code === 'decode_capability_unavailable'));
});
