# OpenFairyGUI Roadmap

[中文](./ROADMAP.md)

> **Status: proposal, not a release commitment.** This document reflects the repository state at v0.8.0 (2026-11-27) on the `main` trunk. Shipped capabilities are defined by the [Changelog](./CHANGELOG.md) and the [documentation](./docs/en/README.md); `docs/` describes only the current implementation, and plans are recorded only in this file.

## Versioning and release rules

| Type | Rule |
|---|---|
| patch (0.8.x) | Bug fixes, security updates, and dependency range fixes only. No new features and no public API or contract changes. Released as needed. |
| minor (0.x.0) | One theme per release, listed under its entry in this file. Breaking changes land only in minor releases and must be recorded under that release's "Planned breaking changes" before merging. |
| Cadence | One minor release every 4 weeks. Ship what has merged by the cutoff and defer unfinished work to the next train; never merge half-finished work to hit a date, and never slip a release to wait for one item. |
| Prereleases | Off by default. Publish `-rc.N` (npm `next` dist-tag, GitHub prerelease) only when external consumers need early verification of breaking changes. After a stable release, the release workflow automatically advances the npm `next` dist-tag to that release if `next` is older. |
| Unplanned work | Reserve roughly 30% of each cycle for unplanned fixes (most of v0.7.0's 22 fixes came from project reviews and issues). When unplanned work exceeds the buffer, defer planned items rather than slipping the release date. |

## Branching rules

The repository uses a single-trunk model: features and fixes merge into `main` via PR (with source branches deleted automatically on merge) and releases are tagged directly on `main` to trigger the [release workflow](./.github/workflows/release.yml) (see the [development guide](./docs/en/guide/development.md#release-runbook) for the full runbook). Only create a temporary `release/0.x` branch from a tag when patching an already-released minor while `main` carries unpublished breaking changes; land the fix on `main` first, then cherry-pick it over.

## Now: v0.9.0 (target 2026-12-25, theme: complete evaluation baselines and expand verification capabilities)

Planned breaking changes: none. If a breaking change becomes necessary, add it here before merging.

### 1. Complete dual-client real-model evaluation baselines and expand task coverage

- Current state: On the v0.8.0 candidate, Codex completed a full 11/11 real-model baseline run, while the Claude runner under `--bare` isolation does not read local subscription OAuth credentials (requiring dedicated API/provider credentials; see the [evaluation guide](./docs/en/guide/agent-evaluations.md)) and therefore does not yet have a scored baseline; meanwhile, the evaluation suite does not yet cover image editing, complex components, or browser interactions.
- Approach: Run the full Claude task suite in an isolated environment with valid API/provider credentials and archive a comparable baseline summary alongside Codex; add 1–2 real-consumer evaluation tasks exercising new v0.8.0 capabilities such as display-node filtering and `disableTrim` (prioritizing image/resource property edits or complex component changes).
- Acceptance: One complete, version-comparable run recorded for each of Codex and Claude (with raw evidence and product / host / client attribution for any failure); new tasks gate in the `reference` runner and run in real-model baselines.

### 2. Visual verification feasibility assessment

- Current state: Agents cannot see the rendered result of layout or styling edits, so verification stops at the XML/UAM/binary data layer (related feedback: [#1](https://github.com/OpenFairyGUI/OpenFairyGUI/issues/1)).
- Approach: Evaluate the smallest viable read-only component preview/screenshot approach—checking runtime rendering boundaries, browser/headless host dependencies, compatibility with `browser-safe` entrypoints, and MCP response budgets—to produce a clear architecture and prototype conclusion without committing to shipping a full renderer in this release.
- Acceptance: A documented feasibility conclusion covering dependency constraints, rendering fidelity boundaries, and minimal prototype findings that decides whether to add a dedicated preview tool or keep visual rendering in external hosts.

### 3. Broaden code generation coverage (time permitting)

- Current state: [`codegen-settings.ts`](./packages/functions/src/codegen-settings.ts) currently supports only LayaBox, Cocos Creator, and Unity with an empty `codeType`.
- Approach: Prioritize the next target based on downstream project demand and verifiable pinned-version fixtures, then add code generation, cleanup semantics, and bilingual documentation.
- Acceptance: The new target is backed by pinned fixture evidence and idempotent cleanup regression tests; defer to the next release if incomplete or lacking fixture evidence by the cutoff.

## Later: unscheduled

| Item | Current state and scheduling criteria |
|---|---|
| Visual verification implementation | Depends on the v0.9.0 feasibility assessment ([#1](https://github.com/OpenFairyGUI/OpenFairyGUI/issues/1)); schedule only after host boundaries and rendering fidelity costs are established. |
| Browser interaction and complex component evals | Expand into OPFS browser interaction and multi-package complex component evaluation tasks after baseline coverage grows. |
| 1.0 stable surface | The Backend contract has stayed at 3.0.0 since v0.7.0 (with v0.8.0 as the first non-breaking minor). When planning 1.0, define frozen versus experimental API boundaries and leave a migration window for hosts. |

## Maintaining this file

- Update in the same round as the changelog on every release: remove shipped items and promote the next release's scope from Later.
- Link existing issues where applicable; do not create duplicate tracking issues or milestones solely for this file—release scope lives here.
- New items must specify current state, approach, and acceptance criteria; mark under-evidenced details as unverified rather than presenting them as shipped behavior.
- Keep `ROADMAP.md` and `ROADMAP_EN.md` in sync with matching items and numbering.
