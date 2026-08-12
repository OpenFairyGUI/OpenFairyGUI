# @openfairygui/backend

Stateful backend runtime and session services for OpenFairyGUI.

## Purpose

`@openfairygui/backend` is the first stateful runtime layer in the monorepo.

It owns:

- project/session lifecycle
- revisioned request handling
- coordinated save semantics, with atomic staged directory swaps on the Node adapter
- browser-safe project sessions
- browser-safe async project storage adapter
- adapter-backed file sessions and backend-local session locking
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
- revision-bound project identity outlines for transaction planning
- revision-bound read-only project validation reports
- explicit Node bridge boundaries for publish/restore

It does **not** redefine transaction grammar or expose `Document`.
It also does **not** implement MCP or any transport-specific wire protocol.
The root `@openfairygui/backend` entrypoint is browser-safe: pure authoring sessions can run in memory,
and browser editors can inject an async storage adapter for OPFS, IndexedDB, ZIP-backed virtual filesystems,
or File System Access API bridges. Storage adapters must implement `unlink()` so resource rename/move/remove
can clean up stale source files. Existing browser projects use a session-lifetime Web Lock: a live peer tab
receives `lock_conflict`, while reload or abrupt document termination releases ownership without leaving a
persistent `.openfairygui.backend.lock` marker. The Node adapter instead keeps a token-protected lock beside
the project directory, recovers only valid same-host stale ownership, and rejects project-directory symbolic
links. When Web Locks are unavailable, the storage adapter must
provide `acquireSessionLock()` with the same atomic cross-context and owner-termination semantics. The default
Node filesystem/runtime lives under `@openfairygui/backend/node` and retains its advisory lock file behavior.
Adapter-backed `openSession` hydrates primary resource bytes so browser-safe transactions can rename/move
assets or add/replace/remove binary resources. `saveSession` writes replacement bytes before it removes
stale source files, preserving the prior file when a write fails.
It also compares the source project with a UAM round trip through `ProjectWriter`; sessions with
unrepresented persisted properties expose `uamFidelity: 'unsupported'`, and write attempts fail with
`uam_fidelity_unsupported`. Existing projects in browser storage must be opened through this path by
injecting `createBackendStorageFileSystem(storage)` into `BackendRuntime`; `openProjectSession` is only
for sessions whose supplied UAM project is authoritative. Transactions, saves, and materialization are
serialized per session.

## Relationship to other packages

- `@openfairygui/core` owns UAM, I/O, validation, and the transaction kernel
- `@openfairygui/functions` owns the thin stateless app seam and workflow helpers
- `@openfairygui/backend` wraps those layers into a reusable runtime/service boundary

## Example

Browser-safe authoritative UAM project session:

```ts
import { BackendRuntime } from '@openfairygui/backend';

const runtime = new BackendRuntime();
const opened = runtime.openProjectSession({ project: uamProject });
if (!opened.ok) throw new Error(opened.error.message);

const outline = runtime.getProjectOutline({ sessionId: opened.data.sessionId });
if (!outline.ok) throw new Error(outline.error.message);

const validation = runtime.validateSession({ sessionId: opened.data.sessionId });
if (!validation.ok) throw new Error(validation.error.message);

const applied = await runtime.applyTransaction({
	sessionId: opened.data.sessionId,
	expectedRevision: opened.data.revision,
	operations,
});
```

Open an existing project from browser async storage with source-fidelity checks:

```ts
import { BackendRuntime, createBackendStorageFileSystem } from '@openfairygui/backend';

const fileSystem = createBackendStorageFileSystem({
	async readFile(filePath) { return storage.readText(filePath); },
	async readFileRaw(filePath) { return storage.readBytes(filePath); },
	async writeFile(filePath, content) { await storage.writeText(filePath, content); },
	async writeFileRaw(filePath, data) { await storage.writeBytes(filePath, data); },
	async mkdir(dirPath) { await storage.mkdir(dirPath); },
	async readdir(dirPath) { return storage.readdir(dirPath); },
	async exists(filePath) { return storage.exists(filePath); },
	async unlink(filePath) { await storage.remove(filePath); },
	async rmdir(dirPath) { await storage.rmdir(dirPath); },
});

const runtime = new BackendRuntime({ fileSystem });
const opened = await runtime.openSession({ projectPath: 'ExistingProject' });
if (!opened.ok) throw new Error(opened.error.message);
```

Materialize an authoritative UAM project into browser async storage:

```ts
const runtime = new BackendRuntime();
const opened = runtime.openProjectSession({
	project: uamProject,
	storage: { fileSystem, fairyPath: 'NewProject/Project.fairy' },
});
if (!opened.ok) throw new Error(opened.error.message);

const bootstrapped = await runtime.materializeSession({
	sessionId: opened.data.sessionId,
	expectedRevision: opened.data.revision,
	mode: 'fullProject',
	reason: 'workspace_bootstrap',
});
if (!bootstrapped.ok) throw new Error(bootstrapped.error.message);

console.log(bootstrapped.data.writtenPaths);
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
