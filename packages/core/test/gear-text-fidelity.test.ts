import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
	Document,
	GearType,
	applyUamTransaction,
	liftDocumentToUamProject,
	materializeUamProject,
	type UamProject,
} from '../src/index.js';
import { NodeIO } from '../src/node.js';
import { ProjectWriter } from '../src/io/project-writer.js';

const PAGE_VALUES = { '0': null, '1': '', '2': '-', '3': 'A|B' };

function createDocument(defaultValue: string | null, lastPageValue = 'A|B'): Document {
	const doc = new Document();
	doc.getRoot().setProjectId('gear-project').setProjectType(0).setVersion('3.0');
	const pkg = doc.createPackage('Gears').setId('gearpkg1');
	const component = doc.createComponent('Host').setId('host').setPath('/').setSize(100, 100);
	pkg.addResource(component);
	const controller = doc.createController('state');
	for (const pageId of Object.keys(PAGE_VALUES)) controller.addPage(doc.createControllerPage(pageId).setId(pageId));
	component.addController(controller);
	for (const kind of ['text', 'icon'] as const) {
		const child = kind === 'text' ? doc.createGTextField(kind) : doc.createGLoader(kind);
		child.setId(kind);
		child.addGear(doc.createGear()
			.setGearType(kind === 'text' ? GearType.Text : GearType.Icon)
			.setController(controller)
			.setPages(Object.keys(PAGE_VALUES).join(','))
			.setPageValues({ ...PAGE_VALUES, '3': lastPageValue })
			.setDefaultValue(defaultValue));
		component.addChild(child);
	}
	return doc;
}

function getUamComponent(project: UamProject) {
	const resource = project.packages[0]!.resources.find((item) => item.id === 'host');
	if (resource?.kind !== 'component') throw new Error('Expected component');
	return resource.component;
}

function getGears(doc: Document) {
	return doc.getRoot().getPackage('Gears')!.getComponent('Host')!.listChildren().map((child) => child.listGears()[0]!);
}

test('Text/Icon gears preserve null, empty, dash and pipe through transactions and binary republishing', async (t) => {
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-text-gears-'));
	t.teardown(() => fs.rm(tempDir, { recursive: true, force: true }));
	const io = new NodeIO();
	for (const defaultValue of [null, '', '-', 'A|B']) {
		const project = liftDocumentToUamProject(createDocument(defaultValue));
		const expected = getUamComponent(project).displayList.map((child) => child.gears[0]!);
		for (const gear of expected) {
			t.true(gear.kind === 'text' || gear.kind === 'icon');
			if (gear.kind !== 'text' && gear.kind !== 'icon') continue;
			t.deepEqual(gear.states, Object.entries(PAGE_VALUES).map(([pageId, value]) => ({
				pageId, value: value === null ? null : { [gear.kind]: value },
			})));
			t.deepEqual(gear.defaultValue, defaultValue === null ? null : { [gear.kind]: defaultValue });
		}
		const base = structuredClone(project);
		for (const child of getUamComponent(base).displayList) child.gears = [];
		const committed = applyUamTransaction(base, expected.map((gear) => ({
			kind: 'addGear',
			selector: { packageId: 'gearpkg1', componentResourceId: 'host', displayNodeId: gear.kind, kind: gear.kind, controllerName: 'state' },
			gear,
		})));
		t.deepEqual(getUamComponent(committed).displayList.map((child) => child.gears[0]), expected);
		let decoded = materializeUamProject(committed);
		for (let generation = 0; generation < 3; generation += 1) {
			for (const gear of getGears(decoded)) {
				t.deepEqual(gear.getPageValues(), generation === 0 ? PAGE_VALUES : { '1': '', '2': '-', '3': 'A|B' }, `states in generation ${generation}`);
				t.is(gear.getDefaultValue(), defaultValue, `default in generation ${generation}`);
				t.is(gear.getPageValue('0'), defaultValue, `null state uses default in generation ${generation}`);
			}
			if (generation === 2) break;
			const binaryPath = path.join(tempDir, `${generation}.fui`);
			await io.writeBinary(decoded, binaryPath);
			decoded = await io.readBinary(binaryPath);
		}
	}
});

test('binary Text/Icon null entries do not overwrite explicit states when gear pages are sparse or reordered', async (t) => {
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-text-gear-order-'));
	t.teardown(() => fs.rm(tempDir, { recursive: true, force: true }));
	const io = new NodeIO();
	for (const pages of ['1,0', '3,0', '1,3,0']) {
		const doc = createDocument('fallback');
		for (const gear of getGears(doc)) gear.setPages(pages).setPageValues({ '1': 'keep', '3': 'last', '0': null });
		const binaryPath = path.join(tempDir, 'ordered.fui');
		await io.writeBinary(doc, binaryPath);
		const decoded = await io.readBinary(binaryPath);
		for (const gear of getGears(decoded)) {
			t.deepEqual(gear.getPageValues(), Object.fromEntries(pages.split(',').filter((page) => page !== '0').map((page) => [page, page === '1' ? 'keep' : 'last'])));
			t.is(gear.getPageValue('0'), 'fallback');
		}
	}
});

test('project XML retains empty and dash Text/Icon states and pipe defaults, omitting null overrides', async (t) => {
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-text-gears-xml-'));
	t.teardown(() => fs.rm(tempDir, { recursive: true, force: true }));
	const io = new NodeIO();
	for (const defaultValue of [null, '', '-', 'A|B']) {
		const projectPath = path.join(tempDir, 'gears.fairy');
		await io.writeProject(createDocument(defaultValue, 'plain'), projectPath);
		const xml = await fs.readFile(path.join(tempDir, 'assets', 'Gears', 'Host.xml'), 'utf8');
		t.true(xml.includes('pages="1,2,3" values="|-|plain"'));
		for (const gear of getGears(await io.readProject(projectPath))) {
			t.deepEqual(gear.getPageValues(), { '1': '', '2': '-', '3': 'plain' });
			t.is(gear.getDefaultValue(), defaultValue);
			t.is(gear.getPageValue('0'), defaultValue);
		}
	}
});

test('project XML rejects pipe page values and duplicate gear types before any filesystem mutation', async (t) => {
	const mutations: string[] = [];
	const writer = new ProjectWriter({
		readFile: async () => '',
		readFileRaw: async () => new Uint8Array(),
		writeFile: async (file) => { mutations.push(file); },
		writeFileRaw: async (file) => { mutations.push(file); },
		mkdir: async (file) => { mutations.push(file); },
		unlink: async (file) => { mutations.push(file); },
		rmdir: async (file) => { mutations.push(file); },
		exists: async () => true,
		readdir: async () => [],
		join: path.join,
		dirname: path.dirname,
	});
	for (const kind of [GearType.Text, GearType.Icon]) {
		const doc = createDocument(null);
		for (const gear of getGears(doc)) if (gear.getGearType() !== kind) gear.setPageValue('3', 'plain');
		await t.throwsAsync(writer.write(doc, path.join(os.tmpdir(), 'gears.fairy')), { message: /Project XML cannot represent "\|"/ });
		t.deepEqual(mutations, []);
	}
	const duplicate = createDocument(null, 'plain');
	const component = duplicate.getRoot().getPackage('Gears')!.getComponent('Host')!;
	component.listChildren()[0]!.addGear(duplicate.createGear().setGearType(GearType.Text).setController(component.listControllers()[0]!));
	await t.throwsAsync(writer.write(duplicate, path.join(os.tmpdir(), 'gears.fairy')), { message: /duplicate gearText/ });
	t.deepEqual(mutations, []);
});
