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
		t.true(basicsPackageXml.includes('name="gojg7u.wav"'), 'package.xml references copied sound file name');
		t.true(basicsPackageXml.includes('exported="true"'), 'package.xml writes explicit true boolean attributes');
		t.false(basicsPackageXml.includes('.png.png"'), 'image resource file names are not suffixed with .png twice');
		t.true(basicsPackageXml.includes('<publish name="Basics">'), 'package.xml keeps publish block');
		t.true(basicsPackageXml.includes('<atlas name="Default" index="0"'), 'package.xml keeps default atlas publish entry');
		t.true(basicsPackageXml.includes('name="nlge1k.jta"'), 'movieclip package resource keeps .jta file name');
		t.true(basicsPackageXml.includes('name="BMFontTest.fnt"'), 'font package resource keeps .fnt file name');
		const hitNumberFnt = await fs.readFile(path.join(outputDir, 'assets', 'Basics', 'font', 'HitNumber.fnt'), 'utf-8');
		t.true(hitNumberFnt.includes('char id=48 img=duef6n xoffset=0 yoffset=0 xadvance=33'), 'bitmap font file is regenerated from published glyphs');
		const bmFontTestFnt = await fs.readFile(path.join(outputDir, 'assets', 'Basics', 'font', 'BMFontTest.fnt'), 'utf-8');
		t.true(bmFontTestFnt.includes('char id=35 x=22 y=37 width=15 height=20 xoffset=0 yoffset=6 xadvance=14 page=0 chnl=15'), 'ttf-backed font file is regenerated from published glyph metrics');
		const movieClipJta = parseJta(await fs.readFile(path.join(outputDir, 'assets', 'Basics', 'images', 'nlge1k.jta')));
		t.is(movieClipJta.version, 102, 'movieclip jta version is regenerated');
		t.is(movieClipJta.speed, 3, 'movieclip jta speed is restored from interval');
		t.is(movieClipJta.frames.length, 15, 'movieclip jta frame count is restored');
		t.is(movieClipJta.textures.length, 15, 'movieclip jta frame textures are embedded');

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
