import { ProjectWriter, type FileSystem } from '@openfairygui/core/project-io';
import { materializeUamProject, validateUamProject } from '@openfairygui/core/uam';
import { applyUamTransactionApp, type ApplyUamTransactionAppError } from '@openfairygui/functions/uam';
import type { CacheService } from './cache-service.js';
import { failure, success, type BackendContext } from './context.js';
import type { EventService } from './event-service.js';
import type {
	ApplySessionTransactionInput,
	BackendCapabilityUnavailableError,
	BackendFileSystem,
	BackendResult,
	BackendSessionSnapshot,
	InProcessLockConflictError,
	MaterializeSessionInput,
	MaterializeSessionSnapshot,
	MaterializeValidationFailedError,
	MaterializeWriteFailedError,
	SaveSessionInput,
	SavePartialFailureError,
	SessionNotFoundError,
	SessionStaleWriteError,
} from '../runtime.js';
import type { BackendDiagnostic } from '../contracts.js';
import { normalizeComparablePath, validateSaveTarget, type PathPolicyViolationError } from '../path-policy.js';
import { createSessionNotFoundError, createStaleWriteError, toSessionSnapshot } from './session-utils.js';

function createWriterFileSystem(
	fileSystem: BackendFileSystem,
	committedPaths: string[],
	failedPaths: string[],
): FileSystem {
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

function toBackendDiagnostics(error: ApplyUamTransactionAppError): BackendDiagnostic[] {
	return error.diagnostics.length > 0
		? error.diagnostics.map((diagnostic) => ({ ...diagnostic }))
		: [
			{
				code: error.code,
				message: error.message,
				severity: 'error',
				operationKind: error.operationKind,
				opIndex: error.opIndex,
				opId: error.opId,
			},
		];
}

function createCapabilityUnavailableError(message: string): BackendCapabilityUnavailableError {
	return {
		code: 'capability_unavailable',
		message,
		capability: 'fileSystem',
		requiredAdapter: 'BackendFileSystem',
	};
}

function validationDiagnostics(sessionProject: Parameters<typeof validateUamProject>[0]): BackendDiagnostic[] {
	const issues = validateUamProject(sessionProject);
	return issues.map((issue) => ({
		code: 'materialize_validation_failed',
		message: issue.message,
		severity: 'error',
		path: issue.path,
		operationKind: 'materializeSession',
	}));
}

function toMaterializeSnapshot(
	session: Parameters<typeof toSessionSnapshot>[0],
	capabilities: Parameters<typeof toSessionSnapshot>[1],
	input: {
		reason?: string;
		writtenPaths: string[];
		skippedPaths: string[];
		diagnostics: BackendDiagnostic[];
	},
): MaterializeSessionSnapshot {
	return {
		...toSessionSnapshot(session, capabilities),
		mode: 'fullProject',
		reason: input.reason,
		materializeRevision: session.revision,
		saveRevision: session.lastSavedRevision,
		writtenPaths: [...input.writtenPaths],
		skippedPaths: [...input.skippedPaths],
		diagnostics: input.diagnostics.map((diagnostic) => ({ ...diagnostic })),
	};
}

function storageCanonicalTarget(input: NonNullable<MaterializeSessionInput['storage']>): {
	fileSystem: BackendFileSystem;
	fairyPath: string;
	canonicalProjectPath: string;
	canonicalPathKey: string;
} {
	const canonicalProjectPath = input.canonicalProjectPath ?? (input.fileSystem.dirname(input.fairyPath) || '.');
	return {
		fileSystem: input.fileSystem,
		fairyPath: input.fairyPath,
		canonicalProjectPath,
		canonicalPathKey: input.canonicalPathKey ?? normalizeComparablePath(canonicalProjectPath),
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
	): Promise<
		BackendResult<
			BackendSessionSnapshot,
			SessionNotFoundError | SessionStaleWriteError | ApplyUamTransactionAppError
		>
	> {
		const startedAt = Date.now();
		const session = this.context.sessions.get(input.sessionId);
		if (!session || session.closed) {
			return failure('authoring', startedAt, createSessionNotFoundError(input.sessionId));
		}
		if (input.expectedRevision !== session.revision) {
			this.eventService.emit({
				kind: 'transaction.rejected',
				sessionId: session.sessionId,
				canonicalPathKey: session.canonicalPathKey,
				revision: session.revision,
			});
			return failure(
				'authoring',
				startedAt,
				createStaleWriteError(session, input.expectedRevision),
				toSessionSnapshot(session, this.context.capabilities),
				{
					sessionId: session.sessionId,
					revision: session.revision,
				},
			);
		}

		const result = applyUamTransactionApp({
			project: session.project,
			operations: input.operations,
		});
		if (result.ok === false) {
			const diagnostics = toBackendDiagnostics(result.error);
			this.eventService.emit({
				kind: 'transaction.rejected',
				sessionId: session.sessionId,
				canonicalPathKey: session.canonicalPathKey,
				revision: session.revision,
				diagnostics,
			});
			return failure(
				'authoring',
				startedAt,
				result.error,
				toSessionSnapshot(session, this.context.capabilities),
				{
					sessionId: session.sessionId,
					revision: session.revision,
					diagnostics,
				},
			);
		}

		session.project = result.project;
		session.revision += 1;
		session.dirty = true;
		const cacheEntry = this.cacheService.invalidateSession(session);
		this.eventService.emit({
			kind: 'transaction.applied',
			sessionId: session.sessionId,
			canonicalPathKey: session.canonicalPathKey,
			revision: session.revision,
		});
		this.eventService.emit({
			kind: 'cache.invalidated',
			sessionId: session.sessionId,
			canonicalPathKey: session.canonicalPathKey,
			revision: session.revision,
			cacheRevision: cacheEntry.revision,
		});

		return success('authoring', startedAt, toSessionSnapshot(session, this.context.capabilities), {
			sessionId: session.sessionId,
			revision: session.revision,
		});
	}

	public async saveSession(input: SaveSessionInput): Promise<
		BackendResult<
			BackendSessionSnapshot | MaterializeSessionSnapshot,
			| SessionNotFoundError
			| SessionStaleWriteError
			| SavePartialFailureError
			| MaterializeValidationFailedError
			| MaterializeWriteFailedError
			| PathPolicyViolationError
			| InProcessLockConflictError
			| BackendCapabilityUnavailableError
		>
	> {
		if (input.force === true || input.mode === 'materializeCleanSession') {
			return this.materializeSession({
				sessionId: input.sessionId,
				expectedRevision: input.expectedRevision,
				targetPath: input.targetPath,
				fileSystem: input.fileSystem,
				mode: 'fullProject',
				reason: 'force_save',
			});
		}
		const startedAt = Date.now();
		const session = this.context.sessions.get(input.sessionId);
		if (!session || session.closed) {
			return failure('authoring', startedAt, createSessionNotFoundError(input.sessionId));
		}
		const fileSystem = input.fileSystem ?? session.fileSystem ?? this.context.fileSystem;
		if (!fileSystem) {
			return failure(
				'authoring',
				startedAt,
				createCapabilityUnavailableError(
					'saveSession requires an injected BackendFileSystem adapter.',
				),
				toSessionSnapshot(session, this.context.capabilities),
				{
					sessionId: session.sessionId,
					revision: session.revision,
				},
			);
		}
		if (input.expectedRevision !== undefined && input.expectedRevision !== session.revision) {
			return failure(
				'authoring',
				startedAt,
				createStaleWriteError(session, input.expectedRevision),
				toSessionSnapshot(session, this.context.capabilities),
				{
					sessionId: session.sessionId,
					revision: session.revision,
				},
			);
		}
		const targetViolation = await validateSaveTarget(fileSystem, session.fairyPath, input.targetPath);
		if (targetViolation) {
			return failure(
				'authoring',
				startedAt,
				targetViolation,
				toSessionSnapshot(session, this.context.capabilities),
				{
					sessionId: session.sessionId,
					revision: session.revision,
				},
			);
		}
		if (!session.dirty) {
			return success('authoring', startedAt, toSessionSnapshot(session, this.context.capabilities), {
				sessionId: session.sessionId,
				revision: session.revision,
			});
		}

		const committedPaths: string[] = [];
		const failedPaths: string[] = [];
		this.eventService.emit({
			kind: 'save.started',
			sessionId: session.sessionId,
			canonicalPathKey: session.canonicalPathKey,
			revision: session.revision,
		});
		try {
			const writer = new ProjectWriter(createWriterFileSystem(fileSystem, committedPaths, failedPaths));
			await writer.write(materializeUamProject(session.project), session.fairyPath);
			session.lastSavedRevision = session.revision;
			session.dirty = false;
			const cacheEntry = this.cacheService.refreshSession(session);
			this.eventService.emit({
				kind: 'save.completed',
				sessionId: session.sessionId,
				canonicalPathKey: session.canonicalPathKey,
				revision: session.revision,
			});
			this.eventService.emit({
				kind: 'cache.updated',
				sessionId: session.sessionId,
				canonicalPathKey: session.canonicalPathKey,
				revision: session.revision,
				cacheRevision: cacheEntry.revision,
			});
			return success('authoring', startedAt, toSessionSnapshot(session, this.context.capabilities), {
				sessionId: session.sessionId,
				revision: session.revision,
			});
		} catch (error) {
			this.cacheService.invalidateSession(session);
			this.eventService.emit({
				kind: 'save.failed',
				sessionId: session.sessionId,
				canonicalPathKey: session.canonicalPathKey,
				revision: session.revision,
			});
			return failure(
				'authoring',
				startedAt,
				{
					code: 'save_partial_failure',
					message: error instanceof Error ? error.message : String(error),
					sessionId: session.sessionId,
					canonicalPathKey: session.canonicalPathKey,
					attemptedRevision: session.revision,
					lastSavedRevision: session.lastSavedRevision,
					committedPaths,
					failedPaths,
					diskMayBePartiallyUpdated: true,
				},
				toSessionSnapshot(session, this.context.capabilities),
				{
					sessionId: session.sessionId,
					revision: session.revision,
				},
			);
		}
	}

	public async materializeSession(input: MaterializeSessionInput): Promise<
		BackendResult<
			MaterializeSessionSnapshot,
			| SessionNotFoundError
			| SessionStaleWriteError
			| MaterializeValidationFailedError
			| MaterializeWriteFailedError
			| PathPolicyViolationError
			| InProcessLockConflictError
			| BackendCapabilityUnavailableError
		>
	> {
		const startedAt = Date.now();
		const session = this.context.sessions.get(input.sessionId);
		if (!session || session.closed) {
			return failure('authoring', startedAt, createSessionNotFoundError(input.sessionId));
		}
		if (input.expectedRevision !== undefined && input.expectedRevision !== session.revision) {
			return failure(
				'authoring',
				startedAt,
				createStaleWriteError(session, input.expectedRevision),
				toSessionSnapshot(session, this.context.capabilities),
				{
					sessionId: session.sessionId,
					revision: session.revision,
				},
			);
		}

		const storageTarget = input.storage ? storageCanonicalTarget(input.storage) : null;
		const fileSystem = storageTarget?.fileSystem ?? input.fileSystem ?? session.fileSystem ?? this.context.fileSystem;
		if (!fileSystem) {
			return failure(
				'authoring',
				startedAt,
				createCapabilityUnavailableError(
					'materializeSession requires an injected BackendFileSystem adapter.',
				),
				toSessionSnapshot(session, this.context.capabilities),
				{
					sessionId: session.sessionId,
					revision: session.revision,
				},
			);
		}

		const fairyPath = storageTarget?.fairyPath ?? session.fairyPath;
		const targetViolation = await validateSaveTarget(fileSystem, fairyPath, input.targetPath);
		if (targetViolation) {
			return failure(
				'authoring',
				startedAt,
				targetViolation,
				toSessionSnapshot(session, this.context.capabilities),
				{
					sessionId: session.sessionId,
					revision: session.revision,
				},
			);
		}

		if (storageTarget) {
			const holderSessionId = this.context.sessionsByPath.get(storageTarget.canonicalPathKey);
			if (holderSessionId && holderSessionId !== session.sessionId) {
				return failure(
					'authoring',
					startedAt,
					{
						code: 'lock_conflict',
						kind: 'in_process_session_exists',
						message: `Project is already open in this backend runtime: ${storageTarget.canonicalProjectPath}`,
						canonicalPathKey: storageTarget.canonicalPathKey,
						holderSessionId,
					},
					toSessionSnapshot(session, this.context.capabilities),
					{
						sessionId: session.sessionId,
						revision: session.revision,
					},
				);
			}
		}

		const diagnostics = validationDiagnostics(session.project);
		if (diagnostics.length > 0) {
			const error: MaterializeValidationFailedError = {
				code: 'materialize_validation_failed',
				message: `UAM materialize validation failed with ${diagnostics.length} issue(s).`,
				sessionId: session.sessionId,
				canonicalPathKey: session.canonicalPathKey,
				issueCount: diagnostics.length,
				diagnostics,
			};
			return failure(
				'authoring',
				startedAt,
				error,
				toSessionSnapshot(session, this.context.capabilities),
				{
					sessionId: session.sessionId,
					revision: session.revision,
					diagnostics,
				},
			);
		}

		let document: ReturnType<typeof materializeUamProject>;
		try {
			document = materializeUamProject(session.project);
		} catch (error) {
			const diagnosticsFromError: BackendDiagnostic[] = [
				{
					code: 'materialize_validation_failed',
					message: error instanceof Error ? error.message : String(error),
					severity: 'error',
					operationKind: 'materializeSession',
				},
			];
			return failure(
				'authoring',
				startedAt,
				{
					code: 'materialize_validation_failed',
					message: error instanceof Error ? error.message : String(error),
					sessionId: session.sessionId,
					canonicalPathKey: session.canonicalPathKey,
					issueCount: diagnosticsFromError.length,
					diagnostics: diagnosticsFromError,
				},
				toSessionSnapshot(session, this.context.capabilities),
				{
					sessionId: session.sessionId,
					revision: session.revision,
					diagnostics: diagnosticsFromError,
				},
			);
		}

		const writtenPaths: string[] = [];
		const failedPaths: string[] = [];
		const skippedPaths: string[] = [];
		this.eventService.emit({
			kind: 'save.started',
			sessionId: session.sessionId,
			canonicalPathKey: storageTarget?.canonicalPathKey ?? session.canonicalPathKey,
			revision: session.revision,
		});
		try {
			const writer = new ProjectWriter(createWriterFileSystem(fileSystem, writtenPaths, failedPaths));
			await writer.write(document, fairyPath);
			if (storageTarget) {
				this.context.sessionsByPath.delete(session.canonicalPathKey);
				session.fileSystem = storageTarget.fileSystem;
				session.fairyPath = storageTarget.fairyPath;
				session.canonicalProjectPath = storageTarget.canonicalProjectPath;
				session.canonicalPathKey = storageTarget.canonicalPathKey;
				this.context.sessionsByPath.set(session.canonicalPathKey, session.sessionId);
			}
			session.lastSavedRevision = session.revision;
			session.dirty = false;
			const cacheEntry = this.cacheService.refreshSession(session);
			this.eventService.emit({
				kind: 'save.completed',
				sessionId: session.sessionId,
				canonicalPathKey: session.canonicalPathKey,
				revision: session.revision,
			});
			this.eventService.emit({
				kind: 'cache.updated',
				sessionId: session.sessionId,
				canonicalPathKey: session.canonicalPathKey,
				revision: session.revision,
				cacheRevision: cacheEntry.revision,
			});
			return success(
				'authoring',
				startedAt,
				toMaterializeSnapshot(session, this.context.capabilities, {
					reason: input.reason,
					writtenPaths,
					skippedPaths,
					diagnostics: [],
				}),
				{
					sessionId: session.sessionId,
					revision: session.revision,
				},
			);
		} catch (error) {
			const diagnosticsFromError: BackendDiagnostic[] = [
				{
					code: 'write_failed',
					message: error instanceof Error ? error.message : String(error),
					severity: 'error',
					path: failedPaths[0],
					operationKind: 'materializeSession',
				},
			];
			this.cacheService.invalidateSession(session);
			this.eventService.emit({
				kind: 'save.failed',
				sessionId: session.sessionId,
				canonicalPathKey: session.canonicalPathKey,
				revision: session.revision,
				diagnostics: diagnosticsFromError,
			});
			return failure(
				'authoring',
				startedAt,
				{
					code: 'write_failed',
					message: error instanceof Error ? error.message : String(error),
					sessionId: session.sessionId,
					canonicalPathKey: session.canonicalPathKey,
					attemptedRevision: session.revision,
					lastSavedRevision: session.lastSavedRevision,
					writtenPaths,
					failedPaths,
					skippedPaths,
					diagnostics: diagnosticsFromError,
					diskMayBePartiallyUpdated: true,
				},
				toSessionSnapshot(session, this.context.capabilities),
				{
					sessionId: session.sessionId,
					revision: session.revision,
					diagnostics: diagnosticsFromError,
				},
			);
		}
	}
}
