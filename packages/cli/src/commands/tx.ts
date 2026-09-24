import { InvalidArgumentError, type Command } from 'commander';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { UamTransactionOperation } from '@openfairygui/core';
import { createNodeBackendRuntime } from '@openfairygui/backend/node';
import { decodeContractBytes, getInstalledContractSnapshot } from '@openfairygui/backend/docs';
import { resolveFairyPath } from '../utils/project-input.js';
import { printJson } from '../utils/json-output.js';
import type { TransactionReport } from '../contracts.js';

export function registerTransactionCommands(program: Command): void {
	const tx = program
		.command('tx')
		.description('One-shot transactions: each invocation opens a fresh session at revision 0');
	for (const mode of ['preflight', 'apply'] as const) {
		tx.command(mode)
			.description(
				mode === 'preflight'
					? 'Preview operations without saving'
					: 'Preflight, apply, validate and save operations in one locked session',
			)
			.argument('<project>', 'Project directory or .fairy file')
			.requiredOption('--ops <file>', 'JSON array of formal UAM operations')
			.requiredOption('--expected-revision <revision>', 'Revision in this fresh session (0)', (value: string) => {
				if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
					throw new InvalidArgumentError('Expected a nonnegative safe integer.');
				return Number(value);
			})
			.option('--json', 'Print one machine-readable envelope')
			.action(async (project: string, options: { ops: string; expectedRevision: number; json?: boolean }) => {
				const file = await readFile(options.ops);
				if (file.byteLength > 8 * 1024 * 1024) throw new Error('Operation file exceeds 8 MiB.');
				const operations: unknown = JSON.parse(file.toString('utf8'));
				if (!Array.isArray(operations) || operations.length === 0 || operations.length > 1000)
					throw new InvalidArgumentError('--ops must contain 1..1000 operations.');
				const projectPath = await resolveFairyPath(project);
				const runtime = createNodeBackendRuntime({ allowedProjectRoots: [path.dirname(projectPath)] });
				const opened = await runtime.openSession({ projectPath });
				const report: TransactionReport = {
					open: opened,
					preflight: null,
					apply: null,
					validation: null,
					save: null,
					close: null,
				};
				let failure: string | undefined;
				let incomplete = false;
				if (!opened.ok) failure = opened.error.message;
				else {
					const sessionId = opened.data.sessionId;
					try {
						const decoded = decodeContractBytes(
							{ operations },
							getInstalledContractSnapshot().tools.applyTransaction.bytePaths,
						);
						const input = {
							sessionId,
							expectedRevision: options.expectedRevision,
							operations: decoded.operations as UamTransactionOperation[],
						};
						report.preflight = await runtime.preflightTransaction(input);
						if (!report.preflight.ok) failure = report.preflight.error.message;
						else if (mode === 'apply') {
							report.apply = await runtime.applyTransaction(input);
							if (!report.apply.ok) failure = report.apply.error.message;
							else {
								report.validation = await runtime.validateSession({ sessionId });
								if (!report.validation.ok) failure = report.validation.error.message;
								else if (
									report.validation.data.status !== 'valid' ||
									!report.validation.data.complete
								) {
									incomplete = report.validation.data.status === 'incomplete';
									failure = 'Validation did not complete successfully; edits were not saved.';
								} else {
									report.save = await runtime.saveSession({
										sessionId,
										expectedRevision: report.apply.data.revision,
									});
									if (!report.save.ok) failure = report.save.error.message;
								}
							}
						}
					} finally {
						report.close = await runtime.closeSession({ sessionId });
						if (!report.close.ok) failure ??= report.close.error.message;
					}
				}
				if (options.json)
					printJson(
						`tx ${mode}`,
						report,
						failure
							? { code: incomplete ? 'validation_incomplete' : 'command_failed', message: failure }
							: undefined,
					);
				else console.log(JSON.stringify(report, null, 2));
				process.exitCode = failure ? (incomplete ? 3 : 1) : 0;
			});
	}
}
