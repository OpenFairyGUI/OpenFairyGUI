import test from 'ava';
import fs from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { createTempBackendProject } from './helpers.js';

const execFileAsync = promisify(execFile);

async function readPackageVersion(packageJsonPath: string): Promise<string> {
	const manifest = JSON.parse(await fs.readFile(path.resolve(packageJsonPath), 'utf-8')) as { version?: unknown };
	if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
		throw new Error(`Package manifest does not declare a version: ${packageJsonPath}`);
	}
	return manifest.version;
}

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

test.serial('built CLI bootstrap reports package version', async (t) => {
	const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
	await execFileAsync(pnpmCommand, ['--filter', '@openfairygui/cli', 'build'], {
		cwd: path.resolve('.'),
		shell: process.platform === 'win32',
	});
	const { stdout: output } = await execFileAsync(process.execPath, [path.resolve('packages/cli/bin/cli.cjs'), '--version']);
	const expectedVersion = await readPackageVersion('packages/cli/package.json');

	t.is(output.trim(), expectedVersion);
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
