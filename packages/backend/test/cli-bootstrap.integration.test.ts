import test from 'ava';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createTempBackendProject } from './helpers.js';

test('CLI bootstrap can open session, print backend capabilities, and close session', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const cliPath = path.resolve('packages/cli/src/cli.ts');
		const output = await new Promise<string>((resolve, reject) => {
			const child = spawn(process.execPath, ['--import', 'tsx/esm', cliPath, 'backend-capabilities', fixture.rootDir], {
				cwd: path.resolve('.'),
				stdio: ['ignore', 'pipe', 'pipe'],
			});

			let stdout = '';
			let stderr = '';
			child.stdout.on('data', (chunk) => { stdout += String(chunk); });
			child.stderr.on('data', (chunk) => { stderr += String(chunk); });
			child.on('close', (code) => {
				if (code === 0) {
					resolve(stdout);
					return;
				}
				reject(new Error(stderr || `CLI exited with code ${code}`));
			});
		});

		t.true(output.includes('Runtime owner: @openfairygui/backend'));
		t.true(output.includes('Transaction owner: @openfairygui/core'));
		t.true(output.includes('App seam owner: @openfairygui/functions'));
	} finally {
		await fixture.cleanup();
	}
});
