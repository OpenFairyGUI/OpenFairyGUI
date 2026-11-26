# OpenFairyGUI Roadmap

[中文](./ROADMAP.md)

> **Status: proposal, not a release commitment.** This document reflects the repository state at v0.7.1 (2026-11-26) on the `main` trunk. Shipped capabilities are defined by the [Changelog](./CHANGELOG.md) and the [documentation](./docs/en/README.md); `docs/` describes only the current implementation, and plans are recorded only in this file.

## Versioning and release rules

| Type | Rule |
|---|---|
| patch (0.7.x) | Bug fixes, security updates, and dependency range fixes only. No new features and no public API or contract changes. Released as needed. |
| minor (0.x.0) | One theme per release, listed under its entry in this file. Breaking changes land only in minor releases and must be recorded under that release's "Planned breaking changes" before merging. |
| Cadence | One minor release every 4 weeks. Ship what has merged by the cutoff and defer unfinished work to the next train; never merge half-finished work to hit a date, and never slip a release to wait for one item. |
| Prereleases | Off by default. Publish `-rc.N` (npm `next` dist-tag, GitHub prerelease) only when external consumers need early verification of breaking changes. After a stable release, the release workflow automatically advances the npm `next` dist-tag to that release if `next` is older. |
| Unplanned work | Reserve roughly 30% of each cycle for unplanned fixes (most of v0.7.0's 22 fixes came from project reviews and issues). When unplanned work exceeds the buffer, defer planned items rather than slipping the release date. |

## Branching rules

The repository uses a single-trunk model: features and fixes merge into `main` via PR (with source branches deleted automatically on merge) and releases are tagged directly on `main` to trigger the [release workflow](./.github/workflows/release.yml) (see the [development guide](./docs/en/guide/development.md#release-runbook) for the full runbook). Only create a temporary `release/0.x` branch from a tag when patching an already-released minor while `main` carries unpublished breaking changes; land the fix on `main` first, then cherry-pick it over.

## Now: v0.8.0 (target 2026-12-24, theme: reduce save blocking and establish evaluation baselines)

Planned breaking changes: none. If a breaking change becomes necessary, add it here before merging.

> Prerequisite engineering work (single-trunk `main` migration, automatic branch deletion on merge, release-workflow deduplication, `pnpm release:bump`, and the bilingual release runbook) is already merged on `main`.

### 1. Measure and reduce save blocking

- Current state: When the UAM round trip differs from the original project in unmodeled ways, `uamFidelity` becomes `unsupported` and the entire session refuses to save ([`persistence-service.ts`](./packages/backend/src/services/persistence-service.ts)). Real projects hit this blocker once each in v0.6.2 and v0.6.3 ([#149](https://github.com/OpenFairyGUI/OpenFairyGUI/issues/149), [#152](https://github.com/OpenFairyGUI/OpenFairyGUI/issues/152)); both were fixed ad hoc without corpus-wide measurement, and current failure diagnostics do not report the specific differences.
- Approach: Open sessions in bulk across the fixture corpus fetched by `pnpm refs:sync`, measure the `full` share, rank differences by frequency, add formal property models one by one, and expose observable diff details when fidelity checks fail. Along the way, audit remaining internal `extras` usages in `core` and `functions` (such as sprite maps, `_fontSpriteAlias`, `_fileName`, and `_restoreAsLooseImage`) to decide which belong on formal protocol fields.
- Work in progress: Commit `d4abd3d` on local WIP branch `wip/roadmap-0.7-snapshot` (editor hints, fixture fidelity tests, save semantics) has multiple conflicts with `main`, and component `fileName` hints already landed in v0.6.2. Cherry-pick only the still-valuable tests and changes rather than rebasing the whole branch.
- Acceptance: A repeatable measurement script outputs the difference inventory, and the v0.8.0 changelog reports the `full` share.

### 2. Establish real-model evaluation baselines

- Current state: Both Codex and Claude runners have been available since v0.7.0, but `reference` runs are not model scores (see the [evaluation guide](./docs/en/guide/agent-evaluations.md)), and there is still no per-release record of real-model runs for comparison.
- Approach: Run the full task suite once with each runner on the v0.8.0 release candidate and record the summaries; repeat before every subsequent minor release and compare results.
- Acceptance: One complete run recorded for each of the two clients, with raw evidence and attribution (product / host / client) for every failure.

### 3. Filter display nodes by property within a component (time permitting)

- Current state: Current MCP tools have no in-component filter, so same-name nodes require calling `queryEntity` one by one to distinguish them (exactly the `edit-display-node` evaluation scenario).
- Approach: Design a budgeted query that filters nodes inside a specified component by modeled properties such as kind, name, and text, returning candidates along with their key properties.
- Acceptance: Fewer tool calls on `edit-display-node`-style tasks, while commits still require exact IDs. Defer to the next release if incomplete by the cutoff.

## Later: unscheduled

| Item | Current state and scheduling criteria |
|---|---|
| Broaden code generation | [`codegen-settings.ts`](./packages/functions/src/codegen-settings.ts) supports only LayaBox, Cocos Creator, and Unity with an empty `codeType`. Prioritize by real downstream project-type demand. |
| Visual verification | Agents cannot see the visual result of layout edits, so verification stops at the data layer (related feedback: [#1](https://github.com/OpenFairyGUI/OpenFairyGUI/issues/1)). Start with a feasibility assessment; no delivery commitment. |
| Evaluation coverage | Image editing, complex components, and browser interactions are not yet covered. Add 1–2 tasks per minor release alongside new capabilities. |
| 1.0 stable surface | The Backend contract is at 3.0.0 and every minor from v0.4 to v0.7 introduced breaking changes. When planning 1.0, define frozen versus experimental API boundaries and leave a migration window for hosts. |

## Maintaining this file

- Update in the same round as the changelog on every release: remove shipped items and promote the next release's scope from Later.
- Link existing issues where applicable; do not create duplicate tracking issues or milestones solely for this file—release scope lives here.
- New items must specify current state, approach, and acceptance criteria; mark under-evidenced details as unverified rather than presenting them as shipped behavior.
- Keep `ROADMAP.md` and `ROADMAP_EN.md` in sync with matching items and numbering.
