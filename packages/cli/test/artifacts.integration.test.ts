import test from 'ava';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Document } from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';

function cli(args: string[]) {
	return spawnSync(process.execPath, ['--import', 'tsx/esm', path.resolve('packages/cli/src/cli.ts'), ...args], { encoding: 'utf8', timeout: 30_000 });
}

test('artifact CLI JSON covers help, syntax, failed workflows and atomic restore without contaminating stdout', async (t) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-artifact-cli-'));
	try {
		for (const command of ['publish', 'restore']) {
			t.true(cli([command, '--help']).stdout.includes('--json'));
			for (const args of [[], [root, '--unknown'], [root, '--output']]) {
				const result = cli([command, '--json', ...args]);
				t.is(result.status, 2, result.stderr);
				t.deepEqual({ ...JSON.parse(result.stdout), error: undefined }, { schemaVersion: 1, command, success: false, error: undefined });
				t.is(JSON.parse(result.stdout).error.code, 'invalid_arguments');
			}
			const result = cli([command, path.join(root, 'missing'), '-o', path.join(root, 'output'), '--json']);
			t.is(result.status, 1); t.is(JSON.parse(result.stdout).error.code, `${command}_failed`);
		}
		const source = path.join(root, 'source', 'Example.fairy');
		await fs.mkdir(path.dirname(source));
		const document = new Document();
		document.getRoot().setProjectType(4);
		document.createPackage('Main').setId('pkgdemo1').addResource(document.createComponent('MainView').setId('cmpdemo1').setPath('/').setSize(32, 24).setExported(true));
		await new NodeIO().writeProject(document, source);
		// Even direct stdout from a trusted project plugin must be routed away from machine results.
		const plugin = path.join(path.dirname(source), 'plugins', 'logger');
		await fs.mkdir(plugin, { recursive: true });
		await fs.writeFile(path.join(plugin, 'package.json'), JSON.stringify({ name: 'logger', main: 'index.cjs', openfairygui: true }));
		await fs.writeFile(path.join(plugin, 'index.cjs'), 'exports.onPublishStart = () => process.stdout.write("plugin output\\n");');
		const output = path.join(root, 'release');
		const published = cli(['publish', source, '-o', output, '--json']);
		t.is(published.status, 0, published.stderr);
		const report = JSON.parse(published.stdout);
		t.true(report.success); t.is(report.result.files.length, 1);
		t.is(report.result.files[0].path, path.join(output, 'Main.fui'));
		t.is(report.result.files[0].size, (await fs.stat(path.join(output, 'Main.fui'))).size);
		t.true(published.stderr.includes('plugin output'));
		const restored = path.join(root, 'restored');
		const success = cli(['restore', output, '-o', restored, '--json']);
		t.is(success.status, 0, success.stderr);
		t.true(JSON.parse(success.stdout).success);
		t.truthy(await new NodeIO().readProject(JSON.parse(success.stdout).result.projectPath));
		await fs.writeFile(path.join(restored, 'keep.txt'), 'keep');
		const refused = cli(['restore', output, '-o', restored, '--json']);
		t.is(refused.status, 1); t.is(JSON.parse(refused.stdout).error.code, 'restore_failed');
		await fs.writeFile(path.join(output, 'Main.fui'), 'corrupt trusted backup');
		const corrupt = cli(['restore', output, '-o', restored, '--force', '--json']);
		t.is(corrupt.status, 1); t.false(JSON.parse(corrupt.stdout).success);
		t.is(await fs.readFile(path.join(restored, 'keep.txt'), 'utf8'), 'keep');
		t.false((await fs.readdir(root)).some((name) => name.includes('.restore-')));
	} finally { await fs.rm(root, { recursive: true, force: true }); }
});
