# OpenFairyGUI

[![npm core version](https://img.shields.io/npm/v/@openfairygui/core.svg)](https://www.npmjs.com/package/@openfairygui/core)
[![npm cli version](https://img.shields.io/npm/v/@openfairygui/cli.svg)](https://www.npmjs.com/package/@openfairygui/cli)
[![License](https://img.shields.io/badge/license-MIT-007ec6.svg)](./LICENSE)
[![GitHub](https://img.shields.io/badge/github-OpenFairyGUI%2FOpenFairyGUI-24292e.svg)](https://github.com/OpenFairyGUI/OpenFairyGUI)

[中文](./README.md)

*A FairyGUI SDK for Node.js and automation workflows.*

## Introduction

OpenFairyGUI provides programmatic access to FairyGUI projects and publish artifacts. Where the editor focuses on interactive authoring, OpenFairyGUI is intended for scripting, batch processing, generators, build pipelines, and CI/CD workflows.

Current capabilities include:

- Reading and writing FairyGUI project directories
- Reading and writing published binary packages
- Inspecting and transforming the document model in code
- Reconstructing editable FairyGUI projects from publish directories
- Providing a scriptable CLI for automation

## Packages

This repository is organized as a `pnpm workspace` + `Lerna` monorepo with the following packages:

| Package | Purpose |
|---|---|
| `@openfairygui/core` | Property graph, document model, project I/O, and binary I/O primitives |
| `@openfairygui/functions` | Higher-level publish, restore, inspection, and transform workflows |
| `@openfairygui/cli` | Command-line interface |
| `@openfairygui/test-utils` | Shared test helpers and fixtures |

## Scripting API

Install the scripting packages:

```bash
npm install --save @openfairygui/core @openfairygui/functions
```

Typical usage reads a project into a `Document`, then inspects, transforms, publishes, or writes it back:

```ts
import { NodeIO } from '@openfairygui/core';
import { inspect, publish } from '@openfairygui/functions';

const io = new NodeIO();
const doc = await io.readProject('./MyProject/MyProject.fairy');

const report = inspect(doc);
console.log(report.projectType, report.totals.packages);

await doc.transform(publish({
  output: './release',
}));
```

If you want to rebuild a project from published output, use the high-level restore workflow from `functions`:

```ts
import { ProjectType } from '@openfairygui/core';
import { restore } from '@openfairygui/functions';
import fs from 'node:fs/promises';
import path from 'node:path';

await restore({
  inputDir: './release',
  output: './restored-project',
  projectType: ProjectType.Unity,
  fs: {
    async readFile(filePath) { return fs.readFile(filePath, 'utf-8'); },
    async readFileRaw(filePath) {
      const buf = await fs.readFile(filePath);
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    },
    async writeFile(filePath, content) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
    },
    async writeFileRaw(filePath, data) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, data);
    },
    async mkdir(dirPath) { await fs.mkdir(dirPath, { recursive: true }); },
    async readdir(dirPath) { return fs.readdir(dirPath); },
    async exists(filePath) { try { await fs.access(filePath); return true; } catch { return false; } },
    async isFile(filePath) { try { return (await fs.stat(filePath)).isFile(); } catch { return false; } },
    async resolvePath(filePath) { try { return await fs.realpath(filePath); } catch { return path.resolve(filePath); } },
    async rm(targetPath, options) { await fs.rm(targetPath, { recursive: options?.recursive ?? false, force: options?.force ?? false }); },
    join: path.join,
    dirname: path.dirname,
  },
});
```

## Command-line API

Install the CLI:

```bash
npm install --global @openfairygui/cli
```

Show help:

```bash
ofgui --help
```

Common workflows:

```bash
# Inspect a project
ofgui inspect ./MyProject

# Publish a project
ofgui publish ./MyProject --output ./release

# Override project type from the command line
ofgui publish ./MyProject --output ./release --project-type unity

# Restore a project from published output
ofgui restore ./release --output ./restored-project

# Override restored project type
ofgui restore ./release --output ./restored-project --project-type cocoscreator
```

`--project-type` accepts either a name or a numeric id, for example:

| Value | Meaning |
|---|---|
| `unity` / `0` | Unity |
| `cocoscreator` / `cocos` / `3` | Cocos Creator |
| `layabox` / `laya` / `4` | LayaBox |

## Workspace Development

If you are working directly in this repository rather than consuming npm packages:

```bash
pnpm install
pnpm build
pnpm test
pnpm dev:cli --help
```

| Command | Description |
|---|---|
| `pnpm build` | Build all workspace packages |
| `pnpm build:cli-deps` | Build the packages required by the CLI |
| `pnpm build:watch` | Run package builds in watch mode |
| `pnpm test` | Run the AVA test suite |
| `pnpm coverage` | Run tests with coverage reporting |
| `pnpm lint` | Run Biome lint checks |
| `pnpm dev:cli` | Run the CLI in development mode |

## Documentation

Implementation reference documents are currently maintained in Chinese. Start from [docs/README.md](./docs/README.md).

| Document | Description |
|---|---|
| [Architecture Overview](./docs/architecture-overview.md) | Package responsibilities, module boundaries, and core data flow |
| [Editor Publish Settings](./docs/editor-publish-settings.md) | Publish setting sources, defaults, naming rules, and consumption points |
| [Published Restore Limitations](./docs/published-project-restore-limitations.md) | Restore capability boundaries when only publish output is available |
| [Project XML Attribute Protocol](./docs/project-xml-attribute-reference.md) | XML attributes supported for `package.xml`, `component.xml`, and structural nodes |
| [Project XML DisplayList Tag Alignment](./docs/project-xml-displaylist-variants.md) | Alignment of raw `displayList` tags and editor display item types |
| [Binary Package Format](./docs/fairygui-binary-package-format.md) | Current `.fui` / `_fui.bytes` protocol reference |

## Status

The project is under active development. APIs and package contents should be treated as current implementation rather than a long-term compatibility guarantee.

## License

MIT
