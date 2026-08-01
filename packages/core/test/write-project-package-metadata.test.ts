import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getFixtureProjectPath } from '@openfairygui/test-utils';
import { Document, liftDocumentToUamProject, materializeUamProject } from '../src/index.js';
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

test('round-trip: complete source package settings survive UAM without serializing generated atlases', async (t) => {
	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-rt-'));
	const sourceDir = path.join(tmpDir, 'source');
	const sourceFairy = path.join(sourceDir, 'source.fairy');
	const outFairy = path.join(tmpDir, 'out', 'out.fairy');

	try {
		await fs.mkdir(path.join(sourceDir, 'assets', 'DemoPkg'), { recursive: true });
		await fs.writeFile(sourceFairy, '<?xml version="1.0" encoding="utf-8"?>\n<projectDescription id="pkg-meta" type="Layabox" version="3.0"/>\n');
		await fs.writeFile(path.join(sourceDir, 'assets', 'DemoPkg', 'package.xml'), `<?xml version="1.0" encoding="utf-8"?>
<packageDescription id="pkgmeta" compressPNG="true" jpegQuality="80">
  <resources>
    <image id="imgmeta" name="hero.png" path="/images/"/>
  </resources>
  <publish name="DemoPublish" path="dist/ui" branchPath="dist/branches" packageCount="1" genCode="true" codePath="src/ui-gen" maxAtlasSize="1024" sizeOption="mof" square="true" rotation="true" multiPage="false" extractAlpha="true" maxAtlasIndex="4" excluded="imgmeta,missing-resource">
    <atlas name="Main" index="0"/>
    <atlas name="Effects" index="3" compression="true"/>
  </publish>
</packageDescription>
`);

		const doc = await io.readProject(sourceFairy);
		const lifted = liftDocumentToUamProject(doc);
		const liftedPackage = lifted.packages[0];
		t.is(liftedPackage?.compressPNG, true);
		t.is(liftedPackage?.jpegQuality, 80);
		t.deepEqual(liftedPackage?.publish?.atlases, [
			{ index: 0, name: 'Main', compression: false },
			{ index: 3, name: 'Effects', compression: true },
		]);
		t.deepEqual(liftedPackage?.publish?.excludedResourceIds, ['imgmeta', 'missing-resource']);

		const materialized = materializeUamProject(lifted);
		const materializedPackage = materialized.getRoot().getPackage('DemoPkg');
		materializedPackage?.addAtlas(materialized.createAtlas('generated-atlas').setIndex(2));
		await fs.mkdir(path.dirname(outFairy), { recursive: true });
		await io.writeProject(materialized, outFairy);
		const packageXml = await fs.readFile(path.join(tmpDir, 'out', 'assets', 'DemoPkg', 'package.xml'), 'utf-8');
		t.true(packageXml.includes('<packageDescription id="pkgmeta" compressPNG="true" jpegQuality="80">'), 'packageDescription writes canonical id and publish image attrs');
		t.regex(
			packageXml,
			/<publish name="DemoPublish" path="dist\/ui" branchPath="dist\/branches" packageCount="1" genCode="true" codePath="src\/ui-gen"/,
			'publish writes canonical name, path, branchPath, packageCount, genCode and codePath attrs',
		);
		t.regex(packageXml, /<publish[^>]*maxAtlasSize="1024"[^>]*sizeOption="mof"[^>]*square="true"[^>]*rotation="true"[^>]*multiPage="false"[^>]*extractAlpha="true"[^>]*maxAtlasIndex="4"[^>]*excluded="imgmeta,missing-resource"/);
		t.regex(packageXml, /<atlas name="Main" index="0"\/>/);
		t.regex(packageXml, /<atlas name="Effects" index="3" compression="true"\/>/);
		t.false(packageXml.includes('generated-atlas'), 'generated atlas does not leak into source publish settings');

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
		t.deepEqual(pkg2?.getSourceAtlasSettings(), {
			useGlobal: false,
			maxSize: 1024,
			sizeOption: 'mof',
			forceSquare: true,
			allowRotation: true,
			paging: false,
			extractAlpha: true,
			maxIndex: 4,
			atlases: [
				{ index: 0, name: 'Main', compression: false },
				{ index: 3, name: 'Effects', compression: true },
			],
			excludedResourceIds: ['imgmeta', 'missing-resource'],
		});
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: resource favorites derive package hasFavorites and survive write→read', async (t) => {
	const io = new NodeIO();
	const doc = new Document();
	doc.getRoot().setProjectId('resource-favorites').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('Favorites');
	pkg.setId('pkgFavorites');

	const image = doc.createImageResource('icon.png')
		.setId('imgFavorite')
		.setPath('/')
		.setFavorite(true);
	const component = doc.createComponent('Main')
		.setId('cmpFavorite')
		.setPath('/')
		.setFavorite(false);
	pkg.addResource(image);
	pkg.addResource(component);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-favorites-'));
	const outFairy = path.join(tmpDir, 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);
		const packagePath = path.join(tmpDir, 'assets', 'Favorites', 'package.xml');
		const packageXml = await fs.readFile(packagePath, 'utf-8');
		t.true(packageXml.includes('<packageDescription id="pkgFavorites" hasFavorites="true">'));
		t.regex(packageXml, /<image[^>]*id="imgFavorite"[^>]*favorite="true"/);
		t.notRegex(packageXml, /<component[^>]*id="cmpFavorite"[^>]*favorite=/);

		const roundTripped = await io.readProject(outFairy);
		const resources = roundTripped.getRoot().getPackage('Favorites')?.listResources() ?? [];
		const roundTripImage = resources.find((resource) => resource.getId?.() === 'imgFavorite');
		const roundTripComponent = resources.find((resource) => resource.getId?.() === 'cmpFavorite');
		t.true((roundTripImage as ReturnType<Document['createImageResource']>).getFavorite());
		t.false((roundTripComponent as ReturnType<Document['createComponent']>).getFavorite());

		image.setFavorite(false);
		await io.writeProject(doc, outFairy);
		const clearedXml = await fs.readFile(packagePath, 'utf-8');
		t.notRegex(clearedXml, /\bhasFavorites=/);
		t.notRegex(clearedXml, /\bfavorite=/);
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

test('round-trip: package movieclip atlas survives XML and smoothing survives UAM materialization', async (t) => {
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
	movieClip.setSmoothing(false);
	pkg.addResource(movieClip);
	const defaultMovieClip = doc.createMovieClipResource('idle');
	defaultMovieClip.setId('mcDefault');
	defaultMovieClip.setPath('/fx/');
	defaultMovieClip.setFileName('idle.jta');
	pkg.addResource(defaultMovieClip);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-package-movieclip-atlas-'));
	const outFairy = path.join(tmpDir, 'out.fairy');
	const materializedFairy = path.join(tmpDir, 'materialized', 'out.fairy');

	try {
		await io.writeProject(doc, outFairy);

		const pkgXml = await fs.readFile(path.join(tmpDir, 'assets', 'DemoMovieClipTextureSetMode', 'package.xml'), 'utf-8');
		t.true(pkgXml.includes('atlas="alone_mof"'), 'package movieclip writes atlas attr');
		t.regex(pkgXml, /<movieclip[^>]*id="mcAtlas"[^>]*smoothing="false"/);
		t.notRegex(pkgXml, /<movieclip[^>]*id="mcDefault"[^>]*smoothing=/);

		const doc2 = await io.readProject(outFairy);
		const pkg2 = doc2.getRoot().getPackage('DemoMovieClipTextureSetMode');
		t.truthy(pkg2, 'DemoMovieClipTextureSetMode exists after round-trip');

		const movieClip2 = pkg2!.listResources().find((res) => res.getId?.() === 'mcAtlas') as ReturnType<Document['createMovieClipResource']>;
		t.truthy(movieClip2, 'movieclip resource exists after round-trip');
		t.is(movieClip2.getTextureSetMode(), 'alone_mof', 'movieclip textureSetMode survives');
		t.false(movieClip2.getSmoothing(), 'explicit movieclip smoothing=false survives');
		const defaultMovieClip2 = pkg2!.listResources().find((res) => res.getId?.() === 'mcDefault') as ReturnType<Document['createMovieClipResource']>;
		t.true(defaultMovieClip2.getSmoothing(), 'missing movieclip smoothing defaults to true');

		const lifted = liftDocumentToUamProject(doc2);
		const liftedMovieClip = lifted.packages[0]?.resources.find((resource) => resource.id === 'mcAtlas');
		t.is(liftedMovieClip?.kind, 'movieClip');
		if (liftedMovieClip?.kind === 'movieClip') t.false(liftedMovieClip.movieClip.smoothing);

		await fs.mkdir(path.dirname(materializedFairy), { recursive: true });
		await io.writeProject(materializeUamProject(lifted), materializedFairy);
		const materializedPackageXml = await fs.readFile(
			path.join(tmpDir, 'materialized', 'assets', 'DemoMovieClipTextureSetMode', 'package.xml'),
			'utf-8',
		);
		t.regex(materializedPackageXml, /<movieclip[^>]*id="mcAtlas"[^>]*smoothing="false"/);
		t.notRegex(materializedPackageXml, /<movieclip[^>]*id="mcDefault"[^>]*smoothing=/);
		const materializedDoc = await io.readProject(materializedFairy);
		const materializedMovieClip = materializedDoc.getRoot().getPackage('DemoMovieClipTextureSetMode')
			?.listResources().find((resource) => resource.getId?.() === 'mcAtlas') as ReturnType<Document['createMovieClipResource']>;
		t.false(materializedMovieClip.getSmoothing(), 'materialized movieclip keeps smoothing=false after reload');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('round-trip: unreadable MovieClip JTA preserves source bytes and XML properties', async (t) => {
	const io = new NodeIO();
	const doc = new Document();
	doc.getRoot().setProjectId('proj-unreadable-movieclip').setProjectType(0).setVersion('3.0');
	const pkg = doc.createPackage('Demo');
	pkg.setId('pkgUnreadableMovieClip');
	const sourceBytes = new Uint8Array([0, 1, 2, 3]);
	const movieClip = doc.createMovieClipResource('broken')
		.setId('mcBroken')
		.setPath('/')
		.setFileName('broken.jta')
		.setTextureSetMode('alone_mof')
		.setSmoothing(false)
		.setWidth(40)
		.setHeight(30)
		.setSourceData(doc.createBuffer().setURI('/broken.jta').setData(sourceBytes));
	pkg.addResource(movieClip);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-unreadable-movieclip-'));
	const sourceFairy = path.join(tmpDir, 'source.fairy');
	const copiedFairy = path.join(tmpDir, 'copy', 'copy.fairy');
	try {
		await io.writeProject(doc, sourceFairy);
		const hydrated = await io.readProject(sourceFairy, { hydrateResourceBytes: true });
		const hydratedMovieClip = hydrated.getRoot().getPackage('Demo')?.listResources()[0] as typeof movieClip;
		t.deepEqual(hydratedMovieClip.getSourceData()?.getData(), sourceBytes);
		t.is(hydratedMovieClip.getTextureSetMode(), 'alone_mof');
		t.false(hydratedMovieClip.getSmoothing());

		await fs.mkdir(path.dirname(copiedFairy), { recursive: true });
		await io.writeProject(hydrated, copiedFairy);
		t.deepEqual(
			new Uint8Array(await fs.readFile(path.join(tmpDir, 'copy', 'assets', 'Demo', 'broken.jta'))),
			sourceBytes,
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});
