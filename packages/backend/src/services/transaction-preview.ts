import { materializeUamProject, type UamProject } from '@openfairygui/core/uam';
import { BACKEND_TRANSACTION_PREVIEW_LIMITS, type BackendTransactionEntityChange, type BackendTransactionPreview } from '../runtime/contracts.js';
import { captureProject } from './capture-project.js';
import type { BackendSessionState } from './context.js';

type Entity = { target: BackendTransactionEntityChange['target']; properties: Record<string, unknown> };

/** Keep child identities/order on their parent, and compare each child's own properties separately. */
function entities(project: UamProject): Map<string, Entity> {
	const result = new Map<string, Entity>();
	function add(target: Entity['target'], properties: object): void {
		const key = JSON.stringify(target);
		if (result.has(key)) throw new Error(`Ambiguous preview identity: ${key}`);
		result.set(key, { target, properties: properties as Entity['properties'] });
	}
	const { packages, ...properties } = project;
	add({ kind: 'project' }, { ...properties, packages: packages.map((pkg) => pkg.id) });
	for (const { resources, ...pkg } of packages) {
		const packageId = pkg.id;
		add({ kind: 'package', selector: { packageId } }, { ...pkg, resources: resources.map((resource) => resource.id) });
		for (const resource of resources) {
			const resourceTarget = { kind: 'resource' as const, selector: { packageId, resourceId: resource.id } };
			if (resource.kind !== 'component') { add(resourceTarget, resource); continue; }
			const { component, ...resourceProperties } = resource;
			add(resourceTarget, resourceProperties);
			const { displayList, controllers, transitions, ...componentProperties } = component;
			const selector = { packageId, componentResourceId: resource.id };
			add({ kind: 'component', selector }, {
				...componentProperties, displayList: displayList.map((node) => node.id),
				controllers: controllers.map((controller) => controller.name), transitions: transitions.map((transition) => transition.name),
			});
			for (const node of displayList) add({ kind: 'displayNode', selector: { ...selector, displayNodeId: node.id } }, node);
			for (const controller of controllers) add({ kind: 'controller', selector: { ...selector, controllerName: controller.name } }, controller);
			for (const transition of transitions) add({ kind: 'transition', selector: { ...selector, transitionName: transition.name } }, transition);
		}
	}
	return result;
}

function equal(left: unknown, right: unknown, depth = 0): boolean {
	if (left === right) return true;
	if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
	if (left instanceof Uint8Array || right instanceof Uint8Array) {
		return left instanceof Uint8Array && right instanceof Uint8Array && left.length === right.length
			&& left.every((value, index) => value === right[index]);
	}
	if (depth > 128) throw new Error('Preview property comparison exceeds the supported nesting depth.');
	if (Array.isArray(left) !== Array.isArray(right)) return false;
	if (Array.isArray(left) && Array.isArray(right) && left.length !== right.length) return false;
	const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
	const keys = Object.keys(a);
	return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && equal(a[key], b[key], depth + 1));
}

export class PreviewBudgetError extends Error {}

/** No host filesystem, cache, event or session mutation is involved in the projection. */
export async function previewTransactionImpact(
	session: BackendSessionState,
	project: UamProject,
	fileSystemAvailable: boolean,
): Promise<BackendTransactionPreview> {
	const impact: BackendTransactionPreview['impact'] = { entities: [], files: [] };
	const before = entities(session.project), after = entities(project);
	let entries = 0, bytes = 0;
	const encoder = new TextEncoder();
	function count(value: unknown): void {
		bytes += encoder.encode(JSON.stringify(value)).byteLength;
		if (++entries > BACKEND_TRANSACTION_PREVIEW_LIMITS.maxEntries || bytes > BACKEND_TRANSACTION_PREVIEW_LIMITS.maxBytes) {
			throw new PreviewBudgetError('The complete transaction impact exceeds the preview response budget.');
		}
	}
	for (const key of new Set([...before.keys(), ...after.keys()])) {
		const previous = before.get(key), next = after.get(key);
		const fields = [...new Set([...Object.keys(previous?.properties ?? {}), ...Object.keys(next?.properties ?? {})])]
			.filter((field) => !previous || !next || !equal(previous.properties[field], next.properties[field])).sort();
		if (!fields.length && previous && next) continue;
		const change: BackendTransactionEntityChange = {
			target: (next ?? previous)!.target, change: !previous ? 'added' : !next ? 'removed' : 'updated', fields,
		};
		count(change); impact.entities.push(change);
	}
	const fairyFileName = session.fileSystem ? session.fairyPath.replace(/\\/g, '/').split('/').at(-1)! : 'Project.fairy';
	// ponytail: two full in-memory serializations reuse the writer; add writer-level incremental planning only if measured cost requires it.
	const [previousFiles, nextFiles] = await Promise.all([
		// The existing snapshot may contain the broken reference this transaction repairs.
		// It is serialized only into memory; the projected state and every save remain validated.
		captureProject(materializeUamProject(session.project, { validate: false }), fairyFileName),
		captureProject(materializeUamProject(project), fairyFileName),
	]);
	for (const path of new Set([...previousFiles.files.keys(), ...nextFiles.files.keys()])) {
		const previous = previousFiles.files.get(path), next = nextFiles.files.get(path);
		if (equal(previous, next)) continue;
		const change = { path, kind: 'file' as const, change: previous === undefined ? 'added' as const : next === undefined ? 'removed' as const : 'updated' as const };
		count(change); impact.files.push(change);
	}
	for (const path of new Set([...previousFiles.directories, ...nextFiles.directories])) {
		if (previousFiles.directories.has(path) === nextFiles.directories.has(path)) continue;
		const change = { path, kind: 'directory' as const, change: nextFiles.directories.has(path) ? 'added' as const : 'removed' as const };
		count(change); impact.files.push(change);
	}
	impact.files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : a.kind.localeCompare(b.kind));
	const preview: BackendTransactionPreview = {
		sessionId: session.sessionId, baseRevision: session.revision, projectedRevision: session.revision + 1,
		mode: 'execute-and-discard', impact,
		persistence: {
			requiredAfterApply: true, fileSystemAvailable, uamFidelity: session.uamFidelity, writeVerified: false,
			nextAction: session.uamFidelity === 'unsupported' || !fileSystemAvailable ? 'host-action'
				: session.fileSystem ? 'saveSession' : 'materializeSession',
		},
	};
	if (encoder.encode(JSON.stringify(preview)).byteLength > BACKEND_TRANSACTION_PREVIEW_LIMITS.maxBytes) {
		throw new PreviewBudgetError('The complete transaction preview exceeds the response byte budget.');
	}
	return preview;
}
