# Contract sources and operation discovery

Core's `UamTransactionOperation` and UAM models own parameter structure and transaction semantics. Backend's public signatures own session inputs, results and errors. CLI owns process JSON envelopes while reusing workflow result types. MCP owns only tool metadata, JSON transport conversion and input budgets.

`pnpm contracts:generate` uses the existing TypeScript compiler to read those types and generate MCP structural schemas, the operation catalog, a contract snapshot, and the tables below. MCP reuses Zod to create validators from JSON Schema; Core does not depend on Zod. The read-only `pnpm contracts:check` verifies mapping completeness and generated-file drift through repository tests and `docs:check`.

## CLI machine output

Every business command and `docs` subcommand uses the same shape: `{schemaVersion:1,command,success:true,result}` on success, or `{schemaVersion:1,command,success:false,error:{code,message},result?}` on failure. `command` is the canonical path, such as `docs cat`; unknown top-level commands use `ofgui`. Invalid/incomplete validation and error/incomplete doctor responses retain the complete report in `result`; startup/read exceptions do not fabricate a result.

Exit codes are 0 for success, 1 for workflow failure, 2 for argument errors and 3 for incomplete validation. `--json` works before or after the command; stdout contains one JSON document and human logs go to stderr. Help/version remain text. Human mode keeps its reports and uses the same exit codes.

`packages/cli/src/contracts.ts` owns output types. Generation covers 13 command paths, including parser-only `ofgui`/`docs` failures. `test:repo` checks registration coverage and installed consumers validate actual outputs against generated schemas. Read `ofgui docs schema cli/validate --json` or `ofgui docs cat "cli/docs cat" --json`; the self-contained schema is in `result.text`. MCP exposes `openfairygui://docs/cli/{command}`, with spaces encoded as `%20`. Type collection adds no runtime Backend-to-CLI dependency.

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

Projections are fixed, without arbitrary field expressions. Supported kinds are advertised in `read.entityQuery.kinds`:

| target.kind | Formal selector | entity.properties |
|---|---|---|
| `resource` | `packageId`, `resourceId` | Identity, name, path, export/favorite/branch fields, plus existing filenames, dimensions and image/movieClip properties; no source bytes, sourcePath, arbitrary metadata or component contents |
| `component` | `packageId`, `componentResourceId` | Component `size`, `properties`, `customData`; excludes displayList, controllers and transitions |
| `displayNode` | `packageId`, `componentResourceId`, `displayNodeId` | Formal UAM node properties, including modeled references, relations and gears |
| `controller` | `packageId`, `componentResourceId`, `controllerName` | Complete `UamControllerModel`, including selection, home-page settings, pages (IDs/names/remarks) and actions |
| `transition` | `packageId`, `componentResourceId`, `transitionName` | Complete `UamTransitionModel`, including playback settings, fps and ordered items (target references, start/end values and more) |

Queries leave the project, revision, dirty state, cache and business events unchanged. Results are deeply detached from the session. Controllers and transitions use exact, case-sensitive names scoped to the selected component, not invented IDs or fuzzy matches. Identical names in different components do not conflict. Invalid structure, missing entities and non-unique identities within the selected scope return `entity_query_failed` with `reason` set to `invalid_query`, `not_found` or `ambiguous`; closed/missing sessions return `session_not_found`.

`updateController` and `updateTransition` accept complete snapshots, not partial patches. Copy queried `entity.properties` and change only requested fields; preserve page IDs/order/remarks, actions, item order and target references. Submit the original selector and queried revision. Updates preserve untouched page remarks and the transition's position in its component. After stale_write, query and replan the complete snapshot instead of blindly substituting a revision. A successful query does not prove references are valid; preview and validation remain separate. Gears already come with displayNode queries and need no separate tool.

Transition item `startValue` / `endValue` retain Core's `unknown[]`; queries do not infer action types or coerce numbers. The current XML reader reads CSV values as string arrays: numeric `[120, 64]` saves and rereads as `["120", "64"]`. Preserve untouched representations and compare acceptance against the authoritative saved/reread result.

Compact JSON `data` is limited to 262144 UTF-8 bytes, traversal depth 32 and 100000 nodes, advertised under `read.entityQuery.limits`. Properties are never truncated: excess returns `response_budget_exceeded`, and non-JSON values return `non_json_value`, as `entity_query_failed.reason`. Checks run before cloning; MCP envelopes and text copies are outside this data budget.

## Preview a transaction

`preflightTransaction` / `openfairygui_backend_preflight_transaction` accepts the same `{ sessionId, expectedRevision, operations }` as `applyTransaction`. This is not merely a support check: Backend's `AuthoringService` checks the revision in its existing per-session exclusive queue, deeply copies the project and source bytes, calls the authoritative `applyUamTransactionAppAsync`, then discards the resulting project.

Success returns `ok: true` with `data` containing `sessionId`, `baseRevision`, `projectedRevision` (after applying, not reserved), `mode: 'execute-and-discard'`, `impact` and `persistence`. Failures preserve transaction `error.code`, `stage`, operation locations and `meta.diagnostics`. `meta.revision` identifies the evaluated baseline; missing/closed sessions return `session_not_found`, and revision mismatches return `stale_write`. Inputs are copied before queuing, including detachment of SharedArrayBuffer-backed bytes.

Neither success nor failure changes the authoritative project, revision, dirty state, pending file cleanup, caches, jobs or business events, or writes to disk.

`impact.entities` compares current and projected formal UAM: each entry has an exact `target`, `change` (added/removed/updated) and changed top-level `fields`, without property values or source bytes. Packages and the project have their own targets. Parent collections compare ordered IDs/names; nodes, controllers and transitions compare their own properties separately. Reference normalization/rewrites performed by execution appear too, not just input selectors.

`impact.files` serializes both UAM snapshots through the real ProjectWriter in memory, then compares file contents and empty directories, returning project-relative `path`, `kind` and `change`. This is a current-revision-to-projection model diff, not cumulative dirty changes since the last save, a disk inventory, actual write list or deletion authorization. Real save rewrites the full project and cleans controlled files under its path policy.

`persistence.requiredAfterApply` is true (even an empty SDK batch advances revision and marks dirty). Storage-bound sessions suggest `saveSession`; memory sessions with only a runtime adapter need explicit host-supplied `materializeSession.storage`; unavailable adapters or unsupported UAM fidelity require `host-action`. `writeVerified` is always false. In-memory serialization failures return `transaction_preview_failed.reason: projection_failed`; more than 2000 impact entries or 262144 UTF-8 bytes of compact `data` JSON returns `response_budget_exceeded`. No truncated success is returned.

Recommended flow: discover IDs with the outline → queryEntity for current properties and revision → preflightTransaction → applyTransaction with the same batch → validateSession → saveSession. See the executable [revision-checked edit, save and reread example](./examples.md#revision-checked-edit-save-and-reread).

A preview reserves no revision and does not guarantee later apply/save or publication. Apply must check `expectedRevision` again; if edits intervened, query and re-plan instead of treating an old preview as an authorization token. Preview reuses the current transaction execution path without adding project saves, file permission/target checks or publishing checks. In-memory sessions without a filesystem can preview too.

`authoring.preflightTransaction` advertises `mode: 'execute-and-discard'` `reservesRevision: false`, `impact: 'model-diff'` and summary `limits`. Capability schema version 9 advertises five entity-query kinds and complete formal [diagnostic recovery guides](./diagnostics.md); the transaction contract version remains unchanged.

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
SHA-256: `a2cd2ae71eeb9918a61f4a0fbf32b76f75dfc6434561cbaf766f45abbf170848`

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

| CLI command | Installed output schema |
|---|---|
| `publish` | `cli/publish` |
| `ofgui` | `cli/ofgui` |
| `docs` | `cli/docs` |
| `inspect` | `cli/inspect` |
| `validate` | `cli/validate` |
| `restore` | `cli/restore` |
| `doctor` | `cli/doctor` |
| `backend-capabilities` | `cli/backend-capabilities` |
| `docs ls` | `cli/docs ls` |
| `docs find` | `cli/docs find` |
| `docs cat` | `cli/docs cat` |
| `docs diagnostic` | `cli/docs diagnostic` |
| `docs schema` | `cli/docs schema` |
<!-- contracts:end -->

Unsupported TypeScript constructs fail generation instead of becoming arbitrary payloads. New methods must appear in both Backend capabilities and MCP metadata; operations come directly from the Core union. After editing, run `pnpm contracts:generate` and `pnpm check:ci`. See the [development guide](./development.md) for verification scope.
