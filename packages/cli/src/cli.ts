import { NodeIO } from '@openfairygui/core';
import { inspect, publish, resolvePublishOptions, type InspectReport, type PublishOptions } from '@openfairygui/functions';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

const HELP = `
openfairygui — FairyGUI Headless Authoring CLI

Commands:
  inspect <project-dir>                          Show project contents report
  publish <project-dir> --output <dir> [options]  Publish project to .fui binary

Publish options:
  --output, -o <dir>     Output directory (required)
  --compressed           Compress binary data (overrides project setting)
  --packages <a,b,c>     Only publish specific packages (comma-separated)
  --branch <name>        Active branch used by "主干合并活跃分支"; omit for main branch

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
		default:
			console.error(`Unknown command: ${command}\n`);
			console.log(HELP);
			process.exit(1);
	}
}

async function cmdInspect(args: string[]): Promise<void> {
	if (args.length === 0) {
		console.error('Usage: openfairygui inspect <project-dir>');
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

async function cmdPublish(args: string[]): Promise<void> {
	const { values, positionals } = parseArgs({
		args,
		options: {
			output: { type: 'string', short: 'o' },
			compressed: { type: 'boolean' },
			packages: { type: 'string' },
			branch: { type: 'string' },
		},
		allowPositionals: true,
	});

	if (positionals.length === 0 || !values.output) {
		console.error('Usage: openfairygui publish <project-dir> --output <dir> [--compressed] [--packages a,b,c] [--branch name]');
		process.exit(1);
	}

	const fairyPath = await resolveFairyPath(positionals[0]);
	const projectDir = path.dirname(fairyPath);
	const outputDir = path.resolve(values.output);

	console.log(`Reading project: ${fairyPath}`);
	const io = new NodeIO();
	const doc = await io.readProject(fairyPath);

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

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
