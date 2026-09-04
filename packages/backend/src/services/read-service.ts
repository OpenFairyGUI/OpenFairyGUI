import { failure, success, type BackendContext, type BackendSessionState } from './context.js';
import type {
	BackendCapabilities,
	BackendProjectOutline,
	BackendResult,
	BackendSessionSnapshot,
	GetProjectOutlineInput,
	QueryEntityInput,
	BackendEntitySnapshot,
	BackendResourceSnapshot,
	EntityQueryError,
	SessionNotFoundError,
} from '../runtime.js';
import { createSessionNotFoundError, toSessionSnapshot } from './session-utils.js';
import { validateProject } from '@openfairygui/functions';
import type { ProjectValidationReport } from '@openfairygui/core';
import { BACKEND_ENTITY_QUERY_LIMITS, BACKEND_RESOURCE_QUERY_FIELDS } from '../runtime/contracts.js';

/** Bound traversal before serialization or cloning, including non-JSON values on a malformed native input. */
function queryResponseProblem(value: unknown): EntityQueryError['reason'] | undefined {
	const pending = [{ value, depth: 0 }];
	let nodes = 0;
	let stringUnits = 0;
	while (pending.length) {
		const { value, depth } = pending.pop()!;
		if (++nodes > BACKEND_ENTITY_QUERY_LIMITS.maxNodes || depth > BACKEND_ENTITY_QUERY_LIMITS.maxDepth) return 'response_budget_exceeded';
		if (typeof value === 'string' && (stringUnits += value.length) > BACKEND_ENTITY_QUERY_LIMITS.maxBytes) return 'response_budget_exceeded';
		if (value === undefined || value === null || typeof value === 'string' || typeof value === 'boolean') continue;
		if (typeof value === 'number') { if (!Number.isFinite(value)) return 'non_json_value'; continue; }
		if (typeof value !== 'object' || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) return 'non_json_value';
		if (Array.isArray(value) && value.length + pending.length + nodes > BACKEND_ENTITY_QUERY_LIMITS.maxNodes) return 'response_budget_exceeded';
		const entries = Object.entries(value);
		if (entries.length + pending.length + nodes > BACKEND_ENTITY_QUERY_LIMITS.maxNodes) return 'response_budget_exceeded';
		for (const [key, child] of entries) {
			if (!Array.isArray(value) && (stringUnits += key.length) > BACKEND_ENTITY_QUERY_LIMITS.maxBytes) return 'response_budget_exceeded';
			pending.push({ value: child, depth: depth + 1 });
		}
	}
	if (new TextEncoder().encode(JSON.stringify(value)).byteLength > BACKEND_ENTITY_QUERY_LIMITS.maxBytes) return 'response_budget_exceeded';
	return undefined;
}

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

	public queryEntity(input: QueryEntityInput): BackendResult<BackendEntitySnapshot, SessionNotFoundError | EntityQueryError> {
		const startedAt = Date.now();
		const session = this.context.sessions.get(input.sessionId);
		if (!session || session.closed) return failure('read', startedAt, createSessionNotFoundError(input.sessionId));
		const meta = { sessionId: session.sessionId, revision: session.revision };
		const reject = (reason: EntityQueryError['reason']) => failure('read', startedAt, {
			code: 'entity_query_failed' as const, sessionId: session.sessionId, reason,
			message: `Entity query failed: ${reason}.`,
		}, undefined, meta);
		const target = input.target;
		if (!target || typeof target !== 'object' || Array.isArray(target) || Object.keys(target).some((key) => key !== 'kind' && key !== 'selector')) return reject('invalid_query');
		const keys = target.kind === 'resource' ? ['packageId', 'resourceId']
			: target.kind === 'component' ? ['packageId', 'componentResourceId']
			: target.kind === 'displayNode' ? ['packageId', 'componentResourceId', 'displayNodeId'] : [];
		const selector = target.selector as unknown as Record<string, unknown>;
		if (!keys.length || !selector || typeof selector !== 'object' || Array.isArray(selector)
			|| Object.keys(selector).length !== keys.length
			|| keys.some((key) => !Object.hasOwn(selector, key) || typeof selector[key] !== 'string' || !(selector[key] as string).length || (selector[key] as string).length > 256)) return reject('invalid_query');
		const packages = session.project.packages.filter((pkg) => pkg.id === selector.packageId);
		if (packages.length !== 1) return reject(packages.length ? 'ambiguous' : 'not_found');
		const resources = packages[0].resources.filter((resource) => resource.id === (target.kind === 'resource' ? selector.resourceId : selector.componentResourceId));
		if (resources.length !== 1) return reject(resources.length ? 'ambiguous' : 'not_found');
		const resource = resources[0];
		let entity: BackendEntitySnapshot['entity'];
		if (target.kind === 'resource') {
			const record = resource as unknown as Record<string, unknown>;
			entity = { kind: 'resource', properties: Object.fromEntries(BACKEND_RESOURCE_QUERY_FIELDS
				.filter((key) => Object.hasOwn(record, key)).map((key) => [key, record[key]])) as BackendResourceSnapshot };
		} else {
			if (resource.kind !== 'component') return reject('not_found');
			if (target.kind === 'component') {
				const { size, properties, customData } = resource.component;
				entity = { kind: 'component', properties: { size, properties, customData } };
			} else {
				const nodes = resource.component.displayList.filter((node) => node.id === selector.displayNodeId);
				if (nodes.length !== 1) return reject(nodes.length ? 'ambiguous' : 'not_found');
				entity = { kind: 'displayNode', properties: nodes[0] };
			}
		}
		const data = { ...meta, target, entity };
		const problem = queryResponseProblem(data);
		if (problem) return reject(problem);
		return success('read', startedAt, structuredClone(data), meta);
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
