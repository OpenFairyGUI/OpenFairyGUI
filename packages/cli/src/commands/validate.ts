import type { Command } from 'commander';
import { validateProjectNode } from '@openfairygui/functions/node';
import { resolveFairyPath } from '../utils/project-input.js';

export function registerValidateCommand(program: Command): void {
	program
		.command('validate')
		.description('Validate project structure, references, and source files')
		.argument('<project-dir>', 'Project root directory or .fairy file')
		.option('--json', 'Print the machine-readable validation report')
		.action(async (projectDir: string, options: { json?: boolean }) => {
			const fairyPath = await resolveFairyPath(projectDir);
			const report = await validateProjectNode(fairyPath);
			if (options.json) {
				console.log(JSON.stringify(report, null, 2));
			} else {
				console.log(`${report.status.toUpperCase()}: ${fairyPath}`);
				for (const diagnostic of report.diagnostics) {
					const source = diagnostic.sourcePath ? ` (${diagnostic.sourcePath})` : '';
					console.log(`${diagnostic.severity.toUpperCase()} ${diagnostic.code} ${diagnostic.path}${source}: ${diagnostic.message}`);
				}
			}
			process.exitCode = report.status === 'valid' ? 0 : report.status === 'invalid' ? 1 : 2;
		});
}
