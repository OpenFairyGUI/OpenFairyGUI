# OpenFairyGUI Project Review and Adjustment List (2026-09)

[中文](./PROJECT_REVIEW.md)

This document records a repository-wide review covering code quality, development framework and CI, agent-friendliness, documentation and direction, and lists prioritized adjustments. It is a one-off review record and to-do list, not a current-protocol document under `docs/`; check off or remove items in the corresponding PRs once they are done or explicitly declined.

- Review baseline: `main` @ `176dff2` (v0.6.1)
- Line numbers refer to that baseline and may drift after later commits.



## PR #155 review fixes (2026-09-26)

Synchronized the root sharp dependency category and package Sharp ranges in the lockfile; frozen installation in a clean temporary workspace passed. Formal Label inputSettings preserve all fields, null/empty strings and block presence through binary/UAM. Unverified XML representations are rejected before writing files. Added an independent binary sample, both Label forms and invalid-input regressions. Earlier model 11/11 scores describe the b40d1a0 cohort, not these fixes.

## Latest delivery verification (2026-09-25)

Formatting, functional fixes, integration with next and MCP error visibility are separate commits. Full `pnpm check:ci` passed: 656 AVA tests, 42 repository tests, five-package consumers, 11/11 reference tasks, four Chromium checks and docs build. `pnpm coverage` passed: lines/statements 93.39%, functions 95.06%, branches 80.62%. Final model results are in the [baseline index](./agent/evals/baselines/README.md); counts below describe their respective earlier stages.

## Evidence levels

| Label | Meaning |
|---|---|
| Reproduced | The problem was observed by actually running the code |
| Verified | The reviewer personally read the source and confirmed it |
| Code reading | Derived from reading code, not yet re-checked line by line or run; confirm before fixing |
| Unconfirmed | Depends on fixtures, upstream behavior or environment; evidence is insufficient, no conclusion drawn |

## Summary

Engineering discipline is clearly above average for a project of this size: contract generation with drift checks, impact-map test selection, tarball consumer smoke tests, and agent-oriented diagnostic codes with recovery guidance are all in place. The main problems cluster in four areas:

1. Build output contains multiple copies of the runtime (the CLI inlines core/functions; each backend entry carries a full runtime).
2. Round-trip tests compare structure counts rather than semantics, and have already missed a real data-loss bug (R1).
3. Several security and robustness boundaries: path containment comparison, empty root lists, lock recovery, session limits.
4. Many "must update docs" rules are enforced only by honor, and hand-written facts have already drifted.

## P0 status

R2, R5, R6, R7, B1 and B2 are completed as of 2026-09-24. After B1/B2, `pnpm check:ci` passed again on Windows with Node 24.21.0 and pnpm 10.14.0: 634 AVA tests, 36 repository tests, fixture verification, lint, typecheck, guidance/contracts, all five tarball consumers (including CLI external dependencies and Backend entry identity in both formats), 10/10 reference agent tasks, four real Chromium storage/safety checks and documentation build. Existing lint and bundle-size warnings remain. The table records implemented behavior and deliberate limits.

| ID | Change | Not covered |
|---|---|---|
| R1 | Groups decoded from binary are always advanced; new Basics/Transition semantic round-trip tests (they fail without the fix); removed the "Advanced Group mode" row from the restore limitations | — |
| R2 | Exact Node canonical identities; browser `caseSensitivePaths` defaults to true, configurable for case-insensitive adapters; containment/session/lock identities agree | — |
| R3 | See the correction below; an empty list no longer means unrestricted, and stdio refuses to start when the variable is set but empty | The cwd default is kept |
| R4 | `project_open_failed.reason` (8 values); unhandled MCP failures are logged to stderr with their requestId | — |
| R5 | Atomic immutable owner metadata, OS creation identity for PID reuse, and process-ticket coordination for concurrent recovery | Unverifiable and foreign-host owners remain conflicts |
| R6 | Session/response limits and clean idle expiry (default 30 minutes); access renews expiry, dirty/busy sessions are retained | Dirty sessions require explicit save/close |
| R7 | Stage only project files/settings/assets, preserve unrelated trees and root; reverse rollback, recovery paths and cleanup warnings | No simultaneous external-reader snapshot or automatic crash recovery |
| B1 | Completed: CLI depends on core/functions; `dist/cli.mjs` is about 23 KB; consumer checks cover external imports, runtime dependencies and the same package resolution as Backend | — |
| B2 | Completed: ESM/CJS each share chunks; root and `/node` expose the same runtime class identity; separate CJS helpers eliminate the reverse dependency on the Node bridge | ESM and CJS remain separate module graphs |
| B3 | Completed: dependency and publication scopes tightened; single-process CLI bootstrap; MCP contracts and discovery schemas generated and cached on demand | First full tool discovery still generates precise schemas for every tool |

Contract impact: capability schema 12 → 14; new diagnostic code `session_limit_exceeded` (102 in total); `runProjectWriteTransaction` must return a `ProjectWriteTransactionResult` (recorded as a breaking change in the changelogs).

## 1. Correctness and security (P0)

### R1 binary→binary round trip drops GGroup — Reproduced

- Symptom: reading a published `.bytes`, writing it back and reading it again loses `GGroup` children. In the unity fixture, `Basics_fui.bytes` goes from 4 to 2 (`n25` and `n35` in `Demo_Grid` disappear) and `Transition_fui.bytes` from 2 to 0; the other sampled packages are unaffected.
- Cause: the decoder only sets `advanced=true` when the group has gears or relations (`packages/core/src/io/component-decoder-child.ts:442`), while the encoder filters out non-advanced groups (`packages/core/src/io/component-encoder-shared.ts:172`). Advanced groups that carry only layout parameters are therefore filtered.
- Protocol evidence: `docs/published-project-restore-limitations.md:68` records that simple groups are stripped from published data, and `:69` cites `Basics/Demo_Grid.xml` and `Transition/Main.xml` as samples whose groups are `advanced="true"` in the source project. Any group present in a binary child list should therefore be an advanced group.
- Adjustment: always set `advanced=true` when decoding a group from binary; then re-check whether line 69 of the restore limitations document can be removed.
- Acceptance: add a semantic round-trip test comparing, per component, child types, names, text, controllers and group count; cover at least `Basics` and `Transition`.

### R2 Path containment breaks on case-sensitive filesystems — Verified

- `packages/backend/src/path-policy.ts:31` lowercases the entire path after realpath, and `:56` then does a prefix comparison. On Linux, with allowed root `/srv/Proj`, `/srv/proj/...` is also treated as inside the root; two projects differing only by case also produce false "already open" conflicts.
- Scope: the allowed-roots check (`packages/backend/src/services/runtime-service.ts:136`) and the reader/writer containment checks.
- Adjustment: fold case only on win32/darwin, or probe whether the filesystem is case-sensitive; update the `canonicalization` capability declaration (currently `realpath+normalized-casefold`). Add a case-variant escape test.

### R3 An empty allowed-roots list means unrestricted — Verified (original finding corrected)

- Correction: the original finding, "unrestricted when the variable is unset", was wrong. `packages/mcp/src/server.ts:57` uses `[process.cwd()]` when no roots are passed.
- Actual problem: a variable set to an empty string or only delimiters parses to `[]`, and `runtime-service.ts:136` checks `?.length`, so an empty list means unrestricted. The cwd default was also undocumented.
- Adjustment: an empty list allows no project; stdio refuses to start when the variable is set but lists no directory; getting-started documents the delimiter and the cwd default.

### R4 Opening a session discards the failure reason — Verified

- The `catch {}` at `packages/backend/src/runtime.ts:113` collapses a missing `.fairy`, multiple `.fairy` files, symlinks, ENOENT and read diagnostics all into `project_open_failed` / "Unable to open project.", so an agent cannot recover from it.
- Adjustment: add a `reason` sub-code and a sanitized message; also have MCP's catch-all `backend_unhandled_error` (`packages/mcp/src/tool-handler.ts`, around line 198) write the requestId and stack to stderr.

### R5 Gaps in Node lock recovery — Verified (race parts are code reading)

- Verified: in `packages/backend/src/node.ts:25-66`, an empty or unparsable lock file makes `parseLockMetadata` return `null` and `recoverStaleLock` return `false`. A process that crashes between `open('wx')` and writing metadata leaves a permanent `lock_conflict`.
- Code reading: there is a TOCTOU window between the second read and `unlink`; PID reuse makes a stale lock look alive.
- Adjustment: write a temp file first, then link/rename it to the lock path; treat empty lock files older than a threshold as stale. Add an empty-lock recovery test.

### R6 No limits on sessions and responses — Code reading

- `open_session` / `open_project_session` have no session-count limit and no expiry, and each session holds the whole project's bytes in memory (`runtime-service.ts`, around line 180).
- `validate_session`, `get_project_outline` and `get_events` have no `maxResponseBytes` (`packages/mcp/src/tool-metadata.ts:67-103`).
- Adjustment: add a session limit and idle eviction, and response budgets for these tools.

### R7 Node save cost and leftovers — Code reading

- Every save copies the entire project root with `fs.cp` and walks it for symlinks, including non-project directories such as `.git` and Unity `Library` (`packages/backend/src/node.ts:95-178`); any unrelated symlink blocks both open and save.
- A failure to delete the backup is silently swallowed (around line 178), leaving a full project copy behind. Renaming the root on Windows can hit EBUSY/EPERM.
- Adjustment: stage only project-owned paths; return leftover backup paths as warnings.

## 2. Packaging and dependencies (P0/P1)

### B1 The CLI inlines core and functions — Completed

- `packages/cli/package.json` lists `@openfairygui/core` and `@openfairygui/functions` as devDependencies, so tsdown bundles them into `dist/cli.mjs` (about 1.15 MB; classes such as `Document`, `ByteBuffer` and pako `Deflate` are visible). Backend, being external, loads another copy, splitting `instanceof` checks and module state and allowing version drift.
- Moved them to `dependencies`; the build retains public package imports and `dist/cli.mjs` is now 22,820 bytes. Tarball consumers verify dependency declarations, external imports, a bundle-size limit and identical Core/Functions resolution from CLI and Backend.

### B2 Each backend entry carries a full runtime — Completed

- `packages/backend/tsdown.config.ts:10` sets `codeSplitting: false`, so `dist/index.mjs` and `dist/node.mjs` each define their own `BackendRuntime`, `PreviewBudgetError` and other classes. The v0.6.0 fix "recognize transaction results across separately bundled package entries" is a workaround for this.
- Unified the three-entry build with shared ESM/CJS chunks and isolated CJS interop helpers, removing the runtime chunk's reverse dependency on `node.cjs`. Build tests and tarball consumers cover both formats and both load orders, class identity and factory instances, and CJS root loading without the Node bridge. Cross-format/cross-host errors continue to use structured diagnostics.

### B3 Dependency and published-content hygiene — Completed

- Root `sharp` is a development dependency; Functions/CLI keep it optional with `>=0.33.0 <0.35.0`, explicitly supporting 0.33/0.34 without accepting unknown later minor versions. Repository tests and tarball consumers check classification and upper bounds.
- All five packages exclude duplicate `src/` sources, verified against installed files. Backend still provides ESM/CJS and declarations through its public exports.
- MCP tool definitions cache input/output Zod schemas separately; registration and initialization perform no conversion. Calls load only the corresponding tool; discovery generates and caches precise JSON schemas on demand. Host policies also compose lazily and SDK dynamic tool management remains intact. First full discovery still processes every tool.
- The CLI bootstrap imports its entry and runs in the current process. Built-entry tests disable all child-process spawning APIs while checking version, JSON argument errors and exit codes to prevent a return to subprocess bootstrapping.
- Acceptance: `pnpm check:ci` passed on 2026-09-24 with Windows / Node 24.21.0 / pnpm 10.14.0: 636 AVA tests, 37 repository tests, all five tarball consumers, 10/10 reference agent tasks, four real Chromium checks and documentation build. Existing lint and documentation bundle-size warnings remain.

## 3. Code quality (P1)

| ID | Issue | Evidence | Adjustment |
|---|---|---|---|
| Q1 | GButton child controller/page/sound/volume/checked are read from `extras`, but neither read path writes them, so re-encoding always emits defaults; violates the AGENTS.md `extras` boundary | Verified: `packages/core/src/io/component-encoder-child.ts:579-601` | Model them as formal `GButton` properties used by both encoder and decoder |
| Q2 | Label instance input settings are always written as `false`; `promptText` and related data may be lost on publish | Verified hard-coded `false`: `component-encoder-child.ts:757`; actual data loss Unconfirmed (needs a fixture with a prompt) | Gather evidence, then complete the encoding |
| Q3 | Button/Label extension data has two encoder implementations that have drifted (title-color check and volume write condition differ); the extension-type map is defined in three places | Code reading: `component-encoder-child.ts:564-624` vs `:718-760`; `packages/core/src/io/binary-writer.ts:455` | One writer per extension payload and one shared enum table |
| Q4 | `extras` still carries protocol or flow fields: `sprites`, `_publishedFile`, `_preservePackageResourceOrder`, `_filePath`, the `extensionType` fallback | Code reading: `binary-reader.ts`, `binary-writer.ts`, `project-package-reader.ts` | Promote to formal properties or move into reader/writer context; drop `extras.sprites` |
| Q5 | The `_rawBinary` reuse path is unreachable in practice: all components are dirty after reading, so writing always re-encodes. If it ever became reachable, string indices inside reused bytes would point into the old string table | Reproduced unreachable; risk is code reading | Remove the path, or add string remapping plus a test |
| Q6 | `GComponent` getters declare narrower return types than their defaults provide and return `undefined` at runtime; the encoder compensates with `?? 0` | Code reading: `packages/core/src/properties/g-component.ts:98-105` | Complete the defaults; remove fields duplicated from `IGObject` |
| Q7 | XML protocol table keys are not checked by the compiler (`Record<string, XmlAttrSpec>`); the `implemented` field is never read; a `displayObject` protocol node still exists | Code reading: `packages/core/src/io/project-xml-protocol.ts:4,24-48,616` | Keep literal keys with a `const` generic; delete the unused field; rename `displayObject` |
| Q8 | Root-entry UAM exports differ from `./uam` and expose internals such as `ReaderContext` and `BinaryWriter` | Code reading: `packages/core/src/index.ts:19-166` | Unify the re-exports; move internals out of public entries or mark them `@internal` |
| Q9 | Core errors lack structured codes (about 155 `throw new Error`); preflight projection exceptions are swallowed by `catch { return; }` | Code reading: `packages/core/src/uam/preflight/projected-state.ts:296,352` | Introduce `ProjectIOError` / `BinaryFormatError`; return a `projection_failed` support issue on projection failure |
| Q10 | Type escapes concentrate in property accessors: about 144 `any` and 86 `as never` in core | Code reading: `g-movie-clip.ts`, `g-combo-box.ts`, `g-button.ts`, `skeleton-resource-base.ts` | Fix the `GComponent` generics, following `GImage` |
| Q11 | A misspelled `--packages` name is silently filtered out on publish; when nothing matches, only one warning is logged and the run still succeeds | Verified: `packages/functions/src/publish.ts:329-337` | Fail on unknown names |
| Q12 | There is no `--no-plugins`; project plugins run through jiti by default; without `-o`, publish writes non-atomically to the output directory from project settings | Code reading: `packages/functions/src/adapters/node/plugins.ts:88-90` | Add the flag and document the trust boundary |
| Q13 | CLI and backend each have a `resolveFairyPath`, and they already behave differently (the latter resolves realpath) | Code reading: `packages/cli/src/utils/project-input.ts`, `packages/backend/src/path-policy.ts:62` | Keep one |
| Q14 | Image validation fully decodes pixels and relies only on sharp's default pixel limit; restore creates canvases sized from binary data with no upper bound | Code reading: `adapters/node/validate.ts:77`, `adapters/node/restore.ts:128` | Set `limitInputPixels` explicitly and cap canvas dimensions |
| Q15 | Minor: `binary-reader.ts:588` ignores the return value of `seek`; `ByteBuffer.getCustomString` creates a new `TextDecoder` per call; Node/Web `exists` treats permission errors as "missing" | Code reading | Fix in passing |

Tests:

- The round-trip tests (`packages/core/test/write-binary.test.ts:737-810`) compare only package ID, resource count and sprite count, which is why R1 went unnoticed.
- Split very large test files by topic: `packages/backend/test/browser-safe-project-session.integration.test.ts` (3838 lines) and `write-binary.test.ts` (2915 lines).
- Missing tests: case-variant path escape, empty-lock recovery, simultaneous save-commit and rollback failure, MCP response limits, unknown `--packages` names.

## 4. Development framework and CI (P1)

| ID | Issue | Evidence | Adjustment |
|---|---|---|---|
| D1 | Formatting is not enforced: `lint` and `lint:ci` are identical and neither checks formatting; the Biome formatter reports 278 of 351 files as non-conforming | Scripts verified; error count measured by a review agent | One separate full-format commit; switch `lint:ci` to `biome ci`; remove the duplicate script |
| D2 | AVA tests run only on Ubuntu + Node 22; Windows runs only `pack:check`; Node 24 is not covered | Verified: `.github/workflows/ci.yml` | Test matrix `{ubuntu, windows} × {22, 24}` |
| D3 | Push-triggered CI runs only on `main`; results after merges into `next` are never validated | Verified: `ci.yml:5-7` | `branches: [main, next]` |
| D4 | The release workflow grants `id-token/contents/packages: write` at workflow level, so every step (including dependency install scripts and browser downloads) has them; actions are not pinned by SHA | Verified: `.github/workflows/release.yml:9-12` | Split into a read-only build-and-verify job and a publish job; pin actions by SHA |
| D5 | Release gates are weaker than `check:ci` (missing `refs:verify`, `test:repo`, `check:agent-links`, `docs:build`); it does not check that both changelogs contain the version; it uses `generate_release_notes: true`, conflicting with the AGENTS.md changelog rule | Verified: `release.yml:174` | Run `pnpm check:ci` or require that the SHA passed CI; verify both changelog entries and use them as the release body |
| D6 | A backend test rebuilds the CLI mid-run and can race parallel tests over `dist`; it is also why the impact map has a "cli → backend" rule, inverting the layers | Verified: `packages/backend/test/cli-bootstrap.integration.test.ts:44-47` | Move it to `packages/cli/test`, rely on a prior build; drop backend from the cli rule |
| D7 | Tests mix `src` (tsconfig paths) and `dist` (subprocess and isolated-build tests), so running `pnpm test` alone may hit a stale `dist` | Code reading | Build explicitly in `check:ci`, or add `pretest` |
| D8 | Coverage has no threshold anywhere and CI does not collect it | Verified: only a `coverage` script exists | Enable `c8 --check-coverage` in one CI job, or remove the script |
| D9 | TypeScript aliases: `typescript` points to TS6 (for API use) and `@typescript/native` to TS7 (for `tsc`). Both packages provide a `tsc` bin, contracts are generated and type-checked by different compilers, and consumer checks cover only TS6 | Verified: root `package.json` | Document the reason next to package.json and call the TS7 path explicitly; consider a TS 5.x consumer check |
| D10 | Diagnostic scripts do not tolerate git errors: on dubious ownership, `repo-doctor` crashes entirely and `test-changed` misreports "cannot resolve comparison base" and falls back to the full suite | Reproduced | Catch per section, report git stderr, and suggest `safe.directory` |
| D11 | Biome rules are loose: `noExplicitAny` and `useNodejsImportProtocol` are both off | Verified: `biome.json` | Enable the latter now (no current violations); set the former to warn for `src` |
| D12 | `--no-worker-threads` is repeated in several places | Code reading | Set `workerThreads: false` in the AVA config |
| D13 | Docs deployment does not wait for CI; the pnpm version duplicates `packageManager` | Code reading: `.github/workflows/deploy-docs.yml` | Trigger via `workflow_run` after CI succeeds; remove the duplicate version |
| D14 | Repository hygiene: `referer/` in `.gitignore` is likely a typo for `reference/` (the local `reference/` is ignored only through `.git/info/exclude`); `/[Oo]bj/` is a .NET leftover | Verified | Fix the ignore rules |

## 5. Agent-friendliness (P1)

Maintainer side (coding agents):

- A1 There is no root `CLAUDE.md`, so Claude Code does not load `AGENTS.md` automatically. Adjustment: add a `CLAUDE.md` containing only `@AGENTS.md` (absence verified).
- A2 Root and package AGENTS.md files give different verification commands. The root requires `check:fast --base origin/next`; backend, cli, core, functions and mcp say `pnpm test:changed`, which skips lint and typecheck. The `pnpm check:ci` required by core and test-utils needs network access and a browser download, with no offline fallback stated (verified). Adjustment: align on the root command and state an offline fallback.
- A3 Rules on field ownership, doc sync and "no legacy" recur across several tables in AGENTS.md; the documents listed in the impact map are hints only and omit `project-xml-attribute-reference.md`, `publish-plugins.md`, `guide/contracts.md`, `guide/diagnostics.md` and `guide/installed-docs.md`. Adjustment: merge into one rule table; have `check:fast` warn when a rule matches but none of its documents changed, with an explicit opt-out.
- A4 Guidance and development docs contain many qualifiers and disclaimers with very long sentences, which costs tokens and buries the next action. `docs/architecture-overview.md` now contains file-by-file implementation detail, so every refactor requires an architecture-doc edit. Adjustment: keep only boundaries and data flow in the architecture doc; add a short English contributor summary.

Consumer side (agents editing projects through MCP/CLI):

- A5 stdio MCP provides no default `instructions` (verified in `packages/mcp/src/stdio.ts`); the workflow, schemas and operation catalog are available only as resources, which many MCP clients do not show to the model. Adjustment: ship about six lines of default instructions (read the docs index, then outline → query → preflight → apply → validate → save) and add a read-only docs tool.
- A6 Tool descriptions contain internal jargon ("P1/P2" and "backend P2 runtime surface" in `packages/mcp/README.md:9,38`). `open_session` does not say it accepts a directory or a `.fairy` file, mention the allowed-roots variable, or say to close the session afterwards; `apply_transaction` does not mention preflight first, `expectedRevision` or `stale_write` (code reading).
- A7 MCP transmits binary data as a JSON number array, about 4× the size, duplicated in `content.text` and `structuredContent` (code reading: `tool-handler.ts:122-136`). Adjustment: use base64 or a resource blob and always emit compact JSON. The input budget check may run after the SDK's full schema parse (unconfirmed).
- A8 Neither surface covers the full loop: the CLI has no preflight/apply, and MCP has no publish. Adjustment: add `ofgui tx preflight|apply --ops <file> --expected-revision <rev>`, and an MCP publish that the host must explicitly enable.
- A9 Model evaluations have only a Codex runner and no published baseline; the ten tasks are mostly single edits. Adjustment: add a second client and publish scores per release.

## 6. Documentation (P2)

| ID | Issue | Evidence |
|---|---|---|
| W1 | Hand-written numbers are stale: diagnostics says 102 codes (the generated catalog has 101); capability schema says 9 (`packages/backend/src/contracts.ts` is 12); the MCP README says "20-method" while the same file lists 17 tools | Verified: `docs/guide/diagnostics.md:5,7`, `packages/mcp/README.md:36` |
| W2 | `docs/project-validation.md` has no English version; `scripts/check-guidance.mjs:129-130` normalizes `docs/en/` before comparing, hiding the gap | Verified |
| W3 | Versions are hard-coded in prose: `getting-started.md` says 0.6.1 and `README.md` says `0.5.0-alpha.1`; `examples/package.json` uses `^` ranges while the docs require exact versions; `examples/README.md` omits 4 examples | Code reading |

Adjustment: maintain counts and versions in generator-owned marker regions and have `check-guidance` reject hand-written count claims; add a check that every `docs/**/*.md` has a `docs/en/**` counterpart.

## 7. Direction

Current assessment:

- Positioning: a headless, agent-safe FairyGUI editing kernel (UAM transactions, sessions and revisions, offline contracts).
- Concentrated maintenance: about 390 of roughly 400 commits come from one maintainer; bus factor is 1.
- Pace: v0.4.0 to v0.6.1 shipped within four days, and v0.6.0 raised the Backend contract to 3.0.0 and removed the job methods. Recent releases focus on refactoring and hardening.
- "No legacy compatibility" suits the current stage but will hurt external hosts once they integrate.
- Visual UI results are explicitly marked "unverified" in the docs (`docs/guide/getting-started.md`).

Suggested priorities:

1. Stable surface: define the 1.0 public surface (UAM operations + Backend methods), establish a deprecation window and slow down breaking releases.
2. Visual verification: headless rendering or per-controller-page screenshots to close the "UI result unverified" gap; the largest payoff for agent loops.
3. Capability matrix: a generated table of FairyGUI editor features × read/edit/save/publish support, so agents know up front what is unsupported.
4. Surface parity: default MCP instructions, CLI transaction commands and opt-in MCP publish (A5, A8).
5. Public evaluations: at least two clients, with results published per release (A9).
6. Lower the contribution barrier: an English contributor summary, good-first-issues and less documentation ceremony, aiming for a second maintainer.

## 8. Suggested phases

| Phase | Content | Notes |
|---|---|---|
| Batch 1 (fixes) | R1 + semantic round-trip test; B1; B2; R2; R4 | One PR each; R1, B1 and B2 affect published output and need changelog entries |
| Batch 2 (gates) | D1 full format (separate commit); D2, D3, D4, D5; D6 | D1 produces a large diff and should stay separate from functional changes |
| Batch 3 (agent experience) | A1, A2, A5, A6, W1, W2 | Mostly documentation and metadata changes |
| Batch 4 (robustness) | R3 (decide the policy first), R5, R6, R7, Q11, Q12, Q14 | R3 needs a maintainer decision on the default policy |
| Batch 5 (quality debt) | Q1–Q10, Q13, Q15, D7–D14, A7, B3 | Can be interleaved; Q1 and Q2 need evidence first |
| Planning | Section 7, items 1–6 | Schedule after aligning with the root roadmap |

## 9. Ruled-out suspicions

- "Reused raw component bytes point into the old string table and cause widespread corruption": in practice every component is dirty after reading and writing always re-encodes, so the path is unreachable and caused no corruption; downgraded to the latent risk in Q5.
- Overall layering: the runtime dependencies functions → core, backend → core/functions and mcp → backend match the architecture doc; MCP itself is about 600 lines with no domain logic; core has no runtime import cycles, and `node:` imports appear only in modules reachable from the Node entry.

## 10. Review limitations

- In the local review environment, `node_modules` links were broken (pointing to an old drive letter) and pnpm was unavailable, so typecheck and AVA were not run. R1 was reproduced in a temporary directory using the built core `dist`.
- Items marked "Code reading" or "Unconfirmed" must be re-checked or backed by further evidence before fixing; for protocol fields (Q1, Q2), first confirm sources and samples according to the evidence rules in AGENTS.md.

## Q1–Q15 resolution (2026-09-24)

- Q1: Formal Button controller/page/checked properties and existing sound/volume accessors share instance encoding and decoding; covered by two binary cycles and XML round-trip.
- Q2: The pinned Unity GLabel.Setup_AfterAdd and Editor ChoosePackageDialog Label prompt sample establish prompt encoding. Other unmodeled input overrides are not claimed as supported recovery.
- Q3: Button/Label share extension instance I/O. Encoder, decoder and BinaryWriter share an ObjectType-derived table, distinguishing absent colors from explicit black.
- Q4: Atlas/Sprite, publishedFile and preserveResourceOrder use formal properties; component paths live in ReaderContext. Removed the extras extensionType fallback.
- Q5: Removed original component byte reuse, dirty tracking and graph listeners. Each component re-encodes against the output string table.
- Q6: Reinspection found concrete numeric/collection defaults already present in GComponent, so the original undefined claim was incorrect. Removed duplicated IGObject fields/defaults and added getter regression coverage.
- Q7: Const generics preserve XML keys; removed implemented and named the common attribute collection sharedDisplayAttributes, without representing an XML entity.
- Q8: Root re-exports all UAM APIs; BinaryReader/Writer use project-io and ReaderContext is private.
- Q9: Protocol I/O uses ProjectIOError/BinaryFormatError. projection_failed blocks transactions and retains available operation location. Native filesystem errors and RangeError retain their identities.
- Q10: Concrete control accessors no longer escape through any/never. Generic property-graph and reference boundaries retain localized assertions verified by type checking.
- Q11: Any unknown package name fails before workflow hooks and output writes, including mixed valid/invalid names.
- Q12: CLI --no-plugins and Node plugins: [] disable discovery/execution. Bilingual documentation states process-level trust and excludes configured outputs without -o and out-of-directory writes from rollback guarantees.
- Q13: CLI reuses Backend /node resolveNodeFairyPath instead of duplicating project resolution.
- Q14: Node decoding and restore canvases explicitly cap allocation at 16,777,216 pixels and validate dimensions first.
- Q15: Check sprite block seek, reuse TextDecoder, and preserve access failures in exists while treating missing paths as absent.

Protocol evidence: FairyGUI-unity `8cc8f214cca79685532eef13372d0a4f74acdf08`, `Assets/Scripts/UI/GButton.cs:500–539` and `GLabel.cs:190–217`; FairyGUI-Editor `1eab9445dd8e73c716f8a5f71c27dcbca7b4b68f`, `ui/assets/Builder/dialogs/ChoosePackageDialog.xml:33`. Fixture versions and integrity passed refs:verify.

Acceptance: `pnpm check:ci` passed on Windows / Node 24.21.0 / pnpm 10.14.0: 645 AVA tests, 37 repository tests, contracts for 41 operations / 17 Backend methods, five tarballs, 14 ESM / 14 CJS entries, 10/10 reference agent tasks, four real Chromium checks and documentation build. Lint has no errors and retains 15 warnings; documentation build retains bundle-size warnings.

The final sources additionally passed `pnpm pack:check`, including five-package consumer verification after the plugin publish-plan correction. All changes remain in this worktree, uncommitted and unpushed.

## Development and CI (D1–D14) resolution（2026-09-24）

| ID | Resolution |
|---|---|
| D1 | Formatted maintained sources, correcting 295 files initially. lint:ci runs biome ci; duplicate lint is removed. Generated files and fixtures remain outside manual formatting. Changes remain in the worktree without a formatting commit. |
| D2 | Quality uses Ubuntu/Windows × Node 22/24. Actual local verification uses Windows / Node 24; the remote matrix runs after submission. |
| D3 | Both main and next pushes run full CI. |
| D4 | Release verification is read-only; only the separate publish job receives write permissions, without checkout or project dependency installation. All Actions in the three workflows use verified commit SHAs. |
| D5 | release:prepare checks all five versions and bilingual version/link/category/item-count parity with nonempty notes. Release bodies come directly from both changelogs. Full check:ci --browser-deps and exact-tarball checks precede upload; publishing verifies SHA256 and disables lifecycle scripts. Translation meaning still requires human review. |
| D6 | Bootstrap tests belong to CLI; CLI/MCP tests no longer rebuild shared dist mid-run. CLI impact selection no longer includes Backend in reverse. |
| D7 | test, test:debug and coverage explicitly build first; selected tests retain their pre-build. Full CI keeps independent consumer and test builds. |
| D8 | Coverage gates require 90% lines/statements/functions and 75% branches. Ubuntu / Node 22 enforces and uploads LCOV. Measured: 93.51% lines, 95.06% functions, 80.59% branches. |
| D9 | typecheck explicitly invokes the TS7 package path. package.json toolchain and bilingual development guides explain the TS6 Compiler API / TS7 checker split. Consumers verify TS6; TS5 support is not claimed. |
| D10 | Doctor preserves other sections and exposes Git stderr with safe.directory guidance. Selection no longer labels every Git failure as an invalid base. Real dubious-ownership subprocess regression passes without changing global trust. |
| D11 | node: imports are enforced as errors; explicit any in src warns. |
| D12 | workerThreads: false is centralized in root AVA configuration. Four concurrent test files avoid Windows process-start contention. |
| D13 | Pages waits for successful main push CI, checks out that head_sha and skips superseded commits. packageManager owns pnpm version selection. Build and deployment permissions are separated. |
| D14 | The correct /reference/ ignore remains, obsolete .NET obj rules are removed, and .release/ artifacts are ignored. |

Acceptance: pnpm check:ci passed (645 AVA tests, 40 repository tests, five-package consumers, 10/10 reference agent tasks, four Chromium storage/safety checks and documentation build). pnpm coverage passed all tests and thresholds. actionlint 1.7.12 validated all three workflows; Bash syntax checks passed for 24 run steps, without shellcheck/pyflakes. Fifteen lint warnings and documentation bundle-size warnings remain. Extraction of the actual bilingual v0.6.1 release notes passed. Remote matrix CI, publishing and deployment were not triggered; the changes from that stage have since been organized into commits.

## Agent experience, documentation governance and planning (2026-09-24)

| IDs | Result |
|---|---|
| A1–A4 | CLAUDE.md imports AGENTS.md; package verification commands and offline limits align; root rules are consolidated, impact docs expanded and explicit documentation-review waivers recorded; architecture is concise and English contribution guidance is available. |
| A5–A6 | Default MCP workflow instructions and read-only docs tool; consumer descriptions cover paths, allowed roots, close, preflight, revision and stale-write handling without internal milestone jargon. |
| A7 | Generated output byte paths encode base64 only in structuredContent; transport snapshot schemaVersion 2. Inputs retain arrays and extension JSON is untouched. Budget checks precede schema compilation/deep parsing; SDK still parses transport JSON. |
| A8 | CLI tx previews or previews/applies/validates/saves/closes in one Backend session, sharing the byte codec with MCP. Fresh invocation revision 0 is not a cross-process disk token. Optional MCP publishing delegates only to an explicitly injected host owning authorization/output/plugin policy. |
| A9 | Complete evaluation: reference, native Codex and native Claude all passed 11/11 on the same five packages after next integration and the MCP error-summary fix. Claude Code 2.1.281 reported claude-opus-5-5; Codex 0.154.0 used its configured model without an override. The initial Claude 9/11 failures remain recorded; grading was not weakened. See the baseline index. This qualifies a local workspace snapshot, not a published release. |
| W1–W3 | Generated product-fact blocks and handwritten-fact guards; actual English counterparts including project-validation; exact example versions and complete example navigation. Semantic review remains necessary. |
| Planning 1–6 | Root bilingual roadmap entries lead to canonical site plans with stages, owner roles and acceptance criteria for 1.0/deprecation, visual verification, capability matrix, consumer entrypoints, dual-client evaluation and maintainer onboarding. Visual hosting and the full feature matrix remain planned, not implemented. |

See [baseline evidence and limits](./agent/evals/baselines/README.md). Original configuration/connectivity failures remain in the [historical attempts](./agent/evals/baselines/history.md), not model capability scores. Stage records retain their original validation scope; current delivery follows the latest acceptance.

Verification at that stage: pnpm check:ci passed end to end (648 AVA tests, 42 repository tests, five tarball consumers, 11/11 reference tasks, four Chromium storage/safety checks, consumer declarations and docs build). The separately exported reference baseline passed 11/11 with matching harness hashes. Existing 15 lint warnings and the docs bundle-size warning remain. The subsequent real Codex evaluation passed 11/11; subsequent complete Claude results are recorded in the baseline evidence. After the settings-option change, check:fast --base origin/next passed (648 AVA and 42 repository tests), as did docs:check. Remote CI and publishing were not performed.
