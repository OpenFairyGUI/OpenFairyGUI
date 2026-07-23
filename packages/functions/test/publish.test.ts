import test from 'ava';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { Document } from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';
import { getFixturePath, getFixtureProjectPath } from '@openfairygui/test-utils';
import sharp from 'sharp';
import { publish, resolvePublishOptions, type RootProjectSettings } from '../src/index.js';
import { resolvePublishAtlasRuntimeOptions } from '../src/publish.js';

const UNITY_EXAMPLES_FAIRY = getFixtureProjectPath('FairyGUI-unity', 'UIProject/FairyGUI-Unity-Examples.fairy');
const UNITY_BRANCH_LOADER_FAIRY = getFixtureProjectPath('FairyGUI-Experiments');
const LAYABOX_EXAMPLES_FAIRY = getFixtureProjectPath('FairyGUI-layabox', 'demo/UIProject/FairyGUI-layabox-demo.fairy');
const LAYABOX_RELEASE_DIR = getFixturePath('FairyGUI-layabox', 'demo', 'assets', 'resources', 'ui');

async function readReferenceReleaseNames(dirPath: string): Promise<string[]> {
	return (await fs.readdir(dirPath))
		.filter((name) => !name.endsWith('.meta'))
		.sort();
}

// Helper: create a simple NodeIO filesystem for publish output
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
		async readdir(dirPath: string): Promise<string[]> {
			return fs.readdir(dirPath);
		},
		async deleteFile(filePath: string): Promise<void> {
			await fs.rm(filePath, { force: true });
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

function parsePackageBinary(bytes: Uint8Array): {
	branches: string[];
	items: Array<{
		type: number;
		id: string | null;
		file: string | null;
		width: number;
		height: number;
		ext: number | null;
		branch: string | null;
		branchItems: Array<string | null>;
		highResolutionItems: Array<string | null>;
	}>;
	spriteIds: string[];
	hitTestIds: string[];
} {
	const state = { pos: 0 };
	state.pos += 4; // magic
	state.pos += 4; // version
	state.pos += 1; // compressed
	readUtfString(bytes, state); // packageId
	readUtfString(bytes, state); // packageName
	state.pos += 20; // reserved

	const data = bytes.subarray(state.pos);
	const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const offsets = [];
	let pos = 2;
	for (let i = 0; i < 6; i++) {
		offsets.push(dataView.getInt32(pos, false));
		pos += 4;
	}

	const stringTableOffset = offsets[4];
	const stringCount = dataView.getInt32(stringTableOffset, false);
	let stringPos = stringTableOffset + 4;
	const strings: string[] = [];
	for (let i = 0; i < stringCount; i++) {
		const len = dataView.getUint16(stringPos, false);
		stringPos += 2;
		strings.push(Buffer.from(data.subarray(stringPos, stringPos + len)).toString('utf8'));
		stringPos += len;
	}

	pos = offsets[0];
	const dependencyCount = dataView.getInt16(pos, false);
	pos += 2;
	for (let i = 0; i < dependencyCount; i++) {
		pos += 2; // dep id
		pos += 2; // dep name
	}
	const branchCount = dataView.getInt16(pos, false);
	pos += 2;
	const branches: string[] = [];
	for (let i = 0; i < branchCount; i++) {
		const branchRef = readStringRef(dataView, strings, pos);
		pos = branchRef.nextPos;
		branches.push(branchRef.value ?? '');
	}

	const items: Array<{
		type: number;
		id: string | null;
		file: string | null;
		width: number;
		height: number;
		ext: number | null;
		branch: string | null;
		branchItems: Array<string | null>;
		highResolutionItems: Array<string | null>;
	}> = [];
	pos = offsets[1];
	const itemCount = dataView.getInt16(pos, false);
	pos += 2;
	for (let i = 0; i < itemCount; i++) {
		const nextOffset = dataView.getInt32(pos, false);
		pos += 4;
		const nextPos = nextOffset + pos;
		const type = dataView.getUint8(pos++);
		const id = strings[dataView.getUint16(pos, false)] ?? null;
		pos += 2; // id
		pos += 2; // name
		pos += 2; // path
		const file = strings[dataView.getUint16(pos, false)] ?? null;
		pos += 2; // file
		pos += 1; // exported
		const width = dataView.getInt32(pos, false);
		pos += 4; // width
		const height = dataView.getInt32(pos, false);
		pos += 4; // height
		const ext = type === 3 ? dataView.getUint8(pos) : null;

		switch (type) {
			case 0: {
				const scaleOption = dataView.getUint8(pos);
				pos += 1;
				if (scaleOption === 1) pos += 20;
				pos += 1; // smoothing
				break;
			}
			case 1: {
				pos += 1; // smoothing
				const rawLen = dataView.getInt32(pos, false);
				pos += 4 + rawLen;
				break;
			}
			case 3: {
				pos += 1; // ext
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
				pos += 8; // anchor x/y
				break;
			default:
				if (type === 3 && ext === null) {
					break;
				}
				break;
		}

		const branchRef = readStringRef(dataView, strings, pos);
		pos = branchRef.nextPos;
		const itemBranchCount = dataView.getUint8(pos++);
		const branchItems: Array<string | null> = [];
		for (let branchIndex = 0; branchIndex < itemBranchCount; branchIndex++) {
			const branchItemRef = readStringRef(dataView, strings, pos);
			pos = branchItemRef.nextPos;
			branchItems.push(branchItemRef.value);
		}
		const highResCount = dataView.getUint8(pos++);
		const highResolutionItems: Array<string | null> = [];
		for (let highResIndex = 0; highResIndex < highResCount; highResIndex++) {
			const highResRef = readStringRef(dataView, strings, pos);
			pos = highResRef.nextPos;
			highResolutionItems.push(highResRef.value);
		}

		items.push({ type, id, file, width, height, ext, branch: branchRef.value, branchItems, highResolutionItems });
		pos = nextPos;
	}

	const spriteIds: string[] = [];
	if (offsets[2] > 0) {
		pos = offsets[2];
		const spriteCount = dataView.getInt16(pos, false);
		pos += 2;
		for (let i = 0; i < spriteCount; i++) {
			const nextOffset = dataView.getUint16(pos, false);
			pos += 2;
			const nextPos = nextOffset + pos;
			spriteIds.push(strings[dataView.getUint16(pos, false)] ?? '');
			pos = nextPos;
		}
	}

	const hitTestIds: string[] = [];
	if (offsets[3] > 0) {
		pos = offsets[3];
		const hitTestCount = dataView.getInt16(pos, false);
		pos += 2;
		for (let i = 0; i < hitTestCount; i++) {
			const nextOffset = dataView.getInt32(pos, false);
			pos += 4;
			const nextPos = nextOffset + pos;
			hitTestIds.push(strings[dataView.getUint16(pos, false)] ?? '');
			pos = nextPos;
		}
	}

	return { branches, items, spriteIds, hitTestIds };
}

// ─── publish() output contracts ──────────────────────────────────────

test('publish: generates .fui files for a synthetic document', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(7);
	const pkg = doc.createPackage('TestPkg');
	pkg.setId('test0001');
	pkg.setPublishName('TestPkg');

	const img = doc.createImageResource('icon.png');
	img.setId('i001').setWidth(64).setHeight(64);
	pkg.addResource(img);

	const comp = doc.createComponent('Main');
	comp.setId('c001');
	pkg.addResource(comp);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-'));

	try {
		await doc.transform(publish({
			output: tmpDir,
			compressed: false,
			fs: createFs(),
		}));

		// Verify .fui was written
		const fuiPath = path.join(tmpDir, 'TestPkg.fui');
		const stat = await fs.stat(fuiPath).catch(() => null);
		t.truthy(stat, '.fui file was created');
		t.true(stat!.size > 0, '.fui file is non-empty');

		// Read it back and verify
		const io = new NodeIO();
		const doc2 = await io.readBinary(fuiPath);
		const pkg2 = doc2.getRoot().listPackages()[0];
		t.is(pkg2.getId(), 'test0001', 'package ID preserved');
		t.is(pkg2.getName(), 'TestPkg', 'package name preserved');
		t.is(pkg2.listResources().length, 0, 'publish prunes unexported and unreferenced resources from binary output');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: includes linked high-resolution image resources without upscaling', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(4);
	doc.getRoot().setSettings({
		publish: {
			includeHighResolution: 5,
		},
	} as RootProjectSettings);

	const pkg = doc.createPackage('HiResPkg');
	pkg.setId('hires001');

	const icon = doc.createImageResource('icon.png');
	icon.setId('base01').setPath('/').setWidth(16).setHeight(16);
	pkg.addResource(icon);

	const icon2x = doc.createImageResource('icon@2x.png');
	icon2x.setId('hi2x01').setPath('/').setWidth(32).setHeight(32);
	pkg.addResource(icon2x);

	const icon4x = doc.createImageResource('icon@4x.png');
	icon4x.setId('hi4x01').setPath('/').setWidth(64).setHeight(64);
	pkg.addResource(icon4x);

	const component = doc.createComponent('Main');
	component.setId('main01').setExported(true);
	const child = doc.createGImage('icon');
	child.setId('n0').setSrc('base01');
	component.addChild(child);
	pkg.addResource(component);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-hires-'));
	const basePath = path.join(tmpDir, 'assets');
	const sourceDir = path.join(basePath, 'HiResPkg');

	try {
		await fs.mkdir(sourceDir, { recursive: true });
		await sharp({ create: { width: 16, height: 16, channels: 4, background: '#00000000' } }).png().toFile(path.join(sourceDir, 'icon.png'));
		await sharp({ create: { width: 32, height: 32, channels: 4, background: '#00000000' } }).png().toFile(path.join(sourceDir, 'icon@2x.png'));
		await sharp({ create: { width: 64, height: 64, channels: 4, background: '#00000000' } }).png().toFile(path.join(sourceDir, 'icon@4x.png'));
		await doc.transform(publish({
			output: tmpDir,
			compressed: false,
			fs: createFs(),
			encoder: sharp,
			basePath,
		}));

		const bytes = await fs.readFile(path.join(tmpDir, 'HiResPkg.fui'));
		const parsed = parsePackageBinary(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
		const byId = new Map(parsed.items.map((item) => [item.id, item]));

		t.true(byId.has('hi2x01'), '@2x resource is published as its own item');
		t.true(byId.has('hi4x01'), '@4x resource is published as its own item');
		t.is(byId.get('base01')?.width, 16, 'base image size is not upscaled');
		t.is(byId.get('hi2x01')?.width, 32, '@2x resource keeps its own width');
		t.is(byId.get('hi4x01')?.width, 64, '@4x resource keeps its own width');
		t.deepEqual(byId.get('base01')?.highResolutionItems, ['hi2x01', null, 'hi4x01']);

		const io = new NodeIO();
		const roundTripped = await io.readBinary(path.join(tmpDir, 'HiResPkg.fui'));
		const roundTripIcon = roundTripped.getRoot().getPackage('HiResPkg')?.getResourceById('base01') as any;
		t.deepEqual(roundTripIcon?.getHighResolutionItemIds?.(), ['hi2x01', null, 'hi4x01']);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: compressed output is readable', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(7);
	const pkg = doc.createPackage('CompPkg');
	pkg.setId('comp0001');

	const img = doc.createImageResource('bg.png');
	img.setId('i001').setWidth(128).setHeight(128);
	pkg.addResource(img);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-'));

	try {
		await doc.transform(publish({
			output: tmpDir,
			compressed: true,
			fs: createFs(),
		}));

		const fuiPath = path.join(tmpDir, 'CompPkg.fui');
		const io = new NodeIO();
		const doc2 = await io.readBinary(fuiPath);
		t.is(doc2.getRoot().listPackages()[0].getId(), 'comp0001', 'compressed .fui is readable');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: custom fileExtension works', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('UnityPkg');
	pkg.setId('unity001');

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-'));

	try {
		await doc.transform(publish({
			output: tmpDir,
			fileExtension: 'bytes',
			fs: createFs(),
		}));

		const bytesPath = path.join(tmpDir, 'UnityPkg_fui.bytes');
		const stat = await fs.stat(bytesPath).catch(() => null);
		t.truthy(stat, '_fui.bytes file was created');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: exports published sound resources with Unity naming', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(0);
	const pkg = doc.createPackage('Basics');
	pkg.setId('basic001');
	pkg.setPublishName('Basics');

	const sound = doc.createSoundResource('click');
	sound.setId('o4lt7w');
	sound.setPath('/sound/');
	sound.setFile('click.wav');
	sound.setExported(true);
	pkg.addResource(sound);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-'));
	const basePath = path.join(tmpDir, 'assets');
	const sourceDir = path.join(basePath, 'Basics', 'sound');
	const sourcePath = path.join(sourceDir, 'click.wav');
	const sourceData = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x01, 0x02, 0x03, 0x04]);

	try {
		await fs.mkdir(sourceDir, { recursive: true });
		await fs.writeFile(sourcePath, sourceData);

		await doc.transform(publish({
			output: tmpDir,
			basePath,
			fs: createFs(),
		}));

		const targetPath = path.join(tmpDir, 'Basics_o4lt7w.wav');
		const targetData = await fs.readFile(targetPath);
		t.deepEqual(new Uint8Array(targetData.buffer, targetData.byteOffset, targetData.byteLength), sourceData);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: exports loader skeleton resources and dependency closure with editor-aligned naming', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject(UNITY_BRANCH_LOADER_FAIRY);
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-'));

	try {
		await doc.transform(publish({
			output: tmpDir,
			packages: ['Loader'],
			fs: createFs(),
			encoder: sharp,
			basePath: path.join(path.dirname(UNITY_BRANCH_LOADER_FAIRY), 'assets'),
		}));

		const expectedFiles = [
			'Loader_fui.bytes',
			'dragon_ske.json',
			'dragon_tex.json',
			'dragon.png',
			'alien-pro.skel.bytes',
			'alien-pma.atlas.txt',
			'alien-pma.png',
			'mix-and-match-pro.skel.bytes',
			'mix-and-match-pma.atlas.txt',
			'mix-and-match-pma.png',
		];
		for (const file of expectedFiles) {
			const stat = await fs.stat(path.join(tmpDir, file)).catch(() => null);
			t.truthy(stat, `${file} was exported`);
		}

		for (const absentFile of ['spineboy-ess.skel.bytes', 'spineboy-pma.atlas.txt', 'spineboy-pma.png']) {
			const stat = await fs.stat(path.join(tmpDir, absentFile)).catch(() => null);
			t.falsy(stat, `${absentFile} was not exported`);
		}

		const bytes = await fs.readFile(path.join(tmpDir, 'Loader_fui.bytes'));
		const parsed = parsePackageBinary(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
		const byId = new Map(parsed.items.map((item) => [item.id, item]));
		t.is(byId.get('nbcg7')?.file, 'alien-pma.atlas.txt', 'misc atlas dependency writes published file name');
		t.is(byId.get('nbcge')?.file, 'alien-pro.skel.bytes', 'spine item writes published skeleton file name');
		t.is(byId.get('biss6')?.file, 'dragon_ske.json', 'dragonbones item keeps published json file name');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: Branch package keeps branch resources and emits separate branch atlases when configured', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject(UNITY_BRANCH_LOADER_FAIRY);
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-'));

	try {
		await doc.transform(publish({
			output: tmpDir,
			packages: ['Branch'],
			fs: createFs(),
			encoder: sharp,
			basePath: path.join(path.dirname(UNITY_BRANCH_LOADER_FAIRY), 'assets'),
		}));

		const bytes = await fs.readFile(path.join(tmpDir, 'Branch_fui.bytes'));
		const parsed = parsePackageBinary(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
		t.deepEqual(parsed.branches, ['dev'], 'separated branch atlas mode keeps package branch list');

		const byId = new Map(parsed.items.map((item) => [item.id, item]));
		t.is(byId.get('kn7w0')?.width, 800, 'main branch publish keeps main component width');
		t.is(byId.get('kn7w0')?.height, 600, 'main branch publish keeps main component height');
		t.true(byId.has('kn7w1'), 'main resource id is preserved');
		t.true(byId.has('kn7w2'), 'branch variant item id is preserved');
		t.true(byId.has('kn7w3'), 'branch component id is preserved');
		t.is(byId.get('kn7w1')?.width, 60, 'main branch publish keeps main image width');
		t.is(byId.get('kn7w1')?.height, 58, 'main branch publish keeps main image height');
		t.is(byId.get('kn7w2')?.width, 62, 'branch image width is preserved');
		t.is(byId.get('kn7w2')?.height, 60, 'branch image height is preserved');
		t.deepEqual(byId.get('kn7w1')?.branchItems ?? [], ['kn7w2'], 'main image maps to branch image id');
		const mainRoundTrip = await io.readBinary(path.join(tmpDir, 'Branch_fui.bytes'));
		const mainPkg = mainRoundTrip.getRoot().getPackage('Branch')!;
		const mainComponent = mainPkg.getResourceById('kn7w0') as any;
		const mainLoader = mainComponent.listChildren().find((child: any) => child.getId?.() === 'n0_kn7w');
		t.is(mainLoader?.getUrl?.(), 'ui://a9lkf94skn7w1', 'main branch publish keeps main component resource reference');
		const devComponent = mainPkg.getResourceById('kn7w3') as any;
		const devLoader = devComponent.listChildren().find((child: any) => child.getId?.() === 'n0_kn7w');
		t.is(devLoader?.getUrl?.(), 'ui://a9lkf94skn7w2', 'branch component keeps branch-local resource reference');
		t.deepEqual(
			mainPkg.listAtlases()
				.map((atlas) => ({ index: atlas.getIndex(), file: atlas.getFile(), sprites: atlas.listSprites().map((sprite) => sprite.getItemId()) }))
				.sort((left, right) => left.index - right.index),
			[
				{ index: 0, file: 'atlas0.png', sprites: ['kn7w1'] },
				{ index: 100, file: 'atlas0_dev.png', sprites: ['kn7w2'] },
			],
			'main publish separates main and branch atlases',
		);
		t.truthy(await fs.stat(path.join(tmpDir, 'Branch_atlas0.png')).catch(() => null), 'main atlas png was written');
		t.truthy(await fs.stat(path.join(tmpDir, 'Branch_atlas0_dev.png')).catch(() => null), 'branch atlas png was written');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: Branch package merges active branch resources onto main ids', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject(UNITY_BRANCH_LOADER_FAIRY);
	const settings = structuredClone(doc.getRoot().getSettings?.() ?? {});
	settings.publish ??= {};
	settings.publish.branchProcessing = 1;
	doc.getRoot().setSettings(settings);
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-'));

	try {
		await doc.transform(publish({
			output: tmpDir,
			packages: ['Branch'],
			branch: 'dev',
			fs: createFs(),
			encoder: sharp,
			basePath: path.join(path.dirname(UNITY_BRANCH_LOADER_FAIRY), 'assets'),
		}));

		const bytes = await fs.readFile(path.join(tmpDir, 'Branch_fui.bytes'));
		const parsed = parsePackageBinary(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
		t.deepEqual(parsed.branches, [], 'merged active-branch publish still omits branch table');

		const byId = new Map(parsed.items.map((item) => [item.id, item]));
		t.is(byId.get('kn7w0')?.width, 820, 'branch component reuses main component id');
		t.is(byId.get('kn7w0')?.height, 620, 'branch component overrides component size');
		t.true(byId.has('kn7w1'), 'branch resource reuses main id');
		t.false(byId.has('kn7w2'), 'branch resource is not emitted under its original id');
		t.false(byId.has('kn7w3'), 'branch component is not emitted under its original id');
		t.is(byId.get('kn7w1')?.width, 62, 'active branch overrides image width');
		t.is(byId.get('kn7w1')?.height, 60, 'active branch overrides image height');
		const mergedRoundTrip = await io.readBinary(path.join(tmpDir, 'Branch_fui.bytes'));
		const mergedPkg = mergedRoundTrip.getRoot().getPackage('Branch')!;
		const mergedComponent = mergedPkg.getResourceById('kn7w0') as any;
		const mergedLoader = mergedComponent.listChildren().find((child: any) => child.getId?.() === 'n0_kn7w');
		t.is(mergedLoader?.getUrl?.(), 'ui://a9lkf94skn7w1', 'merged branch component remaps local branch resource ref to main id');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: package filter works', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(7);
	const pkg1 = doc.createPackage('Include');
	pkg1.setId('inc00001');
	const pkg2 = doc.createPackage('Exclude');
	pkg2.setId('exc00001');

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-'));

	try {
		await doc.transform(publish({
			output: tmpDir,
			packages: ['Include'],
			fs: createFs(),
		}));

		const includePath = path.join(tmpDir, 'Include.fui');
		const excludePath = path.join(tmpDir, 'Exclude.fui');
		const incStat = await fs.stat(includePath).catch(() => null);
		const excStat = await fs.stat(excludePath).catch(() => null);
		t.truthy(incStat, 'Include.fui was created');
		t.falsy(excStat, 'Exclude.fui was NOT created');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: without fs, only computes layout', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('LayoutOnly');
	pkg.setId('lay00001');

	const img = doc.createImageResource('icon.png');
	img.setId('i001').setWidth(32).setHeight(32);
	pkg.addResource(img);

	// No output request and no fs → explicit layout-only transform.
	await doc.transform(publish({}));

	const atlases = pkg.listAtlases();
	t.is(atlases.length, 1, 'atlas node created even without fs');
	t.is(atlases[0].listSprites().length, 1, 'sprite placed in atlas');
});

test('publish: an output directory requires a filesystem capability', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('NoFsPkg');
	pkg.setId('nofs0001');

	await t.throwsAsync(
		() => doc.transform(publish({ output: 'release' })),
		{ message: /requires a filesystem/ },
	);
});

test('publish: rejects runtime output without raster capabilities', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('StrictPkg');
	pkg.setId('strict01');
	const image = doc.createImageResource('hero.png');
	image.setId('img001').setWidth(16).setHeight(16).setExported(true);
	pkg.addResource(image);
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-strict-'));

	try {
		await t.throwsAsync(
			() => doc.transform(publish({ output: tmpDir, fs: createFs() })),
			{ message: /requires encoder, basePath, and outputPath/ },
		);
		t.deepEqual(await fs.readdir(tmpDir), [], 'strict capability validation runs before writing package artifacts');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: rejects missing atlas source images instead of writing transparent holes', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('MissingImagePkg');
	pkg.setId('missing01');
	const image = doc.createImageResource('hero.png');
	image.setId('img001').setWidth(16).setHeight(16).setExported(true);
	pkg.addResource(image);
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-image-'));

	try {
		await t.throwsAsync(
			() => doc.transform(publish({
				output: tmpDir,
				fs: createFs(),
				encoder: sharp,
				basePath: path.join(tmpDir, 'assets'),
			})),
			{ message: /Could not read image/ },
		);
		t.deepEqual(await fs.readdir(tmpDir), [], 'failed atlas input does not write a binary or PNG');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: missing sound input rejects before the package binary is written', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(0);
	const pkg = doc.createPackage('MissingSoundPkg');
	pkg.setId('sound0001');
	const sound = doc.createSoundResource('click');
	sound.setId('snd001').setPath('/sound/').setFile('click.wav').setExported(true);
	pkg.addResource(sound);
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-sound-'));

	try {
		await t.throwsAsync(
			() => doc.transform(publish({
				output: tmpDir,
				fs: createFs(),
				basePath: path.join(tmpDir, 'assets'),
			})),
			{ message: /Could not export sound/ },
		);
		await t.throwsAsync(() => fs.stat(path.join(tmpDir, 'MissingSoundPkg_fui.bytes')), { code: 'ENOENT' });
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: missing external input rejects before the package binary is written', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(0);
	const pkg = doc.createPackage('MissingExternalPkg');
	pkg.setId('external1');
	const misc = doc.createMiscResource('config');
	misc.setId('misc001').setPath('/data/').setFile('config.json').setExported(true);
	pkg.addResource(misc);
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-external-'));

	try {
		await t.throwsAsync(
			() => doc.transform(publish({
				output: tmpDir,
				fs: createFs(),
				basePath: path.join(tmpDir, 'assets'),
			})),
			{ message: /Could not export external resource/ },
		);
		await t.throwsAsync(() => fs.stat(path.join(tmpDir, 'MissingExternalPkg_fui.bytes')), { code: 'ENOENT' });
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: binary output excludes unpublished image resources and preserves component extension type', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(0);
	const pkg = doc.createPackage('GhostPkg');
	pkg.setId('ghost001');
	pkg.setPublishName('GhostPkg');

	const usedImage = doc.createImageResource('used.png');
	usedImage.setId('img_used').setPath('/').setWidth(32).setHeight(32);
	pkg.addResource(usedImage);

	const unusedImage = doc.createImageResource('unused.png');
	unusedImage.setId('img_unused').setPath('/').setWidth(64).setHeight(64);
	pkg.addResource(unusedImage);

	const button = doc.createComponent('ButtonComp');
	button.setId('cmp_button');
	button.setExported(true);
	button.setSize(32, 32);
	button.setExtensionType('Button');
	const imageChild = doc.createGImage('n1');
	imageChild.setId('n1');
	imageChild.setSrc('img_used');
	imageChild.setSize(32, 32);
	button.addChild(imageChild);
	pkg.addResource(button);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-'));
	const basePath = path.join(tmpDir, 'assets');
	const sourceDir = path.join(basePath, 'GhostPkg');

	try {
		await fs.mkdir(sourceDir, { recursive: true });
		await sharp({ create: { width: 32, height: 32, channels: 4, background: '#00000000' } }).png().toFile(path.join(sourceDir, 'used.png'));
		await doc.transform(publish({
			output: tmpDir,
			fs: createFs(),
			encoder: sharp,
			basePath,
		}));

		const bytes = await fs.readFile(path.join(tmpDir, 'GhostPkg_fui.bytes'));
		const parsed = parsePackageBinary(bytes);
		const itemIds = new Set(parsed.items.map((item) => item.id));
		t.true(itemIds.has('img_used'), 'referenced image resource is published');
		t.false(itemIds.has('img_unused'), 'unreferenced image resource is pruned from item block');
		t.is(
			parsed.items.find((item) => item.id === 'cmp_button')?.ext,
			12,
			'component extension type is serialized from the formal property',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: generates package-level pixel hit test entries for Unity hit-test images', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject(UNITY_EXAMPLES_FAIRY);
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-'));

	try {
		await doc.transform(publish({
			output: tmpDir,
			packages: ['HitTest'],
			fs: createFs(),
			encoder: sharp,
			basePath: path.join(path.dirname(UNITY_EXAMPLES_FAIRY), 'assets'),
		}));

		const bytes = await fs.readFile(path.join(tmpDir, 'HitTest_fui.bytes'));
		const parsed = parsePackageBinary(bytes);
		t.deepEqual(
			parsed.hitTestIds.sort((a, b) => a.localeCompare(b)),
			['g40j8', 'g40j9', 'g40ja'],
			'pixel hit test block is emitted for referenced image hit-test targets',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: sample packages retain exported items and indirect resource references', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject(UNITY_EXAMPLES_FAIRY);
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-'));

	try {
		await doc.transform(publish({
			output: tmpDir,
			packages: ['Basics', 'Emoji', 'EmitNumbers', 'HeadBar', 'PullToRefresh', 'Transition', 'TreeView', 'TurnPage', 'TypingEffect'],
			fs: createFs(),
			encoder: sharp,
			basePath: path.join(path.dirname(UNITY_EXAMPLES_FAIRY), 'assets'),
		}));

		const checks: Array<{
			file: string;
			itemIds: string[];
			spriteIds?: string[];
		}> = [
			{ file: 'Basics_fui.bytes', itemIds: ['o4lt7w'] },
			{ file: 'Emoji_fui.bytes', itemIds: ['l7d51l', 'mwdy25'], spriteIds: ['l7d51l', 'mwdy25'] },
			{ file: 'EmitNumbers_fui.bytes', itemIds: ['mulj0', 'muljc', 'muljo'], spriteIds: ['muljo'] },
			{ file: 'HeadBar_fui.bytes', itemIds: ['rfrh8'] },
			{ file: 'PullToRefresh_fui.bytes', itemIds: ['n3qdr', '9sflu'] },
			{ file: 'Transition_fui.bytes', itemIds: ['gkq03'] },
			{ file: 'TreeView_fui.bytes', itemIds: ['pmk32'], spriteIds: ['pmk32'] },
			{ file: 'TurnPage_fui.bytes', itemIds: ['jva6h'], spriteIds: ['jva6h'] },
			{ file: 'TypingEffect_fui.bytes', itemIds: ['jruo1', 'jruo2', 'jruo3'] },
		];

		for (const check of checks) {
			const bytes = await fs.readFile(path.join(tmpDir, check.file));
			const parsed = parsePackageBinary(bytes);
			const itemIds = new Set(parsed.items.map((item) => item.id));
			for (const itemId of check.itemIds) {
				t.true(itemIds.has(itemId), `${check.file} contains item ${itemId}`);
			}
			if (check.spriteIds) {
				const spriteIds = new Set(parsed.spriteIds);
				for (const spriteId of check.spriteIds) {
					t.true(spriteIds.has(spriteId), `${check.file} contains sprite ${spriteId}`);
				}
			}
		}
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('resolvePublishOptions: Unity defaults to bytes and ignores project compression', (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(0);
	doc.getRoot().setSettings({
		publish: {
			compressDesc: true,
			fileExtension: 'fui',
		},
	} as RootProjectSettings);

	const resolved = resolvePublishOptions(doc);
	t.is(resolved.fileExtension, 'bytes', 'Unity defaults to .bytes');
	t.false(resolved.compressed, 'Unity publish is uncompressed by default');
});

test('resolvePublishOptions: Layabox defaults to fui and keeps non-Unity compression behavior', (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(4);
	doc.getRoot().setSettings({
		publish: {
			compressDesc: true,
		},
	} as RootProjectSettings);

	const resolved = resolvePublishOptions(doc);
	t.is(resolved.fileExtension, 'fui', 'Layabox defaults to .fui');
	t.true(resolved.compressed, 'Layabox keeps publish compression when configured');
});

test('resolvePublishOptions: Layabox respects explicit fileExtension overrides', (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(4);
	doc.getRoot().setSettings({
		publish: {
			fileExtension: 'fui',
			compressDesc: true,
		},
	} as RootProjectSettings);

	const resolved = resolvePublishOptions(doc, { fileExtension: 'bin' });
	t.is(resolved.fileExtension, 'bin', 'explicit override wins over Layabox defaults');
	t.true(resolved.compressed, 'override does not discard non-Unity compression behavior');
});

test('resolvePublishOptions: Cocos Creator defaults to bin and keeps non-Unity compression behavior', (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(3);
	doc.getRoot().setSettings({
		publish: {
			compressDesc: true,
		},
	} as RootProjectSettings);

	const resolved = resolvePublishOptions(doc);
	t.is(resolved.fileExtension, 'bin', 'Cocos Creator defaults to .bin');
	t.true(resolved.compressed, 'Cocos Creator keeps publish compression when configured');
});

test('resolvePublishOptions: Cocos Creator respects explicit fileExtension overrides', (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(3);
	doc.getRoot().setSettings({
		publish: {
			compressDesc: true,
		},
	} as RootProjectSettings);

	const resolved = resolvePublishOptions(doc, { fileExtension: 'fui' });
	t.is(resolved.fileExtension, 'fui', 'explicit override wins over Creator defaults');
	t.true(resolved.compressed, 'override does not discard non-Unity compression behavior');
});

test('resolvePublishAtlasRuntimeOptions: ext-coupled atlas toggles stay explicit', (t) => {
	t.deepEqual(resolvePublishAtlasRuntimeOptions('fui'), {
		preserveInputOrderOnTie: true,
		directSingleImageOutput: false,
	});
	t.deepEqual(resolvePublishAtlasRuntimeOptions('bytes'), {
		preserveInputOrderOnTie: false,
		directSingleImageOutput: true,
	});
	t.deepEqual(resolvePublishAtlasRuntimeOptions('bin'), {
		preserveInputOrderOnTie: false,
		directSingleImageOutput: false,
	});
});

test('resolvePublishOptions: maps publish atlas settings into reusable atlas options', (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(7);
	doc.getRoot().setSettings({
		publish: {
			compressDesc: true,
			fileExtension: 'bin',
			atlasSetting: {
				maxSize: 512,
				fast: false,
				allowRotation: true,
				padding: 4,
				sizeOption: 'pot',
				forceSquare: true,
				paging: false,
				trimImage: true,
			},
		},
	} as RootProjectSettings);

	const resolved = resolvePublishOptions(doc, { packages: ['PkgA'] });
	t.is(resolved.fileExtension, 'bin');
	t.true(resolved.compressed);
	t.deepEqual(resolved.packages, ['PkgA']);
	t.deepEqual(resolved.atlas, {
		maxSize: 512,
		fast: false,
		allowRotation: true,
		padding: 4,
		powerOfTwo: true,
		square: true,
		multiPage: false,
		trimImage: true,
		extractAlpha: false,
	});
});

test('resolvePublishOptions: atlas maxSize defaults to 2048 when project setting is absent', (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(0);
	doc.getRoot().setSettings({
		publish: {
			atlasSetting: {
				allowRotation: true,
				paging: true,
				sizeOption: 'pot',
				trimImage: true,
			},
		},
	} as RootProjectSettings);

	const resolved = resolvePublishOptions(doc);
	t.is(resolved.atlas.maxSize, 2048);
});

test('publish: Layabox sample emits editor-aligned .fui outputs and reference release layout', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject(LAYABOX_EXAMPLES_FAIRY);
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-laya-pub-'));
	const referenceNames = await readReferenceReleaseNames(LAYABOX_RELEASE_DIR);
	const basePath = path.join(path.dirname(LAYABOX_EXAMPLES_FAIRY), 'assets');

	try {
		await doc.transform(publish({
			output: tmpDir,
			fs: createFs(),
			encoder: sharp,
			basePath,
		}));

		const outputNames = (await fs.readdir(tmpDir)).sort();
		const outputSet = new Set(outputNames);
		t.deepEqual(outputNames, referenceNames, 'Layabox publish matches the reference release layout exactly');

		t.false(outputNames.some((name) => /_fui\.bytes$/i.test(name)), 'Layabox publish does not emit Unity-style _fui.bytes packages');
		t.true(outputSet.has('Bag.fui'), 'representative package uses .fui output');
		t.true(outputSet.has('Bag_atlas0.png'), 'representative atlas png is emitted');
		t.true(outputSet.has('Basics_o4lt7w.wav'), 'representative loose audio file is emitted with package prefix');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: Cocos Creator stays on the generic path and defaults package output to .bin', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject(LAYABOX_EXAMPLES_FAIRY);
	const settings = doc.getRoot().getSettings() as RootProjectSettings;
	const creatorSettings: RootProjectSettings = {
		...settings,
		publish: {
			...(settings.publish ?? {}),
		},
	};
	delete creatorSettings.publish?.fileExtension;
	doc.getRoot().setProjectType(3);
	doc.getRoot().setSettings(creatorSettings);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-creator-pub-'));
	const referenceNames = await readReferenceReleaseNames(LAYABOX_RELEASE_DIR);
	const expectedNames = referenceNames.map((name) => name.replace(/\.fui$/i, '.bin'));
	const basePath = path.join(path.dirname(LAYABOX_EXAMPLES_FAIRY), 'assets');

	try {
		await doc.transform(publish({
			output: tmpDir,
			fs: createFs(),
			encoder: sharp,
			basePath,
		}));

		const outputNames = (await fs.readdir(tmpDir)).sort();
		const outputSet = new Set(outputNames);
		t.deepEqual(outputNames, expectedNames, 'Cocos Creator stays on the generic publish layout and only changes descriptor extension defaults');
		t.false(outputNames.some((name) => /_fui\.bytes$/i.test(name)), 'Cocos Creator publish does not emit Unity-style _fui.bytes packages');
		t.true(outputSet.has('Bag.bin'), 'representative package uses .bin output');
		t.true(outputSet.has('Bag_atlas0.png'), 'representative atlas png is emitted on the generic path');
		t.false(outputNames.includes('resources'), 'Cocos Creator publish does not introduce Creator-specific resources/ shaping');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: code generation gates on global allowGenCode and package genCode', async (t) => {
	const combinations = [
		{ allowGenCode: true, genCode: true, shouldGenerate: true },
		{ allowGenCode: false, genCode: true, shouldGenerate: false },
		{ allowGenCode: true, genCode: false, shouldGenerate: false },
		{ allowGenCode: false, genCode: false, shouldGenerate: false },
	];

	for (const combination of combinations) {
		const doc = new Document();
		doc.getRoot().setProjectType(0);
		doc.getRoot().setSettings({
			publish: {
				codeGeneration: {
					allowGenCode: combination.allowGenCode,
					codePath: 'generated',
					codeType: '',
				},
			},
		} as RootProjectSettings);

		const pkg = doc.createPackage('DemoPkg');
		pkg.setId('pkg00001');
		pkg.setGenCode(combination.genCode);

		const component = doc.createComponent('Main');
		component.setId('cmp00001');
		component.setExported(true);
		const child = doc.createGTextField('content');
		child.setId('n0');
		component.addChild(child);
		pkg.addResource(component);

		const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-codegen-gates-'));

		try {
			await doc.transform(publish({
				output: path.join(tmpDir, 'release'),
				basePath: path.join(tmpDir, 'assets'),
				fs: createFs(),
			}));

			const generatedPath = path.join(tmpDir, 'generated', 'DemoPkg', 'UI_Main.cs');
			t.is(
				await fs.stat(generatedPath).then(() => true).catch(() => false),
				combination.shouldGenerate,
				`generation outcome matches ${JSON.stringify(combination)}`,
			);
		} finally {
			await fs.rm(tmpDir, { recursive: true, force: true });
		}
	}
});

test('publish: package codePath overrides global codeGeneration.codePath', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(0);
	doc.getRoot().setSettings({
		publish: {
			codeGeneration: {
				allowGenCode: true,
				codePath: 'global-generated',
				codeType: '',
			},
		},
	} as RootProjectSettings);

	const pkg = doc.createPackage('DemoPkg');
	pkg.setId('pkg00001');
	pkg.setGenCode(true);
	pkg.setCodePath('package-generated');

	const component = doc.createComponent('Main');
	component.setId('cmp00001');
	component.setExported(true);
	const child = doc.createGTextField('content');
	child.setId('n0');
	component.addChild(child);
	pkg.addResource(component);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-codegen-path-'));

	try {
		await doc.transform(publish({
			output: path.join(tmpDir, 'release'),
			basePath: path.join(tmpDir, 'assets'),
			fs: createFs(),
		}));

		t.true(
			await fs.stat(path.join(tmpDir, 'package-generated', 'DemoPkg', 'UI_Main.cs')).then(() => true).catch(() => false),
			'package codePath wins',
		);
		t.false(
			await fs.stat(path.join(tmpDir, 'global-generated', 'DemoPkg', 'UI_Main.cs')).then(() => true).catch(() => false),
			'global codePath is not used when package codePath is set',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: Unity blank codeType generates binder and component classes with non-ignored members', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(0);
	doc.getRoot().setSettings({
		publish: {
			codeGeneration: {
				allowGenCode: true,
				classNamePrefix: 'UI_',
				memberNamePrefix: 'm_',
				codePath: 'generated',
				codeType: '',
				getMemberByName: true,
				ignoreNoname: true,
			},
		},
	} as RootProjectSettings);

	const pkg = doc.createPackage('DemoPkg');
	pkg.setId('pkg00001');
	pkg.setGenCode(true);

	const subPanel = doc.createComponent('SubPanel');
	subPanel.setId('cmp00002');
	subPanel.setExported(true);
	const subPanelChild = doc.createGTextField('content');
	subPanelChild.setId('n0');
	subPanel.addChild(subPanelChild);
	pkg.addResource(subPanel);

	const main = doc.createComponent('Main');
	main.setId('cmp00001');
	main.setExtensionType('Button');
	main.setExported(true);
	const namedChild = doc.createGTextField('content');
	namedChild.setId('n0');
	main.addChild(namedChild);
	const defaultChild = doc.createGTextField('title');
	defaultChild.setId('n1');
	main.addChild(defaultChild);
	const nested = doc.createGComponent('subPanel');
	nested.setId('n2');
	nested.setSrc('cmp00002');
	main.addChild(nested);
	const controller = doc.createController('button');
	main.addController(controller);
	const transition = doc.createTransition('fadeIn');
	main.addTransition(transition);
	pkg.addResource(main);

	const internal = doc.createComponent('Internal');
	internal.setId('cmp00003');
	internal.setExported(false);
	pkg.addResource(internal);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-codegen-unity-'));

	try {
		await doc.transform(publish({
			output: path.join(tmpDir, 'release'),
			basePath: path.join(tmpDir, 'assets'),
			fs: createFs(),
		}));

		const generatedDir = path.join(tmpDir, 'generated', 'DemoPkg');
		const mainClassPath = path.join(generatedDir, 'UI_Main.cs');
		const subClassPath = path.join(generatedDir, 'UI_SubPanel.cs');
		const internalClassPath = path.join(generatedDir, 'UI_Internal.cs');
		const binderPath = path.join(generatedDir, 'DemoPkgBinder.cs');

		t.true(await fs.stat(mainClassPath).then(() => true).catch(() => false), 'main component generates a class');
		t.true(await fs.stat(subClassPath).then(() => true).catch(() => false), 'referenced component generates a class');
		t.false(await fs.stat(internalClassPath).then(() => true).catch(() => false), 'component with no generated members does not generate a class');
		t.true(await fs.stat(binderPath).then(() => true).catch(() => false), 'binder file is generated');

		const mainClass = await fs.readFile(mainClassPath, 'utf-8');
		t.true(mainClass.startsWith('/** This is an automatically generated class by FairyGUI. Please do not modify it. **/'));
		t.true(mainClass.includes('public partial class UI_Main : GButton'), 'component extension maps to GButton base class');
		t.true(mainClass.includes('public UI_SubPanel m_subPanel;'), 'local component child uses generated class type');
		t.true(mainClass.includes('public Transition m_fadeIn;'), 'transition field is generated');
		t.false(mainClass.includes('m_title'), 'default child name is ignored when ignoreNoname=true');
		t.false(mainClass.includes('m_button'), 'default controller name is ignored when ignoreNoname=true');
		t.true(mainClass.includes('m_content = (GTextField)this.GetChild("content");'), 'named child uses GetChild when getMemberByName=true');

		const binder = await fs.readFile(binderPath, 'utf-8');
		t.true(binder.includes('UIObjectFactory.SetPackageItemExtension(UI_Main.URL, typeof(UI_Main));'));
		t.true(binder.includes('UIObjectFactory.SetPackageItemExtension(UI_SubPanel.URL, typeof(UI_SubPanel));'));
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: omitted ignoreNoname keeps default members generated', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(0);
	doc.getRoot().setSettings({
		publish: {
			codeGeneration: {
				allowGenCode: true,
				classNamePrefix: 'UI_',
				memberNamePrefix: 'm_',
				codePath: 'generated',
				codeType: '',
				getMemberByName: true,
			},
		},
	} as RootProjectSettings);

	const pkg = doc.createPackage('DemoPkg');
	pkg.setId('pkg00001');
	pkg.setGenCode(true);

	const main = doc.createComponent('Main');
	main.setId('cmp00001');
	main.setExtensionType('Button');
	main.setExported(true);
	const titleChild = doc.createGTextField('title');
	titleChild.setId('n0');
	main.addChild(titleChild);
	const controller = doc.createController('button');
	main.addController(controller);
	pkg.addResource(main);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-codegen-ignore-default-'));

	try {
		await doc.transform(publish({
			output: path.join(tmpDir, 'release'),
			basePath: path.join(tmpDir, 'assets'),
			fs: createFs(),
		}));

		const mainClass = await fs.readFile(path.join(tmpDir, 'generated', 'DemoPkg', 'UI_Main.cs'), 'utf-8');
		t.true(mainClass.includes('public GTextField m_title;'), 'default title child remains generated when ignoreNoname is omitted');
		t.true(mainClass.includes('public Controller m_button;'), 'default button controller remains generated when ignoreNoname is omitted');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: code generation cleanup removes only prior marked files', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(0);
	doc.getRoot().setSettings({
		publish: {
			codeGeneration: {
				allowGenCode: true,
				codePath: 'generated',
				codeType: '',
			},
		},
	} as RootProjectSettings);

	const pkg = doc.createPackage('DemoPkg');
	pkg.setId('pkg00001');
	pkg.setGenCode(true);

	const component = doc.createComponent('Main');
	component.setId('cmp00001');
	component.setExported(true);
	const child = doc.createGTextField('content');
	child.setId('n0');
	component.addChild(child);
	pkg.addResource(component);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-codegen-cleanup-'));
	const generatedDir = path.join(tmpDir, 'generated', 'DemoPkg');

	try {
		await fs.mkdir(generatedDir, { recursive: true });
		await fs.writeFile(path.join(generatedDir, 'Stale.cs'), '/** This is an automatically generated class by FairyGUI. Please do not modify it. **/\nold', 'utf-8');
		await fs.writeFile(path.join(generatedDir, 'Keep.cs'), 'user-authored file', 'utf-8');

		await doc.transform(publish({
			output: path.join(tmpDir, 'release'),
			basePath: path.join(tmpDir, 'assets'),
			fs: createFs(),
		}));

		t.false(await fs.stat(path.join(generatedDir, 'Stale.cs')).then(() => true).catch(() => false), 'stale marked file is deleted');
		t.true(await fs.stat(path.join(generatedDir, 'Keep.cs')).then(() => true).catch(() => false), 'unmarked file is preserved');
		t.true(await fs.stat(path.join(generatedDir, 'UI_Main.cs')).then(() => true).catch(() => false), 'new component file is generated');
		t.true(await fs.stat(path.join(generatedDir, 'DemoPkgBinder.cs')).then(() => true).catch(() => false), 'new binder file is generated');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: Layabox modern TypeScript code generates package-scoped .ts output', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(4);
	doc.getRoot().setSettings({
		publish: {
			codeGeneration: {
				allowGenCode: true,
				classNamePrefix: 'UI_',
				memberNamePrefix: 'm_',
				codePath: 'generated',
				getMemberByName: true,
				ignoreNoname: true,
			},
		},
	} as RootProjectSettings);

	const pkg = doc.createPackage('DemoPkg');
	pkg.setId('pkg00001');
	pkg.setGenCode(true);

	const subPanel = doc.createComponent('SubPanel');
	subPanel.setId('cmp00002');
	subPanel.setExported(true);
	const subPanelChild = doc.createGTextField('content');
	subPanelChild.setId('n0');
	subPanel.addChild(subPanelChild);
	pkg.addResource(subPanel);

	const main = doc.createComponent('Main');
	main.setId('cmp00001');
	main.setExtensionType('Button');
	main.setExported(true);
	const namedChild = doc.createGTextField('content');
	namedChild.setId('n0');
	main.addChild(namedChild);
	const defaultChild = doc.createGTextField('title');
	defaultChild.setId('n1');
	main.addChild(defaultChild);
	const nested = doc.createGComponent('subPanel');
	nested.setId('n2');
	nested.setSrc('cmp00002');
	main.addChild(nested);
	const controller = doc.createController('button');
	main.addController(controller);
	const transition = doc.createTransition('fadeIn');
	main.addTransition(transition);
	pkg.addResource(main);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-codegen-laya-modern-ts-'));

	try {
		await doc.transform(publish({
			output: path.join(tmpDir, 'release'),
			basePath: path.join(tmpDir, 'assets'),
			fs: createFs(),
		}));

		const generatedDir = path.join(tmpDir, 'generated', 'DemoPkg');
		const mainClassPath = path.join(generatedDir, 'UI_Main.ts');
		const binderPath = path.join(generatedDir, 'DemoPkgBinder.ts');

		t.true(await fs.stat(mainClassPath).then(() => true).catch(() => false), 'Layabox generates component file');
		t.true(await fs.stat(binderPath).then(() => true).catch(() => false), 'Layabox generates binder file');

		const mainClass = await fs.readFile(mainClassPath, 'utf-8');
		t.true(mainClass.startsWith('/** This is an automatically generated class by FairyGUI. Please do not modify it. **/'));
		t.true(mainClass.includes('export default class UI_Main extends fgui.GButton'));
		t.true(mainClass.includes('return <UI_Main><any>(fgui.UIPackage.createObject("DemoPkg","Main"));'));
		t.true(mainClass.includes('public m_content:fgui.GTextField;'));
		t.true(mainClass.includes('public m_fadeIn:fgui.Transition;'));
		t.true(mainClass.includes('this.m_content = <fgui.GTextField><any>(this.getChild("content"));'));
		t.true(mainClass.includes('this.m_fadeIn = this.getTransition("fadeIn");'));
		t.true(mainClass.includes('import UI_SubPanel from "./UI_SubPanel";'));
		t.true(mainClass.includes('public m_subPanel:UI_SubPanel;'));
		t.false(mainClass.includes('m_title'), 'default title member is ignored');
		t.false(mainClass.includes('m_button'), 'default button controller is ignored');
		t.false(mainClass.includes('import fgui.GTextField'), 'builtin runtime types are not imported');

		const binder = await fs.readFile(binderPath, 'utf-8');
		t.true(binder.includes('import UI_Main from "./UI_Main";'));
		t.true(binder.includes('import UI_SubPanel from "./UI_SubPanel";'));
		t.true(binder.includes('fgui.UIObjectFactory.setExtension(UI_Main.URL, UI_Main);'));
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: Layabox modern TypeScript code keeps positional member access semantics', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(4);
	doc.getRoot().setSettings({
		publish: {
			codeGeneration: {
				allowGenCode: true,
				classNamePrefix: 'UI_',
				memberNamePrefix: 'm_',
				codePath: 'generated',
				getMemberByName: false,
				ignoreNoname: false,
			},
		},
	} as RootProjectSettings);

	const pkg = doc.createPackage('DemoPkg');
	pkg.setId('pkg00001');
	pkg.setGenCode(true);

	const subPanel = doc.createComponent('SubPanel');
	subPanel.setId('cmp00002');
	subPanel.setExported(true);
	const subPanelChild = doc.createGTextField('content');
	subPanelChild.setId('n0');
	subPanel.addChild(subPanelChild);
	pkg.addResource(subPanel);

	const main = doc.createComponent('Main');
	main.setId('cmp00001');
	main.setExtensionType('Button');
	main.setExported(true);
	const content = doc.createGTextField('content');
	content.setId('n0');
	main.addChild(content);
	const sub = doc.createGComponent('subPanel');
	sub.setId('n1');
	sub.setSrc('cmp00002');
	main.addChild(sub);
	const controller = doc.createController('button');
	main.addController(controller);
	const transition = doc.createTransition('fadeIn');
	main.addTransition(transition);
	pkg.addResource(main);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-codegen-laya-modern-ts-pos-'));

	try {
		await doc.transform(publish({
			output: path.join(tmpDir, 'release'),
			basePath: path.join(tmpDir, 'assets'),
			fs: createFs(),
		}));

		const mainClass = await fs.readFile(path.join(tmpDir, 'generated', 'DemoPkg', 'UI_Main.ts'), 'utf-8');
		t.true(mainClass.includes('this.m_content = <fgui.GTextField><any>(this.getChildAt(0));'));
		t.true(mainClass.includes('this.m_subPanel = <UI_SubPanel><any>(this.getChildAt(1));'));
		t.true(mainClass.includes('this.m_button = this.getControllerAt(0);'));
		t.true(mainClass.includes('this.m_fadeIn = this.getTransitionAt(0);'));
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: Layabox modern TypeScript code namespaces builtin runtime types instead of importing them as local classes', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(4);
	doc.getRoot().setSettings({
		publish: {
			codeGeneration: {
				allowGenCode: true,
				classNamePrefix: 'UI_',
				memberNamePrefix: 'm_',
				codePath: 'generated',
				getMemberByName: true,
				ignoreNoname: false,
			},
		},
	} as RootProjectSettings);

	const pkg = doc.createPackage('DemoPkg');
	pkg.setId('pkg00001');
	pkg.setGenCode(true);

	const main = doc.createComponent('Main');
	main.setId('cmp00001');
	main.setExported(true);

	const preview = doc.createGLoader3D('preview');
	preview.setId('n0');
	main.addChild(preview);

	const tree = doc.createGTree('tree');
	tree.setId('n1');
	main.addChild(tree);

	pkg.addResource(main);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-codegen-laya-modern-ts-builtins-'));

	try {
		await doc.transform(publish({
			output: path.join(tmpDir, 'release'),
			basePath: path.join(tmpDir, 'assets'),
			fs: createFs(),
		}));

		const mainClass = await fs.readFile(path.join(tmpDir, 'generated', 'DemoPkg', 'UI_Main.ts'), 'utf-8');
		t.true(mainClass.includes('public m_preview:fgui.GLoader3D;'));
		t.true(mainClass.includes('public m_tree:fgui.GTree;'));
		t.true(mainClass.includes('this.m_preview = <fgui.GLoader3D><any>(this.getChild("preview"));'));
		t.true(mainClass.includes('this.m_tree = <fgui.GTree><any>(this.getChild("tree"));'));
		t.false(mainClass.includes('import GLoader3D from "./GLoader3D";'));
		t.false(mainClass.includes('import GTree from "./GTree";'));
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: Layabox modern TypeScript code works without codeType configuration', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(4);
	doc.getRoot().setSettings({
		publish: {
			codeGeneration: {
				allowGenCode: true,
				codePath: 'generated',
			},
		},
	} as RootProjectSettings);

	const pkg = doc.createPackage('DemoPkg');
	pkg.setId('pkg00001');
	pkg.setGenCode(true);
	const component = doc.createComponent('Main');
	component.setId('cmp00001');
	component.setExported(true);
	const child = doc.createGTextField('content');
	child.setId('n0');
	component.addChild(child);
	pkg.addResource(component);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-codegen-laya-no-codetype-'));

	try {
		await doc.transform(publish({
			output: path.join(tmpDir, 'release'),
			basePath: path.join(tmpDir, 'assets'),
			fs: createFs(),
		}));

		t.true(
			await fs.stat(path.join(tmpDir, 'generated', 'DemoPkg', 'UI_Main.ts')).then(() => true).catch(() => false),
			'Layabox code generation no longer depends on codeType',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: Cocos Creator reuses the shared fgui TypeScript lane without codeType configuration', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(3);
	doc.getRoot().setSettings({
		publish: {
			codeGeneration: {
				allowGenCode: true,
				classNamePrefix: 'UI_',
				memberNamePrefix: 'm_',
				codePath: 'generated',
				getMemberByName: true,
				ignoreNoname: true,
			},
		},
	} as RootProjectSettings);

	const pkg = doc.createPackage('DemoPkg');
	pkg.setId('pkg00001');
	pkg.setGenCode(true);

	const subPanel = doc.createComponent('SubPanel');
	subPanel.setId('cmp00002');
	subPanel.setExported(true);
	const subPanelChild = doc.createGTextField('content');
	subPanelChild.setId('n0');
	subPanel.addChild(subPanelChild);
	pkg.addResource(subPanel);

	const main = doc.createComponent('Main');
	main.setId('cmp00001');
	main.setExtensionType('Button');
	main.setExported(true);
	const namedChild = doc.createGTextField('content');
	namedChild.setId('n0');
	main.addChild(namedChild);
	const defaultChild = doc.createGTextField('title');
	defaultChild.setId('n1');
	main.addChild(defaultChild);
	const nested = doc.createGComponent('subPanel');
	nested.setId('n2');
	nested.setSrc('cmp00002');
	main.addChild(nested);
	const controller = doc.createController('button');
	main.addController(controller);
	const transition = doc.createTransition('fadeIn');
	main.addTransition(transition);
	pkg.addResource(main);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-codegen-creator-shared-ts-'));

	try {
		await doc.transform(publish({
			output: path.join(tmpDir, 'release'),
			basePath: path.join(tmpDir, 'assets'),
			fs: createFs(),
		}));

		const generatedDir = path.join(tmpDir, 'generated', 'DemoPkg');
		const mainClassPath = path.join(generatedDir, 'UI_Main.ts');
		const binderPath = path.join(generatedDir, 'DemoPkgBinder.ts');

		t.true(await fs.stat(mainClassPath).then(() => true).catch(() => false), 'Cocos Creator generates component file');
		t.true(await fs.stat(binderPath).then(() => true).catch(() => false), 'Cocos Creator generates binder file');

		const mainClass = await fs.readFile(mainClassPath, 'utf-8');
		t.true(mainClass.includes('export default class UI_Main extends fgui.GButton'));
		t.true(mainClass.includes('return <UI_Main><any>(fgui.UIPackage.createObject("DemoPkg","Main"));'));
		t.true(mainClass.includes('public m_content:fgui.GTextField;'));
		t.true(mainClass.includes('public m_fadeIn:fgui.Transition;'));
		t.true(mainClass.includes('this.m_content = <fgui.GTextField><any>(this.getChild("content"));'));
		t.true(mainClass.includes('import UI_SubPanel from "./UI_SubPanel";'));
		t.false(mainClass.includes('m_title'), 'default title member is ignored');
		t.false(mainClass.includes('m_button'), 'default button controller is ignored');

		const binder = await fs.readFile(binderPath, 'utf-8');
		t.true(binder.includes('fgui.UIObjectFactory.setExtension(UI_Main.URL, UI_Main);'));
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: unsupported project types still skip the shared fgui TypeScript lane', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(7);
	doc.getRoot().setSettings({
		publish: {
			codeGeneration: {
				allowGenCode: true,
				codePath: 'generated',
			},
		},
	} as RootProjectSettings);

	const pkg = doc.createPackage('DemoPkg');
	pkg.setId('pkg00001');
	pkg.setGenCode(true);
	const component = doc.createComponent('Main');
	component.setId('cmp00001');
	component.setExported(true);
	const child = doc.createGTextField('content');
	child.setId('n0');
	component.addChild(child);
	pkg.addResource(component);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-codegen-unsupported-ts-'));

	try {
		await doc.transform(publish({
			output: path.join(tmpDir, 'release'),
			basePath: path.join(tmpDir, 'assets'),
			fs: createFs(),
		}));

		t.false(
			await fs.stat(path.join(tmpDir, 'generated', 'DemoPkg', 'UI_Main.ts')).then(() => true).catch(() => false),
			'unsupported project types still do not opt into the shared fgui TypeScript lane',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: Layabox modern TypeScript cleanup removes only prior marked .ts files', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(4);
	doc.getRoot().setSettings({
		publish: {
			codeGeneration: {
				allowGenCode: true,
				codePath: 'generated',
			},
		},
	} as RootProjectSettings);

	const pkg = doc.createPackage('DemoPkg');
	pkg.setId('pkg00001');
	pkg.setGenCode(true);

	const component = doc.createComponent('Main');
	component.setId('cmp00001');
	component.setExported(true);
	const child = doc.createGTextField('content');
	child.setId('n0');
	component.addChild(child);
	pkg.addResource(component);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-codegen-laya-cleanup-'));
	const generatedDir = path.join(tmpDir, 'generated', 'DemoPkg');

	try {
		await fs.mkdir(generatedDir, { recursive: true });
		await fs.writeFile(path.join(generatedDir, 'Stale.ts'), '/** This is an automatically generated class by FairyGUI. Please do not modify it. **/\nold', 'utf-8');
		await fs.writeFile(path.join(generatedDir, 'Keep.ts'), 'user-authored file', 'utf-8');

		await doc.transform(publish({
			output: path.join(tmpDir, 'release'),
			basePath: path.join(tmpDir, 'assets'),
			fs: createFs(),
		}));

		t.false(await fs.stat(path.join(generatedDir, 'Stale.ts')).then(() => true).catch(() => false), 'stale marked .ts file is deleted');
		t.true(await fs.stat(path.join(generatedDir, 'Keep.ts')).then(() => true).catch(() => false), 'unmarked .ts file is preserved');
		t.true(await fs.stat(path.join(generatedDir, 'UI_Main.ts')).then(() => true).catch(() => false), 'new .ts component file is generated');
		t.true(await fs.stat(path.join(generatedDir, 'DemoPkgBinder.ts')).then(() => true).catch(() => false), 'new .ts binder file is generated');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});
