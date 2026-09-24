import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import test from 'ava';
import { OPENFAIRYGUI_BACKEND_TOOL_NAMES } from '../src/index.js';

const execFileAsync = promisify(execFile);

async function directoryExists(directory: string): Promise<boolean> {
	const { stat } = await import('node:fs/promises');
	try {
		return (await stat(directory)).isDirectory();
	} catch {
		return false;
	}
}

async function repoRoot(): Promise<string> {
	return (await directoryExists(path.resolve('packages/mcp'))) ? path.resolve('.') : path.resolve('../..');
}

test.serial('MCP P1 built stdio entrypoint supports initialize and tools/list', async (t) => {
	const root = await repoRoot();

	const entry = path.join(root, 'packages/mcp/bin/ofgui-mcp.cjs');
	const transport = new StdioClientTransport({
		command: process.execPath,
		args: [entry],
		cwd: root,
		stderr: 'pipe',
	});
	const client = new Client({ name: 'openfairygui-mcp-stdio-smoke', version: 'test' });

	await client.connect(transport);
	try {
		const manifest = JSON.parse(
			await (await import('node:fs/promises')).readFile(path.join(root, 'packages/mcp/package.json'), 'utf8'),
		) as { version: string };
		t.is(client.getServerVersion()?.version, manifest.version);
		const tools = await client.listTools();
		t.deepEqual(
			tools.tools.map((tool) => tool.name),
			[...OPENFAIRYGUI_BACKEND_TOOL_NAMES, 'openfairygui_docs_read'],
		);
	} finally {
		await client.close();
	}
});

test.serial('MCP stdio refuses to start when the allowed-roots variable lists no roots', async (t) => {
	const root = await repoRoot();
	const entry = path.join(root, 'packages/mcp/bin/ofgui-mcp.cjs');
	const error = (await t.throwsAsync(
		execFileAsync(process.execPath, [entry], {
			cwd: root,
			env: { ...process.env, OPENFAIRYGUI_ALLOWED_PROJECT_ROOTS: ` ${path.delimiter} ` },
			timeout: 30_000,
		}),
	)) as Error & { code?: number; stderr?: string };
	t.not(error.code, 0);
	t.regex(error.stderr ?? '', /OPENFAIRYGUI_ALLOWED_PROJECT_ROOTS is set but lists no project roots/);
});
