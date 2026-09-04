import test from 'ava';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { NodeIO } from '@openfairygui/core/node';
import { inspect } from '@openfairygui/functions';
import { createMinimalUamProject } from '@openfairygui/test-utils';
import { writeProjectFromUam } from '@openfairygui/core';

const run = promisify(execFile);

test('inspect --json returns the existing report without human logs; default output and failures remain usable', async (t) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-inspect-'));
	try {
		const fairyPath = path.join(root, 'Project.fairy');
		await writeProjectFromUam(new NodeIO(), createMinimalUamProject('inspect-cli'), fairyPath);
		const args = ['--import', 'tsx/esm', path.resolve('packages/cli/src/cli.ts')];
		const expected = inspect(await new NodeIO().readProject(fairyPath));
		const json = await run(process.execPath, [...args, 'inspect', root, '--json']);
		t.deepEqual(JSON.parse(json.stdout), expected);
		t.is(json.stderr, '');
		const human = await run(process.execPath, [...args, 'inspect', fairyPath]);
		t.true(human.stdout.includes('Project:'));
		t.true(human.stdout.includes('Packages: 1'));
		const help = await run(process.execPath, [...args, 'inspect', '--help']);
		t.true(help.stdout.includes('--json'));
		const missing = await t.throwsAsync(run(process.execPath, [...args, 'inspect', path.join(root, 'missing'), '--json']));
		t.is((missing as { code?: number }).code, 1);
		t.is((missing as { stdout?: string }).stdout, '');
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});
