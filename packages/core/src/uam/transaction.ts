import type { UamProject } from './model.js';
import { normalizeUamProject } from './normalize.js';
import { validateUamProject } from './validate.js';
import {
	liftDocumentToUamProject,
	materializeUamProject,
} from './bridge.js';
import {
	UamTransactionError,
	type UamTransactionOperation,
} from './transaction-contracts.js';
import { assertTransactionSupported } from './transaction-preflight.js';
import {
	applyUamNativeOperations,
	canApplyOperationsInUam,
} from './transaction-uam-apply.js';
import { applyDocumentOperation } from './transaction-document-apply.js';
import { asTransactionError, selectorDetails } from './transaction-shared.js';

export * from './transaction-contracts.js';
export {
	assertTransactionSupported,
	validateTransactionSupport,
} from './transaction-preflight.js';

export class UamTransaction {
	private readonly baseline: UamProject;
	private readonly operations: UamTransactionOperation[] = [];

	public constructor(project: UamProject) {
		this.baseline = normalizeUamProject(project);
	}

	public add(operation: UamTransactionOperation): this {
		this.operations.push(operation);
		return this;
	}

	public addAll(operations: UamTransactionOperation[]): this {
		for (const operation of operations) this.add(operation);
		return this;
	}

	public listOperations(): UamTransactionOperation[] {
		return [...this.operations];
	}

	public commit(): UamProject {
		return applyUamTransaction(this.baseline, this.operations);
	}
}

export function createUamTransaction(project: UamProject): UamTransaction {
	return new UamTransaction(project);
}

export function applyUamTransaction(
	project: UamProject,
	operations: UamTransactionOperation[],
): UamProject {
	const baseline = normalizeUamProject(project);
	assertTransactionSupported(baseline, operations);
	if (canApplyOperationsInUam(operations)) {
		return applyUamNativeOperations(baseline, operations);
	}

	const baselineIssues = validateUamProject(baseline);
	if (baselineIssues.length > 0) {
		throw new UamTransactionError(
			`UAM validation failed before transaction:\n${baselineIssues.map((issue) => `- ${issue.path}: ${issue.message}`).join('\n')}`,
			{
				code: 'invalid_uam',
				issues: baselineIssues,
			},
		);
	}

	const workingDocument = materializeUamProject(baseline);
	for (const [opIndex, operation] of operations.entries()) {
		try {
			applyDocumentOperation(workingDocument, operation);
		} catch (error) {
				throw asTransactionError(error, {
					code: error instanceof UamTransactionError ? error.code : 'execution_failure',
					opIndex,
					opId: operation.opId,
					opKind: operation.kind,
					selector: 'selector' in operation ? selectorDetails(operation.selector as unknown as Record<string, unknown>) : undefined,
				});
			}
		}

	const result = normalizeUamProject(liftDocumentToUamProject(workingDocument));
	const resultIssues = validateUamProject(result);
	if (resultIssues.length > 0) {
		throw new UamTransactionError(
			`Transaction produced invalid UAM:\n${resultIssues.map((issue) => `- ${issue.path}: ${issue.message}`).join('\n')}`,
			{
				code: 'execution_failure',
				issues: resultIssues,
			},
		);
	}

	return result;
}
