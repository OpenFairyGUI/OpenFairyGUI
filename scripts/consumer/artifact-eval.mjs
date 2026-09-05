import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { readProjectAsUam, writeProjectFromUam } from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';
import { getInstalledDocumentationIndex, getInstalledDocumentationVersion, readInstalledDocumentation } from '@openfairygui/backend/docs';
import { validateProjectNode } from '@openfairygui/functions/node';
import { createPublishProject, IMAGE_BYTES, mergePublishedPackages, publishAndRestore, supportedSemantics } from './examples/publish-restore/index.mjs';
import { assertCliEnvelope, bin, json, snapshot } from './runtime.mjs';
import { ARTIFACT_TOOLS, assertArtifactTool, assertWithin, gradeArtifactEvaluation, observations } from './agent-eval-checks.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const mcpRequire = createRequire(require.resolve('@openfairygui/mcp'));
const sdk = async (name) => import(pathToFileURL(mcpRequire.resolve(`@modelcontextprotocol/sdk/${name}.js`)).href);
// Resolve the installed workflow's actual optional decoder, never a workspace/test dependency.
const sharp = createRequire(require.resolve('@openfairygui/functions/node'))('sharp');
const saveJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const lines = (file) => existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse) : [];
const facts = (semantics) => ({ packageCount: semantics.length, resourceCount: semantics.reduce((sum, pkg) => sum + pkg.resources.length, 0), validationStatus: 'valid' });

export function artifactCommand(args, record = () => {}) {
	const child = spawnSync(...bin('ofgui', '@openfairygui/cli', args), { cwd: root, encoding: 'utf8', timeout: 30_000, windowsHide: true });
	record({ type: 'artifact-command', args, exitCode: child.status, stdout: child.stdout, stderr: child.stderr });
	if (child.error) throw child.error;
	const report = JSON.parse(child.stdout); // Mixed logging or a missing JSON error is a harness failure.
	assertCliEnvelope(report, child.status);
	assert.equal(report.schemaVersion, 1);
	assert.equal(report.command, args[0]);
	assert.equal(child.status, report.success ? 0 : report.error.code === 'invalid_arguments' ? 2 : 1);
	return report;
}

function publishedCommand(config, record) {
	return artifactCommand(['publish', config.projectPath, '-o', config.release, '--project-type', 'layabox', '--json'], record);
}
function restoredCommand(config, record) {
	return artifactCommand(['restore', config.release, '-o', config.restored, '--project-type', 'layabox', '--json'], record);
}

async function pixelsMatch(image, color) {
	const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	const rgba = color === 'red' ? [255, 0, 0, 255] : [0, 0, 255, 255];
	return info.width === 2 && info.height === 2 && info.channels === 4 && data.equals(Buffer.from([...rgba, ...rgba, ...rgba, ...rgba]));
}

async function inspectPublished(config) {
	const packages = []; const seen = new Set(); let pixels = true;
	for (const file of readdirSync(config.release).filter((name) => name.endsWith('.fui')).sort()) {
		const document = await new NodeIO().readBinary(path.join(config.release, file));
		packages.push(...supportedSemantics(document));
		for (const pkg of document.getRoot().listPackages()) for (const atlas of pkg.listAtlases()) {
			// Laya resolves a package item's file against <binary path without extension> + '_'.
			const atlasPath = path.join(config.release, `${file.slice(0, -4)}_${atlas.getFile()}`);
			assertWithin(config.release, realpathSync(atlasPath));
			const metadata = await sharp(atlasPath).metadata();
			assert.equal(metadata.width, atlas.getWidth()); assert.equal(metadata.height, atlas.getHeight());
			for (const sprite of atlas.listSprites()) {
				assert(Object.hasOwn(IMAGE_BYTES, sprite.getItemId()), 'Unexpected fixture sprite');
				assert(!seen.has(sprite.getItemId()), 'Duplicate fixture sprite'); seen.add(sprite.getItemId());
				let image = sharp(atlasPath).extract({ left: sprite.getRectX(), top: sprite.getRectY(), width: sprite.getRectWidth(), height: sprite.getRectHeight() });
				if (sprite.getRotated()) image = image.rotate(90);
				pixels = await pixelsMatch(image, sprite.getItemId()) && pixels;
			}
		}
	}
	return { semantics: mergePublishedPackages(packages), pixelsMatch: pixels && seen.size === 2 };
}

async function inspectRestored(config) {
	const restored = json(config.restoreReport);
	assert(restored.success, 'No successful restoration');
	assertWithin(config.restored, realpathSync(restored.result.projectPath));
	const document = await new NodeIO().readProject(restored.result.projectPath);
	const project = await readProjectAsUam(new NodeIO(), restored.result.projectPath, { hydrateResourceBytes: true });
	const images = project.packages.flatMap((pkg) => pkg.resources).filter((resource) => resource.kind === 'image');
	let pixels = images.length === 2;
	for (const image of images) pixels = Object.hasOwn(IMAGE_BYTES, image.id) && await pixelsMatch(sharp(image.sourceBytes), image.id) && pixels;
	return { semantics: supportedSemantics(document), pixelsMatch: pixels, validation: await validateProjectNode(restored.result.projectPath) };
}

async function exactOutputFiles(config) {
	const published = json(config.publishReport);
	assert(published.success);
	const manifest = {};
	for (const file of published.result.files) {
		assertWithin(config.release, realpathSync(file.path));
		assert.equal(statSync(file.path).size, file.size);
		manifest[path.relative(config.release, file.path).replaceAll('\\', '/')] = readFileSync(file.path).toString('base64');
	}
	assert.deepEqual(snapshot(config.release), manifest, 'Release files must exactly match the successful manifest');
	const projectPath = json(config.restoreReport).result.projectPath;
	const reconstructed = path.join(config.directory, 'reread-file-set');
	mkdirSync(reconstructed);
	await writeProjectFromUam(new NodeIO(), await readProjectAsUam(new NodeIO(), projectPath, { hydrateResourceBytes: true }), path.join(reconstructed, path.basename(projectPath)));
	assert.deepEqual(Object.keys(snapshot(config.restored)).sort(), Object.keys(snapshot(reconstructed)).sort(), 'No extra files outside the reread project');
	return true;
}

// Fixed no-argument operations: model input never becomes argv, a filesystem path, a plugin or source code.
export async function serveArtifact(config) {
	const record = (entry) => appendFileSync(config.trace, `${JSON.stringify({ at: Date.now(), ...entry })}\n`);
	const { Server } = await sdk('server/index');
	const { StdioServerTransport } = await sdk('server/stdio');
	const { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ReadResourceRequestSchema } = await sdk('types');
	const server = new Server({ name: 'openfairygui-artifact-evaluation-host', version: '1' }, { capabilities: { tools: {}, resources: {} } });
	server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: ARTIFACT_TOOLS.filter((tool) => config.task.id !== 'restore-trusted' || tool.name !== 'ofgui_artifact_publish') }));
	server.setRequestHandler(ListResourcesRequestSchema, () => ({ resources: getInstalledDocumentationIndex().documents.filter((doc) => ['workflow', 'restore-limits'].includes(doc.id)).map((doc) => ({ ...doc, name: doc.id })) }));
	server.setRequestHandler(ListResourceTemplatesRequestSchema, () => ({ resourceTemplates: [] }));
	server.setRequestHandler(ReadResourceRequestSchema, ({ params }) => {
		const entry = getInstalledDocumentationIndex().documents.find((doc) => doc.uri === params.uri && ['workflow', 'restore-limits'].includes(doc.id));
		if (!entry) { record({ type: 'scope-violation', uri: params.uri }); throw new Error('Only installed artifact documentation is available'); }
		const doc = readInstalledDocumentation(entry.id);
		return { contents: [{ uri: doc.uri, mimeType: doc.mimeType, text: doc.text }] };
	});
	let pending = Promise.resolve();
	server.setRequestHandler(CallToolRequestSchema, ({ params }) => {
		const operation = pending.then(async () => {
			try { assertArtifactTool(config.task.id, params.name, params.arguments ?? {}); }
			catch (error) { record({ type: 'scope-violation', params }); throw error; }
			let report;
			if (params.name === 'ofgui_artifact_publish') { report = publishedCommand(config, record); saveJson(config.publishReport, report); }
			else if (params.name === 'ofgui_artifact_restore') { report = restoredCommand(config, record); saveJson(config.restoreReport, report); }
			else if (params.name === 'ofgui_artifact_context') report = { success: true, result: { projectPath: config.task.id === 'publish-consume' ? config.projectPath : null, release: config.release, restored: config.restored, installed: getInstalledDocumentationVersion(), documentation: ['openfairygui://docs/workflow', 'openfairygui://docs/restore-limits'] } };
			else report = { success: true, result: params.arguments.target === 'published' ? await inspectPublished(config) : await inspectRestored(config) };
			return { isError: !report.success, content: [{ type: 'text', text: JSON.stringify(report) }], structuredContent: { artifactResult: report } };
		});
		pending = operation.catch(() => {});
		return operation.catch((error) => ({ isError: true, content: [{ type: 'text', text: error.message }] }));
	});
	const wire = new StdioServerTransport();
	const transport = {
		async start() {
			wire.onmessage = (message) => { if (message.id !== undefined) record({ type: 'request', message }); transport.onmessage?.(message); };
			wire.onerror = (error) => transport.onerror?.(error); wire.onclose = () => transport.onclose?.();
			await wire.start();
		},
		async send(message) { if (message.id !== undefined) record({ type: 'response', message }); await wire.send(message); },
		close: () => wire.close(),
	};
	process.stdin.once('end', () => { void pending.then(async () => { await server.close(); saveJson(config.closed, { closed: true }); }); });
	await server.connect(transport);
	record({ type: 'host-ready', installed: getInstalledDocumentationVersion(), boundary: 'fixed-artifact-cli' });
}

export async function referenceArtifact(client, config) {
	assert.deepEqual((await client.listResourceTemplates()).resourceTemplates, []);
	await client.readResource({ uri: 'openfairygui://docs/workflow' });
	await client.readResource({ uri: 'openfairygui://docs/restore-limits' });
	const call = async (action, args = {}) => {
		const report = (await client.callTool({ name: `ofgui_artifact_${action}`, arguments: args })).structuredContent.artifactResult;
		assert(report.success, JSON.stringify(report)); return report.result;
	};
	if (config.task.id === 'publish-consume') await call('publish');
	await call('inspect', { target: 'published' });
	await call('restore');
	const result = await call('inspect', { target: 'restored' });
	saveJson(config.final, { outcome: 'completed', blocker: null, summary: 'Reference self-check only. Supported runtime semantics recovered, not original XML, project identity or editor-local state.', facts: facts(result.semantics) });
	return { ok: true, isolated: true, events: [] };
}

export async function runArtifactCase(task, options, run) {
	const directory = path.join(options.output, task.id);
	const workspace = path.join(directory, 'workspace'); const cwd = path.join(directory, 'agent');
	mkdirSync(workspace, { recursive: true }); mkdirSync(cwd);
	const projectPath = realpathSync(await createPublishProject(workspace));
	const config = { task, directory, workspace, cwd, projectPath, release: path.join(workspace, 'release'), restored: path.join(workspace, 'restored'),
		publishReport: path.join(directory, 'publish.json'), restoreReport: path.join(directory, 'restore.json'),
		trace: path.join(directory, 'mcp.jsonl'), final: path.join(directory, 'final.json'), closed: path.join(directory, 'host-closed.json'),
		prompt: `${task.prompt}\nThe separate artifact host accepts no paths or command arguments. Use its context and installed documentation resources to discover authorized destinations. Inspect both published and restored outputs through the host. For completed work use outcome completed, null blocker and exact restored validation status in facts. This does not grant terminal or editing access.`,
	};
	const expected = supportedSemantics(await new NodeIO().readProject(projectPath));
	writeFileSync(path.join(workspace, 'do-not-change.txt'), 'Unrelated workspace file.\n');
	writeFileSync(path.join(path.dirname(projectPath), 'notes.txt'), 'Unpublished editor notes: must not be invented by restore.\n');
	if (task.id === 'restore-trusted') { const report = publishedCommand(config); assert(report.success); saveJson(config.publishReport, report); }
	const beforeFiles = snapshot(workspace);
	const configPath = path.join(directory, 'case.json');
	saveJson(configPath, config); saveJson(path.join(directory, 'before.json'), { files: beforeFiles });
	saveJson(path.join(directory, 'expected.json'), { semantics: expected, scope: 'Supported component geometry/text/IDs, cross-package references and decoded RGBA images; not source XML or editor-local state.' });
	writeFileSync(path.join(directory, 'prompt.txt'), config.prompt);
	console.log(`[agent-eval] ${options.runner}: ${task.id}`);
	const started = Date.now(); let runner = { ok: false, isolated: false, events: [] }; let error;
	try { runner = await run(config, configPath); } catch (failure) { error = failure.stack ?? failure.message; }
	const durationMs = Date.now() - started;
	for (let attempt = 0; attempt < 20 && !existsSync(config.closed); attempt++) await delay(100);
	const actual = {}; let actualFiles = {}; let trace = []; let final = null;
	try {
		actual.published = await inspectPublished(config); actual.restored = await inspectRestored(config);
		actual.exactOutputFiles = await exactOutputFiles(config);
	} catch (failure) { error ??= failure.stack ?? failure.message; }
	try { actualFiles = snapshot(workspace); trace = lines(config.trace); final = existsSync(config.final) ? json(config.final) : null; }
	catch (failure) { error ??= failure.stack ?? failure.message; }
	const grade = gradeArtifactEvaluation({ expected, actual, beforeFiles, actualFiles, trace, final, runnerOk: runner.ok && !error, isolated: runner.isolated, publishTask: task.id === 'publish-consume' });
	const result = { taskId: task.id, runner: options.runner, ...grade, observations: observations(trace, durationMs, runner.events), error: error ?? null, exitCode: runner.exitCode ?? null, timedOut: runner.timedOut ?? false, clientWarnings: runner.clientWarnings ?? [] };
	saveJson(path.join(directory, 'actual.json'), { ...actual, files: actualFiles }); saveJson(path.join(directory, 'result.json'), result);
	console.log(`[agent-eval] ${result.passed ? 'PASS' : 'FAIL'} ${task.id}: ${JSON.stringify(result.checks)}`);
	return result;
}

export async function artifactSmoke() {
	const projectPath = await createPublishProject(root);
	const directory = path.dirname(projectPath);
	const before = snapshot(directory);
	const example = await publishAndRestore(projectPath);
	assert.deepEqual(Object.fromEntries(Object.entries(snapshot(directory)).filter(([name]) => !name.startsWith('release/') && !name.startsWith('restored/'))), before);
	const config = { directory, projectPath, release: path.join(directory, 'release'), restored: path.join(directory, 'restored'), publishReport: path.join(root, 'smoke-publish.json'), restoreReport: path.join(root, 'smoke-restore.json') };
	saveJson(config.publishReport, { success: true, result: example.published }); saveJson(config.restoreReport, { success: true, result: example.restored });
	assert((await inspectPublished(config)).pixelsMatch); assert((await inspectRestored(config)).pixelsMatch);
	assert(await exactOutputFiles(config));
	const expected = supportedSemantics(await new NodeIO().readProject(projectPath));
	// Installed launcher, no source loader. The separate SDK example above uses public installed imports.
	config.release = path.join(directory, 'cli-release'); config.restored = path.join(directory, 'cli-restored');
	const published = publishedCommand(config); assert(published.success); saveJson(config.publishReport, published);
	const restored = restoredCommand(config); assert(restored.success); saveJson(config.restoreReport, restored);
	assert.deepEqual((await inspectPublished(config)).semantics, expected);
	assert.deepEqual((await inspectRestored(config)).semantics, expected);
	const previous = snapshot(config.restored);
	const corrupt = path.join(directory, 'corrupt-release'); cpSync(config.release, corrupt, { recursive: true });
	writeFileSync(path.join(corrupt, readdirSync(corrupt).find((name) => name.endsWith('.png'))), Buffer.from([0]));
	const failed = artifactCommand(['restore', corrupt, '-o', config.restored, '--force', '--json']);
	assert(!failed.success && failed.error.code === 'restore_failed');
	assert.deepEqual(snapshot(config.restored), previous, 'Failed forced restore must preserve the complete previous target');
	console.log('[consumer] Artifact PASS: SDK/CLI publish, binaries, atlas RGBA, cross-package references, limited restore, validation and failed-force rollback');
}
