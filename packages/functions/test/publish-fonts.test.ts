import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'ava';
import sharpImplementation from 'sharp';
import { Document, ProjectType } from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';
import { getFixturePath } from '@openfairygui/test-utils';
import { publishNode } from '../src/node.js';
import type { AtlasRasterBackend } from '../src/index.js';

const sharp = sharpImplementation as typeof sharpImplementation & AtlasRasterBackend;

test('engine font references do not introduce a bitmap-font package dependency', async (t) => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-engine-font-'));
	t.teardown(() => fs.rm(directory, { recursive: true, force: true }));
	const doc = new Document(); doc.getRoot().setProjectType(ProjectType.Unity);
	const fonts = doc.createPackage('Fonts').setId('fontpkg1');
	fonts.addResource(doc.createFontResource('Engine Font').setId('font0001').setFileName('engine.ttf'));
	const pkg = doc.createPackage('Main').setId('mainpkg1');
	const component = doc.createComponent('Panel').setId('panel001').setExported(true);
	const text = doc.createGTextField('caption').setId('n1').setFont('ui://fontpkg1font0001');
	component.addChild(text); pkg.addResource(component);
	const result = await publishNode({ document: doc, packages: ['Main'], output: directory, plugins: [], codeGeneration: false });
	const binary = result.files.find((file) => file.path.endsWith('.bytes')); assert(binary);
	const current = (await new NodeIO().readBinary(binary.path)).getRoot().getPackage('Main')!;
	t.is(current.listDependencies().length, 0);
	t.is((current.getComponent('Panel')!.listChildren()[0] as typeof text).getFont(), 'Engine Font');
	t.is(text.getFont(), 'ui://fontpkg1font0001', 'publishing does not rewrite source text properties');
});

test('official Unity font pairs retain glyph textures and engine font names when republished', async (t) => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-font-pairs-'));
	t.teardown(() => fs.rm(directory, { recursive: true, force: true }));
	const io = new NodeIO();
	const doc = await io.readProject(getFixturePath('FairyGUI-unity', 'UIProject', 'FairyGUI-Unity-Examples.fairy'));
	for (const name of ['Basics', 'TextMeshPro']) {
		const published = await publishNode({
			document: doc, packages: [name], assetsPath: getFixturePath('FairyGUI-unity', 'UIProject', 'assets'),
			output: path.join(directory, name), encoder: sharp, plugins: [], codeGeneration: false,
		});
		const original = (await io.readBinary(getFixturePath('FairyGUI-unity', 'Assets', 'Examples', 'Resources', 'UI', `${name}_fui.bytes`))).getRoot().getPackage(name)!;
		const binary = published.files.find((file) => file.path.endsWith('.bytes'));
		assert(binary);
		const current = (await io.readBinary(binary.path)).getRoot().getPackage(name)!;
		if (name === 'Basics') {
			const glyphFont = current.getResourceById('duef6m');
			assert(glyphFont?.propertyType === 'FontResource');
			t.is(glyphFont.listGlyphs().length, 10);
			const sprites = new Set(current.listAtlases().flatMap((atlas) => atlas.listSprites().map((sprite) => sprite.getItemId())));
			for (const glyph of glyphFont.listGlyphs()) {
				t.truthy(original.getResourceById(glyph.getImg()));
				t.truthy(current.getResourceById(glyph.getImg()));
				t.true(sprites.has(glyph.getImg()));
			}
			t.true(sprites.has('wa8u2r'), 'BMFont texture is also addressable by font ID');
		} else {
			t.false(current.listResources().some((resource) => resource.propertyType === 'FontResource'));
			const fontValues = (pkg: typeof current) => pkg.getComponent('Main')!.listChildren()
				.filter((child) => ['GTextField', 'GRichTextField', 'GTextInput'].includes(child.propertyType))
				.map((child) => (child as ReturnType<typeof doc.createGTextField>).getFont());
			t.deepEqual(fontValues(current), fontValues(original));
			t.deepEqual(fontValues(current), Array(4).fill('LiberationSans SDF'));
		}
	}
});

test('bitmap font dependency selection uses each branch source before merge or packing', async (t) => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-branch-font-'));
	t.teardown(() => fs.rm(directory, { recursive: true, force: true }));
	const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#123456' } }).png().toBuffer();
	for (const branch of ['', 'en']) {
		const source = path.join(directory, `assets${branch ? `_${branch}` : ''}`, 'Main');
		await fs.mkdir(source, { recursive: true });
		await fs.writeFile(path.join(source, 'Digits.fnt'), `info creator=UIBuilder\ncommon lineHeight=2\nchar id=${branch ? 66 : 65} img=${branch ? 'glyphen1' : 'glyph001'} xadvance=${branch ? 22 : 11}\n`);
		await fs.writeFile(path.join(source, 'glyph.png'), png);
	}
	for (const merged of [false, true]) {
		const doc = new Document();
		doc.getRoot().setProjectType(ProjectType.Unity).setBranches(['en']).setSettings({ publish: { branchProcessing: merged ? 1 : 0 } });
		const pkg = doc.createPackage('Main').setId('fontpkg1').setBranchNames(['en']);
		for (const branch of ['', 'en']) {
			pkg.addResource(doc.createFontResource('Digits').setId(branch ? 'fonten01' : 'font0001')
				.setFileName('Digits.fnt').setPath('/').setBranch(branch).setExported(true));
			pkg.addResource(doc.createImageResource('glyph').setId(branch ? 'glyphen1' : 'glyph001')
				.setFileName('glyph.png').setPath('/').setBranch(branch).setWidth(2).setHeight(2));
		}
		const result = await publishNode({ document: doc, assetsPath: path.join(directory, 'assets'), output: path.join(directory, `release-${merged}`), branch: 'en', encoder: sharp, plugins: [], codeGeneration: false });
		const binary = result.files.find((file) => file.path.endsWith('.bytes')); assert(binary);
		const current = (await new NodeIO().readBinary(binary.path)).getRoot().getPackage('Main')!;
		const fonts = current.listResources().filter((resource) => resource.propertyType === 'FontResource');
		t.deepEqual(fonts.map((font) => [font.getId(), font.listGlyphs()[0]!.getCharId(), font.listGlyphs()[0]!.getAdvance()]),
			merged ? [['font0001', 66, 22]] : [['font0001', 65, 11], ['fonten01', 66, 22]]);
		for (const font of fonts) {
			const glyphId = font.listGlyphs()[0]!.getImg();
			t.truthy(current.getResourceById(glyphId), `glyph dependency ${glyphId} must be in the same published package`);
			t.true(current.listAtlases().some((atlas) => atlas.listSprites().some((sprite) => sprite.getItemId() === glyphId)));
		}
	}
});
