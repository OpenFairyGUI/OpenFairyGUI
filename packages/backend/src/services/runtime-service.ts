import { ProjectReader, type FileSystem } from '@openfairygui/core/project-io';
import { liftDocumentToUamProject, normalizeUamProject } from '@openfairygui/core/uam';
import { failure, success, type BackendContext, type BackendSessionState } from './context.js';
import type { CacheService } from './cache-service.js';
import type { EventService } from './event-service.js';
import type { JobService } from './job-service.js';
import type {
	AdvisoryLockConflictError,
	BackendFileHandle,
	BackendResult,
	BackendSessionSnapshot,
	BackendCapabilityUnavailableError,
	InProcessLockConflictError,
	OpenProjectSessionInput,
	SessionNotFoundError,
} from '../runtime.js';
import { resolveCanonicalProjectRoot } from '../path-policy.js';
import { createSessionNotFoundError, toSessionSnapshot } from './session-utils.js';

function randomId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createCapabilityUnavailableError(
	capability: BackendCapabilityUnavailableError['capability'],
): BackendCapabilityUnavailableError {
	const artifactCapability = capability === 'artifact.publish' || capability === 'artifact.restore';
	return {
		code: 'capability_unavailable',
		message: artifactCapability
			? `${capability} requires the Node bridge boundary exposed by @openfairygui/backend/node.`
			: `${capability} requires an injected BackendFileSystem adapter.`,
		capability,
		requiredAdapter: capability === 'fileSystem' ? 'BackendFileSystem' : undefined,
		requiredHost: artifactCapability ? 'node' : undefined,
		bridgeBoundary: artifactCapability ? 'external-bridge' : undefined,
	};
}

function createProjectReaderFileSystem(fileSystem: NonNullable<BackendContext['fileSystem']>): FileSystem {
	return {
		readFile(filePath: string): Promise<string> {
			return fileSystem.readFile(filePath);
		},
		readFileRaw(filePath: string): Promise<Uint8Array> {
			return fileSystem.readFileRaw(filePath);
		},
		writeFile(filePath: string, content: string): Promise<void> {
			return fileSystem.writeFile(filePath, content);
		},
		writeFileRaw(filePath: string, data: Uint8Array): Promise<void> {
			return fileSystem.writeFileRaw(filePath, data);
		},
		async mkdir(dirPath: string): Promise<void> {
			await fileSystem.mkdir(dirPath, { recursive: true });
		},
		readdir(dirPath: string): Promise<string[]> {
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

export class RuntimeService {
	public constructor(
		private readonly context: BackendContext,
		private readonly cacheService: CacheService,
		private readonly eventService: EventService,
		private readonly jobService: JobService,
	) {}

	public async openSession(input: {
		projectPath: string;
	}): Promise<
		BackendResult<
			BackendSessionSnapshot,
			InProcessLockConflictError | AdvisoryLockConflictError | BackendCapabilityUnavailableError
		>
	> {
		const startedAt = Date.now();
		if (!this.context.fileSystem) {
			return failure('runtime', startedAt, createCapabilityUnavailableError('fileSystem'));
		}
		const fileSystem = this.context.fileSystem;
		const resolved = await resolveCanonicalProjectRoot(fileSystem, input.projectPath);
		const { fairyPath, canonicalProjectPath, canonicalPathKey } = resolved;
		const existingSessionId = this.context.sessionsByPath.get(canonicalPathKey);
		const lockFilePath = fileSystem.join(canonicalProjectPath, '.openfairygui.backend.lock');

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
			advisoryLock = await fileSystem.openExclusive(lockFilePath);
			await advisoryLock.writeFile(
				JSON.stringify(
					this.context.host?.lockMetadata?.({
						canonicalPathKey,
						canonicalProjectPath,
						lockFilePath,
					}) ?? {
						createdAt: new Date().toISOString(),
						canonicalPathKey,
					},
				),
			);
			await advisoryLock.close();

			const reader = new ProjectReader(createProjectReaderFileSystem(fileSystem));
			const project = liftDocumentToUamProject(await reader.read(fairyPath));
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
			this.cacheService.refreshSession(session);
			this.eventService.emit({ kind: 'session.opened', sessionId, canonicalPathKey, revision: session.revision });

			return success('runtime', startedAt, toSessionSnapshot(session, this.context.capabilities), {
				sessionId: session.sessionId,
				revision: session.revision,
			});
		} catch (error) {
			if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST') {
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
				await fileSystem.unlink(lockFilePath).catch(() => undefined);
			}
			throw error;
		}
	}

	public openProjectSession(input: OpenProjectSessionInput): BackendResult<BackendSessionSnapshot> {
		const startedAt = Date.now();
		const sessionId = input.sessionId ?? randomId();
		const canonicalProjectPath = input.canonicalProjectPath ?? `memory://${sessionId}`;
		const canonicalPathKey = input.canonicalPathKey ?? canonicalProjectPath.toLowerCase();
		const existingSessionId = this.context.sessionsByPath.get(canonicalPathKey);
		if (existingSessionId) {
			return failure('runtime', startedAt, {
				code: 'lock_conflict',
				kind: 'in_process_session_exists',
				message: `Project is already open in this backend runtime: ${canonicalProjectPath}`,
				canonicalPathKey,
				holderSessionId: existingSessionId,
			});
		}

		const session: BackendSessionState = {
			sessionId,
			fairyPath: canonicalProjectPath,
			canonicalProjectPath,
			canonicalPathKey,
			lockFilePath: '',
			project: normalizeUamProject(input.project),
			revision: 0,
			lastSavedRevision: 0,
			dirty: false,
			lockHeld: false,
			closed: false,
		};
		this.context.sessions.set(sessionId, session);
		this.context.sessionsByPath.set(canonicalPathKey, sessionId);
		this.cacheService.refreshSession(session);
		this.eventService.emit({ kind: 'session.opened', sessionId, canonicalPathKey, revision: session.revision });

		return success('runtime', startedAt, toSessionSnapshot(session, this.context.capabilities), {
			sessionId: session.sessionId,
			revision: session.revision,
		});
	}

	public async closeSession(input: {
		sessionId: string;
	}): Promise<BackendResult<{ sessionId: string; closed: true }, SessionNotFoundError>> {
		const startedAt = Date.now();
		const session = this.context.sessions.get(input.sessionId);
		if (!session || session.closed) {
			return failure('runtime', startedAt, createSessionNotFoundError(input.sessionId));
		}

		this.eventService.emit({
			kind: 'session.closeRequested',
			sessionId: session.sessionId,
			canonicalPathKey: session.canonicalPathKey,
			revision: session.revision,
		});
		if (this.context.fileSystem && session.lockFilePath) {
			await this.context.fileSystem.unlink(session.lockFilePath).catch(() => undefined);
		}
		session.lockHeld = false;
		session.closed = true;
		this.context.sessions.delete(session.sessionId);
		this.context.sessionsByPath.delete(session.canonicalPathKey);
		this.cacheService.removeSession(session.sessionId);
		this.jobService.removeSession(session.sessionId);
		this.eventService.emit({
			kind: 'session.closed',
			sessionId: session.sessionId,
			canonicalPathKey: session.canonicalPathKey,
			revision: session.revision,
		});
		this.eventService.removeSession(session.sessionId);

		return success(
			'runtime',
			startedAt,
			{
				sessionId: session.sessionId,
				closed: true,
			},
			{ sessionId: session.sessionId, revision: session.revision },
		);
	}
}
