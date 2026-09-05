import { InvalidArgumentError, type Command } from 'commander';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createNodeBackendRuntime } from '@openfairygui/backend/node';
import { getInstalledDocumentationVersion } from '@openfairygui/backend/docs';
import { validateProjectNode } from '@openfairygui/functions/node';
import { readPackageVersion } from '../utils/package-version.js';
import { resolveFairyPath } from '../utils/project-input.js';
import type { DoctorReport } from '../contracts.js';
import { printJson } from '../utils/json-output.js';

async function inspectNativeImages(): Promise<DoctorReport['checks'][number]> {
	try {
		const sharp = (await import('sharp')).default;
		for (const format of ['png', 'jpeg'] as const) {
			const encoded = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#204060' } }).toFormat(format).toBuffer();
			const { data, info } = await sharp(encoded).raw().toBuffer({ resolveWithObject: true });
			if (info.width !== 1 || info.height !== 1 || info.channels !== 3 || data.length !== 3) throw new Error(`${format} pixel decoding returned unexpected dimensions.`);
		}
		return { id: 'native-images', status: 'ok', version: sharp.versions.sharp, message: 'In-memory PNG/JPEG encoding and pixel decoding passed.' };
	} catch (error) {
		return { id: 'native-images', status: 'incomplete', message: `Native image capability unavailable or failed; ask the host to check Sharp before publishing/restoring. ${error instanceof Error ? error.message : String(error)}` };
	}
}

async function inspectDirectory(id: 'temp-directory' | 'output-directory', requested: string): Promise<DoctorReport['checks'][number]> {
	const check: Extract<DoctorReport['checks'][number], { path: string }> = {
		id, status: 'error', path: path.resolve(requested), inspectedPath: path.resolve(requested), exists: null, message: '',
	};
	try {
		for (;;) {
			try {
				await fs.lstat(check.inspectedPath);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
				if (check.inspectedPath === check.path) check.exists = false;
				const parent = path.dirname(check.inspectedPath);
				if (id === 'temp-directory' || parent === check.inspectedPath) throw error;
				check.inspectedPath = parent;
				continue;
			}
			if (check.inspectedPath === check.path) check.exists = true;
			// Resolve only after lstat succeeds: a dangling symlink is an error, not a missing directory to create.
			check.inspectedPath = await fs.realpath(check.inspectedPath);
			if (!(await fs.stat(check.inspectedPath)).isDirectory()) throw new Error('The inspected path is not a directory.');
			await fs.access(check.inspectedPath, constants.R_OK | constants.W_OK | constants.X_OK);
			check.status = 'ok';
			check.message = check.exists ? 'Directory access flags passed; no files written.' : 'Target absent; only the nearest existing ancestor passed access flags. Nothing created.';
			break;
		}
	} catch (error) { check.message = error instanceof Error ? error.message : String(error); }
	return check;
}

export function registerDoctorCommand(program: Command): void {
	program.command('doctor').description('Diagnose versions, native images and directory access; optionally validate a project; never write or repair')
		.argument('[project-dir]', 'Optional project directory or .fairy file for Node validation')
		.option('--output-dir <directory>', 'Check output directory access (or its existing ancestor), without creating it', (value: string) => {
			if (!value) throw new InvalidArgumentError('Output directory must not be empty.');
			return value;
		})
		.option('--json', 'Print the complete machine-readable product diagnosis')
		.action(async (projectDir: string | undefined, options: { json?: boolean; outputDir?: string }) => {
			const version = getInstalledDocumentationVersion();
			const errors: DoctorReport['errors'] = [];
			const cliVersion = readPackageVersion();
			if (cliVersion !== version.packageVersion) errors.push({ code: 'installed_version_mismatch', message: 'CLI and documentation versions differ; ask the host to reconcile the installation.' });
			const minimumMajor = /^>=(\d+)$/u.exec(version.nodeEngine)?.[1];
			if (!minimumMajor || Number(process.versions.node.split('.')[0]) < Number(minimumMajor)) errors.push({ code: 'unsupported_node_version', message: `Installed package requires Node ${version.nodeEngine}.` });
			const capabilities = createNodeBackendRuntime().getCapabilities();
			const checks = await Promise.all([
				inspectNativeImages(), inspectDirectory('temp-directory', tmpdir()),
				...(options.outputDir === undefined ? [] : [inspectDirectory('output-directory', options.outputDir)]),
			]);
			let project: Awaited<ReturnType<typeof validateProjectNode>> | null = null;
			let projectPath: string | null = null;
			if (projectDir) {
				try {
					projectPath = await resolveFairyPath(projectDir);
					project = await validateProjectNode(projectPath);
				} catch (error) { errors.push({ code: 'project_check_failed', message: error instanceof Error ? error.message : String(error) }); }
			}
			const status = errors.length || !capabilities.ok || project?.status === 'invalid' || checks.some((check) => check.status === 'error') ? 'error'
				: project?.status === 'incomplete' || checks.some((check) => check.status === 'incomplete') ? 'incomplete' : 'ready';
			const report: DoctorReport = {
				scope: 'installed-product', ...version, cliVersion, nodeVersion: process.versions.node,
				status, errors, checks, capabilities, projectPath, project,
				limits: [
					'No installation, configuration changes, probe writes, session opening or repair.',
					'Without a project, project source bytes are not tested; native images use only an in-memory PNG/JPEG sample.',
					'Directory access flags do not prove effective ACL permissions, available space, later writes, rename/rollback or continued access. Missing output directories are not created.',
					'Capabilities are declarations, not proof of publish/restore or runtime rendering. Project plugins and configured output destinations are not executed or checked; only an explicit --output-dir is inspected.',
				],
			};
			if (options.json) printJson('doctor', report, status === 'ready' ? undefined : {
				code: status === 'error' ? 'doctor_failed' : 'doctor_incomplete', message: `Product diagnosis is ${status}; inspect result.checks, result.errors and result.project.`,
			});
			else {
				console.log(`${status.toUpperCase()}: OpenFairyGUI ${cliVersion} (documentation ${version.packageVersion}, Node ${report.nodeVersion})`);
				for (const error of errors) console.log(`${error.code}: ${error.message}`);
				for (const check of checks) console.log(`${check.status} ${check.id}${'path' in check ? ` ${check.path} (inspected ${check.inspectedPath})` : ''}: ${check.message}`);
				if (project) {
					console.log(`Project ${project.status}: ${projectPath}`);
					for (const diagnostic of project.diagnostics) console.log(`${diagnostic.severity} ${diagnostic.code} ${diagnostic.path}: ${diagnostic.message}`);
				}
				console.log(report.limits.join('\n'));
			}
			process.exitCode = status === 'ready' ? 0 : status === 'error' ? 1 : 3;
		});
}
