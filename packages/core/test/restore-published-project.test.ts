import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { NodeIO, parseJta, type RestoreImageCropInput, type RestoreImageExtractInput } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RELEASE_DIR = path.resolve(__dirname, '../../../release');

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
	if (input.rotated) pipeline = pipeline.rotate(270);
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

test('restore published project: directory batch restores packages, assets, and branch files', async (t) => {
	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-restore-'));
	const outputDir = path.join(tmpDir, 'Restored');

	try {
		const result = await io.restorePublishedProject(RELEASE_DIR, outputDir, {
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
		t.false(basicsPackageXml.includes('.png.png"'), 'image resource file names are not suffixed with .png twice');
		t.false(basicsPackageXml.includes('id="es4130" name="change.png" path="/images/" width='), 'restored package.xml omits inferred image width');
		t.false(basicsPackageXml.includes('id="es4130" name="change.png" path="/images/" height='), 'restored package.xml omits inferred image height');
		t.true(basicsPackageXml.includes('<publish name="Basics">'), 'package.xml keeps publish block');
		t.true(basicsPackageXml.includes('<atlas name="Default" index="0"'), 'package.xml keeps default atlas publish entry');
		t.true(basicsPackageXml.includes('name="nlge1k.jta"'), 'movieclip package resource keeps .jta file name');
		t.true(basicsPackageXml.includes('name="BMFontTest.fnt"'), 'font package resource keeps .fnt file name');
		t.true(
			basicsPackageXml.indexOf('id="rpmbz"') < basicsPackageXml.indexOf('id="rpmb10"'),
			'package.xml resource order follows editor-like id sequence instead of read order',
		);
		t.true(basicsPackageXml.includes('id="duef6n" name="h0.png"'), 'digit font glyph resources use readable synthesized file names');
		const hitNumberFnt = await fs.readFile(path.join(outputDir, 'assets', 'Basics', 'font', 'HitNumber.fnt'), 'utf-8');
		t.true(hitNumberFnt.includes('char id=48 img=duef6n xoffset=0 yoffset=0 xadvance=33'), 'bitmap font file is regenerated from published glyphs');
		const bmFontTestFnt = await fs.readFile(path.join(outputDir, 'assets', 'Basics', 'font', 'BMFontTest.fnt'), 'utf-8');
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
		await io.restorePublishedProject(RELEASE_DIR, bagOutputDir, {
			packages: ['Bag'],
			force: true,
			cropImage,
			extractImage,
		});
		const bagCloseButtonXml = await fs.readFile(path.join(bagOutputDir, 'assets', 'Bag', 'CloseButton.xml'), 'utf-8');
		t.true(bagCloseButtonXml.includes('<gearSize controller="button" pages="0,1,2,3" values="61,53|-|61,53|-" default="55,47"'), 'restored CloseButton omits redundant identity scale payloads in non-tween gearSize');
		t.true(/<image\b[^>]*id="n1"[^>]*xy="0,0"/.test(bagCloseButtonXml), 'restored CloseButton keeps explicit zero xy attrs on image tags');
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
		t.true(loaderPackageXml.includes('name="alien-pro.skel"'), 'Unity skeleton binary extension is restored to project file name');
		t.true(loaderPackageXml.includes('require="nbcg7,nbcg8"'), 'Spine resource dependency ids are restored');
		t.true(loaderPackageXml.includes('atlasNames="alien-pma"'), 'Spine atlas name is restored');
		t.truthy(await fs.stat(path.join(outputDir, 'assets', 'Loader', 'images', 'alien-pma.atlas')).catch(() => null), 'normalized atlas file is copied');
		t.truthy(await fs.stat(path.join(outputDir, 'assets', 'Loader', 'images', 'alien-pro.skel')).catch(() => null), 'normalized skeleton file is copied');

		const textMeshProPackageXml = await fs.readFile(path.join(outputDir, 'assets', 'TextMeshPro', 'package.xml'), 'utf-8');
		t.true(textMeshProPackageXml.includes('renderMode="sdfaa"'), 'SDF font render mode is restored from published font name');
		t.true(textMeshProPackageXml.includes('samplePointSize="60"'), 'SDF font sample point size is restored from published font name');

		const transitionOutputDir = path.join(outputDir, 'TransitionPack');
		const transitionResult = await io.restorePublishedProject(RELEASE_DIR, transitionOutputDir, {
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
		const emitNumbersResult = await io.restorePublishedProject(RELEASE_DIR, emitNumbersOutputDir, {
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
		await io.restorePublishedProject(RELEASE_DIR, treeViewOutputDir, {
			packages: ['TreeView'],
			force: true,
			cropImage,
			extractImage,
		});
		const treeViewMainXml = await fs.readFile(path.join(treeViewOutputDir, 'assets', 'TreeView', 'Main.xml'), 'utf-8');
		t.false(treeViewMainXml.includes('isFolder='), 'restored TreeView/Main omits inferred tree item isFolder attrs');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('restore published project: non-empty output directory fails without force', async (t) => {
	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-restore-nonempty-'));
	const outputDir = path.join(tmpDir, 'Restored');

	try {
		await fs.mkdir(outputDir, { recursive: true });
		await fs.writeFile(path.join(outputDir, 'keep.txt'), 'do not overwrite', 'utf-8');

		await t.throwsAsync(
			() => io.restorePublishedProject(RELEASE_DIR, outputDir, {
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
