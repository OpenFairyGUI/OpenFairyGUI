import test from 'ava';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { writeProjectFromUam } from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';
import { createMinimalUamProject } from '@openfairygui/test-utils';

const run = promisify(execFile);
const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('ofgui validate emits a machine-readable valid report', async (t) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-cli-validate-'));
	try {
		const project = createMinimalUamProject('cli-validation');
		const image = project.packages[0]!.resources[0]!;
		if (image.kind !== 'image') throw new Error('Expected image fixture');
		image.sourceBytes = Uint8Array.from(Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
			'base64',
		));
		await writeProjectFromUam(new NodeIO(), project, path.join(root, 'Project.fairy'));

		const { stdout } = await run(process.execPath, [
			'--import',
			'tsx/esm',
			path.join(workspace, 'packages/cli/src/cli.ts'),
			'validate',
			root,
			'--json',
		], { cwd: workspace });
		const report = JSON.parse(stdout).result as { status: string; complete: boolean };
		t.is(report.status, 'valid');
		t.true(report.complete);
		await fs.writeFile(path.join(root, 'Project.fairy'), '<project', 'utf8');
		const invalid = await t.throwsAsync(run(process.execPath, [
			'--import', 'tsx/esm', path.join(workspace, 'packages/cli/src/cli.ts'), 'validate', root, '--json',
		], { cwd: workspace })) as Error & { code: number; stdout: string };
		t.is(invalid.code, 1);
		t.like(JSON.parse(invalid.stdout), {
			schemaVersion: 1, command: 'validate', success: false,
			error: { code: 'validation_failed' }, result: { status: 'invalid' },
		});
		t.is(await fs.readFile(path.join(root, 'Project.fairy'), 'utf8'), '<project');
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});
