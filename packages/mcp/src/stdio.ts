import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createOpenFairyGuiMcpServer } from './server.js';

function parseAllowedProjectRoots(value: string | undefined): string[] | undefined {
	if (value === undefined) return undefined;
	const roots = value
		.split(path.delimiter)
		.map((entry) => entry.trim())
		.filter(Boolean);
	if (roots.length === 0) {
		throw new Error(
			'OPENFAIRYGUI_ALLOWED_PROJECT_ROOTS is set but lists no project roots. Set absolute roots separated by the platform path delimiter, or unset it to allow only the working directory.',
		);
	}
	return roots;
}

export async function connectOpenFairyGuiMcpStdio(): Promise<void> {
	const configuredRoots = parseAllowedProjectRoots(process.env.OPENFAIRYGUI_ALLOWED_PROJECT_ROOTS);
	const server = createOpenFairyGuiMcpServer({ allowedProjectRoots: configuredRoots });
	await server.connect(new StdioServerTransport());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	connectOpenFairyGuiMcpStdio().catch((error: unknown) => {
		console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
		process.exitCode = 1;
	});
}
