import type { Command } from 'commander';
import { findInstalledDocumentation, getInstalledDocumentationIndex, getInstalledDocumentationVersion, readInstalledDocumentation } from '@openfairygui/backend/docs';
import { readPackageVersion } from '../utils/package-version.js';
import { printJson, printJsonError } from '../utils/json-output.js';
import type { CliCommand, CliCommandResults } from '../contracts.js';

export function registerDocsCommand(program: Command): void {
	const docs = program.command('docs').description('Read version-bound installed documentation offline (no download or repository required)');
	function print<C extends Extract<CliCommand, `docs ${string}`>>(command: C, options: { json?: boolean }, read: () => CliCommandResults[C]): void {
		const version = getInstalledDocumentationVersion();
		try {
			if (version.packageVersion !== readPackageVersion()) throw new Error('CLI and installed documentation versions differ; ask the host to reconcile the installation.');
			const result = read();
			if (options.json) printJson(command, result);
			else {
				console.log(`${version.packageName}@${version.packageVersion} | contract ${version.BACKEND_CONTRACT_VERSION} | schema ${version.BACKEND_CAPABILITY_SCHEMA_VERSION}`);
				console.log('text' in result ? result.text : result.documents.map((entry) => `${entry.id}\t${entry.title}`).join('\n'));
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (options.json) printJsonError(command, { code: 'documentation_unavailable', message });
			else console.error(message);
			process.exitCode = 1;
		}
	}
	docs.command('ls').description('List installed document IDs, URIs and version').option('--json', 'Print JSON')
		.action((options) => print('docs ls', options, getInstalledDocumentationIndex));
	docs.command('find <query>').description('Search only the installed corpus').option('--json', 'Print JSON')
		.action((query: string, options) => print('docs find', options, () => findInstalledDocumentation(query)));
	docs.command('cat <id>').description('Read an exact ID from docs ls, not a filesystem path').option('--json', 'Print JSON')
		.action((id: string, options) => print('docs cat', options, () => readInstalledDocumentation(id)));
	docs.command('diagnostic <code>').description('Read a diagnostic recovery guide; never execute repairs').option('--json', 'Print JSON')
		.action((code: string, options) => print('docs diagnostic', options, () => readInstalledDocumentation(`diagnostics/${code}`)));
	docs.command('schema <kind>').description('Read a self-contained operation schema or cli/<command> output schema').option('--json', 'Print JSON')
		.action((kind: string, options) => print('docs schema', options, () => readInstalledDocumentation(kind.startsWith('cli/') ? kind : `operations/${kind}`)));
}
