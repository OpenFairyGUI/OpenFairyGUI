# @openfairygui/mcp

MCP server adapter for OpenFairyGUI backend runtime services.

## Purpose

`@openfairygui/mcp` is a thin Model Context Protocol adapter over `@openfairygui/backend`.

It maps the backend P2 runtime surface into MCP tools:

- `getCapabilities`
- `openSession`
- `getSession`
- `applyTransaction`
- `saveSession`
- `closeSession`
- `getEvents`
- `getJob`
- `listJobs`
- `cancelJob`
- `getCacheSnapshot`
- `refreshCache`

Each tool exposes a shared output schema for `structuredContent.backendResult`, preserving the backend envelope shape:

- `ok`
- `data?`
- `error?`
- `meta?`

P1 also registers MCP-native ergonomics around the same backend surface:

- read-only resources for identity snapshots:
  - `openfairygui://backend/capabilities`
  - `openfairygui://backend/session/{sessionId}`
  - `openfairygui://backend/cache/{sessionId}`
  - `openfairygui://backend/job/{sessionId}/{jobId}`
- prompts for capability inspection, session open/inspect, revision-checked transactions, save, and runtime polling

Resources return `application/json` text containing the unchanged backend result envelope. Parameterized polling remains tool-based: `getEvents` and `listJobs` are not exposed as resource URI query grammars.

It does **not** redefine transaction selectors, transaction operations, path policy, session semantics, job semantics, cache semantics, or backend error envelopes. Those remain owned by `@openfairygui/backend`, `@openfairygui/functions`, and `@openfairygui/core`.

It also does **not** activate artifact publish/restore jobs, subscriptions, persistent jobs, or cache-as-source-of-truth behavior. MCP roots may be useful client context, but this package does not enforce roots or duplicate backend path canonicalization; backend path policy remains authoritative.

## Usage

```ts
import { createOpenFairyGuiMcpServer } from '@openfairygui/mcp';

const server = createOpenFairyGuiMcpServer();
```

For stdio clients, use the package binary:

```bash
ofgui-mcp
```

Example local MCP client configuration:

```json
{
  "mcpServers": {
    "openfairygui": {
      "command": "ofgui-mcp"
    }
  }
}
```

When running from a workspace checkout before publishing, point the command at the package binary after building:

```json
{
  "mcpServers": {
    "openfairygui": {
      "command": "node",
      "args": ["./packages/mcp/bin/ofgui-mcp.cjs"]
    }
  }
}
```
