# Contract sources and operation discovery

Core's `UamTransactionOperation` and UAM models own parameter structure and transaction semantics. Backend's public method signatures own session inputs, results, and error types. MCP owns only tool metadata, JSON transport conversion, and input budgets.

`pnpm contracts:generate` uses the existing TypeScript compiler to read those types and generate MCP structural schemas, the operation catalog, a contract snapshot, and the tables below. MCP reuses Zod to create validators from JSON Schema; Core does not depend on Zod. The read-only `pnpm contracts:check` verifies mapping completeness and generated-file drift through repository tests and `docs:check`.

## Discover exact parameters

MCP `resources/list` exposes `openfairygui://contracts/operations`, listing operations and their schema URIs. Read `openfairygui://contracts/operations/{kind}` through `resources/read`, for example `openfairygui://contracts/operations/addComponent`. Each schema includes all reachable `$defs` and requires no repository source.

Each tool in `tools/list` has input/output schemas derived from its Backend method instead of a shared loose result. The tool's `openfairygui/contractDigest` metadata, operation catalog, and table digest identify the same generated snapshot. Parameter or annotation changes fail checks if the snapshot or bilingual tables are stale.

The MCP factory exposes a fixed Backend tool catalog. Discovery reuses existing Zod draft-07 `definitions` and local `$ref` support instead of expanding repeated transaction subtrees. Each schema contains every reference target and needs no network resolution. Calls retain the original Zod validators and budget checks; this changes transport representation without adding or omitting fields. Installed contract/individual-operation documents still provide draft-2020-12 `$defs`. See [agent evaluations](./agent-evaluations.md) for actual client discovery and execution checks.

## Query current entities

`queryEntity` / `openfairygui_backend_query_entity` uses the existing read service and returns `sessionId`, the actual `revision`, `target`, and `entity`. For example:

```json
{
  "sessionId": "current session ID",
  "target": {
    "kind": "displayNode",
    "selector": { "packageId": "pkg001", "componentResourceId": "cmp001", "displayNodeId": "n1" }
  }
}
```

The initial projection is fixed, without arbitrary field expressions:

| target.kind | Formal selector | entity.properties |
|---|---|---|
| `resource` | `packageId`, `resourceId` | Identity, name, path, export/favorite/branch fields, plus existing filenames, dimensions and image/movieClip properties; no source bytes, sourcePath, arbitrary metadata or component contents |
| `component` | `packageId`, `componentResourceId` | Component `size`, `properties`, `customData`; excludes displayList, controllers and transitions |
| `displayNode` | `packageId`, `componentResourceId`, `displayNodeId` | Formal UAM node properties, including modeled references, relations and gears |

Queries leave the project, revision, dirty state, cache and business events unchanged. Results are deeply detached from the session. Selectors use exact IDs, never fuzzy names. Invalid structure, missing entities and non-unique IDs return `entity_query_failed` with `reason` set to `invalid_query`, `not_found` or `ambiguous`; closed/missing sessions return `session_not_found`.

Compact JSON `data` is limited to 262144 UTF-8 bytes, traversal depth 32 and 100000 nodes, advertised under `read.entityQuery.limits`. Properties are never truncated: excess returns `response_budget_exceeded`, and non-JSON values return `non_json_value`, as `entity_query_failed.reason`. Checks run before cloning; MCP envelopes and text copies are outside this data budget.

## Preview a transaction

`preflightTransaction` / `openfairygui_backend_preflight_transaction` accepts the same `{ sessionId, expectedRevision, operations }` as `applyTransaction`. This is not merely a support check: Backend's `AuthoringService` checks the revision in its existing per-session exclusive queue, deeply copies the project and source bytes, calls the authoritative `applyUamTransactionAppAsync`, then discards the resulting project.

Success returns `ok: true` with `data: { sessionId, baseRevision, mode: 'execute-and-discard' }`. Failures preserve transaction `error.code`, `stage`, operation locations and `meta.diagnostics`. `meta.revision` identifies the evaluated baseline; missing/closed sessions return `session_not_found`, and revision mismatches return `stale_write`. Inputs are copied before queuing, including detachment of SharedArrayBuffer-backed bytes.

Neither success nor failure changes the authoritative project, revision, dirty state, pending file cleanup, caches, jobs or business events, or writes to disk. No uncomputed entity diff or file-impact list is returned.

Recommended flow: discover IDs with the outline → queryEntity for current properties and revision → preflightTransaction → applyTransaction with the same batch → validateSession → saveSession. See the executable [revision-checked edit, save and reread example](./examples.md#revision-checked-edit-save-and-reread).

A preview reserves no revision and does not guarantee later apply/save or publication. Apply must check `expectedRevision` again; if edits intervened, query and re-plan instead of treating an old preview as an authorization token. Preview reuses the current transaction execution path without adding project saves, file permission/target checks or publishing checks. In-memory sessions without a filesystem can preview too.

`authoring.preflightTransaction` advertises `mode: 'execute-and-discard'` and `reservesRevision: false`. Capability schema version 6 includes first-batch [diagnostic recovery guides](./diagnostics.md); the transaction contract version remains unchanged.

## Transport and semantic boundaries

- Core binary values remain `Uint8Array`. MCP represents declared binary fields as integer arrays (0–255) and explicitly restores them through generated field paths. Replacement operations, resource/package snapshots, and imported projects share this conversion. A same-named `sourceBytes` field in arbitrary JSON metadata is not rewritten.
- Host objects are not tool inputs: `openProjectSession.storage`, `saveSession.fileSystem`, and `materializeSession.storage/fileSystem/targetPath` remain excluded. Host injection uses Backend APIs.
- Schemas preserve open fields declared by the actual types, including extension settings, resource metadata, and some dynamic values. They do not invent missing protocol definitions. Unknown fields on closed objects are rejected instead of silently dropped.
- Homogeneous fixed tuples (such as the four numbers in `scale9Grid` / `cornerRadius`) use a single `items` schema with equal `minItems` / `maxItems`. MCP discovery does not need positional item arrays; element types and exact lengths stay enforced. Heterogeneous tuples retain their per-position constraints.
- Inputs retain batch limits (1–1000), integer revisions, selector lengths, and aggregate node/depth/string budgets. General limits are depth 32, 100000 nodes, 10000 entries per array/object, 1000000 characters per string, and 256 per key. JSON byte arrays also obey the general array limit; per-field schemas do not replace aggregate limits.
- Structural validity does not replace Core checks for references, resource content, field applicability, or legal operation batches, and does not guarantee execution or saving. MCP adds no second transaction kernel; preview only maps the authoritative Backend entrypoint.
- Method-specific outputs preserve Backend error categories. Unhandled adapter errors use `backend_unhandled_error` without exposing internal exceptions. Structural schemas do not promise response budgets or diagnostic recovery policies.

## Generated catalog

The tables summarize top-level parameters only; read schemas for nested fields and concrete results. SHA-256 identifies generated contract content, not a package version.

<!-- contracts:start -->
SHA-256: `60e4b1f8bc14bc013134783d7d8fbeea22a50a7dfdd9858bced6f5aba1eee63d`

| Operation | Parameters (`?` = optional) |
|---|---|
| `updateProjectSettings` | `settings`, `opId?` |
| `updatePackageSettings` | `selector`, `settings`, `opId?` |
| `renameResource` | `selector`, `newName`, `opId?` |
| `moveResource` | `selector`, `toPath`, `opId?` |
| `setResourceFavorite` | `selector`, `favorite`, `opId?` |
| `setResourceFolderFavorite` | `selector`, `favorite`, `opId?` |
| `setResourceFolderAtlas` | `selector`, `atlas`, `opId?` |
| `setResourceExported` | `selector`, `exported`, `opId?` |
| `addResourceFolder` | `selector`, `path`, `branch?`, `favorite?`, `atlas?`, `opId?` |
| `renameResourceFolder` | `selector`, `newName`, `opId?` |
| `moveResourceFolder` | `selector`, `toPath`, `opId?` |
| `removeResourceFolder` | `selector`, `opId?` |
| `setImageResourceProps` | `selector`, `props`, `opId?` |
| `addResource` | `selector`, `resource`, `atIndex?`, `opId?` |
| `addBranch` | `branch`, `opId?` |
| `renameBranch` | `selector`, `newName`, `opId?` |
| `removeBranch` | `selector`, `opId?` |
| `addPackage` | `package`, `atIndex`, `opId?` |
| `renamePackage` | `selector`, `newName`, `opId?` |
| `removePackage` | `selector`, `opId?` |
| `addComponent` | `selector`, `component`, `atIndex`, `opId?` |
| `removeComponent` | `selector`, `opId?` |
| `moveComponent` | `selector`, `toPackageId`, `toIndex`, `opId?` |
| `replaceResourceBytes` | `selector`, `sourceBytes`, `opId?` |
| `removeResource` | `selector`, `opId?` |
| `setDisplayNodeProps` | `selector`, `props`, `opId?` |
| `setComponentProps` | `selector`, `props`, `opId?` |
| `attachDisplayNode` | `selector`, `atIndex`, `node`, `opId?` |
| `detachDisplayNode` | `selector`, `opId?` |
| `addController` | `selector`, `controller`, `opId?` |
| `updateController` | `selector`, `controller`, `opId?` |
| `removeController` | `selector`, `opId?` |
| `addTransition` | `selector`, `transition`, `opId?` |
| `updateTransition` | `selector`, `transition`, `opId?` |
| `removeTransition` | `selector`, `opId?` |
| `addLookGear` | `selector`, `gear`, `opId?` |
| `updateLookGear` | `selector`, `gear`, `opId?` |
| `removeLookGear` | `selector`, `opId?` |
| `addGear` | `selector`, `gear`, `opId?` |
| `updateGear` | `selector`, `gear`, `opId?` |
| `removeGear` | `selector`, `opId?` |

| Backend method | MCP tool | Parameters | Read-only hint |
|---|---|---|---|
| `getCapabilities` | `openfairygui_backend_get_capabilities` | — | `true` |
| `openSession` | `openfairygui_backend_open_session` | `projectPath` | `false` |
| `openProjectSession` | `openfairygui_backend_open_project_session` | `project`, `sessionId?`, `canonicalProjectPath?`, `canonicalPathKey?` | `false` |
| `getSession` | `openfairygui_backend_get_session` | `sessionId` | `true` |
| `getProjectOutline` | `openfairygui_backend_get_project_outline` | `sessionId` | `true` |
| `queryEntity` | `openfairygui_backend_query_entity` | `sessionId`, `target` | `true` |
| `validateSession` | `openfairygui_backend_validate_session` | `sessionId` | `true` |
| `preflightTransaction` | `openfairygui_backend_preflight_transaction` | `sessionId`, `expectedRevision`, `operations` | `true` |
| `applyTransaction` | `openfairygui_backend_apply_transaction` | `sessionId`, `expectedRevision`, `operations` | `false` |
| `saveSession` | `openfairygui_backend_save_session` | `sessionId`, `expectedRevision?`, `targetPath?`, `force?`, `mode?` | `false` |
| `materializeSession` | `openfairygui_backend_materialize_session` | `sessionId`, `expectedRevision?`, `mode?`, `reason?` | `false` |
| `closeSession` | `openfairygui_backend_close_session` | `sessionId` | `false` |
| `getEvents` | `openfairygui_backend_get_events` | `sessionId`, `after?`, `limit?` | `true` |
| `getJob` | `openfairygui_backend_get_job` | `sessionId`, `jobId` | `true` |
| `listJobs` | `openfairygui_backend_list_jobs` | `sessionId`, `status?`, `kind?`, `limit?` | `true` |
| `cancelJob` | `openfairygui_backend_cancel_job` | `sessionId`, `jobId` | `false` |
| `getCacheSnapshot` | `openfairygui_backend_get_cache_snapshot` | `sessionId` | `true` |
| `refreshCache` | `openfairygui_backend_refresh_cache` | `sessionId`, `reason?` | `false` |
<!-- contracts:end -->

Unsupported TypeScript constructs fail generation instead of becoming arbitrary payloads. New methods must appear in both Backend capabilities and MCP metadata; operations come directly from the Core union. After editing, run `pnpm contracts:generate` and `pnpm check:ci`. See the [development guide](./development.md) for verification scope.
