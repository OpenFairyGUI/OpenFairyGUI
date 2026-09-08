import type { ProjectBranchDirectory, ProjectResourceFolder, ProjectSourceFile } from '@openfairygui/core/project-io';
import { staleBranchDirectories, staleResourceFolders, staleSourceFiles, type UamProject } from '@openfairygui/core/uam';
import { type ApplyUamTransactionAppError, applyUamTransactionAppAsync } from '@openfairygui/functions/uam';
import type { BackendDiagnostic } from '../contracts.js';
import type { ApplySessionTransactionInput, BackendResult, BackendSessionSnapshot, BackendTransactionPreview, SessionNotFoundError, SessionStaleWriteError, TransactionPreviewError } from '../runtime/contracts.js';
import type { CacheService } from './cache-service.js';
import { type BackendContext, type BackendSessionState, failure, success } from './context.js';
import type { EventService } from './event-service.js';
import type { SessionOperationQueue } from './session-operation-queue.js';
import { createSessionNotFoundError, createStaleWriteError, toSessionSnapshot } from './session-utils.js';
import { PreviewBudgetError, previewTransactionImpact } from './transaction-preview.js';

function sourceFileKey(source: ProjectSourceFile): string {
	return [source.branch, source.packageName, source.path, source.fileName].join('\0');
}

function resourceFolderKey(folder: ProjectResourceFolder): string {
	return [folder.branch, folder.packageName, folder.path].join('\0');
}

function branchDirectoryKey(directory: ProjectBranchDirectory): string {
	return [directory.branch, directory.packageName ?? ''].join('\0');
}

function recordStaleProjectFiles(
	session: BackendSessionState,
	previousProject: UamProject,
	nextProject: UamProject,
): void {
	if (!session.fileSystem) return;
	for (const source of staleSourceFiles(previousProject, nextProject)) {
		session.pendingStaleSourceFiles.set(sourceFileKey(source), source);
	}
	for (const source of staleSourceFiles(nextProject, previousProject)) {
		session.pendingStaleSourceFiles.delete(sourceFileKey(source));
	}
	for (const folder of staleResourceFolders(previousProject, nextProject)) {
		session.pendingStaleResourceFolders.set(resourceFolderKey(folder), folder);
	}
	for (const folder of staleResourceFolders(nextProject, previousProject)) {
		session.pendingStaleResourceFolders.delete(resourceFolderKey(folder));
	}
	for (const directory of staleBranchDirectories(previousProject, nextProject)) {
		session.pendingStaleBranchDirectories.set(branchDirectoryKey(directory), directory);
	}
	for (const directory of staleBranchDirectories(nextProject, previousProject)) {
		session.pendingStaleBranchDirectories.delete(branchDirectoryKey(directory));
	}
}

function toBackendDiagnostics(error: ApplyUamTransactionAppError): BackendDiagnostic[] {
	return error.diagnostics.length > 0
		? error.diagnostics.map((diagnostic) => ({ ...diagnostic, owner: 'core.transaction' }))
		: [
				{
					code: error.code,
					owner: 'core.transaction',
					message: error.message,
					severity: 'error',
					operationKind: error.operationKind,
					opIndex: error.opIndex,
					opId: error.opId,
				},
			];
}

function detachSharedByteViews(value: unknown, seen = new WeakSet<object>()): void {
	if (!value || typeof value !== 'object' || seen.has(value)) return;
	seen.add(value);
	for (const [key, child] of Object.entries(value)) {
		if (child instanceof Uint8Array) {
			if (typeof SharedArrayBuffer !== 'undefined' && child.buffer instanceof SharedArrayBuffer) {
				(value as Record<string, unknown>)[key] = new Uint8Array(child);
			}
			continue;
		}
		detachSharedByteViews(child, seen);
	}
}

export class AuthoringService {
	public constructor(
		private readonly context: Pick<BackendContext, 'capabilities'> & { sessions: Pick<BackendContext['sessions'], 'get'> },
		private readonly cacheService: CacheService,
		private readonly eventService: EventService,
		private readonly sessionOperations: SessionOperationQueue,
	) {}

	public async preflightTransaction(
		input: ApplySessionTransactionInput,
	): Promise<BackendResult<BackendTransactionPreview, SessionNotFoundError | SessionStaleWriteError | ApplyUamTransactionAppError | TransactionPreviewError>> {
		const queuedInput = structuredClone(input);
		detachSharedByteViews(queuedInput);
		return this.sessionOperations.run(queuedInput.sessionId, async () => {
			const startedAt = Date.now();
			const session = this.context.sessions.get(queuedInput.sessionId);
			if (!session || session.closed) return failure('authoring', startedAt, createSessionNotFoundError(queuedInput.sessionId));
			const meta = { sessionId: session.sessionId, revision: session.revision };
			if (queuedInput.expectedRevision !== session.revision) {
				return failure('authoring', startedAt, createStaleWriteError(session, queuedInput.expectedRevision),
					toSessionSnapshot(session, this.context.capabilities), meta);
			}
			// The authoritative session, including source bytes, never enters the preview executor.
			const project = structuredClone(session.project);
			detachSharedByteViews(project);
			const result = await applyUamTransactionAppAsync({ project, operations: queuedInput.operations });
			if (this.context.sessions.get(queuedInput.sessionId) !== session || session.closed) {
				return failure('authoring', startedAt, createSessionNotFoundError(queuedInput.sessionId));
			}
			if (!result.ok) {
				return failure('authoring', startedAt, result.error, toSessionSnapshot(session, this.context.capabilities),
					{ ...meta, diagnostics: toBackendDiagnostics(result.error) });
			}
			try {
				const preview = await previewTransactionImpact({ ...session, project }, result.project, Boolean(session.fileSystem));
				if (this.context.sessions.get(queuedInput.sessionId) !== session || session.closed) {
					return failure('authoring', startedAt, createSessionNotFoundError(queuedInput.sessionId));
				}
				return success('authoring', startedAt, preview, meta);
			} catch (error) {
				return failure('authoring', startedAt, {
					code: 'transaction_preview_failed' as const, sessionId: session.sessionId,
					reason: error instanceof PreviewBudgetError ? 'response_budget_exceeded' as const : 'projection_failed' as const,
					message: error instanceof Error ? error.message : String(error),
				}, toSessionSnapshot(session, this.context.capabilities), meta);
			}
		});
	}

	public async applyTransaction(
		input: ApplySessionTransactionInput,
	): Promise<
		BackendResult<
			BackendSessionSnapshot,
			SessionNotFoundError | SessionStaleWriteError | ApplyUamTransactionAppError
		>
	> {
		const queuedInput = structuredClone(input);
		detachSharedByteViews(queuedInput);
		return this.sessionOperations.run(queuedInput.sessionId, () => this.applyTransactionExclusive(queuedInput));
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

		const result = await applyUamTransactionAppAsync({
			project: session.project,
			operations: input.operations,
		});
		if (this.context.sessions.get(input.sessionId) !== session || session.closed) {
			return failure('authoring', startedAt, createSessionNotFoundError(input.sessionId));
		}
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

}
