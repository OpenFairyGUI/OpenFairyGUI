import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Document } from '../src/index.js';
import { NodeIO } from '../src/node.js';

const PROJECT_XML = `<?xml version="1.0" encoding="utf-8"?>
<projectDescription id="list-count-project" type="Unity" version="3.0"/>
`;

const PACKAGE_XML = `<?xml version="1.0" encoding="utf-8"?>
<packageDescription id="pkglist1">
  <resources>
    <component id="main1" name="Main.xml" path="/" exported="true"/>
  </resources>
</packageDescription>
`;

const COMPONENT_XML = `<?xml version="1.0" encoding="utf-8"?>
<component size="640,480">
  <displayList>
    <list id="flow-hz" layout="flow_hz" lineItemCount="4"/>
    <list id="flow-vt" layout="flow_vt" lineItemCount="5"/>
    <list id="pagination" layout="pagination" lineItemCount="3" lineItemCount2="2"/>
  </displayList>
</component>
`;

async function createSourceProject(): Promise<{
	directory: string;
	projectPath: string;
}> {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-list-count-'));
	const projectPath = path.join(directory, 'ListCount.fairy');
	const packageDirectory = path.join(directory, 'assets', 'Lists');
	await fs.mkdir(packageDirectory, { recursive: true });
	await fs.writeFile(projectPath, PROJECT_XML, 'utf8');
	await fs.writeFile(path.join(packageDirectory, 'package.xml'), PACKAGE_XML, 'utf8');
	await fs.writeFile(path.join(packageDirectory, 'Main.xml'), COMPONENT_XML, 'utf8');
	return { directory, projectPath };
}

test('reader: canonical list item counts follow the active layout axes', async (t) => {
	const source = await createSourceProject();
	try {
		const doc = await new NodeIO().readProject(source.projectPath);
		const component = doc.getRoot().getPackage('Lists')?.getComponent('Main');
		t.truthy(component);
		const byId = new Map(
			component!.listChildren().map((child) => [child.getId(), child as any]),
		);

		t.is(byId.get('flow-hz')?.getLineCount?.(), 0);
		t.is(byId.get('flow-hz')?.getColumnCount?.(), 4);
		t.is(byId.get('flow-vt')?.getLineCount?.(), 5);
		t.is(byId.get('flow-vt')?.getColumnCount?.(), 0);
		t.is(byId.get('pagination')?.getLineCount?.(), 2);
		t.is(byId.get('pagination')?.getColumnCount?.(), 3);
	} finally {
		await fs.rm(source.directory, { recursive: true, force: true });
	}
});

test('writer: canonical list item counts only serialize layout-relevant axes', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('list-writer').setProjectType(0).setVersion('3.0');
	const pkg = doc.createPackage('Lists');
	pkg.setId('pkglist1');
	const component = doc.createComponent('Main');
	component.setId('main1').setPath('/').setSize(640, 480);

	const flowHorizontal = doc.createGList('flow-horizontal');
	flowHorizontal
		.setId('flow-hz')
		.setLayout(2)
		.setLineCount(7)
		.setColumnCount(4);
	const flowVertical = doc.createGList('flow-vertical');
	flowVertical
		.setId('flow-vt')
		.setLayout(3)
		.setLineCount(5)
		.setColumnCount(8);
	const pagination = doc.createGList('pagination');
	pagination
		.setId('pagination')
		.setLayout(4)
		.setLineCount(2)
		.setColumnCount(3);
	const singleRow = doc.createGList('single-row');
	singleRow
		.setId('single-row')
		.setLayout(1)
		.setLineCount(10)
		.setColumnCount(11);

	component.addChild(flowHorizontal);
	component.addChild(flowVertical);
	component.addChild(pagination);
	component.addChild(singleRow);
	pkg.addResource(component);

	const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-list-count-out-'));
	const outputProjectPath = path.join(outputDirectory, 'ListCount.fairy');
	try {
		await new NodeIO().writeProject(doc, outputProjectPath);
		const xml = await fs.readFile(
			path.join(outputDirectory, 'assets', 'Lists', 'Main.xml'),
			'utf8',
		);
		const tag = (id: string): string =>
			xml.match(new RegExp(`<list\\b[^>]*id="${id}"[^>]*>`))?.[0] ?? '';

		t.regex(tag('flow-hz'), /lineItemCount="4"/);
		t.notRegex(tag('flow-hz'), /lineItemCount2=/);
		t.regex(tag('flow-vt'), /lineItemCount="5"/);
		t.notRegex(tag('flow-vt'), /lineItemCount2=/);
		t.regex(tag('pagination'), /lineItemCount="3"/);
		t.regex(tag('pagination'), /lineItemCount2="2"/);
		t.notRegex(tag('single-row'), /lineItemCount/);
		t.notRegex(xml, /\blineCount=/);
		t.notRegex(xml, /\bcolumnCount=/);

		const roundTripped = await new NodeIO().readProject(outputProjectPath);
		const roundTripComponent = roundTripped
			.getRoot()
			.getPackage('Lists')
			?.getComponent('Main');
		const byId = new Map(
			roundTripComponent!.listChildren().map((child) => [child.getId(), child as any]),
		);
		t.is(byId.get('flow-hz')?.getColumnCount?.(), 4);
		t.is(byId.get('flow-vt')?.getLineCount?.(), 5);
		t.is(byId.get('pagination')?.getLineCount?.(), 2);
		t.is(byId.get('pagination')?.getColumnCount?.(), 3);
	} finally {
		await fs.rm(outputDirectory, { recursive: true, force: true });
	}
});
