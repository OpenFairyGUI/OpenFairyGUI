import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getFixtureProjectPath } from '@openfairygui/test-utils';
import { Document, } from '../src/index.js';
import { NodeIO } from '../src/node.js';

const _PROJECT_PATH = getFixtureProjectPath('FairyGUI-unity', 'UIProject/FairyGUI-Unity-Examples.fairy');

// ─── Round-trip: read → write → read ──────────────────────────────────────

test('round-trip: image duplicatePadding survives write→read', async (t) => {
	const io = new NodeIO();
	const doc = new Document();
	doc.getRoot().setProjectId('proj-image').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('Demo');
	pkg.setId('pkg1');

	const image = doc.createImageResource('bg.png');
	image.setId('img1');
	image.setPath('/');
	image.setDuplicatePadding(true);
	pkg.addResource(image);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);
		const doc2 = await io.readProject(outFairy);
		const image2 = doc2.getRoot().getPackage('Demo')?.listResources().find((res) => res.getId?.() === 'img1');
		t.truthy(image2, 'image exists after round-trip');
		t.true((image2 as ReturnType<Document['createImageResource']>).getDuplicatePadding(), 'duplicatePadding survives');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: package image width/height/gridTile survive package.xml write→read', async (t) => {
	const io = new NodeIO();
	const doc = new Document();
	doc.getRoot().setProjectId('proj-image-size').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('DemoImageMeta');
	pkg.setId('pkgImageMeta');

	const image = doc.createImageResource('icon.svg');
	image.setId('imgMeta');
	image.setPath('/icons/');
	image.setWidth(16);
	image.setHeight(18);
	image.setTileGridIndice(3);
	pkg.addResource(image);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-image-meta-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const pkgXml = await fs.readFile(path.join(tmpDir, 'assets', 'DemoImageMeta', 'package.xml'), 'utf-8');
		t.true(pkgXml.includes('width="16"'), 'package image writes width attr');
		t.true(pkgXml.includes('height="18"'), 'package image writes height attr');
		t.true(pkgXml.includes('gridTile="3"'), 'package image writes gridTile attr');

		const doc2 = await io.readProject(outFairy);
		const image2 = doc2.getRoot().getPackage('DemoImageMeta')?.listResources().find((res) => res.getId?.() === 'imgMeta');
		t.truthy(image2, 'image exists after round-trip');
		t.is((image2 as ReturnType<Document['createImageResource']>).getWidth(), 16, 'width survives');
		t.is((image2 as ReturnType<Document['createImageResource']>).getHeight(), 18, 'height survives');
		t.is((image2 as ReturnType<Document['createImageResource']>).getTileGridIndice(), 3, 'gridTile survives');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: packageDescription id and publish attrs survive package.xml write→read', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('pkg-meta').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('DemoPkg');
	pkg.setId('pkgmeta');
	pkg.setCompressPNG(true);
	pkg.setJpegQuality(80);
	pkg.setPublishName('DemoPublish');
	pkg.setPublishPath('dist/ui');
	pkg.setPublishBranchPath('dist/branches');
	pkg.setPublishPackageCount(1);
	pkg.setGenCode(true);
	pkg.setCodePath('src/ui-gen');

	const image = doc.createImageResource('hero.png');
	image.setId('imgmeta');
	image.setPath('/images/');
	pkg.addResource(image);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);
		const packageXml = await fs.readFile(path.join(tmpDir, 'assets', 'DemoPkg', 'package.xml'), 'utf-8');
		t.true(packageXml.includes('<packageDescription id="pkgmeta" compressPNG="true" jpegQuality="80">'), 'packageDescription writes canonical id and publish image attrs');
		t.true(
			packageXml.includes('<publish name="DemoPublish" path="dist/ui" branchPath="dist/branches" packageCount="1" genCode="true" codePath="src/ui-gen">')
				|| packageXml.includes('<publish name="DemoPublish" path="dist/ui" branchPath="dist/branches" packageCount="1" genCode="true" codePath="src/ui-gen"/>'),
			'publish writes canonical name, path, branchPath, packageCount, genCode and codePath attrs',
		);

		const doc2 = await io.readProject(outFairy);
		const pkg2 = doc2.getRoot().getPackage('DemoPkg');
		t.truthy(pkg2, 'DemoPkg exists after round-trip');
		t.is(pkg2?.getId(), 'pkgmeta');
		t.is(pkg2?.getCompressPNG?.(), true);
		t.is(pkg2?.getJpegQuality?.(), 80);
		t.is(pkg2?.getPublishName(), 'DemoPublish');
		t.is(pkg2?.getPublishPath?.(), 'dist/ui');
		t.is(pkg2?.getPublishBranchPath?.(), 'dist/branches');
		t.is(pkg2?.getPublishPackageCount?.(), 1);
		t.true(pkg2?.getGenCode?.(), 'genCode survives');
		t.is(pkg2?.getCodePath?.(), 'src/ui-gen', 'codePath survives');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: package image qualityOption and font TMP import attrs survive package.xml write→read', async (t) => {
	const io = new NodeIO();
	const doc = new Document();
	doc.getRoot().setProjectId('proj-package-meta').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('DemoPackageMeta');
	pkg.setId('pkgMeta1');

	const image = doc.createImageResource('icon.png');
	image.setId('imgMeta1');
	image.setPath('/icons/');
	image.setQualityOption('source');
	pkg.addResource(image);

	const font = doc.createFontResource('TmpFont');
	font.setId('fontMeta1');
	font.setPath('/fonts/');
	font.setFileName('TmpFont.ttf');
	font.setRenderMode('sdfaa');
	font.setSamplePointSize(60);
	pkg.addResource(font);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-package-meta-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const pkgXml = await fs.readFile(path.join(tmpDir, 'assets', 'DemoPackageMeta', 'package.xml'), 'utf-8');
		t.true(pkgXml.includes('qualityOption="source"'), 'package image writes qualityOption attr');
		t.true(pkgXml.includes('renderMode="sdfaa"'), 'font writes renderMode attr');
		t.true(pkgXml.includes('samplePointSize="60"'), 'font writes samplePointSize attr');

		const doc2 = await io.readProject(outFairy);
		const pkg2 = doc2.getRoot().getPackage('DemoPackageMeta');
		t.truthy(pkg2, 'DemoPackageMeta exists after round-trip');

		const image2 = pkg2!.listResources().find((res) => res.getId?.() === 'imgMeta1') as ReturnType<Document['createImageResource']>;
		t.truthy(image2, 'image resource exists after round-trip');
		t.is(image2.getQualityOption(), 'source', 'qualityOption survives');

		const font2 = pkg2!.listResources().find((res) => res.getId?.() === 'fontMeta1') as ReturnType<Document['createFontResource']>;
		t.truthy(font2, 'font resource exists after round-trip');
		t.is(font2.getRenderMode(), 'sdfaa', 'renderMode survives');
		t.is(font2.getSamplePointSize(), 60, 'samplePointSize survives');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: package image textureSetMode survives package.xml write→read', async (t) => {
	const io = new NodeIO();
	const doc = new Document();
	doc.getRoot().setProjectId('proj-package-atlas').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('DemoTextureSetMode');
	pkg.setId('pkgTextureSetMode');

	const image = doc.createImageResource('timeline_frame.png');
	image.setId('imgAtlas');
	image.setPath('/timeline/');
	image.setTextureSetMode('alone_npot');
	image.setScaleOption(2);
	pkg.addResource(image);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-package-atlas-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const pkgXml = await fs.readFile(path.join(tmpDir, 'assets', 'DemoTextureSetMode', 'package.xml'), 'utf-8');
		t.true(pkgXml.includes('atlas="alone_npot"'), 'package image writes atlas attr');

		const doc2 = await io.readProject(outFairy);
		const pkg2 = doc2.getRoot().getPackage('DemoTextureSetMode');
		t.truthy(pkg2, 'DemoTextureSetMode exists after round-trip');

		const image2 = pkg2!.listResources().find((res) => res.getId?.() === 'imgAtlas') as ReturnType<Document['createImageResource']>;
		t.truthy(image2, 'image resource exists after round-trip');
		t.is(image2.getTextureSetMode(), 'alone_npot', 'textureSetMode survives');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: package movieclip textureSetMode survives package.xml write→read', async (t) => {
	const io = new NodeIO();
	const doc = new Document();
	doc.getRoot().setProjectId('proj-package-movieclip-atlas').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('DemoMovieClipTextureSetMode');
	pkg.setId('pkgMovieClipTextureSetMode');

	const movieClip = doc.createMovieClipResource('pet');
	movieClip.setId('mcAtlas');
	movieClip.setPath('/fx/');
	movieClip.setFileName('pet.jta');
	movieClip.setTextureSetMode('alone_mof');
	pkg.addResource(movieClip);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-package-movieclip-atlas-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const pkgXml = await fs.readFile(path.join(tmpDir, 'assets', 'DemoMovieClipTextureSetMode', 'package.xml'), 'utf-8');
		t.true(pkgXml.includes('atlas="alone_mof"'), 'package movieclip writes atlas attr');

		const doc2 = await io.readProject(outFairy);
		const pkg2 = doc2.getRoot().getPackage('DemoMovieClipTextureSetMode');
		t.truthy(pkg2, 'DemoMovieClipTextureSetMode exists after round-trip');

		const movieClip2 = pkg2!.listResources().find((res) => res.getId?.() === 'mcAtlas') as ReturnType<Document['createMovieClipResource']>;
		t.truthy(movieClip2, 'movieclip resource exists after round-trip');
		t.is(movieClip2.getTextureSetMode(), 'alone_mof', 'movieclip textureSetMode survives');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});
