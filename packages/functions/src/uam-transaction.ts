import {
	applyUamTransaction,
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
	selector?: Record<string, unknown>;
	issues?: UamValidationIssue[] | UamTransactionSupportIssue[];
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

export function applyUamTransactionApp(input: ApplyUamTransactionAppInput): ApplyUamTransactionAppResult {
	try {
		return {
			ok: true,
			project: applyUamTransaction(input.project, input.operations),
		};
	} catch (error) {
		if (error instanceof UamTransactionError) {
			return {
				ok: false,
				error: {
					code: error.code,
					stage: mapTransactionErrorStage(error),
					message: error.message,
					opIndex: error.opIndex,
					opId: error.opId,
					opKind: error.opKind,
					selector: error.selector,
					issues: error.issues,
				},
			};
		}
		throw error;
	}
}
