# OpenFairyGUI Documentation

This directory contains the English documentation used by the static website. It describes only the current implementation and does not preserve obsolete compatibility layers, temporary migrations, or unimplemented plans.

## Documentation index

| Document | Description |
|---|---|
| [Changelog](https://github.com/OpenFairyGUI/OpenFairyGUI/blob/main/CHANGELOG.md) | Public features, fixes, breaking changes, and maintenance work by release. |
| [Architecture Overview](./architecture-overview.md) | Package responsibilities, UAM and backend boundaries, host adapters, and primary data flows. |
| [Editor Publish Settings](./editor-publish-settings.md) | Actual editor setting files, properties, defaults, output resolution, and current publish behavior. |
| [Publish Plugins](./publish-plugins.md) | Plugin directories, manifests, lifecycle hooks, fallback behavior, and the boundary with FairyGUI Editor plugins. |
| [Published Project Recovery Limits](./published-project-restore-limitations.md) | Supported recovery scope, safety constraints, and information that cannot be reconstructed reliably from published artifacts. |
| [Project XML Attribute Protocol](./project-xml-attribute-reference.md) | Canonical Project XML attributes, aliases, and node-level semantics. |
| [Project XML DisplayList Tag Alignment](./project-xml-displaylist-variants.md) | Alignment among raw XML tags, protocol variants, and editor `DisplayListItem.type` values. |
| [FairyGUI Binary Package Format](./fairygui-binary-package-format.md) | V7 package blocks, component decoding, child records, and runtime-phase mapping. |
| [Getting Started](./guide/getting-started.md) | Install the SDK and read your first FairyGUI project. |
| [Packages and Tools](./guide/packages.md) | Choose the right package and runtime entrypoint. |
| [Website Home](./index.md) | Entry points for guides, translated references, and the API. |

## Conventions

| Item | Policy |
|---|---|
| Audience | Repository maintainers, implementers, protocol contributors, and publishing-tool authors. |
| Source of truth | Documentation follows the current repository implementation; synchronization requirements are defined in `AGENTS.md`. |
| Root READMEs | `README.md` and `README_EN.md` provide navigation rather than protocol specifications. |
| Website build | Use `pnpm docs:dev` for local development. `pnpm docs:build` generates the public API reference and static site. |
