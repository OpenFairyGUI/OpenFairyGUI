import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import test from 'ava';
import { BackendRuntime } from '@openfairygui/backend';
import {
	createOpenFairyGuiMcpServer,
	OPENFAIRYGUI_BACKEND_PROMPT_NAMES,
	type OpenFairyGuiBackendPromptName,
} from '../src/index.js';

async function withClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const server = createOpenFairyGuiMcpServer({
		runtime: new BackendRuntime(),
		version: 'test',
	});
	const client = new Client({ name: 'openfairygui-mcp-prompt-test', version: 'test' });

	await Promise.all([
		server.connect(serverTransport),
		client.connect(clientTransport),
	]);

	try {
		return await run(client);
	} finally {
		await client.close();
		await server.close();
	}
}

function promptText(result: Awaited<ReturnType<Client['getPrompt']>>): string {
	const content = result.messages[0]?.content;
	if (!content || content.type !== 'text') throw new Error('Missing prompt text');
	return content.text;
}

test('MCP P1 prompts are discoverable and tied to existing backend tools', async (t) => {
	await withClient(async (client) => {
		const prompts = await client.listPrompts();
		t.deepEqual(
			prompts.prompts.map((prompt) => prompt.name),
			[...OPENFAIRYGUI_BACKEND_PROMPT_NAMES],
		);

		const expectations: Record<OpenFairyGuiBackendPromptName, string[]> = {
			openfairygui_inspect_capabilities: ['openfairygui_backend_get_capabilities', 'artifact publish/restore', 'subscriptions', 'persistent jobs'],
			openfairygui_open_and_inspect_session: ['openfairygui_backend_open_session', 'openfairygui_backend_get_session', 'openfairygui_backend_close_session', 'Backend path policy remains authoritative'],
			openfairygui_inspect_project_outline: ['openfairygui_backend_get_project_outline', 'expectedRevision', 'source bytes', 'full property payloads'],
			openfairygui_plan_revision_checked_transaction: ['openfairygui_backend_get_session', 'openfairygui_backend_apply_transaction', 'expectedRevision', 'stale revision'],
			openfairygui_save_session: ['openfairygui_backend_save_session', 'expectedRevision', 'Backend path policy remains authoritative'],
			openfairygui_poll_runtime_state: ['openfairygui_backend_get_events', 'openfairygui_backend_list_jobs', 'openfairygui_backend_get_job', 'openfairygui_backend_get_cache_snapshot', 'openfairygui_backend_refresh_cache'],
		};

		for (const name of OPENFAIRYGUI_BACKEND_PROMPT_NAMES) {
			const text = promptText(await client.getPrompt({ name }));
			for (const expected of expectations[name]) {
				t.true(text.includes(expected), `${name} should include ${expected}`);
			}
			t.false(text.includes('"kind"'));
			t.false(text.includes('"selector"'));
			t.false(text.includes('setDisplayNodeProps'));
		}
	});
});
