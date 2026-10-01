import type { InProcessLockConflictError, SessionLimitExceededError } from '../runtime/contracts.js';
import type { BackendSessionState } from './context.js';

type SessionTarget = Pick<BackendSessionState, 'canonicalPathKey' | 'canonicalProjectPath'> &
	Partial<Pick<BackendSessionState, 'fileSystem' | 'fairyPath' | 'lockFilePath'>>;

interface PathReservation {
	commit(session: BackendSessionState): void;
	release(): void;
}

/** Owns live sessions and path claims, including claims made before asynchronous I/O. */
export class SessionRegistry {
	private readonly sessions = new Map<string, BackendSessionState>();
	private readonly paths = new Map<string, { sessionId: string }>();
	private readonly opening = new Set<string>();

	private readonly idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private readonly activity = new Map<string, number>();
	private activitySequence = 0;

	public constructor(
		private readonly maxSessions: number,
		private readonly idleTimeoutMs = 0,
		private readonly onIdle?: (sessionId: string, activity: number) => Promise<void>,
	) {}

	public isIdle(sessionId: string, activity: number): boolean {
		return this.activity.get(sessionId) === activity;
	}

	public peek(sessionId: string): BackendSessionState | undefined {
		return this.sessions.get(sessionId);
	}

	public touch(sessionId: string): void {
		if (!this.sessions.has(sessionId) || !this.idleTimeoutMs) return;
		clearTimeout(this.idleTimers.get(sessionId));
		const activity = ++this.activitySequence;
		this.activity.set(sessionId, activity);
		const timer = setTimeout(() => {
			this.idleTimers.delete(sessionId);
			void this.onIdle?.(sessionId, activity).catch(() => this.touch(sessionId));
		}, this.idleTimeoutMs);
		// Browser timers are numeric; Node timers must not keep a finished CLI process alive.
		if (typeof timer === 'object' && 'unref' in timer) timer.unref();
		this.idleTimers.set(sessionId, timer);
	}

	/** Check immediately before reserve, in the same synchronous step, so concurrent opens cannot overshoot. */
	public checkCapacity(): SessionLimitExceededError | null {
		if (this.sessions.size + this.opening.size < this.maxSessions) return null;
		return {
			code: 'session_limit_exceeded',
			message: `This backend runtime already has ${this.maxSessions} open sessions. Close sessions that are no longer needed.`,
			maxSessions: this.maxSessions,
		};
	}

	public get(sessionId: string): BackendSessionState | undefined {
		this.touch(sessionId);
		return this.sessions.get(sessionId);
	}

	public has(sessionId: string): boolean {
		return this.sessions.has(sessionId) || this.opening.has(sessionId);
	}

	public reserve(sessionId: string, target: SessionTarget): PathReservation | InProcessLockConflictError {
		const key = target.canonicalPathKey;
		const previous = this.paths.get(key);
		if (previous && previous.sessionId !== sessionId) {
			return {
				code: 'lock_conflict',
				kind: 'in_process_session_exists',
				message: `Project is already open in this backend runtime: ${target.canonicalProjectPath}`,
				canonicalPathKey: key,
				holderSessionId: previous.sessionId,
				lockFilePath: target.lockFilePath,
			};
		}
		const claim = previous ?? { sessionId };
		this.paths.set(key, claim);
		if (!this.sessions.has(sessionId)) this.opening.add(sessionId);
		let committed = false;
		return {
			commit: (session) => {
				if (session.sessionId !== sessionId || this.paths.get(key) !== claim)
					throw new Error('Session path reservation lost.');
				if (session.canonicalPathKey !== key) this.releasePath(session.canonicalPathKey, sessionId);
				Object.assign(session, target);
				this.sessions.set(sessionId, session);
				this.touch(sessionId);
				this.opening.delete(sessionId);
				committed = true;
			},
			release: () => {
				if (committed) return;
				if (!previous && this.paths.get(key) === claim) this.paths.delete(key);
				this.opening.delete(sessionId);
			},
		};
	}

	public remove(session: BackendSessionState): void {
		if (this.sessions.get(session.sessionId) !== session) return;
		this.sessions.delete(session.sessionId);
		clearTimeout(this.idleTimers.get(session.sessionId));
		this.idleTimers.delete(session.sessionId);
		this.activity.delete(session.sessionId);
		this.releasePath(session.canonicalPathKey, session.sessionId);
	}

	private releasePath(key: string, sessionId: string): void {
		if (this.paths.get(key)?.sessionId === sessionId) this.paths.delete(key);
	}
}
