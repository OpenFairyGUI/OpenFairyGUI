import type {
	UamDisplayNodeKind,
	UamDisplayNode,
	UamDisplayNodeSelector,
	UamComponentModel,
	UamComponentSelector,
	UamControllerModel,
	UamControllerSelector,
	UamTransitionModel,
	UamTransitionSelector,
	UamResourceSelector,
	UamImageResource,
	UamMovieClipResource,
	UamGenericAssetResource,
	UamComponentResource,
	UamProject,
	UamPackage,
	UamPackageSettings,
	UamPackageSelector,
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
import type { BACKEND_METHODS } from './capabilities.js';
import type { BackendRuntime } from '../runtime.js';

export type BackendMethodName = keyof BackendRuntime;

export const BACKEND_ENTITY_QUERY_LIMITS = { maxBytes: 262144, maxDepth: 32, maxNodes: 100000 } as const;
export const BACKEND_SESSION_READ_LIMITS = {
	model: { maxBytes: 4194304, maxDepth: 64, maxNodes: 500000 },
	resourceBytes: 1048576,
} as const;

/** The public UAM model, excluding only each asset resource's primary sourceBytes. */
export type BackendSessionResourceModel = UamComponentResource | Omit<UamImageResource, 'sourceBytes'>
	| Omit<UamMovieClipResource, 'sourceBytes'> | Omit<UamGenericAssetResource, 'sourceBytes'>;
export interface BackendSessionPackageModel extends Omit<UamPackage, 'resources'> {
	resources: BackendSessionResourceModel[];
}
export interface BackendSessionProjectModel extends Omit<UamProject, 'packages'> {
	packages: BackendSessionPackageModel[];
}
export interface ReadSessionStateInput {
	sessionId: string;
	expectedRevision?: number;
}
export interface ReadResourceBytesInput {
	sessionId: string;
	expectedRevision: number;
	selector: UamResourceSelector;
}
export interface BackendSessionStateSnapshot extends Pick<BackendSessionSnapshot, 'sessionId' | 'revision' | 'lastSavedRevision' | 'dirty' | 'uamFidelity'> {
	project: BackendSessionProjectModel;
	readDiagnostics: import('@openfairygui/core').ProjectDiagnostic[];
	/** Source-read completeness, not a guarantee of resource bytes or downstream usability. */
	readComplete: boolean;
}
export interface BackendResourceBytesSnapshot {
	sessionId: string;
	revision: number;
	selector: UamResourceSelector;
	/** Only primary bytes already held in this session; no filesystem hydration. */
	sourceBytes: Uint8Array;
}
export interface SessionReadError {
	code: 'session_read_failed';
	message: string;
	sessionId: string;
	reason: 'invalid_query' | 'not_found' | 'ambiguous' | 'unsupported_resource' | 'bytes_unavailable' | 'response_budget_exceeded' | 'non_json_value';
}
export interface SessionStaleReadError {
	code: 'stale_read';
	message: string;
	sessionId: string;
	expectedRevision: number;
	actualRevision: number;
}
export const BACKEND_TRANSACTION_PREVIEW_LIMITS = { maxBytes: 262144, maxEntries: 2000 } as const;
/** Fixed resource projection. Binary content, source bookkeeping and arbitrary metadata are excluded. */
export const BACKEND_RESOURCE_QUERY_FIELDS = [
	'kind', 'id', 'name', 'path', 'exported', 'favorite', 'branch', 'branchItemIds',
	'fileName', 'file', 'dimensions', 'image', 'movieClip',
] as const;
type ResourceQueryFields<T> = Pick<T, Extract<keyof T, typeof BACKEND_RESOURCE_QUERY_FIELDS[number]>>;
export type BackendResourceSnapshot = ResourceQueryFields<UamImageResource> | ResourceQueryFields<UamMovieClipResource>
	| ResourceQueryFields<UamGenericAssetResource> | ResourceQueryFields<UamComponentResource>;
export type BackendComponentSnapshot = Pick<UamComponentModel, 'size' | 'properties' | 'customData'>;
export type BackendProjectSnapshot = Pick<UamProject, 'projectId' | 'settings'>;
export interface BackendPackageSnapshot {
	id: string;
	name: string;
	settings: UamPackageSettings;
}
export type BackendEntityTarget =
	| { kind: 'project' }
	| { kind: 'package'; selector: UamPackageSelector }
	| { kind: 'resource'; selector: UamResourceSelector }
	| { kind: 'component'; selector: UamComponentSelector }
	| { kind: 'displayNode'; selector: UamDisplayNodeSelector }
	| { kind: 'controller'; selector: UamControllerSelector }
	| { kind: 'transition'; selector: UamTransitionSelector };
export interface QueryEntityInput {
	sessionId: string;
	target: BackendEntityTarget;
}
export interface BackendEntitySnapshot {
	sessionId: string;
	revision: number;
	target: BackendEntityTarget;
	entity: { kind: 'project'; properties: BackendProjectSnapshot }
		| { kind: 'package'; properties: BackendPackageSnapshot }
		| { kind: 'resource'; properties: BackendResourceSnapshot }
		| { kind: 'component'; properties: BackendComponentSnapshot }
		| { kind: 'displayNode'; properties: UamDisplayNode }
		| { kind: 'controller'; properties: UamControllerModel }
		| { kind: 'transition'; properties: UamTransitionModel };
}
export interface EntityQueryError {
	code: 'entity_query_failed';
	message: string;
	sessionId: string;
	reason: 'invalid_query' | 'not_found' | 'ambiguous' | 'response_budget_exceeded' | 'non_json_value';
}

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
	/** Optional host validation before a project is read. Node rejects links anywhere in the project tree. */
	validateProjectRoot?(projectRoot: string): Promise<void>;
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
		recoveryGuides: 'all-formal-codes';
		automaticRepair: false;
	};
}

export interface BackendCapabilities {
	contractVersion: typeof BACKEND_CONTRACT_VERSION;
	capabilitySchemaVersion: typeof BACKEND_CAPABILITY_SCHEMA_VERSION;
	transactionKernelOwner: '@openfairygui/core';
	appSeamOwner: '@openfairygui/functions';
	runtimeOwner: '@openfairygui/backend';
	methods: typeof BACKEND_METHODS;
	read: {
		capabilitySnapshot: true;
		sessionSnapshot: true;
		projectOutline: true;
		entityQuery: { kinds: readonly BackendEntityTarget['kind'][]; projection: 'properties'; sourceBytes: false; limits: typeof BACKEND_ENTITY_QUERY_LIMITS };
		sessionState: { sourceBytes: false; limits: typeof BACKEND_SESSION_READ_LIMITS.model };
		resourceBytes: { expectedRevisionRequired: true; hydration: false; maxBytes: typeof BACKEND_SESSION_READ_LIMITS.resourceBytes };
		projectValidation: true;
	};
	authoring: {
		preflightTransaction: { mode: 'execute-and-discard'; reservesRevision: false; impact: 'model-diff'; limits: typeof BACKEND_TRANSACTION_PREVIEW_LIMITS };
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
		cache: {
			derivedReadOnly: true;
			keyedBy: 'sessionId';
			refreshMode: 'synchronous';
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
	| 'cache.updated';

export interface BackendEvent {
	sequence: number;
	kind: BackendEventKind;
	timestamp: string;
	sessionId?: string;
	canonicalPathKey?: string;
	revision?: number;
	cacheRevision?: number;
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

export interface BackendCapabilityUnavailableError {
	code: 'capability_unavailable';
	message: string;
	capability: 'fileSystem' | 'artifact.publish' | 'artifact.restore';
	requiredAdapter?: 'BackendFileSystem';
	requiredHost?: 'node';
	bridgeBoundary?: 'external-bridge';
}

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
	| TransactionPreviewError
	| EntityQueryError
	| SessionReadError
	| SessionStaleReadError
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

export interface BackendTransactionPreview {
	sessionId: string;
	baseRevision: number;
	/** Revision after applying this batch at baseRevision, including an empty batch. Not reserved. */
	projectedRevision: number;
	mode: 'execute-and-discard';
	/** Complete, bounded comparison of current and projected UAM, not unsaved changes since last save. */
	impact: {
		entities: BackendTransactionEntityChange[];
		/** Project-relative paths from the actual ProjectWriter, including empty directories. Not a disk write plan. */
		files: Array<{ path: string; kind: 'file' | 'directory'; change: 'added' | 'removed' | 'updated' }>;
	};
	persistence: {
		requiredAfterApply: true;
		nextAction: 'saveSession' | 'materializeSession' | 'host-action';
		fileSystemAvailable: boolean;
		uamFidelity: BackendSessionSnapshot['uamFidelity'];
		/** Preflight never verifies filesystem permissions, materialize destinations or actual disk state. */
		writeVerified: false;
	};
}

export interface BackendTransactionEntityChange {
	target: BackendEntityTarget;
	change: 'added' | 'removed' | 'updated';
	/** Changed top-level property names; child collections contain identities and preserve their order. */
	fields: string[];
}

export interface TransactionPreviewError {
	code: 'transaction_preview_failed';
	message: string;
	sessionId: string;
	reason: 'response_budget_exceeded' | 'projection_failed';
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
	/** Session identity only; without explicit storage or a per-call filesystem this grants no filesystem access. */
	canonicalProjectPath?: string;
	/** Host-defined session identity; not a filesystem authorization or an allowed-root override. */
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
