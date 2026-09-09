import { NULL_STRING_INDEX, EMPTY_STRING_INDEX } from '../constants.js';

/**
 * Big-endian binary buffer reader that mirrors the FairyGUI runtime `ByteBuffer`.
 *
 * Block navigation uses a compact index table written at the start of the data
 * section. Call {@link seek} to jump to a named block before reading its fields.
 *
 * @internal
 */
export class ByteBuffer {
	private readonly _view: DataView;
	private _pos: number = 0;

	public version: number = 0;
	public stringTable: string[] = [];

	constructor(buffer: ArrayBufferLike, byteOffset = 0, byteLength?: number) {
		const len = byteLength ?? buffer.byteLength - byteOffset;
		this._view = new DataView(buffer, byteOffset, len);
	}

	get pos(): number { return this._pos; }
	set pos(v: number) {
		if (!Number.isInteger(v) || v < 0 || v > this.byteLength) throw new RangeError('Binary buffer position is out of bounds.');
		this._pos = v;
	}
	get buffer(): ArrayBufferLike { return this._view.buffer; }
	get byteOffset(): number { return this._view.byteOffset; }
	get byteLength(): number { return this._view.byteLength; }

	skip(count: number): void { this.pos = this._pos + count; }

	private assertAvailable(count: number): void {
		if (!Number.isInteger(count) || count < 0 || count > this.byteLength - this._pos) {
			throw new RangeError('Binary buffer read is out of bounds.');
		}
	}

	getUint8(): number { return this._view.getUint8(this._pos++); }
	getInt8(): number { return this._view.getInt8(this._pos++); }

	getUint16(): number {
		const v = this._view.getUint16(this._pos, false);
		this._pos += 2;
		return v;
	}
	getInt16(): number {
		const v = this._view.getInt16(this._pos, false);
		this._pos += 2;
		return v;
	}
	getUint32(): number {
		const v = this._view.getUint32(this._pos, false);
		this._pos += 4;
		return v;
	}
	getInt32(): number {
		const v = this._view.getInt32(this._pos, false);
		this._pos += 4;
		return v;
	}
	getFloat32(): number {
		const v = this._view.getFloat32(this._pos, false);
		this._pos += 4;
		return v;
	}

	readByte(): number { return this.getUint8(); }
	readBool(): boolean { return this.getUint8() === 1; }
	readInt32(): number { return this.getInt32(); }
	readUint16(): number { return this.getUint16(); }

	/** Read a uint16-prefixed UTF-8 string. */
	readUTFString(): string {
		const len = this.getUint16();
		return this.getCustomString(len);
	}

	/** Read a raw UTF-8 string of exactly `len` bytes (no length prefix). */
	getCustomString(len: number): string {
		this.assertAvailable(len);
		const bytes = new Uint8Array(this._view.buffer, this._view.byteOffset + this._pos, len);
		this._pos += len;
		return new TextDecoder('utf-8').decode(bytes);
	}

	/**
	 * Read a uint16 string-table index and return the corresponding string.
	 * Returns `null` for index 65534 (null sentinel) and `""` for 65533 (empty).
	 */
	readS(): string | null {
		const index = this.getUint16();
		if (index === NULL_STRING_INDEX) return null;
		if (index === EMPTY_STRING_INDEX) return '';
		if (index >= this.stringTable.length) throw new RangeError(`Invalid string table index ${index}.`);
		return this.stringTable[index]!;
	}

	readSArray(cnt: number): string[] {
		const result: string[] = [];
		for (let i = 0; i < cnt; i++) result.push(this.readS() ?? '');
		return result;
	}

	/** Read a uint32-prefixed sub-buffer slice (shares the same underlying ArrayBuffer). */
	readBuffer(count = this.getUint32()): ByteBuffer {
		this.assertAvailable(count);
		const ba = new ByteBuffer(this._view.buffer, this._view.byteOffset + this._pos, count);
		this._pos += count;
		ba.stringTable = this.stringTable;
		ba.version = this.version;
		return ba;
	}

	/**
	 * Navigate to a section by block index using the index table at `indexTablePos`.
	 *
	 * Index table layout:
	 *   uint8  segCount
	 *   uint8  useShort (1 = uint16 offsets, 0 = uint32 offsets)
	 *   uint16[] or uint32[]  offsets (relative to indexTablePos)
	 *
	 * Sections: 0=Dependencies, 1=Items, 2=Sprites, 3=PixelHitTest, 4=StringTable, 5=CustomStrings
	 */
	seek(indexTablePos: number, blockIndex: number): boolean {
		const saved = this._pos;
		if (!Number.isInteger(blockIndex) || blockIndex < 0) throw new RangeError('Invalid block index.');
		this.pos = indexTablePos;
		const segCount = this.getUint8();
		if (blockIndex < segCount) {
			const useShort = this.getUint8() === 1;
			let newPos: number;
			if (useShort) {
				this.skip(2 * blockIndex);
				newPos = this.getUint16();
			} else {
				this.skip(4 * blockIndex);
				newPos = this.getUint32();
			}
			if (newPos > 0) {
				this.pos = indexTablePos + newPos;
				return true;
			}
		}
		this._pos = saved;
		return false;
	}
}
