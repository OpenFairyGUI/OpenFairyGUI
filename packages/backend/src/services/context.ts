import type {
	BackendCacheEntry,
	BackendCapabilities,
	BackendError,
	BackendEvent,
	BackendFailure,
	BackendFileSystem,
	BackendHostAdapter,
	BackendJobSnapshot,
	BackendSessionSnapshot,
	BackendSuccess,
} from '../runtime.js';
import {
	BACKEND_CAPABILITY_SCHEMA_VERSION,
	BACKEND_CONTRACT_VERSION,
	type BackendDiagnostic,
	type BackendMessage,
	type BackendResponseMeta,
	type BackendStage,
} from '../contracts.js';

export interface BackendSessionState {
	sessionId: string;
	fairyPath: string;
	canonicalProjectPath: string;
	canonicalPathKey: string;
	lockFilePath: string;
	project: import('@openfairygui/core').UamProject;
	revision: number;
	lastSavedRevision: number;
	dirty: boolean;
	lockHeld: boolean;
	closed: boolean;
}

export interface BackendContext {
	fileSystem?: BackendFileSystem;
	host?: BackendHostAdapter;
	capabilities: BackendCapabilities;
	sessions: Map<string, BackendSessionState>;
	sessionsByPath: Map<string, string>;
	eventsBySession: Map<string, BackendEvent[]>;
	jobsBySession: Map<string, BackendJobSnapshot[]>;
	cacheBySession: Map<string, BackendCacheEntry>;
	nextEventSequence: () => number;
}

function diagnosticFromError(error: BackendError): BackendDiagnostic {
	return {
		code: error.code,
		message: error.message,
		severity: 'error',
	};
}

function randomId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createMeta(
	stage: BackendStage,
	startedAt: number,
	options?: {
		requestId?: string;
		sessionId?: string;
		revision?: number;
		warnings?: BackendMessage[];
		diagnostics?: BackendDiagnostic[];
	},
): BackendResponseMeta {
	return {
		requestId: options?.requestId ?? randomId(),
		sessionId: options?.sessionId,
		revision: options?.revision,
		durationMs: Math.max(0, Date.now() - startedAt),
		warnings: options?.warnings ?? [],
		diagnostics: options?.diagnostics ?? [],
		stage,
		contractVersion: BACKEND_CONTRACT_VERSION,
		capabilitySchemaVersion: BACKEND_CAPABILITY_SCHEMA_VERSION,
	};
}

export function success<T>(
	stage: BackendStage,
	startedAt: number,
	data: T,
	options?: {
		requestId?: string;
		sessionId?: string;
		revision?: number;
		warnings?: BackendMessage[];
		diagnostics?: BackendDiagnostic[];
	},
): BackendSuccess<T> {
	return {
		ok: true,
		meta: createMeta(stage, startedAt, options),
		data,
	};
}

export function failure<E extends BackendError>(
	stage: BackendStage,
	startedAt: number,
	error: E,
	session?: BackendSessionSnapshot,
	options?: {
		requestId?: string;
		sessionId?: string;
		revision?: number;
		warnings?: BackendMessage[];
		diagnostics?: BackendDiagnostic[];
	},
): BackendFailure<E> {
	const diagnostics = options?.diagnostics ?? [diagnosticFromError(error)];
	return {
		ok: false,
		meta: createMeta(stage, startedAt, { ...options, diagnostics }),
		error,
		session,
	};
}
