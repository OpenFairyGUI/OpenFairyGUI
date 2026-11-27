import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Document } from '@openfairygui/core';
import test from 'ava';
import sharpImplementation from 'sharp';
import { atlas, type AtlasRasterBackend } from '../src/index.js';

const sharp = sharpImplementation as typeof sharpImplementation & AtlasRasterBackend;

test('atlas: creates Atlas and Sprite nodes without encoder', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('test');
	pkg.setId('test0001');

	const img1 = doc.createImageResource('icon1.png');
	img1.setId('i001').setWidth(64).setHeight(64);
	pkg.addResource(img1);

	const img2 = doc.createImageResource('icon2.png');
	img2.setId('i002').setWidth(32).setHeight(32);
	pkg.addResource(img2);

	await doc.transform(atlas({ maxSize: 256 }));

	const atlases = pkg.listAtlases();
	t.is(atlases.length, 1, 'one atlas created');
	t.is(atlases[0].getIndex(), 0, 'atlas index is 0');

	const sprites = atlases[0].listSprites();
	t.is(sprites.length, 2, 'two sprites in atlas');

	// Verify sprite properties
	for (const sprite of sprites) {
		t.truthy(sprite.getItemId(), 'sprite has itemId');
		t.true(sprite.getRectWidth() > 0, 'sprite has positive width');
		t.true(sprite.getRectHeight() > 0, 'sprite has positive height');
	}
});

test('atlas: skips packages with no images', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('empty');
	pkg.setId('empty001');

	const comp = doc.createComponent('Main');
	comp.setId('c001');
	pkg.addResource(comp);

	await doc.transform(atlas());

	t.is(pkg.listAtlases().length, 0, 'no atlas created for image-less package');
});

test('atlas: rejects a packable input that cannot fit on any page', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('oversized');
	pkg.setId('oversize1');
	const image = doc.createImageResource('huge.png');
	image.setId('img001').setWidth(64).setHeight(64);
	pkg.addResource(image);

	await t.throwsAsync(() => doc.transform(atlas({ maxSize: 16, allowRotation: false, multiPage: false })), {
		message: /Could not pack every input/,
	});
});

test('atlas: handles multiple pages when images exceed maxSize', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('test');
	pkg.setId('test0001');

	// Create images that won't fit in a 128x128 atlas
	for (let i = 0; i < 5; i++) {
		const img = doc.createImageResource(`img${i}.png`);
		img.setId(`i${String(i).padStart(3, '0')}`)
			.setWidth(80)
			.setHeight(80);
		pkg.addResource(img);
	}

	await doc.transform(atlas({ maxSize: 128 }));

	const atlases = pkg.listAtlases();
	t.true(atlases.length >= 2, `multiple atlases created (got ${atlases.length})`);

	// All sprites should be placed
	let totalSprites = 0;
	for (const a of atlases) totalSprites += a.listSprites().length;
	t.is(totalSprites, 5, 'all 5 sprites placed across atlases');
});

test('atlas: trimImage keeps fully transparent images as zero-sized sprites', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-atlas-'));
	const imageDir = path.join(tmpDir, 'Basics', 'images');
	const imagePath = path.join(imageDir, 'transparent.png');

	try {
		await fs.mkdir(imageDir, { recursive: true });
		await sharp({
			create: {
				width: 66,
				height: 44,
				channels: 4,
				background: { r: 0, g: 0, b: 0, alpha: 0 },
			},
		})
			.png()
			.toFile(imagePath);

		const doc = new Document();
		const pkg = doc.createPackage('Basics');
		pkg.setId('test0001');

		const img = doc.createImageResource('transparent');
		img.setId('img001').setPath('/images/');
		img.setWidth(66).setHeight(44).setExported(true).setFileName('transparent.png');
		pkg.addResource(img);

		await doc.transform(
			atlas({
				encoder: sharp,
				basePath: tmpDir,
				outputPath: tmpDir,
				mkdir: async (dir) => {
					await fs.mkdir(dir, { recursive: true });
				},
				trimImage: true,
				powerOfTwo: true,
				maxSize: 256,
			}),
		);

		const sprites = pkg.listAtlases().flatMap((atlasNode) => atlasNode.listSprites());
		const sprite = sprites.find((entry) => entry.getItemId() === 'img001');
		t.truthy(sprite, 'fully transparent image still produces a sprite');
		t.is(sprite?.getRectWidth(), 0, 'sprite width matches CLI zero-sized trim result');
		t.is(sprite?.getRectHeight(), 0, 'sprite height matches CLI zero-sized trim result');
		t.is(sprite?.getOriginalWidth(), 66, 'original width metadata is preserved');
		t.is(sprite?.getOriginalHeight(), 44, 'original height metadata is preserved');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('atlas: image disableTrim skips transparent-edge trimming when trimImage is enabled', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-atlas-disable-trim-'));
	const imageDir = path.join(tmpDir, 'TrimPkg', 'images');
	try {
		await fs.mkdir(imageDir, { recursive: true });
		// 20x20 transparent canvas with a 4x4 opaque center at (8, 8).
		const raw = new Uint8Array(20 * 20 * 4);
		for (let y = 8; y < 12; y++) {
			for (let x = 8; x < 12; x++) {
				const offset = (y * 20 + x) * 4;
				raw[offset] = 255;
				raw[offset + 1] = 80;
				raw[offset + 2] = 40;
				raw[offset + 3] = 255;
			}
		}
		const png = await sharp(raw, { raw: { width: 20, height: 20, channels: 4 } })
			.png()
			.toBuffer();
		await fs.writeFile(path.join(imageDir, 'trimmed.png'), png);
		await fs.writeFile(path.join(imageDir, 'untrimmed.png'), png);

		const doc = new Document();
		const pkg = doc.createPackage('TrimPkg').setId('trimpkg2');
		const trimmed = doc
			.createImageResource('trimmed')
			.setId('imgTrim')
			.setPath('/images/')
			.setFileName('trimmed.png')
			.setWidth(20)
			.setHeight(20)
			.setExported(true);
		const untrimmed = doc
			.createImageResource('untrimmed')
			.setId('imgNoTrim')
			.setPath('/images/')
			.setFileName('untrimmed.png')
			.setWidth(20)
			.setHeight(20)
			.setDisableTrim(true)
			.setExported(true);
		pkg.addResource(trimmed).addResource(untrimmed);

		await doc.transform(
			atlas({
				encoder: sharp,
				basePath: tmpDir,
				outputPath: tmpDir,
				mkdir: async (dir) => {
					await fs.mkdir(dir, { recursive: true });
				},
				trimImage: true,
				allowRotation: false,
				powerOfTwo: true,
				maxSize: 256,
			}),
		);

		const sprites = pkg.listAtlases().flatMap((atlasNode) => atlasNode.listSprites());
		const trimmedSprite = sprites.find((entry) => entry.getItemId() === 'imgTrim')!;
		const untrimmedSprite = sprites.find((entry) => entry.getItemId() === 'imgNoTrim')!;
		t.is(trimmedSprite.getRectWidth(), 4, 'regular image is trimmed to 4x4');
		t.is(trimmedSprite.getRectHeight(), 4);
		t.is(trimmedSprite.getOffsetX(), 8);
		t.is(trimmedSprite.getOffsetY(), 8);
		t.is(untrimmedSprite.getRectWidth(), 20, 'disableTrim image keeps untrimmed 20x20 bounds');
		t.is(untrimmedSprite.getRectHeight(), 20);
		t.is(untrimmedSprite.getOffsetX(), 0);
		t.is(untrimmedSprite.getOffsetY(), 0);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('atlas: rasterizes declared-size SVGs before trim and composite', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-atlas-svg-'));
	const imageDir = path.join(tmpDir, 'Icons', 'images');
	const imagePath = path.join(imageDir, 'save.svg');

	try {
		await fs.mkdir(imageDir, { recursive: true });
		await fs.writeFile(
			imagePath,
			'<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" fill="#bdbdbd"/></svg>',
		);

		const doc = new Document();
		const pkg = doc.createPackage('Icons');
		pkg.setId('svg00001');

		const img = doc.createImageResource('save.svg');
		img.setId('svg001').setPath('/images/').setWidth(16).setHeight(16).setExported(true);
		pkg.addResource(img);

		await doc.transform(
			atlas({
				encoder: sharp,
				basePath: tmpDir,
				outputPath: tmpDir,
				mkdir: async (dir) => {
					await fs.mkdir(dir, { recursive: true });
				},
				trimImage: true,
				powerOfTwo: true,
				maxSize: 256,
			}),
		);

		const sprite = pkg
			.listAtlases()
			.flatMap((atlasNode) => atlasNode.listSprites())
			.find((entry) => entry.getItemId() === 'svg001');

		t.truthy(sprite, 'SVG produces an atlas sprite');
		t.is(sprite?.getRectWidth(), 16, 'trim uses the declared SVG width');
		t.is(sprite?.getRectHeight(), 16, 'trim uses the declared SVG height');
		t.is(sprite?.getOriginalWidth(), 16, 'sprite source width remains declared width');
		t.is(sprite?.getOriginalHeight(), 16, 'sprite source height remains declared height');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('atlas: direct single PNG output keeps portrait sprite unrotated for Unity bytes', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-atlas-direct-'));
	const imageDir = path.join(tmpDir, 'BundleUsage');
	const imagePath = path.join(imageDir, 'sword.png');

	try {
		await fs.mkdir(imageDir, { recursive: true });
		await sharp({
			create: {
				width: 104,
				height: 512,
				channels: 4,
				background: { r: 255, g: 0, b: 0, alpha: 1 },
			},
		})
			.png()
			.toFile(imagePath);

		const doc = new Document();
		const pkg = doc.createPackage('BundleUsage');
		pkg.setId('bundle001');

		const img = doc.createImageResource('sword');
		img.setId('fou91').setPath('/').setWidth(104).setHeight(512).setExported(true).setFileName('sword.png');
		pkg.addResource(img);

		await doc.transform(
			atlas({
				encoder: sharp,
				basePath: tmpDir,
				outputPath: tmpDir,
				mkdir: async (dir) => {
					await fs.mkdir(dir, { recursive: true });
				},
				powerOfTwo: true,
				allowRotation: true,
				maxSize: 1024,
				directSingleImageOutput: true,
			}),
		);

		const atlases = pkg.listAtlases();
		t.is(atlases.length, 1, 'one direct-output atlas created');
		const sprites = atlases[0].listSprites();
		t.is(sprites.length, 1, 'one sprite created');
		t.is(sprites[0]?.getItemId(), 'fou91');
		t.is(sprites[0]?.getRectWidth(), 104, 'sprite width stays unrotated');
		t.is(sprites[0]?.getRectHeight(), 512, 'sprite height stays unrotated');
		t.false(sprites[0]?.getRotated() ?? true, 'sprite is not rotated');

		const atlasPath = path.join(tmpDir, 'BundleUsage_atlas0.png');
		const metadata = await sharp(atlasPath).metadata();
		t.is(metadata.width, 128, 'atlas width expands to next power of two');
		t.is(metadata.height, 512, 'atlas height keeps original power of two size');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('atlas: standalone textureSetMode and fixed page outputs use editor-style file names', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-atlas-texture-set-mode-'));
	const imageDir = path.join(tmpDir, 'AtlasModes', 'images');
	const coverPath = path.join(imageDir, 'cover.jpg');
	const iconPath = path.join(imageDir, 'icon.png');
	const badgePath = path.join(imageDir, 'badge.png');

	try {
		await fs.mkdir(imageDir, { recursive: true });
		await sharp({
			create: {
				width: 320,
				height: 180,
				channels: 3,
				background: { r: 120, g: 40, b: 30 },
			},
		})
			.jpeg()
			.toFile(coverPath);
		await sharp({
			create: {
				width: 64,
				height: 64,
				channels: 4,
				background: { r: 30, g: 120, b: 220, alpha: 1 },
			},
		})
			.png()
			.toFile(iconPath);
		await sharp({
			create: {
				width: 48,
				height: 48,
				channels: 4,
				background: { r: 220, g: 180, b: 30, alpha: 1 },
			},
		})
			.png()
			.toFile(badgePath);

		const doc = new Document();
		const pkg = doc.createPackage('AtlasModes');
		pkg.setId('atlasmodes01');

		const cover = doc.createImageResource('cover');
		cover
			.setId('cover01')
			.setPath('/images/')
			.setWidth(320)
			.setHeight(180)
			.setExported(true)
			.setTextureSetMode('alone_npot')
			.setFileName('cover.jpg');
		pkg.addResource(cover);

		const icon = doc.createImageResource('icon');
		icon.setId('icon01').setPath('/images/').setWidth(64).setHeight(64).setExported(true).setFileName('icon.png');
		pkg.addResource(icon);

		const badge = doc.createImageResource('badge');
		badge
			.setId('badge01')
			.setPath('/images/')
			.setWidth(48)
			.setHeight(48)
			.setExported(true)
			.setTextureSetMode('12')
			.setFileName('badge.png');
		pkg.addResource(badge);

		await doc.transform(
			atlas({
				encoder: sharp,
				basePath: tmpDir,
				outputPath: tmpDir,
				mkdir: async (dir) => {
					await fs.mkdir(dir, { recursive: true });
				},
				powerOfTwo: true,
				maxSize: 512,
				maxAtlasIndex: 12,
				directSingleImageOutput: true,
			}),
		);

		const files = new Set((await fs.readdir(tmpDir)).filter((entry) => entry.startsWith('AtlasModes_atlas')));
		t.true(files.has('AtlasModes_atlas_cover01.jpg'), 'standalone image writes resource-id atlas file');
		t.true(files.has('AtlasModes_atlas12.png'), 'fixed page atlas respects the package maximum index');
		t.true(files.has('AtlasModes_atlas0.png'), 'auto atlas uses the first unreserved page');
		t.false(files.has('AtlasModes_atlas1.png'), 'no unexpected extra page is emitted');

		const atlasFiles = pkg
			.listAtlases()
			.map((atlasNode) => atlasNode.getFile())
			.sort();
		t.deepEqual(
			atlasFiles,
			['AtlasModes_atlas0.png', 'AtlasModes_atlas12.png', 'AtlasModes_atlas_cover01.jpg'],
			'atlas nodes keep standalone and fixed-page file names',
		);
		const standaloneAtlas = pkg.listAtlases().find((a) => a.getFile() === 'AtlasModes_atlas_cover01.jpg');
		t.is(standaloneAtlas?.getName(), 'atlas_cover01', 'standalone atlas uses atlas_<itemId> ID');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('atlas: external bitmap font texture attaches font sprite without writing transient extras', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-atlas-font-extras-'));
	const pkgDir = path.join(tmpDir, 'Fonts');
	const texPath = path.join(pkgDir, 'bitmap_font.png');

	try {
		await fs.mkdir(pkgDir, { recursive: true });
		await sharp({
			create: {
				width: 64,
				height: 64,
				channels: 4,
				background: { r: 255, g: 255, b: 255, alpha: 1 },
			},
		})
			.png()
			.toFile(texPath);

		const doc = new Document();
		const pkg = doc.createPackage('Fonts');
		pkg.setId('fonts001');

		const tex = doc.createImageResource('bitmap_font');
		tex.setId('tex01').setPath('/').setWidth(64).setHeight(64).setExported(false).setFileName('bitmap_font.png');
		pkg.addResource(tex);

		const font = doc.createFontResource('score');
		font.setId('fnt01').setPath('/').setExported(true).setTextureId('tex01').setFileName('score.fnt');
		pkg.addResource(font);

		await doc.transform(
			atlas({
				encoder: sharp,
				basePath: tmpDir,
				outputPath: tmpDir,
				mkdir: async (dir) => {
					await fs.mkdir(dir, { recursive: true });
				},
				powerOfTwo: true,
				maxSize: 256,
			}),
		);

		const spriteIds = pkg
			.listAtlases()
			.flatMap((atlasNode) => atlasNode.listSprites())
			.map((sprite) => sprite.getItemId());
		t.true(spriteIds.includes('tex01'), 'font texture image sprite is packed');
		t.true(spriteIds.includes('fnt01'), 'external bitmap font alias sprite is attached via formal textureId');
		t.false('_fontSpriteAlias' in font.getExtras(), 'font resource extras are not polluted with transient alias');
		t.deepEqual(font.getExtras(), {}, 'font resource extras stay empty');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('atlas: folder atlas inheritance, duplicatePadding pixel extrusion, fixed-page multiPage & branch sharing, and SVG standalone png ext', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-atlas-p4-'));
	const pkgDir = path.join(tmpDir, 'P4Pkg');
	const nestedDir = path.join(pkgDir, 'ui', 'icons');
	const branchNestedDir = path.join(`${tmpDir}_dev`, 'P4Pkg', 'ui', 'icons');
	try {
		await fs.mkdir(nestedDir, { recursive: true });
		await fs.mkdir(branchNestedDir, { recursive: true });
		const redPng = await sharp({
			create: { width: 20, height: 20, channels: 4, background: { r: 255, g: 10, b: 20, alpha: 1 } },
		})
			.png()
			.toBuffer();
		const bluePng = await sharp({
			create: { width: 20, height: 20, channels: 4, background: { r: 10, g: 20, b: 255, alpha: 1 } },
		})
			.png()
			.toBuffer();
		await fs.writeFile(path.join(nestedDir, 'a.png'), redPng);
		await fs.writeFile(path.join(branchNestedDir, 'b.png'), bluePng);
		await fs.writeFile(
			path.join(pkgDir, 'vec.svg'),
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#00ff00"/></svg>',
		);

		const doc = new Document();
		doc.getRoot().setBranches(['dev']);
		const pkg = doc.createPackage('P4Pkg').setId('p4pkg001');
		pkg.setResourceFolders([{ branch: '', path: '/ui/', favorite: false, atlas: '2' }]);

		const imgA = doc
			.createImageResource('a')
			.setId('imgA')
			.setPath('/ui/icons/')
			.setFileName('a.png')
			.setWidth(20)
			.setHeight(20)
			.setDuplicatePadding(true)
			.setExported(true);
		const imgB = doc
			.createImageResource('b')
			.setId('imgB')
			.setBranch('dev')
			.setPath('/ui/icons/')
			.setFileName('b.png')
			.setWidth(20)
			.setHeight(20)
			.setExported(true);
		const svg = doc
			.createImageResource('vec')
			.setId('svg01')
			.setPath('/')
			.setFileName('vec.svg')
			.setWidth(16)
			.setHeight(16)
			.setTextureSetMode('alone_npot')
			.setExported(true);
		pkg.addResource(imgA).addResource(imgB).addResource(svg);

		// Max size 32 forces fixed page 2 (20x20 + 20x20) to spill onto a second overflow page via multiPage=true.
		await doc.transform(
			atlas({
				encoder: sharp,
				basePath: tmpDir,
				outputPath: tmpDir,
				mkdir: async (dir) => {
					await fs.mkdir(dir, { recursive: true });
				},
				maxSize: 32,
				padding: 2,
				powerOfTwo: false,
				multiPage: true,
				separatedAtlasForBranch: false,
			}),
		);

		const atlases = pkg.listAtlases();
		const svgAtlas = atlases.find((entry) => entry.getName() === 'atlas_svg01');
		t.truthy(svgAtlas, 'standalone SVG uses atlas_<itemId> name');
		t.is(svgAtlas?.getFile(), 'P4Pkg_atlas_svg01.png', 'standalone SVG uses .png raster output extension');

		// Both imgA (main) and imgB (dev) inherited /ui/ -> atlas '2', shared the fixed group, and spilled to overflow page.
		const fixedPrimary = atlases.find((entry) => entry.getFile() === 'P4Pkg_atlas2.png');
		const fixedOverflow = atlases.find((entry) => entry.getFile() === 'P4Pkg_atlas2_1.png');
		t.truthy(fixedPrimary, 'ancestor folder atlas="2" placed images on fixed page 2');
		t.truthy(fixedOverflow, 'fixed page group honors multiPage=true and creates overflow page without colliding');

		// Verify duplicatePadding actually extruded 1px red border around imgA.
		const imgAAtlas = atlases.find((entry) => entry.listSprites().some((sp) => sp.getItemId() === 'imgA'))!;
		const spriteA = imgAAtlas.listSprites().find((sp) => sp.getItemId() === 'imgA')!;
		const { data, info } = await sharp(path.join(tmpDir, imgAAtlas.getFile()))
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });
		const pixelAt = (px: number, py: number) => {
			const offset = (py * info.width + px) * info.channels;
			return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
		};
		const x = spriteA.getRectX();
		const y = spriteA.getRectY();
		const w = spriteA.getRectWidth();
		const h = spriteA.getRectHeight();
		t.true(x >= 1 && y >= 1, 'duplicatePadding sprite is offset by >=1px');
		t.deepEqual(pixelAt(x - 1, y), [255, 10, 20, 255], 'left edge pixel duplicated');
		t.deepEqual(pixelAt(x + w, y), [255, 10, 20, 255], 'right edge pixel duplicated');
		t.deepEqual(pixelAt(x, y - 1), [255, 10, 20, 255], 'top edge pixel duplicated');
		t.deepEqual(pixelAt(x, y + h), [255, 10, 20, 255], 'bottom edge pixel duplicated');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
		await fs.rm(`${tmpDir}_dev`, { recursive: true, force: true });
	}
});
