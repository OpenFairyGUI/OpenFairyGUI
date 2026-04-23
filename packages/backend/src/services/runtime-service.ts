import { NodeIO, readProjectAsUam } from '@openfairygui/core';
import { failure, success, type BackendContext, type BackendSessionState } from './context.js';
import type {
	AdvisoryLockConflictError,
	BackendFileHandle,
	BackendResult,
	BackendSessionSnapshot,
	InProcessLockConflictError,
	SessionNotFoundError,
} from '../runtime.js';
import { resolveCanonicalProjectRoot } from '../path-policy.js';
import { createSessionNotFoundError, toSessionSnapshot } from './session-utils.js';

function randomId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class RuntimeService {
	public constructor(private readonly context: BackendContext) {}

	public async openSession(input: { projectPath: string }): Promise<BackendResult<BackendSessionSnapshot, InProcessLockConflictError | AdvisoryLockConflictError>> {
		const startedAt = Date.now();
		const resolved = await resolveCanonicalProjectRoot(this.context.fileSystem, input.projectPath);
		const { fairyPath, canonicalProjectPath, canonicalPathKey } = resolved;
		const existingSessionId = this.context.sessionsByPath.get(canonicalPathKey);
		const lockFilePath = this.context.fileSystem.join(canonicalProjectPath, '.openfairygui.backend.lock');

		if (existingSessionId) {
			return failure('runtime', startedAt, {
				code: 'lock_conflict',
				kind: 'in_process_session_exists',
				message: `Project is already open in this backend runtime: ${canonicalProjectPath}`,
				canonicalPathKey,
				holderSessionId: existingSessionId,
				lockFilePath,
			});
		}

		let advisoryLock: BackendFileHandle | null = null;
		try {
			advisoryLock = await this.context.fileSystem.openExclusive(lockFilePath);
			await advisoryLock.writeFile(JSON.stringify({
				pid: process.pid,
				createdAt: new Date().toISOString(),
				canonicalPathKey,
			}));
			await advisoryLock.close();

			const io = new NodeIO();
			const project = await readProjectAsUam(io, fairyPath);
			const sessionId = randomId();
			const session: BackendSessionState = {
				sessionId,
				fairyPath,
				canonicalProjectPath,
				canonicalPathKey,
				lockFilePath,
				project,
				revision: 0,
				lastSavedRevision: 0,
				dirty: false,
				lockHeld: true,
				closed: false,
			};
			this.context.sessions.set(sessionId, session);
			this.context.sessionsByPath.set(canonicalPathKey, sessionId);

			return success('runtime', startedAt, toSessionSnapshot(session, this.context.capabilities));
		} catch (error) {
			if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') {
				return failure('runtime', startedAt, {
					code: 'lock_conflict',
					kind: 'advisory_lock_conflict',
					message: `Advisory lock already exists for project: ${canonicalProjectPath}`,
					canonicalPathKey,
					lockFilePath,
				});
			}
			if (advisoryLock) {
				await advisoryLock.close().catch(() => undefined);
				await this.context.fileSystem.unlink(lockFilePath).catch(() => undefined);
			}
			throw error;
		}
	}

	public async closeSession(
		input: { sessionId: string },
	): Promise<BackendResult<{ sessionId: string; closed: true }, SessionNotFoundError>> {
		const startedAt = Date.now();
		const session = this.context.sessions.get(input.sessionId);
		if (!session || session.closed) {
			return failure('runtime', startedAt, createSessionNotFoundError(input.sessionId));
		}

		await this.context.fileSystem.unlink(session.lockFilePath).catch(() => undefined);
		session.lockHeld = false;
		session.closed = true;
		this.context.sessions.delete(session.sessionId);
		this.context.sessionsByPath.delete(session.canonicalPathKey);

		return success('runtime', startedAt, {
			sessionId: session.sessionId,
			closed: true,
		}, { sessionId: session.sessionId, revision: session.revision });
	}
}
