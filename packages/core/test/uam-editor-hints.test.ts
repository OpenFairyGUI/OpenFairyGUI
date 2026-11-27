import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
	Document,
	liftDocumentToUamProject,
	materializeUamProject,
	normalizeUamProject,
	validateUamProject,
	type UamProject,
} from '../src/index.js';
import { NodeIO } from '../src/node.js';
import { type FileSystem, ProjectWriter } from '../src/project-io.js';
import { readProjectAsUam, writeProjectFromUam } from '../src/uam/index.js';

const PROJECT_XML = `<?xml version="1.0" encoding="utf-8"?>
<projectDescription id="editor-hints" type="Unity" version="3.0"/>
`;

const PACKAGE_XML = `<?xml version="1.0" encoding="utf-8"?>
<packageDescription id="pkghints">
  <resources>
    <component id="main1" name="Main.xml" path="/" exported="true"/>
    <component id="template1" name="Template.xml" path="/widgets/" exported="true"/>
    <movieclip id="mc1" name="Spinner.jta" path="/fx/" atlas="alone_mof" smoothing="false"/>
  </resources>
</packageDescription>
`;

// fileName="old/Template.xml" is stale on purpose: the editor keeps such hints after moves.
const MAIN_XML = `<?xml version="1.0" encoding="utf-8"?>
<component size="640,480">
  <controller name="c1" pages="0,A,1,B,2,C" selected="0"/>
  <displayList>
    <component id="stale1" name="stale" src="template1" fileName="old/Template.xml" xy="0,0"/>
    <component id="plain1" name="plain" src="template1" xy="0,50"/>
    <text id="color1" name="label" xy="0,100" size="100,20" text="A">
      <gearColor controller="c1" pages="1,2" values="#ff0000|-" default="#ffffff"/>
    </text>
    <text id="outline1" name="caption" xy="0,130" size="100,20" text="B">
      <gearColor controller="c1" pages="1" values="#ff0000,#00ff00" default="#ffffff,#000000"/>
    </text>
    <loader id="ani1" name="ani" xy="0,160" size="50,50">
      <gearAni controller="c1" pages="0,1,2" values="0,s|3,p,idle|1,p,,skin" default="0,p"/>
    </loader>
  </displayList>
</component>
`;

const TEMPLATE_XML = `<?xml version="1.0" encoding="utf-8"?>
<component size="100,40"/>
`;

async function createSourceProject(): Promise<{ directory: string; projectPath: string }> {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-editor-hints-'));
	const projectPath = path.join(directory, 'Hints.fairy');
	const packageDirectory = path.join(directory, 'assets', 'Hints');
	await fs.mkdir(path.join(packageDirectory, 'widgets'), { recursive: true });
	await fs.mkdir(path.join(packageDirectory, 'fx'), { recursive: true });
	await fs.writeFile(projectPath, PROJECT_XML, 'utf8');
	await fs.writeFile(path.join(packageDirectory, 'package.xml'), PACKAGE_XML, 'utf8');
	await fs.writeFile(path.join(packageDirectory, 'Main.xml'), MAIN_XML, 'utf8');
	await fs.writeFile(path.join(packageDirectory, 'widgets', 'Template.xml'), TEMPLATE_XML, 'utf8');
	return { directory, projectPath };
}

function mainDisplayList(project: UamProject) {
	const resource = project.packages[0]?.resources.find((candidate) => candidate.id === 'main1');
	if (resource?.kind !== 'component') throw new Error('Missing Main component fixture.');
	return resource.component.displayList;
}

async function captureProjectXml(document: Document): Promise<Map<string, string>> {
	const files = new Map<string, string>();
	const normalize = (filePath: string) => filePath.replace(/\\/g, '/').replace(/\/+/g, '/');
	const fileSystem: FileSystem = {
		async readFile(filePath) {
			return files.get(normalize(filePath)) ?? '';
		},
		async readFileRaw() {
			return new Uint8Array();
		},
		async writeFile(filePath, content) {
			files.set(normalize(filePath), content);
		},
		async writeFileRaw() {},
		async mkdir() {},
		async readdir() {
			return [];
		},
		async exists(filePath) {
			return files.has(normalize(filePath));
		},
		join: (...paths) => normalize(paths.filter(Boolean).join('/')),
		dirname: (filePath) => normalize(filePath).replace(/\/[^/]*$/, ''),
	};
	await new ProjectWriter(fileSystem).write(document, 'Project.fairy');
	return files;
}

test('UAM preserves component file hints, movieclip atlas mode, and compact color/animation gear values', async (t) => {
	const source = await createSourceProject();
	try {
		const io = new NodeIO();
		const lifted = await readProjectAsUam(io, source.projectPath);
		const nodes = mainDisplayList(lifted);
		const stale = nodes.find((node) => node.id === 'stale1');
		const plain = nodes.find((node) => node.id === 'plain1');
		if (stale?.kind !== 'component' || plain?.kind !== 'component') throw new Error('Missing component instances.');
		t.is(stale.fileName, 'old/Template.xml');
		t.false('fileName' in plain);
		const movieClip = lifted.packages[0]?.resources.find((resource) => resource.id === 'mc1');
		t.is(movieClip?.kind, 'movieClip');
		if (movieClip?.kind === 'movieClip') {
			t.is(movieClip.movieClip.textureSetMode, 'alone_mof');
		}
		const color = nodes.find((node) => node.id === 'color1')?.gears?.find((gear) => gear.kind === 'color');
		t.deepEqual(color && 'defaultValue' in color ? color.defaultValue : undefined, {
			color: '#ffffff',
			outlineColor: null,
		});
		const animation = nodes.find((node) => node.id === 'ani1')?.gears?.find((gear) => gear.kind === 'animation');
		t.deepEqual(animation && 'states' in animation ? animation.states.map((state) => state.value) : undefined, [
			{ frame: 0, playing: false, animationName: '', skinName: '' },
			{ frame: 3, playing: true, animationName: 'idle', skinName: '' },
			{ frame: 1, playing: true, animationName: '', skinName: 'skin' },
		]);

		const outputPath = path.join(source.directory, 'output', 'Hints.fairy');
		await fs.mkdir(path.dirname(outputPath), { recursive: true });
		await writeProjectFromUam(io, lifted, outputPath);
		const outputXml = await fs.readFile(
			path.join(source.directory, 'output', 'assets', 'Hints', 'Main.xml'),
			'utf8',
		);
		const outputPackageXml = await fs.readFile(
			path.join(source.directory, 'output', 'assets', 'Hints', 'package.xml'),
			'utf8',
		);
		t.true(outputXml.includes('src="template1" fileName="old/Template.xml"'));
		t.regex(outputXml, /<component id="plain1" name="plain" src="template1" xy="0,50"\/>/);
		t.true(outputXml.includes('values="#ff0000|-" default="#ffffff"'));
		t.true(outputXml.includes('values="#ff0000,#00ff00"'));
		t.true(outputXml.includes('values="0,s|3,p,idle|1,p,,skin" default="0,p"'));
		t.regex(outputPackageXml, /<movieclip[^>]*id="mc1"[^>]*atlas="alone_mof"[^>]*smoothing="false"/);
		t.deepEqual(mainDisplayList(await readProjectAsUam(io, outputPath)), nodes);

		const malformed = structuredClone(lifted);
		const malformedStale = mainDisplayList(malformed).find((node) => node.id === 'stale1');
		if (malformedStale?.kind !== 'component') throw new Error('Missing malformed fixture instance.');
		(malformedStale as { fileName?: unknown }).fileName = 42;
		t.true(validateUamProject(malformed).some((issue) => issue.path.endsWith('.fileName')));

		const malformedMovieClip = structuredClone(lifted);
		const badMc = malformedMovieClip.packages[0]?.resources.find((resource) => resource.id === 'mc1');
		if (badMc?.kind !== 'movieClip') throw new Error('Missing movieclip fixture.');
		(badMc.movieClip as { textureSetMode?: unknown }).textureSetMode = 123;
		t.true(validateUamProject(malformedMovieClip).some((issue) => issue.path.endsWith('.movieClip')));
	} finally {
		await fs.rm(source.directory, { recursive: true, force: true });
	}
});

test('UAM preserves fileName hints on component-derived control display nodes', async (t) => {
	const doc = new Document();
	doc.getRoot()
		.setProjectId('derived-hints')
		.setProjectType(0)
		.setVersion('3.0')
		.setSettings({ publish: {}, common: {}, adaptation: {} });
	const pkg = doc.createPackage('Main').setId('pkg001');
	pkg.addResource(doc.createComponent('Sub').setId('sub1').setPath('/widgets/').setSize(60, 24));
	const host = doc.createComponent('Host').setId('host1').setPath('/').setSize(200, 200);
	const controls = [
		doc.createGButton('btn').setId('n0').setSrc('sub1').setFileName('widgets/Sub.xml'),
		doc.createGLabel('lbl').setId('n1').setSrc('sub1').setFileName('widgets/Sub.xml'),
		doc.createGComboBox('cb').setId('n2').setSrc('sub1').setFileName('widgets/Sub.xml'),
		doc.createGProgressBar('pb').setId('n3').setSrc('sub1').setFileName('widgets/Sub.xml'),
		doc.createGSlider('sld').setId('n4').setSrc('sub1').setFileName('widgets/Sub.xml'),
		doc.createGScrollBar('sb').setId('n5').setSrc('sub1').setFileName('widgets/Sub.xml'),
	];
	for (const control of controls) host.addChild(control);
	pkg.addResource(host);

	const lifted = normalizeUamProject(liftDocumentToUamProject(doc));
	t.deepEqual(validateUamProject(lifted), []);
	const hostResource = lifted.packages[0]!.resources.find((resource) => resource.id === 'host1');
	if (hostResource?.kind !== 'component') return t.fail('expected host component');
	for (const node of hostResource.component.displayList) {
		t.true('fileName' in node && node.fileName === 'widgets/Sub.xml');
	}

	const before = await captureProjectXml(doc);
	const after = await captureProjectXml(materializeUamProject(lifted));
	t.deepEqual(after, before);

	const malformed = structuredClone(lifted);
	const malformedHost = malformed.packages[0]!.resources.find((resource) => resource.id === 'host1');
	if (malformedHost?.kind !== 'component') return t.fail('expected malformed host component');
	(malformedHost.component.displayList[0] as { fileName?: unknown }).fileName = 99;
	t.true(validateUamProject(malformed).some((issue) => issue.path.endsWith('.fileName')));
});
