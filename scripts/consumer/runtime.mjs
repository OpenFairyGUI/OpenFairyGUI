import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { accessSync, constants, existsSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
export const json = (file) => JSON.parse(readFileSync(file, 'utf8'));

export function contained(parent, file) {
	const relative = path.relative(realpathSync(parent), realpathSync(file));
	assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `Path outside consumer package: ${file}`);
}

export function exportFiles(directory, manifest) {
	function visit(value) {
		if (typeof value === 'string') {
			assert(value.startsWith('./dist/'), `Non-dist public export: ${manifest.name}: ${value}`);
			const file = path.join(directory, value);
			assert(statSync(file).isFile(), `Missing export file: ${file}`);
			contained(directory, file);
		} else {
			assert(value && !Array.isArray(value), `Unsupported export map: ${manifest.name}`);
			for (const item of Object.values(value)) visit(item);
		}
	}
	for (const value of Object.values(manifest.exports ?? {})) visit(value);
}

function bin(name, packageName, args = []) {
	const directory = path.join(root, 'node_modules', packageName);
	const manifest = json(path.join(directory, 'package.json'));
	assert(manifest.bin?.[name], `Missing bin: ${name}`);
	const target = path.join(directory, manifest.bin[name]);
	contained(directory, target);
	assert(readFileSync(target, 'utf8').startsWith('#!/usr/bin/env node'), `Missing Node shebang: ${name}`);
	const shim = path.join(root, 'node_modules/.bin', `${name}${process.platform === 'win32' ? '.cmd' : ''}`);
	assert(existsSync(shim), `Missing installed bin shim: ${name}`);
	if (process.platform !== 'win32') { accessSync(shim, constants.X_OK); accessSync(target, constants.X_OK); }
	// Windows .cmd requires a shell; test its mapped Node bootstrap without shell interpolation.
	return process.platform === 'win32' ? [process.execPath, [target, ...args]] : [shim, args];
}

function cli(args) {
	return execFileSync(...bin('ofgui', '@openfairygui/cli', args), { cwd: root, encoding: 'utf8', timeout: 30_000 });
}

async function mcpSmoke(expectedVersion, expectedTools, expectedCatalog, expectedSchema) {
	const child = spawn(...bin('ofgui-mcp', '@openfairygui/mcp'), { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
	let stderr = '';
	let buffer = '';
	child.stderr.on('data', (chunk) => { stderr += chunk; });
	try {
		await new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error(`MCP handshake timed out: ${stderr}`)), 15_000);
			const fail = (error) => { clearTimeout(timer); reject(error); };
			child.once('error', fail);
			child.once('exit', (code) => fail(new Error(`MCP exited before discovery (${code}): ${stderr}`)));
			const send = (message) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
			child.stdout.on('data', (chunk) => {
				buffer += chunk;
				let end;
				while ((end = buffer.indexOf('\n')) >= 0) {
					const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
					try {
						const response = JSON.parse(line); // Non-protocol stdout is a failure, not ignored logging.
						assert.equal(response.jsonrpc, '2.0');
						assert(!response.error, JSON.stringify(response.error));
						if (response.id === 1) {
							assert.equal(response.result.protocolVersion, '2024-11-05');
							assert.equal(response.result.serverInfo.version, expectedVersion);
							assert(response.result.capabilities.tools);
							send({ method: 'notifications/initialized' });
							send({ id: 2, method: 'tools/list', params: {} });
						} else if (response.id === 2) {
							assert.deepEqual(response.result.tools.map((tool) => tool.name).sort(), [...expectedTools].sort());
							assert(response.result.tools.length > 0);
							assert(response.result.tools.every((tool) => tool._meta?.['openfairygui/contractDigest'] === expectedCatalog.digest));
							send({ id: 3, method: 'resources/read', params: { uri: 'openfairygui://contracts/operations' } });
						} else if (response.id === 3) {
							assert.deepEqual(JSON.parse(response.result.contents[0].text), expectedCatalog);
							send({ id: 4, method: 'resources/read', params: { uri: 'openfairygui://contracts/operations/addComponent' } });
						} else if (response.id === 4) {
							assert.deepEqual(JSON.parse(response.result.contents[0].text), expectedSchema);
							clearTimeout(timer); resolve();
						}
					} catch (error) { fail(error); }
				}
			});
			send({ id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'tarball-consumer', version: '1.0.0' } } });
		});
	} finally {
		child.stdin.end();
		if (child.exitCode === null) {
			await new Promise((resolve) => { child.once('exit', resolve); child.kill(); });
		}
	}
}

export function snapshot(directory) {
	const result = {};
	function visit(current, prefix) {
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			assert(!entry.isSymbolicLink(), 'Example output must not contain symlinks');
			const name = `${prefix}${entry.name}`;
			if (entry.isDirectory()) visit(path.join(current, entry.name), `${name}/`);
			else result[name] = readFileSync(path.join(current, entry.name)).toString('base64');
		}
	}
	visit(directory, '');
	return result;
}

export async function runtimeSmoke() {
	assert(!process.env.NODE_PATH && !process.env.NODE_OPTIONS, 'Ambient Node resolution must be disabled');
	for (const name of ['@openfairygui/test-utils', 'tsx', 'typescript']) assert.throws(() => require.resolve(name), `Unexpected development dependency: ${name}`);
	const expected = json(path.join(root, 'expected.json'));
	let esmCount = 0; let cjsCount = 0;
	for (const source of expected) {
		const directory = path.join(root, 'node_modules', source.name);
		contained(root, directory);
		const manifest = json(path.join(directory, 'package.json'));
		assert.equal(manifest.name, source.name); assert.equal(manifest.version, source.version);
		assert.deepEqual(manifest.exports, source.exports);
		assert.deepEqual(manifest.bin, source.bin);
		assert.deepEqual(manifest.sideEffects, source.sideEffects);
		for (const range of Object.values({ ...manifest.dependencies, ...manifest.optionalDependencies })) assert(!/^(workspace:|link:|file:)/.test(range), 'Unpublishable dependency');
		exportFiles(directory, manifest);
		for (const [subpath, conditions] of Object.entries(manifest.exports ?? {})) {
			const specifier = source.name + (subpath === '.' ? '' : subpath.slice(1));
			contained(directory, fileURLToPath(import.meta.resolve(specifier)));
			if (specifier.endsWith('/image-validation-worker')) continue; // Dedicated browser Worker; bundled separately.
			assert(Object.keys(await import(specifier)).length > 0, `Empty ESM entry: ${specifier}`); esmCount++;
			if (conditions.require) {
				contained(directory, require.resolve(specifier));
				assert(Object.keys(require(specifier)).length > 0, `Empty CJS entry: ${specifier}`); cjsCount++;
			}
		}
	}
	const { createDemoProject } = await import('./examples/create-demo-project.mjs');
	const { inspectAndValidate } = await import('./examples/node-inspect-validate/index.mjs');
	const { editAndSave } = await import('./examples/revision-checked-edit-save/index.mjs');
	const projectPath = await createDemoProject(root);
	const projectRoot = path.dirname(projectPath);
	const beforeFiles = snapshot(projectRoot);
	const report = await inspectAndValidate(projectPath);
	assert.equal(report.validation.status, 'valid'); assert.equal(report.validation.complete, true);
	assert.equal(report.inspection.totals.packages, 1); assert.equal(report.inspection.totals.components, 1);
	assert.equal(report.inspection.totals.displayObjects, 1);
	assert.deepEqual(snapshot(projectRoot), beforeFiles, 'Inspection must not write to the project');
	assert(cli(['--help']).includes('inspect'));
	assert(cli(['inspect', '--help']).includes('--json'));
	assert.equal(cli(['--version']).trim(), expected.find((entry) => entry.name === '@openfairygui/cli').version);
	assert.deepEqual(JSON.parse(cli(['inspect', projectRoot, '--json'])), report.inspection);
	assert.equal(JSON.parse(cli(['validate', projectRoot, '--json'])).status, 'valid');
	assert.equal(execFileSync(...bin('openfairygui', '@openfairygui/cli', ['--version']), { encoding: 'utf8' }).trim(), expected[0].version);
	const { NodeIO } = await import('@openfairygui/core/node');
	const { readProjectAsUam } = await import('@openfairygui/core');
	const beforeProject = await readProjectAsUam(new NodeIO(), projectPath);
	const edited = await editAndSave(projectPath, 'Saved by a tarball consumer');
	assert.equal(edited.revision, 1); assert.equal(edited.dirty, false);
	const target = beforeProject.packages[0].resources.find((entry) => entry.kind === 'component').component.displayList[0];
	target.text = 'Saved by a tarball consumer';
	assert.deepEqual(edited.project, beforeProject, 'Only the requested semantic field may change');
	const afterFiles = snapshot(projectRoot);
	assert.deepEqual(Object.keys(afterFiles).sort(), Object.keys(beforeFiles).sort(), 'No extra project files');
	assert.deepEqual(Object.keys(afterFiles).filter((file) => beforeFiles[file] !== afterFiles[file]), ['assets/Main/MainView.xml']);
	assert.equal(JSON.parse(cli(['validate', projectRoot, '--json'])).status, 'valid');
	const { createNodeBackendRuntime } = await import('@openfairygui/backend/node');
	const runtime = createNodeBackendRuntime({ allowedProjectRoots: [projectRoot] });
	const reopened = await runtime.openSession({ projectPath });
	assert(reopened.ok, 'Example must release its session lock');
	try {
		const stale = await runtime.applyTransaction({ sessionId: reopened.data.sessionId, expectedRevision: 99, operations: [] });
		assert.equal(stale.ok, false); assert.equal(stale.error.code, 'stale_write');
		assert.deepEqual(snapshot(projectRoot), afterFiles);
	} finally { assert((await runtime.closeSession({ sessionId: reopened.data.sessionId })).ok); }
	const mcp = await import('@openfairygui/mcp');
	await mcpSmoke(expected.find((entry) => entry.name === '@openfairygui/mcp').version, mcp.OPENFAIRYGUI_BACKEND_TOOL_NAMES,
		mcp.getOpenFairyGuiOperationCatalog(), mcp.getOpenFairyGuiOperationSchema('addComponent'));
	// Execute the documented no-argument commands too; keep their generated projects inside this consumer.
	for (const name of ['node-inspect-validate', 'revision-checked-edit-save']) {
		const output = execFileSync(process.execPath, [`examples/${name}/index.mjs`], {
			cwd: root, encoding: 'utf8', timeout: 30_000,
			env: { ...process.env, TMPDIR: root, TMP: root, TEMP: root },
		});
		contained(root, JSON.parse(output).projectPath);
	}
	writeFileSync(path.join(root, 'runtime-result.json'), JSON.stringify({ esmCount, cjsCount, projectPath }));
	console.log(`[consumer] Runtime PASS: ${esmCount} ESM / ${cjsCount} CJS entries; CLI JSON; MCP discovery; read/edit/save/reread`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await runtimeSmoke();
