import { failure, success, type BackendContext } from './context.js';
import type { BackendCapabilities, BackendResult, BackendSessionSnapshot, SessionNotFoundError } from '../runtime.js';
import { createSessionNotFoundError, toSessionSnapshot } from './session-utils.js';
import { cloneCapabilitiesSnapshot } from './snapshot-utils.js';

export class ReadService {
	public constructor(private readonly context: BackendContext) {}

	public getCapabilities(): BackendResult<BackendCapabilities> {
		return success('read', Date.now(), cloneCapabilitiesSnapshot(this.context.capabilities));
	}

	public getSession(input: { sessionId: string }): BackendResult<BackendSessionSnapshot, SessionNotFoundError> {
		const startedAt = Date.now();
		const session = this.context.sessions.get(input.sessionId);
		if (!session || session.closed) {
			return failure('read', startedAt, createSessionNotFoundError(input.sessionId));
		}
		return success('read', startedAt, toSessionSnapshot(session, this.context.capabilities), {
			sessionId: session.sessionId,
			revision: session.revision,
		});
	}
}
