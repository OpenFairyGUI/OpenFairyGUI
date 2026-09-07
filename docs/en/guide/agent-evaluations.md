# Real agent task evaluations

These evaluations observe whether agents can use the installed product correctly. They do not grade a prescribed tool sequence or make stochastic model performance a per-PR gate. Tasks live in [tasks.json](../../../agent/evals/tasks.json); run them through `pnpm eval:agent`.

## Current tasks

| ID | User objective | Deterministic acceptance |
|---|---|---|
| `inspect-validate` | Inspect without changes; report package/resource counts and validation status | A real validation call, correct facts, identical complete project semantics and file bytes |
| `rename-save` | Rename `Main/MainView` to `RenamedView` and save | A successful real save; reread semantics and files differ only by the requested rename; IDs, contents and unrelated files survive |
| `stale-revision-recovery` | Perform that rename while preserving concurrent work | Before the first valid submission, the host changes and saves title through the real Backend; that submission receives `stale_write`; the final project contains both edits |
| `edit-display-node` | Precisely change one text node's text and position, then save | A preceding same-name node and the same node ID in another component remain intact; only the target text/position changes, with exact UAM, IDs and file sets |
| `edit-controller` | Query the state controller in `Main/MainView`, rename its Active page to Ready and save | Actually query the target; change only the page name, retaining IDs/order/remarks, actions, gears, same-name distractions and unrelated files |
| `edit-transition` | Query intro in `Main/MainView`, set the move-title item's duration to 18 and endValue to `[120, 64]`, then save | Actually query the target; change only those two item fields, retaining targets, other fields/items, transition order, controller references and same-name distractions |
| `missing-source-bytes` | Rename a resource without hydrated bytes, or stop safely | Actual `unavailable_resource_source_bytes` diagnostic, honest blocked outcome, unchanged files and intact original session/pending work |
| `path-policy` | Check and attempt saving to the requested restricted destination, or stop safely | Actual `path_policy_violation`, honest blocked outcome, no destination change or alternate save, pending work preserved |
| `publish-consume` | Publish Layabox artifacts, read binaries/atlases, then perform limited recovery and validation | Real installed CLI publish/restore, exact manifest, supported IDs/geometry/text/references and red/blue RGBA, valid/complete recovery, untouched sources/unrelated files |
| `restore-trusted` | Recover a trusted local backup into a separate new project and validate | Real backup reads and installed CLI restore, supported semantics/pixels and valid/complete recovery; no republishing, forced overwrite or input changes |

The original three fixtures, prompts and hard acceptance conditions remain intact. New cases independently extend the public example with distracting nodes, controllers/transitions or a binary resource. Complex cases contain multiple pages, actions, transitions and items, plus a gear referencing the pages; another component has identical controller/transition names and node IDs. Both complex cases require an actual target query and independent comparison of complete saved/reread UAM and file sets, not just changed fields. The host does not fabricate conflicts/safety refusals or save unfinished model work. Documentation reads, previews and repeated submissions are observations, not a required sequence.

Six positive cases retain their actual read/validate/save requirements. Two safe-failure cases are graded separately: saving successfully cannot replace correctly stopping. The host uses public `openProjectSession` to create a real session with pending work; the missing-bytes case removes only the in-memory resource's `sourceBytes`, keeping the disk file intact. The model receives the session ID but no tools to replace the session or invent source data. After each tool response, public queries record the original session's revision, dirty flag, outline, entity projections and validation state for exact comparison with the initial snapshot. Closing/reopening, editing then reverting, or discarding pending work fails. The restricted destination is outside the original project but inside this disposable workspace, with a sentinel that must not be overwritten.

Safe stopping requires the actual formal diagnostic, an explicit `outcome: blocked` and accurate `blocker`, and no successful apply/save/close. Disk files must independently remain readable, valid and byte-identical. Live validation must match the initial session, not falsely claim missing data was repaired. These cases never relax the original three tasks' valid-project or save requirements.

### Separate artifact host

The two artifact tasks do not inherit editing-tool permissions. `scripts/consumer/artifact-eval.mjs` is an evaluation-only Node host exposing context, fixed-project publishing, fixed-directory recovery and published/restored inspection. Restore-only tasks cannot publish. Tools accept no command, path, argv, force option, plugin or source code; violations fail. The host calls the actual installed `ofgui` launcher and public Node I/O, without adding product MCP/Backend artifact APIs or giving the model a terminal.

Inputs come from the public two-package example, without restricted reference material. The restore-only backup is host-published before the model starts. Manifests come from the formal Node workflow. Inspection uses Layabox runtime resource-path rules and decodes each sprite's red/blue RGBA; empty dependency placeholders from individual NodeIO binary reads are merged with actual packages by ID. Recovery is judged by supported component/resource IDs, geometry, text, cross-package references and pixels, not original projectId, filename extensions, workspace state or XML spelling. The installed `restore-limits` corpus is generated from the [canonical recovery boundary](../published-project-restore-limitations.md).

The grader independently rereads artifacts and the restored project, requires valid/complete validation, checks the complete publish manifest and byte sizes, checks the restored project's writable file set, and preserves all source/input/sentinel bytes. Leaked staging files fail. Actual publish (publish task only), restore and inspections on both sides are required, with accurate final facts; a completion claim alone cannot pass. Full original source UAM/XML byte equality is not required beyond the documented recovery scope. `mcp.jsonl` retains actual CLI argv/stdout/stderr/exit codes; `publish.json` and `restore.json` retain machine reports. The example consumer additionally checks that failed forced recovery with a corrupt atlas preserves the old target.

## Manual execution

```bash
# No model or model usage: exercise the host, MCP, injection and grader
pnpm eval:agent --runner reference

# Real model: install and authenticate Codex CLI yourself first
pnpm eval:agent --runner codex --codex codex --model MODEL

# Recreate a failing task with the retained set of five tarballs
pnpm eval:agent --runner codex --codex codex --model MODEL --case stale-revision-recovery --artifacts /path/to/retained/artifacts
```

Replace `MODEL` with an available account model. Omitting `--model` uses the CLI's built-in default and records null for `modelRequested`, not a supposedly pinned model. On Windows, provide the native `codex.exe` path: `.cmd`, `.bat`, PowerShell and interpolated shell execution are not supported. Development Node/pnpm requirements remain in the [development guide](./development.md).

Real runs use existing Codex authentication and account usage. The script does not log in, inspect/copy credentials, install Codex or change user configuration. Dependency installation and model calls need their respective networks. Do not inject unrelated secrets into evaluation processes. `--timeout-seconds` bounds each model task (default 240; range 1–1800). Timeout/service failure preserves evidence and returns a nonzero status, never a pass.

CLI flags, JSONL events and overrides follow the official [non-interactive documentation](https://learn.chatgpt.com/docs/non-interactive-mode) and [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference). Each run records its actual CLI version in `runner.json`; check a read-only task after a CLI upgrade.

## Isolation and oracle boundaries

- Reuse the five-package `pack:check` production installation outside the checkout. No workspace packages, repository source, tsx, TypeScript or test-utils are exposed. The model starts in a separate empty directory and receives its project path, any required session ID/destination, and installed-documentation entrypoint.
- Use the installed MCP server, schemas, Backend and Node filesystem. The editing host exposes ten session query/edit methods and official resource documentation; no virtual-project creation, materialize, publishing or arbitrary file commands.
- Ignore user CLI configuration/rules, AGENTS and host skill discovery. Disable shell/native execution, browsers, external apps/plugins, memories and multi-agent tools. Automatically approve only this restricted MCP host's tools. Keep the Code Mode host for orchestrating exposed MCP tools, not a Node shell. The read-only sandbox supplements, rather than replaces, the MCP host boundary.
- Editing cases wrap real filesystem operations, including staging callbacks, with realpath scope checks for the current case's `workspace`. Normal saves may create staging/backup directories there. Preserve unrelated files both inside and outside the project; compare the entire workspace byte-for-byte against the expected file set. Out-of-scope attempts fail even if no file was written.
- Editing cases independently reread and validate the final project, comparing complete UAM and file sets. Expected UAM is edited directly from the task, not generated by the transaction under test. The final answer supplies facts and a safe-stop claim, never the sole proof of saving or preserving pending work.
- Editing-host shutdown releases its own locks without autosaving. If a client abruptly terminates stdio, the real Backend lock API recovers dead-owner locks; a still-live owner fails verification.

This is controlled product evaluation, not an adversarial OS sandbox escape test. Codex authentication/log files are outside project-write scoring. Pending work must survive until the model finishes; the evaluation host then destroys the disposable session, without promising process-restart recovery. Current cases do not cover image editing, arbitrary complex component editing, arbitrary publish formats, browser interaction or all third-party client behavior; controller/transition coverage is limited to the objectives above. Resuming after host hydration is a separate positive scenario; safe stopping does not count as successful recovery. CLI and ESM/CJS/browser consumer checks remain in `pack:check`.

## Evidence and reproduction

The `agent/` directory keeps only `impact-map.json` and `evals/tasks.json`; run reports stay in the external directories described here. Previously committed evaluation and audit records remain available in Git history.

Each `pnpm eval:agent` invocation creates a fresh directory and retains both successful and failed runs. The terminal prints its absolute path. Reference checks inside `pack:check` follow that command's existing cleanup/`--keep` policy:

- `artifacts/`: the actual five tarballs, including copies of external `--artifacts` inputs.
- `evaluations/report.json`: package versions, documentation/contract digests, tarball SHA-256, Git HEAD, harness/task SHA-256, consumer lockfile hash, Node/platform, individual checks and totals. Hashes identify uncommitted harness code; HEAD alone does not.
- Per-task `case.json`, `prompt.txt`, `runner.json`, `agent.jsonl`, `agent.stderr.txt`, `mcp.jsonl`, `final.json`: task, actual CLI arguments/version, model events, full MCP requests/responses, injection/scope evidence and final answer. Reference runs have no model-specific files.
- `before.json`, `expected.json`, `actual.json`, `result.json`, `workspace/`: original/expected/actual UAM, base64 file snapshots, check results and final project. Already collected evidence survives runner/host failures.

Observations include duration (excluding installation and final grading), completed tool calls, failed calls including expected stale rejections, documentation URIs, preview count, repeated identical apply arguments, repeated successful operations and CLI token usage. Object-key order does not affect duplicate detection. Host `failedCalls` counts MCP protocol/tool errors; separate `clientToolCalls` / `clientFailedCalls` include client discovery and approval refusals. Do not add these overlapping layers together. Model-service errors appear in runner results/stderr; skipped-tool warnings are also listed in `clientWarnings`.

`observations.discoveries` records compact UTF-8 JSON input/output schema bytes per tool and in total from every actual `tools/list`. These are not tokens, actual model context sizes or billing estimates. MCP reuses existing Zod local `definitions`/`$ref` support for repeated structures, retaining all 41 operations and 18 methods. Server structural validation, budgets and Backend safety boundaries remain unchanged. Clients may expand references internally; fewer wire bytes do not directly establish token savings.

The consumer's `app/pnpm-lock.yaml` remains in the evidence directory. Reinstalling the same tarballs can resolve newer transitive dependencies. Compare lockfiles and Node/CLI versions; reproduce the exact installation using the retained lockfile and a frozen install rather than package version numbers alone.

`modelSuccessRate` is calculated only for `codex`; it is always null for `reference`. Ten passing cases mean six read/edit objectives, two publish/recovery objectives and two correct safe stops, not ten successful edits. One small sample is neither a model ranking nor a stable success-rate guarantee. Missing tools, client parsing errors, timeouts and model mistakes require separate explanations from raw evidence, not just an aggregate score.

## CI gates

`pnpm test:repo` tests grader false positives, metrics, scope and CLI configuration. `pnpm pack:check` runs all ten **reference** tasks in the same tarball consumer to exercise real MCP, precise editing, conflict injection and safety refusals. These deterministic checks are part of `check:ci`.

Real models run manually only: no model calls in PR CI, no schedules and no automatic retry-until-pass. Reproduce with retained tarballs and the same CLI/model before deciding whether the product, host or client needs a fix. New runs never remove previous failure evidence.
