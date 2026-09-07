import test from 'ava';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

test('all CLI parser failures use the same JSON envelope, including root and nested options', (t) => {
	const entry = path.resolve('packages/cli/src/cli.ts');
	for (const [args, command] of [
		[['--json', 'unknown'], 'ofgui'], [['--json'], 'ofgui'],
		[['inspect', '--json'], 'inspect'], [['validate', '--json'], 'validate'],
		[['backend-capabilities', '--json'], 'backend-capabilities'],
		[['doctor', '--unknown', '--json'], 'doctor'],
		[['docs', '--json'], 'docs'], [['docs', 'unknown', '--json'], 'docs'],
		[['docs', 'cat', '--json'], 'docs cat'], [['--json', 'docs', 'schema'], 'docs schema'],
		[['docs', '--json', 'find'], 'docs find'], [['docs', 'diagnostic', '--json'], 'docs diagnostic'],
	] as const) {
		const run = spawnSync(process.execPath, ['--import', 'tsx/esm', entry, ...args], { encoding: 'utf8', timeout: 30_000 });
		t.is(run.status, 2, run.stderr);
		const envelope = JSON.parse(run.stdout);
		t.like(envelope, { schemaVersion: 1, command, success: false, error: { code: 'invalid_arguments' } });
		t.is(typeof envelope.error.message, 'string');
		t.false('result' in envelope);
	}
	for (const args of [['--json', 'docs', 'ls'], ['docs', '--json', 'ls'], ['docs', 'ls', '--json']]) {
		const run = spawnSync(process.execPath, ['--import', 'tsx/esm', entry, ...args], { encoding: 'utf8', timeout: 30_000 });
		t.is(run.status, 0, run.stderr);
		t.like(JSON.parse(run.stdout), { schemaVersion: 1, command: 'docs ls', success: true });
	}
	const help = spawnSync(process.execPath, ['--import', 'tsx/esm', entry, 'docs', '--help', '--json'], { encoding: 'utf8' });
	t.is(help.status, 0); t.true(help.stdout.startsWith('Usage:'));
});
