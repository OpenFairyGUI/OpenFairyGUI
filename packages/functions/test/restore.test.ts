import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Document, ProjectType, parseJta } from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';
import { getFixturePath, getFixtureProjectPath } from '@openfairygui/test-utils';
import test from 'ava';
import sharp from 'sharp';
import {
	atlas,
	type PublishFileSystem,
	publish,
	type RestoreFileSystem,
	type RestoreImageCropInput,
	type RestoreImageExtractInput,
	restore,
} from '../src/index.js';

const UNITY_RELEASE_DIR = getFixturePath('FairyGUI-unity', 'Assets', 'Examples', 'Resources', 'UI');
const EXPERIMENTS_FAIRY = getFixtureProjectPath('FairyGUI-Experiments');

function resourcePath(basePath: string, resourcePath: string, fileName: string): string {
	const subDir = resourcePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
	return subDir ? path.join(basePath, subDir, fileName) : path.join(basePath, fileName);
}

async function extractImage(input: RestoreImageExtractInput): Promise<Uint8Array> {
	let pipeline = sharp(input.sourcePath).extract({
		left: input.left,
		top: input.top,
		width: input.width,
		height: input.height,
	});
	if (input.rotated) pipeline = pipeline.rotate(90);
	const { data, info } = await pipeline.png().toBuffer({ resolveWithObject: true });
	const needsOriginalCanvas = input.expectedWidth > 0 && input.expectedHeight > 0 && (
		input.offsetX !== 0
		|| input.offsetY !== 0
		|| info.width !== input.expectedWidth
		|| info.height !== input.expectedHeight
	);
	if (needsOriginalCanvas) {
		return sharp({
			create: {
				width: input.expectedWidth,
				height: input.expectedHeight,
				channels: 4,
				background: { r: 0, g: 0, b: 0, alpha: 0 },
			},
		})
			.composite([{ input: data, left: input.offsetX, top: input.offsetY }])
			.png()
			.toBuffer();
	}
	return data;
}

async function cropImage(input: RestoreImageCropInput): Promise<void> {
	await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
	await fs.writeFile(input.outputPath, await extractImage(input));
}

function createRestoreFs(): RestoreFileSystem {
	return {
		async readFile(filePath: string): Promise<string> {
			return fs.readFile(filePath, 'utf-8');
		},
		async readFileRaw(filePath: string): Promise<Uint8Array> {
			const buf = await fs.readFile(filePath);
			return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
		},
		async writeFile(filePath: string, content: string): Promise<void> {
			await fs.mkdir(path.dirname(filePath), { recursive: true });
			await fs.writeFile(filePath, content, 'utf-8');
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
		async exists(filePath: string): Promise<boolean> {
			try {
				await fs.access(filePath);
				return true;
			} catch {
				return false;
			}
		},
		async isFile(filePath: string): Promise<boolean> {
			try {
				return (await fs.stat(filePath)).isFile();
			} catch {
				return false;
			}
		},
		async resolvePath(filePath: string): Promise<string> {
			try {
				return await fs.realpath(filePath);
			} catch {
				return path.resolve(filePath);
			}
		},
		async rm(targetPath: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
			await fs.rm(targetPath, { recursive: options?.recursive ?? false, force: options?.force ?? false });
		},
		async rename(from: string, to: string): Promise<void> {
			await fs.rename(from, to);
		},
		join(...paths: string[]): string {
			return path.join(...paths);
		},
		dirname(filePath: string): string {
			return path.dirname(filePath);
		},
	};
}

function createPublishFs(): PublishFileSystem {
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

async function copyReleaseFixture(sourceDir: string, outputDir: string): Promise<void> {
	await fs.mkdir(outputDir, { recursive: true });
	for (const entry of await fs.readdir(sourceDir, { withFileTypes: true })) {
		if (!entry.isFile() || entry.name.endsWith('.meta')) continue;
		await fs.copyFile(path.join(sourceDir, entry.name), path.join(outputDir, entry.name));
	}
}

async function createRestoreReleaseFixture(tmpDir: string): Promise<string> {
	const releaseDir = path.join(tmpDir, 'release');
	await copyReleaseFixture(UNITY_RELEASE_DIR, releaseDir);

	const io = new NodeIO();
	const doc = await io.readProject(EXPERIMENTS_FAIRY);
	await doc.transform(publish({
		output: releaseDir,
		packages: ['Branch', 'Loader'],
		fs: createPublishFs(),
		encoder: sharp,
		basePath: path.join(path.dirname(EXPERIMENTS_FAIRY), 'assets'),
	}));

	return releaseDir;
}

test('restore published project: directory batch restores packages, assets, and branch files', async (t) => {
	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-restore-'));
	const outputDir = path.join(tmpDir, 'Restored');

	try {
		const releaseDir = await createRestoreReleaseFixture(tmpDir);
		const result = await restore({
			inputDir: releaseDir,
			output: outputDir,
			fs: createRestoreFs(),
			packages: ['Basics', 'Branch', 'Joystick', 'Loader', 'TextMeshPro'],
			force: true,
			cropImage,
			extractImage,
		});

		t.is(result.projectPath, path.join(outputDir, 'Restored.fairy'));

		const doc = await io.readProject(result.projectPath);
		t.truthy(doc.getRoot().getPackage('Basics'), 'Basics package is restored');
		t.truthy(doc.getRoot().getPackage('Branch'), 'Branch package is restored');
		t.truthy(doc.getRoot().getPackage('Joystick'), 'Joystick package is restored');
		t.truthy(doc.getRoot().getPackage('Loader'), 'Loader package is restored');
		t.truthy(doc.getRoot().getPackage('TextMeshPro'), 'TextMeshPro package is restored');
		t.deepEqual(doc.getRoot().listBranches(), ['dev'], 'branch metadata survives restore');

		const basics = doc.getRoot().getPackage('Basics')!;
		const change = basics.getResourceById('es4130') as ReturnType<typeof doc.createImageResource>;
		t.truthy(change, 'rotated image resource exists');
		t.is(change.getFileName(), 'change.png');
		const changeMeta = await sharp(resourcePath(path.join(outputDir, 'assets', 'Basics'), change.getPath(), change.getFileName())).metadata();
		t.is(changeMeta.width, change.getWidth(), 'rotated sprite output width matches resource width');
		t.is(changeMeta.height, change.getHeight(), 'rotated sprite output height matches resource height');

		const sound = basics.getResourceById('gojg7u') as ReturnType<typeof doc.createSoundResource>;
		const soundPath = resourcePath(path.join(outputDir, 'assets', 'Basics'), sound.getPath(), sound.getFile());
		t.truthy(await fs.stat(soundPath).catch(() => null), 'sound file is copied without publish prefix');
		const basicsPackageXml = await fs.readFile(path.join(outputDir, 'assets', 'Basics', 'package.xml'), 'utf-8');
		t.true(basicsPackageXml.includes('name="tabswitch.wav"'), 'package.xml references restored editor-facing sound file name');
		t.true(basicsPackageXml.includes('exported="true"'), 'package.xml writes explicit true boolean attributes');
		t.true(basicsPackageXml.includes('id="rpmb7" name="b1.png.png" path="/images/"'), 'dotted image resource names are restored by appending png to the resource name');
		t.false(basicsPackageXml.includes('id="es4130" name="change.png" path="/images/" width='), 'restored package.xml omits inferred image width');
		t.false(basicsPackageXml.includes('id="es4130" name="change.png" path="/images/" height='), 'restored package.xml omits inferred image height');
		t.true(basicsPackageXml.includes('<publish name="Basics">'), 'package.xml keeps publish block');
		t.true(basicsPackageXml.includes('<atlas name="Default" index="0"'), 'package.xml keeps default atlas publish entry');
		t.true(basicsPackageXml.includes('name="nlge1k.jta"'), 'movieclip package resource keeps .jta file name');
		t.true(basicsPackageXml.includes('name="BMFontTest.fnt"'), 'font package resource keeps .fnt file name');
		t.true(basicsPackageXml.includes('id="wa8u2r" name="BMFontTest.fnt" path="/font/" exported="true" texture="jb800"'), 'ttf bitmap font restores package texture reference');
		t.true(
			basicsPackageXml.indexOf('id="rpmbz"') < basicsPackageXml.indexOf('id="rpmb10"'),
			'package.xml resource order follows editor-like id sequence instead of read order',
		);
		t.true(basicsPackageXml.includes('id="duef6n" name="h0.png"'), 'digit font glyph resources use readable synthesized file names');
		const hitNumberFnt = await fs.readFile(path.join(outputDir, 'assets', 'Basics', 'font', 'HitNumber.fnt'), 'utf-8');
		t.true(hitNumberFnt.includes('char id=48 img=duef6n xoffset=0 yoffset=0 xadvance=33'), 'bitmap font file is regenerated from published glyphs');
		const bmFontTestFnt = await fs.readFile(path.join(outputDir, 'assets', 'Basics', 'font', 'BMFontTest.fnt'), 'utf-8');
		t.true(bmFontTestFnt.includes('info face="BMFontTest" size=32'), 'ttf-backed font file writes BMFont-style info header');
		t.true(bmFontTestFnt.includes('page id=0 file="BMFontTest_atlas.png"'), 'ttf-backed font file writes texture page header');
		t.true(bmFontTestFnt.includes('char id=35 x=22 y=37 width=15 height=20 xoffset=0 yoffset=6 xadvance=14 page=0 chnl=15'), 'ttf-backed font file is regenerated from published glyph metrics');
		const movieClipJta = parseJta(await fs.readFile(path.join(outputDir, 'assets', 'Basics', 'images', 'nlge1k.jta')));
		t.is(movieClipJta.version, 102, 'movieclip jta version is regenerated');
		t.is(movieClipJta.speed, 3, 'movieclip jta speed is restored from interval');
		t.is(movieClipJta.frames.length, 15, 'movieclip jta frame count is restored');
		t.is(movieClipJta.textures.length, 15, 'movieclip jta frame textures are embedded');
		const basicsDemoImageXml = await fs.readFile(path.join(outputDir, 'assets', 'Basics', 'Demo_Image.xml'), 'utf-8');
		t.false(/<image\b[^>]*\bfileName=/.test(basicsDemoImageXml), 'restored image instances omit fileName attrs');
		const basicsDemoControllerXml = await fs.readFile(path.join(outputDir, 'assets', 'Basics', 'Demo_Controller.xml'), 'utf-8');
		t.true(basicsDemoControllerXml.includes('fileName="components/Button4.xml"'), 'restored component instances backfill editor fileName attrs from package resources');
		t.true(basicsDemoControllerXml.includes('fileName="images/nlge1k.jta"'), 'restored movieclip instances backfill editor fileName attrs from package resources');
		t.true(basicsDemoControllerXml.includes('<gearLook controller="c1" pages="1" values="0.54,180,0,0" default="1,0,0,0"'), 'restored Demo_Controller writes compact numeric gearLook payloads');
		t.true(basicsDemoControllerXml.includes('<gearColor controller="c1" pages="1" values="#66ff99" default="#ffffff"'), 'restored Demo_Controller compacts non-text gearColor payloads');
		const basicsButton16Xml = await fs.readFile(path.join(outputDir, 'assets', 'Basics', 'components', 'Button16.xml'), 'utf-8');
		t.true(basicsButton16Xml.includes('<gearLook controller="button" pages="0,1,2,3" values="-|1,180,0|-|1,180,0" default="1,0,0"'), 'restored Button16 omits trailing touchable=true in gearLook payloads');
		const basicsButton5Xml = await fs.readFile(path.join(outputDir, 'assets', 'Basics', 'components', 'Button5.xml'), 'utf-8');
		t.true(/<Button\b[^>]*downEffectValue="0\.80"/.test(basicsButton5Xml), 'restored Button5 keeps explicit default downEffectValue when button downEffect is enabled');
		const basicsButton6Xml = await fs.readFile(path.join(outputDir, 'assets', 'Basics', 'components', 'Button6.xml'), 'utf-8');
		t.true(basicsButton6Xml.includes('<gearColor controller="button" pages="0,1,2,3" values="#ffffff|-|#ffffff|-" default="#dfb536"'), 'restored Button6 compacts title text gearColor outline payloads');
		const basicsComboBoxItemXml = await fs.readFile(path.join(outputDir, 'assets', 'Basics', 'components', 'ComboBoxItem.xml'), 'utf-8');
		t.true(basicsComboBoxItemXml.includes('<gearColor controller="button" pages="0,1,2,3" values="-|#ffffff|#ffffff|#ffffff" default="#000000"'), 'restored ComboBoxItem compacts title text gearColor outline payloads');
		const basicsButton52Xml = await fs.readFile(path.join(outputDir, 'assets', 'Basics', 'components', 'Button52.xml'), 'utf-8');
		t.true(basicsButton52Xml.includes('<gearLook controller="grayed" pages="0,1" values="1.00,0,0|-" default="1.00,0,1"'), 'restored Button52 keeps editor-style fixed alpha precision in gearLook');
		const bagOutputDir = path.join(outputDir, 'BagPack');
		await restore({
			inputDir: releaseDir,
			output: bagOutputDir,
			fs: createRestoreFs(),
			packages: ['Bag'],
			force: true,
			cropImage,
			extractImage,
		});
		const bagCloseButtonXml = await fs.readFile(path.join(bagOutputDir, 'assets', 'Bag', 'CloseButton.xml'), 'utf-8');
		t.true(bagCloseButtonXml.includes('<gearSize controller="button" pages="0,1,2,3" values="61,53|-|61,53|-" default="55,47"'), 'restored CloseButton omits redundant identity scale payloads in non-tween gearSize');
		t.true(/<image\b[^>]*id="n1"[^>]*xy="0,0"/.test(bagCloseButtonXml), 'restored CloseButton keeps explicit zero xy attrs on image tags');
		const bagWinXml = await fs.readFile(path.join(bagOutputDir, 'assets', 'Bag', 'BagWin.xml'), 'utf-8');
		t.true(
			/<list\b[^>]*id="n8"[^>]*autoItemSize="false"/.test(bagWinXml),
			'restored Bag/BagWin keeps explicit autoItemSize=false on the paginated item list',
		);
		t.true(
			/<list\b[^>]*id="n25_osdo"[^>]*selectionController="page"/.test(bagWinXml),
			'restored Bag/BagWin keeps the page-linked indicator list selectionController',
		);
		t.true(
			/<list\b[^>]*id="n25_osdo"[^>]*\balign="center"/.test(bagWinXml),
			'restored Bag/BagWin keeps explicit center alignment on the page-linked indicator list',
		);
		const basicsDemoListXml = await fs.readFile(path.join(outputDir, 'assets', 'Basics', 'Demo_List.xml'), 'utf-8');
		t.false(basicsDemoListXml.includes('layout="singleColumn"'), 'default single-column list omits layout attr');
		t.true(basicsDemoListXml.includes('layout="row"'), 'single-row list uses editor layout token');
		t.true(basicsDemoListXml.includes('layout="flow_hz"'), 'flow-horizontal list uses editor layout token');
		t.true(basicsDemoListXml.includes('layout="flow_vt"'), 'flow-vertical list uses editor layout token');
		const basicsDemoTextXml = await fs.readFile(path.join(outputDir, 'assets', 'Basics', 'Demo_Text.xml'), 'utf-8');
		t.true(/<text\b[^>]*id="n2"[^>]*color="#cc3300"/.test(basicsDemoTextXml), 'restored Basics/Demo_Text lowercases text color attrs');
		t.true(/<inputtext\b[^>]*id="n22"[^>]*text=""/.test(basicsDemoTextXml), 'restored Basics/Demo_Text keeps explicit empty input text');
		t.true(/<text\b[^>]*id="n24"[^>]*text=""/.test(basicsDemoTextXml), 'restored Basics/Demo_Text keeps explicit empty text attrs');
		t.true(/id="n5"[^>]*text="Support UBB grammer：&#xA;/.test(basicsDemoTextXml), 'restored Basics/Demo_Text escapes newline characters inside text attrs');
		t.true(/id="n12"[^>]*&lt;img src=&apos;ui:\/\/9leh0eyfrpmb6&apos;\/&gt;/.test(basicsDemoTextXml), 'restored Basics/Demo_Text escapes apostrophes and angle brackets inside richtext attrs');
		t.true(/<image\b[^>]*id="n7"[^>]*flip="hz"/.test(basicsDemoImageXml), 'restored Basics/Demo_Image writes editor flip token for horizontal mirror');
		t.true(/<image\b[^>]*id="n8"[^>]*alpha="0.62"/.test(basicsDemoImageXml), 'restored Basics/Demo_Image trims alpha float noise');
		t.true(/<image\b[^>]*id="n8"[^>]*flip="vt"/.test(basicsDemoImageXml), 'restored Basics/Demo_Image writes editor flip token for vertical mirror');
		t.true(/<image\b[^>]*id="n17"[^>]*flip="both"/.test(basicsDemoImageXml), 'restored Basics/Demo_Image writes editor flip token for dual mirror');
		const basicsDemoComponentXml = await fs.readFile(path.join(outputDir, 'assets', 'Basics', 'Demo_Component.xml'), 'utf-8');
		t.false(basicsDemoComponentXml.includes('scroll="vertical"'), 'restored Basics/Demo_Component omits default vertical component scroll attr');

		const branchFacePath = path.join(outputDir, 'assets_dev', 'Branch', 'face.png');
		t.truthy(await fs.stat(branchFacePath).catch(() => null), 'branch image is cropped into assets_dev');
		const branchPackageXml = await fs.readFile(path.join(outputDir, 'assets_dev', 'Branch', 'package_branch.xml'), 'utf-8');
		t.true(branchPackageXml.includes('id="kn7w2"'), 'branch package xml references branch image resource');

		const joystick1Meta = await sharp(path.join(outputDir, 'assets', 'Joystick', 'images', '1.png')).metadata();
		t.is(joystick1Meta.width, 178, 'trimmed Joystick image is restored to original width');
		t.is(joystick1Meta.height, 160, 'trimmed Joystick image is restored to original height');

		const loaderPackageXml = await fs.readFile(path.join(outputDir, 'assets', 'Loader', 'package.xml'), 'utf-8');
		t.true(loaderPackageXml.includes('name="alien-pma.atlas"'), 'Unity atlas text extension is restored to project file name');
		t.true(loaderPackageXml.includes('name="alien-pma.png"'), 'Unity spine texture image is synthesized back into package.xml');
		t.true(loaderPackageXml.includes('name="alien-pro.skel"'), 'Unity skeleton binary extension is restored to project file name');
		t.true(/<spine\b[^>]*id="nbcge"[^>]*require="[^"]+,[^"]+"/.test(loaderPackageXml), 'Spine resource dependency ids are synthesized for restored sidecar resources');
		t.true(loaderPackageXml.includes('atlasNames="alien-pma"'), 'Spine atlas name is restored');
		t.truthy(await fs.stat(path.join(outputDir, 'assets', 'Loader', 'images', 'alien-pma.atlas')).catch(() => null), 'normalized atlas file is copied');
		t.truthy(await fs.stat(path.join(outputDir, 'assets', 'Loader', 'images', 'alien-pma.png')).catch(() => null), 'spine texture image is copied as loose image resource');
		t.truthy(await fs.stat(path.join(outputDir, 'assets', 'Loader', 'images', 'alien-pro.skel')).catch(() => null), 'normalized skeleton file is copied');

		const textMeshProPackageXml = await fs.readFile(path.join(outputDir, 'assets', 'TextMeshPro', 'package.xml'), 'utf-8');
		t.true(textMeshProPackageXml.includes('renderMode="sdfaa"'), 'SDF font render mode is restored from published font name');
		t.true(textMeshProPackageXml.includes('samplePointSize="60"'), 'SDF font sample point size is restored from published font name');

		const transitionOutputDir = path.join(outputDir, 'TransitionPack');
		const transitionResult = await restore({
			inputDir: releaseDir,
			output: transitionOutputDir,
			fs: createRestoreFs(),
			packages: ['Transition'],
			force: true,
			cropImage,
			extractImage,
		});
		const transitionDoc = await io.readProject(transitionResult.projectPath);
		const transitionPkg = transitionDoc.getRoot().getPackage('Transition')!;
		t.truthy(transitionPkg.getResourceById('nra4g'), 'font-derived image resource is synthesized into package.xml');
		t.truthy(transitionPkg.getResourceById('fou917'), 'additional font-derived image resource is synthesized into package.xml');
		const transitionPackageXml = await fs.readFile(path.join(transitionOutputDir, 'assets', 'Transition', 'package.xml'), 'utf-8');
		t.true(transitionPackageXml.includes('id="nra4g"'), 'transition package.xml includes derived glyph image resource ids');
		t.true(transitionPackageXml.includes('id="fou917"'), 'transition package.xml includes root-path derived glyph image resource ids');
		t.true(
			transitionPackageXml.includes('id="nra4g" name="0000_9_png.png"'),
			'transition digit glyph resources restore editor-facing numbered glyph file names',
		);
		t.true(
			transitionPackageXml.includes('id="fou917" name="h0.png"'),
			'transition hit-number glyph resources use h-prefixed synthesized file names',
		);
		t.true(
			transitionPackageXml.includes('id="fou917" name="h0.png" path="/"'),
			'transition number3 glyph resources restore root virtual path',
		);
		t.truthy(await fs.stat(path.join(transitionOutputDir, 'assets', 'Transition', 'images', '0000_9_png.png')).catch(() => null), 'derived glyph placeholder image is written with editor-facing file name');
		t.truthy(await fs.stat(path.join(transitionOutputDir, 'assets', 'Transition', 'h0.png')).catch(() => null), 'root font glyph placeholder image is written at root virtual path');
		const powerUpXml = await fs.readFile(path.join(transitionOutputDir, 'assets', 'Transition', 'PowerUp.xml'), 'utf-8');
		t.true(powerUpXml.includes('<jta id="n5"'), 'restored Transition/PowerUp writes movie clips with jta display tags');
		t.false(/<jta\b[^>]*color="#ffffff"/.test(powerUpXml), 'restored Transition/PowerUp omits default white jta color');
		t.true(powerUpXml.includes('<item time="0" type="Alpha" value="1.00"/>'), 'restored Transition/PowerUp keeps non-tween alpha as value attr');
		t.true(powerUpXml.includes('<item time="0" type="XY" value="0,0"/>'), 'restored Transition/PowerUp keeps non-tween XY as value attr');
		const goodHitXml = await fs.readFile(path.join(transitionOutputDir, 'assets', 'Transition', 'GoodHit.xml'), 'utf-8');
		t.true(goodHitXml.includes('duration="7"'), 'restored Transition/GoodHit rounds transition duration float noise to frame integers');
		t.true(goodHitXml.includes('<item time="7" type="Shake" value="3,0.5"/>'), 'restored Transition/GoodHit rounds transition time float noise to frame integers');

		const emitNumbersOutputDir = path.join(outputDir, 'EmitNumbersPack');
		const emitNumbersResult = await restore({
			inputDir: releaseDir,
			output: emitNumbersOutputDir,
			fs: createRestoreFs(),
			packages: ['EmitNumbers'],
			force: true,
			cropImage,
			extractImage,
		});
		const emitNumbersDoc = await io.readProject(emitNumbersResult.projectPath);
		const emitNumbersPkg = emitNumbersDoc.getRoot().getPackage('EmitNumbers')!;
		t.truthy(emitNumbersPkg.getResourceById('mulj1'), 'EmitNumbers font glyph image resources are synthesized');
		const emitNumbersPackageXml = await fs.readFile(path.join(emitNumbersOutputDir, 'assets', 'EmitNumbers', 'package.xml'), 'utf-8');
		t.true(
			emitNumbersPackageXml.includes('id="mulj1" name="0(2)5_png.png" path="/"'),
			'EmitNumbers number1 glyph resources restore root-path editor file names',
		);
		t.true(
			emitNumbersPackageXml.includes('id="muljd" name="0(4)_png.png" path="/"'),
			'EmitNumbers number2 glyph resources restore alternate root-path editor file names',
		);
		t.truthy(await fs.stat(path.join(emitNumbersOutputDir, 'assets', 'EmitNumbers', '0(2)5_png.png')).catch(() => null), 'EmitNumbers glyph placeholder image is written at package root');

		const loaderMainXml = await fs.readFile(path.join(outputDir, 'assets', 'Loader', 'Main.xml'), 'utf-8');
		t.false(/<loader3d\b[^>]*\balign=/.test(loaderMainXml), 'restored Loader/Main omits default loader3D align attrs');
		t.false(/<loader3d\b[^>]*\bvAlign=/.test(loaderMainXml), 'restored Loader/Main omits default loader3D vAlign attrs');

		const treeViewOutputDir = path.join(outputDir, 'TreeViewPack');
		await restore({
			inputDir: releaseDir,
			output: treeViewOutputDir,
			fs: createRestoreFs(),
			packages: ['TreeView'],
			force: true,
			cropImage,
			extractImage,
		});
		const treeViewMainXml = await fs.readFile(path.join(treeViewOutputDir, 'assets', 'TreeView', 'Main.xml'), 'utf-8');
		t.true(
			treeViewMainXml.includes('<item title="Folder 1" level="0" isFolder="true"/>'),
			'restored TreeView/Main preserves inferred folder state',
		);
		t.regex(
			treeViewMainXml,
			/<item title="Leaf 1"[^>]* level="1" isFolder="false"\/>/,
			'restored TreeView/Main preserves inferred leaf state',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('restore published project: ignores directory entries that look like binary packages', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-restore-direntry-'));
	const releaseDir = path.join(tmpDir, 'release');
	const outputDir = path.join(tmpDir, 'Restored');

	try {
		await fs.mkdir(releaseDir, { recursive: true });
		await fs.copyFile(path.join(UNITY_RELEASE_DIR, 'Basics_fui.bytes'), path.join(releaseDir, 'Basics_fui.bytes'));
		await fs.mkdir(path.join(releaseDir, 'Fake.bin'), { recursive: true });

		const result = await restore({
			inputDir: releaseDir,
			output: outputDir,
			fs: createRestoreFs(),
			force: true,
		});

		t.truthy(result.document.getRoot().getPackage('Basics'), 'restore keeps actual binary packages');
		t.falsy(result.document.getRoot().getPackage('Fake'), 'restore ignores directories whose names look like published package files');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('restore published project: ignores loose-resource directories and falls back to later file candidates', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-restore-loose-'));
	const releaseDir = path.join(tmpDir, 'release');
	const outputDir = path.join(tmpDir, 'Restored');

	try {
		await fs.mkdir(releaseDir, { recursive: true });
		await fs.copyFile(path.join(UNITY_RELEASE_DIR, 'Basics_fui.bytes'), path.join(releaseDir, 'Basics_fui.bytes'));
		await fs.mkdir(path.join(releaseDir, 'Basics_gojg7u.wav'), { recursive: true });

		const result = await restore({
			inputDir: releaseDir,
			output: outputDir,
			fs: createRestoreFs(),
			packages: ['Basics'],
			force: true,
		});

		t.truthy(result.document.getRoot().getPackage('Basics'), 'restore still completes when a loose-resource candidate is a directory');
		t.true(
			result.warnings.some((warning) => warning.includes('tabswitch.wav')),
			'restore treats directory-shaped loose-resource candidates as missing files instead of reading them',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('restore published project: non-empty output directory fails without force', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-restore-nonempty-'));
	const outputDir = path.join(tmpDir, 'Restored');

	try {
		await fs.mkdir(outputDir, { recursive: true });
		await fs.writeFile(path.join(outputDir, 'keep.txt'), 'do not overwrite', 'utf-8');

		await t.throwsAsync(
			() => restore({
				inputDir: UNITY_RELEASE_DIR,
				output: outputDir,
				fs: createRestoreFs(),
				packages: ['Basics'],
				cropImage,
				extractImage,
			}),
			{ message: /not empty/ },
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('restore published project: force keeps an existing output when binary discovery fails', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-restore-preflight-'));
	const releaseDir = path.join(tmpDir, 'release');
	const outputDir = path.join(tmpDir, 'Restored');

	try {
		await fs.mkdir(releaseDir, { recursive: true });
		await fs.mkdir(outputDir, { recursive: true });
		await fs.writeFile(path.join(outputDir, 'keep.txt'), 'do not overwrite', 'utf-8');

		await t.throwsAsync(
			() => restore({
				inputDir: releaseDir,
				output: outputDir,
				fs: createRestoreFs(),
				force: true,
			}),
			{ message: /No FairyGUI published binary files/ },
		);
		t.is(await fs.readFile(path.join(outputDir, 'keep.txt'), 'utf-8'), 'do not overwrite');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('restore published project: force replaces a complete staged project only after success', async (t) => {
	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-restore-swap-'));
	const releaseDir = path.join(tmpDir, 'release');
	const outputDir = path.join(tmpDir, 'Restored');

	try {
		const doc = new Document();
		const pkg = doc.createPackage('SwapPkg');
		pkg.setId('swap0001').setPublishName('SwapPkg');
		await fs.mkdir(releaseDir, { recursive: true });
		await io.writeBinary(doc, path.join(releaseDir, 'SwapPkg_fui.bytes'));
		await fs.mkdir(outputDir, { recursive: true });
		await fs.writeFile(path.join(outputDir, 'keep.txt'), 'replace after success', 'utf-8');

		const result = await restore({
			inputDir: releaseDir,
			output: outputDir,
			fs: createRestoreFs(),
			force: true,
		});

		t.is(result.projectPath, path.join(outputDir, 'Restored.fairy'));
		await t.throwsAsync(() => fs.stat(path.join(outputDir, 'keep.txt')), { code: 'ENOENT' });
		t.truthy(await fs.stat(result.projectPath), 'completed restore replaces the previous project directory');
		const siblingEntries = await fs.readdir(tmpDir);
		t.false(siblingEntries.some((entry) => entry.startsWith('.Restored.restore-')), 'successful restore cleans its staging and backup directories');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('restore published project: unsafe resource paths fail before force replacement', async (t) => {
	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-restore-path-'));
	const releaseDir = path.join(tmpDir, 'release');
	const outputDir = path.join(tmpDir, 'Restored');

	try {
		const doc = new Document();
		const pkg = doc.createPackage('UnsafePathPkg');
		pkg.setId('unsafe01').setPublishName('UnsafePathPkg');
		const image = doc.createImageResource('hero');
		image
			.setId('img001')
			.setPath('../outside')
			.setFileName('hero.png')
			.setWidth(1)
			.setHeight(1)
			.setExported(true);
		pkg.addResource(image);

		await fs.mkdir(releaseDir, { recursive: true });
		await io.writeBinary(doc, path.join(releaseDir, 'UnsafePathPkg_fui.bytes'));
		await fs.mkdir(outputDir, { recursive: true });
		await fs.writeFile(path.join(outputDir, 'keep.txt'), 'do not overwrite', 'utf-8');

		await t.throwsAsync(
			() => restore({
				inputDir: releaseDir,
				output: outputDir,
				fs: createRestoreFs(),
				force: true,
			}),
			{ message: /Invalid resource path/ },
		);
		t.is(await fs.readFile(path.join(outputDir, 'keep.txt'), 'utf-8'), 'do not overwrite');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('restore published project: source files resolved outside the input are rejected', async (t) => {
	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-restore-source-escape-'));
	const releaseDir = path.join(tmpDir, 'release');
	const outputDir = path.join(tmpDir, 'Restored');

	try {
		const doc = new Document();
		const pkg = doc.createPackage('SourceEscapePkg');
		pkg.setId('source001').setPublishName('SourceEscapePkg');
		const sound = doc.createSoundResource('alert');
		sound.setId('snd001').setPath('/sound/').setFile('alert.wav').setExported(true);
		pkg.addResource(sound);

		await fs.mkdir(releaseDir, { recursive: true });
		await io.writeBinary(doc, path.join(releaseDir, 'SourceEscapePkg_fui.bytes'));
		await fs.writeFile(path.join(releaseDir, 'SourceEscapePkg_snd001.wav'), new Uint8Array([0x01]));
		await fs.writeFile(path.join(releaseDir, 'SourceEscapePkg_alert.wav'), new Uint8Array([0x01]));
		await fs.writeFile(path.join(releaseDir, 'alert.wav'), new Uint8Array([0x01]));
		await fs.mkdir(outputDir, { recursive: true });
		await fs.writeFile(path.join(outputDir, 'keep.txt'), 'do not overwrite', 'utf-8');

		const restoreFs = createRestoreFs();
		const resolvePath = restoreFs.resolvePath.bind(restoreFs);
		restoreFs.resolvePath = async (filePath) => filePath.endsWith('.wav')
			? path.join(tmpDir, 'outside.wav')
			: resolvePath(filePath);

		await t.throwsAsync(
			() => restore({
				inputDir: releaseDir,
				output: outputDir,
				fs: restoreFs,
				force: true,
			}),
			{ message: /resolves outside the input directory/ },
		);
		t.is(await fs.readFile(path.join(outputDir, 'keep.txt'), 'utf-8'), 'do not overwrite');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('restore published project: failed asset reconstruction keeps the previous output intact', async (t) => {
	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-restore-stage-'));
	const releaseDir = path.join(tmpDir, 'release');
	const outputDir = path.join(tmpDir, 'Restored');

	try {
		const doc = new Document();
		const pkg = doc.createPackage('StagePkg');
		pkg.setId('stage001').setPublishName('StagePkg');
		const image = doc.createImageResource('hero');
		image.setId('img001').setWidth(1).setHeight(1).setExported(true);
		pkg.addResource(image);
		await doc.transform(atlas({ maxSize: 16 }));

		await fs.mkdir(releaseDir, { recursive: true });
		await io.writeBinary(doc, path.join(releaseDir, 'StagePkg_fui.bytes'));
		t.true((await fs.readdir(releaseDir)).includes('StagePkg_fui.bytes'), 'test setup writes the published binary');
		const atlasFile = pkg.listAtlases()[0]?.getFile();
		if (!atlasFile) throw new Error('test setup did not create an atlas');
		const publishedAtlasFile = atlasFile.endsWith('.png') ? atlasFile : `${atlasFile}.png`;
		await fs.writeFile(path.join(releaseDir, publishedAtlasFile), new Uint8Array([0x00]));
		await fs.mkdir(outputDir, { recursive: true });
		await fs.writeFile(path.join(outputDir, 'keep.txt'), 'do not overwrite', 'utf-8');
		const restoreFs = createRestoreFs();
		t.true((await restoreFs.readdir(releaseDir)).includes('StagePkg_fui.bytes'), 'restore filesystem sees the published binary');
		t.true(await restoreFs.isFile(path.join(releaseDir, 'StagePkg_fui.bytes')), 'restore filesystem treats the published binary as a file');

		await t.throwsAsync(
			() => restore({
				inputDir: releaseDir,
				output: outputDir,
				fs: restoreFs,
				packages: ['StagePkg'],
				force: true,
				cropImage: async () => {
					throw new Error('intentional crop failure');
				},
			}),
			{ message: /intentional crop failure/ },
		);
		t.is(await fs.readFile(path.join(outputDir, 'keep.txt'), 'utf-8'), 'do not overwrite');
		const siblingEntries = await fs.readdir(tmpDir);
		t.false(siblingEntries.some((entry) => entry.startsWith('.Restored.restore-')), 'failed staging output is removed');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('restore published project: equivalent source and output paths are rejected before overwrite', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-restore-samepath-'));
	const releaseDir = path.join(tmpDir, 'release');

	try {
		await fs.mkdir(releaseDir, { recursive: true });
		await fs.copyFile(path.join(UNITY_RELEASE_DIR, 'Basics_fui.bytes'), path.join(releaseDir, 'Basics_fui.bytes'));

		await t.throwsAsync(
			() => restore({
				inputDir: `${releaseDir}${path.sep}.`,
				output: releaseDir,
				fs: createRestoreFs(),
				force: true,
			}),
			{ message: /must be independent/ },
		);
		t.truthy(
			await fs.stat(path.join(releaseDir, 'Basics_fui.bytes')).catch(() => null),
			'restore keeps the published source directory intact when source and output spellings are equivalent',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('restore published project: case-variant equivalent paths are rejected before overwrite', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-restore-casepath-'));
	const releaseDir = path.join(tmpDir, 'release');

	try {
		await fs.mkdir(releaseDir, { recursive: true });
		await fs.copyFile(path.join(UNITY_RELEASE_DIR, 'Basics_fui.bytes'), path.join(releaseDir, 'Basics_fui.bytes'));

		await t.throwsAsync(
			() => restore({
				inputDir: releaseDir.toUpperCase(),
				output: releaseDir,
				fs: createRestoreFs(),
				force: true,
			}),
			{ message: /must be independent/ },
		);
		t.truthy(
			await fs.stat(path.join(releaseDir, 'Basics_fui.bytes')).catch(() => null),
			'restore keeps the published source directory intact when source and output differ only by path casing',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test.serial('restore published project: mixed relative and absolute aliases are rejected before overwrite', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-restore-mixedpath-'));
	const releaseDir = path.join(tmpDir, 'release');
	const previousCwd = process.cwd();

	try {
		await fs.mkdir(releaseDir, { recursive: true });
		await fs.copyFile(path.join(UNITY_RELEASE_DIR, 'Basics_fui.bytes'), path.join(releaseDir, 'Basics_fui.bytes'));
		process.chdir(tmpDir);

		await t.throwsAsync(
			() => restore({
				inputDir: 'release',
				output: path.resolve('release'),
				fs: createRestoreFs(),
				force: true,
			}),
			{ message: /must be independent/ },
		);
		t.truthy(
			await fs.stat(path.join(releaseDir, 'Basics_fui.bytes')).catch(() => null),
			'restore keeps the published source directory intact when relative and absolute paths alias the same directory',
		);
	} finally {
		process.chdir(previousCwd);
		await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
	}
});

test('restore published project: filesystem alias paths are rejected before overwrite', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-restore-realpath-'));
	const releaseDir = path.join(tmpDir, 'release');
	const aliasDir = path.join(tmpDir, 'release-link');

	try {
		await fs.mkdir(releaseDir, { recursive: true });
		await fs.copyFile(path.join(UNITY_RELEASE_DIR, 'Basics_fui.bytes'), path.join(releaseDir, 'Basics_fui.bytes'));
		await fs.symlink(releaseDir, aliasDir, process.platform === 'win32' ? 'junction' : 'dir');

		await t.throwsAsync(
			() => restore({
				inputDir: aliasDir,
				output: releaseDir,
				fs: createRestoreFs(),
				force: true,
			}),
			{ message: /must be independent/ },
		);
		t.truthy(
			await fs.stat(path.join(releaseDir, 'Basics_fui.bytes')).catch(() => null),
			'restore keeps the published source directory intact when output aliases the same directory through the filesystem',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
	}
});

test('restore published project: dotted image and sound resource names restore by appending the runtime suffix', async (t) => {
	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-restore-dotted-'));
	const releaseDir = path.join(tmpDir, 'release');
	const outputDir = path.join(tmpDir, 'Restored');
	const binaryPath = path.join(releaseDir, 'DottedNamesPkg_fui.bytes');

	try {
		const doc = new Document();
		const pkg = doc.createPackage('DottedNamesPkg');
		pkg.setId('dotted001');
		pkg.setPublishName('DottedNamesPkg');

		const imageRes = doc.createImageResource('hero.png');
		imageRes
			.setId('img001')
			.setPath('/images/')
			.setFileName('hero.png.jpg')
			.setWidth(64)
			.setHeight(32)
			.setExported(true);
		pkg.addResource(imageRes);

		const soundRes = doc.createSoundResource('voice.wav');
		soundRes
			.setId('snd001')
			.setPath('/sound/')
			.setFile('voice.wav.mp3')
			.setExported(true);
		pkg.addResource(soundRes);

		await fs.mkdir(releaseDir, { recursive: true });
		await io.writeBinary(doc, binaryPath);
		await fs.writeFile(path.join(releaseDir, 'DottedNamesPkg_snd001.mp3'), new Uint8Array([0x01, 0x02, 0x03]));

		const result = await restore({
			inputDir: releaseDir,
			output: outputDir,
			fs: createRestoreFs(),
			force: true,
		});

		const restoredDoc = await io.readProject(result.projectPath);
		const restoredPkg = restoredDoc.getRoot().getPackage('DottedNamesPkg')!;
		const restoredImage = restoredPkg.getResourceById('img001') as ReturnType<Document['createImageResource']>;
		const restoredSound = restoredPkg.getResourceById('snd001') as ReturnType<Document['createSoundResource']>;

		t.is(restoredImage.getFileName(), 'hero.png.png', 'restore treats dotted image item names as resource names and always appends png');
		t.is(restoredSound.getFile(), 'voice.wav.mp3', 'restore treats dotted sound item names as resource names and appends the published sound suffix');

		const packageXml = await fs.readFile(path.join(outputDir, 'assets', 'DottedNamesPkg', 'package.xml'), 'utf-8');
		t.true(packageXml.includes('id="img001" name="hero.png.png" path="/images/"'), 'restored package.xml keeps the appended png image file name');
		t.true(packageXml.includes('id="snd001" name="voice.wav.mp3" path="/sound/"'), 'restored package.xml keeps the appended sound file name');
		t.truthy(
			await fs.stat(path.join(outputDir, 'assets', 'DottedNamesPkg', 'sound', 'voice.wav.mp3')).catch(() => null),
			'restore copies the sound file using the restored editor-facing file name',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
	}
});

test('restore published project: cross-package refs resolve against other restored binaries in the same directory', async (t) => {
	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-restore-crosspkg-'));
	const releaseDir = path.join(tmpDir, 'release');
	const outputDir = path.join(tmpDir, 'Restored');

	try {
		const doc = new Document();
		const hostPkg = doc.createPackage('HostPkg');
		hostPkg.setId('hostpkg01');
		hostPkg.setPublishName('HostPkg');

		const sharedPkg = doc.createPackage('SharedPkg');
		sharedPkg.setId('shared01');
		sharedPkg.setPublishName('SharedPkg');

		const sharedImage = doc.createImageResource('SharedImage');
		sharedImage
			.setId('imgB')
			.setPath('/images/')
			.setFileName('SharedImage.png')
			.setWidth(32)
			.setHeight(24)
			.setExported(true);
		sharedPkg.addResource(sharedImage);

		const sharedComponent = doc.createComponent('SharedCard');
		sharedComponent
			.setId('cmpB')
			.setPath('/widgets/')
			.setExported(true)
			.setSize(120, 80);
		sharedPkg.addResource(sharedComponent);

		const sharedMovieClip = doc.createMovieClipResource('SharedFx');
		sharedMovieClip
			.setId('mcB')
			.setPath('/fx/')
			.setFileName('SharedFx.jta')
			.setExported(true)
			.setWidth(64)
			.setHeight(32);
		sharedPkg.addResource(sharedMovieClip);

		const hostComponent = doc.createComponent('Host');
		hostComponent
			.setId('host001')
			.setPath('/')
			.setExported(true)
			.setSize(400, 300);

		const imageChild = doc.createGImage('sharedImage');
		imageChild.setId('n0').setSrc('imgB').setPackageId('shared01');
		hostComponent.addChild(imageChild);

		const componentChild = doc.createGComponent('sharedComponent');
		componentChild.setId('n1').setSrc('cmpB').setPackageId('shared01');
		hostComponent.addChild(componentChild);

		const movieClipChild = doc.createGMovieClip('sharedMovieClip');
		movieClipChild.setId('n2').setSrc('mcB').setPackageId('shared01');
		hostComponent.addChild(movieClipChild);

		hostPkg.addResource(hostComponent);

		await fs.mkdir(releaseDir, { recursive: true });
		await io.writeBinary(doc, path.join(releaseDir, 'HostPkg_fui.bytes'), { packageIndex: 0 });
		await io.writeBinary(doc, path.join(releaseDir, 'SharedPkg_fui.bytes'), { packageIndex: 1 });

		const result = await restore({
			inputDir: releaseDir,
			output: outputDir,
			fs: createRestoreFs(),
			force: true,
		});

		const restoredDoc = await io.readProject(result.projectPath);
		const restoredHostPkg = restoredDoc.getRoot().getPackage('HostPkg');
		t.truthy(restoredHostPkg, 'restored host package exists');
		const restoredHost = restoredHostPkg?.getComponent('Host');
		t.truthy(restoredHost, 'restored host component exists');
		const byId = new Map(restoredHost?.listChildren().map((child) => [child.getId(), child as any]));

		t.is(byId.get('n0')?.getPackageId?.(), 'shared01', 'cross-package image keeps package id after restore');
		t.is(byId.get('n1')?.getPackageId?.(), 'shared01', 'cross-package component keeps package id after restore');
		t.is(byId.get('n1')?.getFileName?.(), 'widgets/SharedCard.xml', 'cross-package component backfills fileName from the target package resource');
		t.is(byId.get('n2')?.getPackageId?.(), 'shared01', 'cross-package movieclip keeps package id after restore');
		t.is(byId.get('n2')?.getFileName?.(), 'fx/SharedFx.jta', 'cross-package movieclip backfills fileName from the target package resource');

		const hostXml = await fs.readFile(path.join(outputDir, 'assets', 'HostPkg', 'Host.xml'), 'utf-8');
		t.true(/<image\b[^>]*id="n0"[^>]*src="imgB"[^>]*pkg="shared01"/.test(hostXml), 'restored image instance writes pkg attr for cross-package refs');
		t.true(/<component\b[^>]*id="n1"[^>]*src="cmpB"[^>]*fileName="widgets\/SharedCard\.xml"[^>]*pkg="shared01"/.test(hostXml), 'restored component instance writes fileName and pkg attrs for cross-package refs');
		t.true(/<(?:movieclip|jta)\b[^>]*id="n2"[^>]*src="mcB"[^>]*fileName="fx\/SharedFx\.jta"[^>]*pkg="shared01"/.test(hostXml), 'restored movieclip instance writes fileName and pkg attrs for cross-package refs');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
	}
});

test.serial('restore published project: .fairy output targets are rejected before writing', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-restore-relative-file-'));
	const previousCwd = process.cwd();

	try {
		process.chdir(tmpDir);
		await fs.writeFile(path.join(tmpDir, 'Restored.fairy'), 'keep this file', 'utf-8');

		await t.throwsAsync(
			() => restore({
				inputDir: 'release',
				output: 'Restored.fairy',
				fs: createRestoreFs(),
				force: true,
			}),
			{ message: /must be a non-root project directory/ },
		);
		t.is(await fs.readFile(path.join(tmpDir, 'Restored.fairy'), 'utf-8'), 'keep this file');
	} finally {
		process.chdir(previousCwd);
		await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
	}
});

test('restore published project: nested output directories are rejected before scanning artifacts', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-restore-nested-output-'));
	const releaseDir = path.join(tmpDir, 'release');

	try {
		await fs.mkdir(releaseDir, { recursive: true });
		await t.throwsAsync(
			() => restore({
				inputDir: releaseDir,
				output: path.join(releaseDir, 'Restored'),
				fs: createRestoreFs(),
			}),
			{ message: /must be independent/ },
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('restore published project: output nested through a resolved input alias is rejected', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-restore-aliased-output-'));
	const releaseDir = path.join(tmpDir, 'release');
	const outputAlias = path.join(tmpDir, 'output-alias');

	try {
		await fs.mkdir(releaseDir, { recursive: true });
		await fs.mkdir(outputAlias, { recursive: true });
		const restoreFs = createRestoreFs();
		const resolvePath = restoreFs.resolvePath.bind(restoreFs);
		restoreFs.resolvePath = async (filePath) => filePath === outputAlias ? releaseDir : resolvePath(filePath);

		await t.throwsAsync(
			() => restore({
				inputDir: releaseDir,
				output: path.join(outputAlias, 'Restored'),
				fs: restoreFs,
			}),
			{ message: /must be independent/ },
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('restore published project: projectType override sets restored project type', async (t) => {
	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-restore-type-'));
	const outputDir = path.join(tmpDir, 'Restored');

	try {
		const result = await restore({
			inputDir: UNITY_RELEASE_DIR,
			output: outputDir,
			fs: createRestoreFs(),
			packages: ['Basics'],
			force: true,
			projectType: ProjectType.CocosCreator,
			cropImage,
			extractImage,
		});
		const doc = await io.readProject(result.projectPath);
		t.is(doc.getRoot().getProjectType(), ProjectType.CocosCreator, 'restored project type follows explicit override');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});
