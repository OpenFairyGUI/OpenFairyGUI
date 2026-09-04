import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Document, liftDocumentToUamProject, writeProjectFromUam } from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';

// Only creates a new directory; it never overwrites a user's existing project.
export async function createDemoProject(parent = tmpdir()) {
	const directory = await mkdtemp(path.join(parent, 'ofgui-example-'));
	const document = new Document();
	document.getRoot().setProjectId('consumer-example').setProjectType(0).setVersion('3.0')
		.setSettings({ publish: {}, common: {}, adaptation: {} });
	const pkg = document.createPackage('Main').setId('pkgdemo1');
	const component = document.createComponent('MainView').setId('cmpdemo1').setPath('/').setExported(true).setSize(320, 180);
	component.addChild(document.createGTextField('title').setId('title').setText('Hello OpenFairyGUI').setXY(16, 18).setSize(240, 32));
	pkg.addResource(component);
	const projectPath = path.join(directory, 'Example.fairy');
	await writeProjectFromUam(new NodeIO(), liftDocumentToUamProject(document), projectPath);
	return projectPath;
}
