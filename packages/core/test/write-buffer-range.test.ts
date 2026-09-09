import test from 'ava';
import { WriteBuffer } from '../src/io/write-buffer.js';
import { ByteBuffer } from '../src/io/byte-buffer.js';

test('ByteBuffer bounds are local to the view, including strings and nested buffers', (t) => {
	const bytes = new Uint8Array([0, 4, 65, 66, 67, 68]);
	t.throws(() => new ByteBuffer(bytes.buffer, 0, 2).readUTFString(), { instanceOf: RangeError });
	t.throws(() => new ByteBuffer(bytes.buffer, 2, 1).getCustomString(4), { instanceOf: RangeError });
	const nested = new Uint8Array([0, 0, 0, 2, 65, 66]);
	t.throws(() => new ByteBuffer(nested.buffer, 0, 4).readBuffer(), { instanceOf: RangeError });
	const parent = new ByteBuffer(bytes.buffer, 2, 2);
	t.throws(() => parent.readBuffer(3), { instanceOf: RangeError });
	t.throws(() => parent.skip(3), { instanceOf: RangeError });
	t.throws(() => { parent.pos = -1; }, { instanceOf: RangeError });
	const index = new ByteBuffer(new Uint8Array([0, 7]).buffer);
	index.stringTable = ['one'];
	t.throws(() => index.readS(), { instanceOf: RangeError });
	t.is(new ByteBuffer(bytes.buffer).readUTFString(), 'ABCD');
});

test('WriteBuffer rejects integer truncation and reserved string-table indexes', (t) => {
	const buffer = new WriteBuffer();
	t.throws(() => buffer.writeUint8(256), { instanceOf: RangeError });
	t.throws(() => buffer.writeInt16(32768), { instanceOf: RangeError });
	t.throws(() => buffer.writeUint16(-1), { instanceOf: RangeError });
	t.throws(() => buffer.writeInt32(1.5), { instanceOf: RangeError });
	t.throws(() => buffer.writeFloat32(Number.POSITIVE_INFINITY), { instanceOf: RangeError });
	t.throws(() => buffer.writeUTFString('x'.repeat(65536)), { instanceOf: RangeError });
});
