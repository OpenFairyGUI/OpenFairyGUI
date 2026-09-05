# CLI

先读[根指引](../../AGENTS.md)。下面路径与命令均相对仓库根目录。

- 命令注册：`packages/cli/src/cli.ts`；实现：`packages/cli/src/commands/`；启动器：`packages/cli/bin/cli.cjs`。
- 复用 Functions/Backend 工作流；不在命令里复制协议校验、发布内核或会话实现。
- `packages/cli/src/contracts.ts` 拥有各命令 JSON envelope 类型；`utils/json-output.ts` 统一 stdout/错误处理。退出码为 0 成功、1 失败、2 参数错误、3 验证不完整。报告结构复用工作流类型；修改后运行 `pnpm contracts:generate`，不手改生成物。
- 新命令同时覆盖 help、错误行为、退出码与启动器测试。CLI 是可执行程序，不是库式入口。
- 运行 `pnpm test:changed`；映射还包含 Backend 中的 CLI bootstrap 测试。工作区启动成功不等于 tarball 已通过消费者验证。
