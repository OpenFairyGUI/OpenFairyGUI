import test from 'ava';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { Document, GearType } from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';
import { getFixturePath } from '@openfairygui/test-utils';
import sharpImplementation from 'sharp';
import { publish, type AtlasRasterBackend } from '../src/index.js';

const sharp = sharpImplementation as typeof sharpImplementation & AtlasRasterBackend;

function createFs() {
	return {
		async readFileRaw(filePath: string): Promise<Uint8Array> {
			const data = await fs.readFile(filePath);
			return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
		},
		async writeFileRaw(filePath: string, data: Uint8Array): Promise<void> {
			await fs.mkdir(path.dirname(filePath), { recursive: true });
			await fs.writeFile(filePath, data);
		},
		async mkdir(dirPath: string): Promise<void> {
			await fs.mkdir(dirPath, { recursive: true });
		},
		join(...paths: string[]): string {
			return path.join(...paths);
		},
	};
}

function readUtfString(bytes: Uint8Array, state: { pos: number }): string {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const len = view.getUint16(state.pos, false);
	state.pos += 2;
	const value = Buffer.from(bytes.subarray(state.pos, state.pos + len)).toString('utf8');
	state.pos += len;
	return value;
}

function readStringRef(dataView: DataView, strings: string[], pos: number): { value: string | null; nextPos: number } {
	const index = dataView.getUint16(pos, false);
	if (index === 65534) return { value: null, nextPos: pos + 2 };
	if (index === 65533) return { value: '', nextPos: pos + 2 };
	return { value: strings[index] ?? null, nextPos: pos + 2 };
}

function parseDependencies(bytes: Uint8Array): Array<{ id: string | null; name: string | null }> {
	const state = { pos: 0 };
	state.pos += 4;
	state.pos += 4;
	state.pos += 1;
	readUtfString(bytes, state);
	readUtfString(bytes, state);
	state.pos += 20;

	const data = bytes.subarray(state.pos);
	const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const offsets = [];
	let pos = 2;
	for (let i = 0; i < 6; i += 1) {
		offsets.push(dataView.getInt32(pos, false));
		pos += 4;
	}

	const stringTableOffset = offsets[4];
	const stringCount = dataView.getInt32(stringTableOffset, false);
	let stringPos = stringTableOffset + 4;
	const strings: string[] = [];
	for (let i = 0; i < stringCount; i += 1) {
		const len = dataView.getUint16(stringPos, false);
		stringPos += 2;
		strings.push(Buffer.from(data.subarray(stringPos, stringPos + len)).toString('utf8'));
		stringPos += len;
	}

	pos = offsets[0];
	const dependencyCount = dataView.getInt16(pos, false);
	pos += 2;
	const dependencies = [];
	for (let i = 0; i < dependencyCount; i += 1) {
		const idRef = readStringRef(dataView, strings, pos);
		pos = idRef.nextPos;
		const nameRef = readStringRef(dataView, strings, pos);
		pos = nameRef.nextPos;
		dependencies.push({ id: idRef.value, name: nameRef.value });
	}
	return dependencies;
}

function parseItemIds(bytes: Uint8Array): string[] {
	const state = { pos: 0 };
	state.pos += 4;
	state.pos += 4;
	state.pos += 1;
	readUtfString(bytes, state);
	readUtfString(bytes, state);
	state.pos += 20;

	const data = bytes.subarray(state.pos);
	const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const offsets = [];
	let pos = 2;
	for (let i = 0; i < 6; i += 1) {
		offsets.push(dataView.getInt32(pos, false));
		pos += 4;
	}

	const stringTableOffset = offsets[4];
	const stringCount = dataView.getInt32(stringTableOffset, false);
	let stringPos = stringTableOffset + 4;
	const strings: string[] = [];
	for (let i = 0; i < stringCount; i += 1) {
		const len = dataView.getUint16(stringPos, false);
		stringPos += 2;
		strings.push(Buffer.from(data.subarray(stringPos, stringPos + len)).toString('utf8'));
		stringPos += len;
	}

	pos = offsets[1];
	const itemCount = dataView.getInt16(pos, false);
	pos += 2;
	const itemIds: string[] = [];
	for (let i = 0; i < itemCount; i += 1) {
		const nextOffset = dataView.getInt32(pos, false);
		pos += 4;
		const nextPos = nextOffset + pos;
		pos += 1;
		const idRef = readStringRef(dataView, strings, pos);
		pos = nextPos;
		if (idRef.value) itemIds.push(idRef.value);
	}
	return itemIds;
}

test('publish: nullable and pipe Text/Icon states retain dependencies and icon atlas resources', async (t) => {
	const doc = new Document();
	const main = doc.createPackage('Main').setId('main0001');
	const common = doc.createPackage('Common').setId('common01');
	common.addResource(doc.createImageResource('remote.png').setId('remote').setWidth(8).setHeight(8).setExported(true));
	for (const id of ['used', 'fallback', 'unused']) main.addResource(doc.createImageResource(`${id}.png`).setId(id).setPath('/').setWidth(8).setHeight(8));
	const component = doc.createComponent('Host').setId('host').setSize(100, 100).setExported(true);
	main.addResource(component);
	const controller = doc.createController('state');
	for (const id of ['0', '1', '2', '3', '4']) controller.addPage(doc.createControllerPage(id).setId(id));
	component.addController(controller);
	const textValues = { '0': null, '1': '', '2': '-', '3': 'A|<img src="ui://common01remote">' };
	const iconValues = { '0': null, '1': '', '2': '-', '3': 'ui://main0001used', '4': 'A|B' };
	const text = doc.createGTextField('text').setId('text');
	text.addGear(doc.createGear().setGearType(GearType.Text).setController(controller).setPages('0,1,2,3,4').setPageValues(textValues).setDefaultValue(''));
	component.addChild(text);
	const icon = doc.createGLoader('icon').setId('icon');
	icon.addGear(doc.createGear().setGearType(GearType.Icon).setController(controller).setPages('0,1,2,3,4').setPageValues(iconValues).setDefaultValue('ui://main0001fallback'));
	component.addChild(icon);
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-publish-text-gears-'));
	t.teardown(() => fs.rm(tmpDir, { recursive: true, force: true }));
	const basePath = path.join(tmpDir, 'assets');
	await fs.mkdir(path.join(basePath, 'Main'), { recursive: true });
	const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#ff0000' } }).png().toBuffer();
	for (const id of ['used', 'fallback']) await fs.writeFile(path.join(basePath, 'Main', `${id}.png`), png);
	await doc.transform(publish({ output: tmpDir, packages: ['Main'], basePath, fileExtension: 'fui', compressed: false, encoder: sharp, fs: createFs(), codeGeneration: false }));
	const binaryPath = path.join(tmpDir, 'Main.fui');
	const bytes = await fs.readFile(binaryPath);
	t.deepEqual(parseDependencies(bytes), [{ id: 'common01', name: 'Common' }]);
	const resourceIds = parseItemIds(bytes);
	t.true(resourceIds.includes('used'));
	t.true(resourceIds.includes('fallback'));
	t.false(resourceIds.includes('unused'));
	t.deepEqual(main.listAtlases().flatMap((atlas) => atlas.listSprites().map((sprite) => sprite.getItemId())).sort(), ['fallback', 'used']);
	const decoded = (await new NodeIO().readBinary(binaryPath)).getRoot().getPackage('Main')!.getComponent('Host')!;
	t.deepEqual(decoded.listChildren()[0]!.listGears()[0]!.getPageValues(), { '1': '', '2': '-', '3': textValues['3'] });
	t.deepEqual(decoded.listChildren()[1]!.listGears()[0]!.getPageValues(), { '1': '', '2': '-', '3': iconValues['3'], '4': 'A|B' });
});

test('publish: dependency block includes cross-package component instance refs', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('proj-deps').setProjectType(3).setVersion('3.0');

	const commonPkg = doc.createPackage('Common');
	commonPkg.setId('common01');
	const commonRes = doc.createComponent('SharedButton');
	commonRes.setId('shared01').setPath('/components/');
	commonPkg.addResource(commonRes);

	const mainPkg = doc.createPackage('Main');
	mainPkg.setId('main0001');
	mainPkg.setPublishName('Main');

	const mainRes = doc.createComponent('Entry');
	mainRes.setId('entry001').setExported(true).setPath('/pages/');
	const child = doc.createGComponent('shared');
	child.setId('child001');
	child.setSrc('shared01');
	child.setPackageId('common01');
	mainRes.addChild(child);
	mainPkg.addResource(mainRes);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-deps-'));

	try {
		await doc.transform(publish({
			output: tmpDir,
			packages: ['Main'],
			fs: createFs(),
		}));

		const bytes = await fs.readFile(path.join(tmpDir, 'Main.bin'));
		const dependencies = parseDependencies(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
		t.deepEqual(
			dependencies,
			[{ id: 'common01', name: 'Common' }],
			'published binary keeps external package dependency from component pkg refs',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: component instance button sound refs keep local sound items', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('proj-button-sound').setProjectType(3).setVersion('3.0');

	const pkg = doc.createPackage('Main');
	pkg.setId('main0001');
	pkg.setPublishName('Main');

	const sound = doc.createSoundResource('tap.wav');
	sound.setId('snd001').setPath('/audio/').setFile('tap.wav');
	pkg.addResource(sound);

	const listItem = doc.createComponent('ListItem');
	listItem.setId('cmp001').setPath('/components/');
	pkg.addResource(listItem);

	const mainRes = doc.createComponent('Entry');
	mainRes.setId('entry002').setExported(true).setPath('/pages/');
	const child = doc.createGComponent('button');
	child.setId('child002');
	child.setSrc('cmp001');
	child.setInstanceExtType('Button');
	child.setInstanceTitle('Play');
	child.setInstanceSound('ui://main0001snd001');
	mainRes.addChild(child);
	pkg.addResource(mainRes);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-button-sound-'));

	try {
		const basePath = path.join(tmpDir, 'assets');
		const sourceSound = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
		const sourceSoundPath = path.join(basePath, 'Main', 'audio', 'tap.wav');
		await fs.mkdir(path.dirname(sourceSoundPath), { recursive: true });
		await fs.writeFile(sourceSoundPath, sourceSound);

		await doc.transform(publish({
			output: tmpDir,
			packages: ['Main'],
			basePath,
			fs: createFs(),
		}));

		const bytes = await fs.readFile(path.join(tmpDir, 'Main.bin'));
		const items = parseDependencies(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
		t.deepEqual(items, [], 'local sound reference does not create package dependency');
		t.true(parseItemIds(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)).includes('snd001'), 'published binary keeps referenced sound item');
		t.deepEqual([...await fs.readFile(path.join(tmpDir, 'Main_snd001.wav'))], [...sourceSound], 'published local sound is copied alongside the package binary');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: component instance button sound refs keep cross-package dependencies', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('proj-button-sound-dependency').setProjectType(3).setVersion('3.0');

	const audioPkg = doc.createPackage('Audio');
	audioPkg.setId('audio001');
	const sound = doc.createSoundResource('tap.wav');
	sound.setId('tap001').setPath('/audio/').setFile('tap.wav');
	audioPkg.addResource(sound);

	const mainPkg = doc.createPackage('Main');
	mainPkg.setId('main0001');
	mainPkg.setPublishName('Main');

	const buttonDefinition = doc.createComponent('ButtonDefinition');
	buttonDefinition.setId('cmp001').setPath('/components/');
	mainPkg.addResource(buttonDefinition);

	const mainRes = doc.createComponent('Entry');
	mainRes.setId('entry003').setExported(true).setPath('/pages/');
	const child = doc.createGComponent('button');
	child.setId('child003');
	child.setSrc('cmp001');
	child.setInstanceExtType('Button');
	child.setInstanceSound('ui://audio001tap001');
	mainRes.addChild(child);
	mainPkg.addResource(mainRes);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-button-sound-dependency-'));

	try {
		await doc.transform(publish({
			output: tmpDir,
			packages: ['Main'],
			fs: createFs(),
		}));

		const bytes = await fs.readFile(path.join(tmpDir, 'Main.bin'));
		t.deepEqual(
			parseDependencies(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)),
			[{ id: 'audio001', name: 'Audio' }],
			'instance sound UI URL creates the referenced package dependency',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: stage sounds keep local resources and cross-package dependencies', async (t) => {
	const sourceSound = await fs.readFile(getFixturePath('FairyGUI-unity', 'UIProject', 'assets', 'Basics', 'sound', 'click.wav'));
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-stage-sounds-'));
	try {
		for (const setter of ['setAddedToStageSound', 'setRemovedFromStageSound'] as const) {
			const doc = new Document();
			const main = doc.createPackage('Main').setId('main0001');
			const audio = doc.createPackage('Audio').setId('audio001');
			main.addResource(doc.createSoundResource('local').setId('local').setPath('/').setFile('click.wav'));
			main.addResource(doc.createSoundResource('unused').setId('unused').setPath('/').setFile('unused.wav'));
			audio.addResource(doc.createSoundResource('remote').setId('remote').setPath('/').setFile('click.wav').setExported(true));
			const localHost = doc.createComponent('LocalHost').setId('localHost').setExported(true);
			localHost[setter]('ui://main0001local');
			main.addResource(localHost);
			const remoteHost = doc.createComponent('RemoteHost').setId('remoteHost').setExported(true);
			remoteHost[setter]('ui://audio001remote');
			main.addResource(remoteHost);
			const output = path.join(tmpDir, setter);
			const basePath = path.join(output, 'assets');
			for (const name of ['Main', 'Audio']) {
				await fs.mkdir(path.join(basePath, name), { recursive: true });
				await fs.writeFile(path.join(basePath, name, 'click.wav'), sourceSound);
			}
			await doc.transform(publish({ output, basePath, fileExtension: 'fui', compressed: false, fs: createFs(), codeGeneration: false }));
			const mainBytes = await fs.readFile(path.join(output, 'Main.fui'));
			const audioBytes = await fs.readFile(path.join(output, 'Audio.fui'));
			t.deepEqual(parseDependencies(mainBytes), [{ id: 'audio001', name: 'Audio' }], setter);
			t.deepEqual(parseDependencies(audioBytes), [], 'audio package does not acquire a reverse dependency');
			t.deepEqual(parseItemIds(mainBytes).sort(), ['local', 'localHost', 'remoteHost'].sort(), setter);
			t.deepEqual(parseItemIds(audioBytes), ['remote'], setter);
			t.deepEqual(await fs.readFile(path.join(output, 'Main_local.wav')), sourceSound);
			t.deepEqual(await fs.readFile(path.join(output, 'Audio_remote.wav')), sourceSound);
		}
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: dependency block follows project package order instead of package id order', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('proj-deps-order').setProjectType(3).setVersion('3.0');

	const commercePkg = doc.createPackage('Commerce');
	commercePkg.setId('suospotn');
	const commerceRes = doc.createComponent('CommerceCard');
	commerceRes.setId('commerce01').setPath('/components/');
	commercePkg.addResource(commerceRes);

	const commonPkg = doc.createPackage('Common');
	commonPkg.setId('unttpy9g');
	const commonRes = doc.createComponent('CommonDialog');
	commonRes.setId('common01').setPath('/components/');
	commonPkg.addResource(commonRes);

	const sidePanelPkg = doc.createPackage('SidePanelTutorial');
	sidePanelPkg.setId('yy0eqg3d');
	const sidePanelRes = doc.createComponent('SidePanel');
	sidePanelRes.setId('side001').setPath('/components/');
	sidePanelPkg.addResource(sidePanelRes);

	const fontsPkg = doc.createPackage('fonts');
	fontsPkg.setId('i9k1a6m7');
	const fontRes = doc.createFontResource('BitmapFont');
	fontRes.setId('font001').setPath('/fonts/').setFileName('BitmapFont.fnt');
	fontsPkg.addResource(fontRes);

	const uiKitPkg = doc.createPackage('uikit');
	uiKitPkg.setId('zom0ouwz');
	const uiKitRes = doc.createComponent('PrimaryButton');
	uiKitRes.setId('uikit01').setPath('/components/');
	uiKitPkg.addResource(uiKitRes);

	const mainPkg = doc.createPackage('Main');
	mainPkg.setId('main0001');
	mainPkg.setPublishName('Main');

	const mainRes = doc.createComponent('Entry');
	mainRes.setId('entry003').setExported(true).setPath('/pages/');

		const title = doc.createGTextField('title');
	title.setId('text001');
	title.setFont('ui://i9k1a6m7font001');
	mainRes.addChild(title);

	const commerceChild = doc.createGComponent('commerce');
	commerceChild.setId('child003').setSrc('commerce01').setPackageId('suospotn');
	mainRes.addChild(commerceChild);

	const commonChild = doc.createGComponent('common');
	commonChild.setId('child004').setSrc('common01').setPackageId('unttpy9g');
	mainRes.addChild(commonChild);

	const sidePanelChild = doc.createGComponent('side-panel');
	sidePanelChild.setId('child005').setSrc('side001').setPackageId('yy0eqg3d');
	mainRes.addChild(sidePanelChild);

	const uiKitChild = doc.createGComponent('uikit');
	uiKitChild.setId('child006').setSrc('uikit01').setPackageId('zom0ouwz');
	mainRes.addChild(uiKitChild);

	mainPkg.addResource(mainRes);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-deps-order-'));

	try {
		await doc.transform(publish({
			output: tmpDir,
			packages: ['Main'],
			fs: createFs(),
		}));

		const bytes = await fs.readFile(path.join(tmpDir, 'Main.bin'));
		const dependencies = parseDependencies(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
		t.deepEqual(
			dependencies.map((entry) => entry.name),
			['Commerce', 'Common', 'SidePanelTutorial', 'fonts', 'uikit'],
			'dependencies keep root package order instead of sorting by package id',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});
