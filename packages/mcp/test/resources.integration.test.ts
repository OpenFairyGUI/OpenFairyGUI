import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import test from 'ava';
import { BackendRuntime } from '@openfairygui/backend';
import {
	createOpenFairyGuiMcpServer,
	OPENFAIRYGUI_BACKEND_CAPABILITIES_RESOURCE_URI,
	OPENFAIRYGUI_BACKEND_RESOURCE_TEMPLATES,
} from '../src/index.js';
import { createTempMcpProject } from './helpers.js';

interface BackendEnvelope {
	ok: boolean;
	data?: unknown;
	error?: {
		code?: string;
	};
}

async function withClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const server = createOpenFairyGuiMcpServer({
		runtime: new BackendRuntime(),
		version: 'test',
	});
	const client = new Client({ name: 'openfairygui-mcp-resource-test', version: 'test' });

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

function parseJsonResource(result: Awaited<ReturnType<Client['readResource']>>): BackendEnvelope {
	const content = result.contents[0];
	if (!content || !('text' in content)) throw new Error('Missing text resource content');
	return JSON.parse(content.text) as BackendEnvelope;
}

test('MCP P1 resources expose only identity-addressable backend snapshots', async (t) => {
	await withClient(async (client) => {
		const resources = await client.listResources();
		t.deepEqual(
			resources.resources.map((resource) => resource.uri),
			[OPENFAIRYGUI_BACKEND_CAPABILITIES_RESOURCE_URI],
		);

		const templates = await client.listResourceTemplates();
		t.deepEqual(
			templates.resourceTemplates.map((template) => template.uriTemplate),
			[...OPENFAIRYGUI_BACKEND_RESOURCE_TEMPLATES],
		);

		const allResourceUris = [
			...resources.resources.map((resource) => resource.uri),
			...templates.resourceTemplates.map((template) => template.uriTemplate),
		].join('\n');
		t.false(allResourceUris.includes('events'));
		t.false(allResourceUris.includes('listJobs'));
	});
});

test('MCP P1 resources read unchanged backend envelopes as JSON content', async (t) => {
	const fixture = await createTempMcpProject();
	try {
		await withClient(async (client) => {
			const capabilitiesResource = await client.readResource({
				uri: OPENFAIRYGUI_BACKEND_CAPABILITIES_RESOURCE_URI,
			});
			t.is(capabilitiesResource.contents[0]?.mimeType, 'application/json');
			const capabilities = parseJsonResource(capabilitiesResource);
			t.true(capabilities.ok);

			const opened = await client.callTool({
				name: 'openfairygui_backend_open_session',
				arguments: { projectPath: fixture.rootDir },
			});
			const openedEnvelope = (opened.structuredContent as { backendResult?: BackendEnvelope }).backendResult;
			t.true(openedEnvelope?.ok);
			const sessionId = (openedEnvelope?.data as { sessionId: string }).sessionId;

			const session = parseJsonResource(await client.readResource({
				uri: `openfairygui://backend/session/${sessionId}`,
			}));
			t.true(session.ok);

			const cache = parseJsonResource(await client.readResource({
				uri: `openfairygui://backend/cache/${sessionId}`,
			}));
			t.true(cache.ok);

			const refreshed = await client.callTool({
				name: 'openfairygui_backend_refresh_cache',
				arguments: { sessionId, reason: 'manual' },
			});
			const refreshedEnvelope = (refreshed.structuredContent as { backendResult?: BackendEnvelope }).backendResult;
			const jobId = (refreshedEnvelope?.data as { jobId: string }).jobId;

			const job = parseJsonResource(await client.readResource({
				uri: `openfairygui://backend/job/${sessionId}/${jobId}`,
			}));
			t.true(job.ok);

			const missingSession = parseJsonResource(await client.readResource({
				uri: 'openfairygui://backend/session/missing-session',
			}));
			t.false(missingSession.ok);
			t.is(missingSession.error?.code, 'session_not_found');

			const missingJob = parseJsonResource(await client.readResource({
				uri: `openfairygui://backend/job/${sessionId}/missing-job`,
			}));
			t.false(missingJob.ok);
			t.is(missingJob.error?.code, 'job_not_found');
		});
	} finally {
		await fixture.cleanup();
	}
});
