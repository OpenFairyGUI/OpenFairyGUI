# Historical attempts / 历史尝试

This chronology preserves earlier observations; use [current baseline status](./README.md) for acceptance. Earlier statements of blocking or pending work describe their recorded stage.

以下按当时状态保留，当前验收以[基线入口](./README.md)为准。

# Evaluation baselines / 评测基线

[0.6.1 reference report](./0.6.1-reference.json) was recorded on 2026-09-24 from the uncommitted project-review worktree. All 11 deterministic tasks passed, including two revision-checked edit/save stages. It is a harness/product self-check, **not a model score or a published-release result**. Exact tarball and harness digests, installed contracts, lock hash and dirty provenance are in the report.

该报告来自尚未提交的审查 worktree；11 项确定性任务通过，不代表模型成功率或 registry 上已发布版本。以 tarball 与任务集摘要辨认版本，不能仅凭 0.6.1 标签比较。

| Runner | Evidence status / 证据状态 |
|---|---|
| reference | 11/11 deterministic self-checks passed / 确定性自测通过 |
| codex | [Real model report](./0.6.1-codex.json): 11/11 (100%), native codex-cli 0.154.0, no explicit model override / 原生客户端真实任务全部通过，未覆盖客户端默认模型 |
| claude | Latest single pilot passed 1/1 with client-reported `claude-opus-5-5`; full 11-task suite pending / 最新单项 1/1 通过，完整 11 项评测待运行 |

Reproduce with `pnpm eval:agent --runner reference --report agent/evals/baselines/<version>-reference.json`. For real clients, choose `--runner codex --codex <native-executable>` or `--runner claude --claude <native-executable>`, with the same artifacts/task digest, and export a separate report. Keep failed attempts and explain client/version/authentication failures. Do not compare deterministic results with model success rates. Full local evidence remains outside the checkout; public reports omit local error stacks.

[Claude pilot](./0.6.1-claude-pilot.json) retains the initial authentication failure; its numeric zero is an unsuccessful harness attempt, **not a model capability score**. [Environment receipt](./0.6.1-claude-environment.json) records the follow-up probes without credentials or endpoint URLs: normal user settings returned HTTP 429; explicit settings under bare/restricted mode connected the MCP host but timed out after a transport retry. Safe mode disables the required MCP host and is not an evaluation fallback. No Claude task result was obtained.

Claude 初次 pilot 的零分仅表示运行失败，不作为模型成绩。环境记录保留认证失败、普通设置下的 429，以及显式设置下的 MCP 连接与网络重试超时。客户端安装已确认，仍缺可用服务端响应；随后按用户要求追加的重试见下方记录。`--claude-settings <settings.json>` 允许显式传给原生客户端，评测器不读取或复制凭据。

The Codex baseline uses exactly the reference baseline’s five tarball hashes and task-set hash. Each case passed tool isolation and the state/file oracle, including both safe stops and the two-save compound task. It is one local 11-task observation with the client-selected model, not a cross-model ranking or a published-release certification. The report records `modelRequested: null`; no resolved model identity is inferred. The subsequent Claude settings-option change affects the runner harness only; its hashes differ from these retained attempts.

Codex 结果与 reference 使用同一组五包及任务摘要；11 项均通过工具隔离和真实状态/文件检查。该结果仅为本地一次观测，不能泛化为所有模型或已发布版本的认证。模型由客户端选择，报告未声称已识别实际模型。后续新增 Claude 设置参数改变了 harness 摘要，未改动本次评测使用的 tarball。

## Follow-up retries / 追加重试

On 2026-09-24, two independent native Claude attempts used explicit authentication settings and the same artifacts/task, with 600-second and 300-second timeouts and a 45-second gap. Both timed out after repeated HTTP 429 responses; 13 automatic retry events were recorded, with no model tool calls. [Retry receipt](./0.6.1-claude-retries.json) links the separately retained reports. No full Claude suite was started because the initial task never received a usable model response. These are environment failures, not model scores; A9 remains incomplete.

按用户要求追加两轮独立尝试，分别等待 10 分钟、5 分钟，中间间隔 45 秒。两轮均在持续 429 后超时，共记录 13 次自动重试事件，没有模型工具调用。失败报告均独立保留，未覆盖先前证据；尚不具备运行完整 Claude 评测的连接条件，A9 继续标为未完成。

## Ten more requested attempts / 再次追加十轮

[Ten-attempt evidence](./claude-retry10-20260924-225736/README.md): all 10 independent attempts timed out; 38 automatic retry events comprised 25 HTTP 429 responses and 13 errors without an HTTP status. No model tool calls or valid task results were obtained. Each task had a 180-second limit, with 30-second gaps. A9 remains blocked by the client service/transport.

十轮均已执行完并独立留证，均超时，没有有效模型成绩；保持 A9 未完成。

## Configuration correction / 配置修正

The subsequent [20-attempt batch](./claude-retry20-20260924-234050/README.md) was cancelled at the user’s request after they reported correcting the configuration: 13 timed-out attempts, attempt 14 interrupted, six not started. The single fresh pilot is recorded below. Earlier 429 responses describe observations under the old configuration; they do not independently establish the cause.

用户确认原配置有问题并已重新配置。已停止旧批次，旧配置下的 429 与超时保留为观测记录，不据此单独判定根因。新配置只运行一次单项验证。

[Reconfigured single pilot](./0.6.1-claude-reconfigured-pilot.json) and [receipt](./0.6.1-claude-reconfigured-receipt.json): one invocation, MCP isolation passed, model reported as `claude-opus-5-5[1m]`, 10 internal HTTP 503 retry events, 300-second timeout, and no model tool calls. No further invocation was started. A valid Claude model score and full-suite acceptance remain unavailable.

新配置按要求仅启动一次客户端；MCP 隔离通过，客户端报告模型为 `claude-opus-5-5[1m]`，内部记录 10 次 503 重试，最终在 300 秒上限超时，无模型工具调用。未再启动下一轮，A9 仍缺完整 Claude 实测结果。不能仅从 503 判断是否是模型路由或其他服务端问题。

## Latest single attempt after another configuration change / 再次配置后的单次验证

[Report](./0.6.1-claude-reconfigured-pilot-2.json) and [receipt](./0.6.1-claude-reconfigured-receipt-2.json): exactly one invocation on 2026-09-25. MCP isolation passed. The client selected `claude-opus-5-5[1m]` and returned `model_not_found`: the model may not exist or the configured credentials may not have access. This attempt ended without timing out, with no model tool calls. No alternate model was guessed or invoked. A usable model identifier/access configuration is still needed; A9 remains incomplete.

按用户要求仅再调用一次。MCP 隔离通过，客户端选择 `claude-opus-5-5[1m]`，明确返回 `model_not_found`（模型可能不存在或当前凭据无权限），本次不是超时。没有工具调用、没有有效模型成绩，也未猜测替换模型或额外调用。需要配置服务支持且可访问的模型，A9 仍未完成。

A further single attempt on 2026-09-25 returned the same `model_not_found` for client-selected `claude-opus-5-5[1m]`, without timeout or model tool calls. [Report](./0.6.1-claude-reconfigured-pilot-3.json), [receipt](./0.6.1-claude-reconfigured-receipt-3.json).

再次单次重试仍选择 `claude-opus-5-5[1m]`，返回相同的 `model_not_found`，未超时、无模型工具调用。A9 状态不变。

Another user-requested single attempt on 2026-09-25 returned `model_not_found` for `claude-opus-5-5[1m]`. [Report](./0.6.1-claude-reconfigured-pilot-4.json), [receipt](./0.6.1-claude-reconfigured-receipt-4.json). The explicit settings file had no top-level model or model-selection environment override. No extra request was made while checking those non-secret fields.

再次单次验证仍为相同的模型错误。核对本次显式设置文件后，未发现顶层 model、ANTHROPIC_MODEL 或默认模型环境覆盖；客户端继续选择上述模型。只核对了非敏感模型字段，未额外请求模型。

## Successful single pilot / 单次验证通过

[Report](./0.6.1-claude-reconfigured-pilot-5.json) and [receipt](./0.6.1-claude-reconfigured-receipt-5.json): on 2026-09-25, native Claude 2.1.281 reported `claude-opus-5-5` and passed inspect-validate (1/1). Tool isolation, project semantics/files, real validation and inspection facts passed. The artifacts and task hash match the reference baseline. Only one invocation was requested and performed; this does not establish full 11-task Claude acceptance. Earlier configuration failures remain historical evidence.

最新配置已能完成真实任务：单项 inspect-validate 1/1 通过，包括工具隔离、工程语义/文件保持、真实验证和检查事实。与 reference 使用相同五包及任务摘要。按用户要求只运行这一次；旧配置错误保留为历史，A9 尚需完整 11 项 Claude 评测，不能以单项通过替代。
