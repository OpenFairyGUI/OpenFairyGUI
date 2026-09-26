import test from 'ava';
import { assertImageDimensions, MAX_IMAGE_PIXELS } from '../src/adapters/node/image-limits.js';
import { createRestoreImageProcessors } from '../src/adapters/node/restore.js';

test('restore rejects invalid and oversized canvases before opening the source', async (t) => {
	t.notThrows(() => assertImageDimensions(4096, 4096));
	for (const [width, height] of [
		[MAX_IMAGE_PIXELS, 2],
		[0, 1],
		[-1, 10],
		[1.5, 10],
		[Infinity, 1],
	]) {
		t.throws(() => assertImageDimensions(width, height), { instanceOf: RangeError });
	}
	const processors = await createRestoreImageProcessors();
	await t.throwsAsync(
		processors.extractImage({
			sourcePath: 'must-not-be-opened.png',
			left: 0,
			top: 0,
			width: 1,
			height: 1,
			expectedWidth: MAX_IMAGE_PIXELS,
			expectedHeight: 2,
			offsetX: 0,
			offsetY: 0,
			rotated: false,
		}),
		{ instanceOf: RangeError, message: /pixel budget/ },
	);
});
