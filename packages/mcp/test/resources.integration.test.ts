import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import test from 'ava';
import { BACKEND_DIAGNOSTICS_URI, getBackendDiagnosticCatalog, getBackendDiagnosticGuide } from '@openfairygui/backend';
import { getInstalledDocumentationIndex, readInstalledDocumentation, OPENFAIRYGUI_DOCS_INDEX_URI } from '@openfairygui/backend/docs';
import { createNodeBackendRuntime } from '@openfairygui/backend/node';
import {
	createOpenFairyGuiMcpServer,
	OPENFAIRYGUI_BACKEND_CAPABILITIES_RESOURCE_URI,
	OPENFAIRYGUI_BACKEND_RESOURCE_TEMPLATES,
	OPENFAIRYGUI_OPERATION_CATALOG_URI,
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
		runtime: createNodeBackendRuntime(),
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
			[OPENFAIRYGUI_DOCS_INDEX_URI, 'openfairygui://docs/workflow', 'openfairygui://docs/skill', 'openfairygui://docs/contracts', BACKEND_DIAGNOSTICS_URI, OPENFAIRYGUI_OPERATION_CATALOG_URI, OPENFAIRYGUI_BACKEND_CAPABILITIES_RESOURCE_URI],
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

test('MCP diagnostic URIs resolve the same typed catalog and reject unknown codes', async (t) => {
	await withClient(async (client) => {
		t.deepEqual(parseJsonResource(await client.readResource({ uri: BACKEND_DIAGNOSTICS_URI })), getBackendDiagnosticCatalog());
		for (const guide of getBackendDiagnosticCatalog()) {
			t.deepEqual(parseJsonResource(await client.readResource({ uri: guide.docsUri })), getBackendDiagnosticGuide(guide.code));
		}
		await t.throwsAsync(client.readResource({ uri: `${BACKEND_DIAGNOSTICS_URI}/unknown_code` }));
	});
});

test('every installed document is readable through MCP with the same offline content', async (t) => {
	await withClient(async (client) => {
		const index = getInstalledDocumentationIndex();
		t.deepEqual(parseJsonResource(await client.readResource({ uri: OPENFAIRYGUI_DOCS_INDEX_URI })), index);
		for (const entry of index.documents) {
			const response = await client.readResource({ uri: entry.uri });
			const content = response.contents[0]!;
			const expected = readInstalledDocumentation(entry.id);
			t.is(content.mimeType, expected.mimeType);
			t.is('text' in content ? content.text : '', expected.text, entry.id);
		}
		await t.throwsAsync(client.readResource({ uri: 'openfairygui://docs/methods/constructor' }));
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

			const outlineResource = await client.readResource({
				uri: `openfairygui://backend/session/${sessionId}/outline`,
			});
			const outline = parseJsonResource(outlineResource);
			t.true(outline.ok);
			t.is((outline.data as { projectId: string }).projectId, 'mcp-p0');
			t.false((outlineResource.contents[0] as { text?: string }).text?.includes('sourceBytes') ?? true);

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

			const missingOutline = parseJsonResource(await client.readResource({
				uri: 'openfairygui://backend/session/missing-session/outline',
			}));
			t.false(missingOutline.ok);
			t.is(missingOutline.error?.code, 'session_not_found');

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
