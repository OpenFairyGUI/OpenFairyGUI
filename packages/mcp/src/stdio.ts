import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { createOpenFairyGuiMcpServer } from './server.js';

export async function connectOpenFairyGuiMcpStdio(): Promise<void> {
	const server = createOpenFairyGuiMcpServer();
	await server.connect(new StdioServerTransport());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	connectOpenFairyGuiMcpStdio().catch((error: unknown) => {
		console.error(error instanceof Error ? error.stack ?? error.message : String(error));
		process.exitCode = 1;
	});
}
