# OpenFairyGUI

<p align="center"><img src="./docs/public/logo.svg" alt="OpenFairyGUI logo" width="160"></p>

[![Documentation](https://img.shields.io/badge/docs-online-0f766e.svg)](https://fairygui.dev/en/)
[![npm](https://img.shields.io/badge/npm-%40openfairygui%2Fmcp-cb3837.svg)](https://www.npmjs.com/package/@openfairygui/mcp)
[![License](https://img.shields.io/badge/license-MIT-007ec6.svg)](./LICENSE)

[中文](./README.md) · [Agent Setup Guide](./docs/en/guide/getting-started.md) · [Documentation](https://fairygui.dev/en/) · [API Reference](https://fairygui.dev/api/) · [Changelog](./CHANGELOG.md)

> **A FairyGUI project toolchain for AI agents and automation workflows.**
> Read, edit, validate, and publish projects through MCP, the CLI, and TypeScript SDKs without starting the desktop editor.

> **Relationship to FairyGUI:** OpenFairyGUI is an unofficial open-source project built around the FairyGUI project format and toolchain, not an official FairyGUI product. The FairyGUI name, logo, and related brand assets belong to their respective owners. For official products and information, visit the [FairyGUI website](https://fairygui.com/).

Let an agent update a specific component's text, position, or controller settings. Use scripts to inspect projects and publish runtime assets, or add stateful project sessions to your own editor.

| What do you want to do? | Start here |
|---|---|
| Let an agent query and edit projects | [Agent setup guide](./docs/en/guide/getting-started.md): installation, MCP configuration, and your first edit |
| Run batch checks, CI publishing, or limited recovery | [CLI usage](./docs/en/guide/getting-started.md#terminal-workflows): independent installation, checks, and publishing |
| Build an editor or custom host | [TypeScript SDKs](./docs/en/guide/getting-started.md#typescript-sdks): installation, UAM editing, and host examples |

## An example agent task

> Configure the authorized project's reward panel with Locked, Claimable, and Claimed states. Use a controller and gears to coordinate button text, interaction, and the claimed indicator, preserving everything else. Query and preview the whole batch before applying, validating, saving, and rereading. Stop and report ambiguous targets, revision conflicts, or incomplete validation.

The [setup guide](./docs/en/guide/getting-started.md#complete-your-first-edit) provides an unedited project and a three-state acceptance table. The [reward panel](./docs/en/guide/examples.md#three-state-reward-panel), [layout and entrance animation](./docs/en/guide/examples.md#reward-panel-layout-and-entrance-animation), and [card generation](./docs/en/guide/examples.md#generate-reward-cards-from-a-template) examples run in SDK and real MCP consumer checks.

## Built for agent workflows

- **Discover contracts before calling**: operation schemas, method inputs/outputs, and diagnostics come from canonical types and installed documentation shared by the CLI and MCP.
- **Base edits on current state**: queries return actual properties and revisions, previews expose change impact, and apply/save check revisions independently. Conflicts require refreshing and replanning.
- **Report failures faithfully**: missing source bytes, unsupported faithful writeback, rejected paths, and incomplete validation produce explicit results so the host can preserve the session and address the cause.
- **Consume unsaved state**: `readSessionState` and `readResourceBytes` return bounded, detached model and primary resource-byte copies with edit-revision checks. Reading does not save or hydrate files from disk.

Full state reads are available from `0.5.0-alpha.1`. See the [setup guide](./docs/en/guide/getting-started.md#install-and-check-versions) for stable and prerelease installation. Use the installed documentation to discover supported capabilities and the [contract guide](./docs/en/guide/contracts.md) for response and version boundaries.

[Task evaluations](./docs/en/guide/agent-evaluations.md) check real edits, conflict handling, and safe stopping. CI runs the reference host and oracles; real model evaluations run separately, and deterministic checks are not model success rates.

## Packages

| Package | Purpose |
|---|---|
| [`@openfairygui/mcp`](https://www.npmjs.com/package/@openfairygui/mcp) | MCP tools, resources, and prompts |
| [`@openfairygui/cli`](https://www.npmjs.com/package/@openfairygui/cli) | Inspection, validation, publish, recovery, and offline documentation commands |
| [`@openfairygui/backend`](https://www.npmjs.com/package/@openfairygui/backend) | Sessions, revisions, queries, previews, transaction submission, and saving |
| [`@openfairygui/core`](https://www.npmjs.com/package/@openfairygui/core) | UAM, project I/O, and binary protocols |
| [`@openfairygui/functions`](https://www.npmjs.com/package/@openfairygui/functions) | Inspection, validation, publish, and recovery workflows |

MCP provides Backend session editing. Publishing saved projects and limited recovery of trusted local artifacts run through CLI / Node workflows. See [Packages and Tools](./docs/en/guide/packages.md) for SDK entrypoints and host boundaries, and the [runnable examples](./docs/en/guide/examples.md) for publishing and recovery scope.

## Recommended Project

### FairyGUI Editor Online

[FairyGUI Editor Online](https://editor.fairygui.dev/) is a browser-based FairyGUI project editor built on OpenFairyGUI. It imports projects from local folders or ZIP files and supports editing, saving, publishing, and previewing directly in the browser.

[Try it online](https://editor.fairygui.dev/) · [GitHub repository](https://github.com/OpenFairyGUI/FairyGUI-Editor-Online)

## Go further

| Direction | Documentation |
|---|---|
| Setup and examples | [Agent Setup Guide](./docs/en/guide/getting-started.md) · [Packages and Tools](./docs/en/guide/packages.md) · [Runnable Examples](./docs/en/guide/examples.md) |
| Agent contracts and diagnosis | [Installed Documentation](./docs/en/guide/installed-docs.md) · [Contract Discovery](./docs/en/guide/contracts.md) · [Diagnostics and Recovery](./docs/en/guide/diagnostics.md) · [Task Evaluations](./docs/en/guide/agent-evaluations.md) |
| Architecture and protocols | [Architecture Overview](./docs/en/architecture-overview.md) · [Complete Documentation Index](./docs/en/README.md) · [API Reference](https://fairygui.dev/api/) |
| Contributing | [Development and Verification](./docs/en/guide/development.md) · [Development Task Recipes](./docs/en/guide/task-recipes.md) |

## Status and boundaries

The 0.x APIs may evolve; see the [Changelog](./CHANGELOG.md) for stable releases and prereleases. Node.js hosts require 22+; browser hosts use runtime-neutral or explicit `/web` entrypoints and inject host capabilities. Saving is rejected when faithful writeback is unsupported. A successful preview or state read does not guarantee later writes, publishing, or rendering.

## Local development

Prepare Git, the Node version recommended in `.node-version`, and pnpm from `package.json`, then run from the repository root:

```bash
pnpm repo:setup
pnpm check:ci
```

## License

[MIT](./LICENSE)
