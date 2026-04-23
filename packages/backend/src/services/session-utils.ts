import type {
	BackendCapabilities,
	BackendSessionSnapshot,
	SessionNotFoundError,
	SessionStaleWriteError,
} from '../runtime.js';
import type { BackendSessionState } from './context.js';
import { cloneCapabilitiesSnapshot } from './snapshot-utils.js';

export function toSessionSnapshot(session: BackendSessionState, capabilities: BackendCapabilities): BackendSessionSnapshot {
	return {
		sessionId: session.sessionId,
		canonicalProjectPath: session.canonicalProjectPath,
		revision: session.revision,
		lastSavedRevision: session.lastSavedRevision,
		dirty: session.dirty,
		lockHeld: session.lockHeld,
		capabilities: cloneCapabilitiesSnapshot(capabilities),
	};
}

export function createSessionNotFoundError(sessionId: string): SessionNotFoundError {
	return {
		code: 'session_not_found',
		message: `Session was not found: ${sessionId}`,
		sessionId,
	};
}

export function createStaleWriteError(
	session: Pick<BackendSessionState, 'sessionId' | 'canonicalPathKey' | 'revision'>,
	expectedRevision: number,
): SessionStaleWriteError {
	return {
		code: 'stale_write',
		message: `Expected revision ${expectedRevision} does not match current revision ${session.revision}.`,
		sessionId: session.sessionId,
		canonicalPathKey: session.canonicalPathKey,
		expectedRevision,
		actualRevision: session.revision,
	};
}
