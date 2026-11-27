import type {
	RestoreFileSystem,
	RestoreImageCropInput,
	RestoreImageCropper,
	RestoreImageExtractInput,
	RestoreImageExtractor,
	RestoreOptions,
	RestoreResult,
} from '../../restore.js';
import { restore } from '../../restore.js';
import { assertImageDimensions, MAX_IMAGE_PIXELS } from './image-limits.js';

const importNative = new Function('id', 'return import(id)') as <T>(id: string) => Promise<T>;

interface RestoreImageProcessors {
	cropImage: RestoreImageCropper;
	extractImage: RestoreImageExtractor;
}

export interface RestoreNodeOptions extends Omit<RestoreOptions, 'fs' | 'cropImage' | 'extractImage'> {}

async function createNodeRestoreFileSystem(): Promise<RestoreFileSystem> {
	const [fs, path] = await Promise.all([
		importNative<typeof import('node:fs/promises')>('node:fs/promises'),
		importNative<typeof import('node:path')>('node:path'),
	]);
	return {
		async readFile(filePath: string): Promise<string> {
			return fs.readFile(filePath, 'utf-8');
		},
		async readFileRaw(filePath: string): Promise<Uint8Array> {
			const buffer = await fs.readFile(filePath);
			return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
		},
		async writeFile(filePath: string, content: string): Promise<void> {
			await fs.mkdir(path.dirname(filePath), { recursive: true });
			await fs.writeFile(filePath, content, 'utf-8');
		},
		async writeFileRaw(filePath: string, data: Uint8Array): Promise<void> {
			await fs.mkdir(path.dirname(filePath), { recursive: true });
			await fs.writeFile(filePath, data);
		},
		async mkdir(dirPath: string): Promise<void> {
			await fs.mkdir(dirPath, { recursive: true });
		},
		async readdir(dirPath: string): Promise<string[]> {
			const stat = await fs.lstat(dirPath);
			if (stat.isSymbolicLink() || !stat.isDirectory()) {
				throw new Error(`restoreNode: directory path must be a regular directory: ${dirPath}`);
			}
			return fs.readdir(dirPath);
		},
		async exists(filePath: string): Promise<boolean> {
			try {
				await fs.access(filePath);
				return true;
			} catch {
				return false;
			}
		},
		async isFile(filePath: string): Promise<boolean> {
			try {
				return (await fs.stat(filePath)).isFile();
			} catch {
				return false;
			}
		},
		async resolvePath(filePath: string): Promise<string> {
			try {
				return await fs.realpath(filePath);
			} catch {
				return path.resolve(filePath);
			}
		},
		async rm(targetPath: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
			await fs.rm(targetPath, {
				recursive: options?.recursive ?? false,
				force: options?.force ?? false,
			});
		},
		async rename(from: string, to: string): Promise<void> {
			for (let attempt = 0; ; attempt++) {
				try {
					await fs.rename(from, to);
					return;
				} catch (error) {
					const code = (error as NodeJS.ErrnoException | null)?.code;
					const transient = process.platform === 'win32' && ['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '');
					if (attempt >= 7 || !transient) throw error;
					await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** attempt));
				}
			}
		},
		join(...paths: string[]): string {
			return path.join(...paths);
		},
		dirname(filePath: string): string {
			return path.dirname(filePath);
		},
	};
}

interface SharpRestorePipeline {
	extract(region: { left: number; top: number; width: number; height: number }): SharpRestorePipeline;
	extractChannel(channel: 'red'): SharpRestorePipeline;
	raw(): SharpRestorePipeline;
	toBuffer(options: { resolveWithObject: true }): Promise<{
		data: Buffer;
		info: { width: number; height: number; channels: number };
	}>;
	toBuffer(): Promise<Buffer>;
	ensureAlpha(): SharpRestorePipeline;
	removeAlpha(): SharpRestorePipeline;
	joinChannel(data: Buffer, options: { raw: { width: number; height: number; channels: 1 } }): SharpRestorePipeline;
	rotate(angle: number): SharpRestorePipeline;
	composite(inputs: Array<{ input: Buffer; left: number; top: number }>): SharpRestorePipeline;
	extend(options: {
		top: number;
		bottom: number;
		left: number;
		right: number;
		background: { r: number; g: number; b: number; alpha: number };
	}): SharpRestorePipeline;
	png(): SharpRestorePipeline;
	toFile(filePath: string): Promise<unknown>;
}

type SharpRestoreInput =
	| string
	| Buffer
	| Uint8Array
	| {
			create: {
				width: number;
				height: number;
				channels: number;
				background: { r: number; g: number; b: number; alpha: number };
			};
	  };

type SharpRestoreFactory = (input: SharpRestoreInput, options?: { limitInputPixels?: number }) => SharpRestorePipeline;

/** @internal */
export async function createRestoreImageProcessors(): Promise<RestoreImageProcessors> {
	let sharp: SharpRestoreFactory;
	try {
		const loaded = await importNative<unknown>('sharp');
		const resolved =
			typeof loaded === 'function'
				? loaded
				: typeof loaded === 'object' && loaded !== null && 'default' in loaded
					? (loaded as { default: unknown }).default
					: undefined;
		if (typeof resolved !== 'function') throw new Error('Loaded sharp module is not callable.');
		sharp = resolved as SharpRestoreFactory;
	} catch {
		throw new Error('restoreNode: Sharp is required to crop atlas images. Install sharp before restoring.');
	}

	async function extractImage(input: RestoreImageExtractInput): Promise<Uint8Array> {
		assertImageDimensions(input.width, input.height);
		if (input.expectedWidth !== 0 || input.expectedHeight !== 0)
			assertImageDimensions(input.expectedWidth, input.expectedHeight);
		const targetPath = (input as RestoreImageCropInput).outputPath ?? input.sourcePath;
		let image = sharp(input.sourcePath, { limitInputPixels: MAX_IMAGE_PIXELS }).extract({
			left: input.left,
			top: input.top,
			width: input.width,
			height: input.height,
		});
		if (input.alphaSourcePath) {
			const alphaRaw = await sharp(input.alphaSourcePath, { limitInputPixels: MAX_IMAGE_PIXELS })
				.extract({
					left: input.left,
					top: input.top,
					width: input.width,
					height: input.height,
				})
				.extractChannel('red')
				.raw()
				.toBuffer();
			const rgbBuffer = await image.removeAlpha().toBuffer();
			image = sharp(rgbBuffer).joinChannel(alphaRaw, {
				raw: { width: input.width, height: input.height, channels: 1 },
			});
		}
		if (input.rotated) image = image.rotate(input.clockwiseRotated ? 270 : 90);
		const { data, info } = await image.png().toBuffer({ resolveWithObject: true });
		const needsOriginalCanvas =
			input.expectedWidth > 0 &&
			input.expectedHeight > 0 &&
			(input.offsetX !== 0 ||
				input.offsetY !== 0 ||
				info.width !== input.expectedWidth ||
				info.height !== input.expectedHeight);

		if (needsOriginalCanvas) {
			if (
				input.offsetX < 0 ||
				input.offsetY < 0 ||
				input.offsetX + info.width > input.expectedWidth ||
				input.offsetY + info.height > input.expectedHeight
			) {
				throw new Error(
					`restore: Cropped image does not fit original canvas for ${targetPath}: ` +
						`crop ${info.width}x${info.height} at ${input.offsetX},${input.offsetY}, ` +
						`canvas ${input.expectedWidth}x${input.expectedHeight}`,
				);
			}
			const composed = await sharp({
				create: {
					width: input.expectedWidth,
					height: input.expectedHeight,
					channels: 4,
					background: { r: 0, g: 0, b: 0, alpha: 0 },
				},
			})
				.composite([{ input: data, left: input.offsetX, top: input.offsetY }])
				.png()
				.toBuffer({ resolveWithObject: true });
			if (composed.info.width !== input.expectedWidth || composed.info.height !== input.expectedHeight) {
				throw new Error(
					`restore: Cropped image size mismatch for ${targetPath}: ` +
						`expected ${input.expectedWidth}x${input.expectedHeight}, ` +
						`got ${composed.info.width}x${composed.info.height}`,
				);
			}
			return composed.data;
		}

		if (
			input.expectedWidth > 0 &&
			input.expectedHeight > 0 &&
			(info.width !== input.expectedWidth || info.height !== input.expectedHeight)
		) {
			throw new Error(
				`restore: Cropped image size mismatch for ${targetPath}: ` +
					`expected ${input.expectedWidth}x${input.expectedHeight}, got ${info.width}x${info.height}`,
			);
		}
		return data;
	}

	const fs = await importNative<typeof import('node:fs/promises')>('node:fs/promises');
	const path = await importNative<typeof import('node:path')>('node:path');
	return {
		extractImage,
		cropImage: async (input: RestoreImageCropInput): Promise<void> => {
			await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
			await fs.writeFile(input.outputPath, await extractImage(input));
		},
	};
}

/** Restore trusted local published artifacts through the standard Node host adapter. */
export async function restoreNode(options: RestoreNodeOptions): Promise<RestoreResult> {
	const [fs, imageProcessors] = await Promise.all([createNodeRestoreFileSystem(), createRestoreImageProcessors()]);
	return restore({
		...options,
		fs,
		...imageProcessors,
	});
}
