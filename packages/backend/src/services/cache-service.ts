import { failure, success, type BackendContext, type BackendSessionState } from './context.js';
import { createSessionNotFoundError } from './session-utils.js';
import type {
	BackendCacheEntry,
	BackendCacheSnapshot,
	BackendResult,
	GetCacheSnapshotInput,
	SessionNotFoundError,
} from '../runtime.js';

function createCacheEntry(session: BackendSessionState, valid: boolean): BackendCacheEntry {
	return {
		canonicalPathKey: session.canonicalPathKey,
		sessionId: session.sessionId,
		revision: session.revision,
		lastSavedRevision: session.lastSavedRevision,
		dirty: session.dirty,
		valid,
		indexedAt: new Date().toISOString(),
		summary: {
			packageCount: session.project.packages.length,
			resourceCount: session.project.packages.reduce((total, pkg) => total + pkg.resources.length, 0),
			diagnostics: [],
		},
	};
}

export class CacheService {
	public constructor(private readonly context: BackendContext) {}

	public getCacheSnapshot(input: GetCacheSnapshotInput): BackendResult<BackendCacheSnapshot, SessionNotFoundError> {
		const startedAt = Date.now();
		const session = this.context.sessions.get(input.sessionId);
		if (!session || session.closed) {
			return failure('read', startedAt, createSessionNotFoundError(input.sessionId));
		}
		const entry = this.context.cacheBySession.get(input.sessionId);
		return success('read', startedAt, {
			cacheRevision: entry?.revision ?? session.revision,
			entries: entry ? [structuredClone(entry)] : [],
		}, { sessionId: session.sessionId, revision: session.revision });
	}

	public refreshSession(session: BackendSessionState): BackendCacheEntry {
		const entry = createCacheEntry(session, true);
		this.context.cacheBySession.set(session.sessionId, entry);
		return entry;
	}

	public invalidateSession(session: BackendSessionState): BackendCacheEntry {
		const entry = createCacheEntry(session, false);
		this.context.cacheBySession.set(session.sessionId, entry);
		return entry;
	}

	public removeSession(sessionId: string): void {
		this.context.cacheBySession.delete(sessionId);
	}
}
