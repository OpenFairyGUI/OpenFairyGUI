import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'ava';
import { ProjectReader, ProjectWriter } from '@openfairygui/core/project-io';
import {
	liftDocumentToUamProject,
	materializeUamProject,
	normalizeUamProject,
	validateUamProject,
} from '@openfairygui/core/uam';
import { createNodeBackendFileSystem } from '../src/node.js';
import { createCaptureFileSystem } from '../src/services/capture-project.js';
import { createBackendRuntime, createTempBackendProject } from './helpers.js';

// Public source evidence: FairyGUI-layabox b20855e25ae83a53e04b4b2ab76ddd931ef7af80,
// demo/UIProject/assets/Bag/Main.xml (component fileName), Bag/BagButton.xml
// and Basics/Demo_Controller.xml (single colors, outlines and "-" states).
const cases = [
	{ name: 'control', node: '<graph id="n0" name="shape" xy="0,0" size="100,100" type="rect"/>', expected: '' },
	{
		name: 'component file hint',
		node: '<component id="n0" name="child" src="child001" fileName="Child.xml" xy="0,0"/>',
		expected: 'fileName="Child.xml"',
	},
	{
		name: 'stale component file hint',
		node: '<component id="n0" name="child" src="child001" fileName="old/Child.xml" xy="0,0"/>',
		expected: 'fileName="old/Child.xml"',
	},
	{
		name: 'single colors',
		values: '#ff0000|#0000ff',
		defaultValue: '#ffffff',
		expected: 'values="#ff0000|#0000ff" default="#ffffff"',
	},
	{
		name: 'empty outline',
		values: '#ff0000,|#0000ff,',
		defaultValue: '#ffffff,',
		expected: 'values="#ff0000|#0000ff" default="#ffffff"',
	},
	{
		name: 'explicit outlines',
		values: '#ff0000,#00ff00|#0000ff,#000000',
		defaultValue: '#ffffff,#000000',
		expected: 'values="#ff0000,#00ff00|#0000ff,#000000" default="#ffffff,#000000"',
	},
	{ name: 'absent state and default', values: '-|#0000ff', expected: 'values="-|#0000ff"' },
];

for (const scenario of cases) {
	test(`issue 149: ${scenario.name} stays lossless through edit, save and reopen`, async (t) => {
		const fixture = await createTempBackendProject();
		t.teardown(() => fixture.cleanup());
		const packageDir = path.join(fixture.rootDir, 'assets', 'Main');
		const mainPath = path.join(packageDir, 'MainView.xml');
		await fs.writeFile(
			path.join(packageDir, 'package.xml'),
			'<packageDescription id="pkg001"><resources><component id="cmp001" name="MainView.xml" path="/" exported="true"/><component id="child001" name="Child.xml" path="/"/></resources></packageDescription>',
		);
		await fs.writeFile(path.join(packageDir, 'Child.xml'), '<component size="20,20"/>');
		const gear = `<gearColor controller="State" pages="0,1" values="${scenario.values}"${scenario.defaultValue ? ` default="${scenario.defaultValue}"` : ''}/>`;
		const node =
			scenario.node ??
			(scenario.name === 'explicit outlines'
				? `<text id="n0" name="label" xy="0,0" size="100,100" text="Label">${gear}</text>`
				: `<graph id="n0" name="shape" xy="0,0" size="100,100" type="rect">${gear}</graph>`);
		const original = `<component size="100,100"><controller name="State" pages="0,Red,1,Blue"/><displayList>${node}</displayList></component>`;
		await fs.writeFile(mainPath, original);

		const document = await new ProjectReader({
			...createNodeBackendFileSystem(),
			async exists(filePath) {
				try {
					await fs.access(filePath);
					return true;
				} catch {
					return false;
				}
			},
		}).read(fixture.fairyPath);
		const project = normalizeUamProject(liftDocumentToUamProject(document));
		t.deepEqual(validateUamProject(project), []);
		const before = new Map<string, string | Uint8Array>();
		const after = new Map<string, string | Uint8Array>();
		const beforeDirs = new Set<string>();
		const afterDirs = new Set<string>();
		await new ProjectWriter(createCaptureFileSystem(before, beforeDirs)).write(document, 'Project.fairy');
		await new ProjectWriter(createCaptureFileSystem(after, afterDirs)).write(
			materializeUamProject(project),
			'Project.fairy',
		);
		t.deepEqual(after, before);
		t.deepEqual(afterDirs, beforeDirs);
		if (scenario.name.includes('file hint')) {
			const resource = project.packages[0]!.resources.find((item) => item.id === 'cmp001');
			if (resource?.kind !== 'component') throw new Error('Missing main component');
			const child = resource.component.displayList[0]!;
			t.true(child.kind === 'component' && child.fileName !== undefined);
			(child as unknown as { fileName: unknown }).fileName = 42;
			t.true(validateUamProject(project).some((issue) => issue.path.endsWith('.fileName')));
		}

		const runtime = createBackendRuntime();
		const opened = await runtime.openSession({ projectPath: fixture.fairyPath });
		t.true(opened.ok);
		if (!opened.ok) return;
		const sessionId = opened.data.sessionId;
		t.teardown(async () => {
			await runtime.closeSession({ sessionId });
		});
		t.is(opened.data.uamFidelity, 'full');
		t.false(opened.data.dirty);
		const validation = runtime.validateSession({ sessionId });
		t.true(validation.ok);
		if (validation.ok) {
			t.is(validation.data.status, 'valid');
			t.true(validation.data.complete);
			t.deepEqual(validation.data.diagnostics, []);
		}
		t.is(await fs.readFile(mainPath, 'utf8'), original);
		const edited = await runtime.applyTransaction({
			sessionId,
			expectedRevision: 0,
			operations: [
				{
					kind: 'setDisplayNodeProps',
					selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n0' },
					props: { position: { x: 12, y: 34 } },
				},
			],
		});
		t.true(edited.ok);
		t.true((await runtime.saveSession({ sessionId, expectedRevision: 1 })).ok);
		const saved = await fs.readFile(mainPath, 'utf8');
		t.true(saved.includes('xy="12,34"'));
		t.true(saved.includes(scenario.expected), saved);
		t.true((await runtime.closeSession({ sessionId })).ok);
		const reopened = await runtime.openSession({ projectPath: fixture.fairyPath });
		t.true(reopened.ok);
		if (reopened.ok) {
			t.is(reopened.data.uamFidelity, 'full');
			t.false(reopened.data.dirty);
			await runtime.closeSession({ sessionId: reopened.data.sessionId });
		}
	});
}
