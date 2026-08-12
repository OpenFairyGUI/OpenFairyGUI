import type {
	UamDisplayNodeKind,
	UamProject,
	UamResource,
	UamTransactionOperation,
} from '@openfairygui/core/uam';
import type { ApplyUamTransactionAppError } from '@openfairygui/functions/uam';
import type {
	BACKEND_CAPABILITY_SCHEMA_VERSION,
	BACKEND_COMPATIBILITY_POLICY,
	BACKEND_CONTRACT_VERSION,
	BackendDiagnostic,
	BackendResponseMeta,
} from '../contracts.js';
import type { PathPolicyViolationError } from '../path-policy.js';

/** An exclusive lock owned for the lifetime of one backend session. */
export interface BackendSessionLock {
	/** Persist optional host metadata without changing lock ownership. */
	writeMetadata(content: string): Promise<void>;
	/** Release ownership. Browser implementations must also release when their document terminates. */
	release(): Promise<void>;
}

export interface BackendFileStat {
	isFile(): boolean;
	isDirectory(): boolean;
}

export interface BackendFileSystem {
	stat(filePath: string): Promise<BackendFileStat>;
	readdir(dirPath: string): Promise<string[]>;
	readFile(filePath: string): Promise<string>;
	readFileRaw(filePath: string): Promise<Uint8Array>;
	writeFile(filePath: string, content: string): Promise<void>;
	writeFileRaw(filePath: string, data: Uint8Array): Promise<void>;
	mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void>;
	resolvePath(filePath: string): Promise<string>;
	/** Optional host-specific lock location. Node keeps it beside the project so directory swaps do not move it. */
	getSessionLockPath?(canonicalProjectPath: string): string;
	/** Runs project writes against a staged copy and commits them as one directory swap. */
	runProjectWriteTransaction?(
		projectRoot: string,
		write: (stagedFileSystem: BackendFileSystem) => Promise<void>,
	): Promise<void>;
	acquireSessionLock(lockPath: string): Promise<BackendSessionLock>;
	unlink(filePath: string): Promise<void>;
	rmdir(dirPath: string): Promise<void>;
	join(...paths: string[]): string;
	dirname(filePath: string): string;
	resolve(...paths: string[]): string;
}

export interface BackendHostAdapter {
	lockMetadata?(input: { canonicalPathKey: string; canonicalProjectPath: string; lockFilePath: string }): unknown;
}

export interface BackendArtifactBridgeCapability {
	available: false;
	requiredHost: 'node';
	executionBoundary: 'external-bridge';
	bridgeEntrypoint: '@openfairygui/backend/node';
	reason: string;
}

export interface BackendCapabilityManifest {
	browserSafe: true;
	rootEntrypoint: '@openfairygui/backend';
	nodeEntrypoint: '@openfairygui/backend/node';
	adapters: {
		fileSystem: {
			injected: true;
			requiredFor: readonly ['openSession', 'saveSession', 'materializeSession'];
		};
		projectStorage: {
			injected: true;
			browserSafe: true;
			requiredFor: readonly ['openProjectSession.writeback', 'saveSession', 'materializeSession'];
			adapterFactory: 'createBackendStorageFileSystem';
		};
		host: {
			injected: true;
			requiredFor: readonly ['advisoryLockMetadata'];
		};
	};
	executionBoundaries: {
		projectSession: 'in-process-browser-safe';
		fileBackedSession: 'adapter-backed';
		artifactPublish: BackendArtifactBridgeCapability;
		artifactRestore: BackendArtifactBridgeCapability;
	};
	diagnostics: {
		stableCodes: true;
		errorDiagnosticMirror: true;
	};
}

export interface BackendCapabilities {
	contractVersion: typeof BACKEND_CONTRACT_VERSION;
	capabilitySchemaVersion: typeof BACKEND_CAPABILITY_SCHEMA_VERSION;
	transactionKernelOwner: '@openfairygui/core';
	appSeamOwner: '@openfairygui/functions';
	runtimeOwner: '@openfairygui/backend';
	methods: readonly [
		'getCapabilities',
		'openSession',
		'openProjectSession',
		'getSession',
		'getProjectOutline',
		'validateSession',
		'applyTransaction',
		'saveSession',
		'materializeSession',
		'closeSession',
		'getEvents',
		'getJob',
		'listJobs',
		'cancelJob',
		'getCacheSnapshot',
		'refreshCache',
	];
	read: {
		capabilitySnapshot: true;
		sessionSnapshot: true;
		projectOutline: true;
		projectValidation: true;
	};
	authoring: {
		applyTransaction: true;
		saveSession: true;
		resourceKinds: readonly string[];
		nodeKinds: readonly string[];
		gearKinds: readonly string[];
		transactionScope: {
			resourceKinds: readonly string[];
			nodeKinds: readonly string[];
			gearKinds: readonly string[];
		};
		unsupported: readonly ['artifact.publish', 'artifact.restore'];
	};
	artifact: {
		publish: false;
		restore: false;
		status: 'bridge-required';
		publishBridge: BackendArtifactBridgeCapability;
		restoreBridge: BackendArtifactBridgeCapability;
	};
	manifest: BackendCapabilityManifest;
	compatibilityPolicy: typeof BACKEND_COMPATIBILITY_POLICY;
	runtime: {
		sessionRuntime: true;
		advisoryLocking: true;
		coordinatedSave: true;
		atomicSave: boolean;
		staleRevisionProtection: true;
		pathPolicy: {
			canonicalization: 'realpath+normalized-casefold';
			sessionIdentity: 'project-root';
			saveTarget: 'opened-project-only';
			outputTargets: 'deferred';
			workspaceBoundary: 'project-root-only';
		};
		events: {
			polling: true;
			subscriptions: false;
			retentionLimit: 1000;
			sequenceScope: 'runtime';
		};
		jobs: {
			inMemory: true;
			cooperativeCancel: true;
			persistent: false;
			supportedKinds: readonly ['cache.refresh'];
			artifactJobs: false;
			completedRetentionLimit: 100;
		};
		cache: {
			derivedReadOnly: true;
			keyedBy: 'canonicalPathKey';
			sourceOfTruth: false;
			refreshMethod: 'refreshCache';
		};
	};
}

export interface BackendSessionSnapshot {
	sessionId: string;
	canonicalProjectPath: string;
	revision: number;
	lastSavedRevision: number;
	dirty: boolean;
	uamFidelity: 'full' | 'unsupported';
	lockHeld: boolean;
	capabilities: BackendCapabilities;
}

export interface BackendProjectOutline {
	sessionId: string;
	revision: number;
	projectId: string;
	projectType: number;
	version: string;
	branches: string[];
	packages: BackendProjectOutlinePackage[];
}

export interface BackendProjectOutlinePackage {
	id: string;
	name: string;
	branchNames: string[];
	folders: Array<{ branch: string; path: string }>;
	resources: BackendProjectOutlineResource[];
}

export interface BackendProjectOutlineResource {
	id: string;
	name: string;
	path: string;
	kind: UamResource['kind'];
	branch: string;
	component?: {
		displayList: Array<{ id: string; name: string; kind: UamDisplayNodeKind }>;
		controllers: Array<{ name: string; pages: Array<{ id: string; name: string }> }>;
		transitions: Array<{ name: string }>;
	};
}

export interface MaterializeSessionSnapshot extends BackendSessionSnapshot {
	mode: 'fullProject';
	reason?: string;
	materializeRevision: number;
	saveRevision: number;
	writtenPaths: string[];
	skippedPaths: string[];
	diagnostics: BackendDiagnostic[];
}

export interface BackendSuccess<T> {
	ok: true;
	meta: BackendResponseMeta;
	data: T;
}

export interface BackendFailure<E extends BackendError = BackendError> {
	ok: false;
	meta: BackendResponseMeta;
	error: E;
	session?: BackendSessionSnapshot;
}

export type BackendResult<T, E extends BackendError = BackendError> = BackendSuccess<T> | BackendFailure<E>;

export interface SessionNotFoundError {
	code: 'session_not_found';
	message: string;
	sessionId: string;
}

export interface SessionStaleWriteError {
	code: 'stale_write';
	message: string;
	sessionId: string;
	canonicalPathKey: string;
	expectedRevision: number;
	actualRevision: number;
}

export interface InProcessLockConflictError {
	code: 'lock_conflict';
	kind: 'in_process_session_exists';
	message: string;
	canonicalPathKey: string;
	holderSessionId: string;
	lockFilePath?: string;
}

export interface AdvisoryLockConflictError {
	code: 'lock_conflict';
	kind: 'advisory_lock_conflict';
	message: string;
	canonicalPathKey: string;
	holderSessionId?: string;
	lockFilePath: string;
}

export interface SessionIdConflictError {
	code: 'session_id_conflict';
	message: string;
	sessionId: string;
}

export interface SavePartialFailureError {
	code: 'save_partial_failure';
	message: string;
	sessionId: string;
	canonicalPathKey: string;
	attemptedRevision: number;
	lastSavedRevision: number;
	committedPaths: string[];
	failedPaths: string[];
	diskMayBePartiallyUpdated: boolean;
}

export interface UamFidelityUnsupportedError {
	code: 'uam_fidelity_unsupported';
	message: string;
	sessionId: string;
	canonicalPathKey: string;
}

export interface MaterializeValidationFailedError {
	code: 'materialize_validation_failed';
	message: string;
	sessionId: string;
	canonicalPathKey: string;
	issueCount: number;
	diagnostics: BackendDiagnostic[];
}

export interface MaterializeWriteFailedError {
	code: 'write_failed';
	message: string;
	sessionId: string;
	canonicalPathKey: string;
	attemptedRevision: number;
	lastSavedRevision: number;
	writtenPaths: string[];
	failedPaths: string[];
	skippedPaths: string[];
	diagnostics: BackendDiagnostic[];
	diskMayBePartiallyUpdated: boolean;
}

export type BackendEventKind =
	| 'session.opened'
	| 'transaction.applied'
	| 'transaction.rejected'
	| 'save.started'
	| 'save.completed'
	| 'save.failed'
	| 'session.closeRequested'
	| 'session.closed'
	| 'cache.invalidated'
	| 'cache.updated'
	| 'job.created'
	| 'job.started'
	| 'job.progress'
	| 'job.cancelRequested'
	| 'job.cancelled'
	| 'job.completed'
	| 'job.failed';

export interface BackendEvent {
	sequence: number;
	kind: BackendEventKind;
	timestamp: string;
	sessionId?: string;
	canonicalPathKey?: string;
	revision?: number;
	cacheRevision?: number;
	jobId?: string;
	diagnostics: BackendDiagnostic[];
	payload?: unknown;
}

export interface GetEventsInput {
	sessionId: string;
	after?: string;
	limit?: number;
}

export interface GetEventsSnapshot {
	events: BackendEvent[];
	oldestSequence: number;
	currentSequence: number;
	cursorExpired: boolean;
}

export interface EventCursorInvalidError {
	code: 'event_cursor_invalid';
	message: string;
	sessionId: string;
	after: string;
}

export type BackendJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type BackendJobKind = 'cache.refresh';
export type BackendJobListStatusFilter = BackendJobStatus | 'active' | 'terminal';

export interface BackendJobProgress {
	completed: number;
	total?: number;
	message?: string;
}

export interface BackendJobSnapshot {
	jobId: string;
	kind: BackendJobKind;
	status: BackendJobStatus;
	createdAt: string;
	startedAt?: string;
	finishedAt?: string;
	sessionId?: string;
	canonicalPathKey?: string;
	revision?: number;
	cacheRevision?: number;
	diagnostics: BackendDiagnostic[];
	progress?: BackendJobProgress;
	result?: unknown;
	error?: BackendError;
}

export interface BackendJobListSnapshot {
	jobs: BackendJobSnapshot[];
}

export interface GetJobInput {
	sessionId: string;
	jobId: string;
}

export interface ListJobsInput {
	sessionId: string;
	status?: BackendJobListStatusFilter;
	kind?: BackendJobKind;
	limit?: number;
}

export interface CancelJobInput {
	sessionId: string;
	jobId: string;
}

export interface BackendJobNotFoundError {
	code: 'job_not_found';
	message: string;
	sessionId: string;
	jobId: string;
}

export interface BackendJobNotCancellableError {
	code: 'job_not_cancellable';
	message: string;
	sessionId: string;
	jobId: string;
	status: 'completed' | 'failed' | 'cancelled';
}

export interface BackendJobCancelledError {
	code: 'job_cancelled';
	message: string;
	sessionId: string;
	jobId: string;
}

export interface CacheRefreshFailedError {
	code: 'cache_refresh_failed';
	message: string;
	sessionId: string;
	jobId: string;
	causeCode?: string;
}

export interface BackendCapabilityUnavailableError {
	code: 'capability_unavailable';
	message: string;
	capability: 'fileSystem' | 'artifact.publish' | 'artifact.restore';
	requiredAdapter?: 'BackendFileSystem';
	requiredHost?: 'node';
	bridgeBoundary?: 'external-bridge';
}

export type BackendJobErrors =
	| BackendJobNotFoundError
	| BackendJobNotCancellableError
	| BackendJobCancelledError
	| CacheRefreshFailedError;

export interface BackendCacheSnapshot {
	cacheRevision: number;
	entries: BackendCacheEntry[];
}

export interface BackendCacheEntry {
	canonicalPathKey: string;
	sessionId?: string;
	revision: number;
	lastSavedRevision: number;
	dirty: boolean;
	valid: boolean;
	indexedAt: string;
	summary: {
		resourceCount: number;
		packageCount?: number;
		diagnostics: BackendDiagnostic[];
	};
}

export interface GetCacheSnapshotInput {
	sessionId: string;
}

export interface RefreshCacheInput {
	sessionId: string;
	reason?: 'manual' | 'session_open' | 'after_save';
}

export type BackendError =
	| SessionNotFoundError
	| SessionIdConflictError
	| SessionStaleWriteError
	| InProcessLockConflictError
	| AdvisoryLockConflictError
	| SavePartialFailureError
	| UamFidelityUnsupportedError
	| MaterializeValidationFailedError
	| MaterializeWriteFailedError
	| PathPolicyViolationError
	| EventCursorInvalidError
	| BackendJobNotFoundError
	| BackendJobNotCancellableError
	| BackendJobCancelledError
	| CacheRefreshFailedError
	| BackendCapabilityUnavailableError
	| ProjectRootNotAllowedError
	| ProjectOpenFailedError
	| ApplyUamTransactionAppError;

export interface ProjectRootNotAllowedError {
	code: 'project_root_not_allowed';
	message: string;
	projectPath: string;
}

export interface ProjectOpenFailedError {
	code: 'project_open_failed';
	message: string;
	projectPath: string;
}

export interface ApplySessionTransactionInput {
	sessionId: string;
	expectedRevision: number;
	operations: UamTransactionOperation[];
}

export interface GetProjectOutlineInput {
	sessionId: string;
}

export interface ValidateSessionInput {
	sessionId: string;
}

export interface OpenProjectSessionInput {
	/** Authoritative UAM project. Use BackendRuntime.openSession() when importing an existing project from storage. */
	project: UamProject;
	sessionId?: string;
	canonicalProjectPath?: string;
	canonicalPathKey?: string;
	/** Optional writeback target for the authoritative UAM project; this is not an import source. */
	storage?: BackendProjectSessionStorage;
}

export interface BackendProjectSessionStorage {
	fileSystem: BackendFileSystem;
	fairyPath: string;
	canonicalProjectPath?: string;
	canonicalPathKey?: string;
}

export interface SaveSessionInput {
	sessionId: string;
	expectedRevision?: number;
	targetPath?: string;
	fileSystem?: BackendFileSystem;
	force?: boolean;
	mode?: 'materializeCleanSession';
}

export interface MaterializeSessionInput {
	sessionId: string;
	expectedRevision?: number;
	storage?: BackendProjectSessionStorage;
	targetPath?: string;
	fileSystem?: BackendFileSystem;
	mode?: 'fullProject';
	reason?: string;
}

export interface BackendRuntimeOptions {
	fileSystem?: BackendFileSystem;
	host?: BackendHostAdapter;
	/** Canonical filesystem roots available to file-backed sessions. Omit for unrestricted library use. */
	allowedProjectRoots?: readonly string[];
}
