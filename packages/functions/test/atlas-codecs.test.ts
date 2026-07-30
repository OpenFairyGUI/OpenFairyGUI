import test from 'ava';
import { parseFnt } from '../src/atlas/font.js';
import { extractJtaFrames } from '../src/atlas/jta.js';

test('atlas codecs parse standalone BMFont metadata and embedded PNG frames', (t) => {
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

	const png = Uint8Array.from(Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlJkAAAAASUVORK5CYII=',
		'base64',
	));
	const extracted = extractJtaFrames(png);
	t.is(extracted.frames.length, 1);
	t.deepEqual(extracted.frames[0], png);
	t.is(extracted.meta, undefined);
});
