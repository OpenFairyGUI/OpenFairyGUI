import type {
	BackendCapabilities,
	BackendSessionSnapshot,
	SessionNotFoundError,
	SessionStaleWriteError,
} from '../runtime.js';
import { cloneReadData, type ReadonlyData, type BackendSessionState, type SessionReadView } from './context.js';

export function toSessionSnapshot(
	session: Pick<SessionReadView, 'sessionId' | 'canonicalProjectPath' | 'revision' | 'lastSavedRevision' | 'dirty' | 'uamFidelity' | 'lockHeld'>,
	capabilities: ReadonlyData<BackendCapabilities>,
): BackendSessionSnapshot {
	return {
		sessionId: session.sessionId,
		canonicalProjectPath: session.canonicalProjectPath,
		revision: session.revision,
		lastSavedRevision: session.lastSavedRevision,
		dirty: session.dirty,
		uamFidelity: session.uamFidelity,
		lockHeld: session.lockHeld,
		capabilities: cloneReadData<BackendCapabilities>(capabilities),
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
