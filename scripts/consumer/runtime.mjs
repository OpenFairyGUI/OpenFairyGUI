import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
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

export function bin(name, packageName, args = []) {
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

export function assertCliEnvelope(envelope, status) {
	const { getInstalledContractSnapshot } = require('@openfairygui/backend/docs');
	const { z } = createRequire(require.resolve('@openfairygui/mcp'))('zod');
	const contract = getInstalledContractSnapshot();
	assert(Object.hasOwn(contract.cli, envelope.command), `Unknown CLI command: ${envelope.command}`);
	const validated = z.fromJSONSchema({ ...contract.cli[envelope.command], $defs: contract.$defs }).safeParse(envelope);
	assert(validated.success, JSON.stringify(validated.error));
	assert.equal(envelope.success, status === 0);
}

function cli(args) {
	try {
		const output = execFileSync(...bin('ofgui', '@openfairygui/cli', args), { cwd: root, encoding: 'utf8', timeout: 30_000 });
		if (args.includes('--json')) assertCliEnvelope(JSON.parse(output), 0);
		return output;
	} catch (error) {
		if (error.stdout && args.includes('--json')) assertCliEnvelope(JSON.parse(error.stdout), error.status);
		throw error;
	}
}

async function mcpSmoke(expectedVersion, expectedTools, expectedCatalog, expectedSchema, expectedDocs) {
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
							send({ id: 5, method: 'resources/read', params: { uri: 'openfairygui://docs/index' } });
						} else if (response.id === 5) {
							assert.deepEqual(JSON.parse(response.result.contents[0].text), expectedDocs.index);
							send({ id: 6, method: 'resources/read', params: { uri: 'openfairygui://docs/workflow' } });
						} else if (response.id === 6) {
							assert.equal(response.result.contents[0].text, expectedDocs.workflow.text);
							send({ id: 7, method: 'resources/read', params: { uri: 'openfairygui://docs/diagnostics/stale_write' } });
						} else if (response.id === 7) {
							assert.equal(response.result.contents[0].text, expectedDocs.diagnostic.text);
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

async function hostCompositionSmoke() {
	const { createDemoProject } = await import('./examples/create-demo-project.mjs');
	const { createNodeBackendRuntime } = await import('@openfairygui/backend/node');
	const { createOpenFairyGuiMcpServer } = await import('@openfairygui/mcp');
	const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
	const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
	const { z } = createRequire(require.resolve('@openfairygui/mcp'))('zod');
	const projectPath = await createDemoProject(root);
	const before = snapshot(path.dirname(projectPath));
	const runtime = createNodeBackendRuntime({ allowedProjectRoots: [path.dirname(projectPath)] });
	let grant = false;
	let saveCalls = 0;
	let backendResult;
	const saveSession = runtime.saveSession.bind(runtime);
	runtime.saveSession = async (input) => { saveCalls++; return backendResult = await saveSession(input); };
	const failure = { ok: false, error: { code: 'save_approval_required', approvalRequestId: 'owner-request', approvalPath: '/#save-approvals' } };
	const policy = {
		failureSchema: z.strictObject({ ok: z.literal(false), error: z.strictObject({ code: z.literal('save_approval_required'), approvalRequestId: z.string(), approvalPath: z.string() }) }),
		beforeCall() { if (grant) { grant = false; return; } return failure; },
	};
	const server = createOpenFairyGuiMcpServer({ runtime, toolPolicies: {
		openfairygui_backend_save_session: policy, openfairygui_backend_materialize_session: policy,
	} });
	server.registerTool('host_probe', { inputSchema: z.object({}) }, async () => ({ content: [{ type: 'text', text: 'ok' }] }));
	const client = new Client({ name: 'installed-host-composition', version: '1' });
	const [ct, st] = InMemoryTransport.createLinkedPair();
	let sessionId;
	const call = (method, input) => client.callTool({ name: `openfairygui_backend_${method}`, arguments: input });
	try {
		await Promise.all([client.connect(ct), server.connect(st)]);
		const { tools } = await client.listTools();
		assert.equal(tools.length, 21); assert(tools.some(({ name }) => name === 'host_probe'));
		assert.equal((await client.callTool({ name: 'host_probe', arguments: {} })).content[0].text, 'ok');
		assert((await client.readResource({ uri: 'openfairygui://docs/workflow' })).contents[0].text.length > 0);
		assert((await client.getPrompt({ name: 'openfairygui_save_session' })).messages.length > 0);
		const opened = (await call('open_session', { projectPath })).structuredContent.backendResult;
		assert(opened.ok); sessionId = opened.data.sessionId;
		assert(!(await call('apply_transaction', { sessionId, expectedRevision: 0, operations: [{ kind: 'renameResource', selector: { packageId: 'pkgdemo1', resourceId: 'cmpdemo1' }, newName: 'Approved' }] })).isError);
		const input = { sessionId, expectedRevision: 1 };
		assert(!(await call('read_session_state', input)).isError);
		for (const method of ['save_session', 'materialize_session']) {
			const pending = await call(method, input);
			assert.equal(pending.isError, true); assert.deepEqual(pending.structuredContent, { backendResult: failure });
			assert.deepEqual(JSON.parse(pending.content[0].text), failure);
			assert(z.fromJSONSchema(tools.find(({ name }) => name.endsWith(`_${method}`)).outputSchema).safeParse(pending.structuredContent).success);
		}
		assert.equal(saveCalls, 0); assert.deepEqual(snapshot(path.dirname(projectPath)), before);
		grant = true; // Only the fixture owner approves; the policy does not execute Backend itself.
		const saved = await call('save_session', input);
		assert(!saved.isError); assert.equal(saveCalls, 1);
		assert.deepEqual(saved.structuredContent, { backendResult });
		assert(existsSync(path.join(path.dirname(projectPath), 'assets/Main/Approved.xml')));
		assert.equal((await call('save_session', input)).structuredContent.backendResult.error.code, 'save_approval_required');
		assert.equal(saveCalls, 1);
		grant = true;
		const stale = await call('save_session', { sessionId, expectedRevision: 0 });
		assert.equal(stale.structuredContent.backendResult.error.code, 'stale_write');
		assert.deepEqual(stale.structuredContent, { backendResult }); assert.equal(saveCalls, 2);
		console.log('[consumer] Host composition PASS: SDK discovery, installed docs/prompts, declared approval failure, one approved save and original Backend errors');
	} finally {
		if (sessionId) await runtime.closeSession({ sessionId });
		await client.close(); await server.close();
	}
}

async function sessionReadSmoke() {
	const { createPublishProject, IMAGE_BYTES } = await import('./examples/publish-restore/index.mjs');
	const { createNodeBackendRuntime } = await import('@openfairygui/backend/node');
	const { OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS } = await import('@openfairygui/mcp');
	const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
	const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
	const projectPath = await createPublishProject(root);
	const projectRoot = path.dirname(projectPath);
	const beforeFiles = snapshot(projectRoot);
	const selector = { packageId: 'pkgshare', resourceId: 'red' };
	const replacement = Uint8Array.from(Buffer.from(IMAGE_BYTES.blue, 'base64'));
	for (const mode of ['sdk', 'mcp']) {
		const runtime = mode === 'sdk' ? createNodeBackendRuntime({ allowedProjectRoots: [projectRoot] }) : null;
		const client = mode === 'mcp' ? new Client({ name: 'installed-session-reader', version: '1.0.0' }) : null;
		let sessionId;
		const call = async (method, input) => {
			if (runtime) return runtime[method](input);
			const name = OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS.find((entry) => entry.backendMethod === method).name;
			const result = await client.callTool({ name, arguments: input });
			const backend = result.structuredContent.backendResult;
			assert.deepEqual(JSON.parse(result.content[0].text), backend);
			assert.equal(Boolean(result.isError), !backend.ok);
			return backend;
		};
		try {
			if (client) {
				await client.connect(new StdioClientTransport({ command: process.execPath,
					args: ['--input-type=module', '--eval', 'const m = await import(process.argv[1]); await m.connectOpenFairyGuiMcpStdio();', import.meta.resolve('@openfairygui/mcp/stdio')],
					env: { OPENFAIRYGUI_ALLOWED_PROJECT_ROOTS: projectRoot }, stderr: 'inherit',
				}));
				await client.listTools();
			}
			const opened = await call('openSession', { projectPath }); assert(opened.ok, JSON.stringify(opened));
			sessionId = opened.data.sessionId;
			const initial = await call('readSessionState', { sessionId }); assert(initial.ok);
			assert.equal(initial.data.revision, 0); assert.equal(initial.data.dirty, false);
			const applied = await call('applyTransaction', { sessionId, expectedRevision: 0, operations: [
				{ kind: 'setDisplayNodeProps', selector: { packageId: 'pkgdemo1', componentResourceId: 'cmpdemo1', displayNodeId: 'title' }, props: { text: 'unsaved consumer read' } },
				{ kind: 'replaceResourceBytes', selector, sourceBytes: runtime ? replacement : [...replacement] },
			] }); assert(applied.ok, JSON.stringify(applied));
			const state = await call('readSessionState', { sessionId, expectedRevision: applied.data.revision }); assert(state.ok, JSON.stringify(state));
			assert.equal(state.data.revision, 1); assert.equal(state.data.lastSavedRevision, 0); assert.equal(state.data.dirty, true);
			assert.equal(state.data.uamFidelity, 'full'); assert.equal(state.data.readComplete, true); assert.deepEqual(state.data.readDiagnostics, []);
			const main = state.data.project.packages.find((pkg) => pkg.id === 'pkgdemo1').resources.find((resource) => resource.id === 'cmpdemo1');
			assert.equal(main.component.displayList.find((node) => node.id === 'title').text, 'unsaved consumer read');
			for (const pkg of state.data.project.packages) for (const resource of pkg.resources) assert(!Object.hasOwn(resource, 'sourceBytes'));
			const bytes = await call('readResourceBytes', { sessionId, expectedRevision: state.data.revision, selector }); assert(bytes.ok, JSON.stringify(bytes));
			assert.equal(bytes.data.revision, state.data.revision); assert.deepEqual([...bytes.data.sourceBytes], [...replacement]);
			for (const method of ['readSessionState', 'readResourceBytes']) {
				const stale = await call(method, { sessionId, expectedRevision: 0, ...(method === 'readResourceBytes' ? { selector } : {}) });
				assert.equal(stale.ok, false); assert.equal(stale.error.code, 'stale_read'); assert.equal(stale.error.actualRevision, 1);
			}
			const after = await call('getSession', { sessionId }); assert(after.ok); assert.deepEqual(after.data, applied.data);
			assert.deepEqual(snapshot(projectRoot), beforeFiles, `${mode} reads must expose unsaved bytes without saving or changing source files`);
		} finally {
			try { if (sessionId) await call('closeSession', { sessionId }); }
			finally { if (client) await client.close(); }
		}
		assert.deepEqual(snapshot(projectRoot), beforeFiles);
	}
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
	const { inspectThroughMcp } = await import('./examples/mcp-stdio-client/index.mjs');
	const { artifactSmoke } = await import('./artifact-eval.mjs');
	await artifactSmoke();
	await sessionReadSmoke();
	const projectPath = await createDemoProject(root);
	const projectRoot = path.dirname(projectPath);
	const beforeFiles = snapshot(projectRoot);
	const mcpExample = await inspectThroughMcp(projectPath);
	assert.equal(mcpExample.session.dirty, false); assert.equal(mcpExample.current.revision, 0);
	assert.equal(mcpExample.preview.projectedRevision, 1);
	assert.deepEqual(mcpExample.preview.impact.files, [{ path: 'assets/Main/MainView.xml', kind: 'file', change: 'updated' }]);
	assert.deepEqual(snapshot(projectRoot), beforeFiles, 'The public MCP example must not apply or save its preview');
	const report = await inspectAndValidate(projectPath);
	assert.equal(report.validation.status, 'valid'); assert.equal(report.validation.complete, true);
	assert.equal(report.inspection.totals.packages, 1); assert.equal(report.inspection.totals.components, 1);
	assert.equal(report.inspection.totals.displayObjects, 1);
	assert.deepEqual(snapshot(projectRoot), beforeFiles, 'Inspection must not write to the project');
	assert(cli(['--help']).includes('inspect'));
	assert(cli(['inspect', '--help']).includes('--json'));
	assert.equal(cli(['--version']).trim(), expected.find((entry) => entry.name === '@openfairygui/cli').version);
	assert.deepEqual(JSON.parse(cli(['inspect', projectRoot, '--json'])).result, report.inspection);
	assert.equal(JSON.parse(cli(['validate', projectRoot, '--json'])).result.status, 'valid');
	assert.equal(JSON.parse(cli(['backend-capabilities', projectRoot, '--json'])).result.runtimeOwner, '@openfairygui/backend');
	const docs = await import('@openfairygui/backend/docs');
	const expectedDocs = {
		index: JSON.parse(cli(['docs', 'ls', '--json'])).result,
		workflow: JSON.parse(cli(['docs', 'cat', 'workflow', '--json'])).result,
		diagnostic: JSON.parse(cli(['docs', 'diagnostic', 'stale_write', '--json'])).result,
	};
	assert.deepEqual(expectedDocs.index, docs.getInstalledDocumentationIndex());
	assert.equal(expectedDocs.index.packageVersion, expected.find((entry) => entry.name === '@openfairygui/backend').version);
	assert.match(expectedDocs.index.documentationDigest, /^[a-f0-9]{64}$/);
	const backendDirectory = path.join(root, 'node_modules/@openfairygui/backend');
	for (const [id, file] of [['workflow', 'docs/workflow.md'], ['skill', 'docs/skills/openfairygui/SKILL.md']]) {
		const source = readFileSync(path.join(backendDirectory, file), 'utf8').replaceAll('\r\n', '\n');
		assert.equal(docs.readInstalledDocumentation(id).text, source);
		assert.equal(JSON.parse(cli(['docs', 'cat', id, '--json'])).result.text, source);
	}
	const restoreLimits = docs.readInstalledDocumentation('restore-limits');
	assert.equal(restoreLimits.mimeType, 'text/markdown');
	assert.equal(JSON.parse(cli(['docs', 'cat', 'restore-limits', '--json'])).result.text, restoreLimits.text);
	assert(restoreLimits.text.includes('projectId') && restoreLimits.text.includes('--force'));
	assert(JSON.parse(cli(['docs', 'find', 'stale_write', '--json'])).result.documents.some((entry) => entry.id === 'diagnostics/stale_write'));
	assert.deepEqual(JSON.parse(JSON.parse(cli(['docs', 'schema', 'setDisplayNodeProps', '--json'])).result.text), docs.getOpenFairyGuiOperationSchema('setDisplayNodeProps'));
	for (const id of ['../package.json', 'constructor', 'methods/unknown']) {
		assert.throws(() => cli(['docs', 'cat', id, '--json']), (error) => error.status === 1 && JSON.parse(error.stdout).error.code === 'documentation_unavailable');
	}
	const doctor = JSON.parse(cli(['doctor', projectRoot, '--json'])).result;
	assert.equal(doctor.status, 'ready'); assert.equal(doctor.project.status, 'valid'); assert(doctor.project.complete);
	assert.equal(doctor.packageVersion, doctor.cliVersion);
	assert.deepEqual(doctor.checks.map((check) => [check.id, check.status]), [['native-images', 'ok'], ['temp-directory', 'ok']]);
	const outputDirectory = path.join(projectRoot, 'not-created', 'release');
	const noProject = JSON.parse(cli(['doctor', '--output-dir', outputDirectory, '--json'])).result;
	assert.equal(noProject.project, null); assert.equal(noProject.scope, 'installed-product');
	const outputCheck = noProject.checks.find((check) => check.id === 'output-directory');
	assert.equal(outputCheck.path, outputDirectory); assert.equal(outputCheck.inspectedPath, realpathSync.native(projectRoot));
	assert.equal(outputCheck.status, 'ok'); assert.equal(outputCheck.exists, false);
	assert(!existsSync(path.dirname(outputDirectory)), 'Doctor must not create a missing output directory');
	assert.throws(() => cli(['doctor', '--output-dir', projectPath, '--json']), (error) => error.status === 1 && JSON.parse(error.stdout).result.checks.some((check) => check.id === 'output-directory' && check.status === 'error'));
	assert.throws(() => cli(['doctor', '--output-dir=', '--json']), (error) => error.status === 2 && JSON.parse(error.stdout).error.code === 'invalid_arguments');
	// Exercise a broken temp path through the installed CLI, without a source loader needing its own temp cache.
	const badTemp = spawnSync(...bin('ofgui', '@openfairygui/cli', ['doctor', '--json']), { cwd: root, encoding: 'utf8', timeout: 30_000,
		env: { ...process.env, TEMP: projectPath, TMP: projectPath, TMPDIR: projectPath },
	});
	assert.equal(badTemp.status, 1, badTemp.stderr);
	const badTempEnvelope = JSON.parse(badTemp.stdout);
	assertCliEnvelope(badTempEnvelope, badTemp.status);
	assert.equal(badTempEnvelope.result.checks.find((check) => check.id === 'temp-directory').status, 'error');
	const { NodeIO } = await import('@openfairygui/core/node');
	const { readProjectAsUam, liftDocumentToUamProject, writeProjectFromUam } = await import('@openfairygui/core');
	const unsupportedPath = await createDemoProject(root);
	const unsupportedProject = await readProjectAsUam(new NodeIO(), unsupportedPath);
	unsupportedProject.packages[0].resources.find((resource) => resource.kind === 'component').component.displayList[0].name = 'not-title';
	await writeProjectFromUam(new NodeIO(), unsupportedProject, unsupportedPath);
	const unsupportedBefore = snapshot(path.dirname(unsupportedPath));
	await assert.rejects(inspectThroughMcp(unsupportedPath), /This example expects Main\/MainView\/title/);
	await assert.rejects(editAndSave(unsupportedPath), /This example expects Main\/MainView with a text node named title/);
	assert.deepEqual(snapshot(path.dirname(unsupportedPath)), unsupportedBefore, 'Examples failing before apply must preserve the source');
	const decoderProjectPath = await createDemoProject(root);
	const decoderDocument = await new NodeIO().readProject(decoderProjectPath);
	decoderDocument.getRoot().listPackages()[0].addResource(decoderDocument.createImageResource('pixel.png').setId('pixel').setPath('/').setFileName('pixel.png'));
	const decoderProject = liftDocumentToUamProject(decoderDocument);
	decoderProject.packages[0].resources.find((entry) => entry.kind === 'image').sourceBytes = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
	await writeProjectFromUam(new NodeIO(), decoderProject, decoderProjectPath);
	assert.equal(JSON.parse(cli(['doctor', decoderProjectPath, '--json'])).result.status, 'ready');
	const decoderBefore = snapshot(path.dirname(decoderProjectPath));
	// Simulate the optional decoder being absent without modifying the installed package tree.
	const loader = `data:text/javascript,${encodeURIComponent("export async function resolve(id, context, next) { if (id === 'sharp') throw new Error('Decoder unavailable in this consumer check'); return next(id, context); }")}`;
	const register = `data:text/javascript,${encodeURIComponent(`import { register } from 'node:module'; register(${JSON.stringify(loader)});`)}`;
	// The CLI bootstrap spawns Node, so explicitly pass the test loader to its child as well.
	const incomplete = spawnSync(...bin('ofgui', '@openfairygui/cli', ['doctor', decoderProjectPath, '--json']), { cwd: root, encoding: 'utf8', timeout: 30_000, env: { ...process.env, NODE_OPTIONS: `--import=${register}` } });
	assert.equal(incomplete.status, 3, incomplete.stderr);
	const incompleteEnvelope = JSON.parse(incomplete.stdout);
	assertCliEnvelope(incompleteEnvelope, incomplete.status);
	assert.equal(incompleteEnvelope.success, false);
	assert.equal(incompleteEnvelope.error.code, 'doctor_incomplete');
	const incompleteReport = incompleteEnvelope.result;
	assert.equal(incompleteReport.status, 'incomplete'); assert.equal(incompleteReport.project.complete, false);
	assert.equal(incompleteReport.checks[0].status, 'incomplete');
	assert(incompleteReport.project.diagnostics.some((entry) => entry.code === 'decode_capability_unavailable'));
	const noDecoder = spawnSync(...bin('ofgui', '@openfairygui/cli', ['doctor', '--json']), { cwd: root, encoding: 'utf8', timeout: 30_000, env: { ...process.env, NODE_OPTIONS: `--import=${register}` } });
	assert.equal(noDecoder.status, 3, noDecoder.stderr);
	const noDecoderEnvelope = JSON.parse(noDecoder.stdout);
	assertCliEnvelope(noDecoderEnvelope, noDecoder.status);
	assert.equal(noDecoderEnvelope.result.project, null); assert.equal(noDecoderEnvelope.result.checks[0].status, 'incomplete');
	assert.deepEqual(snapshot(path.dirname(decoderProjectPath)), decoderBefore);
	assert.deepEqual(snapshot(projectRoot), beforeFiles, 'Product diagnosis and documentation must not change project files');
	assert.equal(execFileSync(...bin('openfairygui', '@openfairygui/cli', ['--version']), { encoding: 'utf8' }).trim(), expected[0].version);
	const beforeProject = await readProjectAsUam(new NodeIO(), projectPath);
	const edited = await editAndSave(projectPath, 'Saved by a tarball consumer');
	assert.equal(edited.revision, 1); assert.equal(edited.dirty, false);
	const target = beforeProject.packages[0].resources.find((entry) => entry.kind === 'component').component.displayList[0];
	target.text = 'Saved by a tarball consumer';
	assert.deepEqual(edited.project, beforeProject, 'Only the requested semantic field may change');
	const afterFiles = snapshot(projectRoot);
	assert.deepEqual(Object.keys(afterFiles).sort(), Object.keys(beforeFiles).sort(), 'No extra project files');
	assert.deepEqual(Object.keys(afterFiles).filter((file) => beforeFiles[file] !== afterFiles[file]), ['assets/Main/MainView.xml']);
	assert.equal(JSON.parse(cli(['validate', projectRoot, '--json'])).result.status, 'valid');
	const { createNodeBackendFileSystem, createNodeBackendRuntime } = await import('@openfairygui/backend/node');
	const runtime = createNodeBackendRuntime({ allowedProjectRoots: [projectRoot] });
	const failureRuntime = createNodeBackendRuntime({ allowedProjectRoots: [path.dirname(unsupportedPath)] });
	const afterFailure = await failureRuntime.openSession({ projectPath: unsupportedPath });
	assert(afterFailure.ok, 'Examples failing before apply must release their session locks');
	assert((await failureRuntime.closeSession({ sessionId: afterFailure.data.sessionId })).ok);
	const reopened = await runtime.openSession({ projectPath });
	assert(reopened.ok, 'Example must release its session lock');
	try {
		assert.equal(JSON.parse(cli(['doctor', projectRoot, '--json'])).result.status, 'ready', 'Doctor must not contend with a session lock');
		const component = beforeProject.packages[0].resources.find((entry) => entry.kind === 'component');
		const queried = runtime.queryEntity({ sessionId: reopened.data.sessionId, target: {
			kind: 'displayNode', selector: { packageId: beforeProject.packages[0].id, componentResourceId: component.id, displayNodeId: target.id },
		} });
		assert(queried.ok && queried.data.entity.kind === 'displayNode');
		assert.equal(queried.data.revision, reopened.data.revision);
		assert.deepEqual(queried.data.entity.properties, target);
		const stale = await runtime.applyTransaction({ sessionId: reopened.data.sessionId, expectedRevision: 99, operations: [] });
		assert.equal(stale.ok, false); assert.equal(stale.error.code, 'stale_write');
		assert.deepEqual(snapshot(projectRoot), afterFiles);
	} finally { assert((await runtime.closeSession({ sessionId: reopened.data.sessionId })).ok); }
	for (const failureKind of ['invalid', 'incomplete', 'valid-but-incomplete', 'save']) {
		const recoveryPath = await createDemoProject(root);
		const recoveryRoot = path.dirname(recoveryPath);
		const originalFiles = snapshot(recoveryRoot);
		const fileSystem = createNodeBackendFileSystem();
		const atomicWrite = fileSystem.runProjectWriteTransaction;
		let injectFailure = true;
		let saveCalls = 0;
		fileSystem.runProjectWriteTransaction = (directory, write) => atomicWrite(directory, (staged) => write({
			...staged,
			async writeFile(file, content) {
				if (injectFailure && failureKind === 'save') throw Object.assign(new Error('Injected consumer write failure'), { code: 'EACCES' });
				return staged.writeFile(file, content);
			},
		}));
		const recoveryRuntime = createNodeBackendRuntime({ allowedProjectRoots: [recoveryRoot], fileSystem });
		const validateSession = recoveryRuntime.validateSession.bind(recoveryRuntime);
		const saveSession = recoveryRuntime.saveSession.bind(recoveryRuntime);
		recoveryRuntime.validateSession = (input) => {
			const result = validateSession(input);
			assert(result.ok);
			return injectFailure && failureKind !== 'save' ? { ...result, data: {
				...result.data, status: failureKind === 'valid-but-incomplete' ? 'valid' : failureKind, complete: failureKind === 'invalid',
			} } : result;
		};
		recoveryRuntime.saveSession = (input) => { saveCalls++; return saveSession(input); };
		let failure;
		await assert.rejects(editAndSave(recoveryPath, 'Recover the unsaved edit', recoveryRuntime), (error) => {
			failure = error;
			return error.recovery?.runtime === recoveryRuntime && error.recovery.projectPath === recoveryPath;
		});
		const { sessionId } = failure.recovery;
		try {
			const retained = recoveryRuntime.getSession({ sessionId });
			assert(retained.ok, 'The example must leave its failed edit recoverable');
			assert.equal(retained.data.dirty, true); assert.equal(retained.data.revision, 1); assert.equal(retained.data.lastSavedRevision, 0);
			assert.equal(retained.data.lockHeld, true);
			assert.equal(saveCalls, failureKind === 'save' ? 1 : 0, 'No save after failed validation or automatic retry after a write failure');
			assert.deepEqual(snapshot(recoveryRoot), originalFiles, 'Failed validation or staged writes must preserve the original files');
			if (failureKind === 'save') {
				assert.equal(failure.cause.cause.error.code, 'save_partial_failure');
				assert(failure.cause.cause.error.failedPaths.length > 0, 'Preserve the backend recovery report');
			} else assert.equal(failure.cause.cause.complete, failureKind === 'invalid');
			const peer = await createNodeBackendRuntime({ allowedProjectRoots: [recoveryRoot] }).openSession({ projectPath: recoveryPath });
			assert(!peer.ok && peer.error.code === 'lock_conflict', 'The dirty session must retain its project lock');
			// The host resolves the fault, validates, then explicitly saves the same revision without reapplying.
			injectFailure = false;
			const validation = recoveryRuntime.validateSession({ sessionId });
			assert(validation.ok && validation.data.status === 'valid' && validation.data.complete);
			const saved = await recoveryRuntime.saveSession({ sessionId, expectedRevision: retained.data.revision });
			assert(saved.ok && !saved.data.dirty); assert.equal(saved.data.revision, 1);
			const restored = await readProjectAsUam(new NodeIO(), recoveryPath);
			assert.equal(restored.packages[0].resources.find((resource) => resource.kind === 'component').component.displayList[0].text, 'Recover the unsaved edit');
		} finally { assert((await recoveryRuntime.closeSession({ sessionId })).ok); }
		const unlocked = await recoveryRuntime.openSession({ projectPath: recoveryPath });
		assert(unlocked.ok, 'Explicit recovery cleanup must release the lock');
		assert((await recoveryRuntime.closeSession({ sessionId: unlocked.data.sessionId })).ok);
	}
	console.log('[consumer] Edit recovery PASS: failed validation/write retain revision, dirty state, diagnostics and lock; explicit recovery saves the same session');
	const mcp = await import('@openfairygui/mcp');
	await mcpSmoke(expected.find((entry) => entry.name === '@openfairygui/mcp').version, mcp.OPENFAIRYGUI_BACKEND_TOOL_NAMES,
		mcp.getOpenFairyGuiOperationCatalog(), mcp.getOpenFairyGuiOperationSchema('addComponent'), expectedDocs);
	await hostCompositionSmoke();
	// Execute the documented no-argument commands too; keep their generated projects inside this consumer.
	for (const name of ['node-inspect-validate', 'revision-checked-edit-save', 'publish-restore', 'mcp-stdio-client']) {
		const output = execFileSync(process.execPath, [`examples/${name}/index.mjs`], {
			cwd: root, encoding: 'utf8', timeout: 30_000,
			env: { ...process.env, TMPDIR: root, TMP: root, TEMP: root },
		});
		contained(root, JSON.parse(output).projectPath);
	}
	writeFileSync(path.join(root, 'runtime-result.json'), JSON.stringify({ esmCount, cjsCount, projectPath }));
	console.log(`[consumer] Runtime PASS: ${esmCount} ESM / ${cjsCount} CJS entries; CLI JSON; MCP discovery; read/edit/save/reread`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	runtimeSmoke().catch((error) => { console.error(error); process.exitCode = 1; });
}
