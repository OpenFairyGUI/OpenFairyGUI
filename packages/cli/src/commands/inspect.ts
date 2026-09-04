import type { Command } from 'commander';
import { inspect, type InspectReport } from '@openfairygui/functions';
import { NodeIO } from '@openfairygui/core/node';
import { resolveFairyPath } from '../utils/project-input.js';

export function registerInspectCommand(program: Command): void {
	program
		.command('inspect')
		.description('Show project contents report')
		.argument('<project-dir>', 'Project root directory or .fairy file')
		.option('--json', 'Print the machine-readable inspection report')
		.action(async (projectDir: string, options: { json?: boolean }) => {
			const fairyPath = await resolveFairyPath(projectDir);

			const io = new NodeIO();
			const doc = await io.readProject(fairyPath);
			const report = inspect(doc);

			if (options.json) console.log(JSON.stringify(report, null, 2));
			else {
				console.log(`Project: ${fairyPath}\n`);
				printReport(report);
			}
		});
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
		console.log(
			`  ${pkg.name} (${pkg.id}): ${res.images.count} img, ${res.sounds.count} snd, ${res.fonts.count} font, ${res.components.count} comp`,
		);
	}
}
