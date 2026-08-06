import test from 'ava';
import { createTestMovieClipJta } from '@openfairygui/test-utils';
import { parseFnt } from '../src/atlas/font.js';
import { extractJtaFrames, prepareJtaForPublish } from '../src/atlas/jta.js';
import type { AtlasRasterBackend, AtlasRasterPipeline } from '../src/publish/contracts.js';
import { createTestJta, TEST_JPEG, TEST_PNG } from './test-jta.js';

test('atlas codecs parse standalone BMFont metadata', (t) => {
	const font = parseFnt([
		'info face=Demo size=16 colored=true resizable=true',
		'common lineHeight=18 xadvance=17',
		'char id=65 x=1 y=2 width=3 height=4 xoffset=5 yoffset=6 xadvance=7 chnl=4',
	].join('\n'));
	t.like(font, {
		hasFace: true,
		colored: true,
		resizable: true,
		hasChannel: true,
		fontSize: 16,
		xadvance: 17,
		lineHeight: 18,
	});
	t.deepEqual(font.glyphs, [{
		charId: 65,
		img: null,
		x: 1,
		y: 2,
		xoffset: 5,
		yoffset: 6,
		width: 3,
		height: 4,
		xadvance: 7,
		channel: 4,
	}]);
});

test('JTA extraction follows the authoritative texture table and frame references', async (t) => {
	const png = TEST_PNG;
	const jpeg = TEST_JPEG;
	const jta = createTestJta(
		[png, jpeg],
		[
			{ textureIndex: 1, rectX: 3, rectY: 4, rectWidth: 5, rectHeight: 6 },
			{ textureIndex: 0 },
			{ textureIndex: 1 },
			{ textureIndex: -1 },
		],
		{ fps: 20, speed: 2, repeatDelay: 3, swing: true, width: 80, height: 60 },
	);

	const extracted = extractJtaFrames(jta);
	t.deepEqual(extracted.frames, [png, jpeg]);
	t.deepEqual(extracted.meta, {
		interval: 100,
		repeatDelay: 150,
		swing: true,
		width: 80,
		height: 60,
		frames: [
			{ addDelay: 0, offsetX: 3, offsetY: 4, width: 5, height: 6, textureIndex: 1 },
			{ addDelay: 0, offsetX: 0, offsetY: 0, width: 1, height: 1, textureIndex: 0 },
			{ addDelay: 0, offsetX: 0, offsetY: 0, width: 1, height: 1, textureIndex: 1 },
			{ addDelay: 0, offsetX: 0, offsetY: 0, width: 1, height: 1, textureIndex: -1 },
		],
	});

	const decoded: Uint8Array[] = [];
	const encoder = ((input: Uint8Array) => {
		decoded.push(input);
		return {
			png() {
				return this;
			},
			toBuffer: async () => TEST_PNG,
			} as unknown as AtlasRasterPipeline;
	}) as unknown as AtlasRasterBackend;
	const prepared = await prepareJtaForPublish(jta, encoder, 'Demo/fx.jta');
	t.deepEqual(
		prepared.referencedTextures.map(({ textureIndex, firstFrameIndex }) => ({ textureIndex, firstFrameIndex })),
		[
			{ textureIndex: 0, firstFrameIndex: 1 },
			{ textureIndex: 1, firstFrameIndex: 0 },
		],
		'textures retain JTA table order and repeated references decode once',
	);
	t.deepEqual(decoded, [png, jpeg]);
	t.true(prepared.referencedTextures.every((texture) => texture.buffer === TEST_PNG));
});

test('JTA preparation rejects invalid, empty, truncated, and corrupt referenced textures', async (t) => {
	const encoder = ((_input: Uint8Array) => {
		return {
			png() {
				return this;
			},
			toBuffer: async () => TEST_PNG,
		} as unknown as AtlasRasterPipeline;
	}) as AtlasRasterBackend;
	const blankFrame = await prepareJtaForPublish(
		createTestJta([new Uint8Array(0)], [{ textureIndex: -1 }]),
		encoder,
		'blank-frame.jta',
	);
	t.deepEqual(blankFrame.referencedTextures, [], '`-1` blank frames do not decode an unreferenced empty slot');

	await t.throwsAsync(
		() => prepareJtaForPublish(createTestJta([new Uint8Array([1])], [{ textureIndex: 1 }]), encoder, 'bad-index.jta'),
		{ message: /texture index 1 is outside/ },
	);
	await t.throwsAsync(
		() => prepareJtaForPublish(createTestJta([new Uint8Array(0)], [{ textureIndex: 0 }]), encoder, 'empty.jta'),
		{ message: /references empty texture 0/ },
	);
	await t.throwsAsync(
		() => prepareJtaForPublish(createTestJta([new Uint8Array([0])], [{ textureIndex: 0 }]), encoder, 'unsupported.jta'),
		{ message: /unsupported raster format; only PNG and JPEG are supported/ },
	);
	await t.throwsAsync(
		() => prepareJtaForPublish(createTestJta([TEST_PNG.subarray(0, 33)], [{ textureIndex: 0 }]), encoder, 'corrupt.jta'),
		{ message: /Could not decode MovieClip/ },
	);
	const valid = createTestJta([TEST_PNG], [{ textureIndex: 0 }]);
	t.throws(() => extractJtaFrames(valid.subarray(0, valid.byteLength - 1)), { message: /truncated texture 0 data/ });
});

for (const version of [100, 101, 102] as const) {
	test(`atlas codec derives complete MovieClip metadata from JTA v${version}`, (t) => {
		const texture = Uint8Array.from([1, 2, 3, version]);
		const extracted = extractJtaFrames(createTestMovieClipJta(version, {
			fps: 25,
			speed: 2,
			repeatDelay: 4,
			swing: true,
			width: 80,
			height: 60,
			frames: [{
				delay: 3,
				rectX: -5,
				rectY: 6,
				rectWidth: 80,
				rectHeight: 54,
				textureIndex: 0,
			}],
			textures: [texture],
		}));

		t.deepEqual(extracted.frames, [texture]);
		t.deepEqual(extracted.meta, {
			interval: 80,
			repeatDelay: 160,
			swing: true,
			width: 80,
			height: 60,
			frames: [{
				addDelay: 120,
				offsetX: -5,
				offsetY: 6,
				width: 80,
				height: 54,
				textureIndex: 0,
			}],
		});
	});
}

test('JTA preparation strictly accepts one-frame PNG/JPEG and rejects truncated sources', async (t) => {
	for (const [name, texture] of [
		['PNG', TEST_PNG],
		['JPEG', TEST_JPEG],
	] as const) {
		const prepared = await prepareJtaForPublish(createTestJta([texture], [{ textureIndex: 0 }]), undefined, `${name}.jta`);
		t.is(prepared.referencedTextures.length, 1, `${name} has one referenced texture`);
		t.is(prepared.referencedTextures[0]?.width, 1);
		t.is(prepared.referencedTextures[0]?.height, 1);
		t.deepEqual(prepared.referencedTextures[0]?.buffer, texture);

		await t.throwsAsync(
			() =>
				prepareJtaForPublish(
					createTestJta([texture.subarray(0, texture.byteLength - 1)], [{ textureIndex: 0 }]),
					undefined,
					`truncated-${name}.jta`,
				),
			{ message: /Could not decode MovieClip/ },
		);
	}
});

test('JTA preparation rejects unsupported WebP, GIF, and TIFF before invoking the host decoder', async (t) => {
	let decoderCalls = 0;
	const encoder = ((_input: Uint8Array) => {
		decoderCalls += 1;
		throw new Error('host decoder must not be called');
	}) as unknown as AtlasRasterBackend;
	const unsupported = [
		['WebP', Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])],
		['GIF', Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])],
		['TIFF', Uint8Array.from([0x49, 0x49, 0x2a, 0x00])],
	] as const;

	for (const [name, texture] of unsupported) {
		await t.throwsAsync(
			() => prepareJtaForPublish(createTestJta([texture], [{ textureIndex: 0 }]), encoder, `${name}.jta`),
			{ message: /unsupported raster format; only PNG and JPEG are supported/ },
		);
	}
	t.is(decoderCalls, 0);
});

test('JTA preflight performs a full host decode before accepting a texture', async (t) => {
	let fullDecodeCalls = 0;
	const encoder = ((_input: Uint8Array) => {
		return {
			png() {
				return this;
			},
			async toBuffer() {
				fullDecodeCalls += 1;
				throw new Error('pixel decode failed');
			},
		} as unknown as AtlasRasterPipeline;
	}) as AtlasRasterBackend;

	await t.throwsAsync(
		() => prepareJtaForPublish(createTestJta([TEST_PNG], [{ textureIndex: 0 }]), encoder, 'decode-fails.jta'),
		{ message: /Could not decode MovieClip/ },
	);
	t.is(fullDecodeCalls, 1);
});
