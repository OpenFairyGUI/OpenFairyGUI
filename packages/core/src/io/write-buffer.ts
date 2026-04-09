import { NULL_STRING_INDEX, EMPTY_STRING_INDEX } from '../constants.js';

/**
 * Growable big-endian binary buffer writer for producing .fui output.
 *
 * Mirrors {@link ByteBuffer}'s read API with symmetric write methods.
 * Internally manages a resizable ArrayBuffer.
 *
 * @internal
 */
export class WriteBuffer {
	private _buf: ArrayBuffer;
	private _view: DataView;
	private _pos: number = 0;

	/** Maps string → index in the string table. Built via {@link addString}. */
	private _stringMap: Map<string, number>;
	/** Ordered list of strings for the string table. */
	private _strings: string[];
	/** Raw custom strings written to block 5, keyed by string table index. */
	private _customStrings: Array<{ index: number; value: string }>;

	constructor(initialSize = 4096, parent?: WriteBuffer) {
		this._buf = new ArrayBuffer(initialSize);
		this._view = new DataView(this._buf);
		if (parent) {
			// Share parent's string table — writeS calls register in parent
			this._stringMap = parent._stringMap;
			this._strings = parent._strings;
			this._customStrings = parent._customStrings;
		} else {
			this._stringMap = new Map();
			this._strings = [];
			this._customStrings = [];
		}
	}

	get pos(): number { return this._pos; }
	set pos(v: number) { this._pos = v; }

	/** Returns a trimmed Uint8Array of everything written so far. */
	toUint8Array(): Uint8Array {
		return new Uint8Array(this._buf, 0, this._pos);
	}

	private _ensure(extra: number): void {
		const needed = this._pos + extra;
		if (needed <= this._buf.byteLength) return;
		let newLen = this._buf.byteLength;
		while (newLen < needed) newLen *= 2;
		const newBuf = new ArrayBuffer(newLen);
		new Uint8Array(newBuf).set(new Uint8Array(this._buf));
		this._buf = newBuf;
		this._view = new DataView(this._buf);
	}

	writeUint8(v: number): void {
		this._ensure(1);
		this._view.setUint8(this._pos++, v);
	}
	writeInt8(v: number): void {
		this._ensure(1);
		this._view.setInt8(this._pos++, v);
	}

	writeUint16(v: number): void {
		this._ensure(2);
		this._view.setUint16(this._pos, v, false);
		this._pos += 2;
	}
	writeInt16(v: number): void {
		this._ensure(2);
		this._view.setInt16(this._pos, v, false);
		this._pos += 2;
	}

	writeUint32(v: number): void {
		this._ensure(4);
		this._view.setUint32(this._pos, v, false);
		this._pos += 4;
	}
	writeInt32(v: number): void {
		this._ensure(4);
		this._view.setInt32(this._pos, v, false);
		this._pos += 4;
	}

	writeFloat32(v: number): void {
		this._ensure(4);
		this._view.setFloat32(this._pos, v, false);
		this._pos += 4;
	}

	writeBool(v: boolean): void {
		this.writeUint8(v ? 1 : 0);
	}

	/** Write a uint16-prefixed UTF-8 string. */
	writeUTFString(s: string): void {
		const encoded = new TextEncoder().encode(s);
		this.writeUint16(encoded.byteLength);
		this._ensure(encoded.byteLength);
		new Uint8Array(this._buf, this._pos, encoded.byteLength).set(encoded);
		this._pos += encoded.byteLength;
	}

	/** Write raw bytes (no length prefix). */
	writeBytes(data: Uint8Array): void {
		this._ensure(data.byteLength);
		new Uint8Array(this._buf, this._pos, data.byteLength).set(data);
		this._pos += data.byteLength;
	}

	/** Write a uint32-prefixed sub-buffer. */
	writeBuffer(data: Uint8Array): void {
		this.writeUint32(data.byteLength);
		this.writeBytes(data);
	}

	/**
	 * Register a string in the string table and return its index.
	 * Returns NULL_INDEX for null, EMPTY_INDEX for empty string.
	 */
	addString(s: string | null | undefined): number {
		if (s === null || s === undefined) return NULL_STRING_INDEX;
		if (s === '') return EMPTY_STRING_INDEX;
		const existing = this._stringMap.get(s);
		if (existing !== undefined) return existing;
		const index = this._strings.length;
		this._strings.push(s);
		this._stringMap.set(s, index);
		return index;
	}

	/** Write a string-table index (uint16). Call addString first to register. */
	writeS(s: string | null | undefined): void {
		this.writeUint16(this.addString(s));
	}

	/**
	 * Write a string-table index matching the editor's writeString behavior.
	 *
	 * @param s - The string to write
	 * @param noCache - If true, always push a new string table entry (no dedup).
	 *   Used for unique text like component text, button titles.
	 * @param treatEmptyAsNull - If true (default), both null and "" → NULL_INDEX.
	 *   If false, null → NULL_INDEX but "" → EMPTY_INDEX.
	 */
	writeSEx(s: string | null | undefined, noCache: boolean = false, treatEmptyAsNull: boolean = true): void {
		// Handle null/empty
		if (treatEmptyAsNull) {
			if (!s) {
				this.writeUint16(NULL_STRING_INDEX);
				return;
			}
		} else {
			if (s === null || s === undefined) {
				this.writeUint16(NULL_STRING_INDEX);
				return;
			}
			if (s.length === 0) {
				this.writeUint16(EMPTY_STRING_INDEX);
				return;
			}
		}

		if (!noCache) {
			// Deduplicated: reuse existing entry
			this.writeUint16(this.addString(s));
		} else {
			// No cache: allocate a unique string-table slot without deduplication.
			// Editor-aligned UI strings still live in the main string table.
			const index = this._strings.length;
			this._strings.push(s);
			this.writeUint16(index);
		}
	}

	/**
	 * Write a color as 4 raw bytes (R, G, B, A) matching the editor's binary format.
	 * The editor writes colors as raw bytes, NOT as string table references.
	 *
	 * @param colorStr - Color string like "#rrggbb", "#rrggbbaa", or "#rgb"
	 * @param hasAlpha - Whether to include alpha channel (4th byte).
	 *   If true, writes the alpha from the color string (or 0xFF if no alpha in string).
	 *   If false, always writes 0xFF for the alpha byte.
	 * @param defaultColor - Default color value if colorStr is empty/null (as 0xAARRGGBB uint32)
	 */
	writeColor(colorStr: string | null | undefined, hasAlpha: boolean = true, defaultColor: number = 0xFF000000): void {
		let color = defaultColor;
		if (colorStr && colorStr.length > 0) {
			color = parseHtmlColor(colorStr, hasAlpha);
		}
		this.writeUint8((color >> 16) & 0xFF); // R
		this.writeUint8((color >> 8) & 0xFF);  // G
		this.writeUint8(color & 0xFF);         // B
		if (hasAlpha) {
			this.writeUint8((color >> 24) & 0xFF); // A
		} else {
			this.writeUint8(0xFF); // A = 255
		}
	}

	/** Get the collected string table entries. */
	getStringTable(): string[] {
		return this._strings;
	}

	getCustomStrings(): Array<{ index: number; value: string }> {
		return this._customStrings;
	}

	/** Skip `count` bytes (writes zeros). */
	skip(count: number): void {
		this._ensure(count);
		// Already zeroed in ArrayBuffer
		this._pos += count;
	}
}

/**
 * Parse an HTML color string to a uint32 in 0xAARRGGBB format.
 * Supports: "#rgb", "#rrggbb", "#rrggbbaa", "#aarrggbb" (8-char with leading alpha).
 * Also supports bare hex without # prefix.
 * @internal
 */
function parseHtmlColor(s: string, hasAlpha: boolean): number {
	let hex = s.startsWith('#') ? s.slice(1) : s;

	// Strip "ff" prefix for 8-char colors that use #AARRGGBB format
	// The editor uses convertFromHtmlColor which interprets:
	// - 6 chars: RRGGBB (alpha = 0xFF or 0x00 depending on hasAlpha)
	// - 8 chars with hasAlpha=true: AARRGGBB
	// - 8 chars with hasAlpha=false: treat first 2 as alpha, use RRGGBB part

	if (hex.length === 3) {
		hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
	}

	let r = 0, g = 0, b = 0, a = 0xFF;

	if (hex.length === 8) {
		if (hasAlpha) {
			// AARRGGBB
			a = parseInt(hex.slice(0, 2), 16);
			r = parseInt(hex.slice(2, 4), 16);
			g = parseInt(hex.slice(4, 6), 16);
			b = parseInt(hex.slice(6, 8), 16);
		} else {
			// Still 8 chars but no alpha in format — skip first 2
			r = parseInt(hex.slice(2, 4), 16);
			g = parseInt(hex.slice(4, 6), 16);
			b = parseInt(hex.slice(6, 8), 16);
			a = 0xFF;
		}
	} else if (hex.length >= 6) {
		r = parseInt(hex.slice(0, 2), 16);
		g = parseInt(hex.slice(2, 4), 16);
		b = parseInt(hex.slice(4, 6), 16);
	}

	return ((a & 0xFF) << 24) | ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF);
}
