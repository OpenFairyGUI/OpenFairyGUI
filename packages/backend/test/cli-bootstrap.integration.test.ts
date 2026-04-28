import test from 'ava';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createTempBackendProject } from './helpers.js';

function runCli(args: string[]): Promise<string> {
	const cliPath = path.resolve('packages/cli/src/cli.ts');
	return new Promise<string>((resolve, reject) => {
		const child = spawn(process.execPath, ['--import', 'tsx/esm', cliPath, ...args], {
			cwd: path.resolve('.'),
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (chunk) => {
			stdout += String(chunk);
		});
		child.stderr.on('data', (chunk) => {
			stderr += String(chunk);
		});
		child.on('close', (code) => {
			if (code === 0) {
				resolve(stdout);
				return;
			}
			reject(new Error(stderr || `CLI exited with code ${code}`));
		});
	});
}

test('CLI bootstrap reports package version', async (t) => {
	const output = await runCli(['--version']);

	t.is(output.trim(), '0.2.0-alpha.1');
});

test('CLI bootstrap can open session, print backend capabilities, and close session', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const output = await runCli(['backend-capabilities', fixture.rootDir]);

		t.true(output.includes('Runtime owner: @openfairygui/backend'));
		t.true(output.includes('Transaction owner: @openfairygui/core'));
		t.true(output.includes('App seam owner: @openfairygui/functions'));
	} finally {
		await fixture.cleanup();
	}
});
