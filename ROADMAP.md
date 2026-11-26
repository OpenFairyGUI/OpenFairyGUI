# OpenFairyGUI 路线图

[English](./ROADMAP_EN.md)

> **状态：建议稿，不是发布承诺。** 本文基于 v0.7.1（2026-11-26）与 `main` 主干整理。正式能力以[更新日志](./CHANGELOG_CN.md)和[文档](./docs/README.md)为准；`docs/` 只描述当前实现，规划只写在本文件。

## 版本与发布规则

| 类型 | 规则 |
|---|---|
| patch（0.7.x） | 只含缺陷、安全与依赖范围修复。不加功能，不改公开 API 与契约。按需发布。 |
| minor（0.x.0） | 每个版本一个主题，写在本文件对应条目下。破坏性变更只进 minor，并且先列入该版本的“计划内破坏性变更”再合入。 |
| 节奏 | minor 每 4 周一班。到期发布已合入的内容，没做完的顺延到下一班；不为赶日期合入半成品，也不为等某一项推迟发布。 |
| 预发布 | 默认不发。只有需要外部消费者提前验证破坏性变更时，才发 `-rc.N`（npm `next` 标签、GitHub prerelease）。正式版发布后，若 npm `next` 标签更旧，则由发布工作流自动同步指向该正式版。 |
| 计划外工作 | 每班预留约 30% 精力给计划外修复（v0.7.0 的 22 条修复大多来自项目审查和 issue）。超出预留时顺延计划项，不推迟发布日期。 |

## 分支规则

采用单主干模型：功能和修复均以 PR 合入 `main`（合并后自动删除源分支），直接从 `main` 打 tag 触发[发布工作流](./.github/workflows/release.yml)发布（完整步骤见[开发指南](./docs/guide/development.md#发布流程)）。只有需要给已发布的 minor 打补丁、而 `main` 已有未发布的破坏性变更时，才从对应 tag 临时开 `release/0.x`；修复先合入 `main`，再 cherry-pick 过去。

## Now：v0.8.0（目标 2026-12-24，主题：减少保存阻断，建立评测基线）

计划内破坏性变更：无。如确需破坏性变更，先补到这里再合入。

> 前置工程（单主干 `main` 迁移、合并后自动删分支、发布流去重提速、`pnpm release:bump` 与双语发布流程文档）已合入 `main`。

### 1. 度量并降低保存阻断率

- 现状：会话的 UAM 往返与原工程存在未建模差异时，`uamFidelity` 为 `unsupported`，整个会话拒绝保存（[`persistence-service.ts`](./packages/backend/src/services/persistence-service.ts)）。v0.6.2 和 v0.6.3 各出现过一次真实工程因此无法保存（[#149](https://github.com/OpenFairyGUI/OpenFairyGUI/issues/149)、[#152](https://github.com/OpenFairyGUI/OpenFairyGUI/issues/152)），都是逐个修复，没有批量统计，且当前失败诊断未返回具体差异明细。
- 做法：对 `pnpm refs:sync` 获取的 fixture 批量打开会话，统计 `full` 占比，按出现频次列出差异并逐项补正式属性模型，同时补齐保真度失败的可观测差异输出。顺带核对 `core` 与 `functions` 源码中剩余的内部 `extras` 用法（如 sprite map、`_fontSpriteAlias`、`_fileName`、`_restoreAsLooseImage` 等）是否属于长期协议字段。
- 在途工作：本地 WIP 分支 `wip/roadmap-0.7-snapshot` 中的提交 `d4abd3d`（editor hints、fixture fidelity 测试、保存语义）与当前 `main` 有多处冲突，其中 component `fileName` 提示已随 v0.6.2 合入。只挑出仍有价值的测试和改动，不整体 rebase。
- 验收：统计脚本可重复运行并输出差异清单；0.8.0 更新日志写明 `full` 占比。

### 2. 建立真实模型评测基线

- 现状：0.7.0 起有 Codex 与 Claude 两个 runner，但 reference 运行不算模型成绩（[评测指南](./docs/guide/agent-evaluations.md)），还没有可按版本对比的真实模型记录。
- 做法：在 0.8.0 发布候选上用两个 runner 各完整跑一次全部任务并记录汇总；之后每个 minor 发布前跑一次并对比。
- 验收：两种客户端各有一次完整运行记录，失败项有原始证据和归因（产品 / 宿主 / 客户端）。

### 3. 组件内按属性筛选节点（时间够再做）

- 现状：现有 MCP 工具没有组件内筛选，同名节点只能逐个 `queryEntity` 读取后区分（评测任务 `edit-display-node` 正是此场景）。
- 做法：设计一个有预算上限的查询，在指定组件内按 kind、name、文本等已建模属性返回候选及关键属性。
- 验收：`edit-display-node` 类任务的工具调用次数下降，提交仍需精确 ID。到期未完成则顺延。

## Later：未排期

| 事项 | 现状与排期条件 |
|---|---|
| 扩大代码生成覆盖 | [`codegen-settings.ts`](./packages/functions/src/codegen-settings.ts) 只支持 LayaBox、Cocos Creator 与 `codeType` 为空的 Unity。按下游实际工程类型的需求排序。 |
| 视觉验证 | Agent 改完布局看不到结果，验收停在数据层（相关反馈：[#1](https://github.com/OpenFairyGUI/OpenFairyGUI/issues/1)）。先做可行性评估，不承诺交付。 |
| 评测覆盖 | 尚未覆盖图片编辑、复杂组件与浏览器交互。每个 minor 随新能力补 1–2 个任务。 |
| 1.0 稳定面 | Backend 契约已到 3.0.0，0.4–0.7 每个 minor 都有破坏性变更。规划 1.0 时明确冻结与实验性 API 的范围，并给宿主留迁移窗口。 |

## 维护本文件

- 每次发布时与更新日志同一轮修改：删除已发布的项，从 Later 提升下一版本的内容。
- 已有 issue 的事项附上链接；不为了本文件另建 issue 或 milestone，版本范围以本文件为准。
- 新增事项写明现状、做法、验收；证据不足的标为待核实，不写成现行能力。
- `ROADMAP.md` 与 `ROADMAP_EN.md` 同步修改，条目与编号保持一致。
