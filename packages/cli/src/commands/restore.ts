import path from 'node:path';
import { restoreNode } from '@openfairygui/functions/node';
import type { Command } from 'commander';
import { parseNonEmptyPathOption, parsePackageFilterOption, parseProjectType } from '../utils/project-type.js';
import { printJson } from '../utils/json-output.js';

type RestoreCommandOptions = {
	output: string;
	packages?: string[];
	force?: boolean;
	projectType?: number;
	json?: boolean;
};

export function registerRestoreCommand(program: Command): void {
	program
		.command('restore')
		.description('Recover a project directory from trusted local published artifacts')
		.argument('<release-dir>', 'Published release directory', (value: string) =>
			parseNonEmptyPathOption(value, 'Release directory'),
		)
		.option('--json', 'Print one JSON result or error (exit 0: success, 1: workflow failure, 2: invalid arguments)')
		.requiredOption('-o, --output <dir>', 'Output project directory', (value: string) =>
			parseNonEmptyPathOption(value, 'Output directory'),
		)
		.option('-p, --packages <a,b,c>', 'Only restore specific packages (comma-separated)', (value: string) =>
			parsePackageFilterOption(value),
		)
		.option('-f, --force', 'Replace a non-empty output directory only after a complete staged restore')
		.option('-t, --project-type <name|id>', 'Override restored project type; default is unity', (value: string) =>
			parseProjectType(value),
		)
		.action(async (releaseDir: string, options: RestoreCommandOptions) => {
			const inputDir = path.resolve(releaseDir);
			const outputDir = path.resolve(options.output);

			if (!options.json) {
				console.log(`Restoring published FairyGUI project: ${inputDir}`);
			}
			const result = await restoreNode({
				inputDir,
				output: outputDir,
				packages: options.packages,
				force: options.force,
				projectType: options.projectType,
			});

			const packages = result.document.getRoot().listPackages();
			if (options.json) {
				printJson('restore', {
					projectPath: result.projectPath,
					packages: packages.map((pkg) => ({ id: pkg.getId(), name: pkg.getName() })),
					warnings: result.warnings,
				});
				return;
			}
			console.log(`\nDone! Output: ${result.projectPath}`);
			console.log(`Packages: ${packages.map((pkg) => pkg.getName()).join(', ')}`);
			for (const warning of result.warnings) {
				console.warn(`Warning: ${warning}`);
			}
		});
}
