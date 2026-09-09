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

Stable `0.6.0` includes `readSessionState` / `readResourceBytes`. To try prereleases, change the two packages to `@openfairygui/cli@next` and `@openfairygui/mcp@next`, still saving exact versions. Keep packages on the same version and channel, and construct operations from the installed documentation.

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

### Minimal connection check

Ask the agent to read `openfairygui://docs/index`, report the installed version, discover tools, and read Backend capabilities. A version matching the local CLI and a list of available methods confirm the connection without editing a project. Then follow the index to the workflow and method/operation schemas. The terminal equivalents are:

```bash
./node_modules/.bin/ofgui docs cat workflow
./node_modules/.bin/ofgui docs schema setDisplayNodeProps --json
./node_modules/.bin/ofgui docs cat methods/queryEntity --json
./node_modules/.bin/ofgui docs diagnostic stale_write --json
```

These queries read bundled documentation without visiting a website. `ofgui docs cat skill` returns the navigation Skill for the host to read or enable. See [Installed Documentation](./installed-docs.md) for the full format.

## Complete your first edit

Turn a static reward panel into a component with three controller-driven states. One edit covers a controller, text, button interaction, and conditional visibility. Use stable `0.6.0` to complete this task.

### Prepare the project

Follow the [runnable examples](./examples.md) to copy `examples/` outside the repository and run `npm install`, then execute:

```bash
node reward-panel-states/index.mjs --create
```

This creates an independent temporary project without the three-state configuration. Set `OPENFAIRYGUI_ALLOWED_PROJECT_ROOTS` to the parent directory of the output `projectPath` (a `.fairy` file), restart the MCP connection after updating its configuration, and insert the actual `projectPath` into the task. Keep this path for inspection in an editor. The example does not overwrite user projects.

For tool-call diagnosis alone, start with the [read-only MCP example](./examples.md#mcp-stdio-client). The [single-field edit example](./examples.md#revision-checked-edit-save-and-reread) remains available as a minimal editing check.

### Give the agent this task

> In `Main/RewardPanel` at `<projectPath>`, add a `rewardState` controller with pages `Locked`, `Claimable`, and `Claimed`, initially on `Locked`. Use gears to make `claimButton` display “未达成”, “领取奖励”, and “已领取” on those pages, respectively; only `Claimable` is interactive and not grayed. Show `claimedMark` only on `Claimed`. Preserve the existing layout, other components, and resource bytes. Query the targets and preview the entire batch, then apply once, validate, save, and reopen to verify it. Stop and report ambiguous targets, an existing controller with the same name, revision conflicts, or incomplete validation, preserving any applied but unsaved changes.

Acceptance targets (the sample uses Chinese labels meaning “Not reached”, “Claim reward”, and “Claimed”):

| `rewardState` page | `claimButton` text | `grayed` / `touchable` | `claimedMark` |
|---|---|---|---|
| `Locked` (initial) | 未达成 | `true` / `false` | Hidden |
| `Claimable` | 领取奖励 | `false` / `true` | Hidden |
| `Claimed` | 已领取 | `true` / `false` | Visible |

This configures UI states. The editor preview or host drives page changes; reward delivery, eligibility, and automatic page changes after a click belong to application logic.

### Edit and verify

The workflow uses canonical Backend capabilities. Discover actual MCP tool names and exact parameters from the installed schemas:

1. Open the authorized project session. Find unique package, component, and node IDs in the outline, query current properties and the actual revision with `queryEntity`, and check whether `rewardState` already exists.
2. Use the installed schemas to build one `addController` and three `addGear` operations (`text`, `look`, and `display`). Call `preflightTransaction` with one `expectedRevision` and check that the file impact only involves `Main/RewardPanel.xml`. Previewing does not commit, save, or reserve a revision.
3. Call `applyTransaction` against the same revision. On `stale_write`, refresh and replan rather than blindly substituting a newer revision.
4. Check the new state with `validateSession`, requiring `status: "valid"` and `complete: true`.
5. Call `saveSession` against the applied revision and require `dirty: false`. After saving succeeds, close the session, reopen the project, and use `queryEntity` to check the controller, its three pages, and gear configuration. Close the reread session when finished.
6. Switch `rewardState` through each page in an editor or actual FairyGUI runtime, checking text, gray appearance, interaction, and visibility against the table. If this step was not performed, report visual and click behavior as unverified.

A host with file access must independently compare results before and after saving to verify that other project semantics and resource bytes are unchanged. Report this as unverified if the comparison was not performed. Current-session queries, `dirty: false`, and successful validation do not replace this comparison. If validation or saving fails, preserve the session and unsaved work so the host can address the cause.

The [reward panel example](./examples.md#three-state-reward-panel) provides the complete SDK implementation. Consumer checks connect the same editing function to both the SDK and real MCP stdio, independently comparing the full UAM and file bytes before and after saving. They cover the four expected operations, reopening, and rejection of a repeated task. They do not measure agent model success or verify FairyGUI visuals.

### Advanced examples

After the main task, continue with B or run C using its independent template project:

| Direction | Task and acceptance focus |
|---|---|
| B · Visual redesign | [Layout and entrance animation example](./examples.md#reward-panel-layout-and-entrance-animation): resize the panel to 420 × 320, update its layout, and add a 0.4-second entrance animation in one seven-operation batch, preserving the three-state configuration. Includes before/after published artifacts, actual runtime screenshots, and acceptance tables. |
| C · Component generation | [Template-based reward card example](./examples.md#generate-reward-cards-from-a-template): use three `addComponent` operations to generate exported components with distinct titles and icons, sharing one Label template and existing images. Includes independent template/file preservation checks and an actual runtime screenshot. |

If the host needs the complete generated model before saving, stable `0.6.0` provides `readSessionState`; use its returned revision with `readResourceBytes` for the primary assets you need. See the [contract guide](./contracts.md) for response budgets, read diagnostics, and `stale_read` recovery.

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
