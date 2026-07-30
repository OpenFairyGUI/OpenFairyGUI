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
- Limited recovery from trusted local publish directories for diagnostics or migration assistance
- Providing a scriptable CLI for automation
- Exposing backend runtime capabilities through a thin MCP adapter

## Packages

This repository is organized as a `pnpm workspace` + `Lerna` monorepo with the following packages:

| Package | Purpose |
|---|---|
| `@openfairygui/core` | Property graph, document model, project I/O, and binary I/O primitives |
| `@openfairygui/functions` | Higher-level publish, restore, inspection, and transform workflows |
| `@openfairygui/backend` | Stateful backend runtime, browser-safe project sessions, injectable async storage adapter, save/lock/capability coordination, and events/jobs/cache |
| `@openfairygui/mcp` | Thin MCP server adapter that maps the full backend P2 tool surface and adds client ergonomics through resources, prompts, and output schemas |
| `@openfairygui/cli` | Command-line interface |
| `@openfairygui/test-utils` | Shared test helpers and fixtures |

## Scripting API

Install the scripting packages:

```bash
npm install --save @openfairygui/core @openfairygui/functions
```

Typical usage reads a project into a `Document`, then inspects, transforms, publishes, or writes it back:

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
  output: './release',
  assetsPath: './MyProject/assets',
});
```

`publishNode` fails when it cannot produce a complete runtime artifact: missing Sharp, source images, resource copies, or packing failures do not report success. The lower-level `publish()` API is layout-only only when no output directory is requested; an output request requires filesystem capabilities.

If you want to use the current **UAM authoring seam**, pass a `UamProject` plus an
explicit operation batch into the thin application wrapper exposed by
`@openfairygui/functions`. This `UAM-public / Document-private` path supports resource
rename/move/favorite updates, byte-backed binary resource add/replace/remove, and add/update/remove for
the currently modeled gear kinds; it is still not a general editing backend. Read source
projects with `ProjectReader.read(path, { hydrateResourceBytes: true })` before binary
resource editing. File-backed `BackendRuntime.openSession` performs that hydration
automatically. It also compares the source project with the complete output of a UAM round trip.
If persisted properties are not represented by the current UAM, the session reports
`uamFidelity: 'unsupported'` and `saveSession / materializeSession` fail with
`uam_fidelity_unsupported` without writing. Transactions, saves, and materialization are serialized
per session.

```ts
import {
	type UamProject,
	type UamTransactionOperation,
} from '@openfairygui/core';
import { applyUamTransactionApp } from '@openfairygui/functions';

const project: UamProject = /* project read and lifted with hydrateResourceBytes */;
const operations: UamTransactionOperation[] = [
	{
		kind: 'renameResource',
		selector: { packageId: 'pkg001', resourceId: 'img001' },
		newName: 'renamed.png',
	},
];

const result = applyUamTransactionApp({ project, operations });
if (!result.ok) {
	console.error(result.error.code, result.error.stage, result.error.message);
}
```

> `restore` is a limited recovery tool, not a normal authoring or publishing workflow. Use it only with trusted local publish directories; the output must be a new project directory, and recovery replaces the target only after a complete staged write. It does not establish that third-party artifacts are safe and cannot reproduce the original source project. See the [published recovery boundaries](./docs/published-project-restore-limitations.md).

Node hosts can call `restoreNode()` from `@openfairygui/functions/node`; the official adapter supplies the Node filesystem and Sharp image extraction. Custom hosts can continue to inject their own capabilities into the root `restore()` workflow.

If you need a **stateful backend runtime** with sessions, revisions, coordinated saves,
and advisory locking, use the browser-safe `@openfairygui/backend` root entrypoint or
the Node filesystem bridge exposed by `@openfairygui/backend/node`. This layer is
transport-neutral backend foundation, not `packages/mcp`, and it does not redefine the transaction semantics owned by
`@openfairygui/core`. The backend is stratified into `read / authoring / artifact / runtime`
planes and exposes a unified metadata / diagnostics / version surface for backend responses,
including `requestId / sessionId / revision / durationMs / warnings / diagnostics / stage`.
The runtime plane also provides polling events, `cache.refresh` in-memory jobs,
cooperative cancel, and revision-bound derived read-only cache snapshots. Browser editors can
inject OPFS, IndexedDB, or ZIP-backed virtual filesystems through
`createBackendStorageFileSystem` for `openProjectSession`, clean-session `materializeSession`,
and dirty-session `saveSession` writeback. `publish / restore`
do not execute inside browser-safe authoring sessions; the capability manifest declares their
Node bridge boundary.

```ts
import { BackendRuntime, createBackendStorageFileSystem } from '@openfairygui/backend';

const fileSystem = createBackendStorageFileSystem(browserStorage);
const runtime = new BackendRuntime();
const opened = runtime.openProjectSession({
	project: uamProject,
	storage: { fileSystem, fairyPath: 'Project.fairy' },
});
if (!opened.ok) throw new Error(opened.error.message);

const bootstrapped = await runtime.materializeSession({
	sessionId: opened.data.sessionId,
	expectedRevision: opened.data.revision,
	mode: 'fullProject',
	reason: 'workspace_bootstrap',
});
if (!bootstrapped.ok) throw new Error(bootstrapped.error.message);
```

```ts
import { createNodeBackendRuntime } from '@openfairygui/backend/node';

const runtime = createNodeBackendRuntime();
const opened = await runtime.openSession({ projectPath: './MyProject' });
if (!opened.ok) throw new Error(opened.error.message);

const capabilities = runtime.getCapabilities();
console.log(capabilities.data.runtimeOwner);
console.log(capabilities.data.manifest.browserSafe);

const refresh = runtime.refreshCache({ sessionId: opened.data.sessionId });
if (refresh.ok) {
	const events = runtime.getEvents({ sessionId: opened.data.sessionId });
	console.log(refresh.data.status, events.ok ? events.data.currentSequence : 0);
}

await runtime.closeSession({ sessionId: opened.data.sessionId });
```

If you want to expose the current backend runtime to MCP clients, use `@openfairygui/mcp`.
This package is only a transport adapter; it does not redefine backend or UAM semantics.
In addition to the 14 backend P2 tools, it exposes identity snapshot resources,
workflow guidance prompts, and a shared `structuredContent.backendResult` output schema.
MCP roots are documented as client context only, not as the path-safety boundary.

```ts
import { createOpenFairyGuiMcpServer } from '@openfairygui/mcp';

const server = createOpenFairyGuiMcpServer();
```

stdio clients can use the package binary:

```bash
ofgui-mcp
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

# Use only for trusted local artifact recovery
ofgui restore ./release --output ./restored-project

# Override restored project type
ofgui restore ./release --output ./restored-project --project-type cocoscreator
```

Even with `--force`, `restore` replaces an existing output directory only after the recovery completes.

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

The static documentation site renders the `docs/` content directly. Use `pnpm docs:dev` for a local preview and `pnpm docs:build` to generate the API Reference and site output.

| Document | Description |
|---|---|
| [Architecture Overview](./docs/architecture-overview.md) | Package responsibilities, module boundaries, and core data flow |
| [Editor Publish Settings](./docs/editor-publish-settings.md) | Publish setting sources, defaults, naming rules, and consumption points |
| [Publish Plugins](./docs/publish-plugins.md) | Publish plugin directory, lifecycle, fallback behavior, and relationship with FairyGUI editor plugins |
| [Published Recovery Boundaries](./docs/published-project-restore-limitations.md) | Limited trusted-local recovery scope and non-recoverable content |
| [Project XML Attribute Protocol](./docs/project-xml-attribute-reference.md) | XML attributes supported for `package.xml`, `component.xml`, and structural nodes |
| [Project XML DisplayList Tag Alignment](./docs/project-xml-displaylist-variants.md) | Alignment of raw `displayList` tags and editor display item types |
| [Binary Package Format](./docs/fairygui-binary-package-format.md) | Current `.fui` / `_fui.bytes` protocol reference |

## Status

The project is under active development. APIs and package contents should be treated as current implementation rather than a long-term compatibility guarantee.

## License

MIT
