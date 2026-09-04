# Diagnostics and Recovery

Backend owns session/runtime errors. Core owns transaction errors/support issues and `ProjectDiagnosticCode` read/validation diagnostics. Functions orchestration and MCP transport do not change that ownership. Backend metadata and events preserve codes, severity, paths and operation locations; Core errors and validation report bodies remain unchanged.

Catalogued diagnostics add `owner`, `docsUri` and `remediation { kind, message, read? }`. Unknown diagnostics pass through unchanged, with no implied retry or repair permission. This is first-batch recovery coverage, not an exhaustive code registry. Capability schema 6 declares first-batch recovery and no automatic repair in `manifest.diagnostics`.

`read` is only an executable read-only starting point: `getProjectOutline({ sessionId })`, mapped to `openfairygui_backend_get_project_outline` by MCP. See [contracts](./contracts.md). Query current properties and replan; never merely replace `expectedRevision` on the original transaction. Previews reserve no revision; saving has its own guard.

`host-action` means there is no safe automatic recovery step. Source hydration belongs to host project I/O, path rejection requires an authorization review, and expired sessions require protecting unsaved work before reopening. Never invent hydrate/repair tools, suppress diagnostics, or widen path policy. For gear/branch details absent from the outline, query the owning entity or ask the host rather than guessing selectors.

SDK: `getBackendDiagnosticCatalog()` / `getBackendDiagnosticGuide(code)`. MCP: read `openfairygui://docs/diagnostics` or a per-code URI below. Unknown codes fail explicitly. Guides never execute actions.

## First-batch Diagnostic Catalog

Generated from Backend's typed catalog by `pnpm contracts:generate`; do not edit the marked section.

<!-- diagnostics:start -->
### stale_write

Owner: `backend` · Recovery: `refresh-and-replan`

URI: `openfairygui://docs/diagnostics/stale_write`

Refresh the outline and affected entities, then replan from their current revision and preflight again. A preview reserves no revision. Never replace expectedRevision and blindly retry the original transaction or save.

### entity_query_failed

Owner: `backend` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/entity_query_failed`

Inspect error.reason: invalid_query requires correcting the target; not_found/ambiguous requires current exact identifiers; response_budget_exceeded/non_json_value requires host inspection of the entity. Do not broaden queries or mutate data to evade the response limits.

### session_not_found

Owner: `backend` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/session_not_found`

Ask the host to confirm the runtime and project, recover any unsaved state, then explicitly open a new session if appropriate. Session IDs are runtime-local. Read its new revision and replan; never reuse an expired session or assume disk contains unsaved changes.

### path_policy_violation

Owner: `backend` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/path_policy_violation`

Ask the host to review the attempted path and authorized project root. saveSession only writes the original project; it is not Save As. Do not widen allowed roots or bypass path checks. A separately authorized export may use materializeSession.

### project_root_not_allowed

Owner: `backend` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/project_root_not_allowed`

Ask the host to review the attempted path and authorized project root. saveSession only writes the original project; it is not Save As. Do not widen allowed roots or bypass path checks. A separately authorized export may use materializeSession.

### invalid_package_selector

Owner: `core.transaction` · Recovery: `revise-selector`

URI: `openfairygui://docs/diagnostics/invalid_package_selector`

Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.

### invalid_component_selector

Owner: `core.transaction` · Recovery: `revise-selector`

URI: `openfairygui://docs/diagnostics/invalid_component_selector`

Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.

### invalid_resource_selector

Owner: `core.transaction` · Recovery: `revise-selector`

URI: `openfairygui://docs/diagnostics/invalid_resource_selector`

Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.

### invalid_display_node_selector

Owner: `core.transaction` · Recovery: `revise-selector`

URI: `openfairygui://docs/diagnostics/invalid_display_node_selector`

Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.

### invalid_resource_folder_selector

Owner: `core.transaction` · Recovery: `revise-selector`

URI: `openfairygui://docs/diagnostics/invalid_resource_folder_selector`

Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.

### invalid_branch_selector

Owner: `core.transaction` · Recovery: `revise-selector`

URI: `openfairygui://docs/diagnostics/invalid_branch_selector`

Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.

### invalid_gear_selector

Owner: `core.transaction` · Recovery: `revise-selector`

URI: `openfairygui://docs/diagnostics/invalid_gear_selector`

Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.

### invalid_look_gear_selector

Owner: `core.transaction` · Recovery: `revise-selector`

URI: `openfairygui://docs/diagnostics/invalid_look_gear_selector`

Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.

### selector_ambiguity

Owner: `core.transaction` · Recovery: `revise-selector`

URI: `openfairygui://docs/diagnostics/selector_ambiguity`

Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.

### unavailable_resource_source_bytes

Owner: `core.transaction` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/unavailable_resource_source_bytes`

Ask the host to inspect the reported source and hydrate its bytes through project I/O or import. Preserve unsaved work; reopening disk state can discard it. No session hydration/repair API is exposed. Revalidate and replan after the host has supplied a complete project.

### missing_source

Owner: `core.validation` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/missing_source`

Ask the host to inspect the reported source and hydrate its bytes through project I/O or import. Preserve unsaved work; reopening disk state can discard it. No session hydration/repair API is exposed. Revalidate and replan after the host has supplied a complete project.

### unreadable_source

Owner: `core.validation` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/unreadable_source`

Ask the host to inspect the reported source and hydrate its bytes through project I/O or import. Preserve unsaved work; reopening disk state can discard it. No session hydration/repair API is exposed. Revalidate and replan after the host has supplied a complete project.

### decode_capability_unavailable

Owner: `core.validation` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/decode_capability_unavailable`

Validation is incomplete, not passed. Inspect whether source bytes are unloaded or a decoder is unavailable. Ask the host to hydrate sources or provide the required decoder (Node image validation uses optional Sharp), then validate again. Do not install dependencies or change the project automatically.
<!-- diagnostics:end -->
