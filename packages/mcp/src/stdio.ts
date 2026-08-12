import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createOpenFairyGuiMcpServer } from './server.js';

export async function connectOpenFairyGuiMcpStdio(): Promise<void> {
	const configuredRoots = process.env.OPENFAIRYGUI_ALLOWED_PROJECT_ROOTS
		?.split(path.delimiter)
		.map((value) => value.trim())
		.filter(Boolean);
	const server = createOpenFairyGuiMcpServer({ allowedProjectRoots: configuredRoots });
	await server.connect(new StdioServerTransport());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	connectOpenFairyGuiMcpStdio().catch((error: unknown) => {
		console.error(error instanceof Error ? error.stack ?? error.message : String(error));
		process.exitCode = 1;
	});
}
