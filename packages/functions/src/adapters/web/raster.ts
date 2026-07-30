import type {
	AtlasRasterBackend,
	AtlasRasterInput,
	AtlasRasterPipeline,
	AtlasRasterResolvedBuffer,
	PublishFileSystem,
	PublishSourceFileSystem,
} from '../../publish/contracts.js';

type BrowserCanvas = OffscreenCanvas | HTMLCanvasElement;

interface BrowserContext {
	clearRect(x: number, y: number, width: number, height: number): void;
	drawImage(image: CanvasImageSource, dx: number, dy: number): void;
	drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
	drawImage(
		image: CanvasImageSource,
		sx: number,
		sy: number,
		sw: number,
		sh: number,
		dx: number,
		dy: number,
		dw: number,
		dh: number,
	): void;
	fillRect(x: number, y: number, width: number, height: number): void;
	getImageData(sx: number, sy: number, sw: number, sh: number): ImageData;
	rotate(angle: number): void;
	restore(): void;
	save(): void;
	translate(x: number, y: number): void;
	fillStyle: string | CanvasGradient | CanvasPattern;
}

interface BrowserRaster {
	canvas: BrowserCanvas;
	width: number;
	height: number;
}

function getBrowserContext(canvas: BrowserCanvas): BrowserContext {
	const context = canvas.getContext('2d');
	if (!context) throw new Error('publishBrowser: a 2D canvas context is unavailable.');
	return context as unknown as BrowserContext;
}

function createBrowserCanvas(width: number, height: number): BrowserCanvas {
	if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
	if (typeof globalThis.document === 'undefined') {
		throw new Error('publishBrowser: OffscreenCanvas or a DOM canvas is required for atlas PNG generation.');
	}
	const canvas = globalThis.document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

export function assertBrowserImageSupport(): void {
	if (typeof createImageBitmap !== 'function') {
		throw new Error('publishBrowser: createImageBitmap is required for atlas PNG generation.');
	}
	if (typeof OffscreenCanvas === 'undefined' && typeof globalThis.document === 'undefined') {
		throw new Error('publishBrowser: OffscreenCanvas or a DOM canvas is required for atlas PNG generation.');
	}
}

function createRaster(
	width: number,
	height: number,
	background?: { r: number; g: number; b: number; alpha: number },
): BrowserRaster {
	const canvas = createBrowserCanvas(width, height);
	const context = getBrowserContext(canvas);
	context.clearRect(0, 0, width, height);
	if (background && background.alpha > 0) {
		context.fillStyle = `rgba(${background.r}, ${background.g}, ${background.b}, ${background.alpha})`;
		context.fillRect(0, 0, width, height);
	}
	return { canvas, width, height };
}

function imageMimeType(path: string): string {
	if (/\.svg$/iu.test(path)) return 'image/svg+xml';
	if (/\.jpe?g$/iu.test(path)) return 'image/jpeg';
	if (/\.webp$/iu.test(path)) return 'image/webp';
	if (/\.gif$/iu.test(path)) return 'image/gif';
	return 'image/png';
}

function imageMimeTypeFromBytes(bytes: Uint8Array): string {
	if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
	if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
	if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return 'image/webp';
	return 'image/png';
}

async function canvasToPng(canvas: BrowserCanvas): Promise<Uint8Array> {
	let blob: Blob;
	if ('convertToBlob' in canvas && typeof canvas.convertToBlob === 'function') {
		blob = await canvas.convertToBlob({ type: 'image/png' });
	} else {
		blob = await new Promise<Blob>((resolve, reject) => {
			(canvas as HTMLCanvasElement).toBlob((value) => {
				if (value) resolve(value);
				else reject(new Error('publishBrowser: canvas PNG encoding failed.'));
			}, 'image/png');
		});
	}
	return new Uint8Array(await blob.arrayBuffer());
}

async function decodeRaster(bytes: Uint8Array, mimeType: string): Promise<BrowserRaster> {
	if (typeof createImageBitmap !== 'function') {
		throw new Error('publishBrowser: createImageBitmap is required for atlas PNG generation.');
	}
	const copy = bytes.slice();
	const bitmap = await createImageBitmap(new Blob([copy.buffer as ArrayBuffer], { type: mimeType }));
	try {
		const raster = createRaster(bitmap.width, bitmap.height);
		getBrowserContext(raster.canvas).drawImage(bitmap, 0, 0);
		return raster;
	} finally {
		bitmap.close();
	}
}

class BrowserImagePipeline implements AtlasRasterPipeline {
	private rawOutput = false;

	constructor(
		private raster: Promise<BrowserRaster>,
		private readonly decode: (bytes: Uint8Array) => Promise<BrowserRaster>,
		private readonly write: (path: string, data: Uint8Array) => Promise<void>,
	) {}

	ensureAlpha(): this {
		return this;
	}

	resize(options: { width: number; height: number; fit?: 'fill' }): this {
		this.raster = this.raster.then((source) => {
			const target = createRaster(options.width, options.height);
			getBrowserContext(target.canvas).drawImage(source.canvas, 0, 0, options.width, options.height);
			return target;
		});
		return this;
	}

	raw(): this {
		this.rawOutput = true;
		return this;
	}

	extract(options: { left: number; top: number; width: number; height: number }): this {
		this.raster = this.raster.then((source) => {
			const target = createRaster(options.width, options.height);
			getBrowserContext(target.canvas).drawImage(
				source.canvas,
				options.left,
				options.top,
				options.width,
				options.height,
				0,
				0,
				options.width,
				options.height,
			);
			return target;
		});
		return this;
	}

	png(): this {
		this.rawOutput = false;
		return this;
	}

	rotate(angle: number): this {
		this.raster = this.raster.then((source) => {
			if (angle % 180 === 0) return source;
			const target = createRaster(source.height, source.width);
			const context = getBrowserContext(target.canvas);
			context.save();
			if (angle === 270 || angle === -90) {
				context.translate(0, source.width);
				context.rotate(-Math.PI / 2);
			} else {
				context.translate(source.height, 0);
				context.rotate(Math.PI / 2);
			}
			context.drawImage(source.canvas, 0, 0);
			context.restore();
			return target;
		});
		return this;
	}

	composite(inputs: Array<{ input: Uint8Array; left: number; top: number }>): this {
		this.raster = this.raster.then(async (target) => {
			const context = getBrowserContext(target.canvas);
			for (const input of inputs) {
				const source = await this.decode(input.input);
				context.drawImage(source.canvas, input.left, input.top);
			}
			return target;
		});
		return this;
	}

	async metadata(): Promise<{ width: number; height: number; channels: number; hasAlpha: boolean }> {
		const raster = await this.raster;
		return { width: raster.width, height: raster.height, channels: 4, hasAlpha: true };
	}

	async toBuffer(options: { resolveWithObject: true }): Promise<AtlasRasterResolvedBuffer>;
	async toBuffer(options?: { resolveWithObject?: false }): Promise<Uint8Array>;
	async toBuffer(options?: { resolveWithObject?: boolean }): Promise<Uint8Array | AtlasRasterResolvedBuffer> {
		const raster = await this.raster;
		if (options?.resolveWithObject) {
			const data = getBrowserContext(raster.canvas).getImageData(0, 0, raster.width, raster.height).data;
			return { data: new Uint8Array(data), info: { width: raster.width, height: raster.height, channels: 4 } };
		}
		if (this.rawOutput)
			return new Uint8Array(
				getBrowserContext(raster.canvas).getImageData(0, 0, raster.width, raster.height).data,
			);
		return canvasToPng(raster.canvas);
	}

	async toFile(path: string): Promise<void> {
		const raster = await this.raster;
		await this.write(path, await canvasToPng(raster.canvas));
	}
}

export function createBrowserImageEncoder(
	sourceFileSystem: PublishSourceFileSystem,
	outputFileSystem: PublishFileSystem,
): AtlasRasterBackend {
	const decode = (bytes: Uint8Array) => decodeRaster(bytes, imageMimeTypeFromBytes(bytes));
	return (input: AtlasRasterInput): BrowserImagePipeline => {
		const raster =
			typeof input === 'string'
				? sourceFileSystem.readFileRaw(input).then((bytes) => decodeRaster(bytes, imageMimeType(input)))
				: input instanceof Uint8Array
					? decode(input)
					: Promise.resolve(createRaster(input.create.width, input.create.height, input.create.background));
		return new BrowserImagePipeline(raster, decode, outputFileSystem.writeFileRaw);
	};
}
