import test from 'ava';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { writeProjectFromUam } from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';
import { createMinimalUamProject } from '@openfairygui/test-utils';

const execFileAsync = promisify(execFile);
const binPath = path.resolve('packages/cli/bin/cli.cjs');

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

test.serial('built CLI bin runs in-process and keeps version, JSON envelope and exit codes', async (t) => {
	const manifest = JSON.parse(await fs.readFile(path.resolve('packages/cli/package.json'), 'utf-8')) as {
		version: string;
	};
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-cli-no-child-'));
	t.teardown(() => fs.rm(directory, { recursive: true, force: true }));
	const preload = path.join(directory, 'no-child.cjs');
	await fs.writeFile(
		preload,
		`
		const childProcess = require('node:child_process');
		for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
			childProcess[name] = () => { throw new Error('CLI bootstrap must run in the current process'); };
		}
		require('node:module').syncBuiltinESMExports();
	`,
	);
	const nodeArgs = ['--require', preload, binPath];
	const { stdout: version } = await execFileAsync(process.execPath, [...nodeArgs, '--version']);
	t.is(version.trim(), manifest.version);

	const invalid = (await t.throwsAsync(
		execFileAsync(process.execPath, [...nodeArgs, 'not-a-command', '--json']),
	)) as Error & { code?: number; stdout?: string };
	t.is(invalid.code, 2);
	t.like(JSON.parse(invalid.stdout ?? ''), { success: false, error: { code: 'invalid_arguments' } });
});

test('CLI bootstrap prints help with registered commands', async (t) => {
	const output = await runCli(['--help']);

	t.true(output.includes('Usage: ofgui'));
	t.true(output.includes('inspect'));
	t.true(output.includes('publish'));
	t.true(output.includes('restore'));
	t.true(output.includes('backend-capabilities'));
});

test('CLI bootstrap can open session, print backend capabilities, and close session', async (t) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-bootstrap-'));
	t.teardown(() => fs.rm(root, { recursive: true, force: true }));
	await writeProjectFromUam(new NodeIO(), createMinimalUamProject('cli-bootstrap'), path.join(root, 'Project.fairy'));

	const output = await runCli(['backend-capabilities', root]);

	t.true(output.includes('Runtime owner: @openfairygui/backend'));
	t.true(output.includes('Transaction owner: @openfairygui/core'));
	t.true(output.includes('App seam owner: @openfairygui/functions'));
});
