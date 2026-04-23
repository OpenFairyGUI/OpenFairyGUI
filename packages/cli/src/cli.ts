import { BackendRuntime } from '@openfairygui/backend';
import {
	NodeIO,
	ProjectType,
} from '@openfairygui/core';
import {
	inspect,
	publish,
	resolvePublishOptions,
	restore,
	type InspectReport,
	type PublishOptions,
	type RestoreFileSystem,
	type RestoreImageCropInput,
	type RestoreImageCropper,
	type RestoreImageExtractInput,
	type RestoreImageExtractor,
} from '@openfairygui/functions';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

const HELP = `
ofgui — FairyGUI Headless Authoring CLI

Alias:
  openfairygui

Commands:
  inspect <project-dir>                          Show project contents report
  publish <project-dir> --output <dir> [options]  Publish project to binary outputs and configured generated code
  restore <release-dir> --output <dir> [options]  Restore a FairyGUI project from published binaries
  backend-capabilities <project-dir>            Open a backend session, print runtime capabilities, then close it

Publish options:
  --output, -o <dir>     Output directory (required)
  --compressed           Compress binary data (overrides project setting)
  --packages <a,b,c>     Only publish specific packages (comma-separated)
  --branch <name>        Active branch used by "主干合并活跃分支"; omit for main branch
  --project-type <name|id>  Override project type (for example: unity, layabox, cocoscreator, 0, 4, 3)

Restore options:
  --output, -o <dir>     Output project directory (required)
  --packages <a,b,c>     Only restore specific packages (comma-separated)
  --force                Overwrite a non-empty output directory
  --project-type <name|id>  Override restored project type; default is unity

Options:
  --help, -h     Show this help
  --version, -v  Show version

Input can be a .fairy file or a project root directory (auto-discovers .fairy file).
File extension and binary format are read from project settings.
`;

/** Resolve input to a .fairy file path. Accepts a directory or a .fairy file. */
async function resolveFairyPath(input: string): Promise<string> {
	const resolved = path.resolve(input);
	const stat = await fs.stat(resolved);

	if (stat.isFile() && resolved.endsWith('.fairy')) {
		return resolved;
	}

	if (stat.isDirectory()) {
		// Scan for *.fairy in the directory
		const entries = await fs.readdir(resolved);
		const fairyFiles = entries.filter((e) => e.endsWith('.fairy'));
		if (fairyFiles.length === 1) {
			return path.join(resolved, fairyFiles[0]);
		}
		if (fairyFiles.length > 1) {
			throw new Error(`Multiple .fairy files found in ${resolved}: ${fairyFiles.join(', ')}. Please specify one.`);
		}
		throw new Error(`No .fairy file found in ${resolved}`);
	}

	throw new Error(`Input is not a .fairy file or directory: ${resolved}`);
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);

	if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
		console.log(HELP);
		return;
	}

	if (args.includes('--version') || args.includes('-v')) {
		console.log('0.1.0');
		return;
	}

	const command = args[0];
	const rest = args.slice(1);

	switch (command) {
		case 'inspect':
			await cmdInspect(rest);
			break;
		case 'publish':
			await cmdPublish(rest);
			break;
		case 'restore':
			await cmdRestore(rest);
			break;
		case 'backend-capabilities':
			await cmdBackendCapabilities(rest);
			break;
		default:
			console.error(`Unknown command: ${command}\n`);
			console.log(HELP);
			process.exit(1);
	}
}

interface RestoreImageProcessors {
	cropImage: RestoreImageCropper;
	extractImage: RestoreImageExtractor;
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
		const needsOriginalCanvas = input.expectedWidth > 0 && input.expectedHeight > 0 && (
			input.offsetX !== 0
			|| input.offsetY !== 0
			|| info.width !== input.expectedWidth
			|| info.height !== input.expectedHeight
		);

		if (needsOriginalCanvas) {
			if (
				input.offsetX < 0
				|| input.offsetY < 0
				|| input.offsetX + info.width > input.expectedWidth
				|| input.offsetY + info.height > input.expectedHeight
			) {
				throw new Error(
					`restore: Cropped image does not fit original canvas for ${targetPath}: `
					+ `crop ${info.width}x${info.height} at ${input.offsetX},${input.offsetY}, `
					+ `canvas ${input.expectedWidth}x${input.expectedHeight}`,
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
				input.expectedWidth > 0
				&& input.expectedHeight > 0
				&& (composed.info.width !== input.expectedWidth || composed.info.height !== input.expectedHeight)
			) {
				throw new Error(
					`restore: Cropped image size mismatch for ${targetPath}: `
					+ `expected ${input.expectedWidth}x${input.expectedHeight}, got ${composed.info.width}x${composed.info.height}`,
				);
			}
			return composed.data;
		}

		if (
			input.expectedWidth > 0
			&& input.expectedHeight > 0
			&& (info.width !== input.expectedWidth || info.height !== input.expectedHeight)
		) {
			throw new Error(
				`restore: Cropped image size mismatch for ${targetPath}: `
				+ `expected ${input.expectedWidth}x${input.expectedHeight}, got ${info.width}x${info.height}`,
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

async function cmdInspect(args: string[]): Promise<void> {
	if (args.length === 0) {
		console.error('Usage: ofgui inspect <project-dir>');
		process.exit(1);
	}

	const fairyPath = await resolveFairyPath(args[0]);
	console.log(`Project: ${fairyPath}\n`);

	const io = new NodeIO();
	const doc = await io.readProject(fairyPath);
	const report = inspect(doc);

	printReport(report);
}

function printReport(report: InspectReport): void {
	console.log(`ID: ${report.projectId}`);
	console.log(`Type: ${report.projectType}, Version: ${report.version}`);
	console.log(`\nPackages: ${report.totals.packages}`);
	console.log(`  Images:       ${report.totals.images}`);
	console.log(`  Sounds:       ${report.totals.sounds}`);
	console.log(`  Fonts:        ${report.totals.fonts}`);
	console.log(`  MovieClips:   ${report.totals.movieClips}`);
	console.log(`  Components:   ${report.totals.components}`);
	console.log(`  DisplayObjs:  ${report.totals.displayObjects}`);
	console.log(`  Gears:        ${report.totals.gears}`);
	console.log(`  Controllers:  ${report.totals.controllers}`);
	console.log(`  Transitions:  ${report.totals.transitions}`);

	console.log('\nPackage details:');
	for (const pkg of report.packages) {
		const res = pkg.resources;
		console.log(`  ${pkg.name} (${pkg.id}): ${res.images.count} img, ${res.sounds.count} snd, ${res.fonts.count} font, ${res.components.count} comp`);
	}
}

function parseProjectType(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const trimmed = value.trim();
	if (trimmed === '') return undefined;
	if (/^\d+$/u.test(trimmed)) return Number(trimmed);
	const normalized = trimmed.toLowerCase();
	const map: Record<string, number> = {
		unity: ProjectType.Unity,
		flash: ProjectType.Flash,
		starling: ProjectType.Starling,
		cocoscreator: ProjectType.CocosCreator,
		cocos: ProjectType.CocosCreator,
		layabox: ProjectType.LayaBox,
		laya: ProjectType.LayaBox,
		egret: ProjectType.Egret,
		haxe: ProjectType.Haxe,
		pixi: ProjectType.Pixi,
		libgdx: ProjectType.LibGDX,
		unreal: ProjectType.Unreal,
		cryengine: ProjectType.CryEngine,
		monogame: ProjectType.MonoGame,
		vision: ProjectType.Vision,
	};
	const resolved = map[normalized];
	if (resolved === undefined) {
		throw new Error(`Unknown project type: ${value}. Use a numeric id or one of: ${Object.keys(map).join(', ')}`);
	}
	return resolved;
}

async function cmdRestore(args: string[]): Promise<void> {
	const { values, positionals } = parseArgs({
		args,
		options: {
			output: { type: 'string', short: 'o' },
			packages: { type: 'string' },
			force: { type: 'boolean' },
			'project-type': { type: 'string' },
		},
		allowPositionals: true,
	});

	if (positionals.length === 0 || !values.output) {
		console.error('Usage: ofgui restore <release-dir> --output <dir> [--packages a,b,c] [--force]');
		process.exit(1);
	}

	const releaseDir = path.resolve(positionals[0]);
	const outputDir = path.resolve(values.output);
	const pkgFilter = values.packages ? values.packages.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
	const projectType = parseProjectType(values['project-type']);
	const { cropImage, extractImage } = await createRestoreImageProcessors();

	console.log(`Restoring published FairyGUI project: ${releaseDir}`);
	const result = await restore({
		inputDir: releaseDir,
		output: outputDir,
		fs: createNodeRestoreFs(),
		packages: pkgFilter,
		force: values.force,
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
}

async function cmdPublish(args: string[]): Promise<void> {
	const { values, positionals } = parseArgs({
		args,
		options: {
			output: { type: 'string', short: 'o' },
			compressed: { type: 'boolean' },
			packages: { type: 'string' },
			branch: { type: 'string' },
			'project-type': { type: 'string' },
		},
		allowPositionals: true,
	});

	if (positionals.length === 0 || !values.output) {
		console.error('Usage: ofgui publish <project-dir> --output <dir> [--compressed] [--packages a,b,c] [--branch name]');
		process.exit(1);
	}

	const fairyPath = await resolveFairyPath(positionals[0]);
	const projectDir = path.dirname(fairyPath);
	const outputDir = path.resolve(values.output);

	console.log(`Reading project: ${fairyPath}`);
	const io = new NodeIO();
	const doc = await io.readProject(fairyPath);
	const projectType = parseProjectType(values['project-type']);
	if (projectType !== undefined) {
		doc.getRoot().setProjectType(projectType);
	}

	const pkgFilter = values.packages ? values.packages.split(',').map((s) => s.trim()) : undefined;
	const resolved = resolvePublishOptions(doc, {
		compressed: values.compressed,
		packages: pkgFilter,
	});

	console.log(`Settings: ext=${resolved.fileExtension}, compressed=${resolved.compressed}`);
	if (values.branch) {
		console.log(`Active branch: ${values.branch}`);
	}

	const atlasConfig: NonNullable<PublishOptions['atlas']> = {
		...resolved.atlas,
		readFileRaw: async (filePath: string) => {
			const buf = await fs.readFile(filePath);
			return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
		},
	};

	// Try to load sharp for atlas image compositing
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

	await doc.transform(publish({
		output: outputDir,
		compressed: resolved.compressed,
		fileExtension: resolved.fileExtension,
		packages: resolved.packages,
		fs: publishFs,
		encoder,
		basePath: path.join(projectDir, 'assets'),
		atlas: atlasConfig,
		branch: values.branch,
	}));

	console.log(`\nDone! Output: ${outputDir}`);
}

async function cmdBackendCapabilities(args: string[]): Promise<void> {
	if (args.length === 0) {
		console.error('Usage: ofgui backend-capabilities <project-dir>');
		process.exit(1);
	}

	const runtime = new BackendRuntime();
	const opened = await runtime.openSession({ projectPath: path.resolve(args[0]) });
	if (!opened.ok) {
		const failure = opened as Extract<typeof opened, { ok: false }>;
		console.error(`backend-capabilities: ${failure.error.message}`);
		process.exit(1);
	}

	const capabilities = runtime.getCapabilities();
	if (!capabilities.ok) {
		console.error('backend-capabilities: failed to read capabilities');
		await runtime.closeSession({ sessionId: opened.data.sessionId });
		process.exit(1);
	}

	console.log(`Session: ${opened.data.sessionId}`);
	console.log(`Project: ${opened.data.canonicalProjectPath}`);
	console.log(`Revision: ${opened.data.revision}`);
	console.log(`Runtime owner: ${capabilities.data.runtimeOwner}`);
	console.log(`Transaction owner: ${capabilities.data.transactionKernelOwner}`);
	console.log(`App seam owner: ${capabilities.data.appSeamOwner}`);

	const closed = await runtime.closeSession({ sessionId: opened.data.sessionId });
	if (!closed.ok) {
		const failure = closed as Extract<typeof closed, { ok: false }>;
		console.error(`backend-capabilities: ${failure.error.message}`);
		process.exit(1);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
