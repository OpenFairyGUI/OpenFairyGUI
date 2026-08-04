import { type FileSystem, ProjectReader, ProjectWriter } from '@openfairygui/core/project-io';
import {
	liftDocumentToUamProject,
	materializeUamProject,
	normalizeUamProject,
	type UamProject,
} from '@openfairygui/core/uam';
import { normalizeComparablePath, resolveCanonicalProjectRoot } from '../path-policy.js';
import type {
	AdvisoryLockConflictError,
	BackendCapabilityUnavailableError,
	BackendResult,
	BackendSessionLock,
	BackendSessionSnapshot,
	InProcessLockConflictError,
	OpenProjectSessionInput,
	SessionNotFoundError,
} from '../runtime.js';
import type { CacheService } from './cache-service.js';
import { type BackendContext, type BackendSessionState, failure, success } from './context.js';
import type { EventService } from './event-service.js';
import type { JobService } from './job-service.js';
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

function createCaptureFileSystem(
	files: Map<string, string | Uint8Array>,
	directories: Set<string>,
): FileSystem {
	const normalize = (filePath: string): string => filePath.replace(/\\/g, '/').replace(/\/+/g, '/');
	return {
		async readFile(filePath: string): Promise<string> {
			const value = files.get(normalize(filePath));
			if (typeof value !== 'string') throw new Error(`Captured text file was not found: ${filePath}`);
			return value;
		},
		async readFileRaw(filePath: string): Promise<Uint8Array> {
			const value = files.get(normalize(filePath));
			if (!(value instanceof Uint8Array)) throw new Error(`Captured binary file was not found: ${filePath}`);
			return value.slice();
		},
		async writeFile(filePath: string, content: string): Promise<void> {
			files.set(normalize(filePath), content);
		},
		async writeFileRaw(filePath: string, data: Uint8Array): Promise<void> {
			files.set(normalize(filePath), data.slice());
		},
		async mkdir(dirPath: string): Promise<void> {
			directories.add(normalize(dirPath));
		},
		async readdir(): Promise<string[]> {
			return [];
		},
		async exists(filePath: string): Promise<boolean> {
			return files.has(normalize(filePath));
		},
		join(...paths: string[]): string {
			return normalize(paths.filter(Boolean).join('/'));
		},
		dirname(filePath: string): string {
			const normalized = normalize(filePath);
			const separator = normalized.lastIndexOf('/');
			return separator < 0 ? '' : normalized.slice(0, separator);
		},
		async unlink(filePath: string): Promise<void> {
			files.delete(normalize(filePath));
		},
	};
}

function capturedFilesEqual(left: Map<string, string | Uint8Array>, right: Map<string, string | Uint8Array>): boolean {
	if (left.size !== right.size) return false;
	for (const [filePath, leftValue] of left) {
		const rightValue = right.get(filePath);
		if (typeof leftValue === 'string') {
			if (leftValue !== rightValue) return false;
			continue;
		}
		if (!(rightValue instanceof Uint8Array) || leftValue.length !== rightValue.length) return false;
		for (let index = 0; index < leftValue.length; index += 1) {
			if (leftValue[index] !== rightValue[index]) return false;
		}
	}
	return true;
}

function capturedDirectoriesEqual(left: Set<string>, right: Set<string>): boolean {
	return left.size === right.size && [...left].every((directory) => right.has(directory));
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
			const reader = new ProjectReader(createProjectReaderFileSystem(fileSystem));
			const read = await reader.readDetailed(fairyPath, { hydrateResourceBytes: true });
			if (!read.document) throw new Error(read.diagnostics[0]?.message ?? `Unable to read project: ${fairyPath}`);
			const document = read.document;
			const project = liftDocumentToUamProject(document);
			const sessionId = randomId();
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
				uamFidelity: (await hasFullUamFidelity(document, project)) ? 'full' : 'unsupported',
				revision: 0,
				lastSavedRevision: 0,
				pendingStaleSourceFiles: new Map(),
				pendingStaleResourceFolders: new Map(),
				pendingStaleBranchDirectories: new Map(),
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
		}
	}

	public openProjectSession(input: OpenProjectSessionInput): BackendResult<BackendSessionSnapshot> {
		const startedAt = Date.now();
		const sessionId = input.sessionId ?? randomId();
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
			fairyPath: storage?.fairyPath ?? canonicalProjectPath,
			canonicalProjectPath,
			canonicalPathKey,
			lockFilePath: '',
			sessionLock: null,
			fileSystem: storage?.fileSystem,
			project: normalizeUamProject(input.project),
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
		await session.sessionLock?.release().catch(() => undefined);
		session.sessionLock = null;
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
