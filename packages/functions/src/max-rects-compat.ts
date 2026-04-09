const NO_ROTATION = 2;
const MAX_SCORE = 2147483647;

export const MAX_RECTS_METHOD = {
	BestShortSideFit: 0,
	BestLongSideFit: 1,
	BestAreaFit: 2,
	BottomLeftRule: 3,
	ContactPointRule: 4,
} as const;

export const COMPAT_NODE_RECT_FLAGS = {
	DUPLICATE_PADDING: 1,
	NO_ROTATION,
} as const;

export interface CompatNodeRect {
	x: number;
	y: number;
	width: number;
	height: number;
	rotated: boolean;
	index: number;
	subIndex: number;
	flags: number;
	score1: number;
	score2: number;
	sourceKind?: string;
}

export interface CompatPage {
	outputRects: CompatNodeRect[];
	remainingRects: CompatNodeRect[];
	occupancy: number;
	width: number;
	height: number;
}

export class MaxRectsCompat {
	private static readonly helperRect = createNodeRect();
	private binWidth = 0;
	private binHeight = 0;
	private allowRotations = false;
	private readonly usedRectangles: CompatNodeRect[] = [];
	private readonly freeRectangles: CompatNodeRect[] = [];

	public init(width: number, height: number, allowRotations = false): void {
		this.binWidth = width;
		this.binHeight = height;
		this.allowRotations = allowRotations;
		this.usedRectangles.length = 0;
		this.freeRectangles.length = 0;
		this.freeRectangles.push({
			...createNodeRect(),
			x: 0,
			y: 0,
			width,
			height,
		});
	}

	public insert(rect: CompatNodeRect, method: number): CompatNodeRect | null {
		const newNode = this.scoreRect(rect, method);
		if (newNode.height === 0) return null;
		const placed = cloneNodeRect(newNode);
		this.placeRect(placed);
		return placed;
	}

	public pack(rects: CompatNodeRect[], method: number): CompatPage {
		const remaining = rects.map(cloneNodeRect);
		while (remaining.length > 0) {
			let bestIndex = -1;
			const bestNode = createNodeRect();
			bestNode.score1 = MAX_SCORE;
			bestNode.score2 = MAX_SCORE;
			for (let index = 0; index < remaining.length; index += 1) {
				const candidate = this.scoreRect(remaining[index], method);
				if (
					candidate.score1 < bestNode.score1 ||
					(candidate.score1 === bestNode.score1 && candidate.score2 < bestNode.score2)
				) {
					copyNodeRect(bestNode, candidate);
					bestIndex = index;
				}
			}
			if (bestIndex === -1) break;
			this.placeRect(bestNode);
			remaining.splice(bestIndex, 1);
		}
		const result = this.getResult();
		result.remainingRects = remaining;
		return result;
	}

	public getResult(): CompatPage {
		let width = 0;
		let height = 0;
		for (const rect of this.usedRectangles) {
			width = Math.max(width, rect.x + rect.width);
			height = Math.max(height, rect.y + rect.height);
		}
		return {
			outputRects: this.usedRectangles.map(cloneNodeRect),
			remainingRects: [],
			occupancy: this.getOccupancy(),
			width,
			height,
		};
	}

	private getOccupancy(): number {
		let usedSurface = 0;
		for (const rect of this.usedRectangles) usedSurface += rect.width * rect.height;
		return usedSurface / (this.binWidth * this.binHeight);
	}

	private placeRect(rect: CompatNodeRect): void {
		for (let index = 0; index < this.freeRectangles.length; index += 1) {
			if (this.splitFreeNode(this.freeRectangles[index], rect)) {
				this.freeRectangles.splice(index, 1);
				index -= 1;
			}
		}
		this.pruneFreeList();
		this.usedRectangles.push(rect);
	}

	private scoreRect(rect: CompatNodeRect, method: number): CompatNodeRect {
		const helper = MaxRectsCompat.helperRect;
		helper.height = 0;
		let newNode: CompatNodeRect;
		switch (method) {
			case MAX_RECTS_METHOD.BestShortSideFit:
				newNode = this.findPositionForNewNodeBestShortSideFit(rect.width, rect.height, allowRotation(rect));
				break;
			case MAX_RECTS_METHOD.BestLongSideFit:
				newNode = this.findPositionForNewNodeBestLongSideFit(rect.width, rect.height, allowRotation(rect));
				break;
			case MAX_RECTS_METHOD.BestAreaFit:
				newNode = this.findPositionForNewNodeBestAreaFit(rect.width, rect.height, allowRotation(rect));
				break;
			case MAX_RECTS_METHOD.BottomLeftRule:
				newNode = this.findPositionForNewNodeBottomLeft(rect.width, rect.height, allowRotation(rect));
				break;
			case MAX_RECTS_METHOD.ContactPointRule:
				newNode = this.findPositionForNewNodeContactPoint(rect.width, rect.height, allowRotation(rect));
				newNode.score1 = -newNode.score1;
				break;
			default:
				newNode = helper;
				break;
		}
		if (newNode.height === 0) {
			newNode.score1 = MAX_SCORE;
			newNode.score2 = MAX_SCORE;
		}
		newNode.index = rect.index;
		newNode.subIndex = rect.subIndex;
		newNode.flags = rect.flags;
		newNode.sourceKind = rect.sourceKind;
		return cloneNodeRect(newNode);
	}

	private findPositionForNewNodeBottomLeft(width: number, height: number, allowRectRotation: boolean): CompatNodeRect {
		const bestNode = MaxRectsCompat.helperRect;
		bestNode.score1 = MAX_SCORE;
		bestNode.score2 = 0;
		for (const freeRect of this.freeRectangles) {
			if (freeRect.width >= width && freeRect.height >= height) {
				const topSideY = freeRect.y + height;
				if (topSideY < bestNode.score1 || (topSideY === bestNode.score1 && freeRect.x < bestNode.score2)) {
					setNodeRect(bestNode, freeRect.x, freeRect.y, width, height, false, topSideY, freeRect.x);
				}
			}
			if (this.allowRotations && allowRectRotation && freeRect.width >= height && freeRect.height >= width) {
				const topSideY = freeRect.y + width;
				if (topSideY < bestNode.score1 || (topSideY === bestNode.score1 && freeRect.x < bestNode.score2)) {
					setNodeRect(bestNode, freeRect.x, freeRect.y, height, width, true, topSideY, freeRect.x);
				}
			}
		}
		return bestNode;
	}

	private findPositionForNewNodeBestShortSideFit(width: number, height: number, allowRectRotation: boolean): CompatNodeRect {
		const bestNode = MaxRectsCompat.helperRect;
		bestNode.score1 = MAX_SCORE;
		bestNode.score2 = 0;
		for (const freeRect of this.freeRectangles) {
			if (freeRect.width >= width && freeRect.height >= height) {
				const leftoverHoriz = Math.abs(freeRect.width - width);
				const leftoverVert = Math.abs(freeRect.height - height);
				const shortSideFit = Math.min(leftoverHoriz, leftoverVert);
				const longSideFit = Math.max(leftoverHoriz, leftoverVert);
				if (shortSideFit < bestNode.score1 || (shortSideFit === bestNode.score1 && longSideFit < bestNode.score2)) {
					setNodeRect(bestNode, freeRect.x, freeRect.y, width, height, false, shortSideFit, longSideFit);
				}
			}
			if (this.allowRotations && allowRectRotation && freeRect.width >= height && freeRect.height >= width) {
				const leftoverHoriz = Math.abs(freeRect.width - height);
				const leftoverVert = Math.abs(freeRect.height - width);
				const shortSideFit = Math.min(leftoverHoriz, leftoverVert);
				const longSideFit = Math.max(leftoverHoriz, leftoverVert);
				if (shortSideFit < bestNode.score1 || (shortSideFit === bestNode.score1 && longSideFit < bestNode.score2)) {
					setNodeRect(bestNode, freeRect.x, freeRect.y, height, width, true, shortSideFit, longSideFit);
				}
			}
		}
		return bestNode;
	}

	private findPositionForNewNodeBestLongSideFit(width: number, height: number, allowRectRotation: boolean): CompatNodeRect {
		const bestNode = MaxRectsCompat.helperRect;
		bestNode.score1 = 0;
		bestNode.score2 = MAX_SCORE;
		for (const freeRect of this.freeRectangles) {
			if (freeRect.width >= width && freeRect.height >= height) {
				const leftoverHoriz = Math.abs(freeRect.width - width);
				const leftoverVert = Math.abs(freeRect.height - height);
				const shortSideFit = Math.min(leftoverHoriz, leftoverVert);
				const longSideFit = Math.max(leftoverHoriz, leftoverVert);
				if (longSideFit < bestNode.score2 || (longSideFit === bestNode.score2 && shortSideFit < bestNode.score1)) {
					setNodeRect(bestNode, freeRect.x, freeRect.y, width, height, false, shortSideFit, longSideFit);
				}
			}
			if (this.allowRotations && allowRectRotation && freeRect.width >= height && freeRect.height >= width) {
				const leftoverHoriz = Math.abs(freeRect.width - height);
				const leftoverVert = Math.abs(freeRect.height - width);
				const shortSideFit = Math.min(leftoverHoriz, leftoverVert);
				const longSideFit = Math.max(leftoverHoriz, leftoverVert);
				if (longSideFit < bestNode.score2 || (longSideFit === bestNode.score2 && shortSideFit < bestNode.score1)) {
					setNodeRect(bestNode, freeRect.x, freeRect.y, height, width, true, shortSideFit, longSideFit);
				}
			}
		}
		return bestNode;
	}

	private findPositionForNewNodeBestAreaFit(width: number, height: number, allowRectRotation: boolean): CompatNodeRect {
		const bestNode = MaxRectsCompat.helperRect;
		bestNode.score1 = MAX_SCORE;
		bestNode.score2 = 0;
		for (const freeRect of this.freeRectangles) {
			const areaFit = freeRect.width * freeRect.height - width * height;
			if (freeRect.width >= width && freeRect.height >= height) {
				const leftoverHoriz = Math.abs(freeRect.width - width);
				const leftoverVert = Math.abs(freeRect.height - height);
				const shortSideFit = Math.min(leftoverHoriz, leftoverVert);
				if (areaFit < bestNode.score1 || (areaFit === bestNode.score1 && shortSideFit < bestNode.score2)) {
					setNodeRect(bestNode, freeRect.x, freeRect.y, width, height, false, areaFit, shortSideFit);
				}
			}
			if (this.allowRotations && allowRectRotation && freeRect.width >= height && freeRect.height >= width) {
				const leftoverHoriz = Math.abs(freeRect.width - height);
				const leftoverVert = Math.abs(freeRect.height - width);
				const shortSideFit = Math.min(leftoverHoriz, leftoverVert);
				if (areaFit < bestNode.score1 || (areaFit === bestNode.score1 && shortSideFit < bestNode.score2)) {
					setNodeRect(bestNode, freeRect.x, freeRect.y, height, width, true, areaFit, shortSideFit);
				}
			}
		}
		return bestNode;
	}

	private findPositionForNewNodeContactPoint(width: number, height: number, allowRectRotation: boolean): CompatNodeRect {
		const bestNode = MaxRectsCompat.helperRect;
		bestNode.score1 = -1;
		bestNode.score2 = 0;
		for (const freeRect of this.freeRectangles) {
			if (freeRect.width >= width && freeRect.height >= height) {
				const score = this.contactPointScoreNode(freeRect.x, freeRect.y, width, height);
				if (score > bestNode.score1) {
					setNodeRect(bestNode, freeRect.x, freeRect.y, width, height, false, score, bestNode.score2);
				}
			}
			if (this.allowRotations && allowRectRotation && freeRect.width >= height && freeRect.height >= width) {
				const score = this.contactPointScoreNode(freeRect.x, freeRect.y, height, width);
				if (score > bestNode.score1) {
					setNodeRect(bestNode, freeRect.x, freeRect.y, height, width, true, score, bestNode.score2);
				}
			}
		}
		return bestNode;
	}

	private contactPointScoreNode(x: number, y: number, width: number, height: number): number {
		let score = 0;
		if (x === 0 || x + width === this.binWidth) score += height;
		if (y === 0 || y + height === this.binHeight) score += width;
		for (const rect of this.usedRectangles) {
			if (rect.x === x + width || rect.x + rect.width === x) {
				score += commonIntervalLength(rect.y, rect.y + rect.height, y, y + height);
			}
			if (rect.y === y + height || rect.y + rect.height === y) {
				score += commonIntervalLength(rect.x, rect.x + rect.width, x, x + width);
			}
		}
		return score;
	}

	private splitFreeNode(freeNode: CompatNodeRect, usedNode: CompatNodeRect): boolean {
		if (
			usedNode.x >= freeNode.x + freeNode.width ||
			usedNode.x + usedNode.width <= freeNode.x ||
			usedNode.y >= freeNode.y + freeNode.height ||
			usedNode.y + usedNode.height <= freeNode.y
		) {
			return false;
		}
		if (usedNode.x < freeNode.x + freeNode.width && usedNode.x + usedNode.width > freeNode.x) {
			if (usedNode.y > freeNode.y && usedNode.y < freeNode.y + freeNode.height) {
				const newNode = cloneNodeRect(freeNode);
				newNode.height = usedNode.y - newNode.y;
				this.freeRectangles.push(newNode);
			}
			if (usedNode.y + usedNode.height < freeNode.y + freeNode.height) {
				const newNode = cloneNodeRect(freeNode);
				newNode.y = usedNode.y + usedNode.height;
				newNode.height = freeNode.y + freeNode.height - (usedNode.y + usedNode.height);
				this.freeRectangles.push(newNode);
			}
		}
		if (usedNode.y < freeNode.y + freeNode.height && usedNode.y + usedNode.height > freeNode.y) {
			if (usedNode.x > freeNode.x && usedNode.x < freeNode.x + freeNode.width) {
				const newNode = cloneNodeRect(freeNode);
				newNode.width = usedNode.x - newNode.x;
				this.freeRectangles.push(newNode);
			}
			if (usedNode.x + usedNode.width < freeNode.x + freeNode.width) {
				const newNode = cloneNodeRect(freeNode);
				newNode.x = usedNode.x + usedNode.width;
				newNode.width = freeNode.x + freeNode.width - (usedNode.x + usedNode.width);
				this.freeRectangles.push(newNode);
			}
		}
		return true;
	}

	private pruneFreeList(): void {
		let length = this.freeRectangles.length;
		let left = 0;
		while (left < length) {
			let right = left + 1;
			while (right < length) {
				if (isContainedIn(this.freeRectangles[left], this.freeRectangles[right])) {
					this.freeRectangles.splice(left, 1);
					length -= 1;
					break;
				}
				if (isContainedIn(this.freeRectangles[right], this.freeRectangles[left])) {
					this.freeRectangles.splice(right, 1);
					length -= 1;
				}
				right += 1;
			}
			left += 1;
		}
	}
}

function createNodeRect(): CompatNodeRect {
	return {
		x: 0,
		y: 0,
		width: 0,
		height: 0,
		rotated: false,
		index: 0,
		subIndex: -1,
		flags: 0,
		score1: 0,
		score2: 0,
		sourceKind: undefined,
	};
}

function cloneNodeRect(rect: CompatNodeRect): CompatNodeRect {
	return { ...rect };
}

function copyNodeRect(target: CompatNodeRect, source: CompatNodeRect): void {
	target.x = source.x;
	target.y = source.y;
	target.width = source.width;
	target.height = source.height;
	target.rotated = source.rotated;
	target.index = source.index;
	target.subIndex = source.subIndex;
	target.flags = source.flags;
	target.score1 = source.score1;
	target.score2 = source.score2;
	target.sourceKind = source.sourceKind;
}

function setNodeRect(
	target: CompatNodeRect,
	x: number,
	y: number,
	width: number,
	height: number,
	rotated: boolean,
	score1: number,
	score2: number,
): void {
	target.x = x;
	target.y = y;
	target.width = width;
	target.height = height;
	target.rotated = rotated;
	target.score1 = score1;
	target.score2 = score2;
}

function allowRotation(rect: CompatNodeRect): boolean {
	return (rect.flags & NO_ROTATION) === 0;
}

function commonIntervalLength(startA: number, endA: number, startB: number, endB: number): number {
	if (endA < startB || endB < startA) return 0;
	return Math.min(endA, endB) - Math.max(startA, startB);
}

function isContainedIn(left: CompatNodeRect, right: CompatNodeRect): boolean {
	return (
		left.x >= right.x &&
		left.y >= right.y &&
		left.x + left.width <= right.x + right.width &&
		left.y + left.height <= right.y + right.height
	);
}
