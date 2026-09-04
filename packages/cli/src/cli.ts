import { Command, CommanderError } from 'commander';
import { artifactJsonCommand, configureArtifactJson, printArtifactJson } from './utils/artifact-output.js';
import { registerBackendCapabilitiesCommand } from './commands/backend-capabilities.js';
import { registerInspectCommand } from './commands/inspect.js';
import { registerPublishCommand } from './commands/publish.js';
import { registerRestoreCommand } from './commands/restore.js';
import { registerValidateCommand } from './commands/validate.js';
import { registerDocsCommand } from './commands/docs.js';
import { registerDoctorCommand } from './commands/doctor.js';
import { readPackageVersion } from './utils/package-version.js';

const PACKAGE_VERSION = readPackageVersion();

function createProgram(): Command {
	const program = new Command('ofgui');
	if (artifactJsonCommand(process.argv)) configureArtifactJson(program);

	program.description('FairyGUI Headless Authoring CLI').version(PACKAGE_VERSION).showHelpAfterError();

	registerInspectCommand(program);
	registerPublishCommand(program);
	registerRestoreCommand(program);
	registerValidateCommand(program);
	registerBackendCapabilitiesCommand(program);
	registerDocsCommand(program);
	registerDoctorCommand(program);

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
	const command = artifactJsonCommand(process.argv);
	const message = err instanceof Error ? err.message : String(err);
	if (command) printArtifactJson(command, undefined, { code: err instanceof CommanderError ? 'invalid_arguments' : `${command}_failed`, message });
	else console.error(message);
	process.exitCode = command && err instanceof CommanderError ? 2 : 1;
});
