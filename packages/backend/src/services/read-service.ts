import {
	failure,
	success,
	cloneReadData,
	type ReadonlyData,
	type SessionLookup,
	type SessionReadView,
} from './context.js';
import type {
	BackendCapabilities,
	BackendDisplayNodeCandidate,
	BackendDisplayNodeQueryResult,
	BackendProjectOutline,
	BackendResult,
	BackendSessionSnapshot,
	DisplayNodeFilter,
	GetProjectOutlineInput,
	QueryDisplayNodesInput,
	QueryEntityInput,
	BackendEntitySnapshot,
	BackendResourceSnapshot,
	EntityQueryError,
	SessionNotFoundError,
	ReadSessionStateInput,
	ReadResourceBytesInput,
	BackendSessionStateSnapshot,
	BackendResourceBytesSnapshot,
	SessionReadError,
	SessionStaleReadError,
} from '../runtime.js';
import { createSessionNotFoundError, toSessionSnapshot } from './session-utils.js';
import { validateProject } from '@openfairygui/functions';
import type { ProjectValidationReport } from '@openfairygui/core';
import type { UamDisplayNode, UamDisplayNodeKind } from '@openfairygui/core/uam';
import {
	BACKEND_DISPLAY_NODE_FILTER_FIELDS,
	BACKEND_DISPLAY_NODE_QUERY_LIMITS,
	BACKEND_ENTITY_QUERY_LIMITS,
	BACKEND_RESOURCE_QUERY_FIELDS,
	BACKEND_SESSION_READ_LIMITS,
} from '../runtime/contracts.js';

const DISPLAY_NODE_KINDS: ReadonlySet<string> = new Set<UamDisplayNodeKind>([
	'image',
	'text',
	'richText',
	'textInput',
	'component',
	'list',
	'tree',
	'graph',
	'group',
	'loader',
	'loader3D',
	'movieClip',
	'button',
	'label',
	'comboBox',
	'progressBar',
	'slider',
	'scrollBar',
]);
const DISPLAY_NODE_FILTER_KEY_SET: ReadonlySet<string> = new Set<string>(BACKEND_DISPLAY_NODE_FILTER_FIELDS);
const DISPLAY_NODE_FILTER_EXACT_STRINGS = ['name', 'text', 'title', 'group', 'url'] as const;
const DISPLAY_NODE_FILTER_CONTAINS_STRINGS = ['nameContains', 'textContains', 'titleContains'] as const;
const DISPLAY_NODE_FILTER_BOOLEANS = ['visible', 'locked', 'touchable', 'hasGears', 'hasRelations'] as const;
const DISPLAY_NODE_QUERY_INPUT_KEYS = new Set(['sessionId', 'selector', 'filter', 'limit']);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return (
		typeof value === 'object' &&
		value !== null &&
		!Array.isArray(value) &&
		(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
	);
}

function isValidDisplayNodeFilter(value: unknown): value is DisplayNodeFilter {
	if (!isPlainRecord(value)) return false;
	for (const key of Object.keys(value)) {
		if (!DISPLAY_NODE_FILTER_KEY_SET.has(key)) return false;
	}
	if (value.kind !== undefined && (typeof value.kind !== 'string' || !DISPLAY_NODE_KINDS.has(value.kind))) {
		return false;
	}
	for (const key of DISPLAY_NODE_FILTER_EXACT_STRINGS) {
		const entry = value[key];
		if (entry !== undefined && (typeof entry !== 'string' || entry.length > 1024)) return false;
	}
	for (const key of DISPLAY_NODE_FILTER_CONTAINS_STRINGS) {
		const entry = value[key];
		if (entry !== undefined && (typeof entry !== 'string' || !entry.length || entry.length > 1024)) return false;
	}
	if (
		value.resourceId !== undefined &&
		(typeof value.resourceId !== 'string' || !value.resourceId.length || value.resourceId.length > 256)
	) {
		return false;
	}
	for (const key of DISPLAY_NODE_FILTER_BOOLEANS) {
		const entry = value[key];
		if (entry !== undefined && typeof entry !== 'boolean') return false;
	}
	return true;
}

function displayNodeText(node: ReadonlyData<UamDisplayNode>): string | undefined {
	if (node.kind === 'text' || node.kind === 'richText' || node.kind === 'textInput') {
		return node.text;
	}
	return undefined;
}

function displayNodeTitle(node: ReadonlyData<UamDisplayNode>): string | undefined {
	if (node.kind === 'button' || node.kind === 'label' || node.kind === 'comboBox') {
		return node.title;
	}
	if (
		node.kind === 'component' &&
		node.instanceProperties &&
		'title' in node.instanceProperties &&
		typeof node.instanceProperties.title === 'string'
	) {
		return node.instanceProperties.title;
	}
	return undefined;
}

function displayNodeGroup(node: ReadonlyData<UamDisplayNode>): string | undefined {
	return 'group' in node ? node.group : undefined;
}

function displayNodeResource(
	node: ReadonlyData<UamDisplayNode>,
): { packageId?: string; resourceId: string } | undefined {
	if (node.kind === 'image' || node.kind === 'component' || node.kind === 'movieClip') {
		return {
			...(node.resource.packageId !== undefined ? { packageId: node.resource.packageId } : {}),
			resourceId: node.resource.resourceId,
		};
	}
	if ('src' in node && typeof node.src === 'string' && node.src.length > 0) {
		const packageId =
			'packageId' in node && typeof node.packageId === 'string' && node.packageId.length > 0
				? node.packageId
				: undefined;
		return {
			...(packageId !== undefined ? { packageId } : {}),
			resourceId: node.src,
		};
	}
	return undefined;
}

function displayNodeUrl(node: ReadonlyData<UamDisplayNode>): string | undefined {
	if (node.kind === 'loader' || node.kind === 'loader3D') {
		return node.url;
	}
	return undefined;
}

function matchesDisplayNodeFilter(node: ReadonlyData<UamDisplayNode>, filter: DisplayNodeFilter | undefined): boolean {
	if (!filter) return true;
	if (filter.kind !== undefined && node.kind !== filter.kind) return false;
	if (filter.name !== undefined && node.name !== filter.name) return false;
	if (filter.nameContains !== undefined && !node.name.includes(filter.nameContains)) return false;
	if (filter.text !== undefined || filter.textContains !== undefined) {
		const text = displayNodeText(node);
		if (typeof text !== 'string') return false;
		if (filter.text !== undefined && text !== filter.text) return false;
		if (filter.textContains !== undefined && !text.includes(filter.textContains)) return false;
	}
	if (filter.title !== undefined || filter.titleContains !== undefined) {
		const title = displayNodeTitle(node);
		if (typeof title !== 'string') return false;
		if (filter.title !== undefined && title !== filter.title) return false;
		if (filter.titleContains !== undefined && !title.includes(filter.titleContains)) return false;
	}
	if (filter.group !== undefined) {
		const group = displayNodeGroup(node);
		if (group === undefined || group !== filter.group) return false;
	}
	if (filter.resourceId !== undefined) {
		const resource = displayNodeResource(node);
		if (!resource || resource.resourceId !== filter.resourceId) return false;
	}
	if (filter.url !== undefined) {
		const url = displayNodeUrl(node);
		if (typeof url !== 'string' || url !== filter.url) return false;
	}
	if (filter.visible !== undefined && node.visible !== filter.visible) return false;
	if (filter.locked !== undefined && node.locked !== filter.locked) return false;
	if (filter.touchable !== undefined && node.touchable !== filter.touchable) return false;
	if (filter.hasGears !== undefined && node.gears.length > 0 !== filter.hasGears) return false;
	if (filter.hasRelations !== undefined && node.relations.length > 0 !== filter.hasRelations) return false;
	return true;
}

function toDisplayNodeCandidate(node: ReadonlyData<UamDisplayNode>, index: number): BackendDisplayNodeCandidate {
	const group = displayNodeGroup(node);
	const text = displayNodeText(node);
	const title = displayNodeTitle(node);
	const resource = displayNodeResource(node);
	const url = displayNodeUrl(node);
	return {
		id: node.id,
		name: node.name,
		kind: node.kind,
		index,
		position: { x: node.position.x, y: node.position.y },
		size: { width: node.size.width, height: node.size.height },
		visible: node.visible,
		locked: node.locked,
		touchable: node.touchable,
		...(group !== undefined && group.length > 0 ? { group } : {}),
		...(text !== undefined ? { text } : {}),
		...(title !== undefined ? { title } : {}),
		...(resource !== undefined ? { resource } : {}),
		...(url !== undefined ? { url } : {}),
		gearCount: node.gears.length,
		relationCount: node.relations.length,
	};
}

/** Bound traversal before serialization or cloning, including non-JSON values on a malformed native input. */
function queryResponseProblem(
	value: unknown,
	limits: { maxBytes: number; maxNodes: number; maxDepth: number } = BACKEND_ENTITY_QUERY_LIMITS,
): 'response_budget_exceeded' | 'non_json_value' | undefined {
	const pending = [{ value, depth: 0 }];
	let nodes = 0;
	let stringUnits = 0;
	while (pending.length) {
		const { value, depth } = pending.pop()!;
		if (++nodes > limits.maxNodes || depth > limits.maxDepth) return 'response_budget_exceeded';
		if (typeof value === 'string' && (stringUnits += value.length) > limits.maxBytes)
			return 'response_budget_exceeded';
		if (value === undefined || value === null || typeof value === 'string' || typeof value === 'boolean') continue;
		if (typeof value === 'number') {
			if (!Number.isFinite(value)) return 'non_json_value';
			continue;
		}
		if (
			typeof value !== 'object' ||
			(!Array.isArray(value) &&
				Object.getPrototypeOf(value) !== Object.prototype &&
				Object.getPrototypeOf(value) !== null)
		)
			return 'non_json_value';
		if (Array.isArray(value) && value.length + pending.length + nodes > limits.maxNodes)
			return 'response_budget_exceeded';
		const entries = Object.entries(value);
		if (entries.length + pending.length + nodes > limits.maxNodes) return 'response_budget_exceeded';
		for (const [key, child] of entries) {
			if (!Array.isArray(value) && (stringUnits += key.length) > limits.maxBytes)
				return 'response_budget_exceeded';
			pending.push({ value: child, depth: depth + 1 });
		}
	}
	if (new TextEncoder().encode(JSON.stringify(value)).byteLength > limits.maxBytes) return 'response_budget_exceeded';
	return undefined;
}

function readFailure(startedAt: number, sessionId: string, reason: SessionReadError['reason'], revision?: number) {
	return failure(
		'read',
		startedAt,
		{
			code: 'session_read_failed' as const,
			sessionId,
			reason,
			message: `Session read failed: ${reason}.`,
		},
		undefined,
		{ sessionId, revision },
	);
}

function toProjectOutline(session: SessionReadView): BackendProjectOutline {
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
				...(resource.kind === 'component'
					? {
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
								transitions: resource.component.transitions.map((transition) => ({
									name: transition.name,
								})),
							},
						}
					: {}),
			})),
		})),
	};
}

export class ReadService {
	public constructor(
		private readonly getSessionState: SessionLookup,
		private readonly capabilities: ReadonlyData<BackendCapabilities>,
	) {}

	public getCapabilities(): BackendResult<BackendCapabilities> {
		return success('read', Date.now(), cloneReadData<BackendCapabilities>(this.capabilities));
	}

	public getSession(input: { sessionId: string }): BackendResult<BackendSessionSnapshot, SessionNotFoundError> {
		const startedAt = Date.now();
		const session = this.getSessionState(input.sessionId);
		if (!session || session.closed) {
			return failure('read', startedAt, createSessionNotFoundError(input.sessionId));
		}
		return success('read', startedAt, toSessionSnapshot(session, this.capabilities), {
			sessionId: session.sessionId,
			revision: session.revision,
		});
	}

	public getProjectOutline(
		input: GetProjectOutlineInput,
	): BackendResult<BackendProjectOutline, SessionNotFoundError> {
		const startedAt = Date.now();
		const session = this.getSessionState(input.sessionId);
		if (!session || session.closed) {
			return failure('read', startedAt, createSessionNotFoundError(input.sessionId));
		}
		return success('read', startedAt, toProjectOutline(session), {
			sessionId: session.sessionId,
			revision: session.revision,
		});
	}

	public queryEntity(
		input: QueryEntityInput,
	): BackendResult<BackendEntitySnapshot, SessionNotFoundError | EntityQueryError> {
		const startedAt = Date.now();
		const session = this.getSessionState(input.sessionId);
		if (!session || session.closed) return failure('read', startedAt, createSessionNotFoundError(input.sessionId));
		const meta = { sessionId: session.sessionId, revision: session.revision };
		const reject = (reason: EntityQueryError['reason']) =>
			failure(
				'read',
				startedAt,
				{
					code: 'entity_query_failed' as const,
					sessionId: session.sessionId,
					reason,
					message: `Entity query failed: ${reason}.`,
				},
				undefined,
				meta,
			);
		const target = input.target;
		if (
			!target ||
			typeof target !== 'object' ||
			Array.isArray(target) ||
			Object.keys(target).some((key) => key !== 'kind' && key !== 'selector')
		)
			return reject('invalid_query');
		const respond = (entity: ReadonlyData<BackendEntitySnapshot['entity']>) => {
			const data = { ...meta, target, entity };
			const problem = queryResponseProblem(data);
			return problem
				? reject(problem)
				: success('read', startedAt, cloneReadData<BackendEntitySnapshot>(data), meta);
		};
		if (target.kind === 'project') {
			if (Object.hasOwn(target, 'selector')) return reject('invalid_query');
			const { projectId, settings } = session.project;
			return respond({ kind: 'project', properties: { projectId, settings } });
		}
		const keys =
			target.kind === 'package'
				? ['packageId']
				: target.kind === 'resource'
					? ['packageId', 'resourceId']
					: target.kind === 'component'
						? ['packageId', 'componentResourceId']
						: target.kind === 'displayNode'
							? ['packageId', 'componentResourceId', 'displayNodeId']
							: target.kind === 'controller'
								? ['packageId', 'componentResourceId', 'controllerName']
								: target.kind === 'transition'
									? ['packageId', 'componentResourceId', 'transitionName']
									: [];
		const selector = target.selector as unknown as Record<string, unknown>;
		if (
			!keys.length ||
			!selector ||
			typeof selector !== 'object' ||
			Array.isArray(selector) ||
			Object.keys(selector).length !== keys.length ||
			keys.some(
				(key) =>
					!Object.hasOwn(selector, key) ||
					typeof selector[key] !== 'string' ||
					!(selector[key] as string).length ||
					(selector[key] as string).length > 256,
			)
		)
			return reject('invalid_query');
		const packages = session.project.packages.filter((pkg) => pkg.id === selector.packageId);
		if (packages.length !== 1) return reject(packages.length ? 'ambiguous' : 'not_found');
		if (target.kind === 'package') {
			const { id, name, compressPNG, jpegQuality, publish } = packages[0];
			return respond({
				kind: 'package',
				properties: { id, name, settings: { compressPNG, jpegQuality, publish } },
			});
		}
		const resources = packages[0].resources.filter(
			(resource) =>
				resource.id === (target.kind === 'resource' ? selector.resourceId : selector.componentResourceId),
		);
		if (resources.length !== 1) return reject(resources.length ? 'ambiguous' : 'not_found');
		const resource = resources[0];
		let entity: ReadonlyData<BackendEntitySnapshot['entity']>;
		if (target.kind === 'resource') {
			const record = resource as unknown as Record<string, unknown>;
			entity = {
				kind: 'resource',
				properties: Object.fromEntries(
					BACKEND_RESOURCE_QUERY_FIELDS.filter((key) => Object.hasOwn(record, key)).map((key) => [
						key,
						record[key],
					]),
				) as BackendResourceSnapshot,
			};
		} else {
			if (resource.kind !== 'component') return reject('not_found');
			if (target.kind === 'component') {
				const { size, properties, customData } = resource.component;
				entity = { kind: 'component', properties: { size, properties, customData } };
			} else if (target.kind === 'controller') {
				const controllers = resource.component.controllers.filter(
					(controller) => controller.name === selector.controllerName,
				);
				if (controllers.length !== 1) return reject(controllers.length ? 'ambiguous' : 'not_found');
				entity = { kind: 'controller', properties: controllers[0] };
			} else if (target.kind === 'transition') {
				const transitions = resource.component.transitions.filter(
					(transition) => transition.name === selector.transitionName,
				);
				if (transitions.length !== 1) return reject(transitions.length ? 'ambiguous' : 'not_found');
				entity = { kind: 'transition', properties: transitions[0] };
			} else {
				const nodes = resource.component.displayList.filter((node) => node.id === selector.displayNodeId);
				if (nodes.length !== 1) return reject(nodes.length ? 'ambiguous' : 'not_found');
				entity = { kind: 'displayNode', properties: nodes[0] };
			}
		}
		return respond(entity);
	}

	public queryDisplayNodes(
		input: QueryDisplayNodesInput,
	): BackendResult<BackendDisplayNodeQueryResult, SessionNotFoundError | EntityQueryError> {
		const startedAt = Date.now();
		const sessionId = typeof input?.sessionId === 'string' ? input.sessionId : '';
		const session = this.getSessionState(sessionId);
		if (!session || session.closed) return failure('read', startedAt, createSessionNotFoundError(sessionId));
		const meta = { sessionId: session.sessionId, revision: session.revision };
		const reject = (reason: EntityQueryError['reason']) =>
			failure(
				'read',
				startedAt,
				{
					code: 'entity_query_failed' as const,
					sessionId: session.sessionId,
					reason,
					message: `Display node query failed: ${reason}.`,
				},
				undefined,
				meta,
			);
		if (!isPlainRecord(input) || Object.keys(input).some((key) => !DISPLAY_NODE_QUERY_INPUT_KEYS.has(key))) {
			return reject('invalid_query');
		}
		const selector = input.selector as unknown as Record<string, unknown>;
		if (
			!isPlainRecord(selector) ||
			Object.keys(selector).length !== 2 ||
			['packageId', 'componentResourceId'].some(
				(key) =>
					!Object.hasOwn(selector, key) ||
					typeof selector[key] !== 'string' ||
					!(selector[key] as string).length ||
					(selector[key] as string).length > 256,
			)
		) {
			return reject('invalid_query');
		}
		const limit = input.limit ?? BACKEND_DISPLAY_NODE_QUERY_LIMITS.defaultLimit;
		if (
			typeof limit !== 'number' ||
			!Number.isInteger(limit) ||
			limit < 1 ||
			limit > BACKEND_DISPLAY_NODE_QUERY_LIMITS.maxLimit
		) {
			return reject('invalid_query');
		}
		if (input.filter !== undefined && !isValidDisplayNodeFilter(input.filter)) {
			return reject('invalid_query');
		}
		const packages = session.project.packages.filter((pkg) => pkg.id === selector.packageId);
		if (packages.length !== 1) return reject(packages.length ? 'ambiguous' : 'not_found');
		const resources = packages[0].resources.filter((resource) => resource.id === selector.componentResourceId);
		if (resources.length !== 1) return reject(resources.length ? 'ambiguous' : 'not_found');
		const resource = resources[0];
		if (resource.kind !== 'component') return reject('not_found');

		let totalMatched = 0;
		const nodes: BackendDisplayNodeCandidate[] = [];
		for (const [index, node] of resource.component.displayList.entries()) {
			if (!matchesDisplayNodeFilter(node, input.filter)) continue;
			totalMatched += 1;
			if (nodes.length < limit) {
				nodes.push(toDisplayNodeCandidate(node, index));
			}
		}
		const data: BackendDisplayNodeQueryResult = {
			...meta,
			selector: {
				packageId: selector.packageId as string,
				componentResourceId: selector.componentResourceId as string,
			},
			totalMatched,
			truncated: totalMatched > nodes.length,
			nodes,
		};
		const problem = queryResponseProblem(data, BACKEND_DISPLAY_NODE_QUERY_LIMITS);
		return problem ? reject(problem) : success('read', startedAt, structuredClone(data), meta);
	}

	private resolveReadSession(
		input: ReadSessionStateInput,
		startedAt: number,
	): BackendResult<SessionReadView, SessionNotFoundError | SessionReadError | SessionStaleReadError> {
		if (
			!input ||
			typeof input.sessionId !== 'string' ||
			!input.sessionId.length ||
			input.sessionId.length > 256 ||
			(input.expectedRevision !== undefined &&
				(!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0))
		) {
			return readFailure(startedAt, typeof input?.sessionId === 'string' ? input.sessionId : '', 'invalid_query');
		}
		const session = this.getSessionState(input.sessionId);
		if (!session || session.closed) return failure('read', startedAt, createSessionNotFoundError(input.sessionId));
		const meta = { sessionId: session.sessionId, revision: session.revision };
		if (input.expectedRevision !== undefined && input.expectedRevision !== session.revision)
			return failure(
				'read',
				startedAt,
				{
					code: 'stale_read',
					sessionId: session.sessionId,
					expectedRevision: input.expectedRevision,
					actualRevision: session.revision,
					message: 'The session edit revision changed. Restart the model and resource read.',
				},
				undefined,
				meta,
			);
		return success('read', startedAt, session, meta);
	}

	public readSessionState(
		input: ReadSessionStateInput,
	): BackendResult<BackendSessionStateSnapshot, SessionNotFoundError | SessionReadError | SessionStaleReadError> {
		const startedAt = Date.now();
		const resolved = this.resolveReadSession(input, startedAt);
		if (!resolved.ok) return resolved;
		const session = resolved.data;
		const meta = { sessionId: session.sessionId, revision: session.revision };
		// Capture synchronously: pending transactions have not committed; save bookkeeping may change without an edit revision.
		const data: ReadonlyData<BackendSessionStateSnapshot> = {
			...meta,
			dirty: session.dirty,
			lastSavedRevision: session.lastSavedRevision,
			uamFidelity: session.uamFidelity,
			...(session.uamFidelity === 'unsupported' && session.uamFidelityReport
				? { uamFidelityReport: session.uamFidelityReport }
				: {}),
			readComplete: session.readComplete,
			readDiagnostics: session.readDiagnostics,
			project: {
				...session.project,
				packages: session.project.packages.map((pkg) => ({
					...pkg,
					resources: pkg.resources.map((resource) => {
						if (resource.kind === 'component') return resource;
						const { sourceBytes: _sourceBytes, ...model } = resource;
						return model;
					}),
				})),
			},
		};
		const problem = queryResponseProblem(data, BACKEND_SESSION_READ_LIMITS.model);
		return problem
			? readFailure(startedAt, session.sessionId, problem, session.revision)
			: success('read', startedAt, cloneReadData<BackendSessionStateSnapshot>(data), meta);
	}

	public readResourceBytes(
		input: ReadResourceBytesInput,
	): BackendResult<BackendResourceBytesSnapshot, SessionNotFoundError | SessionReadError | SessionStaleReadError> {
		const startedAt = Date.now();
		const resolved = this.resolveReadSession(input, startedAt);
		if (!resolved.ok) return resolved;
		const session = resolved.data;
		const reject = (reason: SessionReadError['reason']) =>
			readFailure(startedAt, session.sessionId, reason, session.revision);
		const selector = input.selector;
		if (
			input.expectedRevision === undefined ||
			!selector ||
			typeof selector !== 'object' ||
			Array.isArray(selector) ||
			Object.keys(selector).length !== 2 ||
			['packageId', 'resourceId'].some((key) => !Object.hasOwn(selector, key)) ||
			[selector.packageId, selector.resourceId].some(
				(value) => typeof value !== 'string' || !value.length || value.length > 256,
			)
		)
			return reject('invalid_query');
		const packages = session.project.packages.filter((pkg) => pkg.id === selector.packageId);
		if (packages.length !== 1) return reject(packages.length ? 'ambiguous' : 'not_found');
		const resources = packages[0].resources.filter((resource) => resource.id === selector.resourceId);
		if (resources.length !== 1) return reject(resources.length ? 'ambiguous' : 'not_found');
		const resource = resources[0];
		if (resource.kind === 'component') return reject('unsupported_resource');
		if (!(resource.sourceBytes instanceof Uint8Array)) return reject('bytes_unavailable');
		if (resource.sourceBytes.byteLength > BACKEND_SESSION_READ_LIMITS.resourceBytes)
			return reject('response_budget_exceeded');
		const meta = { sessionId: session.sessionId, revision: session.revision };
		return success(
			'read',
			startedAt,
			{ ...meta, selector: { ...selector }, sourceBytes: new Uint8Array(resource.sourceBytes) },
			meta,
		);
	}

	public validateSession(input: { sessionId: string }): BackendResult<ProjectValidationReport, SessionNotFoundError> {
		const startedAt = Date.now();
		const session = this.getSessionState(input.sessionId);
		if (!session || session.closed) {
			return failure('read', startedAt, createSessionNotFoundError(input.sessionId));
		}
		const report = validateProject(cloneReadData<import('@openfairygui/core/uam').UamProject>(session.project), {
			readDiagnostics: cloneReadData<import('@openfairygui/core').ProjectDiagnostic[]>(session.readDiagnostics),
			complete: session.readComplete,
			validateSources: true,
		});
		return success('read', startedAt, report, {
			sessionId: session.sessionId,
			revision: session.revision,
			diagnostics: report.diagnostics.map(({ code, message, severity, path }) => ({
				code,
				message,
				severity,
				path,
				owner: 'core.validation',
			})),
		});
	}
}
