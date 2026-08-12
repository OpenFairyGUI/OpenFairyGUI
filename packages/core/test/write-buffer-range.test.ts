import test from 'ava';
import { WriteBuffer } from '../src/io/write-buffer.js';

test('WriteBuffer rejects integer truncation and reserved string-table indexes', (t) => {
	const buffer = new WriteBuffer();
	t.throws(() => buffer.writeUint8(256), { instanceOf: RangeError });
	t.throws(() => buffer.writeInt16(32768), { instanceOf: RangeError });
	t.throws(() => buffer.writeUint16(-1), { instanceOf: RangeError });
	t.throws(() => buffer.writeInt32(1.5), { instanceOf: RangeError });
	t.throws(() => buffer.writeFloat32(Number.POSITIVE_INFINITY), { instanceOf: RangeError });
	t.throws(() => buffer.writeUTFString('x'.repeat(65536)), { instanceOf: RangeError });
});
