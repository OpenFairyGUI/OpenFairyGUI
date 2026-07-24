import {
	UAM_SUPPORTED_MATERIALIZATION_SCOPE,
	UAM_SUPPORTED_TRANSACTION_SCOPE,
	type UamProject,
	type UamTransactionOperation,
} from '@openfairygui/core/uam';
import type { ApplyUamTransactionAppError } from '@openfairygui/functions/uam';
import {
	BACKEND_CAPABILITY_SCHEMA_VERSION,
	BACKEND_COMPATIBILITY_POLICY,
	BACKEND_CONTRACT_VERSION,
	type BackendResponseMeta,
} from './contracts.js';
import { createRuntimePathPolicy, type PathPolicyViolationError } from './path-policy.js';
import { createArtifactCapabilities } from './services/artifact-service.js';
import { AuthoringService } from './services/authoring-service.js';
import { CacheService } from './services/cache-service.js';
import type { BackendContext, BackendSessionState } from './services/context.js';
import { EventService } from './services/event-service.js';
import { JobService } from './services/job-service.js';
import { ReadService } from './services/read-service.js';
import { RuntimeService } from './services/runtime-service.js';

export interface BackendFileHandle {
	writeFile(content: string): Promise<void>;
	close(): Promise<void>;
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
	openExclusive(filePath: string): Promise<BackendFileHandle>;
	unlink(filePath: string): Promise<void>;
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
		atomicSave: false;
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

export interface MaterializeSessionSnapshot extends BackendSessionSnapshot {
	mode: 'fullProject';
	reason?: string;
	materializeRevision: number;
	saveRevision: number;
	writtenPaths: string[];
	skippedPaths: string[];
	diagnostics: import('./contracts.js').BackendDiagnostic[];
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

export interface SavePartialFailureError {
	code: 'save_partial_failure';
	message: string;
	sessionId: string;
	canonicalPathKey: string;
	attemptedRevision: number;
	lastSavedRevision: number;
	committedPaths: string[];
	failedPaths: string[];
	diskMayBePartiallyUpdated: true;
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
	diagnostics: import('./contracts.js').BackendDiagnostic[];
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
	diagnostics: import('./contracts.js').BackendDiagnostic[];
	diskMayBePartiallyUpdated: true;
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
	diagnostics: import('./contracts.js').BackendDiagnostic[];
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
	diagnostics: import('./contracts.js').BackendDiagnostic[];
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
		diagnostics: import('./contracts.js').BackendDiagnostic[];
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
	| ApplyUamTransactionAppError;

export interface ApplySessionTransactionInput {
	sessionId: string;
	expectedRevision: number;
	operations: UamTransactionOperation[];
}

export interface OpenProjectSessionInput {
	project: UamProject;
	sessionId?: string;
	canonicalProjectPath?: string;
	canonicalPathKey?: string;
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
}

const BACKEND_METHODS = [
	'getCapabilities',
	'openSession',
	'openProjectSession',
	'getSession',
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
] as const;

const ARTIFACT_BRIDGE_CAPABILITY = {
	available: false,
	requiredHost: 'node',
	executionBoundary: 'external-bridge',
	bridgeEntrypoint: '@openfairygui/backend/node',
	reason: 'publish/restore require explicit Node-hosted filesystem and artifact execution.',
} as const satisfies BackendArtifactBridgeCapability;

function createCapabilities(): BackendCapabilities {
	return {
		contractVersion: BACKEND_CONTRACT_VERSION,
		capabilitySchemaVersion: BACKEND_CAPABILITY_SCHEMA_VERSION,
		transactionKernelOwner: '@openfairygui/core',
		appSeamOwner: '@openfairygui/functions',
		runtimeOwner: '@openfairygui/backend',
		methods: BACKEND_METHODS,
		read: {
			capabilitySnapshot: true,
			sessionSnapshot: true,
		},
		authoring: {
			applyTransaction: true,
			saveSession: true,
			resourceKinds: [...UAM_SUPPORTED_MATERIALIZATION_SCOPE.resourceKinds],
			nodeKinds: [...UAM_SUPPORTED_MATERIALIZATION_SCOPE.nodeKinds],
			gearKinds: [...UAM_SUPPORTED_MATERIALIZATION_SCOPE.gearKinds],
			transactionScope: {
				resourceKinds: [...UAM_SUPPORTED_TRANSACTION_SCOPE.resourceKinds],
				nodeKinds: [...UAM_SUPPORTED_TRANSACTION_SCOPE.nodeKinds],
				gearKinds: [...UAM_SUPPORTED_TRANSACTION_SCOPE.gearKinds],
			},
			unsupported: ['artifact.publish', 'artifact.restore'],
		},
		artifact: createArtifactCapabilities(),
		manifest: {
			browserSafe: true,
			rootEntrypoint: '@openfairygui/backend',
			nodeEntrypoint: '@openfairygui/backend/node',
			adapters: {
				fileSystem: {
					injected: true,
					requiredFor: ['openSession', 'saveSession', 'materializeSession'],
				},
				projectStorage: {
					injected: true,
					browserSafe: true,
					requiredFor: ['openProjectSession.writeback', 'saveSession', 'materializeSession'],
					adapterFactory: 'createBackendStorageFileSystem',
				},
				host: {
					injected: true,
					requiredFor: ['advisoryLockMetadata'],
				},
			},
			executionBoundaries: {
				projectSession: 'in-process-browser-safe',
				fileBackedSession: 'adapter-backed',
				artifactPublish: ARTIFACT_BRIDGE_CAPABILITY,
				artifactRestore: ARTIFACT_BRIDGE_CAPABILITY,
			},
			diagnostics: {
				stableCodes: true,
				errorDiagnosticMirror: true,
			},
		},
		compatibilityPolicy: BACKEND_COMPATIBILITY_POLICY,
		runtime: {
			sessionRuntime: true,
			advisoryLocking: true,
			coordinatedSave: true,
			atomicSave: false,
			staleRevisionProtection: true,
			pathPolicy: createRuntimePathPolicy(),
			events: {
				polling: true,
				subscriptions: false,
				retentionLimit: 1000,
				sequenceScope: 'runtime',
			},
			jobs: {
				inMemory: true,
				cooperativeCancel: true,
				persistent: false,
				supportedKinds: ['cache.refresh'],
				artifactJobs: false,
				completedRetentionLimit: 100,
			},
			cache: {
				derivedReadOnly: true,
				keyedBy: 'canonicalPathKey',
				sourceOfTruth: false,
				refreshMethod: 'refreshCache',
			},
		},
	};
}

export class BackendRuntime {
	private readonly fileSystem?: BackendFileSystem;
	private readonly capabilities: BackendCapabilities;
	private readonly sessions = new Map<string, BackendSessionState>();
	private readonly sessionsByPath = new Map<string, string>();
	private readonly eventsBySession = new Map<string, BackendEvent[]>();
	private readonly jobsBySession = new Map<string, BackendJobSnapshot[]>();
	private readonly cacheBySession = new Map<string, BackendCacheEntry>();
	private eventSequence = 0;
	private readonly context: BackendContext;
	private readonly readService: ReadService;
	private readonly runtimeService: RuntimeService;
	private readonly authoringService: AuthoringService;
	private readonly cacheService: CacheService;
	private readonly eventService: EventService;
	private readonly jobService: JobService;

	public constructor(options: BackendRuntimeOptions = {}) {
		this.fileSystem = options.fileSystem;
		this.capabilities = createCapabilities();
		this.context = {
			fileSystem: this.fileSystem,
			host: options.host,
			capabilities: this.capabilities,
			sessions: this.sessions,
			sessionsByPath: this.sessionsByPath,
			eventsBySession: this.eventsBySession,
			jobsBySession: this.jobsBySession,
			cacheBySession: this.cacheBySession,
			nextEventSequence: () => {
				this.eventSequence += 1;
				return this.eventSequence;
			},
		};
		this.readService = new ReadService(this.context);
		this.eventService = new EventService(this.context);
		this.cacheService = new CacheService(this.context);
		this.jobService = new JobService(this.context, this.cacheService, this.eventService);
		this.runtimeService = new RuntimeService(this.context, this.cacheService, this.eventService, this.jobService);
		this.authoringService = new AuthoringService(this.context, this.cacheService, this.eventService);
	}

	public getCapabilities(): BackendSuccess<BackendCapabilities> {
		return this.readService.getCapabilities() as BackendSuccess<BackendCapabilities>;
	}

	public async openSession(input: {
		projectPath: string;
	}): Promise<
		BackendResult<
			BackendSessionSnapshot,
			InProcessLockConflictError | AdvisoryLockConflictError | BackendCapabilityUnavailableError
		>
	> {
		return this.runtimeService.openSession(input);
	}

	public openProjectSession(input: OpenProjectSessionInput): BackendResult<BackendSessionSnapshot> {
		return this.runtimeService.openProjectSession(input);
	}

	public getSession(input: { sessionId: string }): BackendResult<BackendSessionSnapshot, SessionNotFoundError> {
		return this.readService.getSession(input);
	}

	public async applyTransaction(
		input: ApplySessionTransactionInput,
	): Promise<
		BackendResult<
			BackendSessionSnapshot,
			SessionNotFoundError | SessionStaleWriteError | ApplyUamTransactionAppError
		>
	> {
		return this.authoringService.applyTransaction(input);
	}

	public async saveSession(
		input: SaveSessionInput,
	): Promise<
		BackendResult<
			BackendSessionSnapshot | MaterializeSessionSnapshot,
			| SessionNotFoundError
			| SessionStaleWriteError
			| SavePartialFailureError
			| UamFidelityUnsupportedError
			| MaterializeValidationFailedError
			| MaterializeWriteFailedError
			| PathPolicyViolationError
			| InProcessLockConflictError
			| BackendCapabilityUnavailableError
		>
	> {
		return this.authoringService.saveSession(input);
	}

	public async materializeSession(
		input: MaterializeSessionInput,
	): Promise<
		BackendResult<
			MaterializeSessionSnapshot,
			| SessionNotFoundError
			| SessionStaleWriteError
			| UamFidelityUnsupportedError
			| MaterializeValidationFailedError
			| MaterializeWriteFailedError
			| PathPolicyViolationError
			| InProcessLockConflictError
			| BackendCapabilityUnavailableError
		>
	> {
		return this.authoringService.materializeSession(input);
	}

	public async closeSession(input: {
		sessionId: string;
	}): Promise<BackendResult<{ sessionId: string; closed: true }, SessionNotFoundError>> {
		return this.runtimeService.closeSession(input);
	}

	public getEvents(
		input: GetEventsInput,
	): BackendResult<GetEventsSnapshot, SessionNotFoundError | EventCursorInvalidError> {
		return this.eventService.getEvents(input);
	}

	public getJob(
		input: GetJobInput,
	): BackendResult<BackendJobSnapshot, SessionNotFoundError | BackendJobNotFoundError> {
		return this.jobService.getJob(input);
	}

	public listJobs(input: ListJobsInput): BackendResult<BackendJobListSnapshot, SessionNotFoundError> {
		return this.jobService.listJobs(input);
	}

	public cancelJob(
		input: CancelJobInput,
	): BackendResult<
		BackendJobSnapshot,
		SessionNotFoundError | BackendJobNotFoundError | BackendJobNotCancellableError
	> {
		return this.jobService.cancelJob(input);
	}

	public getCacheSnapshot(input: GetCacheSnapshotInput): BackendResult<BackendCacheSnapshot, SessionNotFoundError> {
		return this.cacheService.getCacheSnapshot(input);
	}

	public refreshCache(input: RefreshCacheInput): BackendResult<BackendJobSnapshot, SessionNotFoundError> {
		return this.jobService.refreshCache(input);
	}
}
