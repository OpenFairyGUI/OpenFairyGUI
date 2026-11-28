import path from 'node:path';
import { NodeIO } from '@openfairygui/core/node';
import { resolvePublishOptions } from '@openfairygui/functions';
import { publishNode } from '@openfairygui/functions/node';
import type { Command } from 'commander';
import { resolveFairyPath } from '../utils/project-input.js';
import { parseNonEmptyPathOption, parsePackageFilterOption, parseProjectType } from '../utils/project-type.js';
import { printJson } from '../utils/json-output.js';

type PublishCommandOptions = {
	output?: string;
	compressed?: boolean;
	packages?: string[];
	branch?: string;
	projectType?: number;
	json?: boolean;
	plugins?: boolean;
};

export function registerPublishCommand(program: Command): void {
	program
		.command('publish')
		.description('Publish project to binary outputs and configured generated code')
		.argument('<project-dir>', 'Project root directory or .fairy file', (value: string) =>
			parseNonEmptyPathOption(value, 'Project directory'),
		)
		.option('--json', 'Print one JSON result or error (exit 0: success, 1: workflow failure, 2: invalid arguments)')
		.option('-o, --output <dir>', 'Override project or package publish output directory', (value: string) =>
			parseNonEmptyPathOption(value, 'Output directory'),
		)
		.option('-c, --compressed', 'Compress binary data (overrides project setting)')
		.option('--no-compressed', 'Disable binary compression (overrides project setting)')
		.option('-p, --packages <a,b,c>', 'Only publish specific packages (comma-separated)', (value: string) =>
			parsePackageFilterOption(value),
		)
		.option('--no-plugins', 'Disable project plugin discovery and execution')
		.option('-b, --branch <name>', 'Active branch used by "主干合并活跃分支"; omit for main branch')
		.option(
			'-t, --project-type <name|id>',
			'Override project type (for example: unity, layabox, cocoscreator, 0, 4, 3)',
			(value: string) => parseProjectType(value),
		)
		.action(async (projectDir: string, options: PublishCommandOptions) => {
			const fairyPath = await resolveFairyPath(projectDir);
			const projectRootDir = path.dirname(fairyPath);
			const outputDir = options.output !== undefined ? path.resolve(options.output) : undefined;

			if (!options.json) {
				console.log(`Reading project: ${fairyPath}`);
			}
			const io = new NodeIO();
			const doc = await io.readProject(fairyPath);
			if (options.projectType !== undefined) {
				doc.getRoot().setProjectType(options.projectType);
			}

			const resolved = resolvePublishOptions(doc, {
				compressed: options.compressed,
				packages: options.packages,
				targetProjectType: options.projectType,
			});

			if (!options.json) {
				console.log(`Settings: ext=${resolved.fileExtension}, compressed=${resolved.compressed}`);
				if (options.branch) {
					console.log(`Active branch: ${options.branch}`);
				}
			}

			const result = await publishNode({
				document: doc,
				output: outputDir,
				compressed: resolved.compressed,
				fileExtension: resolved.fileExtension,
				packages: resolved.packages,
				assetsPath: path.join(projectRootDir, 'assets'),
				atlas: resolved.atlas,
				branch: options.branch,
				plugins: options.plugins === false ? [] : undefined,
			});
			if (options.json) {
				printJson('publish', result);
				return;
			}

			console.log(`\nDone!${outputDir ? ` Output override: ${outputDir}` : ''}`);
		});
}
