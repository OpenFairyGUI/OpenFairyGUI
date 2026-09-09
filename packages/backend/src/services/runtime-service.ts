import { capturedDirectoriesEqual, capturedFilesEqual, createCaptureFileSystem } from './capture-project.js';
import { type FileSystem, ProjectReader, ProjectWriter } from '@openfairygui/core/project-io';
import {
	liftDocumentToUamProject,
	materializeUamProject,
	normalizeUamProject,
	type UamProject,
} from '@openfairygui/core/uam';
import { assertProjectPathContained, normalizeComparablePath, resolveCanonicalProjectRoot } from '../path-policy.js';
import type {
	AdvisoryLockConflictError,
	BackendCapabilityUnavailableError,
	BackendResult,
	BackendSessionLock,
	BackendSessionSnapshot,
	InProcessLockConflictError,
	OpenProjectSessionInput,
	ProjectRootNotAllowedError,
	SessionIdConflictError,
	SessionNotFoundError,
	SessionCloseFailedError,
} from '../runtime.js';
import type { CacheService } from './cache-service.js';
import { type BackendContext, type BackendSessionState, failure, success } from './context.js';
import type { EventService } from './event-service.js';
import { createSessionNotFoundError, toSessionSnapshot } from './session-utils.js';

function randomId(): string {
	return crypto.randomUUID();
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

function createProjectReaderFileSystem(
	fileSystem: NonNullable<BackendContext['fileSystem']>,
	projectRoot: string,
): FileSystem {
	const contained = async <T>(filePath: string, operation: () => Promise<T>): Promise<T> => {
		await assertProjectPathContained(fileSystem, projectRoot, filePath);
		return operation();
	};
	return {
		stat: (path) => contained(path, () => fileSystem.stat(path)),
		readFile(filePath: string): Promise<string> {
			return contained(filePath, () => fileSystem.readFile(filePath));
		},
		readFileRaw(filePath: string): Promise<Uint8Array> {
			return contained(filePath, () => fileSystem.readFileRaw(filePath));
		},
		writeFile(filePath: string, content: string): Promise<void> {
			return contained(filePath, () => fileSystem.writeFile(filePath, content));
		},
		writeFileRaw(filePath: string, data: Uint8Array): Promise<void> {
			return contained(filePath, () => fileSystem.writeFileRaw(filePath, data));
		},
		async mkdir(dirPath: string): Promise<void> {
			await contained(dirPath, () => fileSystem.mkdir(dirPath, { recursive: true }));
		},
		readdir(dirPath: string): Promise<string[]> {
			return contained(dirPath, () => fileSystem.readdir(dirPath));
		},
		async exists(filePath: string): Promise<boolean> {
			try {
				await contained(filePath, () => fileSystem.stat(filePath));
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

async function hasFullUamFidelity(
	document: Awaited<ReturnType<ProjectReader['read']>>,
	project: UamProject,
): Promise<boolean> {
	const sourceFiles = new Map<string, string | Uint8Array>();
	const materializedFiles = new Map<string, string | Uint8Array>();
	const sourceDirectories = new Set<string>();
	const materializedDirectories = new Set<string>();
	try {
		await Promise.all([
			new ProjectWriter(createCaptureFileSystem(sourceFiles, sourceDirectories)).write(document, 'Project.fairy'),
			new ProjectWriter(createCaptureFileSystem(materializedFiles, materializedDirectories)).write(
				materializeUamProject(project),
				'Project.fairy',
			),
		]);
	} catch {
		return false;
	}
	return capturedFilesEqual(sourceFiles, materializedFiles)
		&& capturedDirectoriesEqual(sourceDirectories, materializedDirectories);
}

export class RuntimeService {
	public constructor(
		private readonly context: BackendContext,
		private readonly cacheService: CacheService,
		private readonly eventService: EventService,
	) {}

	public async openSession(input: {
		projectPath: string;
	}): Promise<
		BackendResult<
			BackendSessionSnapshot,
			InProcessLockConflictError | AdvisoryLockConflictError | BackendCapabilityUnavailableError | ProjectRootNotAllowedError
		>
	> {
		const startedAt = Date.now();
		if (!this.context.fileSystem) {
			return failure('runtime', startedAt, createCapabilityUnavailableError('fileSystem'));
		}
		const fileSystem = this.context.fileSystem;
		if (this.context.allowedProjectRoots?.length) {
			let allowed = false;
			for (const root of this.context.allowedProjectRoots) {
				try {
					await assertProjectPathContained(fileSystem, root, input.projectPath);
					allowed = true;
					break;
				} catch (error) {
					if ((error as { code?: unknown }).code !== 'EACCES') throw error;
				}
			}
			if (!allowed) {
				return failure('runtime', startedAt, {
					code: 'project_root_not_allowed',
					message: 'Project path is outside the configured allowed roots.',
					projectPath: input.projectPath,
				});
			}
		}
		const resolved = await resolveCanonicalProjectRoot(fileSystem, input.projectPath);
		const { fairyPath, canonicalProjectPath, canonicalPathKey } = resolved;
		await fileSystem.validateProjectRoot?.(canonicalProjectPath);
		const lockFilePath = fileSystem.getSessionLockPath?.(canonicalProjectPath)
			?? fileSystem.join(canonicalProjectPath, '.openfairygui.backend.lock');
		const sessionId = randomId();
		const reservation = this.context.sessions.reserve(sessionId, { canonicalPathKey, canonicalProjectPath, lockFilePath });
		if ('code' in reservation) return failure('runtime', startedAt, reservation);

		let sessionLock: BackendSessionLock | null = null;
		try {
			sessionLock = await fileSystem.acquireSessionLock(lockFilePath);
			await sessionLock.writeMetadata(
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
			const reader = new ProjectReader(createProjectReaderFileSystem(fileSystem, canonicalProjectPath));
			const read = await reader.readDetailed(fairyPath, { hydrateResourceBytes: true });
			if (!read.document) throw new Error(read.diagnostics[0]?.message ?? `Unable to read project: ${fairyPath}`);
			const document = read.document;
			const project = liftDocumentToUamProject(document);
			const session: BackendSessionState = {
				sessionId,
				fairyPath,
				canonicalProjectPath,
				canonicalPathKey,
				lockFilePath,
				sessionLock,
				fileSystem,
				project,
				readDiagnostics: read.diagnostics,
				readComplete: read.complete,
				uamFidelity: read.complete && (await hasFullUamFidelity(document, project)) ? 'full' : 'unsupported',
				revision: 0,
				lastSavedRevision: 0,
				pendingStaleSourceFiles: new Map(),
				pendingStaleResourceFolders: new Map(),
				pendingStaleBranchDirectories: new Map(),
				dirty: false,
				lockHeld: true,
				closed: false,
			};
			reservation.commit(session);
			this.cacheService.refreshSession(session);
			this.eventService.emit({ kind: 'session.opened', sessionId, canonicalPathKey, revision: session.revision });

			return success('runtime', startedAt, toSessionSnapshot(session, this.context.capabilities), {
				sessionId: session.sessionId,
				revision: session.revision,
			});
		} catch (error) {
			if (sessionLock) await sessionLock.release().catch(() => undefined);
			if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST') {
				return failure('runtime', startedAt, {
					code: 'lock_conflict',
					kind: 'advisory_lock_conflict',
					message: `Advisory lock already exists for project: ${canonicalProjectPath}`,
					canonicalPathKey,
					lockFilePath,
				});
			}
			if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOTSUP') {
				return failure('runtime', startedAt, {
					...createCapabilityUnavailableError('fileSystem'),
					message: error instanceof Error ? error.message : String(error),
				});
			}
			throw error;
		} finally {
			reservation.release();
		}
	}

	public openProjectSession(
		input: OpenProjectSessionInput,
	): BackendResult<BackendSessionSnapshot, InProcessLockConflictError | SessionIdConflictError> {
		const startedAt = Date.now();
		const sessionId = input.sessionId ?? randomId();
		if (this.context.sessions.has(sessionId)) {
			return failure('runtime', startedAt, {
				code: 'session_id_conflict',
				message: `Session id is already in use: ${sessionId}`,
				sessionId,
			});
		}
		const storage = input.storage;
		const memoryProjectPath = `memory://${sessionId}`;
		const canonicalProjectPath =
			storage?.canonicalProjectPath ??
			input.canonicalProjectPath ??
			(storage ? storage.fileSystem.dirname(storage.fairyPath) || '.' : memoryProjectPath);
		const canonicalPathKey =
			storage?.canonicalPathKey ??
			input.canonicalPathKey ??
			(storage ? normalizeComparablePath(canonicalProjectPath) : canonicalProjectPath.toLowerCase());
		// Normalize before claiming a path: malformed native input must not leave a reservation behind.
		const project = normalizeUamProject(input.project);
		const reservation = this.context.sessions.reserve(sessionId, { canonicalPathKey, canonicalProjectPath });
		if ('code' in reservation) return failure('runtime', startedAt, reservation);

		const session: BackendSessionState = {
			sessionId,
			fairyPath: storage?.fairyPath ?? canonicalProjectPath,
			canonicalProjectPath,
			canonicalPathKey,
			lockFilePath: '',
			sessionLock: null,
			fileSystem: storage?.fileSystem,
			project,
			readDiagnostics: [],
			readComplete: true,
			uamFidelity: 'full',
			revision: 0,
			lastSavedRevision: 0,
			pendingStaleSourceFiles: new Map(),
			pendingStaleResourceFolders: new Map(),
			pendingStaleBranchDirectories: new Map(),
			dirty: false,
			lockHeld: false,
			closed: false,
		};
		reservation.commit(session);
		this.cacheService.refreshSession(session);
		this.eventService.emit({ kind: 'session.opened', sessionId, canonicalPathKey, revision: session.revision });

		return success('runtime', startedAt, toSessionSnapshot(session, this.context.capabilities), {
			sessionId: session.sessionId,
			revision: session.revision,
		});
	}

	public async closeSession(input: {
		sessionId: string;
	}): Promise<BackendResult<{ sessionId: string; closed: true }, SessionNotFoundError | SessionCloseFailedError>> {
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
		try {
			await session.sessionLock?.release();
		} catch (error) {
			return failure('runtime', startedAt, {
				code: 'session_close_failed',
				message: error instanceof Error ? error.message : String(error),
				sessionId: session.sessionId,
				lockFilePath: session.lockFilePath,
			}, toSessionSnapshot(session, this.context.capabilities), { sessionId: session.sessionId, revision: session.revision });
		}
		session.sessionLock = null;
		session.lockHeld = false;
		session.closed = true;
		this.context.sessions.remove(session);
		this.cacheService.removeSession(session.sessionId);
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
