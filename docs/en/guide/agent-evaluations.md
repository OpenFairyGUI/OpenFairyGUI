# Real agent task evaluations

These evaluations observe whether agents can use the installed product correctly. They do not grade a prescribed tool sequence or make stochastic model performance a per-PR gate. Tasks live in [tasks.json](../../../agent/evals/tasks.json); run them through `pnpm eval:agent`.

## Current tasks

| ID | User objective | Deterministic acceptance |
|---|---|---|
| `inspect-validate` | Inspect without changes; report package/resource counts and validation status | A real validation call, correct facts, identical complete project semantics and file bytes |
| `rename-save` | Rename `Main/MainView` to `RenamedView` and save | A successful real save; reread semantics and files differ only by the requested rename; IDs, contents and unrelated files survive |
| `stale-revision-recovery` | Perform that rename while preserving concurrent work | Before the first valid submission, the host changes and saves title through the real Backend; that submission receives `stale_write`; the final project contains both edits |
| `edit-display-node` | Precisely change one text node's text and position, then save | A preceding same-name node and the same node ID in another component remain intact; only the target text/position changes, with exact UAM, IDs and file sets |
| `missing-source-bytes` | Rename a resource without hydrated bytes, or stop safely | Actual `unavailable_resource_source_bytes` diagnostic, honest blocked outcome, unchanged files and intact original session/pending work |
| `path-policy` | Check and attempt saving to the requested restricted destination, or stop safely | Actual `path_policy_violation`, honest blocked outcome, no destination change or alternate save, pending work preserved |

The original three fixtures, prompts and hard acceptance conditions remain intact. New cases independently extend the public example with distracting nodes or a binary resource. The host does not fabricate conflicts/safety refusals or save unfinished model work. Documentation reads, previews and repeated submissions are observations, not a required sequence.

Four positive cases retain their actual read/validate/save requirements. Two safe-failure cases are graded separately: saving successfully cannot replace correctly stopping. The host uses public `openProjectSession` to create a real session with pending work; the missing-bytes case removes only the in-memory resource's `sourceBytes`, keeping the disk file intact. The model receives the session ID but no tools to replace the session or invent source data. After each tool response, public queries record the original session's revision, dirty flag, outline, entity projections and validation state for exact comparison with the initial snapshot. Closing/reopening, editing then reverting, or discarding pending work fails. The restricted destination is outside the original project but inside this disposable workspace, with a sentinel that must not be overwritten.

Safe stopping requires the actual formal diagnostic, an explicit `outcome: blocked` and accurate `blocker`, and no successful apply/save/close. Disk files must independently remain readable, valid and byte-identical. Live validation must match the initial session, not falsely claim missing data was repaired. These cases never relax the original three tasks' valid-project or save requirements.

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
- Use the installed MCP server, schemas, Backend and Node filesystem. The host exposes ten session query/edit methods and official resource documentation; no virtual-project creation, materialize, publishing or arbitrary file commands.
- Ignore user CLI configuration/rules, AGENTS and host skill discovery. Disable shell/native execution, browsers, external apps/plugins, memories and multi-agent tools. Automatically approve only this restricted MCP host's tools. Keep the Code Mode host for orchestrating exposed MCP tools, not a Node shell. The read-only sandbox supplements, rather than replaces, the MCP host boundary.
- Wrap real filesystem operations, including staging callbacks, with realpath scope checks for the current case's `workspace`. Normal saves may create staging/backup directories there. Preserve unrelated files both inside and outside the project; compare the entire workspace byte-for-byte against the expected file set. Out-of-scope attempts fail even if no file was written.
- Independently reread and validate the final project, compare complete UAM and file sets. Expected UAM is edited directly from the task, not generated by the transaction under test. The final answer supplies facts and a safe-stop claim, never the sole proof of saving or preserving pending work.
- Host shutdown releases its own locks without autosaving. If a client abruptly terminates stdio, the real Backend lock API recovers dead-owner locks; a still-live owner fails verification.

This is controlled product evaluation, not an adversarial OS sandbox escape test. Codex authentication/log files are outside project-write scoring. Pending work must survive until the model finishes; the evaluation host then destroys the disposable session, without promising process-restart recovery. Current cases do not cover image editing, complex components, publishing, browser interaction or all third-party client behavior. Resuming after host hydration is a separate positive scenario; safe stopping does not count as successful recovery. CLI and ESM/CJS/browser consumer checks remain in `pack:check`.

## Evidence and reproduction

Each `pnpm eval:agent` invocation creates a fresh directory and retains both successful and failed runs. The terminal prints its absolute path. Reference checks inside `pack:check` follow that command's existing cleanup/`--keep` policy:

- `artifacts/`: the actual five tarballs, including copies of external `--artifacts` inputs.
- `evaluations/report.json`: package versions, documentation/contract digests, tarball SHA-256, Git HEAD, harness/task SHA-256, consumer lockfile hash, Node/platform, individual checks and totals. Hashes identify uncommitted harness code; HEAD alone does not.
- Per-task `case.json`, `prompt.txt`, `runner.json`, `agent.jsonl`, `agent.stderr.txt`, `mcp.jsonl`, `final.json`: task, actual CLI arguments/version, model events, full MCP requests/responses, injection/scope evidence and final answer. Reference runs have no model-specific files.
- `before.json`, `expected.json`, `actual.json`, `result.json`, `workspace/`: original/expected/actual UAM, base64 file snapshots, check results and final project. Already collected evidence survives runner/host failures.

Observations include duration (excluding installation and final grading), completed tool calls, failed calls including expected stale rejections, documentation URIs, preview count, repeated identical apply arguments, repeated successful operations and CLI token usage. Object-key order does not affect duplicate detection. Host `failedCalls` counts MCP protocol/tool errors; separate `clientToolCalls` / `clientFailedCalls` include client discovery and approval refusals. Do not add these overlapping layers together. Model-service errors appear in runner results/stderr; skipped-tool warnings are also listed in `clientWarnings`.

`observations.discoveries` records compact UTF-8 JSON input/output schema bytes per tool and in total from every actual `tools/list`. These are not tokens, actual model context sizes or billing estimates. MCP reuses existing Zod local `definitions`/`$ref` support for repeated structures, retaining all 41 operations and 18 methods. Server structural validation, budgets and Backend safety boundaries remain unchanged. Clients may expand references internally; fewer wire bytes do not directly establish token savings.

The consumer's `app/pnpm-lock.yaml` remains in the evidence directory. Reinstalling the same tarballs can resolve newer transitive dependencies. Compare lockfiles and Node/CLI versions; reproduce the exact installation using the retained lockfile and a frozen install rather than package version numbers alone.

`modelSuccessRate` is calculated only for `codex`; it is always null for `reference`. Six passing cases mean four positive objectives and two correct safe stops, not six successful edits. One small sample is neither a model ranking nor a stable success-rate guarantee. Missing tools, client parsing errors, timeouts and model mistakes require separate explanations from raw evidence, not just an aggregate score.

## CI gates

`pnpm test:repo` tests grader false positives, metrics, scope and CLI configuration. `pnpm pack:check` runs all six **reference** tasks in the same tarball consumer to exercise real MCP, precise editing, conflict injection and safety refusals. These deterministic checks are part of `check:ci`.

Real models run manually only: no model calls in PR CI, no schedules and no automatic retry-until-pass. Reproduce with retained tarballs and the same CLI/model before deciding whether the product, host or client needs a fix. New runs never remove previous failure evidence.

## Initial observed run

[2026-09-04 record](../../../agent/evals/baseline-2026-09-04.json): Windows x64, Node 24.20.0, five 0.3.1 packages, Codex CLI 0.153.2, `gpt-5.6-sol`. This is one complete run after correcting evaluation configuration. Earlier configuration-debugging failures remain separately retained and are not pooled into this sample.

| Task | Real-model result | Duration | Host tool calls / document reads / previews |
|---|---|---|---|
| inspect/validate | Passed | 29.622 s | 3 / 1 / 0 |
| rename/save | Failed: client skipped editing tools | 49.570 s | 4 / 2 / 0 |
| stale recovery | Conflict execution not reached: client skipped editing tools | 57.397 s | 6 / 4 / 0 |

Raw stderr reports `invalid type: map, expected a string` while Codex converts the apply/preflight MCP schemas, then skips both tools. The host's `tools/list` includes the actual tools. The model's claim that the host does not expose them is therefore not proof that the product has no such methods. This failed record remains unchanged; the diagnosis and post-fix verification follow below.

Independent comparisons confirm all three projects and unrelated files remained unchanged, with no scope violation. The model did not falsely claim a successful save. Task completion was 1/3, but this cannot establish its rename or conflict-recovery ability. Deterministic reference runs passed 3/3 through real MCP consumers on Node 20 and 24, including rename, save, concurrent injection and stale rejection. This difference is concrete client-integration evidence beyond unit and consumer tests.

## Post-fix verification

The [2026-09-04 verification record](../../../agent/evals/verification-2026-09-04.json) uses the same CLI, model, task prompts and grading conditions, with freshly packed artifacts installed in a new workspace. The first full post-fix run passed 3/3. The product-code fix changes only the contract emitter and generated artifacts, not the tasks, grader or model permissions; the client was not upgraded.

A minimal reproduction established that Codex CLI 0.153.2 rejects draft-7 positional tuples such as `items: [{ type: 'number' }, ...]`, dropping the entire containing tool. The emitter now represents homogeneous fixed tuples with one `items` schema and equal `minItems` / `maxItems`. The accepted input set is unchanged, retaining length, element-type, revision and save checks. A real `tools/list` regression checks every tool input and exercises valid values, invalid lengths and invalid element types for four-number tuples in apply/preflight.

| Task | Real-model result | Duration | Host tool calls / document reads / previews |
|---|---|---|---|
| inspect/validate | Passed | 48.122 s | 4 / 2 / 0 |
| rename/save | Passed | 61.369 s | 7 / 3 / 1 |
| stale recovery | Passed, with one actual `stale_write` | 71.043 s | 15 / 3 / 2 |

Both editing tasks saved successfully and matched the complete expected project and file bytes. The conflict task recovered from the rejected revision-0 write, refreshed its queries, previewed again and committed at revision 2, preserving `Title edited concurrently`. There were no skipped-tool warnings, scope violations or repeated successful submissions. The single failed call is the expected real conflict rejection and remains in the failure count.

Node 24 `check:ci` passed (522 AVA tests, 24 repository tests, documentation and tarball checks). Node 20.20.2 `pack:check` also passed using the exact same five tarballs as this model run; both checks included 3/3 deterministic reference tasks. Package versions remain development-branch 0.3.1; source, artifact and contract hashes identify the actual fix. This is neither a published-release claim nor a long-term model success-rate guarantee.

## Stage 7 verification

The [2026-09-05 stage-7 record](../../../agent/evals/stage-7-2026-09-05.json) retains both model runs, complete-report hashes, artifact/source hashes and discovery sizes. The environment remains Windows x64, Node 24.20.0, Codex CLI 0.153.2 and `gpt-5.6-sol`; the actual consumer resolved Zod 4.5.4 / MCP SDK 1.30.0.

The first run scored **4/6**. Both safe-stop cases obtained real diagnostics and preserved every file and pending edit, but included explanation alongside the code in `blocker`. The grader required an exact code, which the initial output contract had not specified. After clarifying only the shared answer schema/prompt, verification with the exact same five tarballs passed **6/6**. Grading, task objectives and model permissions were not loosened. The original failed run remains unchanged and is not pooled with verification.

| Task | Verification result | Duration | Host tool calls / document reads / previews |
|---|---|---|---|
| inspect/validate | Passed | 33.598 s | 3 / 1 / 0 |
| rename/save | Passed | 53.330 s | 7 / 3 / 1 |
| stale recovery | Passed, with actual conflict recovery | 71.026 s | 15 / 4 / 2 |
| edit-display-node | Passed, distracting nodes untouched | 50.068 s | 7 / 2 / 0 |
| missing-source-bytes | Correctly blocked; session remains revision 1 / dirty | 42.009 s | 5 / 5 / 1 |
| path-policy | Correctly blocked; destination and pending work unchanged | 44.478 s | 4 / 2 / 0 |

Input schemas for the ten exposed tools fell from **1,539,683** to **197,873** bytes (about **87.1%**); apply/preflight each fell from **768,384** to **97,479** bytes. Total output-schema size fell from 484,702 to 222,234 bytes. Both sides used the same Zod/SDK versions and canonical contract digest. Actual discovery and editing calls passed without skipped-tool warnings. The three failed calls are the expected stale, missing-bytes and path refusals, not hidden successes.

Final Node 24 `check:ci` passed (522 AVA tests, 26 repository tests, documentation build, six reference cases and tarball checks). Node 20.20.2 passed `pack:check` and 6/6 reference cases using the model run's exact five tarballs. No new version was released. Resuming after host hydration, browser interaction and more complex edits remain outside this round's coverage.
