import {
	type Document,
	type FileSystem,
	type ILogger,
	ProjectType,
} from '@openfairygui/core';
import type { AtlasOptions } from './atlas.js';
import { publish } from './publish.js';
import type { PublishFileSystem } from './shared-types.js';

export type BrowserPublishProjectType = 'layabox';

export type BrowserPublishAtlasOptions = Pick<
	AtlasOptions,
	'maxSize' | 'fast' | 'allowRotation' | 'padding' | 'powerOfTwo' | 'square' | 'multiPage' | 'trimImage' | 'extractAlpha'
>;

export type BrowserPublishSourceFileSystem = Pick<FileSystem, 'readFileRaw' | 'join'>;

export type BrowserPublishOutputFileSystem = Pick<FileSystem, 'writeFileRaw' | 'mkdir' | 'join'>;

export interface BrowserPublishOptions {
	document: Document;
	sourceFileSystem: BrowserPublishSourceFileSystem;
	outputFileSystem: BrowserPublishOutputFileSystem;
	projectType: BrowserPublishProjectType;
	output: string;
	compressed?: boolean;
	packages?: string[];
	branch?: string;
	atlas?: BrowserPublishAtlasOptions;
}

export interface BrowserPublishDiagnostic {
	level: 'debug' | 'info' | 'warning' | 'error';
	message: string;
}

export interface BrowserPublishedFile {
	path: string;
	size: number;
}

export interface BrowserPublishResult {
	success: boolean;
	files: BrowserPublishedFile[];
	diagnostics: BrowserPublishDiagnostic[];
}

type BrowserImageInput = string | Uint8Array | {
	create: {
		width: number;
		height: number;
		channels: 4;
		background: { r: number; g: number; b: number; alpha: number };
	};
};

type BrowserCanvas = OffscreenCanvas | HTMLCanvasElement;

interface BrowserContext {
	clearRect(x: number, y: number, width: number, height: number): void;
	drawImage(image: CanvasImageSource, dx: number, dy: number): void;
	drawImage(image: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
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

function assertBrowserImageSupport(): void {
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

class BrowserImagePipeline {
	private rawOutput = false;

	constructor(
		private raster: Promise<BrowserRaster>,
		private readonly decode: (bytes: Uint8Array) => Promise<BrowserRaster>,
		private readonly write: (path: string, data: Uint8Array) => Promise<void>,
	) {}

	ensureAlpha(): this {
		return this;
	}

	resize(width: number, height: number): this {
		this.raster = this.raster.then((source) => {
			const target = createRaster(width, height);
			getBrowserContext(target.canvas).drawImage(source.canvas, 0, 0, width, height);
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

	async toBuffer(options?: { resolveWithObject?: boolean }): Promise<Uint8Array | { data: Uint8Array; info: { width: number; height: number; channels: number } }> {
		const raster = await this.raster;
		if (options?.resolveWithObject) {
			const data = getBrowserContext(raster.canvas).getImageData(0, 0, raster.width, raster.height).data;
			return { data: new Uint8Array(data), info: { width: raster.width, height: raster.height, channels: 4 } };
		}
		if (this.rawOutput) return new Uint8Array(getBrowserContext(raster.canvas).getImageData(0, 0, raster.width, raster.height).data);
		return canvasToPng(raster.canvas);
	}

	async toFile(path: string): Promise<void> {
		const raster = await this.raster;
		await this.write(path, await canvasToPng(raster.canvas));
	}
}

function createBrowserImageEncoder(
	sourceFileSystem: BrowserPublishSourceFileSystem,
	outputFileSystem: PublishFileSystem,
): (input: BrowserImageInput) => BrowserImagePipeline {
	const decode = (bytes: Uint8Array) => decodeRaster(bytes, imageMimeTypeFromBytes(bytes));
	return (input: BrowserImageInput): BrowserImagePipeline => {
		const raster = typeof input === 'string'
			? sourceFileSystem.readFileRaw(input).then((bytes) => decodeRaster(bytes, imageMimeType(input)))
			: input instanceof Uint8Array
				? decode(input)
				: Promise.resolve(createRaster(input.create.width, input.create.height, input.create.background));
		return new BrowserImagePipeline(raster, decode, outputFileSystem.writeFileRaw);
	};
}

function createTrackingFileSystem(
	fileSystem: BrowserPublishOutputFileSystem,
	files: Map<string, number>,
): PublishFileSystem {
	const tracked: PublishFileSystem = {
		join: (...paths) => fileSystem.join(...paths),
		mkdir: (path) => fileSystem.mkdir(path),
		writeFileRaw: async (path, data) => {
			await fileSystem.writeFileRaw(path, data);
			files.set(path, data.byteLength);
		},
	};
	return tracked;
}

function createDiagnosticLogger(logger: ILogger, diagnostics: BrowserPublishDiagnostic[]): ILogger {
	return {
		debug(message) {
			diagnostics.push({ level: 'debug', message });
			logger.debug(message);
		},
		info(message) {
			diagnostics.push({ level: 'info', message });
			logger.info(message);
		},
		warn(message) {
			diagnostics.push({ level: 'warning', message });
			logger.warn(message);
		},
		error(message) {
			diagnostics.push({ level: 'error', message });
			logger.error(message);
		},
	};
}

function toResult(success: boolean, files: Map<string, number>, diagnostics: BrowserPublishDiagnostic[]): BrowserPublishResult {
	return {
		success,
		files: [...files].map(([path, size]) => ({ path, size })),
		diagnostics,
	};
}

/**
 * Publish a loaded FairyGUI project to browser-provided storage.
 *
 * The adapter uses browser Canvas APIs for atlas composition, writes only through
 * the supplied output filesystem, and intentionally skips Node publish plugins.
 */
export async function publishBrowser(options: BrowserPublishOptions): Promise<BrowserPublishResult> {
	const files = new Map<string, number>();
	const diagnostics: BrowserPublishDiagnostic[] = [];
	const root = options.document.getRoot();
	const previousProjectType = root.getProjectType();
	const previousLogger = options.document.getLogger();
	options.document.setLogger(createDiagnosticLogger(previousLogger, diagnostics));

	try {
		if (options.projectType !== 'layabox') {
			throw new Error(`publishBrowser: unsupported project type "${String(options.projectType)}".`);
		}
		assertBrowserImageSupport();
		root.setProjectType(ProjectType.LayaBox);
		const outputFileSystem = createTrackingFileSystem(options.outputFileSystem, files);
		const sourceAssetsPath = options.sourceFileSystem.join(options.document.getProjectDir(), 'assets');

		await options.document.transform(publish({
			output: options.output,
			compressed: options.compressed,
			fileExtension: 'fui',
			packages: options.packages,
			branch: options.branch,
			basePath: sourceAssetsPath,
			encoder: createBrowserImageEncoder(options.sourceFileSystem, outputFileSystem),
			atlas: {
				...options.atlas,
				readFileRaw: (path) => options.sourceFileSystem.readFileRaw(path),
			},
			fs: outputFileSystem,
			loadPlugins: false,
			codeGeneration: false,
		}));

		return toResult(true, files, diagnostics);
	} catch (error) {
		diagnostics.push({
			level: 'error',
			message: error instanceof Error ? error.message : String(error),
		});
		return toResult(false, files, diagnostics);
	} finally {
		root.setProjectType(previousProjectType);
		options.document.setLogger(previousLogger);
	}
}


