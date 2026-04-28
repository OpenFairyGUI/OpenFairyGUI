# @openfairygui/backend

Stateful backend runtime and session services for OpenFairyGUI.

## Purpose

`@openfairygui/backend` is the first stateful runtime layer in the monorepo.

It owns:

- project/session lifecycle
- revisioned request handling
- coordinated but non-atomic save semantics
- browser-safe project sessions
- adapter-backed file sessions and backend-local advisory locking
- capability discovery
- transport-neutral bootstrap

It also provides:

- service stratification (`read` / `authoring` / `artifact` / `runtime`)
- unified response metadata and diagnostics
- capability planes
- centralized path/workspace safety policy
- backend contract versioning surface
- compatibility policy
- polling runtime events with per-runtime monotonic sequence and bounded retention
- `cache.refresh` in-memory jobs with cooperative cancel and terminal retention
- revision-bound derived read-only cache snapshots
- explicit Node bridge boundaries for publish/restore

It does **not** redefine transaction grammar or expose `Document`.
It also does **not** implement MCP or any transport-specific wire protocol.
The root `@openfairygui/backend` entrypoint is browser-safe: file-backed sessions require an injected
`BackendFileSystem`, while the default Node filesystem/runtime lives under `@openfairygui/backend/node`.

## Relationship to other packages

- `@openfairygui/core` owns UAM, I/O, validation, and the transaction kernel
- `@openfairygui/functions` owns the thin stateless app seam and workflow helpers
- `@openfairygui/backend` wraps those layers into a reusable runtime/service boundary

## Example

Browser-safe project session:

```ts
import { BackendRuntime } from '@openfairygui/backend';

const runtime = new BackendRuntime();
const opened = runtime.openProjectSession({ project: uamProject });
if (!opened.ok) throw new Error(opened.error.message);

const applied = await runtime.applyTransaction({
	sessionId: opened.data.sessionId,
	expectedRevision: opened.data.revision,
	operations,
});
```

Node file-backed session:

```ts
import { createNodeBackendRuntime } from '@openfairygui/backend/node';

const runtime = createNodeBackendRuntime();
const opened = await runtime.openSession({ projectPath: './MyProject' });
if (!opened.ok) throw new Error(opened.error.message);

const capabilities = runtime.getCapabilities();
console.log(capabilities.data.runtimeOwner);
console.log(capabilities.data.contractVersion);
console.log(capabilities.data.artifact.publishBridge.executionBoundary);
console.log(capabilities.data.compatibilityPolicy.incompatibleChange);

const refresh = runtime.refreshCache({ sessionId: opened.data.sessionId });
if (refresh.ok) {
	console.log(refresh.data.kind, refresh.data.status);
}

await runtime.closeSession({ sessionId: opened.data.sessionId });
```
