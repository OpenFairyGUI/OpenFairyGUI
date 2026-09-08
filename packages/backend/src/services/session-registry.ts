import type { InProcessLockConflictError } from '../runtime/contracts.js';
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

	public get(sessionId: string): BackendSessionState | undefined {
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
		this.releasePath(session.canonicalPathKey, session.sessionId);
	}

	private releasePath(key: string, sessionId: string): void {
		if (this.paths.get(key)?.sessionId === sessionId) this.paths.delete(key);
	}
}
