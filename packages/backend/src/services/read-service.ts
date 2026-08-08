import { failure, success, type BackendContext, type BackendSessionState } from './context.js';
import type {
	BackendCapabilities,
	BackendProjectOutline,
	BackendResult,
	BackendSessionSnapshot,
	GetProjectOutlineInput,
	SessionNotFoundError,
} from '../runtime.js';
import { createSessionNotFoundError, toSessionSnapshot } from './session-utils.js';
import { validateProject } from '@openfairygui/functions';
import type { ProjectValidationReport } from '@openfairygui/core';

function toProjectOutline(session: BackendSessionState): BackendProjectOutline {
	const project = session.project;
	// ponytail: full outline is O(project size); add filters or pagination only if payload size becomes a measured problem.
	return {
		sessionId: session.sessionId,
		revision: session.revision,
		projectId: project.projectId,
		projectType: project.projectType,
		version: project.version,
		branches: [...project.branches],
		packages: project.packages.map((pkg) => ({
			id: pkg.id,
			name: pkg.name,
			branchNames: [...pkg.branchNames],
			folders: pkg.folders.map((folder) => ({ branch: folder.branch, path: folder.path })),
			resources: pkg.resources.map((resource) => ({
				id: resource.id,
				name: resource.name,
				path: resource.path,
				kind: resource.kind,
				branch: resource.branch,
				...(resource.kind === 'component' ? {
					component: {
						displayList: resource.component.displayList.map((node) => ({
							id: node.id,
							name: node.name,
							kind: node.kind,
						})),
						controllers: resource.component.controllers.map((controller) => ({
							name: controller.name,
							pages: controller.pages.map((page) => ({ id: page.id, name: page.name })),
						})),
						transitions: resource.component.transitions.map((transition) => ({ name: transition.name })),
					},
				} : {}),
			})),
		})),
	};
}

export class ReadService {
	public constructor(private readonly context: BackendContext) {}

	public getCapabilities(): BackendResult<BackendCapabilities> {
		return success('read', Date.now(), structuredClone(this.context.capabilities));
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

	public getProjectOutline(
		input: GetProjectOutlineInput,
	): BackendResult<BackendProjectOutline, SessionNotFoundError> {
		const startedAt = Date.now();
		const session = this.context.sessions.get(input.sessionId);
		if (!session || session.closed) {
			return failure('read', startedAt, createSessionNotFoundError(input.sessionId));
		}
		return success('read', startedAt, toProjectOutline(session), {
			sessionId: session.sessionId,
			revision: session.revision,
		});
	}

	public validateSession(
		input: { sessionId: string },
	): BackendResult<ProjectValidationReport, SessionNotFoundError> {
		const startedAt = Date.now();
		const session = this.context.sessions.get(input.sessionId);
		if (!session || session.closed) {
			return failure('read', startedAt, createSessionNotFoundError(input.sessionId));
		}
		const report = validateProject(session.project, {
			readDiagnostics: session.readDiagnostics,
			complete: session.readComplete,
			validateSources: true,
		});
		return success('read', startedAt, report, {
			sessionId: session.sessionId,
			revision: session.revision,
			diagnostics: report.diagnostics.map(({ code, message, severity, path }) => ({ code, message, severity, path })),
		});
	}
}
