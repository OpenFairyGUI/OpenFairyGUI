import {
	applyUamTransaction,
	applyUamTransactionAsync,
	type UamProject,
	UamTransactionError,
	type UamTransactionErrorCode,
	type UamTransactionOperation,
	type UamTransactionSupportIssue,
	type UamValidationIssue,
} from '@openfairygui/core/uam';

export interface ApplyUamTransactionAppInput {
	project: UamProject;
	operations: UamTransactionOperation[];
}

export interface ApplyUamTransactionAppError {
	code: UamTransactionErrorCode;
	stage: 'preflight' | 'execution' | 'postflight';
	message: string;
	opIndex?: number;
	opId?: string;
	opKind?: UamTransactionOperation['kind'];
	operationKind?: UamTransactionOperation['kind'];
	selector?: Record<string, unknown>;
	issues?: UamValidationIssue[] | UamTransactionSupportIssue[];
	diagnostics: ApplyUamTransactionAppDiagnostic[];
}

export type ApplyUamTransactionAppResult =
	| { ok: true; project: UamProject }
	| { ok: false; error: ApplyUamTransactionAppError };

function mapTransactionErrorStage(error: UamTransactionError): ApplyUamTransactionAppError['stage'] {
	switch (error.code) {
		case 'transaction_unsupported':
			return 'preflight';
		case 'invalid_uam':
			return 'preflight';
		case 'execution_failure':
			return error.opIndex === undefined && error.issues !== undefined ? 'postflight' : 'execution';
		case 'selector_ambiguity':
			return error.opIndex === undefined ? 'preflight' : 'execution';
	}
}

export interface ApplyUamTransactionAppDiagnostic {
	code: string;
	message: string;
	severity: 'error';
	path?: string;
	nodeKind?: string;
	resourceKind?: string;
	gearKind?: string;
	field?: string;
	operationKind?: UamTransactionOperation['kind'];
	opIndex?: number;
	opId?: string;
}

function compactDiagnostic(diagnostic: ApplyUamTransactionAppDiagnostic): ApplyUamTransactionAppDiagnostic {
	return Object.fromEntries(Object.entries(diagnostic).filter(([, value]) => value !== undefined)) as ApplyUamTransactionAppDiagnostic;
}

function isTransactionSupportIssue(issue: UamValidationIssue | UamTransactionSupportIssue): issue is UamTransactionSupportIssue {
	return !('severity' in issue);
}

function mapTransactionDiagnostics(error: UamTransactionError): ApplyUamTransactionAppDiagnostic[] {
	if (error.issues?.length) {
		return error.issues.map((issue) => {
			if (isTransactionSupportIssue(issue)) {
				return compactDiagnostic({
					code: issue.code,
					message: issue.message,
					severity: 'error' as const,
					path: issue.path,
					nodeKind: issue.nodeKind,
					resourceKind: issue.resourceKind,
					gearKind: issue.gearKind,
					field: issue.field,
					operationKind: issue.operationKind ?? error.opKind,
					opIndex: error.opIndex,
					opId: error.opId,
				});
			}
			return compactDiagnostic({
				code: error.code,
				message: issue.message,
				severity: 'error' as const,
				path: issue.path,
				operationKind: error.opKind,
				opIndex: error.opIndex,
				opId: error.opId,
			});
		});
	}
	return [
		compactDiagnostic({
			code: error.code,
			message: error.message,
			severity: 'error',
			path: error.opIndex === undefined ? undefined : `operations[${error.opIndex}]`,
			operationKind: error.opKind,
			opIndex: error.opIndex,
			opId: error.opId,
		}),
	];
}

function transactionFailure(error: UamTransactionError): ApplyUamTransactionAppResult {
	return {
		ok: false,
		error: {
			code: error.code,
			stage: mapTransactionErrorStage(error),
			message: error.message,
			opIndex: error.opIndex,
			opId: error.opId,
			opKind: error.opKind,
			operationKind: error.opKind,
			selector: error.selector,
			issues: error.issues,
			diagnostics: mapTransactionDiagnostics(error),
		},
	};
}

export function applyUamTransactionApp(input: ApplyUamTransactionAppInput): ApplyUamTransactionAppResult {
	try {
		return {
			ok: true,
			project: applyUamTransaction(input.project, input.operations),
		};
	} catch (error) {
		if (error instanceof UamTransactionError) return transactionFailure(error);
		throw error;
	}
}

export async function applyUamTransactionAppAsync(
	input: ApplyUamTransactionAppInput,
): Promise<ApplyUamTransactionAppResult> {
	try {
		return {
			ok: true,
			project: await applyUamTransactionAsync(input.project, input.operations),
		};
	} catch (error) {
		if (error instanceof UamTransactionError) return transactionFailure(error);
		throw error;
	}
}
