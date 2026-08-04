import test from 'ava';
import { createBackendFixtureProject, createBackendRuntime } from './helpers.js';

test('validateSession reports current UAM reference failures without changing revision', (t) => {
	const project = createBackendFixtureProject();
	const image = project.packages[0]!.resources[0]!;
	if (image.kind !== 'image') throw new Error('Expected image fixture');
	image.sourceBytes = Uint8Array.from(Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
		'base64',
	));
	const component = project.packages[0]!.resources[1]!;
	if (component.kind !== 'component' || component.component.displayList[0]!.kind !== 'image') {
		throw new Error('Expected image component fixture');
	}
	component.component.displayList[0]!.resource = { resourceId: 'missing' };
	const runtime = createBackendRuntime();
	const opened = runtime.openProjectSession({ project });
	t.true(opened.ok);
	if (!opened.ok) return;

	const result = runtime.validateSession({ sessionId: opened.data.sessionId });
	t.true(result.ok);
	if (!result.ok) return;
	t.is(result.data.status, 'invalid');
	t.true(result.data.complete);
	t.true(result.data.diagnostics.some((diagnostic) => diagnostic.code === 'dangling_resource_reference'));
	t.is(result.meta.revision, 0);
	t.true(result.meta.diagnostics.some((diagnostic) => diagnostic.code === 'dangling_resource_reference'));
});
