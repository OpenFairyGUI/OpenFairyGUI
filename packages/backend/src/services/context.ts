import {
	BACKEND_CAPABILITY_SCHEMA_VERSION,
	BACKEND_CONTRACT_VERSION,
	type BackendDiagnostic,
	type BackendMessage,
	type BackendResponseMeta,
	type BackendStage,
} from '../contracts.js';
import { enrichBackendDiagnostic } from '../diagnostics.js';
import type { SessionRegistry } from './session-registry.js';
import type {
	BackendCapabilities,
	BackendError,
	BackendFailure,
	BackendFileSystem,
	BackendHostAdapter,
	BackendSessionLock,
	BackendSessionSnapshot,
	BackendSuccess,
} from '../runtime.js';

export interface BackendSessionState {
	readonly sessionId: string;
	readonly fairyPath: string;
	readonly canonicalProjectPath: string;
	readonly canonicalPathKey: string;
	readonly lockFilePath: string;
	sessionLock: BackendSessionLock | null;
	fileSystem?: BackendFileSystem;
	project: import('@openfairygui/core/uam').UamProject;
	readDiagnostics: import('@openfairygui/core').ProjectDiagnostic[];
	readComplete: boolean;
	uamFidelity: 'full' | 'unsupported';
	revision: number;
	lastSavedRevision: number;
	/** Package-controlled files deferred until a successful replacement project write. */
	pendingStaleSourceFiles: Map<string, import('@openfairygui/core/project-io').ProjectSourceFile>;
	/** Empty resource directories deferred until a successful replacement project write. */
	pendingStaleResourceFolders: Map<string, import('@openfairygui/core/project-io').ProjectResourceFolder>;
	/** Removed package-branch and root-branch directories deferred until controlled files are replaced. */
	pendingStaleBranchDirectories: Map<string, import('@openfairygui/core/project-io').ProjectBranchDirectory>;
	dirty: boolean;
	lockHeld: boolean;
	closed: boolean;
}

export interface BackendContext {
	fileSystem?: BackendFileSystem;
	host?: BackendHostAdapter;
	allowedProjectRoots?: readonly string[];
	capabilities: BackendCapabilities;
	sessions: SessionRegistry;
}

/** Borrowed data is read-only, including nested arrays and primary resource bytes. */
export type ReadonlyData<T> = unknown extends T ? T : T extends Uint8Array
	? Readonly<Pick<Uint8Array, 'length' | 'byteLength' | typeof Symbol.iterator>> & { readonly [index: number]: number }
	: { readonly [K in keyof T]: ReadonlyData<T[K]> };

export type SessionReadView = ReadonlyData<Pick<BackendSessionState,
	'sessionId' | 'canonicalProjectPath' | 'canonicalPathKey' | 'project' | 'readDiagnostics' | 'readComplete'
	| 'uamFidelity' | 'revision' | 'lastSavedRevision' | 'dirty' | 'lockHeld' | 'closed'>>;
export type SessionLookup = (sessionId: string) => SessionReadView | undefined;

/** Borrow without copying the entire project before a read has checked its response budget. */
export function readView<T>(value: T): ReadonlyData<T> {
	return value as ReadonlyData<T>;
}

/** A detached copy is writable again; this is the only conversion from a borrowed read view. */
export function cloneReadData<T>(value: ReadonlyData<T>): T {
	return structuredClone(value) as T;
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
		diagnostics: (options?.diagnostics ?? []).map((entry) => enrichBackendDiagnostic(entry, options?.sessionId)),
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
