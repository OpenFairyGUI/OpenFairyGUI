import { materializeUamProject, ProjectWriter } from '@openfairygui/core';
import { applyUamTransactionApp, type ApplyUamTransactionAppError } from '@openfairygui/functions';
import type { CacheService } from './cache-service.js';
import { failure, success, type BackendContext } from './context.js';
import type { EventService } from './event-service.js';
import type {
	ApplySessionTransactionInput,
	BackendFileSystem,
	BackendResult,
	BackendSessionSnapshot,
	SavePartialFailureError,
	SessionNotFoundError,
	SessionStaleWriteError,
} from '../runtime.js';
import { validateSaveTarget, type PathPolicyViolationError } from '../path-policy.js';
import { createSessionNotFoundError, createStaleWriteError, toSessionSnapshot } from './session-utils.js';

function createWriterFileSystem(
	fileSystem: BackendFileSystem,
	committedPaths: string[],
	failedPaths: string[],
): import('@openfairygui/core').FileSystem {
	async function trackWrite<T>(targetPath: string, fn: () => Promise<T>): Promise<T> {
		try {
			const result = await fn();
			committedPaths.push(targetPath);
			return result;
		} catch (error) {
			failedPaths.push(targetPath);
			throw error;
		}
	}

	return {
		async readFile(filePath: string): Promise<string> {
			return fileSystem.readFile(filePath);
		},
		async readFileRaw(filePath: string): Promise<Uint8Array> {
			return fileSystem.readFileRaw(filePath);
		},
		async writeFile(filePath: string, content: string): Promise<void> {
			await trackWrite(filePath, async () => {
				await fileSystem.mkdir(fileSystem.dirname(filePath), { recursive: true });
				await fileSystem.writeFile(filePath, content);
			});
		},
		async writeFileRaw(filePath: string, data: Uint8Array): Promise<void> {
			await trackWrite(filePath, async () => {
				await fileSystem.mkdir(fileSystem.dirname(filePath), { recursive: true });
				await fileSystem.writeFileRaw(filePath, data);
			});
		},
		async mkdir(dirPath: string): Promise<void> {
			await fileSystem.mkdir(dirPath, { recursive: true });
		},
		async readdir(dirPath: string): Promise<string[]> {
			return fileSystem.readdir(dirPath);
		},
		async exists(filePath: string): Promise<boolean> {
			try {
				await fileSystem.stat(filePath);
				return true;
			} catch {
				return false;
			}
		},
		join(...paths: string[]): string {
			return fileSystem.join(...paths);
		},
		dirname(filePath: string): string {
			return fileSystem.dirname(filePath);
		},
	};
}

export class AuthoringService {
	public constructor(
		private readonly context: BackendContext,
		private readonly cacheService: CacheService,
		private readonly eventService: EventService,
	) {}

	public async applyTransaction(
		input: ApplySessionTransactionInput,
	): Promise<BackendResult<BackendSessionSnapshot, SessionNotFoundError | SessionStaleWriteError | ApplyUamTransactionAppError>> {
		const startedAt = Date.now();
		const session = this.context.sessions.get(input.sessionId);
		if (!session || session.closed) {
			return failure('authoring', startedAt, createSessionNotFoundError(input.sessionId));
		}
		if (input.expectedRevision !== session.revision) {
			this.eventService.emit({ kind: 'transaction.rejected', sessionId: session.sessionId, canonicalPathKey: session.canonicalPathKey, revision: session.revision });
			return failure('authoring', startedAt, createStaleWriteError(session, input.expectedRevision), toSessionSnapshot(session, this.context.capabilities), {
				sessionId: session.sessionId,
				revision: session.revision,
			});
		}

		const result = applyUamTransactionApp({
			project: session.project,
			operations: input.operations,
		});
		if (result.ok === false) {
			this.eventService.emit({ kind: 'transaction.rejected', sessionId: session.sessionId, canonicalPathKey: session.canonicalPathKey, revision: session.revision, diagnostics: result.error.issues?.map((issue) => ({ code: result.error.code, message: issue.message, severity: 'error' as const })) ?? [] });
			return failure('authoring', startedAt, result.error, toSessionSnapshot(session, this.context.capabilities), {
				sessionId: session.sessionId,
				revision: session.revision,
			});
		}

		session.project = result.project;
		session.revision += 1;
		session.dirty = true;
		const cacheEntry = this.cacheService.invalidateSession(session);
		this.eventService.emit({ kind: 'transaction.applied', sessionId: session.sessionId, canonicalPathKey: session.canonicalPathKey, revision: session.revision });
		this.eventService.emit({ kind: 'cache.invalidated', sessionId: session.sessionId, canonicalPathKey: session.canonicalPathKey, revision: session.revision, cacheRevision: cacheEntry.revision });

		return success('authoring', startedAt, toSessionSnapshot(session, this.context.capabilities), {
			sessionId: session.sessionId,
			revision: session.revision,
		});
	}

	public async saveSession(
		input: { sessionId: string; expectedRevision?: number; targetPath?: string },
	): Promise<BackendResult<BackendSessionSnapshot, SessionNotFoundError | SessionStaleWriteError | SavePartialFailureError | PathPolicyViolationError>> {
		const startedAt = Date.now();
		const session = this.context.sessions.get(input.sessionId);
		if (!session || session.closed) {
			return failure('authoring', startedAt, createSessionNotFoundError(input.sessionId));
		}
		if (input.expectedRevision !== undefined && input.expectedRevision !== session.revision) {
			return failure('authoring', startedAt, createStaleWriteError(session, input.expectedRevision), toSessionSnapshot(session, this.context.capabilities), {
				sessionId: session.sessionId,
				revision: session.revision,
			});
		}
		const targetViolation = await validateSaveTarget(this.context.fileSystem, session.fairyPath, input.targetPath);
		if (targetViolation) {
			return failure('authoring', startedAt, targetViolation, toSessionSnapshot(session, this.context.capabilities), {
				sessionId: session.sessionId,
				revision: session.revision,
			});
		}
		if (!session.dirty) {
			return success('authoring', startedAt, toSessionSnapshot(session, this.context.capabilities), {
				sessionId: session.sessionId,
				revision: session.revision,
			});
		}

		const committedPaths: string[] = [];
		const failedPaths: string[] = [];
		this.eventService.emit({ kind: 'save.started', sessionId: session.sessionId, canonicalPathKey: session.canonicalPathKey, revision: session.revision });
		try {
			const writer = new ProjectWriter(createWriterFileSystem(this.context.fileSystem, committedPaths, failedPaths));
			await writer.write(materializeUamProject(session.project), session.fairyPath);
			session.lastSavedRevision = session.revision;
			session.dirty = false;
			const cacheEntry = this.cacheService.refreshSession(session);
			this.eventService.emit({ kind: 'save.completed', sessionId: session.sessionId, canonicalPathKey: session.canonicalPathKey, revision: session.revision });
			this.eventService.emit({ kind: 'cache.updated', sessionId: session.sessionId, canonicalPathKey: session.canonicalPathKey, revision: session.revision, cacheRevision: cacheEntry.revision });
			return success('authoring', startedAt, toSessionSnapshot(session, this.context.capabilities), {
				sessionId: session.sessionId,
				revision: session.revision,
			});
		} catch (error) {
			this.cacheService.invalidateSession(session);
			this.eventService.emit({ kind: 'save.failed', sessionId: session.sessionId, canonicalPathKey: session.canonicalPathKey, revision: session.revision });
			return failure('authoring', startedAt, {
				code: 'save_partial_failure',
				message: error instanceof Error ? error.message : String(error),
				sessionId: session.sessionId,
				canonicalPathKey: session.canonicalPathKey,
				attemptedRevision: session.revision,
				lastSavedRevision: session.lastSavedRevision,
				committedPaths,
				failedPaths,
				diskMayBePartiallyUpdated: true,
			}, toSessionSnapshot(session, this.context.capabilities), {
				sessionId: session.sessionId,
				revision: session.revision,
			});
		}
	}
}
