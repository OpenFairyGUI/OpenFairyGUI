export const BACKEND_CONTRACT_VERSION = '1.0.0-p1' as const;
export const BACKEND_CAPABILITY_SCHEMA_VERSION = 1 as const;
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
