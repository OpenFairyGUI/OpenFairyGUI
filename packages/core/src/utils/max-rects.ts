/**
 * MaxRects bin-packing algorithm — faithful port of FairyGUI editor.
 *
 * Ported from `referer/Editor/worker/scripts/fairygui/utils/pack/`:
 * - MaxRects.as — core algorithm with 5 heuristics
 * - MaxRectsPacker.as — multi-page packer with SIZE_SCHEME + binary search
 * - BinarySearch.as — dimension optimizer
 * - PackSettings.as — configuration
 * - NodeRect.as — rectangle data structure
 * - Page.as — page output
 *
 * @category Utils
 */

// ─── Public API ──────────────────────────────────────────────────────────

export interface PackInput {
	id: string;
	width: number;
	height: number;
	/** Bitfield: 1 = DUPLICATE_PADDING, 2 = NO_ROTATION */
	flags?: number;
}

export interface PackResult {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	rotated: boolean;
	page: number;
}

export interface PackerOptions {
	maxWidth?: number;
	maxHeight?: number;
	allowRotation?: boolean;
	padding?: number;
	/** Power-of-two constraint. Default: true (matches editor default). */
	pot?: boolean;
	/** Multiples-of-four constraint. Default: false. */
	mof?: boolean;
	/** Force square atlas. Default: false. */
	square?: boolean;
	/** Fast mode: sequential insert with pre-sort. Default: true (matches editor). */
	fast?: boolean;
	/** Apply padding to atlas edges. Default: false. */
	edgePadding?: boolean;
	/** Duplicate border pixels for padding (e.g. for tiling). Default: false. */
	duplicatePadding?: boolean;
	/** Allow overflow to multiple pages. Default: true. */
	multiPage?: boolean;
}

// ─── NodeRect ────────────────────────────────────────────────────────────

const FLAG_DUPLICATE_PADDING = 1;
const FLAG_NO_ROTATION = 2;

class NodeRect {
	x = 0;
	y = 0;
	width = 0;
	height = 0;
	rotated = false;
	index = 0;
	subIndex = -1;
	flags = 0;
	score1 = 0;
	score2 = 0;

	get duplicatePadding(): boolean { return (this.flags & FLAG_DUPLICATE_PADDING) !== 0; }
	get allowRotation(): boolean { return (this.flags & FLAG_NO_ROTATION) === 0; }

	copyFrom(other: NodeRect): void {
		this.index = other.index;
		this.subIndex = other.subIndex;
		this.x = other.x;
		this.y = other.y;
		this.width = other.width;
		this.height = other.height;
		this.rotated = other.rotated;
		this.score1 = other.score1;
		this.score2 = other.score2;
		this.flags = other.flags;
	}

	clone(): NodeRect {
		const r = new NodeRect();
		r.copyFrom(this);
		return r;
	}
}

// ─── Page ────────────────────────────────────────────────────────────────

class Page {
	outputRects: NodeRect[] = [];
	remainingRects: NodeRect[] = [];
	occupancy = 0;
	width = 0;
	height = 0;
}

// ─── BinarySearch ────────────────────────────────────────────────────────

class BinarySearch {
	private readonly min: number;
	private readonly max: number;
	private readonly fuzziness: number;
	private readonly pot: boolean;
	private readonly mof: boolean;
	private low = 0;
	private high = 0;
	private current = 0;

	constructor(min: number, max: number, fuzziness: number, pot: boolean, mof: boolean) {
		this.pot = pot;
		this.mof = mof;
		this.fuzziness = pot ? 0 : fuzziness;
		if (pot) {
			this.min = Math.round(Math.log2(getNextPowerOfTwo(min)));
			this.max = Math.round(Math.log2(getNextPowerOfTwo(max)));
		} else if (mof) {
			this.min = Math.floor(min / 4);
			this.max = Math.floor(max / 4);
		} else {
			this.min = min;
			this.max = max;
		}
	}

	reset(): number {
		this.low = this.min;
		this.high = this.max;
		this.current = (this.low + this.high) >>> 1;
		return this.getCurrent();
	}

	next(fail: boolean): number {
		if (this.low >= this.high) return -1;
		if (fail) {
			this.low = this.current + 1;
		} else {
			this.high = this.current - 1;
		}
		this.current = (this.low + this.high) >>> 1;
		if (Math.abs(this.low - this.high) < this.fuzziness) return -1;
		return this.getCurrent();
	}

	private getCurrent(): number {
		if (this.pot) return 2 ** this.current;
		if (this.mof) return this.current * 4;
		return this.current;
	}
}

// ─── MaxRects core ───────────────────────────────────────────────────────

const BSSF = 0; // BestShortSideFit
const BLSF = 1; // BestLongSideFit
const BAF = 2;  // BestAreaFit
const BL = 3;   // BottomLeftRule
const CP = 4;   // ContactPointRule
const ALL_METHODS = [BSSF, BLSF, BAF, CP];

class MaxRects {
	private binWidth = 0;
	private binHeight = 0;
	private allowRotations = false;
	private usedRectangles: NodeRect[] = [];
	private freeRectangles: NodeRect[] = [];
	private readonly helperRect = new NodeRect();

	init(w: number, h: number, allowRotations: boolean): void {
		this.binWidth = w;
		this.binHeight = h;
		this.allowRotations = allowRotations;
		const r = new NodeRect();
		r.x = 0; r.y = 0; r.width = w; r.height = h;
		this.usedRectangles = [];
		this.freeRectangles = [r];
	}

	insert(rect: NodeRect, method: number): NodeRect | null {
		const scored = this.scoreRect(rect, method);
		if (scored.height === 0) return null;
		const placed = scored.clone();
		this.placeRect(placed);
		return placed;
	}

	pack(rects: NodeRect[], method: number): Page {
		const remaining = rects.slice();
		let len = remaining.length;

		while (len > 0) {
			let bestIdx = -1;
			const best = new NodeRect();
			best.score1 = 0x7FFFFFFF;
			best.score2 = 0x7FFFFFFF;

			for (let i = 0; i < len; i++) {
				const scored = this.scoreRect(remaining[i], method);
				if (scored.score1 < best.score1 || (scored.score1 === best.score1 && scored.score2 < best.score2)) {
					best.copyFrom(scored);
					bestIdx = i;
				}
			}

			if (bestIdx === -1) break;
			this.placeRect(best);
			remaining.splice(bestIdx, 1);
			len--;
		}

		const page = this.getResult();
		page.remainingRects = remaining;
		return page;
	}

	getResult(): Page {
		let maxX = 0, maxY = 0;
		for (const r of this.usedRectangles) {
			maxX = Math.max(maxX, r.x + r.width);
			maxY = Math.max(maxY, r.y + r.height);
		}
		const page = new Page();
		page.outputRects = this.usedRectangles.slice();
		page.occupancy = this.getOccupancy();
		page.width = maxX;
		page.height = maxY;
		return page;
	}

	private getOccupancy(): number {
		let area = 0;
		for (const r of this.usedRectangles) area += r.width * r.height;
		return area / (this.binWidth * this.binHeight);
	}

	private placeRect(rect: NodeRect): void {
		for (let i = this.freeRectangles.length - 1; i >= 0; i--) {
			if (this.splitFreeNode(this.freeRectangles[i], rect)) {
				this.freeRectangles.splice(i, 1);
			}
		}
		this.pruneFreeList();
		this.usedRectangles.push(rect);
	}

	private scoreRect(input: NodeRect, method: number): NodeRect {
		const w = input.width;
		const h = input.height;
		const canRotate = input.allowRotation;
		const result = this.helperRect;
		result.height = 0;

		switch (method) {
			case BSSF:
				this.findBSSF(w, h, canRotate, result);
				break;
			case BLSF:
				this.findBLSF(w, h, canRotate, result);
				break;
			case BAF:
				this.findBAF(w, h, canRotate, result);
				break;
			case BL:
				this.findBL(w, h, canRotate, result);
				break;
			case CP:
				this.findCP(w, h, canRotate, result);
				result.score1 = -result.score1; // CP maximizes contact, invert for min-scoring
				break;
		}

		if (result.height === 0) {
			result.score1 = 0x7FFFFFFF;
			result.score2 = 0x7FFFFFFF;
		}
		result.index = input.index;
		result.subIndex = input.subIndex;
		result.flags = input.flags;
		return result;
	}

	private findBSSF(w: number, h: number, canRotate: boolean, out: NodeRect): void {
		out.score1 = 0x7FFFFFFF;
		out.score2 = 0;
		for (const free of this.freeRectangles) {
			if (free.width >= w && free.height >= h) {
				const dx = Math.abs(free.width - w);
				const dy = Math.abs(free.height - h);
				const shortSide = Math.min(dx, dy);
				const longSide = Math.max(dx, dy);
				if (shortSide < out.score1 || (shortSide === out.score1 && longSide < out.score2)) {
					out.x = free.x; out.y = free.y;
					out.width = w; out.height = h;
					out.score1 = shortSide; out.score2 = longSide;
					out.rotated = false;
				}
			}
			if (this.allowRotations && canRotate && free.width >= h && free.height >= w) {
				const dx = Math.abs(free.width - h);
				const dy = Math.abs(free.height - w);
				const shortSide = Math.min(dx, dy);
				const longSide = Math.max(dx, dy);
				if (shortSide < out.score1 || (shortSide === out.score1 && longSide < out.score2)) {
					out.x = free.x; out.y = free.y;
					out.width = h; out.height = w;
					out.score1 = shortSide; out.score2 = longSide;
					out.rotated = true;
				}
			}
		}
	}

	private findBLSF(w: number, h: number, canRotate: boolean, out: NodeRect): void {
		out.score1 = 0;
		out.score2 = 0x7FFFFFFF;
		for (const free of this.freeRectangles) {
			if (free.width >= w && free.height >= h) {
				const dx = Math.abs(free.width - w);
				const dy = Math.abs(free.height - h);
				const shortSide = Math.min(dx, dy);
				const longSide = Math.max(dx, dy);
				if (longSide < out.score2 || (longSide === out.score2 && shortSide < out.score1)) {
					out.x = free.x; out.y = free.y;
					out.width = w; out.height = h;
					out.score1 = shortSide; out.score2 = longSide;
					out.rotated = false;
				}
			}
			if (this.allowRotations && canRotate && free.width >= h && free.height >= w) {
				const dx = Math.abs(free.width - h);
				const dy = Math.abs(free.height - w);
				const shortSide = Math.min(dx, dy);
				const longSide = Math.max(dx, dy);
				if (longSide < out.score2 || (longSide === out.score2 && shortSide < out.score1)) {
					out.x = free.x; out.y = free.y;
					out.width = h; out.height = w;
					out.score1 = shortSide; out.score2 = longSide;
					out.rotated = true;
				}
			}
		}
	}

	private findBAF(w: number, h: number, canRotate: boolean, out: NodeRect): void {
		out.score1 = 0x7FFFFFFF;
		out.score2 = 0;
		for (const free of this.freeRectangles) {
			const areaFit = free.width * free.height - w * h;
			if (free.width >= w && free.height >= h) {
				const shortSide = Math.min(Math.abs(free.width - w), Math.abs(free.height - h));
				if (areaFit < out.score1 || (areaFit === out.score1 && shortSide < out.score2)) {
					out.x = free.x; out.y = free.y;
					out.width = w; out.height = h;
					out.score1 = areaFit; out.score2 = shortSide;
					out.rotated = false;
				}
			}
			if (this.allowRotations && canRotate && free.width >= h && free.height >= w) {
				const shortSide = Math.min(Math.abs(free.width - h), Math.abs(free.height - w));
				if (areaFit < out.score1 || (areaFit === out.score1 && shortSide < out.score2)) {
					out.x = free.x; out.y = free.y;
					out.width = h; out.height = w;
					out.score1 = areaFit; out.score2 = shortSide;
					out.rotated = true;
				}
			}
		}
	}

	private findBL(w: number, h: number, canRotate: boolean, out: NodeRect): void {
		out.score1 = 0x7FFFFFFF;
		for (const free of this.freeRectangles) {
			if (free.width >= w && free.height >= h) {
				const topSide = free.y + h;
				if (topSide < out.score1 || (topSide === out.score1 && free.x < out.score2)) {
					out.x = free.x; out.y = free.y;
					out.width = w; out.height = h;
					out.score1 = topSide; out.score2 = free.x;
					out.rotated = false;
				}
			}
			if (this.allowRotations && canRotate && free.width >= h && free.height >= w) {
				const topSide = free.y + w;
				if (topSide < out.score1 || (topSide === out.score1 && free.x < out.score2)) {
					out.x = free.x; out.y = free.y;
					out.width = h; out.height = w;
					out.score1 = topSide; out.score2 = free.x;
					out.rotated = true;
				}
			}
		}
	}

	private commonIntervalLength(a1: number, a2: number, b1: number, b2: number): number {
		if (a2 < b1 || b2 < a1) return 0;
		return Math.min(a2, b2) - Math.max(a1, b1);
	}

	private contactPointScore(x: number, y: number, w: number, h: number): number {
		let score = 0;
		// Contact with bin edges
		if (x === 0 || x + w === this.binWidth) score += h;
		if (y === 0 || y + h === this.binHeight) score += w;
		// Contact with placed rectangles
		for (const r of this.usedRectangles) {
			if (r.x === x + w || r.x + r.width === x) {
				score += this.commonIntervalLength(r.y, r.y + r.height, y, y + h);
			}
			if (r.y === y + h || r.y + r.height === y) {
				score += this.commonIntervalLength(r.x, r.x + r.width, x, x + w);
			}
		}
		return score;
	}

	private findCP(w: number, h: number, canRotate: boolean, out: NodeRect): void {
		out.score1 = -1;
		out.score2 = 0;
		for (const free of this.freeRectangles) {
			if (free.width >= w && free.height >= h) {
				const score = this.contactPointScore(free.x, free.y, w, h);
				if (score > out.score1) {
					out.x = free.x; out.y = free.y;
					out.width = w; out.height = h;
					out.score1 = score;
					out.rotated = false;
				}
			}
			if (this.allowRotations && canRotate && free.width >= h && free.height >= w) {
				const score = this.contactPointScore(free.x, free.y, h, w);
				if (score > out.score1) {
					out.x = free.x; out.y = free.y;
					out.width = h; out.height = w;
					out.score1 = score;
					out.rotated = true;
				}
			}
		}
	}

	private splitFreeNode(free: NodeRect, placed: NodeRect): boolean {
		if (placed.x >= free.x + free.width || placed.x + placed.width <= free.x ||
			placed.y >= free.y + free.height || placed.y + placed.height <= free.y) {
			return false;
		}

		if (placed.x < free.x + free.width && placed.x + placed.width > free.x) {
			if (placed.y > free.y && placed.y < free.y + free.height) {
				const r = free.clone();
				r.height = placed.y - r.y;
				this.freeRectangles.push(r);
			}
			if (placed.y + placed.height < free.y + free.height) {
				const r = free.clone();
				r.y = placed.y + placed.height;
				r.height = free.y + free.height - (placed.y + placed.height);
				this.freeRectangles.push(r);
			}
		}
		if (placed.y < free.y + free.height && placed.y + placed.height > free.y) {
			if (placed.x > free.x && placed.x < free.x + free.width) {
				const r = free.clone();
				r.width = placed.x - r.x;
				this.freeRectangles.push(r);
			}
			if (placed.x + placed.width < free.x + free.width) {
				const r = free.clone();
				r.x = placed.x + placed.width;
				r.width = free.x + free.width - (placed.x + placed.width);
				this.freeRectangles.push(r);
			}
		}
		return true;
	}

	private pruneFreeList(): void {
		const rects = this.freeRectangles;
		let len = rects.length;
		for (let i = 0; i < len; i++) {
			for (let j = i + 1; j < len; j++) {
				if (isContainedIn(rects[i], rects[j])) {
					rects.splice(i, 1); len--; i--; break;
				}
				if (isContainedIn(rects[j], rects[i])) {
					rects.splice(j, 1); len--; j--;
				}
			}
		}
	}
}

function isContainedIn(a: NodeRect, b: NodeRect): boolean {
	return a.x >= b.x && a.y >= b.y &&
		a.x + a.width <= b.x + b.width &&
		a.y + a.height <= b.y + b.height;
}

// ─── SIZE_SCHEME ─────────────────────────────────────────────────────────

interface SizeEntry { width: number; height: number; area: number; aspectRatio: number; len: number }

let _sizeScheme: SizeEntry[] | null = null;

function getSizeScheme(): SizeEntry[] {
	if (_sizeScheme) return _sizeScheme;
	const entries: SizeEntry[] = [];
	// POT combinations (editor original: 2^5..2^13)
	for (let pw = 5; pw <= 13; pw++) {
		for (let ph = 5; ph <= 13; ph++) {
			const w = 2 ** pw;
			const h = 2 ** ph;
			entries.push({
				width: w, height: h,
				area: w * h,
				aspectRatio: w > h ? w / h : h / w,
				len: Math.max(w, h),
			});
		}
	}
	// Extended: non-POT multiples-of-4 for finer granularity when pot=false
	// Add intermediate sizes between POT values (e.g. 192, 384, 768, 1536)
	for (const base of [48, 96, 192, 384, 768, 1536, 3072]) {
		for (const other of [32, 64, 128, 256, 512, 1024, 2048, 4096, 8192]) {
			if (base !== other) {
				entries.push({
					width: base, height: other,
					area: base * other,
					aspectRatio: base > other ? base / other : other / base,
					len: Math.max(base, other),
				});
			}
		}
	}
	entries.sort((a, b) => {
		if (a.len !== b.len) return a.len - b.len;
		if (a.area !== b.area) return a.area - b.area;
		if (a.aspectRatio !== b.aspectRatio) return a.aspectRatio - b.aspectRatio;
		if (a.width > a.height) return -1;
		if (b.width > b.height) return 1;
		return 0;
	});
	_sizeScheme = entries;
	return entries;
}

// ─── MaxRectsPacker ──────────────────────────────────────────────────────

function getNextPowerOfTwo(n: number): number {
	let v = 1;
	n -= 1e-9;
	while (v < n) v <<= 1;
	return v;
}

class MaxRectsPacker {
	private readonly settings: Required<PackerOptions>;
	private readonly maxRects = new MaxRects();

	constructor(settings: Required<PackerOptions>) {
		this.settings = settings;
	}

	pack(inputRects: NodeRect[]): Page[] {
		const s = this.settings;
		const rects = inputRects.slice();

		// Add padding to each rect
		const pad = s.padding;
		let hasDuplicatePadding = false;
		for (const r of rects) {
			if (r.duplicatePadding) hasDuplicatePadding = true;
			if (s.maxWidth - r.width > pad || r.duplicatePadding) r.width += pad;
			if (s.maxHeight - r.height > pad || r.duplicatePadding) r.height += pad;
		}

		// Pack pages
		const pages: Page[] = [];
		let remaining = rects;
		while (remaining.length > 0) {
			const page = this.packPage(remaining);
			if (!page) break; // cannot pack remaining rects

			// Apply POT/MOF/Square constraints to page dimensions
			if (s.pot) {
				page.width = getNextPowerOfTwo(page.width);
				page.height = getNextPowerOfTwo(page.height);
			} else if (s.mof) {
				page.width = Math.ceil(page.width / 4) * 4;
				page.height = Math.ceil(page.height / 4) * 4;
			}
			if (s.square) {
				const side = Math.max(page.width, page.height);
				page.width = side;
				page.height = side;
			}
			pages.push(page);
			remaining = page.remainingRects;

			if (!s.multiPage) break;
		}

		// Sort pages by number of rects (most first)
		pages.sort((a, b) => b.outputRects.length - a.outputRects.length);

		// Remove padding from output rects
		for (const page of pages) {
			for (const r of page.outputRects) {
				if (!r.rotated) {
					if (s.maxWidth - r.width > pad || r.duplicatePadding) r.width -= pad;
					if (s.maxHeight - r.height > pad || r.duplicatePadding) r.height -= pad;
				} else {
					if (s.maxHeight - r.width > pad || r.duplicatePadding) r.width -= pad;
					if (s.maxWidth - r.height > pad || r.duplicatePadding) r.height -= pad;
				}
				if (hasDuplicatePadding) {
					if (r.width !== page.width) r.x += Math.floor(pad / 2);
					if (r.height !== page.height) r.y += Math.floor(pad / 2);
				}
			}
			// Also restore remaining rects
			for (const r of page.remainingRects) {
				if (!r.rotated) {
					if (s.maxWidth - r.width > pad || r.duplicatePadding) r.width -= pad;
					if (s.maxHeight - r.height > pad || r.duplicatePadding) r.height -= pad;
				} else {
					if (s.maxHeight - r.width > pad || r.duplicatePadding) r.width -= pad;
					if (s.maxWidth - r.height > pad || r.duplicatePadding) r.height -= pad;
				}
			}
		}

		return pages;
	}

	private packPage(rects: NodeRect[]): Page | null {
		const s = this.settings;
		const edgePad = s.edgePadding ? s.padding : 0;

		// Compute total area
		let totalArea = 0;
		for (const r of rects) totalArea += r.width * r.height;

		// Build candidate sizes from SIZE_SCHEME
		const scheme = getSizeScheme();
		const candidates = scheme.filter(
			(e) => e.area >= totalArea && e.width <= s.maxWidth && e.height <= s.maxHeight,
		);
		if (candidates.length === 0) {
			candidates.push({ width: s.maxWidth, height: s.maxHeight, area: s.maxWidth * s.maxHeight, aspectRatio: 1, len: Math.max(s.maxWidth, s.maxHeight) });
		}

		// Try each candidate size
		let bestPage: Page | null = null;
		for (let i = 0; i < candidates.length; i++) {
			const cw = candidates[i].width;
			const ch = candidates[i].height;
			const result = this.packAtSize(i !== candidates.length - 1, cw - edgePad, ch - edgePad, rects);
			if (result) {
				bestPage = result;
				break;
			}
		}

		// Binary search for tighter dimensions if first fit found and !pot
		if (bestPage && !s.pot && bestPage.remainingRects.length === 0) {
			const lastCandidate = candidates[candidates.indexOf(candidates.find((c) =>
				c.width >= bestPage!.width && c.height >= bestPage!.height) ?? candidates[candidates.length - 1])];
			const cw = lastCandidate?.width ?? s.maxWidth;
			const ch = lastCandidate?.height ?? s.maxHeight;

			let tighter: Page | null = null;
			// Adaptive fuzziness: scale with atlas size for better precision on small atlases
			const baseFuzz = s.fast ? 25 : 15;
			const fuzz = Math.max(2, Math.min(baseFuzz, Math.floor(Math.max(cw, ch) / 64)));

			if (s.square) {
				const minSide = Math.min(cw, ch) / 2;
				const maxSide = Math.max(cw, ch);
				const search = new BinarySearch(minSide, maxSide, fuzz, s.pot, s.mof);
				let side = search.reset();
				while (side !== -1) {
					const result = this.packAtSize(true, side - edgePad, side - edgePad, rects);
					tighter = getBest(tighter, result);
					side = search.next(result === null);
				}
			} else {
				const searchW = new BinarySearch(cw / 2, cw, fuzz, s.pot, s.mof);
				const searchH = new BinarySearch(ch / 2, ch, fuzz, s.pot, s.mof);
				let testH = searchH.reset();
				while (testH !== -1) {
					let bestForH: Page | null = null;
					let testW = searchW.reset();
					while (testW !== -1) {
						const result = this.packAtSize(true, testW - edgePad, testH - edgePad, rects);
						bestForH = getBest(bestForH, result);
						testW = searchW.next(result === null);
					}
					tighter = getBest(tighter, bestForH);
					testH = searchH.next(bestForH === null);
				}
			}

			if (tighter) bestPage = tighter;
		}

		return bestPage;
	}

	private packAtSize(mustFitAll: boolean, w: number, h: number, rects: NodeRect[]): Page | null {
		const s = this.settings;
		let best: Page | null = null;

		// Multi-sort: try different sorting strategies in fast mode, pick best
		const sortedVariants: NodeRect[][] = [];
		if (s.fast) {
			// Sort 1: max(w,h) descending (editor default)
			const byMaxSide = rects.slice().sort((a, b) => {
				const am = Math.max(a.width, a.height);
				const bm = Math.max(b.width, b.height);
				return bm - am;
			});
			sortedVariants.push(byMaxSide);

			// Sort 2: area descending
			const byArea = rects.slice().sort((a, b) => (b.width * b.height) - (a.width * a.height));
			sortedVariants.push(byArea);

			// Sort 3: perimeter descending
			const byPerimeter = rects.slice().sort((a, b) => (b.width + b.height) - (a.width + a.height));
			sortedVariants.push(byPerimeter);

			// Sort 4: width descending (editor uses this when !rotation)
			if (!s.allowRotation) {
				const byWidth = rects.slice().sort((a, b) => b.width - a.width);
				sortedVariants.push(byWidth);
			}
		} else {
			// Non-fast mode: global best-fit, sorting doesn't matter
			sortedVariants.push(rects);
		}

		for (const sortedRects of sortedVariants) {
			for (const method of ALL_METHODS) {
				this.maxRects.init(w, h, s.allowRotation);
				let page: Page;

				if (!s.fast) {
					page = this.maxRects.pack(sortedRects, method);
				} else {
					const remaining: NodeRect[] = [];
					const count = sortedRects.length;
					for (let i = 0; i < count; i++) {
						if (this.maxRects.insert(sortedRects[i], method) === null) {
							for (let j = i; j < count; j++) remaining.push(sortedRects[j]);
							break;
						}
					}
					page = this.maxRects.getResult();
					page.remainingRects = remaining;
				}

				if (mustFitAll && page.remainingRects.length > 0) continue;
				if (page.outputRects.length === 0) continue;
				best = getBest(best, page);
			}
		}

		return best;
	}
}

function getBest(a: Page | null, b: Page | null): Page | null {
	if (!a) return b;
	if (!b) return a;
	return a.occupancy > b.occupancy ? a : b;
}

// ─── Public entry point ──────────────────────────────────────────────────

const DEFAULTS: Required<PackerOptions> = {
	maxWidth: 2048,
	maxHeight: 2048,
	allowRotation: false,
	padding: 2,
	pot: true,
	mof: false,
	square: false,
	fast: true,
	edgePadding: false,
	duplicatePadding: false,
	multiPage: true,
};

/**
 * Packs rectangles into one or more pages using the MaxRects algorithm.
 *
 * This is a faithful port of the FairyGUI editor's packing algorithm,
 * including SIZE_SCHEME dimension search, multi-heuristic selection
 * (BSSF/BLSF/BAF), and binary search for optimal dimensions.
 *
 * ```ts
 * const results = maxRectsPack(
 *   [{ id: 'img1', width: 100, height: 80 }, { id: 'img2', width: 64, height: 64 }],
 *   { maxWidth: 2048, maxHeight: 2048, pot: true }
 * );
 * ```
 */
export function maxRectsPack(inputs: PackInput[], options: PackerOptions = {}): PackResult[] {
	const settings = { ...DEFAULTS, ...options } as Required<PackerOptions>;

	// Convert to NodeRects
	const nodeRects: NodeRect[] = inputs.map((input, i) => {
		const r = new NodeRect();
		r.width = input.width;
		r.height = input.height;
		r.index = i;
		r.flags = input.flags ?? 0;
		return r;
	});

	const packer = new MaxRectsPacker(settings);
	const pages = packer.pack(nodeRects);

	// Convert back to PackResult
	const results: PackResult[] = [];
	for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
		for (const rect of pages[pageIdx].outputRects) {
			results.push({
				id: inputs[rect.index].id,
				x: rect.x,
				y: rect.y,
				width: rect.width,
				height: rect.height,
				rotated: rect.rotated,
				page: pageIdx,
			});
		}
	}

	return results;
}
