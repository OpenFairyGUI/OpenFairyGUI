import {
	type FileSystem,
	NodeIO,
	ProjectWriter,
	UAM_SUPPORTED_MATERIALIZATION_SCOPE,
	materializeUamProject,
	readProjectAsUam,
	type UamProject,
	type UamTransactionOperation,
} from '@openfairygui/core';
import {
	applyUamTransactionApp,
	type ApplyUamTransactionAppError,
} from '@openfairygui/functions';
import fs from 'node:fs/promises';
import type { Stats } from 'node:fs';
import path from 'node:path';

export interface BackendFileHandle {
	writeFile(content: string): Promise<void>;
	close(): Promise<void>;
}

export interface BackendFileSystem {
	stat(filePath: string): Promise<Stats>;
	readdir(dirPath: string): Promise<string[]>;
	readFile(filePath: string): Promise<string>;
	readFileRaw(filePath: string): Promise<Uint8Array>;
	writeFile(filePath: string, content: string): Promise<void>;
	writeFileRaw(filePath: string, data: Uint8Array): Promise<void>;
	mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void>;
	resolvePath(filePath: string): Promise<string>;
	openExclusive(filePath: string): Promise<BackendFileHandle>;
	unlink(filePath: string): Promise<void>;
	join(...paths: string[]): string;
	dirname(filePath: string): string;
	resolve(...paths: string[]): string;
}

export interface BackendCapabilities {
	transactionKernelOwner: '@openfairygui/core';
	appSeamOwner: '@openfairygui/functions';
	runtimeOwner: '@openfairygui/backend';
	methods: readonly ['getCapabilities', 'openSession', 'getSession', 'applyTransaction', 'saveSession', 'closeSession'];
	authoring: {
		resourceKinds: readonly string[];
		nodeKinds: readonly string[];
		gearKinds: readonly string[];
	};
	runtime: {
		sessionRuntime: true;
		advisoryLocking: true;
		coordinatedSave: true;
		atomicSave: false;
		staleRevisionProtection: true;
	};
}

export interface BackendSessionSnapshot {
	sessionId: string;
	canonicalProjectPath: string;
	revision: number;
	lastSavedRevision: number;
	dirty: boolean;
	lockHeld: boolean;
	capabilities: BackendCapabilities;
}

export interface BackendSuccess<T> {
	ok: true;
	data: T;
}

export interface BackendFailure<E extends BackendError = BackendError> {
	ok: false;
	error: E;
	session?: BackendSessionSnapshot;
}

export type BackendResult<T, E extends BackendError = BackendError> =
	| BackendSuccess<T>
	| BackendFailure<E>;

export interface SessionNotFoundError {
	code: 'session_not_found';
	message: string;
	sessionId: string;
}

export interface SessionStaleWriteError {
	code: 'stale_write';
	message: string;
	sessionId: string;
	canonicalPathKey: string;
	expectedRevision: number;
	actualRevision: number;
}

export interface InProcessLockConflictError {
	code: 'lock_conflict';
	kind: 'in_process_session_exists';
	message: string;
	canonicalPathKey: string;
	holderSessionId: string;
	lockFilePath?: string;
}

export interface AdvisoryLockConflictError {
	code: 'lock_conflict';
	kind: 'advisory_lock_conflict';
	message: string;
	canonicalPathKey: string;
	holderSessionId?: string;
	lockFilePath: string;
}

export interface SavePartialFailureError {
	code: 'save_partial_failure';
	message: string;
	sessionId: string;
	canonicalPathKey: string;
	attemptedRevision: number;
	lastSavedRevision: number;
	committedPaths: string[];
	failedPaths: string[];
	diskMayBePartiallyUpdated: true;
}

export type BackendError =
	| SessionNotFoundError
	| SessionStaleWriteError
	| InProcessLockConflictError
	| AdvisoryLockConflictError
	| SavePartialFailureError
	| ApplyUamTransactionAppError;

export interface ApplySessionTransactionInput {
	sessionId: string;
	expectedRevision: number;
	operations: UamTransactionOperation[];
}

export interface BackendRuntimeOptions {
	fileSystem?: BackendFileSystem;
}

const BACKEND_METHODS = ['getCapabilities', 'openSession', 'getSession', 'applyTransaction', 'saveSession', 'closeSession'] as const;

interface BackendSessionState {
	sessionId: string;
	fairyPath: string;
	canonicalProjectPath: string;
	canonicalPathKey: string;
	lockFilePath: string;
	project: UamProject;
	revision: number;
	lastSavedRevision: number;
	dirty: boolean;
	lockHeld: boolean;
	closed: boolean;
}

function createCapabilities(): BackendCapabilities {
	return {
		transactionKernelOwner: '@openfairygui/core',
		appSeamOwner: '@openfairygui/functions',
		runtimeOwner: '@openfairygui/backend',
		methods: BACKEND_METHODS,
		authoring: {
			resourceKinds: [...UAM_SUPPORTED_MATERIALIZATION_SCOPE.resourceKinds],
			nodeKinds: [...UAM_SUPPORTED_MATERIALIZATION_SCOPE.nodeKinds],
			gearKinds: [...UAM_SUPPORTED_MATERIALIZATION_SCOPE.gearKinds],
		},
		runtime: {
			sessionRuntime: true,
			advisoryLocking: true,
			coordinatedSave: true,
			atomicSave: false,
			staleRevisionProtection: true,
		},
	};
}

function normalizeComparablePath(value: string): string {
	const normalized = value.replace(/[/\\]+$/, '').replace(/\\/g, '/');
	const driveMatch = normalized.match(/^([a-z]:)(?:\/(.*))?$/i);
	const drivePrefix = driveMatch?.[1].toLowerCase() ?? '';
	const remainder = driveMatch ? (driveMatch[2] ?? '') : normalized;
	const hasRoot = driveMatch ? true : remainder.startsWith('/');
	const rawSegments = remainder.split('/').filter((segment) => segment.length > 0);
	const segments: string[] = [];

	for (const segment of rawSegments) {
		if (segment === '.') continue;
		if (segment === '..') {
			if (segments.length > 0 && segments[segments.length - 1] !== '..') {
				segments.pop();
			} else if (!hasRoot) {
				segments.push('..');
			}
			continue;
		}
		segments.push(segment);
	}

	const joined = segments.join('/');
	const comparable = drivePrefix
		? `${drivePrefix}/${joined}`.replace(/\/$/, '')
		: hasRoot
			? `/${joined}`.replace(/\/$/, '')
			: joined || '.';
	return comparable.toLowerCase();
}

async function resolveFairyPath(fileSystem: BackendFileSystem, input: string): Promise<string> {
	const resolvedInput = fileSystem.resolve(input);
	const stat = await fileSystem.stat(resolvedInput);

	if (stat.isFile() && resolvedInput.endsWith('.fairy')) {
		return await fileSystem.resolvePath(resolvedInput);
	}

	if (stat.isDirectory()) {
		const entries = await fileSystem.readdir(resolvedInput);
		const fairyFiles = entries.filter((entry) => entry.endsWith('.fairy'));
		if (fairyFiles.length === 1) {
			return await fileSystem.resolvePath(fileSystem.join(resolvedInput, fairyFiles[0]!));
		}
		if (fairyFiles.length > 1) {
			throw new Error(`Multiple .fairy files found in ${resolvedInput}: ${fairyFiles.join(', ')}`);
		}
		throw new Error(`No .fairy file found in ${resolvedInput}`);
	}

	throw new Error(`Input is not a .fairy file or directory: ${resolvedInput}`);
}

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

function toSessionSnapshot(session: BackendSessionState, capabilities: BackendCapabilities): BackendSessionSnapshot {
	return {
		sessionId: session.sessionId,
		canonicalProjectPath: session.canonicalProjectPath,
		revision: session.revision,
		lastSavedRevision: session.lastSavedRevision,
		dirty: session.dirty,
		lockHeld: session.lockHeld,
		capabilities,
	};
}

function randomId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createSessionNotFoundError(sessionId: string): SessionNotFoundError {
	return {
		code: 'session_not_found',
		message: `Session was not found: ${sessionId}`,
		sessionId,
	};
}

function createStaleWriteError(
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

export function createNodeBackendFileSystem(): BackendFileSystem {
	return {
		stat(filePath: string): Promise<Stats> {
			return fs.stat(filePath);
		},
		readdir(dirPath: string): Promise<string[]> {
			return fs.readdir(dirPath);
		},
		readFile(filePath: string): Promise<string> {
			return fs.readFile(filePath, 'utf-8');
		},
		async readFileRaw(filePath: string): Promise<Uint8Array> {
			const buffer = await fs.readFile(filePath);
			return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
		},
		writeFile(filePath: string, content: string): Promise<void> {
			return fs.writeFile(filePath, content, 'utf-8');
		},
		writeFileRaw(filePath: string, data: Uint8Array): Promise<void> {
			return fs.writeFile(filePath, data);
		},
		async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
			await fs.mkdir(dirPath, { recursive: options?.recursive ?? false });
		},
		async resolvePath(filePath: string): Promise<string> {
			try {
				return await fs.realpath(filePath);
			} catch {
				return path.resolve(filePath);
			}
		},
		async openExclusive(filePath: string): Promise<BackendFileHandle> {
			const handle = await fs.open(filePath, 'wx');
			return {
				writeFile(content: string): Promise<void> {
					return handle.writeFile(content, 'utf-8');
				},
				close(): Promise<void> {
					return handle.close();
				},
			};
		},
		unlink(filePath: string): Promise<void> {
			return fs.unlink(filePath);
		},
		join(...paths: string[]): string {
			return path.join(...paths);
		},
		dirname(filePath: string): string {
			return path.dirname(filePath);
		},
		resolve(...paths: string[]): string {
			return path.resolve(...paths);
		},
	};
}

export class BackendRuntime {
	private readonly fileSystem: BackendFileSystem;
	private readonly capabilities: BackendCapabilities;
	private readonly sessions = new Map<string, BackendSessionState>();
	private readonly sessionsByPath = new Map<string, string>();

	public constructor(options: BackendRuntimeOptions = {}) {
		this.fileSystem = options.fileSystem ?? createNodeBackendFileSystem();
		this.capabilities = createCapabilities();
	}

	public getCapabilities(): BackendSuccess<BackendCapabilities> {
		return {
			ok: true,
			data: this.capabilities,
		};
	}

	public async openSession(input: { projectPath: string }): Promise<BackendResult<BackendSessionSnapshot, InProcessLockConflictError | AdvisoryLockConflictError>> {
		const fairyPath = await resolveFairyPath(this.fileSystem, input.projectPath);
		const canonicalProjectPath = await this.fileSystem.resolvePath(this.fileSystem.dirname(fairyPath));
		const canonicalPathKey = normalizeComparablePath(canonicalProjectPath);
		const existingSessionId = this.sessionsByPath.get(canonicalPathKey);
		const lockFilePath = this.fileSystem.join(canonicalProjectPath, '.openfairygui.backend.lock');

		if (existingSessionId) {
			return {
				ok: false,
				error: {
					code: 'lock_conflict',
					kind: 'in_process_session_exists',
					message: `Project is already open in this backend runtime: ${canonicalProjectPath}`,
					canonicalPathKey,
					holderSessionId: existingSessionId,
					lockFilePath,
				},
			};
		}

		let advisoryLock: BackendFileHandle | null = null;
		try {
			advisoryLock = await this.fileSystem.openExclusive(lockFilePath);
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
			this.sessions.set(sessionId, session);
			this.sessionsByPath.set(canonicalPathKey, sessionId);

			return {
				ok: true,
				data: toSessionSnapshot(session, this.capabilities),
			};
		} catch (error) {
			if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') {
				return {
					ok: false,
					error: {
						code: 'lock_conflict',
						kind: 'advisory_lock_conflict',
						message: `Advisory lock already exists for project: ${canonicalProjectPath}`,
						canonicalPathKey,
						lockFilePath,
					},
				};
			}
			if (advisoryLock) {
				await advisoryLock.close().catch(() => undefined);
				await this.fileSystem.unlink(lockFilePath).catch(() => undefined);
			}
			throw error;
		}
	}

	public getSession(input: { sessionId: string }): BackendResult<BackendSessionSnapshot, SessionNotFoundError> {
		const session = this.sessions.get(input.sessionId);
		if (!session || session.closed) {
			return {
				ok: false,
				error: createSessionNotFoundError(input.sessionId),
			};
		}

		return {
			ok: true,
			data: toSessionSnapshot(session, this.capabilities),
		};
	}

	public async applyTransaction(
		input: ApplySessionTransactionInput,
	): Promise<BackendResult<BackendSessionSnapshot, SessionNotFoundError | SessionStaleWriteError | ApplyUamTransactionAppError>> {
		const session = this.sessions.get(input.sessionId);
		if (!session || session.closed) {
			return {
				ok: false,
				error: createSessionNotFoundError(input.sessionId),
			};
		}
		if (input.expectedRevision !== session.revision) {
			return {
				ok: false,
				error: createStaleWriteError(session, input.expectedRevision),
				session: toSessionSnapshot(session, this.capabilities),
			};
		}

		const result = applyUamTransactionApp({
			project: session.project,
			operations: input.operations,
		});
		if (result.ok === false) {
			return {
				ok: false,
				error: result.error,
				session: toSessionSnapshot(session, this.capabilities),
			};
		}

		session.project = result.project;
		session.revision += 1;
		session.dirty = true;

		return {
			ok: true,
			data: toSessionSnapshot(session, this.capabilities),
		};
	}

	public async saveSession(
		input: { sessionId: string; expectedRevision?: number },
	): Promise<BackendResult<BackendSessionSnapshot, SessionNotFoundError | SessionStaleWriteError | SavePartialFailureError>> {
		const session = this.sessions.get(input.sessionId);
		if (!session || session.closed) {
			return {
				ok: false,
				error: createSessionNotFoundError(input.sessionId),
			};
		}
		if (input.expectedRevision !== undefined && input.expectedRevision !== session.revision) {
			return {
				ok: false,
				error: createStaleWriteError(session, input.expectedRevision),
				session: toSessionSnapshot(session, this.capabilities),
			};
		}
		if (!session.dirty) {
			return {
				ok: true,
				data: toSessionSnapshot(session, this.capabilities),
			};
		}

		const committedPaths: string[] = [];
		const failedPaths: string[] = [];
		try {
			const writer = new ProjectWriter(createWriterFileSystem(this.fileSystem, committedPaths, failedPaths));
			await writer.write(materializeUamProject(session.project), session.fairyPath);
			session.lastSavedRevision = session.revision;
			session.dirty = false;
			return {
				ok: true,
				data: toSessionSnapshot(session, this.capabilities),
			};
		} catch (error) {
			return {
				ok: false,
				error: {
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
				session: toSessionSnapshot(session, this.capabilities),
			};
		}
	}

	public async closeSession(
		input: { sessionId: string },
	): Promise<BackendResult<{ sessionId: string; closed: true }, SessionNotFoundError>> {
		const session = this.sessions.get(input.sessionId);
		if (!session || session.closed) {
			return {
				ok: false,
				error: createSessionNotFoundError(input.sessionId),
			};
		}

		await this.fileSystem.unlink(session.lockFilePath).catch(() => undefined);
		session.lockHeld = false;
		session.closed = true;
		this.sessions.delete(session.sessionId);
		this.sessionsByPath.delete(session.canonicalPathKey);

		return {
			ok: true,
			data: {
				sessionId: session.sessionId,
				closed: true,
			},
		};
	}
}
