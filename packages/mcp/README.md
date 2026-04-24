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

It does **not** redefine transaction selectors, transaction operations, path policy, session semantics, job semantics, cache semantics, or backend error envelopes. Those remain owned by `@openfairygui/backend`, `@openfairygui/functions`, and `@openfairygui/core`.

It also does **not** activate artifact publish/restore jobs.

## Usage

```ts
import { createOpenFairyGuiMcpServer } from '@openfairygui/mcp';

const server = createOpenFairyGuiMcpServer();
```

For stdio clients, use the package binary:

```bash
ofgui-mcp
```
