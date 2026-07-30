import test from 'ava';
import { Document } from '@openfairygui/core';
import { collectPackageResourceReferences } from '../src/publish/resource-references.js';

test('resource reference scanner separates local resources from external packages', (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('Main');
	pkg.setId('main0001');

	const component = doc.createComponent('Entry');
	component.setId('entry001');

	const label = doc.createGTextField('label');
	label
		.setId('label001')
		.setFont('ui://main0001font0001')
		.setText('[img]ui://shared01/image001[/img] ui://main0001/textIcon');
	component.addChild(label);

	const loader = doc.createGLoader('loader');
	loader.setId('loader01').setUrl('ui://main0001/loaderImage');
	component.addChild(loader);

	const shared = doc.createGComponent('shared');
	shared.setId('shared01').setSrc('panel001').setPackageId('shared01');
	component.addChild(shared);

	pkg.addResource(component);

	const references = collectPackageResourceReferences(pkg);
	t.deepEqual([...references.localResourceIds].sort(), ['font0001', 'loaderImage', 'panel001', 'textIcon']);
	t.deepEqual([...references.packageIds], ['shared01']);
});
