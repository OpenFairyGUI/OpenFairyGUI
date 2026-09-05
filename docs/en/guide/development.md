# Repository development and verification

This guide is for contributors and agents. SDK users should start with [Getting Started](./getting-started.md) and [Packages and Tools](./packages.md). Run every command from the repository root.

## First checkout

Prepare Git, Node.js and pnpm using your existing version-management tools. `.node-version` selects the recommended development major (24); the root `packageManager` selects the exact pnpm version (10.14.0). No personal machine paths or global agent configuration are required.

Package metadata still declares Node `>=20`, and CI tests 20, 22 and 24. The development recommendation does not narrow that range. Development dependencies can require newer patch releases within those majors.

```bash
pnpm repo:setup
pnpm check:ci
```

`repo:setup` initializes submodules at their Git-recorded commits, installs with the frozen lockfile, builds, runs repository-tool tests and runs doctor. It writes dependencies/build output and initializes submodules; it does not rewrite the lockfile, select Node, install global tools or fetch restricted local references. Use `repo:setup`, not pnpm's built-in `setup` environment command.

For a dirty checkout, consider an isolated worktree before dependency or documentation work. Do not reset user changes, delete dependencies or regenerate the lockfile to work around an environment problem. Submodule network/TLS failures are acquisition failures, not evidence of a Node or product regression.

## Verification entrypoints

| Command | Coverage |
|---|---|
| `pnpm repo:doctor --json` | Read-only Node/pnpm, dependencies, exported files, native image capability, temporary-directory permission and reference status |
| `pnpm refs:status` | Observe required fixtures and optional references; missing material alone does not fail a status query |
| `pnpm refs:sync` | Native Git submodule initialization at gitlinks; no remote-tip tracking or forced overwrite |
| `pnpm refs:verify` | Required fixture commits, working trees and probe files; nonzero exit on failure |
| `pnpm test:repo` | Built-in Node tests for repository tooling, without product builds or external fixtures |
| `pnpm test:changed --base origin/next --list` | Print a plan only; replace the base with the actual PR target |
| `pnpm check:fast` | Lint, typecheck, repository-tool tests and guidance checks; build the workspace before any selected AVA tests; not a full regression or documentation build |
| `pnpm check` | Fixture verification, lint, typecheck, build, repository-tool tests and all AVA tests |
| `pnpm docs:check` | Local links, agent paths/commands, impact-table drift, public source mappings, bilingual entries, Changelog structure and contract drift |
| `pnpm contracts:generate` | Generate MCP/CLI structural contracts, operations, complete diagnostic guides, snapshots and bilingual tables from Core/Backend/CLI types |
| `pnpm contracts:check` | Read-only operation/method mapping, formal diagnostic coverage/ownership and generated-drift checks; repository tests also check CLI registrations |
| `pnpm docs:build` | Explicit TypeDoc generation followed by VitePress; no dependency on implicit pre-script settings |
| `pnpm pack:check` | Build/install five tarballs outside the checkout; verify public entries, types, CLI/MCP, three Node examples and real Chromium OPFS edits/save/reload/locks/paths/image bytes; download the matching browser on first use |
| `pnpm eval:agent --runner reference` | Ten deterministic tarball/MCP task checks, including editing, safe stops and separate publish/recovery tasks; also run by `pack:check`, without calling a model |
| `pnpm eval:agent --runner codex --codex codex` | Manual real-model tasks with state checks, traces and failure evidence; excluded from PR CI |
| `pnpm check:ci` | Full check, guidance checks, documentation build and tarball consumer checks; use before submitting |

Doctor does not install, download, configure or write files. Export-file presence does not prove build freshness or browser behavior. Its temporary-directory permission check does not prove free space. Missing native image support produces a warning; image tasks still need actual verification. A non-recommended Node major warns; an unsupported Node version, mismatched pnpm or missing required fixtures/build output fails.

### Changed-test selection

`agent/impact-map.json` is the only mapping source. `pnpm test:changed --matrix` renders the marked table in root AGENTS, and guidance checks reject drift.

- The base comes from `--base`, then PR `GITHUB_BASE_REF`, then local `origin/HEAD`. No automatic fetch occurs; the ref must exist locally.
- The plan combines branch changes since merge-base, staged, unstaged and untracked paths. Renames include old and new paths; deletions are included.
- The first matching rule wins. Core/test-utils cover all downstream packages; functions/backend cover their consumers. CLI also selects Backend's bootstrap tests.
- Unknown paths, dependency/shared configuration changes, unavailable bases/shallow history and no changes fall back to the entire suite, never an empty success.
- Recognized documentation-only work may use repository-only mode, which still runs tooling tests and guidance checks. `check:ci` additionally builds the documentation.
- Every selected test group must match files. Listed documents are review prompts, not a demand to rewrite unrelated protocol descriptions.
- Selected AVA tests always follow a workspace build so built CLI/MCP/backend tests cannot load stale dependency output; build failures stop execution. Documentation-only mode and `--list`/`--matrix` do not build.
- Tests use pnpm's AVA shim, preserving the environment required by existing isolated-build tests. Do not call AVA's raw JS entrypoint. Direct Node invocation of the selection script supports plan/matrix inspection only.

PR quality jobs run `check` on all three Node majors. Documentation runs guidance checks and builds on the recommended Node; consumer jobs run `pack:check` on Linux/Windows with that Node major. Documentation and consumer jobs do not download fixtures. Together these three job types correspond to local `check:ci`; `check:fast` and `check` do not install tarballs. Remote URLs, heading anchors, translation meaning and protocol accuracy still require review.

Consumer checks install dependencies over the network, remove their temporary directory on success and preserve failures; `--keep` preserves successful runs too. Release uses `pnpm pack:check --artifacts .release` to check the same packed files. See [Runnable Examples and Consumer Verification](./examples.md) for entrypoints, examples and limits.

Agent evaluations share that tarball installation. Deterministic host checks gate consumer verification; model success rates are manual observations only. See [Real Agent Task Evaluations](./agent-evaluations.md) for tasks, isolation, Windows executable requirements and reproduction.

## Reference evidence

`references.json` records authority, probe files and acquisition limits. The three required upstream submodules live under `packages/test-utils/test/fixtures/`:

| Submodule | Authority |
|---|---|
| FairyGUI-Editor | Current editor UI, settings and plugin API; not the legacy binary exporter |
| FairyGUI-layabox | Layabox consumption code and paired demo source/published resources |
| FairyGUI-unity | Unity consumption code and paired example source/published resources |

URLs come only from `.gitmodules`; commits come only from Git gitlinks. `pnpm refs:sync` retrieves those versions. Ordinary builds and complete tests do not require `referer/`. The tracked FairyGUI-Experiments project and generated minimal test objects remain controlled fixtures in their current locations.

Null `source`/`revision` values for local references mean unknown provenance, not pinned versions. Status distinguishes missing from unverified; restoring a folder does not make it authoritative. Restricted evidence tasks can explicitly run:

```bash
pnpm refs:verify --require legacy-editor
```

Local corpus provenance cannot currently be verified automatically, so explicit require fails. Ask the maintainer for the original source, version, paired samples and redistribution permission, and perform task-specific verification. Do not guess download locations or commits, substitute a newer UI repository for old exporter code, or make ordinary CI depend on restricted source.

Use official documentation first, editor source including worker code second, paired source/published samples third, runtime consumption fourth and supplementary material last. If decisive evidence is missing, stop that protocol conclusion and identify the missing material; unrelated work can continue.

| Optional local path | Role and constraint |
|---|---|
| `referer/Docs` | Official concepts, terms, defaults and visible behavior; resolve conflicts using source evidence |
| `referer/Editor/scripts/fairygui/editor` | Legacy AS3/AIR project I/O, settings and exporters; prioritize publish/exporter, settings, gui and api |
| `referer/Editor/scripts/fairygui/editor/worker` | Publishing/conversion details absent from the main-thread source |
| `referer/UIProject` and `referer/Release` | Paired legacy projects/artifacts; measure actual XML tag distributions and inspect matching outputs |
| `referer/Runtimes` | Consumption-side evidence; prefer pinned fixture repositories, not an unversioned copy |
| `referer/FairyGUI-Editor` | Current settings/UI/plugin examples; prefer the pinned submodule, not binary-protocol inference |
| `referer/API` | Supplementary interface lookup; hashed static pages are not the first evidence source |
| `referer/fgui-restore` | Parser sanity checks and small regressions, not protocol authority |
| `referer/glTF-Transform` | Packaging, naming, testing and API design inspiration only |

Check exporters for output-naming differences. Establish settings through documentation, sample JSON and editor source; establish field ownership through real XML tags. Distinguish legacy source/artifact pairs from newer editor/runtime samples. Prefer paired semantic binary checks, not a lone package or header Version difference. Check plugin interfaces before consulting supplementary API pages. Do not prioritize Unity Library, caches or hashed static pages.

## Product documentation and repository diagnosis

Installed packages use `ofgui docs` and `ofgui doctor --json` without a checkout. `pnpm contracts:generate` updates contracts and corpus under `packages/backend/src/generated/`; package-version, workflow and thin-skill changes also require regeneration and `pnpm contracts:check`. `pnpm pack:check` verifies CLI/MCP corpus parity, versions, doctor and the packaged skill. Repository prerequisites still use `pnpm repo:doctor`; see [installed docs](./installed-docs.md).

## Small glossary

| Term | Meaning here |
|---|---|
| Source Project / Published Package | Editable authoring project versus runtime output; different contracts |
| UAM / Document | Public declarative authoring model versus mutable low-level property graph; transaction guarantees belong to the UAM entrypoint |
| Lift / Materialize | Document to UAM / UAM to Document; materialization is not saving or publishing |
| Session / Revision | Backend editing state and its version; mutations supply expectedRevision |
| Transaction support / Apply | Support checking and execution are distinct; success does not guarantee saving |
| Source bytes | Explicitly hydrated binary data, not preserved through JSON cloning |
| Capability plane | Separate service/host capability scopes; reading does not imply editing, saving or publishing |
| Semantic round-trip | Preservation of supported meaning, not byte-for-byte XML or binary equality |

Root and package AGENTS own package rules and public-contract pointers. The [architecture overview](../architecture-overview.md) explains actual data flows. Do not edit `packages/*/dist/`, `docs/public/api/` or `docs/.vitepress/dist/` directly. New key documentation must update both root READMEs and documentation indexes; releases update both Changelogs. Structural checks do not replace semantic review.
