# Contract sources and operation discovery

Core's `UamTransactionOperation` and UAM models own parameter structure and transaction semantics. Backend's public signatures own session inputs, results and errors. CLI owns process JSON envelopes while reusing workflow result types. MCP owns only tool metadata, JSON transport conversion and transport budgets.

`pnpm contracts:generate` uses the existing TypeScript compiler to read those types and generate MCP structural schemas, the operation catalog, a contract snapshot, and the tables below. MCP reuses Zod to create validators from JSON Schema; Core does not depend on Zod. The read-only `pnpm contracts:check` verifies mapping completeness and generated-file drift through repository tests and `docs:check`.

## Read the current session model and resource bytes

Use `readSessionState({ sessionId, expectedRevision? })` to consume the complete current UAM, or `queryEntity` below for selected properties. The complete read returns a detached copy of state committed at the instant of the call: `project`, actual `revision`, `dirty`, `lastSavedRevision`, `readComplete`, `readDiagnostics` and `uamFidelity`.

`project` derives directly from Core's public UAM types, excluding only the formal `sourceBytes` field on each asset resource. It retains `sourcePath`, complete components and Reader-retained JSON extensions. Extension properties named `sourceBytes` are not recursively removed. Only this complete read-model output schema accepts unnamed object fields; declared fields retain their formal types, and transaction inputs and existing query contracts are unchanged. Reads do not revalidate references, normalize or repair projects, or expose internal Documents, locks, filesystems, caches or cleanup queues.

Call `readResourceBytes({ sessionId, expectedRevision, selector: { packageId, resourceId } })` for one asset resource's primary file bytes already held in the session. It returns the actual revision, selector and a detached `Uint8Array` (an integer array in MCP). It does not read disk, load auxiliary files or fill missing bytes. Components do not support this byte read.

```ts
const state = runtime.readSessionState({ sessionId });
if (!state.ok) throw new Error(state.error.code);
const bytes = runtime.readResourceBytes({
  sessionId,
  expectedRevision: state.data.revision,
  selector: { packageId, resourceId },
});
if (!bytes.ok) throw new Error(bytes.error.code);
```

Every resource read must carry the model's revision. `stale_read` returns both `expectedRevision` and `actualRevision`; discard that incomplete model/bytes collection and restart rather than mixing edit revisions. Reads neither wait for uncommitted transactions nor retain history or reserve a revision. Saves can update public `sourcePath`, dirty state and other bookkeeping without advancing the edit revision: sessionId + revision is not a permanent identity for identical complete raw UAM.

`readComplete` and `uamFidelity` report existing session flags faithfully. In-memory sessions can report `true` / `full` even without source bytes. These flags do not guarantee complete bytes, rendering or saving. Missing/closed sessions return `session_not_found`; other refusals use `session_read_failed.reason`: `invalid_query`, `not_found`, `ambiguous`, `unsupported_resource`, `bytes_unavailable`, `response_budget_exceeded` or `non_json_value`. Failure never returns truncated data as success.

| Budget | Limit |
|---|---|
| `read.sessionState.limits` | 4 MiB of compact JSON UTF-8 for complete `data`, depth 64, 500000 nodes; checked before cloning |
| `read.resourceBytes.maxBytes` | 1 MiB per primary file, checked before copying; empty byte arrays are readable |
| Both new MCP tools | 16 MiB per complete JSON-serialized `CallToolResult`, including compact text and structuredContent; excess returns `mcp_response_budget_exceeded` without changing Backend budgets or other tools |

Measurements using the repository's pinned fixtures follow (bytes; model means `readSessionState.data`, response means complete `CallToolResult`; request-ID length and similar metadata can slightly change totals). These informed separate model/resource reads, not a promise of unlimited project size.

| Project | Model JSON | Model MCP response | Largest primary file | Its resource MCP response |
|---|---:|---:|---:|---:|
| FairyGUI-Experiments | 15357 | 33882 | 460259 | 3254840 |
| FairyGUI-layabox demo | 938862 | 2049115 | 254483 | 1818508 |
| FairyGUI-unity UIProject | 1173851 | 2561306 | 350200 | 2049424 |
| FairyGUI-Editor ui | 2717892 | 5935515 | 18048 | 114842 |

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
| `project` | No selector; target is only `{ "kind": "project" }` | `projectId` and complete project `settings` |
| `package` | `packageId` | Package `id`, `name` and complete `settings` (`compressPNG`, `jpegQuality`, `publish`) |
| `resource` | `packageId`, `resourceId` | Identity, name, path, export/favorite/branch fields, plus existing filenames, dimensions and image/movieClip properties; no source bytes, sourcePath, arbitrary metadata or component contents |
| `component` | `packageId`, `componentResourceId` | Component `size`, `properties`, `customData`; excludes displayList, controllers and transitions |
| `displayNode` | `packageId`, `componentResourceId`, `displayNodeId` | Formal UAM node properties, including modeled references, relations and gears |
| `controller` | `packageId`, `componentResourceId`, `controllerName` | Complete `UamControllerModel`, including selection, home-page settings, pages (IDs/names/remarks) and actions |
| `transition` | `packageId`, `componentResourceId`, `transitionName` | Complete `UamTransitionModel`, including playback settings, fps and ordered items (target references, start/end values and more) |

`updateProjectSettings` and `updatePackageSettings` replace complete settings snapshots. Query the corresponding `project` or `package`, copy `entity.properties.settings`, change only requested fields and retain all other nested settings and optional fields. Submit the complete `settings` with the queried revision; package settings also require the original `packageId` selector. After `stale_write`, query and replan to avoid overwriting other edits with an old snapshot. Settings queries share the same response budgets as other entities.

Queries leave the project, revision, dirty state, cache and business events unchanged. Results are deeply detached from the session. Controllers and transitions use exact, case-sensitive names scoped to the selected component, not invented IDs or fuzzy matches. Identical names in different components do not conflict. Invalid structure, missing entities and non-unique identities within the selected scope return `entity_query_failed` with `reason` set to `invalid_query`, `not_found` or `ambiguous`; closed/missing sessions return `session_not_found`.

`updateController` and `updateTransition` accept complete snapshots, not partial patches. Copy queried `entity.properties` and change only requested fields; preserve page IDs/order/remarks, actions, item order and target references. Submit the original selector and queried revision. Updates preserve untouched page remarks and the transition's position in its component. After stale_write, query and replan the complete snapshot instead of blindly substituting a revision. A successful query does not prove references are valid; preview and validation remain separate. Gears already come with displayNode queries and need no separate tool.

Transition item `startValue` / `endValue` retain Core's `unknown[]`; queries do not infer action types or coerce numbers. The current XML reader reads CSV values as string arrays: numeric `[120, 64]` saves and rereads as `["120", "64"]`. Preserve untouched representations and compare acceptance against the authoritative saved/reread result.

Compact JSON `data` is limited to 262144 UTF-8 bytes, traversal depth 32 and 100000 nodes, advertised under `read.entityQuery.limits`. Properties are never truncated: excess returns `response_budget_exceeded`, and non-JSON values return `non_json_value`, as `entity_query_failed.reason`. Checks run before cloning; MCP envelopes and text copies are outside this data budget.

## Preview a transaction

`preflightTransaction` / `openfairygui_backend_preflight_transaction` accepts the same `{ sessionId, expectedRevision, operations }` as `applyTransaction`. This is not merely a support check: Backend's `AuthoringService` checks the revision in its existing per-session exclusive queue, deeply copies the project and source bytes, calls the authoritative `applyUamTransactionAppAsync`, then discards the resulting project.

Success returns `ok: true` with `data` containing `sessionId`, `baseRevision`, `projectedRevision` (after applying, not reserved), `mode: 'execute-and-discard'`, `impact` and `persistence`. Failures preserve transaction `error.code`, `stage`, operation locations and `meta.diagnostics`. `meta.revision` identifies the evaluated baseline; missing/closed sessions return `session_not_found`, and revision mismatches return `stale_write`. Inputs are copied before queuing, including detachment of SharedArrayBuffer-backed bytes.

Neither success nor failure changes the authoritative project, revision, dirty state, pending file cleanup, caches or business events, or writes to disk.

`impact.entities` compares current and projected formal UAM: each entry has an exact `target`, `change` (added/removed/updated) and changed top-level `fields`, without property values or source bytes. Packages and the project have their own targets. Parent collections compare ordered IDs/names; nodes, controllers and transitions compare their own properties separately. Reference normalization/rewrites performed by execution appear too, not just input selectors.

`impact.files` serializes both UAM snapshots through the real ProjectWriter in memory, then compares file contents and empty directories, returning project-relative `path`, `kind` and `change`. This is a current-revision-to-projection model diff, not cumulative dirty changes since the last save, a disk inventory, actual write list or deletion authorization. Real save rewrites the full project and cleans controlled files under its path policy.

The existing pre-transaction snapshot may contain the invalid reference being repaired; its materialization is used only for in-memory comparison. The projected snapshot remains strictly validated. Core `materializeUamProject` validates by default; explicit `{ validate: false }` is for inspecting invalid snapshots only. `writeProjectFromUam`, Backend Save, and Materialize never skip validation. Snapshots that cannot be represented or serialized still return `projection_failed`.

`persistence.requiredAfterApply` is true (even an empty SDK batch advances revision and marks dirty). Storage-bound sessions suggest `saveSession`; memory sessions with only a runtime adapter need explicit host-supplied `materializeSession.storage`; unavailable adapters or unsupported UAM fidelity require `host-action`. `writeVerified` is always false. In-memory serialization failures return `transaction_preview_failed.reason: projection_failed`; more than 2000 impact entries or 262144 UTF-8 bytes of compact `data` JSON returns `response_budget_exceeded`. No truncated success is returned.

Recommended flow: discover IDs with the outline → queryEntity for current properties and revision → preflightTransaction → applyTransaction with the same batch → validateSession → saveSession. See the executable [revision-checked edit, save and reread example](./examples.md#revision-checked-edit-save-and-reread).

A preview reserves no revision and does not guarantee later apply/save or publication. Apply must check `expectedRevision` again; if edits intervened, query and re-plan instead of treating an old preview as an authorization token. Preview reuses the current transaction execution path without adding project saves, file permission/target checks or publishing checks. In-memory sessions without a filesystem can preview too.

`authoring.preflightTransaction` advertises `mode: 'execute-and-discard'` `reservesRevision: false`, `impact: 'model-diff'` and summary `limits`. `read.entityQuery.kinds` advertises seven entity-query kinds, alongside complete formal [diagnostic recovery guides](./diagnostics.md). Read the current contract and capability schema versions from `getCapabilities`.

## Transport and semantic boundaries

- Core binary values remain `Uint8Array`. MCP represents declared binary fields as integer arrays (0–255) and explicitly restores them through generated field paths. Replacement operations, resource/package snapshots, and imported projects share this conversion. A same-named `sourceBytes` field in arbitrary JSON metadata is not rewritten.
- Host objects are not tool inputs: `openProjectSession.storage`, `saveSession.fileSystem`, and `materializeSession.storage/fileSystem/targetPath` remain excluded. Host injection uses Backend APIs.
- Schemas preserve open fields declared by the actual types, including extension settings, resource metadata, and some dynamic values. They do not invent missing protocol definitions. Unknown fields on closed objects are rejected instead of silently dropped.
- Homogeneous fixed tuples (such as the four numbers in `scale9Grid` / `cornerRadius`) use a single `items` schema with equal `minItems` / `maxItems`. MCP discovery does not need positional item arrays; element types and exact lengths stay enforced. Heterogeneous tuples retain their per-position constraints.
- Inputs retain batch limits (1–1000), integer revisions, selector lengths, and aggregate node/depth/string budgets. General limits are depth 32, 100000 nodes, 10000 entries per array/object, 1000000 characters per string, and 256 per key. Only generated contract byte paths accept integer 0–255 arrays outside the general array-length and per-byte node limits; all byte fields together are limited to 8 MiB. Same-named fields in arbitrary metadata receive no exemption. Per-field schemas do not replace aggregate limits.
- Structural validity does not replace Core checks for references, resource content, field applicability, or legal operation batches, and does not guarantee execution or saving. MCP adds no second transaction kernel; preview only maps the authoritative Backend entrypoint.
- Method-specific outputs preserve Backend error categories. Unhandled adapter errors use `backend_unhandled_error` without exposing internal exceptions. Structural schemas do not promise response budgets or diagnostic recovery policies.
- The MCP factory's `toolPolicies` declare a Host `failureSchema` and `beforeCall` check for selected tools. Checks receive detached validated wire input; returning `undefined` invokes Backend once with the original input, while a declared `ok: false` branch stops the call. Tool response budgets also apply to Host failures; Backend results always use the canonical schema. SDK discovery includes subsequently registered Host tools and policy output extensions, marked by `openfairygui/hostPolicy` metadata. The fixed contract digest and installed corpus describe only the Backend branch.

## Generated catalog

The tables summarize top-level parameters only; read schemas for nested fields and concrete results. SHA-256 identifies generated contract content, not a package version.

<!-- contracts:start -->
SHA-256: `bca2577811c82f4d17f1f5f2833ea617415b8166086178cfc48888cc1cab587c`

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
| `readSessionState` | `openfairygui_backend_read_session_state` | `sessionId`, `expectedRevision?` | `true` |
| `readResourceBytes` | `openfairygui_backend_read_resource_bytes` | `sessionId`, `expectedRevision`, `selector` | `true` |
| `validateSession` | `openfairygui_backend_validate_session` | `sessionId` | `true` |
| `preflightTransaction` | `openfairygui_backend_preflight_transaction` | `sessionId`, `expectedRevision`, `operations` | `true` |
| `applyTransaction` | `openfairygui_backend_apply_transaction` | `sessionId`, `expectedRevision`, `operations` | `false` |
| `saveSession` | `openfairygui_backend_save_session` | `sessionId`, `expectedRevision?`, `targetPath?`, `force?`, `mode?` | `false` |
| `materializeSession` | `openfairygui_backend_materialize_session` | `sessionId`, `expectedRevision?`, `mode?`, `reason?` | `false` |
| `closeSession` | `openfairygui_backend_close_session` | `sessionId` | `false` |
| `getEvents` | `openfairygui_backend_get_events` | `sessionId`, `after?`, `limit?` | `true` |
| `getCacheSnapshot` | `openfairygui_backend_get_cache_snapshot` | `sessionId` | `true` |
| `refreshCache` | `openfairygui_backend_refresh_cache` | `sessionId`, `reason?` | `false` |

| CLI command | Installed output schema |
|---|---|
| `publish` | `cli/publish` |
| `validate` | `cli/validate` |
| `restore` | `cli/restore` |
| `ofgui` | `cli/ofgui` |
| `docs` | `cli/docs` |
| `inspect` | `cli/inspect` |
| `doctor` | `cli/doctor` |
| `backend-capabilities` | `cli/backend-capabilities` |
| `docs ls` | `cli/docs ls` |
| `docs find` | `cli/docs find` |
| `docs cat` | `cli/docs cat` |
| `docs diagnostic` | `cli/docs diagnostic` |
| `docs schema` | `cli/docs schema` |
<!-- contracts:end -->

Unsupported TypeScript constructs fail generation instead of becoming arbitrary payloads. New methods must appear in both Backend capabilities and MCP metadata; operations come directly from the Core union. After editing, run `pnpm contracts:generate` and `pnpm check:ci`. See the [development guide](./development.md) for verification scope.
