# Installed OpenFairyGUI workflow

This is a minimal offline companion, not the full website. Read `ofgui docs ls --json` for the installed package version, contract version, capability schema version and digest. Use the project's installed `ofgui`/`ofgui-mcp`, not a global executable or an online latest-version lookup. A mismatched installation must be reconciled by the host before editing.

## Discover the current contract

- `ofgui docs find "selector" --json` searches this installed corpus.
- `ofgui docs cat contracts --json` lists Core operations and Backend/MCP mappings.
- `ofgui docs schema setDisplayNodeProps --json` reads one self-contained operation schema.
- `ofgui docs cat methods/queryEntity --json` reads precise input/output wire schemas.
- `ofgui docs diagnostic stale_write --json` reads recovery guidance.
- MCP `resources/read` at `openfairygui://docs/index` provides the same index and content URIs. MCP is local stdio, not an assumed HTTP port.

The generated schemas describe JSON wire structure and input budgets, not semantic validity. Native SDK byte fields remain Uint8Array; MCP transports declared byte fields as integer arrays. Arbitrary extension data is not converted. Host objects/functions are omitted from MCP wire schemas; use SDK declarations for host injection, not guessed JSON fields.

## Edit safely

1. Read capabilities. Existing projects use openSession (with host authorization and a lifetime lock); openProjectSession accepts a host-supplied authoritative UAM, not a shortcut around lossy file-session guards.
2. Read getProjectOutline to discover exact IDs, then queryEntity for the relevant current properties and actual revision. Its fixed projection excludes source bytes; budget failures require host inspection.
3. Read the operation and method schemas. Plan the smallest authorized batch using current identifiers and expectedRevision.
4. preflightTransaction executes on an isolated snapshot and discards it. It does not reserve a revision, save files or guarantee later apply/save/publish.
5. Only when authorized, applyTransaction with the planned batch and expectedRevision. On stale_write, refresh and replan; never blindly substitute a newer revision.
6. validateSession checks the new authoritative state. A successful response can contain an invalid or incomplete validation report; require status valid and complete true before treating validation as passed.
7. When authorized, saveSession checks revision independently and writes the original project only. Keep path policy, UAM fidelity and rollback guards. Close the session only after handling unsaved changes. Read saved output again when disk round-trip is part of acceptance.

## Diagnose without repair

`ofgui doctor --json` checks the installed CLI/documentation version and the Node Backend capability snapshot. `ofgui doctor <project-directory-or-fairy-file> --json` additionally runs the existing Node project validation, including source reads and available image decoding. It opens no Backend session, creates no lock, installs nothing, writes no probe files and changes no configuration.

Exit 0 means the requested checks completed; exit 1 means a detected error; exit 2 means project validation is incomplete. Without a project, source bytes and native image decoding are not exercised. The capability manifest is a declaration, not a filesystem permission, decoder, publish or runtime-rendering test. This product doctor does not inspect Git, pnpm, repository builds or fixture submodules; maintainers use pnpm repo:doctor for those.

Read diagnostic guides for ownership and recovery boundaries. Missing bytes/decoders, rejected paths and expired sessions require host action; do not invent repair/hydration tools, widen roots, discard unsaved work, or turn incomplete validation into success.
