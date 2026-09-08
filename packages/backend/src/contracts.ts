import type { ProjectDiagnosticCode } from '@openfairygui/core';
import type { UamTransactionSupportIssueCode } from '@openfairygui/core/uam';
import type { BackendError } from './runtime.js';

export const BACKEND_CONTRACT_VERSION = '2.0.0-p3' as const;
export const BACKEND_CAPABILITY_SCHEMA_VERSION = 11 as const;
export const BACKEND_COMPATIBILITY_POLICY = {
	incompatibleChange: 'requires contractVersion bump',
	capabilitySchemaChange: 'requires capabilitySchemaVersion bump',
	additiveChange: 'allowed without breaking existing consumers',
} as const;

export type BackendStage = 'read' | 'authoring' | 'runtime';

export interface BackendMessage {
	code: string;
	message: string;
}

export type BackendDiagnosticCode = BackendError['code'] | UamTransactionSupportIssueCode | ProjectDiagnosticCode;
export type BackendDiagnosticOwner = 'backend' | 'core.transaction' | 'core.validation';

export interface BackendDiagnostic {
	code: BackendDiagnosticCode;
	message: string;
	severity: 'info' | 'warning' | 'error';
	path?: string;
	nodeKind?: string;
	resourceKind?: string;
	gearKind?: string;
	field?: string;
	operationKind?: string;
	opIndex?: number;
	opId?: string;
	/** Present for catalogued diagnostics only; original codes and classification are preserved. */
	owner?: BackendDiagnosticOwner;
	docsUri?: string;
	remediation?: BackendDiagnosticRemediation;
}

export interface BackendDiagnosticRemediation {
	kind: 'refresh-and-replan' | 'revise-selector' | 'revise-operation' | 'host-action';
	message: string;
	/** A read-only starting point, never permission to retry or mutate. */
	read?: { method: 'getProjectOutline'; input: { sessionId: string } };
}

export interface BackendResponseMeta {
	requestId: string;
	sessionId?: string;
	revision?: number;
	durationMs: number;
	warnings: BackendMessage[];
	diagnostics: BackendDiagnostic[];
	stage: BackendStage;
	contractVersion: typeof BACKEND_CONTRACT_VERSION;
	capabilitySchemaVersion: typeof BACKEND_CAPABILITY_SCHEMA_VERSION;
}
