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
		ext: number | null;
		branch: string | null;
		branchItems: Array<string | null>;
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
		ext: number | null;
		branch: string | null;
		branchItems: Array<string | null>;
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
		pos += 4; // width
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
		for (let highResIndex = 0; highResIndex < highResCount; highResIndex++) {
			pos += 2;
		}

		items.push({ type, id, file, ext, branch: branchRef.value, branchItems });
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

test('publish: exports loader skeleton resources and dependency closure with editor-aligned naming', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject(UNITY_EXAMPLES_FAIRY);
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-'));

	try {
		await doc.transform(publish({
			output: tmpDir,
			packages: ['Loader'],
			fs: createFs(),
			encoder: sharp,
			basePath: path.join(path.dirname(UNITY_EXAMPLES_FAIRY), 'assets'),
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

test('publish: Branch package writes branch table and main-to-branch item mapping', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject(UNITY_EXAMPLES_FAIRY);
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-'));

	try {
		await doc.transform(publish({
			output: tmpDir,
			packages: ['Branch'],
			fs: createFs(),
			encoder: sharp,
			basePath: path.join(path.dirname(UNITY_EXAMPLES_FAIRY), 'assets'),
		}));

		const bytes = await fs.readFile(path.join(tmpDir, 'Branch_fui.bytes'));
		const parsed = parsePackageBinary(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
		t.deepEqual(parsed.branches, ['dev'], 'package branch table is written');

		const byId = new Map(parsed.items.map((item) => [item.id, item]));
		t.is(byId.get('kn7w1')?.branch, null, 'main item keeps empty branch name');
		t.deepEqual(byId.get('kn7w1')?.branchItems, ['kn7w2'], 'main item points to branch variant item id');
		t.is(byId.get('kn7w2')?.branch, 'dev', 'branch item keeps branch name');
		t.deepEqual(byId.get('kn7w2')?.branchItems, [], 'branch item does not write nested branch variants');
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
