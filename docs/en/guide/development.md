# Repository development and verification

This guide is for contributors and agents. SDK users should start with [Getting Started](./getting-started.md) and [Packages and Tools](./packages.md). Run every command from the repository root.

## First checkout

Prepare Git, Node.js and pnpm using your existing version-management tools. `.node-version` selects the recommended development major (22); the root `packageManager` selects the exact pnpm version (10.14.0). No personal machine paths or global agent configuration are required.

Package metadata declares Node `>=22`. CI, documentation deployment and releases all use Node 22 from `.node-version`. Newer majors satisfy the declared package range but are not continuously verified. Development dependencies can require newer patch releases of Node 22.

```bash
pnpm repo:setup
pnpm check:ci
```

`repo:setup` initializes submodules at their Git-recorded commits, installs with the frozen lockfile, builds, runs repository-tool tests and runs doctor. It writes dependencies/build output and initializes submodules; it does not rewrite the lockfile, select Node or install global tools. Use `repo:setup`, not pnpm's built-in `setup` environment command.

For a dirty checkout, consider an isolated worktree before dependency or documentation work. Do not reset user changes, delete dependencies or regenerate the lockfile to work around an environment problem. Submodule network/TLS failures are acquisition failures, not evidence of a Node or product regression.

## Verification entrypoints

| Command | Coverage |
|---|---|
| `pnpm repo:doctor --json` | Read-only Node/pnpm, dependencies, exported files, native image capability, temporary-directory permission and reference status |
| `pnpm refs:status` | Observe registered public fixtures; missing material alone does not fail a status query |
| `pnpm refs:sync` | Native Git submodule initialization at gitlinks; no remote-tip tracking or forced overwrite |
| `pnpm refs:verify` | Required fixture commits, working trees and probe files; nonzero exit on failure |
| `pnpm refs:grep "literal text"` | Verify required fixtures, then use Git to search tracked text for a case-sensitive literal; repository-relative paths and line numbers; 0 match, 1 no match, 2 error |
| `pnpm test:repo` | Built-in Node tests for repository tooling, without product builds or external fixtures |
| `pnpm test:changed --base origin/next --list` | Print a plan only; replace the base with the actual PR target |
| `pnpm check:fast` | Lint, typecheck, repository-tool tests and guidance checks; build the workspace before any selected AVA tests; not a full regression or documentation build |
| `pnpm check` | Fixture verification, lint, typecheck, build, repository-tool tests and all AVA tests |
| `pnpm docs:check` | Local links, agent paths/commands, impact-table drift, public source mappings, bilingual entries, Changelog structure and contract drift |
| `pnpm contracts:generate` | Generate MCP/CLI structural contracts, operations, complete diagnostic guides, snapshots and bilingual tables from Core/Backend/CLI types |
| `pnpm contracts:check` | Read-only operation/method mapping, formal diagnostic coverage/ownership and generated-drift checks; repository tests also check CLI registrations |
| `pnpm docs:build` | Explicit TypeDoc generation followed by VitePress; no dependency on implicit pre-script settings |
| `pnpm pack:check` | Build/install five tarballs outside the checkout; verify public entries, types, CLI/MCP, seven Node examples and real Chromium OPFS edits/save/reload/locks/paths/image bytes; download the matching browser on first use |
| `pnpm eval:agent --runner reference` | Ten deterministic tarball/MCP task checks, including editing, safe stops and separate publish/recovery tasks; also run by `pack:check`, without calling a model |
| `pnpm eval:agent --runner codex --codex codex` | Manual real-model tasks with state checks, traces and failure evidence; excluded from PR CI |
| `pnpm check:ci` | Full check, guidance checks, documentation build and tarball consumer checks; use before submitting |

Doctor does not install, download, configure or write files; submodule status queries also disable Git's optional index-refresh writes. Export-file presence does not prove build freshness or Node/Web runtime behavior; `pack:check` verifies actual consumer boundaries. Sharp checks exercise in-memory PNG/JPEG encoding and pixel decoding, not just version metadata; unavailable or failed codecs warn, without proving real publish/restore workflows. The temporary path must be an accessible directory, but access flags do not prove ACL permissions, free space, later writes or rollback. A non-recommended Node major warns; an unsupported Node version, mismatched pnpm or missing required fixtures/build output fails.

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

PR CI first fetches full Git history and classifies changes against the PR base commit using the existing impact map through `test:changed --list`. Only a `repository-only` plan skips quality/consumer jobs; documentation still runs the repository script checks in `scripts/repository.test.mjs`, `docs:check` and `docs:build`. Code, site configuration, scripts, dependencies, unknown paths, no changes or an unavailable comparison base select full checks. A failed scope job also does not silently skip product checks. The workflow remains triggered; only individual jobs are skipped.

Full CI runs `check` on Node 22. Documentation runs guidance checks and builds on the same Node major; consumer jobs run `pack:check` on Linux/Windows with that Node major. Documentation and consumer jobs do not download fixtures. These three full job types correspond to local `check:ci`; documentation-only routing is not a full regression, and `check:fast` and `check` do not install tarballs. Pushes to main always run full checks. A new run for the same PR cancels its older run; separate pushes to main do not cancel each other. Remote URLs, heading anchors, translation meaning and protocol accuracy still require review.

The release workflow installs npm 11 separately on Node 22 to meet the CLI requirements for [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/). Repository dependency installation and verification still use the pinned pnpm version.

Consumer checks install dependencies over the network, remove their temporary directory on success and preserve failures; `--keep` preserves successful runs too. Release uses `pnpm pack:check --artifacts .release` to check the same packed files. See [Runnable Examples and Consumer Verification](./examples.md) for entrypoints, examples and limits.

Use the repository's `.github/pull_request_template.md` to identify affected packages, UAM/Backend/MCP/CLI contracts, version handling, documentation and bilingual changelogs, together with the actual tested base, commands and failed/unrun checks. The template records review evidence; checkboxes neither replace CI nor authorize publication or prove verification.

Agent evaluations share that tarball installation. Deterministic host checks gate consumer verification; model success rates are manual observations only. See [Real Agent Task Evaluations](./agent-evaluations.md) for tasks, isolation, Windows executable requirements and reproduction.

## Reference evidence

`references.json` records only public fixture roles and probe files. The three required upstream submodules live under `packages/test-utils/test/fixtures/`:

| Submodule | Authority |
|---|---|
| FairyGUI-Editor | Current editor UI, settings and plugin API; not the legacy binary exporter |
| FairyGUI-layabox | Layabox consumption code and paired demo source/published resources |
| FairyGUI-unity | Unity consumption code and paired example source/published resources |

URLs come only from `.gitmodules`; commits come only from Git gitlinks. `pnpm refs:sync` retrieves those versions. Builds and tests use these public submodules, the tracked FairyGUI-Experiments project and generated minimal test objects.

`refs:grep` reuses that registration and verification, searching only tracked text in the three submodules. It skips binaries, untracked/ignored files and files outside the registered scope. Missing, dirty, mismatched or incomplete fixtures and Git search failures prevent partial success; resolve the reported problem without automatic synchronization or overwrites. A path/line match locates evidence; it does not make that source authoritative for legacy exporters. For a particular source or richer queries, first verify its status and role with `refs:status`, then use native Git/rg in that directory.

Base protocol conclusions on maintained repository documentation, pinned public fixtures and publicly verifiable primary sources. Record sources, applicable versions and test evidence. If decisive evidence for a field or publishing rule is missing, mark that conclusion unverified, stop it and identify the missing material; unrelated work can continue. Public fixture status checks do not establish every protocol rule.

Check output naming and settings against public documentation, source projects and paired published artifacts for the relevant version; establish field ownership through real XML tags. Verify behavior separately for each version; runtime compatibility alone does not establish a project or publishing protocol. Prefer paired semantic binary checks, not a lone package or header Version difference.

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

See [Development Task Recipes](./task-recipes.md) for concrete entrypoints, evidence requirements and acceptance checks. It navigates existing implementation, not a second protocol or operation grammar.
