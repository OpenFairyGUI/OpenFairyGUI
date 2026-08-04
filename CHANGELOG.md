# Changelog

[中文](./CHANGELOG_CN.md)

## [Unreleased]

Other:

- docs: Add the new OpenFairyGUI project logo to the website and repository documentation.

## v0.3.x

### v0.3.0-alpha.1 ([Release](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.3.0-alpha.1))

Features:

- mcp: Add `openfairygui_backend_get_project_outline` for compact, revision-bound project structure discovery without source bytes or full property payloads. [#93](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/93)

## v0.2.x

Prerelease builds from `v0.2.0-alpha.0` through `v0.2.0-alpha.38` are consolidated into the stable release below.

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

[Unreleased]: https://github.com/OpenFairyGUI/OpenFairyGUI/compare/v0.2.0...main
