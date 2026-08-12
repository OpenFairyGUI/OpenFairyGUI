# Publish Plugins

This document defines the publish plugin contract currently supported by the OpenFairyGUI Node.js publishing pipeline. These plugins apply only to OpenFairyGUI automation and are not FairyGUI Editor plugins.

## Host boundary

Only the Node.js adapter, `publishNode()` from `@openfairygui/functions/node`, automatically discovers and loads publish plugins from a project's `plugins/` directory.

- The low-level `publish()` kernel does not access the Node.js filesystem. It runs only the hooks supplied through `PublishOptions.plugins`.
- `publishBrowser()` does not inject plugins, so browser-safe publishing never loads Node.js plugins.
- `genCode` remains a general post-publish capability. The Node.js adapter enables it by default, while the browser adapter disables it by default.

## Plugin directory

By default, `publishNode()` loads publish plugins from the `plugins/` directory at the project root:

```text
MyProject/
  MyProject.fairy
  assets/
  plugins/
    my-openfairygui-plugin/
      package.json
      index.mjs
```

After reading a project, `publishNode()` first looks for this directory relative to the project root stored by the document. If the document has no project root but `assetsPath` identifies one, that location is used. If neither location is available, no plugins are loaded and publishing continues.

## Manifest

Each OpenFairyGUI publish plugin must live in its own subdirectory and provide a `package.json` manifest:

```json
{
  "name": "my-openfairygui-plugin",
  "main": "index.mjs",
  "required": true
}
```

Current rules:

| Field | Rule |
|---|---|
| `name` | Required; used for logging and plugin identity. |
| `main` | Required; must resolve inside the plugin's own directory. |
| `required` | Optional; when `true`, overrides `failureMode` and aborts publishing on load or execution failure. |
| `failureMode` | Optional, `abort` (default) or `warn`; use `warn` only for an optional plugin that may fail without invalidating the publish. |

A non-OpenFairyGUI plugin directory without `main` is skipped, allowing FairyGUI Editor plugins to coexist. Once `main` is declared, an escaping entrypoint or load/execution failure aborts publishing by default. Only `failureMode: "warn"` records a warning and continues.

## Plugin API

A plugin may use a default object export:

```js
export default {
  async genCode(doc, settings, options) {
    // custom code generation
  },
};
```

It may also use a named export:

```js
export async function genCode(doc, settings, options) {
  // custom code generation
}
```

Supported hooks:

| Hook | Signature | Description |
|---|---|---|
| `onPublishStart` | `(doc, options)` | Runs before the main publish pipeline starts. |
| `genCode` | `(doc, settings, options)` | Runs during code generation. |
| `onPublishEnd` | `(doc, options)` | Runs before the main publish pipeline ends. |

`genCode` arguments:

| Argument | Description |
|---|---|
| `doc` | The current `Document`. |
| `settings` | Resolved code-generation settings with defaults applied. |
| `options` | Code-generation context supplied for this publish, including `fs`, `packages`, `basePath`, and `plugins`. |

## Lifecycle and fallback behavior

Current execution order:

```text
onPublishStart -> built-in publish preflight -> atlas / binary publish -> genCode -> onPublishEnd
```

`onPublishStart` receives the host's writable filesystem and runs before the built-in OpenFairyGUI publish preflight so that changes it makes to the `Document` participate in the current publish. Files or other external side effects produced by this hook are outside the built-in zero-output guarantee and are not rolled back when later preflight or publishing fails. A plugin that requires zero side effects on failure must defer writes or provide its own temporary-directory and commit step.

Code-generation behavior:

| Scenario | Behavior |
|---|---|
| No plugin provides `genCode` | Use the built-in OpenFairyGUI code generator. |
| At least one `genCode` plugin succeeds | Treat code generation as plugin-owned and skip the built-in generator. |
| A `genCode` plugin fails | Abort publishing by default; with `failureMode: "warn"`, record a warning and continue. |
| Every `failureMode: "warn"` `genCode` plugin fails | Fall back to the built-in generator. |
| A publish hook fails | Abort publishing by default; with `failureMode: "warn"`, record a warning and continue. |

## Relationship to FairyGUI Editor plugins

OpenFairyGUI publish plugins and FairyGUI Editor plugins use different protocols and are not directly interchangeable.

Both plugin types may coexist in the same `plugins/` directory:

- OpenFairyGUI loads only plugins matching the manifest and API contract in this document.
- FairyGUI Editor loads plugins according to its own plugin rules.
- Directories that do not match the OpenFairyGUI publish plugin contract are skipped and must not affect automated publishing.

When one feature must support both FairyGUI Editor and OpenFairyGUI automation, provide separate plugin entrypoints or adapters. They may share internal business logic, but each plugin entrypoint, lifecycle, and API contract must be implemented independently.

## Current limitations

- Plugin loading requires Node.js.
- Plugins are not part of browser-safe authoring sessions.
- The plugin API follows the current implementation and does not promise compatibility with the FairyGUI Editor plugin API.
