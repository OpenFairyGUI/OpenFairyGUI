# Evaluation baselines / 评测基线

These are local consumer evaluations of five packed workspace packages, not registry release certifications. Identify a cohort by tarball and harness hashes rather than the unchanged 0.6.1 package label. Full transcripts remain outside the checkout; public JSON omits local error stacks and credentials.

这些是工作区五包 tarball 的真实消费者评测，不代表 registry 已发布版本。请按报告中的包、任务及脚本摘要识别批次。

## Recorded model cohort (b40d1a0) / 已记录模型批次

| Runner | Result / 结果 | Client / 客户端 |
|---|---|---|
| [Claude](./0.6.1-claude-qualified.json) | **11/11 (100%)** | Claude Code 2.1.281; client-reported claude-opus-5-5 |
| [Codex](./0.6.1-codex-qualified.json) | **11/11 (100%)** | codex-cli 0.154.0; client-selected model, identity not inferred |
| [reference](./0.6.1-reference-qualified.json) | **11/11** deterministic checks | No model score / 非模型成绩 |

[Qualification receipt / 验收记录](./0.6.1-qualified-receipt.json) verifies identical five tarball hashes, harness hashes and installed contract/documentation metadata. Source: b40d1a0 plus untracked audit/evidence files (dirty=true). Subsequent PR review fixes change the Label contract; these model scores describe the recorded cohort, not the later fixes. Both model runners used a 600-second per-task limit, with no model override.

以下 11 项 Claude 任务全部通过；模型评测不作为 PR CI 门禁，也不代表所有模型配置的通用成功率。

| Task | Claude |
|---|---|
| inspect-validate | PASS |
| rename-save | PASS |
| stale-revision-recovery | PASS |
| edit-display-node | PASS |
| edit-controller | PASS |
| edit-transition | PASS |
| missing-source-bytes | PASS |
| path-policy | PASS |
| publish-consume | PASS |
| restore-trusted | PASS |
| compound-edit | PASS |

## Original cohort and corrective work / 原始批次与修复

| Cohort / 批次 | Runner | Result / 结果 |
|---|---|---|
| Original audit snapshot / 原审查快照 | [reference](./0.6.1-reference.json) | 11/11 deterministic self-check; not a model score / 确定性自测 |
| Original audit snapshot / 原审查快照 | [Codex](./0.6.1-codex.json) | 11/11 real model tasks; native client 0.154.0, no explicit model override |
| Original audit snapshot / 原审查快照 | [Claude full run](./0.6.1-claude-full.json) | 9/11; native client 2.1.281, client-reported claude-opus-5-5 |

The first complete Claude run finished all 11 tasks. missing-source-bytes preserved pending work and stopped safely, but reported the wrong blocker because failed-call text omitted nested diagnostic codes. restore-trusted produced correct files, semantics and pixels, but reported five resources instead of four. Neither failure is hidden or reclassified as a pass. All other tasks passed.

Claude 首轮完整运行 11 项，9 项通过。missing-source-bytes 安全停止并保留待保存工作，但错误文本缺少嵌套诊断码，模型误报阻塞原因；restore-trusted 的产物、语义和像素均通过，最终汇报把 4 个资源说成 5 个。原始失败报告保留，评分规则未放宽。

The MCP adapter now includes bounded primary/nested error codes in failed-call text, with the complete payload retained in structuredContent. A real MCP regression test covers missing bytes and unchanged session state. The fresh integrated and fixed cohort passed all 11 tasks in each runner.

MCP 已补充有界文本错误摘要，并通过真实 MCP 回归验证。合入 next 后的新包完整评测已完成，三个 runner 均为 11/11。

## Reproduction / 复现

Run pnpm eval:agent --runner reference --report <report.json> to pack a fresh consumer cohort. Reuse its --artifacts directory with --runner claude --claude <native-executable> --claude-settings <settings.json> --timeout-seconds 600, or --runner codex --codex <native-executable>. Export separate reports. Settings are passed to the client, never copied into public evidence. No model scores gate PR CI.

[Historical attempts / 历史尝试](./history.md) preserves prior authentication, configuration and connectivity attempts. They produced no usable model task result and are not capability scores. The cancelled 20-attempt batch contains 13 completed timeouts, one interrupted attempt and six unstarted attempts.
