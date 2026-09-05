# 开发任务指引

先完成[开发环境与参考资料检查](./development.md)，再选择当前任务的路径。以下源码路径均相对仓库根目录；包内约束见对应 `packages/<包名>/AGENTS.md`。不要为小改动先通读全部架构或复制另一份契约。

## 公共验证步骤

```bash
pnpm test:changed --base origin/next --list
pnpm check:fast
pnpm check:ci
```

把 base 换成实际目标分支。选择计划会包含下游和文档审查提示；快速检查不是完整回归。修改公开类型、MCP 元数据、逐码指引或随包文档后，先运行 `pnpm contracts:generate`，再验证漂移。不要手改生成快照、dist 或 API 页面。以下测试文件是定位入口，不替代影响映射选出的其他测试。

## 增加 Project XML 字段

1. 按[协议取证](#协议取证与资料搜索)确认真实标签、字段语义、默认值和来源版本；先找同标签的既有字段实现。正式模型放在 `packages/core/src/properties/` 中对应具体类或最小共享层；不要先放 `extras` 或通用 `GObject`。
2. 沿 `packages/core/src/io/project-xml-protocol.ts`、对应的 component/display XML reader/writer 追踪读写；涉及 UAM 时同步 `packages/core/src/uam/model.ts`、`bridge-lift.ts`、`bridge-materialize.ts` 与校验。只有证据表明属于二进制协议时才扩展对应 encoder/decoder。
3. 在 `packages/core/test/project-xml-protocol.test.ts` 及相关 read/write/UAM 测试增加默认值、非默认值、标签归属和往返保持断言。按 [XML 属性协议](../project-xml-attribute-reference.md)、[发布设置](../editor-publish-settings.md)或[二进制协议](../fairygui-binary-package-format.md)的实际影响同步文档；不能只证明 writer 输出了一个字符串。

## 增加 UAM operation

1. 从 `packages/core/src/uam/transaction-contracts.ts` 定义正式输入与 selector，检查 `model.ts` 的支持范围；复用同类操作，不增加 MCP 专属事务语法。
2. 从稳定门面 `transaction.ts` 追踪到 `transaction-preflight.ts` 和现有 UAM-native / Document 执行路径（`transaction-uam-apply.ts`、`transaction-document-apply.ts`），只修改实际涉及的路径。必须保留失败不修改输入、sourceBytes、批次顺序与引用约束；支持检查不能冒充完整执行预演。
3. 参考 `packages/core/test/uam-transaction-support.test.ts`、`uam-transaction-apply.test.ts`、`uam-transaction-lifecycle.test.ts` 验证成功、非法 selector、同批依赖与原子失败。新增诊断同时维护 Core 类型及 `packages/backend/src/diagnostics.ts` 的归属/恢复指引。生成[契约](./contracts.md)，再检查 Backend 预演、保存重读和 MCP wire bytes。

## 增加 Backend 方法

1. 输入/结果/错误归 `packages/backend/src/runtime/contracts.ts`；统一版本与 envelope 在 `packages/backend/src/contracts.ts`。`runtime.ts` 保持门面，逻辑进入已有 `services/` 的对应职责，不建立另一套操作内核或调度层。
2. 读操作绑定实际 revision，返回脱离会话的有界数据；写操作保留 session 排他队列、expectedRevision、失败不提交和保存回滚。宿主路径能力留在 Node/storage 边界，不进入 browser-safe 根入口。
3. 根据真实能力变化审查 `runtime/capabilities.ts` 和版本策略；参考 `packages/backend/test/revision-staleness.integration.test.ts`、`safe-editing.integration.test.ts`、`save-semantics.integration.test.ts`、`browser-entry.contract.test.ts`。同步[架构](../architecture-overview.md)，需要公开为工具的方法按下一节接入。

## 增加或调整 MCP 工具

1. 先确认 Backend 已拥有该方法。修改 `packages/mcp/src/tool-metadata.ts` 的方法映射、读写/破坏性注解、宿主字段排除和输入预算；在 `tool-handler.ts` 沿既有分发路径接入。`tool-definitions.ts` 只组装生成 schema，不手写 operation union 或宽泛输出类型。
2. 运行契约生成与漂移检查；必要时同步 resources/prompts。读写注解不授予授权，不得放宽 roots、revision 或字节预算；MCP 不获得 publish/restore 宿主执行权。
3. 参考 `packages/mcp/test/backend-tool-mapping.integration.test.ts`、`contract-schemas.integration.test.ts`、`stdio-smoke.integration.test.ts` 检查发现、无效参数、结构化错误和真实调用。用[公开 stdio 示例与 tarball 消费者](./examples.md)验证安装入口；stdout 仅承载协议，不假设 HTTP 端口。

## 排查发布与受限恢复

1. 保留原工程和失败现场；用安装版 `ofgui doctor <project> --output-dir <separate-output> --json` 区分环境/源文件问题，读 `ofgui docs diagnostic <code> --json`。doctor 不运行插件、发布或恢复，检查成功不保证写盘。
2. 从 `packages/functions/src/publish.ts` 的设置、资源闭包、atlas 与输出流程定位；Node 宿主在 `adapters/node/publish.ts`。结合[发布设置](../editor-publish-settings.md)与[插件边界](../publish-plugins.md)核对显式输出、独立代码输出和插件影响。二进制先检查语义、block 和实际消费者，不以包头 Version 差异作为失败结论。
3. 参考 `packages/functions/test/publish-output-resolution.test.ts`、`publish-dependencies.test.ts`、`restore.test.ts` 与 `packages/cli/test/artifacts.integration.test.ts`。验收实际文件清单、解码像素、重新读取和失败回滚；恢复只面向可信本地发布物与独立目标，不对用户原目录尝试 `--force`。完整[恢复边界](../published-project-restore-limitations.md)和[消费者检查](./examples.md)仍是验收依据。

## 协议取证与资料搜索

```bash
pnpm refs:status
pnpm refs:verify
pnpm refs:grep "public class UIPackage"
```

`refs:grep` 只接受一个非空、单行、区分大小写的字面量；`-` 开头及正则元字符也按文本处理。先验证必需 fixture，再搜索 Git 跟踪文本并输出路径/行号。0 表示命中，1 表示没有匹配，2 表示参数、资料或搜索错误；失败不会返回部分成功，也不自动安装、下载或重置。总结果超过 64 KiB 或 Git 输出预算时也会失败，应缩小搜索词或在已核验的来源目录使用原生 Git/rg。

来源 URL 看 `.gitmodules`，固定提交看 gitlink 和 `refs:status`，资料职责看 `references.json`。搜索结果不是协议结论。取证顺序为官方文档 → 编辑器实现（含 worker）→ 同名工程/发布物配对 → 运行时消费 → 补充材料；新版 UI 与 runtime 不能替代旧 exporter。可选本地资料仍需维护者来源与版本证明，缺少决定性材料就停止该项判断，不把跳过算作通过。
