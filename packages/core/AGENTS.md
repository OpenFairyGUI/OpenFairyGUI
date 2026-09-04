# Core

先读[根指引](../../AGENTS.md)。下面路径与命令均相对仓库根目录。

- 模型归属：`packages/core/src/properties/` 是正式属性；`packages/core/src/uam/model.ts` 是公开 UAM 模型。
- 事务契约：`packages/core/src/uam/transaction-contracts.ts`；稳定门面：`packages/core/src/uam/transaction.ts`。支持性检查不等于完整执行预演。
- 工程 XML 的 reader、writer 与字段元数据在 `packages/core/src/io/`。新字段按真实标签归属建模，同步 reader、writer、UAM bridge 和语义往返测试。
- Core 不依赖 Backend、MCP 或 Node 宿主；Node/Web 能力从对应入口或注入接口获取。不要把二进制 sourceBytes 经 JSON clone 处理。
- Core 改动影响全部下游；运行 `pnpm test:changed`，提交前运行 `pnpm check:ci`。具体测试组与关联文档由根影响映射维护。
