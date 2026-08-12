import type { ApplyUamTransactionAppError } from '@openfairygui/functions/uam';
import type { ProjectValidationReport } from '@openfairygui/core';
import type { PathPolicyViolationError } from './path-policy.js';
import { AuthoringService } from './services/authoring-service.js';
import { CacheService } from './services/cache-service.js';
import type { BackendContext, BackendSessionState } from './services/context.js';
import { EventService } from './services/event-service.js';
import { JobService } from './services/job-service.js';
import { ReadService } from './services/read-service.js';
import { RuntimeService } from './services/runtime-service.js';
import { createCapabilities } from './runtime/capabilities.js';
import type {
	AdvisoryLockConflictError,
	ApplySessionTransactionInput,
	BackendCacheEntry,
	BackendCacheSnapshot,
	BackendCapabilities,
	BackendCapabilityUnavailableError,
	BackendEvent,
	BackendFileSystem,
	BackendJobListSnapshot,
	BackendJobNotCancellableError,
	BackendJobNotFoundError,
	BackendJobSnapshot,
	BackendProjectOutline,
	BackendResult,
	BackendRuntimeOptions,
	BackendSessionSnapshot,
	BackendSuccess,
	CancelJobInput,
	EventCursorInvalidError,
	GetCacheSnapshotInput,
	GetEventsInput,
	GetEventsSnapshot,
	GetJobInput,
	GetProjectOutlineInput,
	ValidateSessionInput,
	InProcessLockConflictError,
	ListJobsInput,
	MaterializeSessionInput,
	MaterializeSessionSnapshot,
	MaterializeValidationFailedError,
	MaterializeWriteFailedError,
	OpenProjectSessionInput,
	RefreshCacheInput,
	SavePartialFailureError,
	SaveSessionInput,
	SessionNotFoundError,
	SessionStaleWriteError,
	UamFidelityUnsupportedError,
} from './runtime/contracts.js';

export * from './runtime/contracts.js';

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

	public getProjectOutline(
		input: GetProjectOutlineInput,
	): BackendResult<BackendProjectOutline, SessionNotFoundError> {
		return this.readService.getProjectOutline(input);
	}

	public validateSession(
		input: ValidateSessionInput,
	): BackendResult<ProjectValidationReport, SessionNotFoundError> {
		return this.readService.validateSession(input);
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
		return this.authoringService.runSessionExclusive(input.sessionId, () => this.runtimeService.closeSession(input));
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
