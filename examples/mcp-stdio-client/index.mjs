import assert from 'node:assert/strict';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createDemoProject } from '../create-demo-project.mjs';

// #region example
export async function inspectThroughMcp(projectPath) {
	const root = path.dirname(await realpath(projectPath));
	// The installed public stdio export avoids global executables, shell quoting and assumed HTTP ports.
	const transport = new StdioClientTransport({
		command: process.execPath,
		args: ['--input-type=module', '--eval', 'const m = await import(process.argv[1]); await m.connectOpenFairyGuiMcpStdio();', import.meta.resolve('@openfairygui/mcp/stdio')],
		env: { OPENFAIRYGUI_ALLOWED_PROJECT_ROOTS: root }, stderr: 'inherit',
	});
	const client = new Client({ name: 'openfairygui-example', version: '1.0.0' });
	let sessionId;
	async function call(method, input = {}) {
		const result = await client.callTool({ name: `openfairygui_backend_${method}`, arguments: input });
		const backend = result.structuredContent?.backendResult;
		if (result.isError || !backend?.ok) throw new Error(JSON.stringify(backend?.error ?? result));
		return backend.data;
	}
	try {
		await client.connect(transport);
		const { tools } = await client.listTools(); // The SDK also uses advertised output schemas to validate calls.
		const docs = await client.readResource({ uri: 'openfairygui://docs/index' });
		const documentation = JSON.parse(docs.contents[0].text);
		const capabilities = await call('get_capabilities');
		assert.equal(documentation.BACKEND_CAPABILITY_SCHEMA_VERSION, capabilities.capabilitySchemaVersion);
		assert.equal(documentation.BACKEND_CONTRACT_VERSION, capabilities.contractVersion);
		const opened = await call('open_session', { projectPath }); sessionId = opened.sessionId;
		const outline = await call('get_project_outline', { sessionId });
		const pkg = outline.packages.find((entry) => entry.name === 'Main');
		const component = pkg?.resources.find((entry) => entry.name === 'MainView' && entry.kind === 'component');
		const title = component?.component?.displayList.find((entry) => entry.name === 'title' && entry.kind === 'text');
		assert(title, 'This example expects Main/MainView/title; it will not guess another target.');
		const target = { kind: 'displayNode', selector: { packageId: pkg.id, componentResourceId: component.id, displayNodeId: title.id } };
		const current = await call('query_entity', { sessionId, target });
		const preview = await call('preflight_transaction', {
			sessionId, expectedRevision: current.revision,
			operations: [{ kind: 'setDisplayNodeProps', selector: target.selector, props: { text: `${current.entity.properties.text} (preview only)` } }],
		});
		assert.deepEqual(await call('query_entity', { sessionId, target }), current);
		const session = await call('get_session', { sessionId });
		assert.equal(session.revision, current.revision); assert.equal(session.dirty, false);
		// No apply/save: a successful preview is not authorization, a reserved revision or a persisted edit.
		return { projectPath, toolNames: tools.map((tool) => tool.name), documentation, current, preview, session };
	} finally {
		try { if (sessionId) await call('close_session', { sessionId }); }
		finally { await client.close(); }
	}
}
// #endregion example

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	try { console.log(JSON.stringify(await inspectThroughMcp(process.argv[2] ?? await createDemoProject()), null, 2)); }
	catch (error) { console.error(error); process.exitCode = 1; }
}
