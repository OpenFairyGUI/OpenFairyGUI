import path from 'node:path';
import { restoreNode } from '@openfairygui/functions/node';
import type { Command } from 'commander';
import { parseProjectType } from '../utils/project-type.js';

type RestoreCommandOptions = {
	output: string;
	packages?: string;
	force?: boolean;
	projectType?: string;
};

export function registerRestoreCommand(program: Command): void {
	program
		.command('restore')
		.description('Recover a project directory from trusted local published artifacts')
		.argument('<release-dir>', 'Published release directory')
		.requiredOption('-o, --output <dir>', 'Output project directory')
		.option('-p, --packages <a,b,c>', 'Only restore specific packages (comma-separated)')
		.option('-f, --force', 'Replace a non-empty output directory only after a complete staged restore')
		.option('-t, --project-type <name|id>', 'Override restored project type; default is unity')
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

			console.log(`Restoring published FairyGUI project: ${inputDir}`);
			const result = await restoreNode({
				inputDir,
				output: outputDir,
				packages: pkgFilter,
				force: options.force,
				projectType,
			});

			const packages = result.document.getRoot().listPackages();
			console.log(`\nDone! Output: ${result.projectPath}`);
			console.log(`Packages: ${packages.map((pkg) => pkg.getName()).join(', ')}`);
			for (const warning of result.warnings) {
				console.warn(`Warning: ${warning}`);
			}
		});
}
