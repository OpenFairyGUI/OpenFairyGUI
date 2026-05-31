import test from 'ava';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { Document } from '@openfairygui/core';
import { publish } from '../src/index.js';

function createFs() {
	return {
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
		await doc.transform(publish({
			output: tmpDir,
			packages: ['Main'],
			fs: createFs(),
		}));

		const bytes = await fs.readFile(path.join(tmpDir, 'Main.bin'));
		const items = parseDependencies(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
		t.deepEqual(items, [], 'local sound reference does not create package dependency');
		t.true(parseItemIds(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)).includes('snd001'), 'published binary keeps referenced sound item');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});
