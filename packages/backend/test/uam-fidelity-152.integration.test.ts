import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'ava';
import { NodeIO } from '@openfairygui/core/node';
import { ProjectWriter } from '@openfairygui/core/project-io';
import { liftDocumentToUamProject, materializeUamProject, normalizeUamProject, validateUamProject, type UamProject } from '@openfairygui/core/uam';
import { createCaptureFileSystem } from '../src/services/capture-project.js';
import { createBackendRuntime, createTempBackendProject } from './helpers.js';

function mainNode(project: UamProject) {
	const resource = project.packages[0]!.resources.find((item) => item.id === 'cmp001');
	if (resource?.kind !== 'component') throw new Error('Missing main component');
	return resource.component.displayList[0]!;
}

// Fixed source evidence: Layabox b20855e25ae83a53e04b4b2ab76ddd931ef7af80,
// Basics/Demo_Controller.xml:29 (gearAni), Bag/CloseButton.xml:10 (two-field gearSize).
// Component pageController: Editor 1eab9445dd8e73c716f8a5f71c27dcbca7b4b68f,
// plugin/TsAPI/editor.d.ts FComponent.pageController; XML reader/writer and child block 4.
const scenarios: Array<{
	name: string; tag?: string; gear?: string; values?: string; defaultValue?: string;
	ownerName?: string; tween?: boolean; pageController?: string; expected: string;
}> = [
	{ name: 'compact animation', tag: 'movieclip', gear: 'gearAni', values: '0,s|3,p', defaultValue: '0,p', expected: 'values="0,s|3,p" default="0,p"' },
	{ name: 'expanded animation', tag: 'movieclip', gear: 'gearAni', values: '0,s,,|3,p,,', defaultValue: '0,p,,', expected: 'values="0,s|3,p" default="0,p"' },
	{ name: 'named animation and skin', tag: 'loader3D', gear: 'gearAni', values: '0,p,idle,|1,p,,skin', defaultValue: '2,s,walk,skin', expected: 'values="0,p,idle|1,p,,skin" default="2,s,walk,skin"' },
	{ name: 'absent animation state/default', tag: 'movieclip', gear: 'gearAni', values: '-|3,p', expected: 'values="-|3,p"' },
	...['shape', 'bg'].flatMap((ownerName) => [false, true].map((tween) => ({
		name: `compact size ${ownerName} tween=${tween}`, tag: 'graph', gear: 'gearSize', ownerName, tween,
		values: '64,80|32,40', defaultValue: '60,74',
		expected: tween ? 'values="64,80,1,1|32,40,1,1" default="60,74,1,1"'
			: ownerName === 'bg' ? 'values="64,80,1.00,1.00|32,40,1.00,1.00" default="60,74,1.00,1.00"'
				: 'values="64,80|32,40" default="60,74"',
	}))),
	{ name: 'mixed compact/nonidentity size', tag: 'graph', gear: 'gearSize', values: '64,80|32,40,2,0.5', defaultValue: '60,74', expected: 'values="64,80,1.00,1.00|32,40,2.00,0.50"' },
	{ name: 'absent size state/default', tag: 'graph', gear: 'gearSize', ownerName: 'bg', values: '-|32,40', expected: 'values="-|32,40,1.00,1.00"' },
	{ name: 'page controller', pageController: 'State', expected: 'pageController="State"' },
	{ name: 'absent page controller', pageController: '', expected: 'src="child001"' },
];

for (const scenario of scenarios) {
	test(`issue 152: ${scenario.name} preserves writer output and saves`, async (t) => {
		const fixture = await createTempBackendProject();
		t.teardown(() => fixture.cleanup());
		const pkg = path.join(fixture.rootDir, 'assets', 'Main');
		const mainPath = path.join(pkg, 'MainView.xml');
		await fs.writeFile(path.join(pkg, 'package.xml'), '<packageDescription id="pkg001"><resources><component id="cmp001" name="MainView.xml" path="/"/><component id="child001" name="Child.xml" path="/"/></resources></packageDescription>');
		await fs.writeFile(path.join(pkg, 'Child.xml'), '<component size="20,20" overflow="scroll" scroll="horizontal" scrollBarFlags="8"/>');
		const nodeXml = scenario.pageController !== undefined
			? `<component id="n0" name="child" src="child001" xy="0,0"${scenario.pageController ? ` pageController="${scenario.pageController}"` : ''}/>`
			: `<${scenario.tag} id="n0" name="${scenario.ownerName ?? 'shape'}" xy="0,0" size="100,100"><${scenario.gear} controller="State" pages="0,1" values="${scenario.values}"${scenario.defaultValue === undefined ? '' : ` default="${scenario.defaultValue}"`}${scenario.tween ? ' tween="true"' : ''}/></${scenario.tag}>`;
		const source = `<component size="100,100"><controller name="State" pages="0,Off,1,On"/><displayList>${nodeXml}</displayList></component>`;
		await fs.writeFile(mainPath, source);
		const io = new NodeIO();
		const read = await io.readProjectDetailed(fixture.fairyPath);
		t.true(read.complete);
		t.deepEqual(read.diagnostics, []);
		const project = normalizeUamProject(liftDocumentToUamProject(read.document!));
		t.deepEqual(validateUamProject(project), []);
		const before = new Map<string, string | Uint8Array>(), after = new Map<string, string | Uint8Array>();
		const beforeDirs = new Set<string>(), afterDirs = new Set<string>();
		await new ProjectWriter(createCaptureFileSystem(before, beforeDirs)).write(read.document!, 'Project.fairy');
		await new ProjectWriter(createCaptureFileSystem(after, afterDirs)).write(materializeUamProject(project), 'Project.fairy');
		t.deepEqual(after, before);
		t.deepEqual(afterDirs, beforeDirs);
		t.true(String(after.get('assets/Main/MainView.xml')).includes(scenario.expected));
		if (scenario.pageController === '') t.false('pageController' in mainNode(project));
		if (scenario.pageController) {
			const malformed = structuredClone(project);
			Object.assign(mainNode(malformed), { pageController: 42 });
			t.true(validateUamProject(malformed).some((issue) => issue.path.endsWith('.pageController')));
			Object.assign(mainNode(malformed), { pageController: 'missing' });
			t.true(validateUamProject(malformed).some((issue) => issue.path.endsWith('.pageController')));
		}
		const runtime = createBackendRuntime();
		const opened = await runtime.openSession({ projectPath: fixture.fairyPath });
		t.true(opened.ok);
		if (!opened.ok) return;
		const sessionId = opened.data.sessionId;
		t.teardown(async () => { await runtime.closeSession({ sessionId }); });
		t.is(opened.data.uamFidelity, 'full');
		t.false(opened.data.dirty);
		const validation = runtime.validateSession({ sessionId });
		t.true(validation.ok);
		if (validation.ok) {
			t.is(validation.data.status, 'valid');
			t.true(validation.data.complete);
			t.deepEqual(validation.data.diagnostics, []);
		}
		t.is(await fs.readFile(mainPath, 'utf8'), source);
		t.true((await runtime.applyTransaction({ sessionId, expectedRevision: 0, operations: [{
			kind: 'setDisplayNodeProps', selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n0' },
			props: { position: { x: 12, y: 34 } },
		}] })).ok);
		t.true((await runtime.saveSession({ sessionId, expectedRevision: 1 })).ok);
		const reread = normalizeUamProject(liftDocumentToUamProject(await io.readProject(fixture.fairyPath)));
		const expectedNode = structuredClone(mainNode(project));
		expectedNode.position = { x: 12, y: 34 };
		t.deepEqual(mainNode(reread), expectedNode);
		t.true((await fs.readFile(mainPath, 'utf8')).includes(scenario.expected));
		t.true((await runtime.closeSession({ sessionId })).ok);
		const reopened = await runtime.openSession({ projectPath: fixture.fairyPath });
		t.true(reopened.ok);
		if (reopened.ok) {
			t.is(reopened.data.uamFidelity, 'full');
			await runtime.closeSession({ sessionId: reopened.data.sessionId });
		}
	});
}
