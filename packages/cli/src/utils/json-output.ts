import type { Command } from 'commander';
import type { CliCommand, CliCommandResults, CliEnvelope, CliError } from '../contracts.js';

// Keep exactly one JSON document on stdout, even if a trusted project plugin logs.
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
export function wantsJson(argv: readonly string[]): boolean {
	const args = argv.slice(2, argv.indexOf('--') < 0 ? undefined : argv.indexOf('--'));
	return args.includes('--json') && !args.some((arg) => ['--help', '-h', '--version', '-V'].includes(arg));
}

export function configureJson(program: Command, argv: readonly string[] = process.argv): () => void {
	program
		.option('--json', 'Print one JSON envelope (exit 0: success, 1: failure, 2: arguments, 3: incomplete)')
		.exitOverride();
	const previousStdoutWrite = process.stdout.write;
	const redirected = wantsJson(argv);
	if (redirected) {
		process.stdout.write = process.stderr.write.bind(process.stderr);
	}
	program.hook('preAction', (_root, command) => {
		command.setOptionValue('json', command.optsWithGlobals().json);
	});
	return () => {
		if (redirected) {
			process.stdout.write = previousStdoutWrite;
		}
	};
}

export function parsedCommand(program: Command): CliCommand {
	const names: string[] = [];
	let current = program;
	for (;;) {
		const next = current.commands.find((command) => command.name() === current.args[0]);
		if (!next) break;
		names.push(next.name());
		current = next;
	}
	// test:repo checks all registered command paths against CliOutputContracts.
	return (names.join(' ') || 'ofgui') as CliCommand;
}

export function printJson<C extends CliCommand>(command: C, result: CliCommandResults[C], error?: CliError): void {
	const envelope: CliEnvelope<C> = error
		? { schemaVersion: 1, command, success: false, error, result }
		: { schemaVersion: 1, command, success: true, result };
	originalStdoutWrite(`${JSON.stringify(envelope)}\n`);
}

export function printJsonError(command: CliCommand, error: CliError): void {
	const envelope: CliEnvelope<CliCommand> = { schemaVersion: 1, command, success: false, error };
	originalStdoutWrite(`${JSON.stringify(envelope)}\n`);
}
