import type { ProjectDiagnosticCode } from '@openfairygui/core';
import type { UamTransactionErrorCode, UamTransactionSupportIssueCode } from '@openfairygui/core/uam';
import type { BackendDiagnostic, BackendDiagnosticRemediation } from './contracts.js';
import type { BackendError } from './runtime.js';

/** Ownership follows the originating contract, not the transport that reports it. */
export type BackendDiagnosticGuide = {
	remediation: Omit<BackendDiagnosticRemediation, 'read'>;
} & (
	| { code: Exclude<BackendError['code'], UamTransactionErrorCode>; owner: 'backend' }
	| { code: UamTransactionErrorCode | UamTransactionSupportIssueCode; owner: 'core.transaction' }
	| { code: ProjectDiagnosticCode; owner: 'core.validation' }
);

const selector = {
	kind: 'revise-selector',
	message: 'Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.',
} as const;
const source = {
	kind: 'host-action',
	message: 'Ask the host to inspect the reported source and hydrate its bytes through project I/O or import. Preserve unsaved work; reopening disk state can discard it. No session hydration/repair API is exposed. Revalidate and replan after the host has supplied a complete project.',
} as const;
const path = {
	kind: 'host-action',
	message: 'Ask the host to review the attempted path and authorized project root. saveSession only writes the original project; it is not Save As. Do not widen allowed roots or bypass path checks. A separately authorized export may use materializeSession.',
} as const;

/** First-batch recovery coverage, deliberately not an exhaustive error-code registry. */
export const BACKEND_DIAGNOSTIC_GUIDES = [
	{ code: 'stale_write', owner: 'backend', remediation: {
		kind: 'refresh-and-replan',
		message: 'Refresh the outline and affected entities, then replan from their current revision and preflight again. A preview reserves no revision. Never replace expectedRevision and blindly retry the original transaction or save.',
	} },
	{ code: 'entity_query_failed', owner: 'backend', remediation: {
		kind: 'host-action',
		message: 'Inspect error.reason: invalid_query requires correcting the target; not_found/ambiguous requires current exact identifiers; response_budget_exceeded/non_json_value requires host inspection of the entity. Do not broaden queries or mutate data to evade the response limits.',
	} },
	{ code: 'session_not_found', owner: 'backend', remediation: {
		kind: 'host-action',
		message: 'Ask the host to confirm the runtime and project, recover any unsaved state, then explicitly open a new session if appropriate. Session IDs are runtime-local. Read its new revision and replan; never reuse an expired session or assume disk contains unsaved changes.',
	} },
	{ code: 'path_policy_violation', owner: 'backend', remediation: path },
	{ code: 'project_root_not_allowed', owner: 'backend', remediation: path },
	{ code: 'invalid_package_selector', owner: 'core.transaction', remediation: selector },
	{ code: 'invalid_component_selector', owner: 'core.transaction', remediation: selector },
	{ code: 'invalid_resource_selector', owner: 'core.transaction', remediation: selector },
	{ code: 'invalid_display_node_selector', owner: 'core.transaction', remediation: selector },
	{ code: 'invalid_resource_folder_selector', owner: 'core.transaction', remediation: selector },
	{ code: 'invalid_branch_selector', owner: 'core.transaction', remediation: selector },
	{ code: 'invalid_gear_selector', owner: 'core.transaction', remediation: selector },
	{ code: 'invalid_look_gear_selector', owner: 'core.transaction', remediation: selector },
	{ code: 'selector_ambiguity', owner: 'core.transaction', remediation: selector },
	{ code: 'unavailable_resource_source_bytes', owner: 'core.transaction', remediation: source },
	{ code: 'missing_source', owner: 'core.validation', remediation: source },
	{ code: 'unreadable_source', owner: 'core.validation', remediation: source },
	{ code: 'decode_capability_unavailable', owner: 'core.validation', remediation: {
		kind: 'host-action',
		message: 'Validation is incomplete, not passed. Inspect whether source bytes are unloaded or a decoder is unavailable. Ask the host to hydrate sources or provide the required decoder (Node image validation uses optional Sharp), then validate again. Do not install dependencies or change the project automatically.',
	} },
] as const satisfies readonly BackendDiagnosticGuide[];

export const BACKEND_DIAGNOSTICS_URI = 'openfairygui://docs/diagnostics';
export const BACKEND_DIAGNOSTIC_TEMPLATE = `${BACKEND_DIAGNOSTICS_URI}/{code}`;

export function getBackendDiagnosticCatalog() {
	return BACKEND_DIAGNOSTIC_GUIDES.map((guide) => ({ ...structuredClone(guide), docsUri: `${BACKEND_DIAGNOSTICS_URI}/${guide.code}` }));
}

export function getBackendDiagnosticGuide(code: string) {
	const guide = getBackendDiagnosticCatalog().find((entry) => entry.code === code);
	if (!guide) throw new RangeError(`No recovery guide for diagnostic: ${code}`);
	return guide;
}

export function enrichBackendDiagnostic(diagnostic: BackendDiagnostic, sessionId?: string): BackendDiagnostic {
	const guide = BACKEND_DIAGNOSTIC_GUIDES.find((entry) => entry.code === diagnostic.code);
	if (!guide) return { ...diagnostic };
	return {
		...diagnostic,
		owner: guide.owner,
		docsUri: `${BACKEND_DIAGNOSTICS_URI}/${guide.code}`,
		remediation: {
			...guide.remediation,
			...(sessionId && guide.remediation.kind !== 'host-action'
				? { read: { method: 'getProjectOutline' as const, input: { sessionId } } } : {}),
		},
	};
}
