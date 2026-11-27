import { InvalidArgumentError, type Command } from 'commander';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { UamTransactionOperation } from '@openfairygui/core';
import { createNodeBackendRuntime, disposeBackendRuntime } from '@openfairygui/backend/node';
import { decodeContractBytes, getInstalledContractSnapshot } from '@openfairygui/backend/docs';
import { resolveFairyPath } from '../utils/project-input.js';
import { printJson } from '../utils/json-output.js';
import type { TransactionReport } from '../contracts.js';

const MAX_OPS_FILE_BYTES = 8 * 1024 * 1024;

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
				const opsStat = await stat(options.ops);
				if (opsStat.size > MAX_OPS_FILE_BYTES) {
					throw new InvalidArgumentError('Operation file exceeds 8 MiB.');
				}
				const file = await readFile(options.ops);
				if (file.byteLength > MAX_OPS_FILE_BYTES) {
					throw new InvalidArgumentError('Operation file exceeds 8 MiB.');
				}
				let operations: unknown;
				try {
					operations = JSON.parse(file.toString('utf8'));
				} catch (error) {
					throw new InvalidArgumentError(
						`--ops file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
				if (!Array.isArray(operations) || operations.length === 0 || operations.length > 1000)
					throw new InvalidArgumentError('--ops must contain 1..1000 operations.');
				const projectPath = await resolveFairyPath(project);
				const runtime = createNodeBackendRuntime({ allowedProjectRoots: [path.dirname(projectPath)] });
				const cleanupOnSignal = (signal: NodeJS.Signals) => {
					void disposeBackendRuntime(runtime).finally(() => {
						process.exit(signal === 'SIGINT' ? 130 : 143);
					});
				};
				process.once('SIGINT', cleanupOnSignal);
				process.once('SIGTERM', cleanupOnSignal);
				try {
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
					let errorCode: 'validation_incomplete' | 'validation_failed' | 'command_failed' = 'command_failed';
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
										incomplete =
											report.validation.data.status === 'incomplete' ||
											!report.validation.data.complete;
										errorCode = incomplete ? 'validation_incomplete' : 'validation_failed';
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
							if (!report.close.ok) {
								failure = failure
									? `${failure} (closeSession failed: ${report.close.error.message})`
									: report.close.error.message;
								if (incomplete) {
									incomplete = false;
									errorCode = 'command_failed';
								}
							}
						}
					}
					if (options.json)
						printJson(`tx ${mode}`, report, failure ? { code: errorCode, message: failure } : undefined);
					else console.log(JSON.stringify(report, null, 2));
					process.exitCode = failure ? (incomplete ? 3 : 1) : 0;
				} finally {
					process.off('SIGINT', cleanupOnSignal);
					process.off('SIGTERM', cleanupOnSignal);
				}
			});
	}
}
