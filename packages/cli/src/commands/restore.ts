import { type Command } from 'commander';
import {
	restore,
	type RestoreFileSystem,
	type RestoreImageCropInput,
	type RestoreImageCropper,
	type RestoreImageExtractInput,
	type RestoreImageExtractor,
} from '@openfairygui/functions';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseProjectType } from '../utils/project-type.js';

type RestoreCommandOptions = {
	output: string;
	packages?: string;
	force?: boolean;
	projectType?: string;
};

interface RestoreImageProcessors {
	cropImage: RestoreImageCropper;
	extractImage: RestoreImageExtractor;
}

export function registerRestoreCommand(program: Command): void {
	program
		.command('restore')
		.description('Restore a FairyGUI project from published binaries')
		.argument('<release-dir>', 'Published release directory')
		.requiredOption('-o, --output <dir>', 'Output project directory')
		.option('--packages <a,b,c>', 'Only restore specific packages (comma-separated)')
		.option('--force', 'Overwrite a non-empty output directory')
		.option('--project-type <name|id>', 'Override restored project type; default is unity')
		.action(async (releaseDir: string, options: RestoreCommandOptions) => {
			const inputDir = path.resolve(releaseDir);
			const outputDir = path.resolve(options.output);
			const pkgFilter = options.packages
				? options.packages
						.split(',')
						.map((value) => value.trim())
						.filter(Boolean)
				: undefined;
			const projectType = parseProjectType(options.projectType);
			const { cropImage, extractImage } = await createRestoreImageProcessors();

			console.log(`Restoring published FairyGUI project: ${inputDir}`);
			const result = await restore({
				inputDir,
				output: outputDir,
				fs: createNodeRestoreFs(),
				packages: pkgFilter,
				force: options.force,
				projectType,
				cropImage,
				extractImage,
			});

			const packages = result.document.getRoot().listPackages();
			console.log(`\nDone! Output: ${result.projectPath}`);
			console.log(`Packages: ${packages.map((pkg) => pkg.getName()).join(', ')}`);
			for (const warning of result.warnings) {
				console.warn(`Warning: ${warning}`);
			}
		});
}

function createNodeRestoreFs(): RestoreFileSystem {
	return {
		async readFile(filePath: string): Promise<string> {
			return fs.readFile(filePath, 'utf-8');
		},
		async readFileRaw(filePath: string): Promise<Uint8Array> {
			const buf = await fs.readFile(filePath);
			return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
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
			await fs.rm(targetPath, { recursive: options?.recursive ?? false, force: options?.force ?? false });
		},
		join(...paths: string[]): string {
			return path.join(...paths);
		},
		dirname(filePath: string): string {
			return path.dirname(filePath);
		},
	};
}

async function createRestoreImageProcessors(): Promise<RestoreImageProcessors> {
	let sharp: any;
	try {
		const mod = await import('sharp');
		sharp = mod.default ?? mod;
	} catch {
		throw new Error('restore: sharp is required to crop atlas images. Install it with: pnpm add sharp');
	}

	async function extractImage(input: RestoreImageExtractInput): Promise<Uint8Array> {
		const targetPath = (input as RestoreImageCropInput).outputPath ?? input.sourcePath;
		let image = sharp(input.sourcePath).extract({
			left: input.left,
			top: input.top,
			width: input.width,
			height: input.height,
		});
		if (input.rotated) image = image.rotate(90);
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
			if (
				input.expectedWidth > 0 &&
				input.expectedHeight > 0 &&
				(composed.info.width !== input.expectedWidth || composed.info.height !== input.expectedHeight)
			) {
				throw new Error(
					`restore: Cropped image size mismatch for ${targetPath}: ` +
						`expected ${input.expectedWidth}x${input.expectedHeight}, got ${composed.info.width}x${composed.info.height}`,
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

	return {
		extractImage,
		cropImage: async (input: RestoreImageCropInput): Promise<void> => {
			await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
			await fs.writeFile(input.outputPath, await extractImage(input));
		},
	};
}
