import test from 'ava';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@openfairygui/core/node';
import { writeProjectFromUam } from '@openfairygui/core';
import { createMinimalUamProject } from '@openfairygui/test-utils';
import { createNodeBackendRuntime } from '@openfairygui/backend/node';
import { getInstalledDocumentationIndex, readInstalledDocumentation } from '@openfairygui/backend/docs';

const run = promisify(execFile);
const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
async function cli(args: string[]) {
	try {
		const result = await run(process.execPath, ['--import', 'tsx/esm', path.join(workspace, 'packages/cli/src/cli.ts'), ...args], { cwd: workspace, maxBuffer: 4 * 1024 * 1024 });
		return { ...result, code: 0 };
	} catch (error) { return error as { code: number; stdout: string; stderr: string }; }
}

test('CLI installed documentation exposes exact shared content, help and bounded IDs', async (t) => {
	t.true((await cli(['--help'])).stdout.includes('doctor'));
	t.true((await cli(['docs', '--help'])).stdout.includes('diagnostic'));
	t.deepEqual(JSON.parse((await cli(['docs', 'ls', '--json'])).stdout), getInstalledDocumentationIndex());
	for (const [command, value, id] of [
		['cat', 'workflow', 'workflow'], ['schema', 'setDisplayNodeProps', 'operations/setDisplayNodeProps'],
		['diagnostic', 'stale_write', 'diagnostics/stale_write'], ['cat', 'methods/queryEntity', 'methods/queryEntity'],
	]) {
		const result = await cli(['docs', command, value, '--json']);
		t.is(result.code, 0);
		t.deepEqual(JSON.parse(result.stdout), readInstalledDocumentation(id));
	}
	const found = JSON.parse((await cli(['docs', 'find', 'stale_write', '--json'])).stdout);
	t.true(found.documents.some((entry: { id: string }) => entry.id === 'diagnostics/stale_write'));
	for (const id of ['../package.json', 'constructor', 'operations/unknown']) {
		const result = await cli(['docs', 'cat', id, '--json']);
		t.is(result.code, 1);
		t.is(JSON.parse(result.stdout).error.code, 'documentation_unavailable');
	}
});

test('product doctor is read-only even with an active session and distinguishes failure', async (t) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-doctor-test-'));
	const runtime = createNodeBackendRuntime();
	let sessionId: string | undefined;
	try {
		const project = createMinimalUamProject('doctor');
		const image = project.packages[0]!.resources[0]!;
		if (image.kind !== 'image') throw new Error('Expected image fixture');
		image.sourceBytes = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
		const fairyPath = path.join(root, 'Project.fairy');
		await writeProjectFromUam(new NodeIO(), project, fairyPath);
		const opened = await runtime.openSession({ projectPath: fairyPath });
		if (!opened.ok) throw new Error(opened.error.message);
		sessionId = opened.data.sessionId;
		const contents = async () => {
			const names = (await fs.readdir(root, { recursive: true })).sort();
			return Promise.all(names.map(async (name) => (await fs.stat(path.join(root, name))).isFile() ? [name, (await fs.readFile(path.join(root, name))).toString('base64')] : [name]));
		};
		const before = await contents();
		const checked = await cli(['doctor', root, '--json']);
		t.is(checked.code, 0, checked.stderr);
		const report = JSON.parse(checked.stdout);
		t.is(report.scope, 'installed-product');
		t.is(report.status, 'ready');
		t.is(report.project.status, 'valid');
		t.true(report.project.complete);
		t.true(report.capabilities.ok);
		t.deepEqual(await contents(), before);
		const session = runtime.getSession({ sessionId });
		if (session.ok) t.deepEqual(session.data, opened.data);
		const noProject = JSON.parse((await cli(['doctor', '--json'])).stdout);
		t.is(noProject.project, null);
		t.true(noProject.limits.some((limit: string) => limit.includes('Without a project')));
		const missing = await cli(['doctor', path.join(root, 'missing'), '--json']);
		t.is(missing.code, 1);
		t.is(JSON.parse(missing.stdout).errors[0].code, 'project_check_failed');
	} finally {
		if (sessionId) await runtime.closeSession({ sessionId });
		await fs.rm(root, { recursive: true, force: true });
	}
});
