import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
	inspectOpaqueProjectXml,
	NodeIO,
	type Document,
} from '../src/index.js';

const PROJECT_XML = `<?xml version="1.0" encoding="utf-8"?>
<projectDescription id="pivot-project" type="Unity" version="3.0"/>
`;

const PACKAGE_XML = `<?xml version="1.0" encoding="utf-8"?>
<packageDescription id="pkgpivot">
  <resources>
    <component id="main1" name="Main.xml" path="/" exported="true"/>
  </resources>
</packageDescription>
`;

const COMPONENT_XML = `<?xml version="1.0" encoding="utf-8"?>
<component size="640,480">
  <displayList>
    <text id="plain" xy="10,20" size="100,30"
      pivot="0.1,0.2" anchor="true" text="plain"/>
    <richtext id="rich" xy="20,30" size="100,30"
      pivot="0.2,0.3" anchor="true" text="rich"/>
    <inputtext id="input" xy="30,40" size="100,30"
      pivot="0.3,0.4" anchor="true" text="input"/>
    <loader id="loader" xy="40,50" size="100,30"
      pivot="0.4,0.5" anchor="true"/>
    <list id="list" xy="50,60" size="100,30"
      pivot="0.5,0.6" anchor="true"/>
    <list id="tree" xy="60,70" size="100,30"
      pivot="0.6,0.7" anchor="true" treeView="true"/>
  </displayList>
</component>
`;

interface PivotObject {
	getPivotX(): number;
	getPivotY(): number;
	getPivotAsAnchor(): boolean;
}

const expected = new Map<string, [number, number]>([
	['plain', [0.1, 0.2]],
	['rich', [0.2, 0.3]],
	['input', [0.3, 0.4]],
	['loader', [0.4, 0.5]],
	['list', [0.5, 0.6]],
	['tree', [0.6, 0.7]],
]);

async function createSourceProject(): Promise<{
	directory: string;
	projectPath: string;
}> {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pivot-'));
	const projectPath = path.join(directory, 'Pivot.fairy');
	const packageDirectory = path.join(directory, 'assets', 'Pivot');
	await fs.mkdir(packageDirectory, { recursive: true });
	await fs.writeFile(projectPath, PROJECT_XML, 'utf8');
	await fs.writeFile(path.join(packageDirectory, 'package.xml'), PACKAGE_XML, 'utf8');
	await fs.writeFile(path.join(packageDirectory, 'Main.xml'), COMPONENT_XML, 'utf8');
	return { directory, projectPath };
}

function assertPivotState(
	t: import('ava').ExecutionContext,
	doc: Document,
	epsilon = 0,
): void {
	const component = doc.getRoot().getPackage('Pivot')?.getComponent('Main');
	t.truthy(component);
	for (const [id, [pivotX, pivotY]] of expected) {
		const child = component?.getChildById(id) as unknown as PivotObject | null;
		t.truthy(child, `${id} exists`);
		t.true(
			Math.abs((child?.getPivotX() ?? Number.NaN) - pivotX) <= epsilon,
			`${id} pivotX`,
		);
		t.true(
			Math.abs((child?.getPivotY() ?? Number.NaN) - pivotY) <= epsilon,
			`${id} pivotY`,
		);
		t.true(child?.getPivotAsAnchor() ?? false, `${id} anchor`);
	}
}

test('text, loader, list, and tree pivot/anchor survive XML and binary round-trips', async (t) => {
	const source = await createSourceProject();
	const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pivot-out-'));
	const outputProjectPath = path.join(outputDirectory, 'Pivot.fairy');
	const binaryPath = path.join(outputDirectory, 'Pivot.bytes');
	const io = new NodeIO();

	try {
		const findings = inspectOpaqueProjectXml('component', COMPONENT_XML);
		t.false(
			findings.some((finding) =>
				finding.kind === 'attribute'
				&& (finding.name === 'pivot' || finding.name === 'anchor')
			),
			'pivot and anchor are modeled attributes for all covered display objects',
		);

		const doc = await io.readProject(source.projectPath);
		assertPivotState(t, doc);

		await io.writeProject(doc, outputProjectPath);
		const outputXml = await fs.readFile(
			path.join(outputDirectory, 'assets', 'Pivot', 'Main.xml'),
			'utf8',
		);
		for (const [id, [pivotX, pivotY]] of expected) {
			const tag = outputXml.match(new RegExp(`<(?:text|richtext|inputtext|loader|list)\\b[^>]*id="${id}"[^>]*>`))?.[0] ?? '';
			t.regex(tag, new RegExp(`pivot="${pivotX},${pivotY}"`), `${id} writes pivot`);
			t.regex(tag, /\banchor="true"/, `${id} writes anchor`);
		}
		assertPivotState(t, await io.readProject(outputProjectPath));

		await io.writeBinary(doc, binaryPath);
		assertPivotState(t, await io.readBinary(binaryPath), 0.000001);
	} finally {
		await fs.rm(source.directory, { recursive: true, force: true });
		await fs.rm(outputDirectory, { recursive: true, force: true });
	}
});
