# Packages and Tools

| Package | Purpose |
|---|---|
| `@openfairygui/core` | Property graph, document model, project I/O, and binary I/O. |
| `@openfairygui/functions` | Inspection, transforms, publishing, recovery, and other high-level workflows. |
| `@openfairygui/backend` | Stateful project sessions, storage adapters, and runtime services. |
| `@openfairygui/mcp` | Thin adapter exposing backend runtime capabilities as MCP tools, resources, and prompts. |
| `@openfairygui/cli` | Command-line entrypoint for scripts and terminal workflows. |

## Choose an entrypoint

- Agent integration: install `mcp` and discover bundled documentation and tools to query, preview, and edit projects. The `cli` provides the same documentation and independent terminal workflows. See [Getting Started](./getting-started.md) for setup.
- Scripts and CI: use `cli` for inspection, validation, publishing, and limited recovery of trusted local artifacts. Library-based Node workflows use `core` and `functions`.
- Editors and custom hosts: use `backend` for sessions, revisions, and saving, and edit through UAM transactions. `core` provides the lower-level model and I/O.

MCP adapts Backend session capabilities; publishing and recovery use explicitly authorized CLI / Node workflows. Keep installed OpenFairyGUI packages on the same version and channel.

## Public entrypoints

| Entrypoint | Boundary |
|---|---|
| `@openfairygui/core` | Runtime-neutral property model, `Document`, UAM, binary protocol, and project I/O with an injected filesystem. |
| `@openfairygui/core/uam` | Focused UAM models, normalization, validation, transactions, and lift/materialize APIs. |
| `@openfairygui/core/project-io` | Project I/O through a caller-provided `FileSystem`, without binding to Node.js or a browser host. |
| `@openfairygui/core/node` | Node.js filesystem entrypoint exposing `NodeIO`. |
| `@openfairygui/core/web` | Browser project I/O through `WebIO` and the File System Access API adapter. |
| `@openfairygui/core/image-validation-worker` | Standalone bundler entry for the browser image-validation Worker, not a regular application module; package metadata preserves its message-listener initialization side effect. |
| `@openfairygui/functions` | Runtime-neutral inspection, validation, transforms, publish kernel, code generation, and limited recovery workflows. |
| `@openfairygui/functions/uam` | Application-oriented structured results for UAM transaction failures. |
| `@openfairygui/functions/node` | Node adapters `publishNode()` and `restoreNode()`; Node publish plugins are loaded only here. |
| `@openfairygui/functions/web` | Browser adapter `publishBrowser()`; it does not load Node plugins. |
| `@openfairygui/backend` | Host-injected backend runtime, sessions, storage, and capability contracts. |
| `@openfairygui/backend/node` | Default Node filesystem, lock, and backend runtime adapters. |
| `@openfairygui/backend/docs` | Independent browser-safe installed documentation, operation/method schemas and diagnostics shared by CLI/MCP; see [installed docs](./installed-docs.md). |
| `@openfairygui/mcp` | MCP server, tools, resources, and prompts adapter for the backend runtime. |
| `@openfairygui/mcp/stdio` | Local MCP stdio transport entrypoint. |
| `@openfairygui/cli` | The `ofgui` command-line program; it has no library subpath entrypoints. |

Browser code should use runtime-neutral entrypoints or an explicit `/web` entrypoint. Do not import Node.js capabilities through `/node`, `/stdio`, or the CLI.

<a href="/api/" target="_self">Open the generated API Reference</a>.
