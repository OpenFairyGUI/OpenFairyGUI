import test from 'ava';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { NodeIO, Document } from '@openfairygui/core';
import { getFixtureProjectPath } from '@openfairygui/test-utils';
import sharp from 'sharp';
import { publish, resolvePublishOptions, type RootProjectSettings } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UNITY_EXAMPLES_FAIRY = getFixtureProjectPath('FairyGUI-Unity-Examples');

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

function parsePackageBinary(bytes: Uint8Array): {
	items: Array<{ type: number; id: string | null; ext: number | null }>;
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

	const items: Array<{ type: number; id: string | null; ext: number | null }> = [];
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
		pos += 2; // file
		pos += 1; // exported
		pos += 4; // width
		pos += 4; // height
		const ext = type === 3 ? dataView.getUint8(pos) : null;
		items.push({ type, id, ext });
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

	return { items, spriteIds, hitTestIds };
}

// ─── publish() without encoder (layout-only + binary write) ──────────

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
		t.is(pkg2.listResources().length, 1, 'publish prunes the unreferenced image resource from binary output');
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

	// No fs → no file output, but atlas layout should still be computed
	await doc.transform(publish({ output: '/tmp/unused' }));

	const atlases = pkg.listAtlases();
	t.is(atlases.length, 1, 'atlas node created even without fs');
	t.is(atlases[0].listSprites().length, 1, 'sprite placed in atlas');
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

	try {
		await doc.transform(publish({
			output: tmpDir,
			fs: createFs(),
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
