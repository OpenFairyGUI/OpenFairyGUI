import type { Command } from 'commander';
import { findInstalledDocumentation, getInstalledDocumentationIndex, getInstalledDocumentationVersion, readInstalledDocumentation } from '@openfairygui/backend/docs';
import { readPackageVersion } from '../utils/package-version.js';

export function registerDocsCommand(program: Command): void {
	const docs = program.command('docs').description('Read version-bound installed documentation offline (no download or repository required)');
	function print(options: { json?: boolean }, read: () => ReturnType<typeof getInstalledDocumentationIndex> | ReturnType<typeof readInstalledDocumentation>): void {
		const version = getInstalledDocumentationVersion();
		try {
			if (version.packageVersion !== readPackageVersion()) throw new Error('CLI and installed documentation versions differ; ask the host to reconcile the installation.');
			const result = read();
			if (options.json) console.log(JSON.stringify(result, null, 2));
			else {
				console.log(`${version.packageName}@${version.packageVersion} | contract ${version.BACKEND_CONTRACT_VERSION} | schema ${version.BACKEND_CAPABILITY_SCHEMA_VERSION}`);
				console.log('text' in result ? result.text : result.documents.map((entry) => `${entry.id}\t${entry.title}`).join('\n'));
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (options.json) console.log(JSON.stringify({ ...version, error: { code: 'documentation_unavailable', message } }));
			else console.error(message);
			process.exitCode = 1;
		}
	}
	docs.command('ls').description('List installed document IDs, URIs and version').option('--json', 'Print JSON')
		.action((options) => print(options, getInstalledDocumentationIndex));
	docs.command('find <query>').description('Search only the installed corpus').option('--json', 'Print JSON')
		.action((query: string, options) => print(options, () => findInstalledDocumentation(query)));
	docs.command('cat <id>').description('Read an exact ID from docs ls, not a filesystem path').option('--json', 'Print JSON')
		.action((id: string, options) => print(options, () => readInstalledDocumentation(id)));
	docs.command('diagnostic <code>').description('Read a diagnostic recovery guide; never execute repairs').option('--json', 'Print JSON')
		.action((code: string, options) => print(options, () => readInstalledDocumentation(`diagnostics/${code}`)));
	docs.command('schema <kind>').description('Read one self-contained Core operation wire schema').option('--json', 'Print JSON')
		.action((kind: string, options) => print(options, () => readInstalledDocumentation(`operations/${kind}`)));
}
