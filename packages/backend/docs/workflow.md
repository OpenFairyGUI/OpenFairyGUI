# Installed OpenFairyGUI workflow

This is a minimal offline companion, not the full website. Read `ofgui docs ls --json` for the installed package version, contract version, capability schema version and digest. Use the project's installed `ofgui`/`ofgui-mcp`, not a global executable or an online latest-version lookup. A mismatched installation must be reconciled by the host before editing.

## Discover the current contract

- `ofgui docs find "selector" --json` searches this installed corpus.
- `ofgui docs cat contracts --json` lists Core operations and Backend/MCP mappings.
- `ofgui docs schema setDisplayNodeProps --json` reads one self-contained operation schema.
- `ofgui docs schema cli/validate --json` reads the installed CLI output schema; `cli/docs cat` is a valid exact document ID for the nested command.
- `ofgui docs cat methods/queryEntity --json` reads precise input/output wire schemas.
- `ofgui docs diagnostic stale_write --json` reads recovery guidance.
- MCP `resources/read` at `openfairygui://docs/index` provides the same index and content URIs. MCP is local stdio, not an assumed HTTP port.

The generated schemas describe JSON wire structure and input budgets, not semantic validity. Native SDK byte fields remain Uint8Array; MCP transports declared byte fields as integer arrays. Arbitrary extension data is not converted. Host objects/functions are omitted from MCP wire schemas; use SDK declarations for host injection, not guessed JSON fields.

All CLI JSON uses `{schemaVersion:1,command,success:true,result}` or `{schemaVersion:1,command,success:false,error:{code,message},result?}`. Documentation version/index/body fields are inside `result`; read `result.text` for document content. Invalid/incomplete validate and doctor responses retain their full report under `result`. Help/version are text; other JSON-mode stdout contains exactly one document and human logs use stderr. Exit codes: 0 success, 1 workflow failure, 2 arguments, 3 incomplete validation. CLI owns envelopes, not new workflow semantics.

## Edit safely

1. Read capabilities. Existing projects use openSession (with host authorization and a lifetime lock); openProjectSession accepts a host-supplied authoritative UAM, not a shortcut around lossy file-session guards.
2. Read getProjectOutline to discover exact identities, then queryEntity for the relevant current properties and actual revision. Capabilities list the supported read.entityQuery.kinds: resource, component, displayNode, controller and transition. Controllers use packageId + componentResourceId + controllerName; transitions use packageId + componentResourceId + transitionName. Names are exact and component-scoped; duplicates fail as ambiguous. Controller snapshots include pages/actions; transition snapshots include items. Gears are already included in displayNode snapshots. Fixed projections exclude source bytes; budget failures require host inspection.
3. Read the operation and method schemas. Plan the smallest authorized batch using current identifiers and expectedRevision.
4. preflightTransaction executes on an isolated snapshot and discards it. It does not reserve a revision, save files or guarantee later apply/save/publish.
5. Only when authorized, applyTransaction with the planned batch and expectedRevision. On stale_write, refresh and replan; never blindly substitute a newer revision.
6. validateSession checks the new authoritative state. A successful response can contain an invalid or incomplete validation report; require status valid and complete true before treating validation as passed.
7. When authorized, saveSession checks revision independently and writes the original project only. Keep path policy, UAM fidelity and rollback guards. Close the session only after handling unsaved changes. Read saved output again when disk round-trip is part of acceptance.

updateController and updateTransition replace complete snapshots, not partial patches. Copy the queried entity.properties, change only the requested fields, preserve page IDs/remarks/actions, item order/targets, settings and references, and submit the original selector with the queried revision. A stale_write requires refreshing and replanning the full snapshot. Querying does not validate references or grant permission to edit them.

## Diagnose without repair

`ofgui doctor --json` checks the installed CLI/documentation version and the Node Backend capability snapshot. `ofgui doctor <project-directory-or-fairy-file> --json` additionally runs the existing Node project validation, including source reads and available image decoding. It opens no Backend session, creates no lock, installs nothing, writes no probe files and changes no configuration.

Exit 0 means the requested checks completed; exit 1 means a detected error; exit 2 means invalid arguments; exit 3 means project validation is incomplete. Without a project, source bytes and native image decoding are not exercised. The capability manifest is a declaration, not a filesystem permission, decoder, publish or runtime-rendering test. This product doctor does not inspect Git, pnpm, repository builds or fixture submodules; maintainers use pnpm repo:doctor for those.

Read diagnostic guides for ownership and recovery boundaries. Every formal Core/Backend diagnostic code is covered; shared codes list all `owners`, while response `owner` identifies the actual source. Missing bytes/decoders, rejected paths and expired sessions require host action; do not invent repair/hydration tools, widen roots, discard unsaved work, or turn incomplete validation into success. Invalid/unsupported operations require schema-based replanning, live locks cannot be removed, and write failures require preserving dirty state and inspecting actual files.

## Publish and recover trusted local artifacts

Publishing and restoration are external Node-hosted workflows, not Backend session methods or general MCP editing tools. The host must authorize input and output directories independently. They require the native image capability; do not rename binary extensions to imitate a different target profile.

- `ofgui publish <project> --output <release-directory> --project-type layabox --json` publishes the current saved project. `--output` overrides runtime artifact destinations; configured code generation still uses its own destinations and project plugins run as trusted local code.
- The JSON document is `{schemaVersion:1,command:"publish",success:true,result:{files:[{path,size}]}}`. Paths are final absolute paths and sizes are bytes. The Node SDK `publishNode()` returns the same `result`. The manifest records actual successful filesystem/atlas writes, including code written through the supplied publish filesystem; it excludes pre-existing untouched files, deletions and arbitrary plugin I/O outside that filesystem. It is not an inventory of everything in the output directory. Explicit runtime output is staged and rolled back on failure; separately configured code outputs and arbitrary plugin effects are not covered by that directory transaction.
- `ofgui restore <trusted-release-directory> --output <separate-project-directory> --project-type layabox --json` returns `{schemaVersion:1,command:"restore",success:true,result:{projectPath,packages:[{id,name}],warnings:[]}}`. Warnings are not a validation pass. Reread the returned projectPath and run `ofgui validate <projectPath> --json`; require valid and complete validation.
- Both artifact commands exit 0 on workflow success, 1 on workflow failure, and 2 on command syntax errors. Errors are `{schemaVersion:1,command,success:false,error:{code,message}}`, with `publish_failed`, `restore_failed` or `invalid_arguments`. In JSON mode stdout contains only this document; human/plugin output goes to stderr. Help remains human-readable. Errors do not include a claimed successful file manifest.
- Restore requires a separate directory, not a `.fairy` file. Do not force overwrite by default. `--force` replaces an existing nonempty target only after complete staged recovery; parse/image failures retain the previous target. Only trusted local artifacts are supported, not arbitrary third-party imports.
- Read `ofgui docs cat restore-limits --json` or MCP resource `openfairygui://docs/restore-limits` for the installed version's full recovery boundary. Accept readable, structurally valid supported semantics and decoded assets, not original project IDs, workspace state, unpublished resources, original filenames/extensions, controller editor selection/export flags, float32 text precision or byte-identical XML.
