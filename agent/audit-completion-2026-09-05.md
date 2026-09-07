# Agent 仓库审查验收映射（2026-09-05）

本记录对应原审查的十三个主题，核对实现、调用入口与消费者证据，不把“测试通过”当作功能存在的唯一依据。实现采用现有包、Git、AVA 与生成链；原报告中的示例文件名、目录树和 registry 字段不是另一套必须照抄的协议。

## 原审查逐项对应

| 原审查主题 | 当前实现与验收依据 |
|---|---|
| 1. 可复现指令与参考资料 | [references.json](../references.json) 只登记公开 fixture 的职责与探针，URL/gitlink 由 Git 唯一拥有；[repo doctor](../scripts/repo-doctor.mjs) 与 [refs:grep](../scripts/refs-grep.mjs) 检查登记、缺失、dirty、版本不符与探针完整性；规范 AGENTS 不被忽略。仓库测试覆盖拒绝部分成功、字面量检索和只读行为。 |
| 2. 任务路由与最小上下文 | [根 AGENTS](../AGENTS.md) 和六个包级指引定位所有包；[开发指南](../docs/guide/development.md) 提供启动与术语；[双语任务指引](../docs/guide/task-recipes.md) 覆盖 XML、UAM、Backend、MCP、发布/恢复与取证。复用两页指引，不再复制 CONTEXT/CONTRIBUTING 与六套说明。 |
| 3. 统一验证入口与 impact map | [package.json](../package.json) 提供 check:fast/check/check:ci；[impact-map.json](./impact-map.json) 同时驱动 [test:changed](../scripts/test-changed.mjs) 和 AGENTS 表，包含下游，未知路径/基准及空选择不能静默通过。 |
| 4. 文档自动门禁 | [check-guidance](../scripts/check-guidance.mjs) 检查路径、命令、链接、导出源码映射、双语入口/Changelog 结构；契约生成区与随包 Skill 有漂移检查；[PR CI](../.github/workflows/ci.yml) 构建 TypeDoc/VitePress 并执行安装示例。字段含义与翻译仍须人工审查；[PR 模板](../.github/pull_request_template.md) 显式记录这些影响和未验证项。 |
| 5. 单一契约生成链 | [生成器](../scripts/generate-contracts.mjs) 从 Core/Backend/CLI 正式类型与 MCP 传输元数据生成 41 个 operation、18 个方法及 13 个 CLI 命令路径的 schema；覆盖映射/诊断遗漏与生成漂移测试，不增加 contracts 包、Core Zod 依赖或第二套事务语法。 |
| 6. 精确查询、发现与预演 | [read-service](../packages/backend/src/services/read-service.ts) 提供五类精确、有界、revision-bound、无源字节投影；[authoring-service](../packages/backend/src/services/authoring-service.ts) 在队列中执行后丢弃预演；[transaction-preview](../packages/backend/src/services/transaction-preview.ts) 返回实际实体/字段与 Writer 文件差异、保存前置提示。MCP 映射同一入口，单项 schema 由 contracts resources 发现。 |
| 7. 正式诊断与恢复建议 | [diagnostics.ts](../packages/backend/src/diagnostics.ts) 提供 102 个正式码的 owners/文档/恢复建议；生成器检查所有正式类型的覆盖与归属。响应、MCP 和[逐码文档](../docs/guide/diagnostics.md) 共用目录，不自动修复或降低安全门槛。 |
| 8. 安装版本文档与薄 Skill | [Backend docs 入口](../packages/backend/src/docs.ts) 与生成语料随包分发，CLI docs 和 MCP resources 读同一版本/摘要；[安装文档指南](../docs/guide/installed-docs.md) 说明离线查询、doctor 和薄 Skill。真实 tarball 消费者检查内容、版本、CLI/MCP 一致性与打包遗漏。 |
| 9. 真实 Agent 任务评测 | [十个任务](./evals/tasks.json)、[判定器](../scripts/agent-eval-checks.mjs) 与隔离 MCP/artifact 宿主按实际工程、文件、像素及安全停止判定；真实模型与 reference 分开。历史 [阶段 9 记录](./evals/stage-9-2026-09-05.json) 保留 10/10 模型运行及前期失败，本次未重新运行模型。 |
| 10. setup 与环境诊断 | 推荐 Node 与精确 pnpm、repo:setup/doctor 已登记；setup 复用原生 Git 与 frozen 安装，不修改全局工具。产品 [doctor](../packages/cli/src/commands/doctor.ts) 实测 Sharp PNG/JPEG 编解码、临时/显式输出目录和项目状态，不建会话、锁或探针。实际 Node/Web 行为由安装消费者证明。 |
| 11. 预校验职责与架构上下文 | `943025f` 将预校验拆到 [preflight](../packages/core/src/uam/preflight)，保留公开门面、顺序投影、原子失败及 104 个声明/20 个移动分支的原行为；跨域诊断测试与既有事务测试通过。`362cd19` 收敛[中英架构总览](../docs/architecture-overview.md)，以职责/状态/边界导航正式文档。 |
| 12. 真实发布消费者与 PR 变更声明 | [pack-smoke](../scripts/pack-smoke.mjs) 在仓库外安装五包，不使用 workspace 或环境 loader；检查 ESM/CJS、严格类型、CLI/MCP、编辑保存与浏览器。 [release workflow](../.github/workflows/release.yml) 在 publish 前检查同一组将发布的 tarball；[PR 模板](../.github/pull_request_template.md) 记录包/契约/版本/双语日志/验证影响，无需引入 Changesets。 |
| 13. 可运行用户示例 | [examples](../examples/README.md) 包含 inspect/validate、revision-checked Backend 编辑保存、发布/受限恢复、正式 MCP stdio client 与真实 browser storage。文档引用真实代码，安装消费者运行它们；fixtures 与用户示例保持分离，不移动固定上游子模块。 |

## 此次验证与边界

- Core 代码批次的 Node 24.20.0 `check:ci` 通过：533 项 AVA、32 项仓库自测、契约/文档检查及文档构建。
- 收尾时 PR 模板的站点外 Markdown 链接曾使 VitePress 构建失败；改为仓库路径说明后，完整 `check:ci` 再次通过（59 份文档检查），原五包消费者现场保留为 `C:/Users/Derek/AppData/Local/Temp/ofgui-consumer-lFT6m6`。最后仅调整架构图方向，已通过真实 Chromium 渲染及再次文档构建。
- 五包 0.3.1 tarball 在 Node 24.20.0 与 20.20.2 均通过：14 ESM / 14 CJS 入口、严格类型、10 个 Web/Worker 导出打包、CLI/MCP、示例与 reference 10/10。
- 两个安装消费者均运行真实 Chromium 153.0.8010.12：OPFS 精确预演/修改/保存/刷新、RGBA、活跃标签互斥、终止释放锁和路径拒绝；不冒充用户 Folder 交互授权或 FairyGUI 渲染验证。
- 本地保留现场为 `C:/Users/Derek/AppData/Local/Temp/ofgui-consumer-cwkyFL`（Node 24 与原始 artifacts）和 `C:/Users/Derek/AppData/Local/Temp/ofgui-consumer-YQVpcl`（同组 artifacts 的 Node 20）。`app/reference-evaluations/report.json` 与 `app/browser-evidence.json` 是原始证据，不需要这些机器路径才能运行仓库。
- 真实模型 10/10 属于已提交的阶段 9 历史记录，不能算成本次新版本/新归档的模型复验，也不能换算为长期成功率。
- 协议结论仍需可公开核验的对应版本来源及测试证据；公开 fixture 状态通过不代表所有协议已获验证。缺少决定性证据时明确标为未验证并停止该项判断，不把跳过算作通过。
- 不采用示例目录的机械复制、逐 operation 工具膨胀、AVA 迁移或新 registry 调度层。已完成可发现、可运行、可防漂移与真实消费者验证的工程闭环；没有执行 push、merge、tag 或发布。
