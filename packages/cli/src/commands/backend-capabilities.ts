import { createNodeBackendRuntime } from '@openfairygui/backend/node';
import type { Command } from 'commander';
import path from 'node:path';
import { printJson } from '../utils/json-output.js';

export function registerBackendCapabilitiesCommand(program: Command): void {
	program
		.command('backend-capabilities')
		.description('Open a backend session, print runtime capabilities, then close it')
		.argument('<project-dir>', 'Project root directory')
		.option('--json', 'Print the machine-readable runtime capabilities after closing the session')
		.action(async (projectDir: string, options: { json?: boolean }) => {
			const runtime = createNodeBackendRuntime();
			const opened = await runtime.openSession({ projectPath: path.resolve(projectDir) });
			if (!opened.ok) {
				const failure = opened as Extract<typeof opened, { ok: false }>;
				throw new Error(`backend-capabilities: ${failure.error.message}`);
			}

			let capabilities: ReturnType<typeof runtime.getCapabilities>;
			let closed: Awaited<ReturnType<typeof runtime.closeSession>>;
			try {
				capabilities = runtime.getCapabilities();
				if (!capabilities.ok) throw new Error('backend-capabilities: failed to read capabilities');
				if (!options.json) {
					console.log(`Session: ${opened.data.sessionId}`);
					console.log(`Project: ${opened.data.canonicalProjectPath}`);
					console.log(`Revision: ${opened.data.revision}`);
					console.log(`Runtime owner: ${capabilities.data.runtimeOwner}`);
					console.log(`Transaction owner: ${capabilities.data.transactionKernelOwner}`);
					console.log(`App seam owner: ${capabilities.data.appSeamOwner}`);
				}
			} finally {
				closed = await runtime.closeSession({ sessionId: opened.data.sessionId });
			}
			if (!closed.ok) throw new Error(`backend-capabilities: ${closed.error.message}`);
			if (options.json) printJson('backend-capabilities', capabilities.data);
		});
}
