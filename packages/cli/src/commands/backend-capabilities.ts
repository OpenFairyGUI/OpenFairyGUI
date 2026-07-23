import { createNodeBackendRuntime } from '@openfairygui/backend/node';
import type { Command } from 'commander';
import path from 'node:path';

export function registerBackendCapabilitiesCommand(program: Command): void {
	program
		.command('backend-capabilities')
		.description('Open a backend session, print runtime capabilities, then close it')
		.argument('<project-dir>', 'Project root directory')
		.action(async (projectDir: string) => {
			const runtime = createNodeBackendRuntime();
			const opened = await runtime.openSession({ projectPath: path.resolve(projectDir) });
			if (!opened.ok) {
				const failure = opened as Extract<typeof opened, { ok: false }>;
				throw new Error(`backend-capabilities: ${failure.error.message}`);
			}

			const capabilities = runtime.getCapabilities();
			if (!capabilities.ok) {
				await runtime.closeSession({ sessionId: opened.data.sessionId });
				throw new Error('backend-capabilities: failed to read capabilities');
			}

			console.log(`Session: ${opened.data.sessionId}`);
			console.log(`Project: ${opened.data.canonicalProjectPath}`);
			console.log(`Revision: ${opened.data.revision}`);
			console.log(`Runtime owner: ${capabilities.data.runtimeOwner}`);
			console.log(`Transaction owner: ${capabilities.data.transactionKernelOwner}`);
			console.log(`App seam owner: ${capabilities.data.appSeamOwner}`);

			const closed = await runtime.closeSession({ sessionId: opened.data.sessionId });
			if (!closed.ok) {
				const failure = closed as Extract<typeof closed, { ok: false }>;
				throw new Error(`backend-capabilities: ${failure.error.message}`);
			}
		});
}
