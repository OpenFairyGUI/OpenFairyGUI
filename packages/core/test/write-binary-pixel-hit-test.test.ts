import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ByteBuffer } from '../src/io/byte-buffer.js';
import { FGUI_MAGIC } from '../src/constants.js';
import { Document } from '../src/index.js';
import { NodeIO } from '../src/node.js';

test('binary writer: emits pixel hit test block when image resource provides pixel hit test data', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('PixelHitTestPkg');
	pkg.setId('pkg_pixel');

		const image = doc.createImageResource('hit');
	image.setId('img_hit');
	image.setPath('/');
	image.setExported(true);
	image.setWidth(8);
	image.setHeight(8);
		image.setPixelHitTestData({
			pixelWidth: 4,
			scaleDenominator: 2,
			pixels: new Uint8Array([0xaa, 0x55]),
		});
	pkg.addResource(image);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pht-'));
	const outPath = path.join(tmpDir, 'pixel-hit.bytes');

	try {
		await io.writeBinary(doc, outPath);
		const raw = await fs.readFile(outPath);
		const buf = new ByteBuffer(raw.buffer, raw.byteOffset, raw.byteLength);

		t.is(buf.getUint32(), FGUI_MAGIC, 'binary header contains FairyGUI magic');
		buf.getInt32(); // version
		t.false(buf.readBool(), 'test output is uncompressed by default');
		buf.readUTFString(); // packageId
		buf.readUTFString(); // packageName
		buf.skip(20);

		const indexTablePos = buf.pos;
		t.true(buf.seek(indexTablePos, 4), 'string table block is present');
		const strCnt = buf.getInt32();
		const stringTable: string[] = [];
		for (let i = 0; i < strCnt; i++) stringTable[i] = buf.readUTFString();
		buf.stringTable = stringTable;

		t.true(buf.seek(indexTablePos, 3), 'pixel hit test block is present');
		t.is(buf.getInt16(), 1, 'one pixel hit test entry is written');

		const nextPos = buf.getInt32() + buf.pos;
		t.is(buf.readS(), 'img_hit', 'pixel hit test item id matches image resource id');
		t.is(buf.getInt32(), 0, 'deprecated offset field is zeroed');
		t.is(buf.getInt32(), 4, 'pixelWidth is preserved');
		t.is(buf.getUint8(), 2, 'scale 0.5 is written as denominator 2');
		const byteLen = buf.getInt32();
		t.is(byteLen, 2, 'pixel data length is preserved');
		t.is(buf.getUint8(), 0xaa, 'first pixel data byte matches');
		t.is(buf.getUint8(), 0x55, 'second pixel data byte matches');
		t.is(buf.pos, nextPos, 'entry nextPos points to the end of the payload');

		const doc2 = await io.readBinary(outPath);
		const pkg2 = doc2.getRoot().listPackages()[0];
		const image2 = pkg2.listImageResources()[0];
		const roundTrip = image2.getPixelHitTestData();
		t.truthy(roundTrip, 'pixel hit test data survives round-trip');
		t.is(roundTrip?.pixelWidth, 4, 'round-trip pixelWidth matches');
		t.is(roundTrip?.scaleDenominator, 2, 'round-trip scale denominator matches');
		t.deepEqual(Array.from(roundTrip?.pixels ?? []), [0xaa, 0x55], 'round-trip pixel bytes match');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});
