# @openfairygui/backend

Stateful backend runtime and session services for OpenFairyGUI.

## Purpose

`@openfairygui/backend` is the first stateful runtime layer in the monorepo.

It owns:

- project/session lifecycle
- revisioned request handling
- coordinated but non-atomic save semantics
- backend-local advisory locking
- capability discovery
- transport-neutral bootstrap

It does **not** redefine transaction grammar or expose `Document`.

## Relationship to other packages

- `@openfairygui/core` owns UAM, I/O, validation, and the transaction kernel
- `@openfairygui/functions` owns the thin stateless app seam and workflow helpers
- `@openfairygui/backend` wraps those layers into a reusable runtime/service boundary

## Example

```ts
import { BackendRuntime } from '@openfairygui/backend';

const runtime = new BackendRuntime();
const opened = await runtime.openSession({ projectPath: './MyProject' });
if (!opened.ok) throw new Error(opened.error.message);

const capabilities = runtime.getCapabilities();
console.log(capabilities.data.runtimeOwner);

await runtime.closeSession({ sessionId: opened.data.sessionId });
```
