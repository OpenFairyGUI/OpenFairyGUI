import type { BackendDiagnostic, BackendDiagnosticCode, BackendDiagnosticOwner, BackendDiagnosticRemediation } from './contracts.js';

/** Shared codes list all canonical owners; responses preserve the actual reporting owner. */
export interface BackendDiagnosticGuide {
	code: BackendDiagnosticCode;
	owners: readonly BackendDiagnosticOwner[];
	remediation: Omit<BackendDiagnosticRemediation, 'read'>;
}

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

const unsupported = { kind: 'revise-operation', message: "Read the operation schema, capabilities and reported target kind/field. Stop unsupported work or replan using supported operations with equivalent intended semantics. Never silently drop fields or objects to make a transaction pass." } as const;
const payload = { kind: 'revise-operation', message: "Inspect the diagnostic path and current operation schema or UAM issues. Correct values, required fields and indices against exact queried entities, then preflight. Do not invent defaults or coerce away invalid data." } as const;
const unchanged = { kind: 'refresh-and-replan', message: "Query current settings/entity and compare with the request. If already satisfied, report no change; otherwise replan from the current revision. Do not manufacture a mutation or resubmit the same no-op." } as const;
const duplicate = { kind: 'revise-operation', message: "Query current entities and resolve the conflicting ID, name or page explicitly. Choose an unused value only when authorized by the intended edit, then preflight. Never overwrite or delete an existing entity to clear the conflict." } as const;
const references = { kind: 'revise-operation', message: "Query affected entities and references before editing, moving or removing anything. Replan intended dependent changes together and preflight. Do not delete dependent objects or strip references without authorization." } as const;
const project = { kind: 'host-action', message: "Inspect the project path and validation diagnostics with the host. Correct source XML/settings or unsupported geometry using authoritative project data; preserve originals and unsaved work before reopening or validating. Do not guess missing structure or discard rejected content." } as const;
const capability = { kind: 'host-action', message: "Read capability/error details. Ask the host to provide the required filesystem, decoder or complete UAM adapter. Preserve the session and unsaved work; do not substitute a lossy path or bypass checks." } as const;
const write = { kind: 'host-action', message: "Preserve the dirty session and inspect the error, actual target files and permissions with the host. Partial writes may have changed files: verify or recover them before a newly authorized save. Do not clear dirty state, discard memory or blindly retry." } as const;
const execution = { kind: 'host-action', message: "Inspect the execution/cache failure and current session/revision. Preserve sources and unsaved work and report the cause to the host. Replan after resolution; failed execution or cache work is not a completed edit." } as const;
const job = { kind: 'host-action', message: "Inspect the job ID and status with getJob/listJobs. Do not fabricate, restart or force-cancel a missing, terminal or non-cancellable job. Ask the host before scheduling new work; cancellation is not success." } as const;

/** Exhaustiveness and exact ownership are checked against the canonical unions. */
export const BACKEND_DIAGNOSTIC_GUIDES = [
	{ code: 'stale_read', owners: ['backend'], remediation: {
		kind: 'refresh-and-replan',
		message: 'Discard the incomplete model/bytes read and restart with readSessionState. Use its revision for every readResourceBytes call. No historical state is retained or reserved; do not combine resources from different edit revisions.',
	} },
	{ code: 'session_read_failed', owners: ['backend'], remediation: {
		kind: 'host-action',
		message: 'Inspect error.reason: invalid_query requires valid inputs; not_found/ambiguous requires exact current resource identifiers; unsupported_resource/bytes_unavailable means primary bytes cannot be read from this session. Budget or non-JSON failures require host inspection. Preserve unsaved work; do not save, reopen, repair or mutate the model merely to obtain a read.',
	} },
	{ code: 'transaction_preview_failed', owners: ['backend'], remediation: {
		kind: 'host-action',
		message: 'No complete preview is available. Inspect error.reason with the host: response_budget_exceeded requires a smaller independently meaningful authorized batch; projection_failed requires inspecting the project serialization failure. Preserve the session and never treat a missing or truncated impact as approval to apply or save.',
	} },
	{ code: 'stale_write', owners: ['backend'], remediation: {
		kind: 'refresh-and-replan',
		message: 'Refresh the outline and affected entities, then replan from their current revision and preflight again. A preview reserves no revision. Never replace expectedRevision and blindly retry the original transaction or save.',
	} },
	{ code: 'entity_query_failed', owners: ['backend'], remediation: {
		kind: 'host-action',
		message: 'Inspect error.reason: invalid_query requires correcting the target; not_found/ambiguous requires current exact identifiers; response_budget_exceeded/non_json_value requires host inspection of the entity. Do not broaden queries or mutate data to evade the response limits.',
	} },
	{ code: 'session_not_found', owners: ['backend'], remediation: {
		kind: 'host-action',
		message: 'Ask the host to confirm the runtime and project, recover any unsaved state, then explicitly open a new session if appropriate. Session IDs are runtime-local. Read its new revision and replan; never reuse an expired session or assume disk contains unsaved changes.',
	} },
	{ code: 'path_policy_violation', owners: ['backend'], remediation: path },
	{ code: 'project_root_not_allowed', owners: ['backend'], remediation: path },
	{ code: 'invalid_package_selector', owners: ['core.transaction'], remediation: selector },
	{ code: 'invalid_component_selector', owners: ['core.transaction'], remediation: selector },
	{ code: 'invalid_resource_selector', owners: ['core.transaction'], remediation: selector },
	{ code: 'invalid_display_node_selector', owners: ['core.transaction'], remediation: selector },
	{ code: 'invalid_resource_folder_selector', owners: ['core.transaction'], remediation: selector },
	{ code: 'invalid_branch_selector', owners: ['core.transaction'], remediation: selector },
	{ code: 'invalid_gear_selector', owners: ['core.transaction'], remediation: selector },
	{ code: 'invalid_look_gear_selector', owners: ['core.transaction'], remediation: selector },
	{ code: 'selector_ambiguity', owners: ['core.transaction'], remediation: selector },
	{ code: 'unavailable_resource_source_bytes', owners: ['core.transaction'], remediation: source },
	{ code: 'missing_source', owners: ['core.validation'], remediation: source },
	{ code: 'unreadable_source', owners: ['core.validation'], remediation: source },
	{ code: 'decode_capability_unavailable', owners: ['core.validation'], remediation: {
		kind: 'host-action',
		message: 'Validation is incomplete, not passed. Inspect whether source bytes are unloaded or a decoder is unavailable. Ask the host to hydrate sources or provide the required decoder (Node image validation uses optional Sharp), then validate again. Do not install dependencies or change the project automatically.',
	} },
	{ code: 'session_id_conflict', owners: ['backend'], remediation: { kind: 'host-action', message: "Use getSession to inspect the existing session. Reuse it only for the intended project, or choose a new session ID; do not close another owner\\u0027s session to make room." } },
	{ code: 'lock_conflict', owners: ['backend'], remediation: { kind: 'host-action', message: "Another owner holds the project lock. Preserve unsaved work and ask that owner to close its session, then explicitly reopen. Never remove a live lock, force-close a peer, or bypass locking." } },
	{ code: 'event_cursor_invalid', owners: ['backend'], remediation: { kind: 'refresh-and-replan', message: "Read the error and getEvents cursor bounds. Request a fresh bounded event page without the invalid cursor and refresh the current outline before replanning; missing retained history is not evidence that nothing changed." } },
	{ code: 'corrupt_source', owners: ["core.validation"], remediation: source },
	{ code: 'unsupported_operation', owners: ["core.transaction"], remediation: unsupported },
	{ code: 'transaction_unsupported', owners: ["core.transaction"], remediation: unsupported },
	{ code: 'unsupported_display_node_kind', owners: ["core.transaction"], remediation: unsupported },
	{ code: 'unsupported_cross_package_image_ref', owners: ["core.transaction"], remediation: unsupported },
	{ code: 'unsupported_gear_kind', owners: ["core.transaction"], remediation: unsupported },
	{ code: 'unsupported_resource_mutation', owners: ["core.transaction"], remediation: unsupported },
	{ code: 'unsupported_display_node_mutation', owners: ["core.transaction"], remediation: unsupported },
	{ code: 'unsupported_text_field_target', owners: ["core.transaction"], remediation: unsupported },
	{ code: 'unsupported_display_node_field', owners: ["core.transaction"], remediation: unsupported },
	{ code: 'unsupported_operation_batch', owners: ["core.transaction"], remediation: unsupported },
	{ code: 'unsupported_resource_kind', owners: ["core.transaction","core.validation"], remediation: unsupported },
	{ code: 'invalid_project_settings', owners: ["core.transaction"], remediation: payload },
	{ code: 'invalid_package_settings', owners: ["core.transaction"], remediation: payload },
	{ code: 'invalid_display_node_payload', owners: ["core.transaction"], remediation: payload },
	{ code: 'invalid_resource_name', owners: ["core.transaction"], remediation: payload },
	{ code: 'invalid_resource_path', owners: ["core.transaction"], remediation: payload },
	{ code: 'invalid_resource_folder_path', owners: ["core.transaction"], remediation: payload },
	{ code: 'invalid_resource_folder_atlas', owners: ["core.transaction"], remediation: payload },
	{ code: 'invalid_attach_index', owners: ["core.transaction"], remediation: payload },
	{ code: 'invalid_controller_payload', owners: ["core.transaction"], remediation: payload },
	{ code: 'invalid_transition_payload', owners: ["core.transaction"], remediation: payload },
	{ code: 'invalid_look_gear_payload', owners: ["core.transaction"], remediation: payload },
	{ code: 'invalid_gear_payload', owners: ["core.transaction"], remediation: payload },
	{ code: 'invalid_resource_payload', owners: ["core.transaction"], remediation: payload },
	{ code: 'invalid_resource_bytes', owners: ["core.transaction"], remediation: payload },
	{ code: 'invalid_movie_clip_jta', owners: ["core.transaction"], remediation: payload },
	{ code: 'invalid_resource_index', owners: ["core.transaction"], remediation: payload },
	{ code: 'invalid_branch_name', owners: ["core.transaction"], remediation: payload },
	{ code: 'invalid_package_payload', owners: ["core.transaction"], remediation: payload },
	{ code: 'invalid_package_index', owners: ["core.transaction"], remediation: payload },
	{ code: 'invalid_component_payload', owners: ["core.transaction"], remediation: payload },
	{ code: 'invalid_component_index', owners: ["core.transaction"], remediation: payload },
	{ code: 'invalid_component_move', owners: ["core.transaction"], remediation: payload },
	{ code: 'invalid_uam', owners: ["core.transaction","core.validation"], remediation: payload },
	{ code: 'project_settings_unchanged', owners: ["core.transaction"], remediation: unchanged },
	{ code: 'package_settings_unchanged', owners: ["core.transaction"], remediation: unchanged },
	{ code: 'display_node_props_unchanged', owners: ["core.transaction"], remediation: unchanged },
	{ code: 'resource_folder_atlas_unchanged', owners: ["core.transaction"], remediation: unchanged },
	{ code: 'duplicate_look_gear_controller', owners: ["core.transaction"], remediation: duplicate },
	{ code: 'duplicate_transition_name', owners: ["core.transaction"], remediation: duplicate },
	{ code: 'duplicate_look_gear_state_page', owners: ["core.transaction"], remediation: duplicate },
	{ code: 'duplicate_gear_controller', owners: ["core.transaction"], remediation: duplicate },
	{ code: 'duplicate_gear_state_page', owners: ["core.transaction"], remediation: duplicate },
	{ code: 'duplicate_branch_name', owners: ["core.transaction"], remediation: duplicate },
	{ code: 'duplicate_component_id', owners: ["core.transaction"], remediation: duplicate },
	{ code: 'resource_folder_conflict', owners: ["core.transaction"], remediation: duplicate },
	{ code: 'duplicate_resource_id', owners: ["core.transaction","core.validation"], remediation: duplicate },
	{ code: 'duplicate_package_id', owners: ["core.transaction","core.validation"], remediation: duplicate },
	{ code: 'duplicate_package_name', owners: ["core.transaction","core.validation"], remediation: duplicate },
	{ code: 'resource_folder_not_empty', owners: ["core.transaction"], remediation: references },
	{ code: 'branch_not_empty', owners: ["core.transaction"], remediation: references },
	{ code: 'branch_referenced', owners: ["core.transaction"], remediation: references },
	{ code: 'invalid_resource_reference', owners: ["core.transaction"], remediation: references },
	{ code: 'invalid_component_reference', owners: ["core.transaction"], remediation: references },
	{ code: 'invalid_group_reference', owners: ["core.transaction"], remediation: references },
	{ code: 'package_referenced', owners: ["core.transaction"], remediation: references },
	{ code: 'component_referenced', owners: ["core.transaction"], remediation: references },
	{ code: 'component_has_package_dependencies', owners: ["core.transaction"], remediation: references },
	{ code: 'dangling_resource_reference', owners: ["core.validation"], remediation: references },
	{ code: 'invalid_project_xml', owners: ["core.validation"], remediation: project },
	{ code: 'invalid_package_xml', owners: ["core.validation"], remediation: project },
	{ code: 'invalid_branch_package_xml', owners: ["core.validation"], remediation: project },
	{ code: 'invalid_component_xml', owners: ["core.validation"], remediation: project },
	{ code: 'invalid_project_value', owners: ["core.validation"], remediation: project },
	{ code: 'desktop_incompatible_geometry', owners: ["core.validation"], remediation: project },
	{ code: 'invalid_settings_json', owners: ["core.validation"], remediation: project },
	{ code: 'path_collision', owners: ["core.validation"], remediation: path },
	{ code: 'unsafe_path', owners: ["core.validation"], remediation: path },
	{ code: 'capability_unavailable', owners: ["backend"], remediation: capability },
	{ code: 'uam_fidelity_unsupported', owners: ["backend"], remediation: capability },
	{ code: 'save_partial_failure', owners: ["backend"], remediation: write },
	{ code: 'write_failed', owners: ["backend"], remediation: write },
	{ code: 'project_open_failed', owners: ["backend"], remediation: project },
	{ code: 'materialize_validation_failed', owners: ["backend"], remediation: project },
	{ code: 'execution_failure', owners: ["core.transaction"], remediation: execution },
	{ code: 'cache_refresh_failed', owners: ["backend"], remediation: execution },
	{ code: 'job_not_found', owners: ["backend"], remediation: job },
	{ code: 'job_not_cancellable', owners: ["backend"], remediation: job },
	{ code: 'job_cancelled', owners: ["backend"], remediation: job },
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
		owner: diagnostic.owner ?? guide.owners[0],
		docsUri: `${BACKEND_DIAGNOSTICS_URI}/${guide.code}`,
		remediation: {
			...guide.remediation,
			...(sessionId && guide.remediation.kind !== 'host-action'
				? { read: { method: 'getProjectOutline' as const, input: { sessionId } } } : {}),
		},
	};
}
