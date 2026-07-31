import { failure, success, type BackendContext } from './context.js';
import type { CacheService } from './cache-service.js';
import type { EventService } from './event-service.js';
import { createSessionNotFoundError } from './session-utils.js';
import type {
	BackendJobListSnapshot,
	BackendJobNotCancellableError,
	BackendJobNotFoundError,
	BackendJobSnapshot,
	BackendJobStatus,
	BackendResult,
	CancelJobInput,
	GetJobInput,
	ListJobsInput,
	RefreshCacheInput,
	SessionNotFoundError,
} from '../runtime.js';

const COMPLETED_JOB_RETENTION_LIMIT = 100;
const REFRESH_START_DELAY_MS = 0;
const REFRESH_COMPLETE_DELAY_MS = 50;

function isTerminal(status: BackendJobStatus): boolean {
	return status === 'completed' || status === 'failed' || status === 'cancelled';
}

export class JobService {
	public constructor(
		private readonly context: BackendContext,
		private readonly cacheService: CacheService,
		private readonly eventService: EventService,
	) {}
	private readonly cancellationRequests = new Set<string>();

	private getJobs(sessionId: string): BackendJobSnapshot[] {
		return this.context.jobsBySession.get(sessionId) ?? [];
	}

	private setJobs(sessionId: string, jobs: BackendJobSnapshot[]): void {
		const retained: BackendJobSnapshot[] = [];
		let terminalCount = 0;
		for (let index = jobs.length - 1; index >= 0; index -= 1) {
			const job = jobs[index];
			if (isTerminal(job.status)) {
				if (terminalCount >= COMPLETED_JOB_RETENTION_LIMIT) continue;
				terminalCount += 1;
			}
			retained.push(job);
		}
		this.context.jobsBySession.set(sessionId, retained.reverse());
	}

	public refreshCache(input: RefreshCacheInput): BackendResult<BackendJobSnapshot, SessionNotFoundError> {
		const startedAt = Date.now();
		const session = this.context.sessions.get(input.sessionId);
		if (!session || session.closed) {
			return failure('runtime', startedAt, createSessionNotFoundError(input.sessionId));
		}
		const jobId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
		const createdAt = new Date().toISOString();
		const job: BackendJobSnapshot = {
			jobId,
			kind: 'cache.refresh',
			status: 'queued',
			createdAt,
			sessionId: session.sessionId,
			canonicalPathKey: session.canonicalPathKey,
			revision: session.revision,
			diagnostics: [],
			progress: { completed: 0, total: 1, message: input.reason ?? 'manual' },
		};
		const jobs = this.getJobs(session.sessionId);
		jobs.push(job);
		this.setJobs(session.sessionId, jobs);
		this.eventService.emit({ kind: 'job.created', sessionId: session.sessionId, canonicalPathKey: session.canonicalPathKey, revision: session.revision, jobId });
		this.scheduleRefreshJob(session.sessionId, jobId);

		return success('runtime', startedAt, structuredClone(job), { sessionId: session.sessionId, revision: session.revision });
	}

	public getJob(input: GetJobInput): BackendResult<BackendJobSnapshot, SessionNotFoundError | BackendJobNotFoundError> {
		const startedAt = Date.now();
		const session = this.context.sessions.get(input.sessionId);
		if (!session || session.closed) return failure('runtime', startedAt, createSessionNotFoundError(input.sessionId));
		const job = this.getJobs(input.sessionId).find((item) => item.jobId === input.jobId);
		if (!job) {
			return failure('runtime', startedAt, {
				code: 'job_not_found',
				message: `Job was not found: ${input.jobId}`,
				sessionId: input.sessionId,
				jobId: input.jobId,
			}, undefined, { sessionId: session.sessionId, revision: session.revision });
		}
		return success('runtime', startedAt, structuredClone(job), { sessionId: session.sessionId, revision: session.revision });
	}

	public listJobs(input: ListJobsInput): BackendResult<BackendJobListSnapshot, SessionNotFoundError> {
		const startedAt = Date.now();
		const session = this.context.sessions.get(input.sessionId);
		if (!session || session.closed) return failure('runtime', startedAt, createSessionNotFoundError(input.sessionId));
		let jobs = [...this.getJobs(input.sessionId)];
		if (input.kind) jobs = jobs.filter((job) => job.kind === input.kind);
		if (input.status) {
			if (input.status === 'active') jobs = jobs.filter((job) => !isTerminal(job.status));
			else if (input.status === 'terminal') jobs = jobs.filter((job) => isTerminal(job.status));
			else jobs = jobs.filter((job) => job.status === input.status);
		}
		if (input.limit !== undefined) jobs = jobs.slice(0, Math.max(0, input.limit));
		return success('runtime', startedAt, { jobs: jobs.map((job) => structuredClone(job)) }, { sessionId: session.sessionId, revision: session.revision });
	}

	public cancelJob(input: CancelJobInput): BackendResult<BackendJobSnapshot, SessionNotFoundError | BackendJobNotFoundError | BackendJobNotCancellableError> {
		const startedAt = Date.now();
		const session = this.context.sessions.get(input.sessionId);
		if (!session || session.closed) return failure('runtime', startedAt, createSessionNotFoundError(input.sessionId));
		const job = this.getJobs(input.sessionId).find((item) => item.jobId === input.jobId);
		if (!job) {
			return failure('runtime', startedAt, {
				code: 'job_not_found',
				message: `Job was not found: ${input.jobId}`,
				sessionId: input.sessionId,
				jobId: input.jobId,
			}, undefined, { sessionId: session.sessionId, revision: session.revision });
		}
		if (isTerminal(job.status)) {
			return failure('runtime', startedAt, {
				code: 'job_not_cancellable',
				message: `Job is already terminal: ${input.jobId}`,
				sessionId: input.sessionId,
				jobId: input.jobId,
				status: job.status as 'completed' | 'failed' | 'cancelled',
			}, undefined, { sessionId: session.sessionId, revision: session.revision });
		}
		this.cancellationRequests.add(job.jobId);
		this.eventService.emit({ kind: 'job.cancelRequested', sessionId: input.sessionId, canonicalPathKey: session.canonicalPathKey, revision: session.revision, jobId: job.jobId });
		const cancelled = this.cancelRefreshJob(session.sessionId, job);
		return success('runtime', startedAt, structuredClone(cancelled), { sessionId: session.sessionId, revision: session.revision });
	}

	public removeSession(sessionId: string): void {
		for (const job of this.getJobs(sessionId)) this.cancellationRequests.delete(job.jobId);
		this.context.jobsBySession.delete(sessionId);
	}

	private replaceJob(sessionId: string, nextJob: BackendJobSnapshot): void {
		const jobs = this.getJobs(sessionId).map((job) => job.jobId === nextJob.jobId ? nextJob : job);
		this.setJobs(sessionId, jobs);
	}

	private scheduleRefreshJob(sessionId: string, jobId: string): void {
		setTimeout(() => this.startRefreshJob(sessionId, jobId), REFRESH_START_DELAY_MS);
	}

	private startRefreshJob(sessionId: string, jobId: string): void {
		const session = this.context.sessions.get(sessionId);
		if (!session || session.closed) return;
		const job = this.getJobs(sessionId).find((item) => item.jobId === jobId);
		if (!job || isTerminal(job.status)) return;
		if (this.cancellationRequests.has(jobId)) {
			this.cancelRefreshJob(sessionId, job);
			return;
		}
		const running: BackendJobSnapshot = {
			...job,
			status: 'running',
			startedAt: new Date().toISOString(),
			progress: { completed: 0, total: 1, message: 'refreshing cache' },
		};
		this.replaceJob(sessionId, running);
		this.eventService.emit({ kind: 'job.started', sessionId, canonicalPathKey: session.canonicalPathKey, revision: session.revision, jobId });
		this.eventService.emit({ kind: 'job.progress', sessionId, canonicalPathKey: session.canonicalPathKey, revision: session.revision, jobId, payload: running.progress });
		setTimeout(() => this.completeRefreshJob(sessionId, jobId), REFRESH_COMPLETE_DELAY_MS);
	}

	private completeRefreshJob(sessionId: string, jobId: string): void {
		const session = this.context.sessions.get(sessionId);
		if (!session || session.closed) return;
		const job = this.getJobs(sessionId).find((item) => item.jobId === jobId);
		if (!job || isTerminal(job.status)) return;
		if (this.cancellationRequests.has(jobId)) {
			this.cancelRefreshJob(sessionId, job);
			return;
		}
		try {
			const entry = this.cacheService.refreshSession(session);
			const completed: BackendJobSnapshot = {
				...job,
				status: 'completed',
				finishedAt: new Date().toISOString(),
				cacheRevision: entry.revision,
				progress: { completed: 1, total: 1, message: 'cache refreshed' },
				result: { cacheRevision: entry.revision },
			};
			this.replaceJob(sessionId, completed);
			this.eventService.emit({ kind: 'job.completed', sessionId, canonicalPathKey: session.canonicalPathKey, revision: session.revision, cacheRevision: entry.revision, jobId });
			this.eventService.emit({ kind: 'cache.updated', sessionId, canonicalPathKey: session.canonicalPathKey, revision: session.revision, cacheRevision: entry.revision });
		} catch (error) {
			const failed: BackendJobSnapshot = {
				...job,
				status: 'failed',
				finishedAt: new Date().toISOString(),
				error: {
					code: 'cache_refresh_failed',
					message: error instanceof Error ? error.message : 'Cache refresh failed',
					sessionId,
					jobId,
				},
			};
			this.replaceJob(sessionId, failed);
			this.eventService.emit({ kind: 'job.failed', sessionId, canonicalPathKey: session.canonicalPathKey, revision: session.revision, jobId, diagnostics: failed.diagnostics });
		}
	}

	private cancelRefreshJob(sessionId: string, job: BackendJobSnapshot): BackendJobSnapshot {
		const session = this.context.sessions.get(sessionId);
		const cancelled: BackendJobSnapshot = {
			...job,
			status: 'cancelled',
			finishedAt: new Date().toISOString(),
			error: {
				code: 'job_cancelled',
				message: `Job was cancelled: ${job.jobId}`,
				sessionId,
				jobId: job.jobId,
			},
		};
		this.replaceJob(sessionId, cancelled);
		this.cancellationRequests.delete(job.jobId);
		this.eventService.emit({
			kind: 'job.cancelled',
			sessionId,
			canonicalPathKey: session?.canonicalPathKey ?? job.canonicalPathKey,
			revision: session?.revision ?? job.revision,
			jobId: job.jobId,
		});
		return cancelled;
	}
}
