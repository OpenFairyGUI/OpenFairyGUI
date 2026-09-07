# Backend

先读[根指引](../../AGENTS.md)。下面路径与命令均相对仓库根目录。

- 响应与版本契约：`packages/backend/src/contracts.ts`；方法与能力类型：`packages/backend/src/runtime/contracts.ts`；能力声明：`packages/backend/src/runtime/capabilities.ts`。
- `packages/backend/src/runtime.ts` 保持薄门面，具体职责位于 `packages/backend/src/services/`。复用现有 service，不增加平行调度层。
- Authoring 复用 Core/Functions 入口；mutation 必须保留 session 排他执行、expectedRevision、失败不提交与保存回滚语义。
- `packages/backend/src/path-policy.ts` 与 storage 边界负责路径安全。MCP roots 不能替代 allowed roots / realpath 验证。
- 根入口保持 browser-safe；Node 能力留在 `packages/backend/src/node.ts`。契约或能力变化同步版本策略、MCP 映射测试和架构说明。
- `packages/backend/src/docs.ts` 是独立随包文档入口；不把整份 schema 引入 runtime 根入口。工作流/薄 Skill 在 `packages/backend/docs/`，包版本或原文修改后运行 `pnpm contracts:generate`，不手改 `src/generated/`。
- 运行 `pnpm test:changed`，确保包含 Backend、CLI、MCP；完整验收使用 `pnpm check:ci`。
