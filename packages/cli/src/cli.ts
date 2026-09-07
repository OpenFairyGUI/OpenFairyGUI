import { Command, CommanderError } from 'commander';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { configureJson, parsedCommand, printJsonError, wantsJson } from './utils/json-output.js';
import { registerBackendCapabilitiesCommand } from './commands/backend-capabilities.js';
import { registerInspectCommand } from './commands/inspect.js';
import { registerPublishCommand } from './commands/publish.js';
import { registerRestoreCommand } from './commands/restore.js';
import { registerValidateCommand } from './commands/validate.js';
import { registerDocsCommand } from './commands/docs.js';
import { registerDoctorCommand } from './commands/doctor.js';
import { readPackageVersion } from './utils/package-version.js';

const PACKAGE_VERSION = readPackageVersion();

export function createProgram(): Command {
	const program = new Command('ofgui');
	configureJson(program);

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

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	const program = createProgram();
	program.parseAsync(process.argv).catch((err) => {
		if (err instanceof CommanderError && err.exitCode === 0) return;
		const command = parsedCommand(program);
		const message = err instanceof Error ? err.message : String(err);
		if (wantsJson(process.argv)) printJsonError(command, { code: err instanceof CommanderError ? 'invalid_arguments'
			: command === 'publish' || command === 'restore' ? `${command}_failed` : 'command_failed', message });
		else console.error(message);
		process.exitCode = err instanceof CommanderError ? 2 : 1;
	});
}
