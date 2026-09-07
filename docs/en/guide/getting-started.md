# Getting Started

OpenFairyGUI provides FairyGUI project capabilities for agents, scripts, and editor hosts. Node.js hosts require 22+. Choose the entrypoint for your task:

| Goal | Entrypoint |
|---|---|
| Let an agent query, preview, and edit projects | MCP and installed documentation; start with installation below |
| Inspect or publish from a terminal or CI | [CLI](#terminal-workflows) |
| Add project capabilities to your own tools | [TypeScript SDKs](#typescript-sdks) and [Packages and Tools](./packages.md) |

## Install and check versions

In a directory for your agent tools, install the stable packages and save exact versions:

```bash
npm install --save-exact @openfairygui/cli @openfairygui/mcp
./node_modules/.bin/ofgui --version
./node_modules/.bin/ofgui docs ls --json
```

On macOS / Linux, use the commands above as written. In Windows PowerShell, replace `./node_modules/.bin/ofgui` with `.\node_modules\.bin\ofgui.cmd`. The commands below use this local installation, without relying on global commands.

Compare the CLI version with `result.packageVersion` in the documentation index. The index also provides contract and capability schema versions and content URIs. If versions differ, the host should reconcile the installation before editing.

To try prerelease capabilities, change the two packages to `@openfairygui/cli@next` and `@openfairygui/mcp@next`, still saving exact versions. `readSessionState` / `readResourceBytes` are available from `0.5.0-alpha.1`. Keep packages on the same version and channel, and construct operations from the installed documentation.

## Connect local MCP

Add the following configuration to your MCP client. Replace both absolute paths: the first points to the installed package launcher, and the second is the authorized project directory. Windows paths can use `C:/Work/...`.

```json
{
  "mcpServers": {
    "openfairygui": {
      "command": "node",
      "args": [
        "/absolute/path/to/agent-tools/node_modules/@openfairygui/mcp/bin/ofgui-mcp.cjs"
      ],
      "env": {
        "OPENFAIRYGUI_ALLOWED_PROJECT_ROOTS": "/absolute/path/to/MyProject"
      }
    }
  }
}
```

This is a common JSON client configuration; adapt its format to your client. The client must be able to find `node`; otherwise use Node's absolute path as `command`. The service uses local stdio, with no HTTP port.

Once connected, read `openfairygui://docs/index`, follow its entries to the workflow and method/operation schemas, and discover available tools and capabilities. The terminal equivalents are:

```bash
./node_modules/.bin/ofgui docs cat workflow
./node_modules/.bin/ofgui docs schema setDisplayNodeProps --json
./node_modules/.bin/ofgui docs cat methods/queryEntity --json
./node_modules/.bin/ofgui docs diagnostic stale_write --json
```

These queries read bundled documentation without visiting a website. `ofgui docs cat skill` returns the navigation Skill for the host to read or enable. See [Installed Documentation](./installed-docs.md) for the full format.

## Complete your first edit

If you do not have a project, follow the [runnable examples](./examples.md) to run the inspection example and create an independent temporary project. Use the parent directory of its output `projectPath` (a `.fairy` file) as the MCP authorized directory and in the task below.

The example project contains a text node at `Main/MainView/title`. For your own project, replace the path, package, component, and node names with the actual target:

> In `/absolute/path/to/MyProject`, change the `title` text node in the `Main/MainView` component to "Start game", preserving all other objects and resources. Query the target and preview the change before applying, validating, saving, and rereading it. If the target is ambiguous, a revision conflict occurs, or validation is incomplete, stop and report the issue while preserving unsaved edits.

The workflow uses canonical Backend capabilities. Discover actual MCP tool names and exact parameters from the installed schemas:

1. Read capabilities and open the authorized project session. Find target IDs in the outline, then use `queryEntity` for properties and the actual revision.
2. Call `preflightTransaction` with the current selector, the smallest operation batch, and `expectedRevision`. Inspect its impact; previewing does not commit, save, or reserve a revision.
3. Call `applyTransaction` against the same revision. On `stale_write`, refresh and replan rather than blindly substituting a newer revision.
4. Check the new state with `validateSession`, requiring `status: "valid"` and `complete: true`.
5. Call `saveSession` against the applied revision and require `dirty: false`. After saving succeeds, close the session, reopen the project, and use `queryEntity` to check the target text. Close the reread session when finished.

A host with file access must independently compare results before and after saving to verify that other project semantics and resource bytes are unchanged. Report this as unverified if the comparison was not performed. Current-session queries, `dirty: false`, and successful validation do not replace this comparison. If validation or saving fails, preserve the session and unsaved work so the host can address the cause.

The [runnable examples](./examples.md) create independent temporary projects and execute the same SDK edit/save workflow. The real MCP stdio example demonstrates queries and previews. These examples run in installed-package consumer checks, without introducing a separate transaction grammar.

To consume the complete committed but unsaved model in a supported version, call `readSessionState`, then use its revision with `readResourceBytes` for the primary assets you need. See the [contract guide](./contracts.md) for response budgets, read diagnostics, and `stale_read` recovery.

## Terminal workflows

For terminal or CI use alone, install the CLI independently. If you already have OpenFairyGUI packages, keep their version and channel aligned:

```bash
npm install --save-exact @openfairygui/cli
```

The CLI provides independent read-only checks and JSON reports:

```bash
./node_modules/.bin/ofgui doctor ./MyProject --json
./node_modules/.bin/ofgui inspect ./MyProject --json
./node_modules/.bin/ofgui validate ./MyProject --json
```

To publish the saved project, explicitly choose an output directory:

```bash
./node_modules/.bin/ofgui publish ./MyProject --output ./release --json
```

Publishing and limited recovery of trusted local artifacts run through CLI / Node workflows; MCP provides session editing. Inspect the actual validation report before publishing. See the [publish and recovery examples](./examples.md) for output, plugin, and recovery boundaries.

## TypeScript SDKs

Install the packages your host needs, keeping their version aligned with any existing OpenFairyGUI packages. The command below uses stable releases; if you chose the prerelease channel above, add `@next` to each package here too:

```bash
npm install --save-exact @openfairygui/backend @openfairygui/core @openfairygui/functions
```

For stateful editing, open an existing project with `createNodeBackendRuntime` and use UAM transactions to preview, apply, and save. The [editing example](./examples.md) includes error handling and rereading; see [Packages and Tools](./packages.md) for browser-host entrypoints.

For document inspection alone, use the lower-level Node I/O API:

```ts
import { NodeIO } from '@openfairygui/core/node';
import { inspect } from '@openfairygui/functions';

const document = await new NodeIO().readProject('./MyProject/MyProject.fairy');
const report = inspect(document);
console.log(report.projectType, report.totals.packages);
```

`Document` is a mutable low-level API; public editing uses UAM transactions. See [Diagnostics and Recovery](./diagnostics.md) for failure handling and the [documentation index](../README.md) for architecture and protocols.
