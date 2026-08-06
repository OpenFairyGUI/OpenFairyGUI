# Packages and Tools

| Package | Purpose |
|---|---|
| `@openfairygui/core` | Property graph, document model, project I/O, and binary I/O. |
| `@openfairygui/functions` | Inspection, transforms, publishing, recovery, and other high-level workflows. |
| `@openfairygui/backend` | Stateful project sessions, storage adapters, and runtime services. |
| `@openfairygui/mcp` | Thin adapter exposing backend runtime capabilities as MCP tools, resources, and prompts. |
| `@openfairygui/cli` | Command-line entrypoint for scripts and terminal workflows. |

## Choose an entrypoint

Start with `core` and `functions` when you only need to read, update, or publish projects. Install `@openfairygui/cli` for command-line batch processing. Add `backend` and `mcp` when you need sessions, capability discovery, or MCP client integration.

## Public entrypoints

| Entrypoint | Boundary |
|---|---|
| `@openfairygui/core` | Runtime-neutral property model, `Document`, UAM, binary protocol, and project I/O with an injected filesystem. |
| `@openfairygui/core/uam` | Focused UAM models, normalization, validation, transactions, and lift/materialize APIs. |
| `@openfairygui/core/project-io` | Project I/O through a caller-provided `FileSystem`, without binding to Node.js or a browser host. |
| `@openfairygui/core/node` | Node.js filesystem entrypoint exposing `NodeIO`. |
| `@openfairygui/core/web` | Browser project I/O through `WebIO` and the File System Access API adapter. |
| `@openfairygui/core/image-validation-worker` | Standalone bundler entry for the browser image-validation Worker, not a regular application module. |
| `@openfairygui/functions` | Runtime-neutral inspection, validation, transforms, publish kernel, code generation, and limited recovery workflows. |
| `@openfairygui/functions/uam` | Application-oriented structured results for UAM transaction failures. |
| `@openfairygui/functions/node` | Node adapters `publishNode()` and `restoreNode()`; Node publish plugins are loaded only here. |
| `@openfairygui/functions/web` | Browser adapter `publishBrowser()`; it does not load Node plugins. |
| `@openfairygui/backend` | Host-injected backend runtime, sessions, storage, and capability contracts. |
| `@openfairygui/backend/node` | Default Node filesystem, lock, and backend runtime adapters. |
| `@openfairygui/mcp` | MCP server, tools, resources, and prompts adapter for the backend runtime. |
| `@openfairygui/mcp/stdio` | Local MCP stdio transport entrypoint. |
| `@openfairygui/cli` | The `ofgui` command-line program; it has no library subpath entrypoints. |

Browser code should use runtime-neutral entrypoints or an explicit `/web` entrypoint. Do not import Node.js capabilities through `/node`, `/stdio`, or the CLI.

<a href="/api/" target="_self">Open the generated API Reference</a>.
