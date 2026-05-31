import test from 'ava';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { Document } from '@openfairygui/core';
import sharp from 'sharp';
import { publish } from '../src/index.js';

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

function parsePackageBinary(bytes: Uint8Array): Array<{ id: string | null; file: string | null }> {
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
	const items: Array<{ id: string | null; file: string | null }> = [];
	for (let i = 0; i < itemCount; i += 1) {
		const nextOffset = dataView.getInt32(pos, false);
		pos += 4;
		const nextPos = nextOffset + pos;
		const type = dataView.getUint8(pos++);
		const idRef = readStringRef(dataView, strings, pos);
		pos = idRef.nextPos;
		pos = readStringRef(dataView, strings, pos).nextPos;
		pos = readStringRef(dataView, strings, pos).nextPos;
		const fileRef = readStringRef(dataView, strings, pos);
		pos = fileRef.nextPos;
		pos += 1;
		pos += 4;
		pos += 4;
		const ext = type === 3 ? dataView.getUint8(pos) : null;

		switch (type) {
			case 0: {
				const scaleOption = dataView.getUint8(pos);
				pos += 1;
				if (scaleOption === 1) pos += 20;
				pos += 1;
				break;
			}
			case 1: {
				pos += 1;
				const rawLen = dataView.getInt32(pos, false);
				pos += 4 + rawLen;
				break;
			}
			case 3: {
				pos += 1;
				const rawLen = dataView.getInt32(pos, false);
				pos += 4 + rawLen;
				break;
			}
			case 5: {
				const rawLen = dataView.getInt32(pos, false);
				pos += 4 + rawLen;
				break;
			}
			case 8:
			case 9:
				pos += 8;
				break;
			default:
				if (type === 3 && ext === null) break;
				break;
		}

		pos = readStringRef(dataView, strings, pos).nextPos;
		const itemBranchCount = dataView.getUint8(pos++);
		for (let branchIndex = 0; branchIndex < itemBranchCount; branchIndex += 1) {
			pos = readStringRef(dataView, strings, pos).nextPos;
		}
		const highResCount = dataView.getUint8(pos++);
		for (let highResIndex = 0; highResIndex < highResCount; highResIndex += 1) {
			pos = readStringRef(dataView, strings, pos).nextPos;
		}

		if (type !== 4) {
			items.push({ id: idRef.value, file: fileRef.value });
		}
		pos = nextPos;
	}
	return items;
}

test('publish: non-Unity project keeps spine sidecar file names unchanged', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('proj-spine-non-unity').setProjectType(3).setVersion('3.0');

	const pkg = doc.createPackage('Loader');
	pkg.setId('loader001');
	pkg.setPublishName('Loader');

	const atlasDep = doc.createMiscResource('alien-pma.atlas');
	atlasDep.setId('misc001').setPath('/images/').setFile('alien-pma.atlas').setExported(true);
	pkg.addResource(atlasDep);

	const atlasImage = doc.createImageResource('alien-pma');
	atlasImage.setId('img001').setPath('/images/').setFileName('alien-pma.png').setWidth(32).setHeight(32).setExported(true);
	pkg.addResource(atlasImage);

	const spine = doc.createSpineResource('alien-pro');
	spine
		.setId('spine001')
		.setPath('/images/')
		.setFile('alien-pro.skel')
		.setExported(true)
		.setRequireIds(['misc001', 'img001'])
		.setAtlasNames(['alien-pma']);
	pkg.addResource(spine);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-spine-non-unity-'));
	const basePath = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-spine-assets-'));

	try {
		const resourceDir = path.join(basePath, 'Loader', 'images');
		await fs.mkdir(resourceDir, { recursive: true });
		await fs.writeFile(path.join(resourceDir, 'alien-pma.atlas'), 'atlas content');
		await fs.writeFile(path.join(resourceDir, 'alien-pro.skel'), 'skel content');
		await sharp({
			create: {
				width: 32,
				height: 32,
				channels: 4,
				background: { r: 80, g: 120, b: 200, alpha: 1 },
			},
		}).png().toFile(path.join(resourceDir, 'alien-pma.png'));

		await doc.transform(publish({
			output: tmpDir,
			packages: ['Loader'],
			fs: createFs(),
			encoder: sharp,
			basePath,
		}));

		for (const file of ['Loader.bin', 'alien-pma.atlas', 'alien-pro.skel', 'alien-pma.png']) {
			const stat = await fs.stat(path.join(tmpDir, file)).catch(() => null);
			t.truthy(stat, `${file} was exported`);
		}
		for (const absentFile of ['alien-pma.atlas.txt', 'alien-pro.skel.bytes', 'Loader_atlas0.png']) {
			const stat = await fs.stat(path.join(tmpDir, absentFile)).catch(() => null);
			t.falsy(stat, `${absentFile} was not exported`);
		}

		const bytes = await fs.readFile(path.join(tmpDir, 'Loader.bin'));
		const byId = new Map(parsePackageBinary(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)).map((item) => [item.id, item]));
		t.is(byId.get('misc001')?.file, 'alien-pma.atlas', 'misc atlas dependency keeps original file name');
		t.is(byId.get('spine001')?.file, 'alien-pro.skel', 'spine item keeps original skeleton file name');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
		await fs.rm(basePath, { recursive: true, force: true });
	}
});
