# @openfairygui/mcp

MCP server adapter for OpenFairyGUI backend runtime services.

## Purpose

`@openfairygui/mcp` is a thin Model Context Protocol adapter over `@openfairygui/backend`.

It maps the backend runtime surface into MCP tools:

- `getCapabilities`
- `openSession`
- `openProjectSession`
- `getSession`
- `getProjectOutline`
- `queryEntity`
- `readSessionState`
- `readResourceBytes`
- `validateSession`
- `preflightTransaction`
- `applyTransaction`
- `saveSession`
- `materializeSession`
- `closeSession`
- `getEvents`
- `getCacheSnapshot`
- `refreshCache`

Each tool exposes a method-specific output schema for `structuredContent.backendResult`, preserving the backend envelope shape:

- `ok`
- `data?`
- `error?`
- `meta?`

The factory registers the generated Backend catalog. The SDK owns dynamic discovery and dispatch, including Host tools added through `server.registerTool()`. Input/output schemas come from the canonical installed contract; discovery uses self-contained draft-07 `definitions`/`$ref` to reuse repeated structures without loosening the generated operation union, call validators or input budgets. Installed operation documentation remains available through `openfairygui://contracts/operations` and `openfairygui://docs/index`.

The server also registers MCP-native ergonomics around the same backend surface:

- read-only resources for identity snapshots:
  - `openfairygui://backend/capabilities`
  - `openfairygui://backend/session/{sessionId}`
  - `openfairygui://backend/session/{sessionId}/outline`
  - `openfairygui://backend/cache/{sessionId}`
- prompts for capability inspection, session open/inspect, project-outline inspection, revision-checked transactions, save, and runtime polling

Resources return `application/json` text containing the unchanged backend result envelope. Parameterized event polling uses `getEvents`, without a resource URI query grammar.
The project outline is revision-bound and exposes package, resource, folder, display-node, controller-page, and transition identities for transaction planning. It intentionally omits source bytes and full property payloads. `validateSession` returns the backend-owned read-only project validation report; the MCP adapter does not reinterpret its diagnostics.

`readSessionState` returns a detached public UAM model without primary asset bytes, plus the current edit revision and source-read diagnostics. `readResourceBytes` reads one already-loaded primary asset with a required matching revision. Neither reads storage or changes the session. Both tools enforce their native response limits and a separate 16 MiB complete MCP response limit; see the installed method schemas and [workflow](../backend/docs/workflow.md).

It does **not** redefine transaction selectors, transaction operations, path policy, session semantics, cache semantics, or backend error envelopes. Those remain owned by `@openfairygui/backend`, `@openfairygui/functions`, and `@openfairygui/core`.

It also does **not** activate artifact publish/restore execution, subscriptions, or cache-as-source-of-truth behavior. MCP roots may be useful client context, but this package does not enforce roots or duplicate backend path canonicalization; backend path policy remains authoritative.

`refreshCache` returns the refreshed cache snapshot in its response; clients do not poll a background task.

## Usage

```ts
import { createOpenFairyGuiMcpServer } from '@openfairygui/mcp';

const server = createOpenFairyGuiMcpServer();
```

For stdio clients, use the package binary:

```bash
ofgui-mcp
```

### Host composition

Pass `instructions` to the factory to publish Host guidance in the SDK initialize handshake.

Use `toolPolicies` to gate selected tools before Backend executes. Each policy declares a synchronous Zod `failureSchema` and a `beforeCall` callback. The callback receives a detached copy of the validated wire input and may be async. Returning `undefined` invokes the original Backend method once with the original input; returning a declared `ok: false` envelope stops the call and produces matching text/`structuredContent.backendResult` with `isError: true`.

```ts
import { createOpenFairyGuiMcpServer, type OpenFairyGuiMcpToolPolicy } from '@openfairygui/mcp';
import { z } from 'zod';

const policy: OpenFairyGuiMcpToolPolicy = {
  failureSchema: z.strictObject({
    ok: z.literal(false),
    error: z.strictObject({
      code: z.literal('save_approval_required'),
      approvalRequestId: z.string(),
      approvalPath: z.string(),
    }),
  }),
  beforeCall(input) {
    // Host-owned grant store: bind the grant to session, revision, operation and all options.
    if (hostGrants.consume('saveSession', input)) return undefined;
    return { ok: false, error: {
      code: 'save_approval_required',
      approvalRequestId: hostGrants.request('saveSession', input),
      approvalPath: '/#save-approvals',
    } };
  },
};
const server = createOpenFairyGuiMcpServer({ runtime, instructions: 'Host writes require owner approval.', toolPolicies: {
  openfairygui_backend_save_session: policy,
} });
server.registerTool('host_probe', { inputSchema: z.object({}) }, async () => ({
  content: [{ type: 'text', text: 'ok' }],
}));
```

`runtime` and `hostGrants` belong to the embedding Host. Configure `materialize_session` separately when it also requires approval; grants must distinguish the two operations. The policy must consume approval before allowing the call and must not call the Backend write itself. Backend still checks revision, paths and disk state after approval; failures are not retried automatically. Read tools without policies do not require grants.

The selected tool's advertised output includes its declared Host failure branch. `_meta['openfairygui/hostPolicy']` marks that extension; the contract digest and installed documentation describe the unchanged Backend branch. Host failures do not become Backend error codes. Unknown tool-policy names fail server construction. Invalid inputs never reach the policy; throwing policies or invalid policy results stop before Backend and return `backend_unhandled_error`. Backend results always pass their canonical schema, even if a Host schema would accept them. Method response budgets also apply to policy failures. The direct `callOpenFairyGuiBackendTool(runtime, name, input, policy)` entry accepts the same policy as its optional fourth argument.

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

The default handshake explains docs → outline → query → preflight → apply → validate → save → close. `openfairygui_docs_read` exposes installed documentation to tool-only clients. Backend binary output fields use base64 strings in `structuredContent.backendResult`; text content is a short pointer. Inputs retain generated byte-array fields. `createOpenFairyGuiMcpServer({ publish })` explicitly adds `openfairygui_host_publish`; the injected host owns authorization, output confinement and plugin policy. Default stdio does not enable publishing.

<!-- product-facts:start -->
Package: `0.6.1` · Backend contract: `3.0.0` · Capability schema: `15`

Operations: 41 · Backend methods: 17 · CLI commands: 16 · Diagnostic codes: 103
<!-- product-facts:end -->
