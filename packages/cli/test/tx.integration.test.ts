import test from 'ava';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeProjectFromUam, readProjectAsUam } from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';
import { createMinimalUamProject } from '@openfairygui/test-utils';

test('CLI preflight preserves files, apply saves, stale revisions fail and locks are released', async (t) => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'ofgui-tx-'));
	const cli = path.resolve('packages/cli/bin/cli.cjs');
	try {
		const project = createMinimalUamProject('cli-tx');
		const image = project.packages[0].resources[0];
		if (image.kind !== 'image') throw new Error('Expected image');
		image.sourceBytes = Uint8Array.from(
			Buffer.from(
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
				'base64',
			),
		);
		const fairy = path.join(root, 'Project.fairy');
		await writeProjectFromUam(new NodeIO(), project, fairy);
		const original = await readProjectAsUam(new NodeIO(), fairy);
		const ops = path.join(root, 'ops.json');
		await writeFile(
			ops,
			JSON.stringify([
				{
					kind: 'renameResource',
					selector: { packageId: project.packages[0].id, resourceId: image.id },
					newName: 'Renamed',
				},
			]),
		);
		const args = (mode: string, rev = '0') => [
			cli,
			'tx',
			mode,
			root,
			'--ops',
			ops,
			'--expected-revision',
			rev,
			'--json',
		];
		t.true(
			execFileSync(process.execPath, [cli, 'tx', 'apply', '--help'], { encoding: 'utf8' }).includes(
				'--expected-revision',
			),
		);
		t.is(spawnSync(process.execPath, args('apply', '-1'), { encoding: 'utf8' }).status, 2);
		const preview = JSON.parse(execFileSync(process.execPath, args('preflight'), { encoding: 'utf8' }));
		t.true(preview.success);
		t.is(
			(await readProjectAsUam(new NodeIO(), fairy)).packages[0].resources[0].name,
			original.packages[0].resources[0].name,
		);
		const stale = spawnSync(process.execPath, args('apply', '1'), { encoding: 'utf8' });
		t.is(stale.status, 1);
		t.is(JSON.parse(stale.stdout).result.preflight.error.code, 'stale_write');
		const applied = JSON.parse(execFileSync(process.execPath, args('apply'), { encoding: 'utf8' }));
		t.true(applied.success);
		t.true(applied.result.save.ok);
		t.true(applied.result.close.ok);
		t.is((await readProjectAsUam(new NodeIO(), fairy)).packages[0].resources[0].name, 'Renamed');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
