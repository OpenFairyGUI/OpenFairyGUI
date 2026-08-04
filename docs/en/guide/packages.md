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

<a href="/api/" target="_self">Open the generated API Reference</a>.
