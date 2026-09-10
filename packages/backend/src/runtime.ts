import type { ApplyUamTransactionAppError } from '@openfairygui/functions/uam';
import type { ProjectValidationReport } from '@openfairygui/core';
import type { PathPolicyViolationError } from './path-policy.js';
import { AuthoringService } from './services/authoring-service.js';
import { PersistenceService } from './services/persistence-service.js';
import { CacheService } from './services/cache-service.js';
import { type BackendContext, failure, readView } from './services/context.js';
import { SessionRegistry } from './services/session-registry.js';
import { SessionOperationQueue } from './services/session-operation-queue.js';
import { EventService } from './services/event-service.js';
import { ReadService } from './services/read-service.js';
import { RuntimeService } from './services/runtime-service.js';
import { createCapabilities } from './runtime/capabilities.js';
import type {
	AdvisoryLockConflictError,
	ApplySessionTransactionInput,
	BackendCacheSnapshot,
	BackendCapabilities,
	BackendCapabilityUnavailableError,
	BackendFileSystem,
	BackendProjectOutline,
	BackendResult,
	BackendRuntimeOptions,
	BackendSessionSnapshot,
	BackendSuccess,
	BackendTransactionPreview,
	EventCursorInvalidError,
	GetCacheSnapshotInput,
	GetEventsInput,
	GetEventsSnapshot,
	GetProjectOutlineInput,
	QueryEntityInput,
	BackendEntitySnapshot,
	EntityQueryError,
	ReadSessionStateInput,
	ReadResourceBytesInput,
	BackendSessionStateSnapshot,
	BackendResourceBytesSnapshot,
	SessionReadError,
	SessionStaleReadError,
	ValidateSessionInput,
	InProcessLockConflictError,
	MaterializeSessionInput,
	MaterializeSessionSnapshot,
	MaterializeValidationFailedError,
	MaterializeWriteFailedError,
	OpenProjectSessionInput,
	ProjectOpenFailedError,
	ProjectRootNotAllowedError,
	RefreshCacheInput,
	SavePartialFailureError,
	SaveSessionInput,
	SessionIdConflictError,
	SessionNotFoundError,
	SessionCloseFailedError,
	SessionStaleWriteError,
	TransactionPreviewError,
	UamFidelityUnsupportedError,
} from './runtime/contracts.js';

export * from './runtime/contracts.js';

export class BackendRuntime {
	private readonly fileSystem?: BackendFileSystem;
	private readonly capabilities: BackendCapabilities;
	private readonly sessions = new SessionRegistry();
	private readonly sessionOperations = new SessionOperationQueue();
	private readonly context: BackendContext;
	private readonly readService: ReadService;
	private readonly runtimeService: RuntimeService;
	private readonly authoringService: AuthoringService;
	private readonly persistenceService: PersistenceService;
	private readonly cacheService: CacheService;
	private readonly eventService: EventService;

	public constructor(options: BackendRuntimeOptions = {}) {
		this.fileSystem = options.fileSystem;
		this.capabilities = createCapabilities(Boolean(options.fileSystem?.runProjectWriteTransaction));
		this.context = {
			fileSystem: this.fileSystem,
			host: options.host,
			allowedProjectRoots: options.allowedProjectRoots,
			capabilities: this.capabilities,
			sessions: this.sessions,
		};
		const getSession = (sessionId: string) => this.sessions.get(sessionId);
		this.readService = new ReadService((sessionId) => readView(getSession(sessionId)), this.capabilities);
		this.eventService = new EventService(getSession);
		this.cacheService = new CacheService(getSession, this.eventService);
		this.runtimeService = new RuntimeService(this.context, this.cacheService, this.eventService);
		this.authoringService = new AuthoringService(this.context, this.cacheService, this.eventService, this.sessionOperations);
		this.persistenceService = new PersistenceService(this.context, this.cacheService, this.eventService, this.sessionOperations);
	}

	public getCapabilities(): BackendSuccess<BackendCapabilities> {
		return this.readService.getCapabilities() as BackendSuccess<BackendCapabilities>;
	}

	public async openSession(input: {
		projectPath: string;
	}): Promise<
		BackendResult<
			BackendSessionSnapshot,
			InProcessLockConflictError
			| AdvisoryLockConflictError
			| BackendCapabilityUnavailableError
			| ProjectRootNotAllowedError
			| ProjectOpenFailedError
		>
	> {
		const startedAt = Date.now();
		try {
			return await this.runtimeService.openSession(input);
		} catch {
			return failure('runtime', startedAt, {
				code: 'project_open_failed',
				message: 'Unable to open project.',
				projectPath: input.projectPath,
			});
		}
	}

	public openProjectSession(
		input: OpenProjectSessionInput,
	): BackendResult<BackendSessionSnapshot, InProcessLockConflictError | SessionIdConflictError> {
		return this.runtimeService.openProjectSession(input);
	}

	public getSession(input: { sessionId: string }): BackendResult<BackendSessionSnapshot, SessionNotFoundError> {
		return this.readService.getSession(input);
	}

	public getProjectOutline(
		input: GetProjectOutlineInput,
	): BackendResult<BackendProjectOutline, SessionNotFoundError> {
		return this.readService.getProjectOutline(input);
	}

	public queryEntity(input: QueryEntityInput): BackendResult<BackendEntitySnapshot, SessionNotFoundError | EntityQueryError> {
		return this.readService.queryEntity(input);
	}

	public readSessionState(input: ReadSessionStateInput): BackendResult<BackendSessionStateSnapshot, SessionNotFoundError | SessionReadError | SessionStaleReadError> {
		return this.readService.readSessionState(input);
	}

	public readResourceBytes(input: ReadResourceBytesInput): BackendResult<BackendResourceBytesSnapshot, SessionNotFoundError | SessionReadError | SessionStaleReadError> {
		return this.readService.readResourceBytes(input);
	}

	public validateSession(
		input: ValidateSessionInput,
	): BackendResult<ProjectValidationReport, SessionNotFoundError> {
		return this.readService.validateSession(input);
	}

	public async preflightTransaction(
		input: ApplySessionTransactionInput,
	): Promise<BackendResult<BackendTransactionPreview, SessionNotFoundError | SessionStaleWriteError | ApplyUamTransactionAppError | TransactionPreviewError>> {
		return this.authoringService.preflightTransaction(input);
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
		return this.persistenceService.saveSession(input);
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
		return this.persistenceService.materializeSession(input);
	}

	public async closeSession(input: {
		sessionId: string;
	}): Promise<BackendResult<{ sessionId: string; closed: true }, SessionNotFoundError | SessionCloseFailedError>> {
		const captured = { ...input };
		return this.sessionOperations.run(captured.sessionId, () => this.runtimeService.closeSession(captured));
	}

	public getEvents(
		input: GetEventsInput,
	): BackendResult<GetEventsSnapshot, SessionNotFoundError | EventCursorInvalidError> {
		return this.eventService.getEvents(input);
	}

	public getCacheSnapshot(input: GetCacheSnapshotInput): BackendResult<BackendCacheSnapshot, SessionNotFoundError> {
		return this.cacheService.getCacheSnapshot(input);
	}

	public refreshCache(input: RefreshCacheInput): BackendResult<BackendCacheSnapshot, SessionNotFoundError> {
		return this.cacheService.refreshCache(input);
	}
}
