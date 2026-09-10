import { failure, success, type BackendSessionState } from './context.js';
import type { EventService } from './event-service.js';
import { createSessionNotFoundError } from './session-utils.js';
import type {
	BackendCacheEntry,
	BackendCacheSnapshot,
	BackendResult,
	GetCacheSnapshotInput,
	RefreshCacheInput,
	SessionNotFoundError,
} from '../runtime.js';

type CacheSession = Readonly<Pick<BackendSessionState,
	'sessionId' | 'canonicalPathKey' | 'revision' | 'lastSavedRevision' | 'dirty' | 'closed'>> & {
	readonly project: { readonly packages: readonly { readonly resources: readonly unknown[] }[] };
};

function createCacheEntry(session: CacheSession, valid: boolean): BackendCacheEntry {
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
	private readonly cacheBySession = new Map<string, BackendCacheEntry>();
	public constructor(private readonly getSession: (sessionId: string) => CacheSession | undefined, private readonly events: EventService) {}

	public getCacheSnapshot(input: GetCacheSnapshotInput): BackendResult<BackendCacheSnapshot, SessionNotFoundError> {
		const startedAt = Date.now();
		const session = this.getSession(input.sessionId);
		if (!session || session.closed) {
			return failure('read', startedAt, createSessionNotFoundError(input.sessionId));
		}
		const entry = this.cacheBySession.get(input.sessionId);
		return success('read', startedAt, {
			cacheRevision: entry?.revision ?? session.revision,
			entries: entry ? [structuredClone(entry)] : [],
		}, { sessionId: session.sessionId, revision: session.revision });
	}

	public refreshCache(input: RefreshCacheInput): BackendResult<BackendCacheSnapshot, SessionNotFoundError> {
		const startedAt = Date.now();
		const session = this.getSession(input.sessionId);
		if (!session || session.closed) return failure('runtime', startedAt, createSessionNotFoundError(input.sessionId));
		const entry = this.refreshSession(session);
		this.events.emit({
			kind: 'cache.updated', sessionId: session.sessionId, canonicalPathKey: session.canonicalPathKey,
			revision: session.revision, cacheRevision: entry.revision, payload: { reason: input.reason ?? 'manual' },
		});
		return success('runtime', startedAt, {
			cacheRevision: entry.revision, entries: [structuredClone(entry)],
		}, { sessionId: session.sessionId, revision: session.revision });
	}

	public refreshSession(session: CacheSession): BackendCacheEntry {
		const entry = createCacheEntry(session, true);
		this.cacheBySession.set(session.sessionId, entry);
		return entry;
	}

	public invalidateSession(session: CacheSession): BackendCacheEntry {
		const entry = createCacheEntry(session, false);
		this.cacheBySession.set(session.sessionId, entry);
		return entry;
	}

	public removeSession(sessionId: string): void {
		this.cacheBySession.delete(sessionId);
	}
}
