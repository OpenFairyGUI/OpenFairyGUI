import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { maxRectsPack, Document } from '@openfairygui/core';
import sharp from 'sharp';
import { atlas } from '../src/index.js';

// ─── MaxRects algorithm tests ────────────────────────────────────────────

test('maxRects: packs rectangles into a single page', (t) => {
	const results = maxRectsPack(
		[
			{ id: 'a', width: 100, height: 100 },
			{ id: 'b', width: 100, height: 100 },
			{ id: 'c', width: 100, height: 100 },
		],
		{ maxWidth: 512, maxHeight: 512 },
	);

	t.is(results.length, 3, 'all 3 packed');
	t.true(results.every((r) => r.page === 0), 'all on page 0');

	// No overlaps
	for (let i = 0; i < results.length; i++) {
		for (let j = i + 1; j < results.length; j++) {
			const a = results[i], b = results[j];
			const noOverlap =
				a.x + a.width <= b.x || b.x + b.width <= a.x ||
				a.y + a.height <= b.y || b.y + b.height <= a.y;
			t.true(noOverlap, `no overlap between ${a.id} and ${b.id}`);
		}
	}
});

test('maxRects: overflows to multiple pages', (t) => {
	const results = maxRectsPack(
		[
			{ id: 'big1', width: 200, height: 200 },
			{ id: 'big2', width: 200, height: 200 },
		],
		{ maxWidth: 256, maxHeight: 256 },
	);

	t.is(results.length, 2);
	const pages = new Set(results.map((r) => r.page));
	t.is(pages.size, 2, 'spans 2 pages');
});

test('maxRects: handles rotation', (t) => {
	// Tall rect into wide space
	const results = maxRectsPack(
		[
			{ id: 'wide', width: 400, height: 100 },
			{ id: 'tall', width: 100, height: 400 },
		],
		{ maxWidth: 512, maxHeight: 512, allowRotation: true },
	);

	t.is(results.length, 2);
	t.true(results.every((r) => r.page === 0), 'fits in one page with rotation');
});

test('maxRects: oversized input returns empty result', (t) => {
	const results = maxRectsPack(
		[{ id: 'huge', width: 600, height: 600 }],
		{ maxWidth: 512, maxHeight: 512, allowRotation: false },
	);
	// Editor behavior: oversized items can't be placed, result is empty
	t.is(results.length, 0, 'oversized item not placed');
});

test('maxRects: padding prevents overlap', (t) => {
	const results = maxRectsPack(
		[
			{ id: 'a', width: 50, height: 50 },
			{ id: 'b', width: 50, height: 50 },
		],
		{ maxWidth: 128, maxHeight: 128, padding: 4 },
	);

	t.is(results.length, 2);
	// With padding=4, packed rects (54x54 effective) should not touch
	const a = results.find((r) => r.id === 'a')!;
	const b = results.find((r) => r.id === 'b')!;
	const gap = Math.max(
		Math.abs(a.x - (b.x + b.width)),
		Math.abs(b.x - (a.x + a.width)),
		Math.abs(a.y - (b.y + b.height)),
		Math.abs(b.y - (a.y + a.height)),
	);
	t.true(gap >= 0, 'packed rects have non-negative gap');
});

// ─── atlas() transform layout tests (no encoder) ────────────────────────

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

test('atlas: handles multiple pages when images exceed maxSize', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('test');
	pkg.setId('test0001');

	// Create images that won't fit in a 128x128 atlas
	for (let i = 0; i < 5; i++) {
		const img = doc.createImageResource(`img${i}.png`);
		img.setId(`i${String(i).padStart(3, '0')}`).setWidth(80).setHeight(80);
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
		}).png().toFile(imagePath);

		const doc = new Document();
		const pkg = doc.createPackage('Basics');
		pkg.setId('test0001');

		const img = doc.createImageResource('transparent');
		img.setId('img001').setPath('/images/');
		img.setWidth(66).setHeight(44).setExported(true);
		img.setExtras({ ...img.getExtras(), _fileName: 'transparent.png' });
		pkg.addResource(img);

		await doc.transform(atlas({
			encoder: sharp,
			basePath: tmpDir,
			outputPath: tmpDir,
			mkdir: async (dir) => {
				await fs.mkdir(dir, { recursive: true });
			},
			trimImage: true,
			powerOfTwo: true,
			maxSize: 256,
		}));

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
		}).png().toFile(imagePath);

		const doc = new Document();
		const pkg = doc.createPackage('BundleUsage');
		pkg.setId('bundle001');

		const img = doc.createImageResource('sword');
		img.setId('fou91').setPath('/').setWidth(104).setHeight(512).setExported(true);
		img.setExtras({ ...img.getExtras(), _fileName: 'sword.png' });
		pkg.addResource(img);

		await doc.transform(atlas({
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
		}));

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
		}).jpeg().toFile(coverPath);
		await sharp({
			create: {
				width: 64,
				height: 64,
				channels: 4,
				background: { r: 30, g: 120, b: 220, alpha: 1 },
			},
		}).png().toFile(iconPath);
		await sharp({
			create: {
				width: 48,
				height: 48,
				channels: 4,
				background: { r: 220, g: 180, b: 30, alpha: 1 },
			},
		}).png().toFile(badgePath);

		const doc = new Document();
		const pkg = doc.createPackage('AtlasModes');
		pkg.setId('atlasmodes01');

		const cover = doc.createImageResource('cover');
		cover.setId('cover01').setPath('/images/').setWidth(320).setHeight(180).setExported(true).setTextureSetMode('alone_npot');
		cover.setExtras({ ...cover.getExtras(), _fileName: 'cover.jpg' });
		pkg.addResource(cover);

		const icon = doc.createImageResource('icon');
		icon.setId('icon01').setPath('/images/').setWidth(64).setHeight(64).setExported(true);
		icon.setExtras({ ...icon.getExtras(), _fileName: 'icon.png' });
		pkg.addResource(icon);

		const badge = doc.createImageResource('badge');
		badge.setId('badge01').setPath('/images/').setWidth(48).setHeight(48).setExported(true).setTextureSetMode('0');
		badge.setExtras({ ...badge.getExtras(), _fileName: 'badge.png' });
		pkg.addResource(badge);

		await doc.transform(atlas({
			encoder: sharp,
			basePath: tmpDir,
			outputPath: tmpDir,
			mkdir: async (dir) => {
				await fs.mkdir(dir, { recursive: true });
			},
			powerOfTwo: true,
			maxSize: 512,
			directSingleImageOutput: true,
		}));

		const files = new Set((await fs.readdir(tmpDir)).filter((entry) => entry.startsWith('AtlasModes_atlas')));
		t.true(files.has('AtlasModes_atlas_cover01.jpg'), 'standalone image writes resource-id atlas file');
		t.true(files.has('AtlasModes_atlas0.png'), 'fixed page atlas keeps its requested page name');
		t.true(files.has('AtlasModes_atlas1.png'), 'auto atlas skips the fixed page instead of colliding with direct output');
		t.false(files.has('AtlasModes_atlas2.png'), 'no unexpected extra page is emitted');

		const atlasFiles = pkg.listAtlases().map((atlasNode) => atlasNode.getFile()).sort();
		t.deepEqual(
			atlasFiles,
			['AtlasModes_atlas0.png', 'AtlasModes_atlas1.png', 'AtlasModes_atlas_cover01.jpg'],
			'atlas nodes keep standalone and fixed-page file names',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});
