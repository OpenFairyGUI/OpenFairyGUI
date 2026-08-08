import { Command } from 'commander';
import { registerBackendCapabilitiesCommand } from './commands/backend-capabilities.js';
import { registerInspectCommand } from './commands/inspect.js';
import { registerPublishCommand } from './commands/publish.js';
import { registerRestoreCommand } from './commands/restore.js';
import { registerValidateCommand } from './commands/validate.js';
import { readPackageVersion } from './utils/package-version.js';

const PACKAGE_VERSION = readPackageVersion();

function createProgram(): Command {
	const program = new Command('ofgui');

	program.description('FairyGUI Headless Authoring CLI').version(PACKAGE_VERSION).showHelpAfterError();

	registerInspectCommand(program);
	registerPublishCommand(program);
	registerRestoreCommand(program);
	registerValidateCommand(program);
	registerBackendCapabilitiesCommand(program);

	program.addHelpText(
		'after',
		[
			'',
			'Alias:',
			'  openfairygui',
			'',
			'Input can be a .fairy file or a project root directory (auto-discovers .fairy file).',
			'Publish settings are read from the project; --project-type applies target-specific output rules.',
		].join('\n'),
	);

	return program;
}

async function main(): Promise<void> {
	await createProgram().parseAsync(process.argv);
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : String(err));
	process.exit(1);
});
