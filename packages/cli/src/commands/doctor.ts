import type { Command } from 'commander';
import { createNodeBackendRuntime } from '@openfairygui/backend/node';
import { getInstalledDocumentationVersion } from '@openfairygui/backend/docs';
import { validateProjectNode } from '@openfairygui/functions/node';
import { readPackageVersion } from '../utils/package-version.js';
import { resolveFairyPath } from '../utils/project-input.js';

export function registerDoctorCommand(program: Command): void {
	program.command('doctor').description('Diagnose installed versions/capabilities and optionally validate a project; never write or repair')
		.argument('[project-dir]', 'Optional project directory or .fairy file for Node validation')
		.option('--json', 'Print the complete machine-readable product diagnosis')
		.action(async (projectDir: string | undefined, options: { json?: boolean }) => {
			const version = getInstalledDocumentationVersion();
			const errors: Array<{ code: string; message: string }> = [];
			const cliVersion = readPackageVersion();
			if (cliVersion !== version.packageVersion) errors.push({ code: 'installed_version_mismatch', message: 'CLI and documentation versions differ; ask the host to reconcile the installation.' });
			const minimumMajor = /^>=(\d+)$/u.exec(version.nodeEngine)?.[1];
			if (!minimumMajor || Number(process.versions.node.split('.')[0]) < Number(minimumMajor)) errors.push({ code: 'unsupported_node_version', message: `Installed package requires Node ${version.nodeEngine}.` });
			const capabilities = createNodeBackendRuntime().getCapabilities();
			let project: Awaited<ReturnType<typeof validateProjectNode>> | null = null;
			let projectPath: string | null = null;
			if (projectDir) {
				try {
					projectPath = await resolveFairyPath(projectDir);
					project = await validateProjectNode(projectPath);
				} catch (error) { errors.push({ code: 'project_check_failed', message: error instanceof Error ? error.message : String(error) }); }
			}
			const status = errors.length || !capabilities.ok || project?.status === 'invalid' ? 'error' : project?.status === 'incomplete' ? 'incomplete' : 'ready';
			const report = {
				scope: 'installed-product', ...version, cliVersion, nodeVersion: process.versions.node,
				status, errors, capabilities, projectPath, project,
				limits: [
					'No installation, configuration changes, probe writes, session opening or repair.',
					'Without a project, source bytes and image decoding are not tested.',
					'Capabilities are declarations, not proof of filesystem permissions, publish or runtime rendering.',
				],
			};
			if (options.json) console.log(JSON.stringify(report, null, 2));
			else {
				console.log(`${status.toUpperCase()}: OpenFairyGUI ${cliVersion} (documentation ${version.packageVersion}, Node ${report.nodeVersion})`);
				for (const error of errors) console.log(`${error.code}: ${error.message}`);
				if (project) {
					console.log(`Project ${project.status}: ${projectPath}`);
					for (const diagnostic of project.diagnostics) console.log(`${diagnostic.severity} ${diagnostic.code} ${diagnostic.path}: ${diagnostic.message}`);
				}
				console.log(report.limits.join('\n'));
			}
			process.exitCode = status === 'ready' ? 0 : status === 'error' ? 1 : 2;
		});
}
