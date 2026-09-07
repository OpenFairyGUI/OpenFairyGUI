# Development Task Recipes

Complete [environment and reference checks](./development.md), then follow only the relevant route. Source paths below are repository-relative; package constraints live in `packages/<name>/AGENTS.md`. Small changes do not require reading the entire architecture or copying a second contract.

## Shared verification

```bash
pnpm test:changed --base origin/next --list
pnpm check:fast
pnpm check:ci
```

Replace the base with the actual target branch. The plan includes downstream tests and documentation review hints; fast checks are not full regression. After changing public types, MCP metadata, per-code guidance or installed documentation, run `pnpm contracts:generate` before checking drift. Never hand-edit snapshots, dist or API pages. Test files below are entrypoints, not replacements for the impact-selected suite.

## Add a Project XML field

1. Establish the actual tag, semantics, default and source version using [protocol evidence](#protocol-evidence-and-search), then find an existing field on that tag. Put the formal model in its concrete class or smallest shared layer under `packages/core/src/properties/`, not initially in `extras` or generic `GObject`.
2. Trace `packages/core/src/io/project-xml-protocol.ts` and the relevant component/display XML reader/writer. For UAM fields, update `packages/core/src/uam/model.ts`, `bridge-lift.ts`, `bridge-materialize.ts` and validation. Extend a binary encoder/decoder only when evidence establishes a binary-protocol field.
3. Use `packages/core/test/project-xml-protocol.test.ts` and related read/write/UAM tests for default/non-default values, tag ownership and round-trip preservation. Update the affected [XML protocol](../project-xml-attribute-reference.md), [publish settings](../editor-publish-settings.md) or [binary protocol](../fairygui-binary-package-format.md). A writer emitting one string is not sufficient proof.

## Add a UAM operation

1. Define formal input and selectors in `packages/core/src/uam/transaction-contracts.ts`; inspect the support scope in `model.ts`. Reuse similar operations without MCP-specific grammar.
2. Trace the stable `transaction.ts` facade into `transaction-preflight.ts` and the existing UAM-native / Document paths (`transaction-uam-apply.ts`, `transaction-document-apply.ts`), changing only applicable paths. Under `packages/core/src/uam/preflight/`, locate settings, display, behaviors, resources or resource-folders by invariant; lifecycle owns ordered structural projection and projected-state owns final reference checks. Preserve input immutability on failure, sourceBytes, batch ordering, diagnostic ordering and reference constraints. Support checking is not full execution preview.
3. Start from `packages/core/test/uam-transaction-support.test.ts`, `uam-transaction-apply.test.ts` and `uam-transaction-lifecycle.test.ts` for success, invalid selectors, same-batch dependencies and atomic failure. New diagnostics require Core types and ownership/recovery guidance in `packages/backend/src/diagnostics.ts`. Generate [contracts](./contracts.md), then check Backend preview, save/reread and MCP wire bytes.

## Add a Backend method

1. Inputs/results/errors belong in `packages/backend/src/runtime/contracts.ts`; shared versions and envelopes live in `packages/backend/src/contracts.ts`. Keep `runtime.ts` as a facade and use the appropriate existing `services/` responsibility, not another operation kernel or dispatch layer.
2. Reads bind the actual revision and return detached, bounded data. Mutations preserve per-session exclusion, expectedRevision, failure without commit and save rollback. Host paths stay at Node/storage boundaries, outside the browser-safe root.
3. Review `runtime/capabilities.ts` and version policy when capabilities actually change. Use `packages/backend/test/revision-staleness.integration.test.ts`, `safe-editing.integration.test.ts`, `save-semantics.integration.test.ts` and `browser-entry.contract.test.ts`. Update the [architecture](../architecture-overview.md); expose intended tool methods using the next route.

## Add or change an MCP tool

1. Backend must already own the method. Update method mapping, read/write/destructive annotations, host-field exclusions and input budgets in `packages/mcp/src/tool-metadata.ts`; follow the existing dispatch in `tool-handler.ts`. `tool-definitions.ts` assembles generated schemas, not handwritten operation unions or broad result types.
2. Generate and check contracts; update resources/prompts when needed. Annotations do not grant authority or weaken roots, revision or byte budgets. MCP does not gain publish/restore host execution.
3. Use `packages/mcp/test/backend-tool-mapping.integration.test.ts`, `contract-schemas.integration.test.ts` and `stdio-smoke.integration.test.ts` for discovery, malformed input, structured errors and actual calls. Verify installed entrypoints with the [public stdio example and tarball consumer](./examples.md). stdout carries protocol only; do not assume an HTTP port.

## Diagnose publishing and limited recovery

1. Preserve the source and failure evidence. Use installed `ofgui doctor <project> --output-dir <separate-output> --json` to distinguish environment/source failures and read `ofgui docs diagnostic <code> --json`. Doctor runs no plugins, publish or restore and cannot guarantee later writes.
2. Trace settings, resource closure, atlas and output coordination from `packages/functions/src/publish.ts`; the Node host is `adapters/node/publish.ts`. Check explicit output, separate code destinations and plugin effects against [publish settings](../editor-publish-settings.md) and [plugin boundaries](../publish-plugins.md). Compare binary semantics, blocks and actual consumption, not header Version alone.
3. Use `packages/functions/test/publish-output-resolution.test.ts`, `publish-dependencies.test.ts`, `restore.test.ts` and `packages/cli/test/artifacts.integration.test.ts`. Acceptance checks actual file manifests, decoded pixels, rereading and failure rollback. Recovery accepts trusted local artifacts and independent targets; do not experiment with `--force` on the user's original directory. The full [recovery limits](../published-project-restore-limitations.md) and [consumer checks](./examples.md) remain authoritative.

## Protocol evidence and search

```bash
pnpm refs:status
pnpm refs:verify
pnpm refs:grep "public class UIPackage"
```

`refs:grep` accepts one non-empty, single-line, case-sensitive literal; leading dashes and regex metacharacters remain text. It first verifies required fixtures, then searches tracked text and prints paths/line numbers. Exit 0 means matches, 1 means no match and 2 means argument/reference/search errors. Failure returns no partial success and never installs, downloads or resets anything. Results exceeding 64 KiB or Git's output budget also fail; narrow the literal or use native Git/rg in a verified source directory.

Read public fixture URLs from `.gitmodules`, fixed commits from gitlinks and `refs:status`, and source roles from `references.json`. Search hits are not protocol conclusions. See the [development guide](./development.md#reference-evidence) for source selection, version verification and missing-evidence handling.
