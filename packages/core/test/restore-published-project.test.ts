import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { NodeIO, type RestoreImageCropInput } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RELEASE_DIR = path.resolve(__dirname, '../../../release');

function resourcePath(basePath: string, resourcePath: string, fileName: string): string {
	const subDir = resourcePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
	return subDir ? path.join(basePath, subDir, fileName) : path.join(basePath, fileName);
}

async function cropImage(input: RestoreImageCropInput): Promise<void> {
	await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
	let pipeline = sharp(input.sourcePath).extract({
		left: input.left,
		top: input.top,
		width: input.width,
		height: input.height,
	});
	if (input.rotated) pipeline = pipeline.rotate(270);
	await pipeline.png().toFile(input.outputPath);
}

test('restore published project: directory batch restores packages, assets, and branch files', async (t) => {
	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-restore-'));
	const outputDir = path.join(tmpDir, 'Restored');

	try {
		const result = await io.restorePublishedProject(RELEASE_DIR, outputDir, {
			packages: ['Basics', 'Branch'],
			force: true,
			cropImage,
		});

		t.is(result.projectPath, path.join(outputDir, 'Restored.fairy'));

		const doc = await io.readProject(result.projectPath);
		t.truthy(doc.getRoot().getPackage('Basics'), 'Basics package is restored');
		t.truthy(doc.getRoot().getPackage('Branch'), 'Branch package is restored');
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

		const branchFacePath = path.join(outputDir, 'assets_dev', 'Branch', 'face.png');
		t.truthy(await fs.stat(branchFacePath).catch(() => null), 'branch image is cropped into assets_dev');
		const branchPackageXml = await fs.readFile(path.join(outputDir, 'assets_dev', 'Branch', 'package_branch.xml'), 'utf-8');
		t.true(branchPackageXml.includes('id="kn7w2"'), 'branch package xml references branch image resource');
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
			}),
			{ message: /not empty/ },
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});
