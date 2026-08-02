import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateUamProject, type UamProject } from '../src/index.js';
import { NodeIO } from '../src/node.js';
import { readProjectAsUam, writeProjectFromUam } from '../src/uam/index.js';

const PROJECT_XML = `<?xml version="1.0" encoding="utf-8"?>
<projectDescription id="property-overrides" type="Unity" version="3.0"/>
`;

const PACKAGE_XML = `<?xml version="1.0" encoding="utf-8"?>
<packageDescription id="pkgoverrides">
  <resources>
    <component id="main1" name="Main.xml" path="/" exported="true"/>
    <component id="template1" name="Template.xml" path="/" exported="true"/>
  </resources>
</packageDescription>
`;

const COMPONENT_XML = `<?xml version="1.0" encoding="utf-8"?>
<component size="640,480" extention="ComboBox">
  <displayList>
    <list id="list1" autoClearItems="true">
      <item title="First">
        <property target="title" propertyId="0" value="First override"/>
        <property target="icon" propertyId="1" value="ui://pkgoverridestemplate1"/>
      </item>
    </list>
    <component id="instance1" src="template1">
      <property target="title" propertyId="0" value="Instance override"/>
      <property target="icon" propertyId="1" value="ui://pkgoverridestemplate1"/>
      <ComboBox autoClearItems="true"/>
    </component>
  </displayList>
  <ComboBox autoClearItems="true"/>
</component>
`;

const TEMPLATE_XML = `<?xml version="1.0" encoding="utf-8"?>
<component size="100,40"/>
`;

async function createSourceProject(): Promise<{ directory: string; projectPath: string }> {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-property-overrides-'));
	const projectPath = path.join(directory, 'Overrides.fairy');
	const packageDirectory = path.join(directory, 'assets', 'Overrides');
	await fs.mkdir(packageDirectory, { recursive: true });
	await fs.writeFile(projectPath, PROJECT_XML, 'utf8');
	await fs.writeFile(path.join(packageDirectory, 'package.xml'), PACKAGE_XML, 'utf8');
	await fs.writeFile(path.join(packageDirectory, 'Main.xml'), COMPONENT_XML, 'utf8');
	await fs.writeFile(path.join(packageDirectory, 'Template.xml'), TEMPLATE_XML, 'utf8');
	return { directory, projectPath };
}

function fidelitySnapshot(project: UamProject) {
	const resource = project.packages[0]?.resources.find((candidate) => candidate.id === 'main1');
	if (resource?.kind !== 'component') throw new Error('Missing Main component fixture.');
	const list = resource.component.displayList.find((node) => node.id === 'list1');
	const instance = resource.component.displayList.find((node) => node.id === 'instance1');
	if (list?.kind !== 'list' || instance?.kind !== 'component') throw new Error('Missing override fixture nodes.');
	return {
		componentAutoClearItems: resource.component.properties.autoClearItems,
		listAutoClearItems: list.autoClearItems,
		listItemOverrides: list.listItems[0]?.propertyOverrides,
		instanceOverrides: instance.propertyOverrides,
		instanceAutoClearItems: instance.instanceProperties?.extensionType === 'ComboBox'
			? instance.instanceProperties.autoClearItems
			: false,
	};
}

test('project UAM round-trip preserves ordered property overrides and autoClearItems', async (t) => {
	const source = await createSourceProject();
	try {
		const io = new NodeIO();
		const lifted = await readProjectAsUam(io, source.projectPath);
		const expected = fidelitySnapshot(lifted);
		t.deepEqual(expected, {
			componentAutoClearItems: true,
			listAutoClearItems: true,
			listItemOverrides: [
				{ target: 'title', propertyId: 0, value: 'First override' },
				{ target: 'icon', propertyId: 1, value: 'ui://pkgoverridestemplate1' },
			],
			instanceOverrides: [
				{ target: 'title', propertyId: 0, value: 'Instance override' },
				{ target: 'icon', propertyId: 1, value: 'ui://pkgoverridestemplate1' },
			],
			instanceAutoClearItems: true,
		});

		const outputPath = path.join(source.directory, 'output', 'Overrides.fairy');
		await fs.mkdir(path.dirname(outputPath), { recursive: true });
		await writeProjectFromUam(io, lifted, outputPath);
		const reloaded = await readProjectAsUam(io, outputPath);
		t.deepEqual(fidelitySnapshot(reloaded), expected);

		const outputXml = await fs.readFile(
			path.join(source.directory, 'output', 'assets', 'Overrides', 'Main.xml'),
			'utf8',
		);
		const titleIndex = outputXml.indexOf('target="title"');
		const iconIndex = outputXml.indexOf('target="icon"');
		t.true(titleIndex >= 0 && iconIndex > titleIndex);

		const malformed = structuredClone(lifted);
		const malformedResource = malformed.packages[0]?.resources.find((candidate) => candidate.id === 'main1');
		if (malformedResource?.kind !== 'component') throw new Error('Missing malformed fixture component.');
		const malformedInstance = malformedResource.component.displayList.find((node) => node.id === 'instance1');
		if (malformedInstance?.kind !== 'component') throw new Error('Missing malformed fixture instance.');
		malformedInstance.propertyOverrides![0]!.propertyId = -1;
		t.true(validateUamProject(malformed).some((issue) => issue.path.endsWith('.propertyOverrides')));
	} finally {
		await fs.rm(source.directory, { recursive: true, force: true });
	}
});
