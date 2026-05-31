import { type Command } from 'commander';
import { NodeIO } from '@openfairygui/core/node';
import { publish, resolvePublishOptions, type PublishOptions } from '@openfairygui/functions';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveFairyPath } from '../utils/project-input.js';
import { parseProjectType } from '../utils/project-type.js';

type PublishCommandOptions = {
	output: string;
	compressed?: boolean;
	packages?: string;
	branch?: string;
	projectType?: string;
};

export function registerPublishCommand(program: Command): void {
	program
		.command('publish')
		.description('Publish project to binary outputs and configured generated code')
		.argument('<project-dir>', 'Project root directory or .fairy file')
		.requiredOption('-o, --output <dir>', 'Output directory')
		.option('--compressed', 'Compress binary data (overrides project setting)')
		.option('--packages <a,b,c>', 'Only publish specific packages (comma-separated)')
		.option('--branch <name>', 'Active branch used by "主干合并活跃分支"; omit for main branch')
		.option('--project-type <name|id>', 'Override project type (for example: unity, layabox, cocoscreator, 0, 4, 3)')
		.action(async (projectDir: string, options: PublishCommandOptions) => {
			const fairyPath = await resolveFairyPath(projectDir);
			const projectRootDir = path.dirname(fairyPath);
			const outputDir = path.resolve(options.output);

			console.log(`Reading project: ${fairyPath}`);
			const io = new NodeIO();
			const doc = await io.readProject(fairyPath);
			const projectType = parseProjectType(options.projectType);
			if (projectType !== undefined) {
				doc.getRoot().setProjectType(projectType);
			}

			const pkgFilter = options.packages?.split(',').map((value) => value.trim());
			const resolved = resolvePublishOptions(doc, {
				compressed: options.compressed,
				packages: pkgFilter,
			});

			console.log(`Settings: ext=${resolved.fileExtension}, compressed=${resolved.compressed}`);
			if (options.branch) {
				console.log(`Active branch: ${options.branch}`);
			}

			const atlasConfig: NonNullable<PublishOptions['atlas']> = {
				...resolved.atlas,
				readFileRaw: async (filePath: string) => {
					const buf = await fs.readFile(filePath);
					return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
				},
			};

			let encoder: PublishOptions['encoder'];
			try {
				const sharp = await import('sharp');
				encoder = sharp.default ?? sharp;
				console.log('Sharp loaded — atlas PNGs will be generated.');
			} catch {
				console.log('Sharp not available — atlas PNGs will NOT be generated (layout only).');
				console.log('  Install sharp to enable: pnpm add sharp');
			}

			const publishFs: NonNullable<PublishOptions['fs']> = {
				async readFileRaw(filePath: string): Promise<Uint8Array> {
					const buf = await fs.readFile(filePath);
					return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
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
				async deleteFile(filePath: string): Promise<void> {
					await fs.rm(filePath, { force: true });
				},
				join(...paths: string[]): string {
					return path.join(...paths);
				},
			};

			await doc.transform(
				publish({
					output: outputDir,
					compressed: resolved.compressed,
					fileExtension: resolved.fileExtension,
					packages: resolved.packages,
					fs: publishFs,
					encoder,
					basePath: path.join(projectRootDir, 'assets'),
					atlas: atlasConfig,
					branch: options.branch,
				}),
			);

			console.log(`\nDone! Output: ${outputDir}`);
		});
}
