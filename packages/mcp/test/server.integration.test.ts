import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import test from 'ava';
import { BackendRuntime } from '@openfairygui/backend';
import {
	createOpenFairyGuiMcpServer,
	OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS,
	OPENFAIRYGUI_BACKEND_TOOL_NAMES,
} from '../src/index.js';

test('createOpenFairyGuiMcpServer exposes backend P2 tools over MCP transport', async (t) => {
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const server = createOpenFairyGuiMcpServer({
		runtime: new BackendRuntime(),
		version: 'test',
	});
	const client = new Client({ name: 'openfairygui-mcp-test', version: 'test' });

	await Promise.all([
		server.connect(serverTransport),
		client.connect(clientTransport),
	]);

	try {
		const tools = await client.listTools();
		t.deepEqual(
			tools.tools.map((tool) => tool.name),
			[...OPENFAIRYGUI_BACKEND_TOOL_NAMES],
		);
		for (const definition of OPENFAIRYGUI_BACKEND_TOOL_DEFINITIONS) {
			const tool = tools.tools.find((candidate) => candidate.name === definition.name);
			t.truthy(tool);
			t.is(tool?._meta?.['openfairygui/backendMethod'], definition.backendMethod);
			t.is(tool?._meta?.['openfairygui/adapter'], 'thin-backend-p2');
			t.truthy(tool?.outputSchema);
		}

		const capabilities = await client.callTool({
			name: 'openfairygui_backend_get_capabilities',
			arguments: {},
		}, CallToolResultSchema);
		t.false(capabilities.isError ?? false);
		t.truthy((capabilities.structuredContent as { backendResult?: unknown } | undefined)?.backendResult);
		const text = capabilities.content[0]?.type === 'text' ? capabilities.content[0].text : '';
		t.true(text.includes('"runtimeOwner": "@openfairygui/backend"'));
	} finally {
		await client.close();
		await server.close();
	}
});
