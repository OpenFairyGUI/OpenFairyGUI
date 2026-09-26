/** Bound decoded RGBA allocations to 64 MiB per image/canvas. */
export const MAX_IMAGE_PIXELS = 16_777_216;

export function assertImageDimensions(width: number, height: number): void {
	if (
		!Number.isSafeInteger(width) ||
		!Number.isSafeInteger(height) ||
		width <= 0 ||
		height <= 0 ||
		width > MAX_IMAGE_PIXELS / height
	) {
		throw new RangeError(
			`Image dimensions ${width}x${height} exceed the ${MAX_IMAGE_PIXELS} pixel budget or are invalid.`,
		);
	}
}
