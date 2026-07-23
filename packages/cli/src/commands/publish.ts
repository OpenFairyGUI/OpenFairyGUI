import type { Command } from 'commander';
import { NodeIO } from '@openfairygui/core/node';
import { resolvePublishOptions } from '@openfairygui/functions';
import { publishNode } from '@openfairygui/functions/node';
import path from 'node:path';
import { resolveFairyPath } from '../utils/project-input.js';
import { parseProjectType } from '../utils/project-type.js';

type PublishCommandOptions = {
	output?: string;
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
		.option('-o, --output <dir>', 'Override project or package publish output directory')
		.option('-c, --compressed', 'Compress binary data (overrides project setting)')
		.option('-p, --packages <a,b,c>', 'Only publish specific packages (comma-separated)')
		.option('-b, --branch <name>', 'Active branch used by "主干合并活跃分支"; omit for main branch')
		.option(
			'-t, --project-type <name|id>',
			'Override project type (for example: unity, layabox, cocoscreator, 0, 4, 3)',
		)
		.action(async (projectDir: string, options: PublishCommandOptions) => {
			const fairyPath = await resolveFairyPath(projectDir);
			const projectRootDir = path.dirname(fairyPath);
			const outputDir = options.output ? path.resolve(options.output) : undefined;

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

			await publishNode({
				document: doc,
				output: outputDir,
				compressed: resolved.compressed,
				fileExtension: resolved.fileExtension,
				packages: resolved.packages,
				assetsPath: path.join(projectRootDir, 'assets'),
				atlas: resolved.atlas,
				branch: options.branch,
			});

			console.log(`\nDone!${outputDir ? ` Output override: ${outputDir}` : ''}`);
		});
}
