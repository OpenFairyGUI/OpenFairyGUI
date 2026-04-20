import { COMPAT_NODE_RECT_FLAGS, MAX_RECTS_METHOD, MaxRectsCompat, type CompatNodeRect, type CompatPage } from './max-rects-compat.js';

interface MaxRectsPackerCompatSettings {
	pot?: boolean;
	mof?: boolean;
	padding?: number;
	rotation?: boolean;
	minWidth?: number;
	minHeight?: number;
	maxWidth?: number;
	maxHeight?: number;
	square?: boolean;
	fast?: boolean;
	edgePadding?: boolean;
	duplicatePadding?: boolean;
	multiPage?: boolean;
	preserveInputOrderOnTie?: boolean;
}

const DEFAULT_SETTINGS: Required<MaxRectsPackerCompatSettings> = {
	pot: true,
	mof: true,
	padding: 2,
	rotation: false,
	minWidth: 16,
	minHeight: 16,
	maxWidth: 2048,
	maxHeight: 2048,
	square: false,
	fast: true,
	edgePadding: false,
	duplicatePadding: false,
	multiPage: false,
	preserveInputOrderOnTie: false,
};

let sizeScheme: Array<{ width: number; height: number; area: number; aspectRatio: number; len: number }> | null = null;

class BinarySearchCompat {
	private readonly min: number;
	private readonly max: number;
	private readonly fuzziness: number;
	private low: number;
	private high: number;
	private current: number;

	public constructor(min: number, max: number, fuzziness: number, private readonly pot: boolean, private readonly mof: boolean) {
		this.fuzziness = pot ? 0 : fuzziness;
		if (pot) {
			this.min = Math.log(MaxRectsPackerCompat.getNextPowerOfTwo(min)) / Math.log(2);
			this.max = Math.log(MaxRectsPackerCompat.getNextPowerOfTwo(max)) / Math.log(2);
		} else if (mof) {
			this.min = min / 4;
			this.max = max / 4;
		} else {
			this.min = min;
			this.max = max;
		}
		this.low = this.min;
		this.high = this.max;
		this.current = this.min;
	}

	public reset(): number {
		this.low = this.min;
		this.high = this.max;
		this.current = (this.low + this.high) >>> 1;
		return this.getCurrent();
	}

	public next(failed: boolean): number {
		if (this.low >= this.high) return -1;
		if (failed) this.low = this.current + 1;
		else this.high = this.current - 1;
		this.current = (this.low + this.high) >>> 1;
		if (Math.abs(this.low - this.high) < this.fuzziness) return -1;
		return this.getCurrent();
	}

	private getCurrent(): number {
		if (this.pot) return Math.trunc(2 ** this.current);
		if (this.mof) return this.current * 4;
		return this.current;
	}
}

export class MaxRectsPackerCompat {
	private readonly maxRects = new MaxRectsCompat();
	private readonly settings: Required<MaxRectsPackerCompatSettings>;

	public constructor(settings: MaxRectsPackerCompatSettings = {}) {
		this.settings = { ...DEFAULT_SETTINGS, ...settings };
	}

	public static getNextPowerOfTwo(value: number): number {
		if (Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0) return value;
		let result = 1;
		const target = value - 1e-9;
		while (result < target) result <<= 1;
		return result;
	}

	public pack(inputRects: CompatNodeRect[]): CompatPage[] | null {
		const rects = inputRects.map(cloneCompatRect);
		if (this.settings.fast) {
			const compare = this.settings.preserveInputOrderOnTie
				? (this.settings.rotation ? compareNodeRectStable : compareNodeRect2Stable)
				: (this.settings.rotation ? compareNodeRect : compareNodeRect2);
			vectorSortCompat(rects, compare);
		}

		const padding = this.settings.padding;
		let hasDuplicatePadding = false;
		for (const rect of rects) {
			if (duplicatePadding(rect)) hasDuplicatePadding = true;
			if (this.settings.maxWidth - rect.width > padding || duplicatePadding(rect)) rect.width += padding;
			if (this.settings.maxHeight - rect.height > padding || duplicatePadding(rect)) rect.height += padding;
		}

		const pages: CompatPage[] = [];
		let remaining = rects;
		while (remaining.length > 0) {
			const page = this.packPage(remaining);
			if (!page) return null;
			if (this.settings.pot) {
				page.width = MaxRectsPackerCompat.getNextPowerOfTwo(page.width);
				page.height = MaxRectsPackerCompat.getNextPowerOfTwo(page.height);
			} else if (this.settings.mof) {
				page.width = Math.ceil(page.width / 4) * 4;
				page.height = Math.ceil(page.height / 4) * 4;
			}
			if (this.settings.square) {
				const side = Math.max(page.width, page.height);
				page.width = side;
				page.height = side;
			}
			pages.push(page);
			remaining = page.remainingRects.map(cloneCompatRect);
		}

		pages.sort(comparePage);
		for (const page of pages) {
			for (const rect of page.outputRects) {
				shrinkRectForPadding(rect, padding, this.settings.maxWidth, this.settings.maxHeight);
				if (hasDuplicatePadding) {
					if (rect.width !== page.width) rect.x += Math.floor(padding / 2);
					if (rect.height !== page.height) rect.y += Math.floor(padding / 2);
				}
			}
			for (const rect of page.remainingRects) {
				shrinkRectForPadding(rect, padding, this.settings.maxWidth, this.settings.maxHeight);
			}
		}

		return pages;
	}

	private packPage(rects: CompatNodeRect[]): CompatPage | null {
		if (!sizeScheme) sizeScheme = initSizeScheme();
		const edgePadding = this.settings.edgePadding ? this.settings.padding : 0;
		let totalArea = 0;
		for (const rect of rects) totalArea += rect.width * rect.height;

		const candidates = sizeScheme.filter((entry) =>
			entry.area >= totalArea &&
			entry.width <= this.settings.maxWidth &&
			entry.height <= this.settings.maxHeight,
		);
		if (candidates.length === 0) {
			candidates.push({ width: this.settings.maxWidth, height: this.settings.maxHeight, area: 0, aspectRatio: 0, len: 0 });
		}

		let page: CompatPage | null = null;
		let selectedWidth = 0;
		let selectedHeight = 0;
		for (let index = 0; index < candidates.length; index += 1) {
			selectedWidth = candidates[index].width;
			selectedHeight = candidates[index].height;
			page = this.packAtSize(index !== candidates.length - 1, selectedWidth - edgePadding, selectedHeight - edgePadding, rects);
			if (page) break;
		}

		if (page && !this.settings.pot && page.remainingRects.length === 0) {
			let bestRefined: CompatPage | null = null;
			if (this.settings.square) {
				const min = Math.min(selectedWidth / 2, selectedHeight / 2);
				const max = Math.max(selectedWidth, selectedHeight);
				const search = new BinarySearchCompat(min, max, this.settings.fast ? 25 : 15, this.settings.pot, this.settings.mof);
				let current = search.reset();
				while (current !== -1) {
					const refined = this.packAtSize(true, current - edgePadding, current - edgePadding, rects);
					bestRefined = getBestPage(bestRefined, refined);
					current = search.next(refined == null);
				}
			} else {
				const widthSearch = new BinarySearchCompat(selectedWidth / 2, selectedWidth, this.settings.fast ? 25 : 15, this.settings.pot, this.settings.mof);
				const heightSearch = new BinarySearchCompat(selectedHeight / 2, selectedHeight, this.settings.fast ? 25 : 15, this.settings.pot, this.settings.mof);
				let currentHeight = heightSearch.reset();
				let currentWidth = widthSearch.reset();
				while (true) {
					let bestForHeight: CompatPage | null = null;
					while (currentWidth !== -1) {
						const refined = this.packAtSize(true, currentWidth - edgePadding, currentHeight - edgePadding, rects);
						bestForHeight = getBestPage(bestForHeight, refined);
						currentWidth = widthSearch.next(refined == null);
					}
					bestRefined = getBestPage(bestRefined, bestForHeight);
					currentHeight = heightSearch.next(bestForHeight == null);
					if (currentHeight === -1) break;
					currentWidth = widthSearch.reset();
				}
			}
			if (bestRefined) page = bestRefined;
		}

		return page;
	}

	private packAtSize(requireFullFit: boolean, width: number, height: number, rects: CompatNodeRect[]): CompatPage | null {
		const methods = [MAX_RECTS_METHOD.BestShortSideFit, MAX_RECTS_METHOD.BestLongSideFit, MAX_RECTS_METHOD.BestAreaFit];
		let best: CompatPage | null = null;
		for (const method of methods) {
			this.maxRects.init(width, height, this.settings.rotation);
			let page: CompatPage;
			if (!this.settings.fast) {
				page = this.maxRects.pack(rects, method);
			} else {
				const remaining: CompatNodeRect[] = [];
				let index = 0;
				while (index < rects.length) {
					if (this.maxRects.insert(rects[index], method) == null) {
						while (index < rects.length) {
							remaining.push(cloneCompatRect(rects[index]));
							index += 1;
						}
						break;
					}
					index += 1;
				}
				page = this.maxRects.getResult();
				page.remainingRects = remaining;
			}
			if (!(requireFullFit && page.remainingRects.length > 0) && page.outputRects.length !== 0) {
				best = getBestPage(best, page);
			}
		}
		return best;
	}
}

function vectorSortCompat(items: CompatNodeRect[], compare: (left: CompatNodeRect, right: CompatNodeRect) => number): void {
	if (items.length <= 1) return;
	avmQuickSortCompat(items, 0, items.length - 1, compare);
}

function avmQuickSortCompat(
	items: CompatNodeRect[],
	initialLo: number,
	initialHi: number,
	compare: (left: CompatNodeRect, right: CompatNodeRect) => number,
): void {
	if (initialLo >= initialHi) return;
	const stack: Array<{ lo: number; hi: number }> = [];
	let lo = initialLo;
	let hi = initialHi;
	while (true) {
		const size = hi - lo + 1;
		if (size < 4) {
			if (size === 3) {
				if (compare(items[lo], items[lo + 1]) > 0) {
					swapCompat(items, lo, lo + 1);
					if (compare(items[lo + 1], items[lo + 2]) > 0) {
						swapCompat(items, lo + 1, lo + 2);
						if (compare(items[lo], items[lo + 1]) > 0) swapCompat(items, lo, lo + 1);
					}
				} else if (compare(items[lo + 1], items[lo + 2]) > 0) {
					swapCompat(items, lo + 1, lo + 2);
					if (compare(items[lo], items[lo + 1]) > 0) swapCompat(items, lo, lo + 1);
				}
			} else if (size === 2 && compare(items[lo], items[lo + 1]) > 0) {
				swapCompat(items, lo, lo + 1);
			}
		} else {
			const pivot = lo + (size >> 1);
			swapCompat(items, pivot, lo);
			let left = lo;
			let right = hi + 1;
			while (true) {
				do left += 1; while (left <= hi && compare(items[left], items[lo]) <= 0);
				do right -= 1; while (right > lo && compare(items[right], items[lo]) >= 0);
				if (right < left) break;
				swapCompat(items, left, right);
			}
			swapCompat(items, lo, right);
			if (right - 1 - lo >= hi - left) {
				if (lo + 1 < right) stack.push({ lo, hi: right - 1 });
				if (left < hi) {
					lo = left;
					continue;
				}
			} else {
				if (left < hi) stack.push({ lo: left, hi });
				if (lo + 1 < right) {
					hi = right - 1;
					continue;
				}
			}
		}
		if (stack.length === 0) return;
		const frame = stack.pop()!;
		lo = frame.lo;
		hi = frame.hi;
	}
}

function swapCompat(items: CompatNodeRect[], left: number, right: number): void {
	const value = items[left];
	items[left] = items[right];
	items[right] = value;
}

function initSizeScheme(): Array<{ width: number; height: number; area: number; aspectRatio: number; len: number }> {
	const result = [];
	for (let w = 5; w <= 13; w += 1) {
		for (let h = 5; h <= 13; h += 1) {
			const width = 2 ** w;
			const height = 2 ** h;
			const area = width * height;
			const aspectRatio = width > height ? width / height : height / width;
			result.push({ width, height, area, aspectRatio, len: Math.max(width, height) });
		}
	}
	result.sort(compareSizeScheme);
	return result;
}

function compareSizeScheme(
	left: { width: number; height: number; area: number; aspectRatio: number; len: number },
	right: { width: number; height: number; area: number; aspectRatio: number; len: number },
): number {
	if (left.len < right.len) return -1;
	if (left.len > right.len) return 1;
	if (left.area < right.area) return -1;
	if (left.area > right.area) return 1;
	if (left.aspectRatio < right.aspectRatio) return -1;
	if (left.aspectRatio > right.aspectRatio) return 1;
	if (left.width > left.height) return -1;
	if (right.width > right.height) return 1;
	return 0;
}

function getBestPage(left: CompatPage | null, right: CompatPage | null): CompatPage | null {
	if (!left) return right;
	if (!right) return left;
	return left.occupancy > right.occupancy ? left : right;
}

function comparePage(left: CompatPage, right: CompatPage): number {
	return right.outputRects.length - left.outputRects.length;
}

function compareNodeRect(left: CompatNodeRect, right: CompatNodeRect): number {
	const leftEdge = left.width > left.height ? left.width : left.height;
	const rightEdge = right.width > right.height ? right.width : right.height;
	return rightEdge - leftEdge;
}

function compareNodeRectStable(left: CompatNodeRect, right: CompatNodeRect): number {
	const delta = compareNodeRect(left, right);
	if (delta !== 0) return delta;
	if (left.sourceKind === 'movieclip-frame' && right.sourceKind === 'movieclip-frame') {
		const areaDelta = right.width * right.height - left.width * left.height;
		if (areaDelta !== 0) return areaDelta;
		const widthDelta = right.width - left.width;
		if (widthDelta !== 0) return widthDelta;
	}
	return left.index - right.index;
}

function compareNodeRect2(left: CompatNodeRect, right: CompatNodeRect): number {
	return right.width - left.width;
}

function compareNodeRect2Stable(left: CompatNodeRect, right: CompatNodeRect): number {
	const delta = compareNodeRect2(left, right);
	if (delta !== 0) return delta;
	if (left.sourceKind === 'movieclip-frame' && right.sourceKind === 'movieclip-frame') {
		const areaDelta = right.width * right.height - left.width * left.height;
		if (areaDelta !== 0) return areaDelta;
		const heightDelta = right.height - left.height;
		if (heightDelta !== 0) return heightDelta;
	}
	return left.index - right.index;
}

function duplicatePadding(rect: CompatNodeRect): boolean {
	return (rect.flags & COMPAT_NODE_RECT_FLAGS.DUPLICATE_PADDING) !== 0;
}

function shrinkRectForPadding(rect: CompatNodeRect, padding: number, maxWidth: number, maxHeight: number): void {
	if (!rect.rotated) {
		if (maxWidth - rect.width > padding || duplicatePadding(rect)) rect.width -= padding;
		if (maxHeight - rect.height > padding || duplicatePadding(rect)) rect.height -= padding;
	} else {
		if (maxHeight - rect.width > padding || duplicatePadding(rect)) rect.width -= padding;
		if (maxWidth - rect.height > padding || duplicatePadding(rect)) rect.height -= padding;
	}
}

function cloneCompatRect(rect: CompatNodeRect): CompatNodeRect {
	return { ...rect };
}
