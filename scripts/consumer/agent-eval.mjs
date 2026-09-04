import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { readProjectAsUam, writeProjectFromUam } from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';
import { createNodeBackendFileSystem, createNodeBackendRuntime } from '@openfairygui/backend/node';
import { getInstalledDocumentationVersion } from '@openfairygui/backend/docs';
import { validateProjectNode } from '@openfairygui/functions/node';
import { createOpenFairyGuiMcpServer, OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS } from '@openfairygui/mcp';
import { createDemoProject } from './examples/create-demo-project.mjs';
import { contained, exportFiles, json, snapshot } from './runtime.mjs';
import { codexArguments, CONCURRENT_TEXT, EVAL_METHODS, expectedProject, FINAL_SCHEMA, gradeEvaluation, isolatedCodexEvents, observations, scopedFileSystem } from './agent-eval-checks.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const mcpRequire = createRequire(require.resolve('@openfairygui/mcp'));
const sdk = async (name) => import(pathToFileURL(mcpRequire.resolve(`@modelcontextprotocol/sdk/${name}.js`)).href);
const definitions = OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS.filter((entry) => EVAL_METHODS.includes(entry.backendMethod));
const toolName = (method) => definitions.find((entry) => entry.backendMethod === method).name;
const saveJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const data = (result) => { assert(result.ok, JSON.stringify(result)); return result.data; };
const lines = (file) => existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)) : [];

// This process hosts the installed product, not a second implementation of its editing protocol.
async function serve(config) {
	const record = (entry) => appendFileSync(config.trace, `${JSON.stringify({ at: Date.now(), ...entry })}\n`);
	const fileSystem = scopedFileSystem(createNodeBackendFileSystem(), config.workspace, record);
	const runtime = createNodeBackendRuntime({ allowedProjectRoots: [path.dirname(config.projectPath)], fileSystem });
	const server = createOpenFairyGuiMcpServer({ runtime });
	const { StdioServerTransport } = await sdk('server/stdio');
	const wire = new StdioServerTransport();
	const requests = new Map();
	const sessions = new Set();
	let injected = false;
	let pending = Promise.resolve();
	const transport = {
		async start() {
			wire.onerror = (error) => transport.onerror?.(error);
			wire.onclose = () => transport.onclose?.();
			wire.onmessage = (message) => {
				pending = pending.then(async () => {
					if (message.id !== undefined) {
						requests.set(message.id, message);
						record({ type: 'request', message });
					}
					if (message.method === 'tools/call') {
						const definition = definitions.find((entry) => entry.name === message.params.name);
						const input = message.params.arguments ?? {};
						let denied = !definition;
						if (definition?.backendMethod === 'openSession' && typeof input.projectPath === 'string') {
							try { denied = ![config.projectPath, path.dirname(config.projectPath)].includes(realpathSync(path.resolve(config.cwd, input.projectPath))); }
							catch { denied = true; }
						}
						if (denied) {
							record({ type: 'scope-violation', message });
							await transport.send({ jsonrpc: '2.0', id: message.id, error: { code: -32602, message: 'Evaluation host exposes only the supplied project and session-editing methods.' } });
							return;
						}
						if (config.task.id === 'stale-revision-recovery' && !injected && definition.backendMethod === 'applyTransaction' && definition.inputSchema.safeParse(input).success) {
							const current = runtime.getSession({ sessionId: input.sessionId });
							if (current.ok && input.expectedRevision === current.data.revision) {
								injected = true;
								const changed = data(await runtime.applyTransaction({ sessionId: input.sessionId, expectedRevision: current.data.revision, operations: [{ kind: 'setDisplayNodeProps', selector: { packageId: 'pkgdemo1', componentResourceId: 'cmpdemo1', displayNodeId: 'title' }, props: { text: CONCURRENT_TEXT } }] }));
								data(await runtime.saveSession({ sessionId: input.sessionId, expectedRevision: changed.revision }));
								record({ type: 'injection', ok: true, requestId: message.id, sessionId: input.sessionId, previousRevision: current.data.revision, revision: changed.revision });
							}
						}
					}
					await transport.onmessage?.(message);
				}).catch((error) => { record({ type: 'host-error', message: error.message }); transport.onerror?.(error); });
			};
			await wire.start();
		},
		async send(message) {
			const request = requests.get(message.id);
			if (request?.method === 'tools/list' && message.result?.tools) message.result.tools = message.result.tools.filter((tool) => definitions.some((entry) => entry.name === tool.name));
			const result = message.result?.structuredContent?.backendResult;
			if (request?.params?.name === toolName('openSession') && result?.ok) sessions.add(result.data.sessionId);
			if (request?.params?.name === toolName('closeSession') && result?.ok) sessions.delete(request.params.arguments.sessionId);
			if (message.id !== undefined) record({ type: 'response', message });
			await wire.send(message);
		},
		close: () => wire.close(),
	};
	let closing;
	function close() {
		closing ??= (async () => {
			await pending;
			for (const sessionId of sessions) data(await runtime.closeSession({ sessionId })); // No autosave.
			await server.close();
			record({ type: 'host-closed' });
			saveJson(config.closed, { closed: true });
		})();
		return closing;
	}
	process.stdin.once('end', () => void close());
	process.once('SIGTERM', () => void close());
	process.once('SIGINT', () => void close());
	await server.connect(transport);
	record({ type: 'host-ready', pid: process.pid, installed: getInstalledDocumentationVersion() });
}

// A scripted policy tests the harness; it is deliberately never labelled a model run.
async function reference(config, configPath) {
	const { Client } = await sdk('client/index');
	const { StdioClientTransport } = await sdk('client/stdio');
	const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(import.meta.url), '--serve', configPath], cwd: root, stderr: 'pipe' });
	const client = new Client({ name: 'ofgui-eval-reference', version: '1' });
	const call = async (method, args) => (await client.callTool({ name: toolName(method), arguments: args })).structuredContent.backendResult;
	try {
		await client.connect(transport);
		await client.readResource({ uri: 'openfairygui://docs/workflow' });
		const opened = data(await call('openSession', { projectPath: config.projectPath }));
		const sessionId = opened.sessionId;
		const outline = data(await call('getProjectOutline', { sessionId }));
		if (config.task.id !== 'inspect-validate') {
			const pkg = outline.packages.find((entry) => entry.name === 'Main');
			const resource = pkg.resources.find((entry) => entry.name === 'MainView');
			const target = { kind: 'resource', selector: { packageId: pkg.id, resourceId: resource.id } };
			const current = data(await call('queryEntity', { sessionId, target }));
			const input = { sessionId, expectedRevision: current.revision, operations: [{ kind: 'renameResource', selector: target.selector, newName: 'RenamedView' }] };
			data(await call('preflightTransaction', input));
			let applied = await call('applyTransaction', input);
			if (!applied.ok && applied.error.code === 'stale_write') {
				await client.readResource({ uri: 'openfairygui://docs/diagnostics/stale_write' });
				const refreshed = data(await call('getProjectOutline', { sessionId }));
				assert.equal(refreshed.packages.find((entry) => entry.id === pkg.id).resources.find((entry) => entry.id === resource.id).name, 'MainView');
				input.expectedRevision = data(await call('queryEntity', { sessionId, target })).revision;
				data(await call('preflightTransaction', input));
				applied = await call('applyTransaction', input);
			}
			const changed = data(applied);
			data(await call('validateSession', { sessionId }));
			data(await call('saveSession', { sessionId, expectedRevision: changed.revision }));
		}
		const validation = data(await call('validateSession', { sessionId }));
		data(await call('closeSession', { sessionId }));
		saveJson(config.final, { summary: 'Deterministic harness self-check; not a model observation.', facts: { packageCount: outline.packages.length, resourceCount: outline.packages.reduce((sum, pkg) => sum + pkg.resources.length, 0), validationStatus: validation.status } });
		return { ok: true, events: [], isolated: true };
	} finally { await client.close(); }
}

async function codex(config, configPath, options) {
	const schema = path.join(config.directory, 'answer-schema.json');
	const instructions = path.join(config.directory, 'instructions.txt');
	saveJson(schema, FINAL_SCHEMA);
	writeFileSync(instructions, 'You are an OpenFairyGUI consumer. Complete the user task using only the supplied MCP tools and installed documentation resources. Repository source, shell, internet, personal skills and other applications are not available. Explain any blocker honestly.\n');
	const args = codexArguments({ cwd: config.cwd, server: [fileURLToPath(import.meta.url), '--serve', configPath], schema, output: config.final, instructions, model: options.model, enabledTools: definitions.map((entry) => entry.name) });
	saveJson(path.join(config.directory, 'runner.json'), { executable: options.codex, args, modelRequested: options.model ?? null, version: execFileSync(options.codex, ['--version'], { encoding: 'utf8', timeout: 10_000 }).trim() });
	const child = spawn(options.codex, args, { cwd: config.cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
	let stdout = '';
	let stderr = '';
	let timedOut = false;
	child.stdout.on('data', (chunk) => { stdout += chunk; appendFileSync(path.join(config.directory, 'agent.jsonl'), chunk); });
	child.stderr.on('data', (chunk) => { stderr += chunk; appendFileSync(path.join(config.directory, 'agent.stderr.txt'), chunk); });
	child.stdin.on('error', () => {}); // Early runner failure is reported by its exit status.
	const timer = setTimeout(() => { timedOut = true; child.kill(); }, options.timeoutSeconds * 1000);
	let code;
	try {
		code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); child.stdin.end(config.prompt); });
	} finally { clearTimeout(timer); }
	const events = stdout.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
	// Fail closed if a CLI change exposes a native execution path, instead of counting a contaminated run.
	const isolated = isolatedCodexEvents(events);
	const clientWarnings = [...new Set(stderr.split(/\r?\n/).filter((line) => line.includes('Skipping MCP tool')).map((line) => line.slice(line.indexOf('Skipping MCP tool'))))];
	return { ok: code === 0 && !timedOut && !events.some((event) => ['turn.failed', 'error'].includes(event.type)), events, isolated, timedOut, exitCode: code, clientWarnings };
}

async function runCase(task, options) {
	const directory = path.join(options.output, task.id);
	const workspace = path.join(directory, 'workspace');
	const cwd = path.join(directory, 'agent');
	mkdirSync(workspace, { recursive: true }); mkdirSync(cwd);
	const projectPath = realpathSync(await createDemoProject(workspace));
	writeFileSync(path.join(workspace, 'do-not-change.txt'), 'Unrelated workspace file.\n');
	writeFileSync(path.join(path.dirname(projectPath), 'notes.txt'), 'Unrelated project file.\n');
	const before = await readProjectAsUam(new NodeIO(), projectPath);
	const expected = expectedProject(before, task.id);
	const beforeFiles = snapshot(workspace);
	const expectedDirectory = path.join(directory, 'expected');
	mkdirSync(expectedDirectory);
	await writeProjectFromUam(new NodeIO(), expected, path.join(expectedDirectory, 'Example.fairy'));
	const projectPrefix = `${path.basename(path.dirname(projectPath))}/`;
	const expectedFiles = task.id === 'inspect-validate' ? beforeFiles : {
		'do-not-change.txt': beforeFiles['do-not-change.txt'],
		[`${projectPrefix}notes.txt`]: beforeFiles[`${projectPrefix}notes.txt`],
		...Object.fromEntries(Object.entries(snapshot(expectedDirectory)).map(([name, content]) => [`${projectPrefix}${name}`, content])),
	};
	const config = {
		task, directory, workspace, cwd, projectPath,
		trace: path.join(directory, 'mcp.jsonl'), final: path.join(directory, 'final.json'), closed: path.join(directory, 'host-closed.json'),
		prompt: `${task.prompt}\nProject: ${projectPath}\nThe host exposes only this project and session-editing methods. Installed documentation is available through MCP resources (openfairygui://docs/index). Do not access repository source or unrelated files. Validate the resulting project. Return a concise summary; use null facts when they do not apply.`,
	};
	const configPath = path.join(directory, 'case.json');
	saveJson(configPath, config); saveJson(path.join(directory, 'before.json'), { project: before, files: beforeFiles });
	saveJson(path.join(directory, 'expected.json'), { project: expected, files: expectedFiles });
	writeFileSync(path.join(directory, 'prompt.txt'), config.prompt);
	console.log(`[agent-eval] ${options.runner}: ${task.id}`);
	const started = Date.now();
	let runner = { ok: false, isolated: false, events: [] };
	let error;
	try { runner = options.runner === 'reference' ? await reference(config, configPath) : await codex(config, configPath, options); }
	catch (failure) { error = failure.stack ?? failure.message; }
	const durationMs = Date.now() - started;
	// The MCP host releases only its own locks; it never saves unfinished model work on shutdown.
	for (let attempt = 0; attempt < 50 && !existsSync(config.closed); attempt++) await delay(100);
	try {
		// Some clients terminate stdio hosts without EOF. Reopen through the real lock API to
		// recover only a dead host's lock; a still-live owner is an infrastructure failure.
		const cleanup = createNodeBackendRuntime({ allowedProjectRoots: [path.dirname(projectPath)] });
		const opened = data(await cleanup.openSession({ projectPath }));
		data(await cleanup.closeSession({ sessionId: opened.sessionId }));
	} catch (failure) { error ??= failure.stack ?? failure.message; }
	let actual = null; let validation = null; let actualFiles = {};
	try {
		actual = await readProjectAsUam(new NodeIO(), projectPath);
		validation = (await validateProjectNode(projectPath)).status;
		actualFiles = snapshot(workspace);
	} catch (failure) { error ??= failure.stack ?? failure.message; }
	let trace = []; let final = null;
	try { trace = lines(config.trace); final = existsSync(config.final) ? json(config.final) : null; }
	catch (failure) { error ??= failure.stack ?? failure.message; }
	const grade = gradeEvaluation({ taskId: task.id, expected, actual, expectedFiles, actualFiles, trace, final, runnerOk: runner.ok && !error && !trace.some((entry) => entry.type === 'host-error'), isolated: runner.isolated, validation });
	const result = { taskId: task.id, runner: options.runner, ...grade, observations: observations(trace, durationMs, runner.events), error: error ?? null, exitCode: runner.exitCode ?? null, timedOut: runner.timedOut ?? false, clientWarnings: runner.clientWarnings ?? [] };
	saveJson(path.join(directory, 'actual.json'), { project: actual, files: actualFiles, validation });
	saveJson(path.join(directory, 'result.json'), result);
	console.log(`[agent-eval] ${result.passed ? 'PASS' : 'FAIL'} ${task.id}: ${JSON.stringify(result.checks)}`);
	return result;
}

async function main(options) {
	assert(!process.env.NODE_PATH && !process.env.NODE_OPTIONS, 'Ambient Node loaders must be absent.');
	for (const source of json(path.join(root, 'expected.json'))) {
		const directory = path.join(root, 'node_modules', source.name);
		contained(root, directory); exportFiles(directory, json(path.join(directory, 'package.json')));
		assert.equal(json(path.join(directory, 'package.json')).version, source.version);
	}
	for (const name of ['@openfairygui/test-utils', 'tsx', 'typescript']) assert.throws(() => require.resolve(name));
	mkdirSync(options.output);
	const results = [];
	for (const task of options.tasks) results.push(await runCase(task, options));
	const passed = results.filter((result) => result.passed).length;
	const report = { schemaVersion: 1, runner: options.runner, modelRequested: options.model ?? null, installed: getInstalledDocumentationVersion(), provenance: options.provenance, cases: results, passed, total: results.length, modelSuccessRate: options.runner === 'codex' ? passed / results.length : null };
	saveJson(path.join(options.output, 'report.json'), report);
	console.log(`[agent-eval] ${passed}/${results.length}; report: ${path.join(options.output, 'report.json')}`);
	if (passed !== results.length) process.exitCode = 1;
}

try {
	if (process.argv[2] === '--serve') await serve(json(process.argv[3]));
	else if (process.argv[2] === '--reference') await main({ runner: 'reference', output: path.join(root, 'reference-evaluations'), tasks: json(path.join(root, 'evaluation-tasks.json')) });
	else await main(json(process.argv[2]));
} catch (error) { console.error(error.stack ?? error.message); process.exitCode = 1; }
