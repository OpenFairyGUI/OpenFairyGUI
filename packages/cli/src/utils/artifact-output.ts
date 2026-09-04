import type { Command } from 'commander';

// Keep one JSON document on stdout, including when a trusted project plugin logs directly.
const stdout = process.stdout.write.bind(process.stdout);
export function artifactJsonCommand(argv: string[]): 'publish' | 'restore' | undefined {
	const args = argv.slice(2, argv.indexOf('--') < 0 ? undefined : argv.indexOf('--'));
	return (args[0] === 'publish' || args[0] === 'restore') && args.includes('--json')
		&& !args.some((arg) => ['--help', '-h', '--version', '-V'].includes(arg)) ? args[0] : undefined;
}

export function configureArtifactJson(program: Command): void {
	program.exitOverride();
	process.stdout.write = process.stderr.write.bind(process.stderr);
}

export function printArtifactJson(command: 'publish' | 'restore', result: unknown, error?: { code: string; message: string }): void {
	stdout(`${JSON.stringify({ schemaVersion: 1, command, success: !error, ...(error ? { error } : { result }) })}\n`);
}
