# Changelog

[中文](./CHANGELOG_CN.md)

## Unreleased

Release comparisons:

- Stable line (`main`): [v0.3.1...main](https://github.com/OpenFairyGUI/OpenFairyGUI/compare/v0.3.1...main)
- Development line (`next`): [v0.3.1...next](https://github.com/OpenFairyGUI/OpenFairyGUI/compare/v0.3.1...next)

## v0.3.x

### v0.3.1 ([Release](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.3.1))

Fixes:

- core: Tighten binary and XML trust boundaries with decompression budgets, numeric range validation, and safe XML escaping, and encode bitmap-font glyph IDs using the unsigned 16-bit runtime contract.
- backend,mcp: Add allowed project roots with real-path containment, stale-lock recovery, unique session IDs, atomic project saves, bounded MCP inputs, and stable error envelopes that do not leak internals.
- functions: Centralize structured SVG safety validation, abort declared-plugin failures by default, and publish explicit Node output directories through rollback-safe directory swaps.

Other:

- workspace: Require Node.js 20 or newer, expand CI to Node 20/22/24, make cleanup cross-platform, broaden lint coverage, and document public API stability and publish-transaction limits.

Prerelease builds from `v0.3.0-alpha.1` through `v0.3.0-alpha.4` are consolidated into the stable release below. `v0.3.0` also contains every stable fix through `v0.2.6`.

### v0.3.0 ([Release](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.3.0))

Features:

- functions,cli: Add project validation with `valid`, `invalid`, and `incomplete` results, desktop-compatible geometry checks, diagnostics, and JSON output. [#96](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/96) [#99](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/99) [#101](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/101)
- mcp: Add `openfairygui_backend_get_project_outline` for compact, revision-bound project structure discovery. [#93](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/93)

Fixes:

- core: Preserve cross-package image `packageId` values through UAM lift/materialization and Project XML round trips, and accept the standard SVG namespace while continuing to reject external or scriptable SVG sources. [#124](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/124)

### v0.3.0-alpha.4 ([Release](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.3.0-alpha.4))

Features:

- functions,cli: Reject invalid project values during validation instead of reporting strictly invalid projects as safe to use. [#101](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/101)

### v0.3.0-alpha.3 ([Release](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.3.0-alpha.3))

Features:

- functions,cli: Report project geometry that is incompatible with the FairyGUI desktop editor's signed 32-bit integer range. [#99](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/99)

Fixes:

- core: Truncate integer geometry fields toward zero in Project XML and reject non-finite or out-of-range values. [#98](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/98)

Other:

- docs: Add the project logo, English documentation, and corrected API links. [#94](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/94) [#95](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/95)

### v0.3.0-alpha.2 ([Release](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.3.0-alpha.2))

Features:

- functions,cli: Add project validation with `valid`, `invalid`, and `incomplete` states, diagnostics, and JSON output. [#96](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/96)

### v0.3.0-alpha.1 ([Release](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.3.0-alpha.1))

Features:

- mcp: Add `openfairygui_backend_get_project_outline` for compact, revision-bound project structure discovery without source bytes or full property payloads. [#93](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/93)

## v0.2.x

Prerelease builds from `v0.2.0-alpha.0` through `v0.2.0-alpha.38` are consolidated into the stable release below.

### v0.2.6 ([Release](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.2.6))

Features:

- core: Model SWF resources, controller-page remarks, loader error signs, and component custom-extension IDs as formal Project XML, UAM, and binary properties. [#121](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/121)

Fixes:

- core: Align button down effects, layout-dependent List defaults, Transition frame rates, property overrides, tile-grid metadata, trimmed sprite sizes, and remaining component XML fields with the editor and runtime protocols. [#121](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/121)
- functions: Enforce runtime-supported compression, resource filenames, Layabox atlas rotation, and Cocos Creator runtime imports. [#121](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/121)
- functions: Apply package exclusions, publish-clear projection, package-level atlas settings, selected-state resource closure, and Unity split-alpha output during publishing. [#121](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/121)

Other:

- docs: Complete the bilingual release history, current version status, English integer-geometry protocol, and public package entrypoint guide, and make bilingual Changelog updates a release requirement. [#120](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/120)
- docs: Synchronize the architecture, editor-publish settings, and binary-package protocol documents with the corrected implementation. [#121](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/121)

### v0.2.5 ([Release](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.2.5))

Features:

- core: Model controller `alias`, `autoRadioGroupDepth`, and `exported` as formal properties preserved through Project XML, UAM, and authoring APIs. [#117](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/117)

### v0.2.4 ([Release](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.2.4))

Features:

- core,backend: Add the `setResourceFolderAtlas` transaction for updating a resource folder's source Atlas slot by canonical branch and path. [#115](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/115)

### v0.2.3 ([Release](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.2.3))

Features:

- core: Complete UAM, Project XML, and binary round-trip contracts for Image, MovieClip, List, built-in component instances, and component authoring metadata. [#112](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/112)
- core,backend: Support Tree double-click expansion state transactions and tighten no-op transaction safety. [#113](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/113)

Other:

- docs: Recommend FairyGUI Editor Online as an OpenFairyGUI application and clarify OpenFairyGUI's unofficial relationship to the FairyGUI brand. [#111](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/111)

### v0.2.2 ([Release](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.2.2))

Fixes:

- cli,functions: Make `--project-type layabox` apply a safe Layabox publish profile instead of retaining incompatible Unity extensions and atlas rotation settings. [#103](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/103)

Other:

- docs: Render Mermaid architecture diagrams on the VitePress website. [#100](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/100)

### v0.2.1 ([Release](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.2.1))

Fixes:

- core: Truncate integer geometry fields toward zero in Project XML and reject non-finite or out-of-range values. [#98](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/98)

Other:

- docs: Add the project logo, bilingual Changelogs, English documentation, and corrected API links. [#94](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/94) [#95](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/95)

### v0.2.0 ([Release](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.2.0))

Breaking changes:

- core,functions: Split runtime-neutral, Node.js, and Web APIs into explicit package entrypoints such as `/node`, `/web`, `/uam`, and `/project-io`.

Features:

- core: Add UAM project authoring with atomic package, component, resource, display-object, gear, controller, transition, and resource-folder transactions. [#14](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/14) [#37](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/37) [#45](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/45) [#48](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/48)
- core: Add project settings, package publish settings, and package-local branch lifecycle transactions. [#75](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/75) [#76](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/76) [#77](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/77)
- functions: Add publish plugins and browser publishing with explicit support for persisted publish settings and SVG resources. [#2](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/2) [#4](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/4) [#78](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/78) [#85](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/85)
- backend,mcp: Add stateful project sessions, revisions, save/materialization flows, capability discovery, CLI integration, and an MCP adapter.

Fixes:

- core: Preserve FairyGUI Project XML, component, transition, property override, and binary package semantics during round trips. [#10](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/10) [#11](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/11) [#13](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/13) [#86](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/86)
- core,functions: Hydrate and publish MovieClip JTA metadata, dimensions, smoothing, frames, and texture tables safely. [#19](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/19) [#71](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/71) [#72](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/72) [#73](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/73)
- core: Validate image resource replacement bytes before committing a transaction. [#61](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/61)
- backend: Preserve browser storage fidelity and recover abandoned session locks after refresh. [#88](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/88) [#89](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/89)

Other:

- Publish the documentation website at [fairygui.dev](https://fairygui.dev/) and add project funding metadata. [#42](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/42) [#44](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/44)
- Publish the five public packages as stable `0.2.0` releases with deterministic version metadata and browser-safe package entrypoints. [#91](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/91)

## v0.1.x

### v0.1.1 ([Release](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.1.1))

Features:

- core: Improve published-project recovery with alignment properties, recoverable resource metadata, dotted resource names, and cross-package references.

Other:

- Stabilize the npm release workflow and workspace dependency publishing.

### v0.1.0 ([Tag](https://github.com/OpenFairyGUI/OpenFairyGUI/tree/v0.1.0))

Initial release with FairyGUI project and binary package I/O, document transforms, publishing, published-project recovery, and the `ofgui` CLI.
