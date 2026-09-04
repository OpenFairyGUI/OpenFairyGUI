export const BACKEND_CONTRACT_VERSION = '1.1.0-p2' as const;
export const BACKEND_CAPABILITY_SCHEMA_VERSION = 6 as const;
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

export interface BackendDiagnostic {
	code: string;
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
	owner?: 'backend' | 'core.transaction' | 'core.validation';
	docsUri?: string;
	remediation?: BackendDiagnosticRemediation;
}

export interface BackendDiagnosticRemediation {
	kind: 'refresh-and-replan' | 'revise-selector' | 'host-action';
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
