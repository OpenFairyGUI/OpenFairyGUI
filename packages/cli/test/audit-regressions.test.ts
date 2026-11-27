import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'ava';

function runCli(args: string[]) {
	return spawnSync(process.execPath, ['--import', 'tsx/esm', path.resolve('packages/cli/src/cli.ts'), ...args], {
		encoding: 'utf8',
		timeout: 30_000,
	});
}

test('CLI rejects empty path options, empty docs find queries, and invalid --project-type/--packages with exit 2', (t) => {
	const cases: Array<{ args: string[]; command: string }> = [
		{ args: ['restore', './missing', '--output', '', '--json'], command: 'restore' },
		{ args: ['publish', './missing', '--output', '   ', '--json'], command: 'publish' },
		{ args: ['publish', './missing', '--project-type', 'bogus', '--json'], command: 'publish' },
		{ args: ['publish', './missing', '--packages', ' , ', '--json'], command: 'publish' },
		{ args: ['doctor', '', '--json'], command: 'doctor' },
		{ args: ['doctor', '--output-dir', '  ', '--json'], command: 'doctor' },
		{ args: ['docs', 'find', '   ', '--json'], command: 'docs find' },
	];

	for (const entry of cases) {
		const result = runCli(entry.args);
		t.is(result.status, 2, `${entry.args.join(' ')} stderr=${result.stderr} stdout=${result.stdout}`);
		const envelope = JSON.parse(result.stdout) as {
			schemaVersion: number;
			command: string;
			success: boolean;
			error?: { code: string };
		};
		t.is(envelope.schemaVersion, 1);
		t.is(envelope.command, entry.command);
		t.false(envelope.success);
		t.is(envelope.error?.code, 'invalid_arguments');
	}
});
