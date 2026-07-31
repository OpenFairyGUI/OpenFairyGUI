import type { ProjectResourceFolder, ProjectSourceFile } from '@openfairygui/core/project-io';
import {
	commitUamProjectSourcePaths,
	materializeUamProject,
	type UamProject,
	validateUamProject,
} from '@openfairygui/core/uam';
import { type ApplyUamTransactionAppError, applyUamTransactionApp } from '@openfairygui/functions/uam';
import type { BackendDiagnostic } from '../contracts.js';
import { normalizeComparablePath, type PathPolicyViolationError, validateSaveTarget } from '../path-policy.js';
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
	SavePartialFailureError,
	SaveSessionInput,
	SessionNotFoundError,
	SessionStaleWriteError,
	UamFidelityUnsupportedError,
} from '../runtime.js';
import type { CacheService } from './cache-service.js';
import { type BackendContext, failure, success } from './context.js';
import type { EventService } from './event-service.js';
import { writeSessionProject } from './session-project-writer.js';
import { createSessionNotFoundError, createStaleWriteError, toSessionSnapshot } from './session-utils.js';

function projectSourceFiles(project: UamProject): Map<string, ProjectSourceFile> {
	const result = new Map<string, ProjectSourceFile>();
	for (const pkg of project.packages) {
		result.set(`${pkg.id}/package.xml`, {
			packageName: pkg.name,
			branch: '',
			path: '',
			fileName: 'package.xml',
		});
		const branches = new Set<string>();
		for (const folder of pkg.folders) {
			if (folder.branch) branches.add(folder.branch);
		}
		for (const resource of pkg.resources) {
			if (resource.branch) branches.add(resource.branch);
			const fileName = resource.kind === 'component'
				? `${resource.name}.xml`
				: resource.fileName ?? (resource.kind === 'image' ? '' : resource.file) ?? '';
			if (!fileName) continue;
			result.set(`${pkg.id}/${resource.id}`, {
				packageName: pkg.name,
				branch: resource.branch,
				path: resource.path,
				fileName,
			});
		}
		for (const branch of branches) {
			result.set(`${pkg.id}/branch/${branch}`, {
				packageName: pkg.name,
				branch,
				path: '',
				fileName: 'package_branch.xml',
			});
		}
	}
	return result;
}

function sourceFileKey(source: ProjectSourceFile): string {
	return [source.branch, source.packageName, source.path, source.fileName].join('\0');
}

function projectResourceFolders(project: UamProject): Map<string, ProjectResourceFolder> {
	const result = new Map<string, ProjectResourceFolder>();
	for (const pkg of project.packages) {
		for (const folder of pkg.folders) {
			result.set(`${pkg.id}/${folder.branch}/${folder.path}`, {
				packageName: pkg.name,
				branch: folder.branch,
				path: folder.path,
			});
		}
	}
	return result;
}

function resourceFolderKey(folder: ProjectResourceFolder): string {
	return [folder.branch, folder.packageName, folder.path].join('\0');
}

function recordStaleProjectFiles(
	session: Parameters<typeof toSessionSnapshot>[0],
	previousProject: UamProject,
	nextProject: UamProject,
): void {
	if (!session.fileSystem) return;
	const previousSources = projectSourceFiles(previousProject);
	const nextSourceKeys = new Set([...projectSourceFiles(nextProject).values()].map(sourceFileKey));
	for (const source of previousSources.values()) {
		const key = sourceFileKey(source);
		if (!nextSourceKeys.has(key)) session.pendingStaleSourceFiles.set(key, source);
	}
	for (const key of nextSourceKeys) {
		session.pendingStaleSourceFiles.delete(key);
	}
	const previousFolders = projectResourceFolders(previousProject);
	const nextFolderKeys = new Set([...projectResourceFolders(nextProject).values()].map(resourceFolderKey));
	for (const folder of previousFolders.values()) {
		const key = resourceFolderKey(folder);
		if (!nextFolderKeys.has(key)) session.pendingStaleResourceFolders.set(key, folder);
	}
	for (const key of nextFolderKeys) {
		session.pendingStaleResourceFolders.delete(key);
	}
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

function createUamFidelityUnsupportedError(
	session: Parameters<typeof toSessionSnapshot>[0],
): UamFidelityUnsupportedError {
	return {
		code: 'uam_fidelity_unsupported',
		message: 'The source project contains formal properties that the current UAM cannot preserve.',
		sessionId: session.sessionId,
		canonicalPathKey: session.canonicalPathKey,
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
	private readonly sessionOperations = new Map<string, Promise<void>>();

	public constructor(
		private readonly context: BackendContext,
		private readonly cacheService: CacheService,
		private readonly eventService: EventService,
	) {}

	private async runSessionExclusive<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
		const previous = this.sessionOperations.get(sessionId) ?? Promise.resolve();
		let release = (): void => undefined;
		const current = new Promise<void>((resolve) => {
			release = resolve;
		});
		const tail = previous.then(() => current);
		this.sessionOperations.set(sessionId, tail);
		await previous;
		try {
			return await operation();
		} finally {
			release();
			if (this.sessionOperations.get(sessionId) === tail) this.sessionOperations.delete(sessionId);
		}
	}

	public async applyTransaction(
		input: ApplySessionTransactionInput,
	): Promise<
		BackendResult<
			BackendSessionSnapshot,
			SessionNotFoundError | SessionStaleWriteError | ApplyUamTransactionAppError
		>
	> {
		return this.runSessionExclusive(input.sessionId, () => this.applyTransactionExclusive(input));
	}

	private async applyTransactionExclusive(
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

		recordStaleProjectFiles(session, session.project, result.project);
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

	public async saveSession(
		input: SaveSessionInput,
	): Promise<
		BackendResult<
			BackendSessionSnapshot | MaterializeSessionSnapshot,
			| SessionNotFoundError
			| SessionStaleWriteError
			| SavePartialFailureError
			| UamFidelityUnsupportedError
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
		return this.runSessionExclusive(input.sessionId, () => this.saveSessionExclusive(input));
	}

	private async saveSessionExclusive(
		input: SaveSessionInput,
	): Promise<
		BackendResult<
			BackendSessionSnapshot | MaterializeSessionSnapshot,
			| SessionNotFoundError
			| SessionStaleWriteError
			| SavePartialFailureError
			| UamFidelityUnsupportedError
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
		const fileSystem = session.fileSystem ?? input.fileSystem ?? this.context.fileSystem;
		if (!fileSystem) {
			return failure(
				'authoring',
				startedAt,
				createCapabilityUnavailableError('saveSession requires an injected BackendFileSystem adapter.'),
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
		if (session.uamFidelity === 'unsupported') {
			return failure(
				'authoring',
				startedAt,
				createUamFidelityUnsupportedError(session),
				toSessionSnapshot(session, this.context.capabilities),
				{
					sessionId: session.sessionId,
					revision: session.revision,
				},
			);
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
			await writeSessionProject({
				fileSystem,
				document: materializeUamProject(session.project),
				fairyPath: session.fairyPath,
				staleSourceFiles: [...session.pendingStaleSourceFiles.values()],
				staleResourceFolders: [...session.pendingStaleResourceFolders.values()],
				writtenPaths: committedPaths,
				failedPaths,
			});
			session.fileSystem ??= fileSystem;
			session.pendingStaleSourceFiles.clear();
			session.pendingStaleResourceFolders.clear();
			commitUamProjectSourcePaths(session.project);
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

	public async materializeSession(
		input: MaterializeSessionInput,
	): Promise<
		BackendResult<
			MaterializeSessionSnapshot,
			| SessionNotFoundError
			| SessionStaleWriteError
			| UamFidelityUnsupportedError
			| MaterializeValidationFailedError
			| MaterializeWriteFailedError
			| PathPolicyViolationError
			| InProcessLockConflictError
			| BackendCapabilityUnavailableError
		>
	> {
		return this.runSessionExclusive(input.sessionId, () => this.materializeSessionExclusive(input));
	}

	private async materializeSessionExclusive(
		input: MaterializeSessionInput,
	): Promise<
		BackendResult<
			MaterializeSessionSnapshot,
			| SessionNotFoundError
			| SessionStaleWriteError
			| UamFidelityUnsupportedError
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
		const fileSystem =
			storageTarget?.fileSystem ?? input.fileSystem ?? session.fileSystem ?? this.context.fileSystem;
		if (!fileSystem) {
			return failure(
				'authoring',
				startedAt,
				createCapabilityUnavailableError('materializeSession requires an injected BackendFileSystem adapter.'),
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

		if (session.uamFidelity === 'unsupported') {
			return failure(
				'authoring',
				startedAt,
				createUamFidelityUnsupportedError(session),
				toSessionSnapshot(session, this.context.capabilities),
				{
					sessionId: session.sessionId,
					revision: session.revision,
				},
			);
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
			return failure('authoring', startedAt, error, toSessionSnapshot(session, this.context.capabilities), {
				sessionId: session.sessionId,
				revision: session.revision,
				diagnostics,
			});
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
			const isSessionStorageTarget = fileSystem === session.fileSystem && fairyPath === session.fairyPath;
			await writeSessionProject({
				fileSystem,
				document,
				fairyPath,
				staleSourceFiles: isSessionStorageTarget ? [...session.pendingStaleSourceFiles.values()] : [],
				staleResourceFolders: isSessionStorageTarget ? [...session.pendingStaleResourceFolders.values()] : [],
				writtenPaths,
				failedPaths,
			});
			if (isSessionStorageTarget) {
				session.pendingStaleSourceFiles.clear();
				session.pendingStaleResourceFolders.clear();
			}
			if (storageTarget && !isSessionStorageTarget) {
				session.pendingStaleSourceFiles.clear();
				session.pendingStaleResourceFolders.clear();
			}
			if (isSessionStorageTarget || storageTarget) commitUamProjectSourcePaths(session.project);
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
