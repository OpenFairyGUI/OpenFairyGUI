# OpenFairyGUI

<p align="center"><img src="./docs/public/logo.svg" alt="OpenFairyGUI logo" width="160"></p>

[![Documentation](https://img.shields.io/badge/docs-online-0f766e.svg)](https://fairygui.dev/en/)
[![npm](https://img.shields.io/badge/npm-%40openfairygui%2Fcore-cb3837.svg)](https://www.npmjs.com/package/@openfairygui/core)
[![License](https://img.shields.io/badge/license-MIT-007ec6.svg)](./LICENSE)

[中文](./README.md) · [Documentation](https://fairygui.dev/en/) · [Getting Started](https://fairygui.dev/en/guide/getting-started) · [API Reference](https://fairygui.dev/api/) · [Changelog](./CHANGELOG.md)

> Read, modify, and publish FairyGUI projects with TypeScript for scripts, CI/CD, and agent tooling.

## What is OpenFairyGUI?

OpenFairyGUI is a FairyGUI project SDK for Node.js and automation workflows. It provides composable TypeScript packages for project I/O, document transforms, publishing, and backend sessions, together with CLI and MCP entrypoints.

Use it to:

- Inspect or update FairyGUI projects in batches
- Publish runtime assets from a build pipeline
- Add project capabilities to generators, browser editors, or agents
- Analyze Project XML and FairyGUI binary packages

## Key capabilities

| Capability | Description |
|---|---|
| Project I/O | Read, modify, and write `.fairy` project directories and assets |
| Binary protocol | Read and write `.fui` / `_fui.bytes` publish packages |
| Headless authoring | Apply batch changes through `Document` or UAM transactions |
| Project validation | Check project reads, UAM constraints, references, path collisions, and available source bytes |
| Publish and recovery | Publish runtime assets and perform limited recovery from trusted local artifacts |
| Tool integration | Use the CLI, stateful backend runtime, or MCP adapter |

## Quick start

Install the scripting packages:

```bash
npm install @openfairygui/core @openfairygui/functions
```

Read and publish a project:

```ts
import { NodeIO } from '@openfairygui/core/node';
import { inspect } from '@openfairygui/functions';
import { publishNode } from '@openfairygui/functions/node';

const io = new NodeIO();
const doc = await io.readProject('./MyProject/MyProject.fairy');

const report = inspect(doc);
console.log(report.projectType, report.totals.packages);

await publishNode({
  document: doc,
  assetsPath: './MyProject/assets',
  output: './release',
});
```

See [Getting Started](https://fairygui.dev/en/guide/getting-started) for project writeback, Web entrypoints, and UAM examples.

## Command line

```bash
npm install --global @openfairygui/cli

ofgui inspect ./MyProject
ofgui validate ./MyProject
ofgui publish ./MyProject --output ./release
```

Run `ofgui --help` for all commands and options.

## Packages

| Package | Purpose |
|---|---|
| [`@openfairygui/core`](https://www.npmjs.com/package/@openfairygui/core) | Document model, project I/O, and binary protocol |
| [`@openfairygui/functions`](https://www.npmjs.com/package/@openfairygui/functions) | Inspection, transforms, publish, and recovery workflows |
| [`@openfairygui/backend`](https://www.npmjs.com/package/@openfairygui/backend) | Session, revision, save, and capability runtime |
| [`@openfairygui/cli`](https://www.npmjs.com/package/@openfairygui/cli) | Command-line tools |
| [`@openfairygui/mcp`](https://www.npmjs.com/package/@openfairygui/mcp) | Thin MCP adapter for the backend runtime |

See [Packages and Tools](https://fairygui.dev/en/guide/packages) for package entrypoints and Node / Web boundaries.

## Documentation

- [Getting Started](https://fairygui.dev/en/guide/getting-started)
- [API Reference](https://fairygui.dev/api/)
- [Architecture and Package Boundaries](./docs/en/architecture-overview.md)
- [Project Validation](./docs/project-validation.md)
- [Editor Publish Settings](./docs/en/editor-publish-settings.md)
- [Project XML Attribute Protocol](./docs/en/project-xml-attribute-reference.md)
- [FairyGUI Binary Package Format](./docs/en/fairygui-binary-package-format.md)
- [All Documentation](./docs/en/README.md)

## Status and boundaries

The project is currently in the `0.2.0` alpha series. APIs may still change before the stable release.

- Node.js automation is the primary workflow; browser hosts use explicit `/web` entrypoints and injected capabilities.
- UAM writeback is rejected when the project cannot be preserved faithfully, preventing silent source overwrites.
- `restore` is limited to trusted local publish artifacts and is not a normal authoring workflow.

The [documentation site](https://fairygui.dev/en/) defines the current implementation boundaries.

## Local development

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
```

## License

[MIT](./LICENSE)
