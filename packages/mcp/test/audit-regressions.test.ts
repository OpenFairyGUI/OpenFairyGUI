import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import test from 'ava';
import { createNodeBackendRuntime, disposeBackendRuntime } from '@openfairygui/backend/node';
import { Document } from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';
import { createOpenFairyGuiMcpServer, OPENFAIRYGUI_BACKEND_TOOL_NAMES } from '../src/index.js';

async function createMinimalProject(): Promise<{ rootDir: string; cleanup: () => Promise<void> }> {
	const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-mcp-audit-'));
	const doc = new Document();
	doc.createPackage('Main')
		.setId('pkgdemo1')
		.addResource(doc.createComponent('MainView').setId('cmpdemo1').setPath('/').setSize(64, 64));
	await new NodeIO().writeProject(doc, path.join(rootDir, 'Demo.fairy'));
	return {
		rootDir,
		cleanup: () => fs.rm(rootDir, { recursive: true, force: true }),
	};
}

test('MCP server.close() releases active session locks, sanitizes host_publish errors, and handles bad URI percent-encoding', async (t) => {
	const fixture = await createMinimalProject();
	t.teardown(() => fixture.cleanup());

	const server = createOpenFairyGuiMcpServer({
		allowedProjectRoots: [fixture.rootDir],
		publish: async () => {
			throw new Error('SECRET_INTERNAL_STACK_DETAIL');
		},
	});
	const client = new Client({ name: 'audit-regression', version: 'test' });
	const [ct, st] = InMemoryTransport.createLinkedPair();
	await Promise.all([client.connect(ct), server.connect(st)]);

	try {
		// Verify openfairygui_host_publish exposes contractDigest metadata and strict schema.
		const listed = await client.listTools();
		const publishTool = listed.tools.find((tool) => tool.name === 'openfairygui_host_publish');
		t.truthy(publishTool?._meta?.['openfairygui/contractDigest']);

		// Unknown keys must fail strict input validation before invoking the host callback.
		const badArgs = await client.callTool({
			name: 'openfairygui_host_publish',
			arguments: { projectPath: fixture.rootDir, extraField: true },
		});
		t.true(badArgs.isError);

		// Unexpected host publish error must be sanitized (no internal secret leaked).
		const hostError = await client.callTool({
			name: 'openfairygui_host_publish',
			arguments: { projectPath: fixture.rootDir },
		});
		t.true(hostError.isError);
		t.false(JSON.stringify(hostError).includes('SECRET_INTERNAL_STACK_DETAIL'));

		// Malformed percent-encoding in resource URI template returns InvalidParams (-32602), not raw URIError.
		const uriError = (await t.throwsAsync(client.readResource({ uri: 'openfairygui://docs/cli/%ZZ' }))) as Error & {
			code?: number;
		};
		t.is(uriError.code, ErrorCode.InvalidParams);

		// Open a locked session and do NOT close it via tool; closing server must release the lock.
		const opened = await client.callTool({
			name: 'openfairygui_backend_open_session',
			arguments: { projectPath: fixture.rootDir },
		});
		t.false(opened.isError);
	} finally {
		await client.close();
		await server.close();
	}

	const probeRuntime = createNodeBackendRuntime({ allowedProjectRoots: [fixture.rootDir] });
	try {
		const reopened = await probeRuntime.openSession({ projectPath: fixture.rootDir });
		t.true(reopened.ok, 'Closing MCP server must release owned session locks');
	} finally {
		await disposeBackendRuntime(probeRuntime);
	}
});

test.serial('built packages/mcp/dist/stdio.mjs executes directly over stdio', async (t) => {
	const entry = path.resolve('packages/mcp/dist/stdio.mjs');
	const transport = new StdioClientTransport({
		command: process.execPath,
		args: [entry],
		cwd: process.cwd(),
		stderr: 'pipe',
	});
	const client = new Client({ name: 'direct-stdio-mjs-test', version: 'test' });
	await client.connect(transport);
	try {
		const tools = await client.listTools();
		t.deepEqual(
			tools.tools.map((tool) => tool.name),
			[...OPENFAIRYGUI_BACKEND_TOOL_NAMES, 'openfairygui_docs_read'],
		);
	} finally {
		await client.close();
	}
});
