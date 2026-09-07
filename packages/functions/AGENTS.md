# Functions

先读[根指引](../../AGENTS.md)。下面路径与命令均相对仓库根目录。

- `packages/functions/src/uam-transaction.ts` 是应用级错误封装，不拥有第二套 selector、事务语法或执行内核。
- 发布与恢复入口分别为 `packages/functions/src/publish.ts`、`packages/functions/src/restore.ts`；宿主入口为 `packages/functions/src/node.ts`、`packages/functions/src/web.ts`。
- Node 插件与 Node 文件系统能力不能进入 Web 入口。保持显式输出目录的原子性、回滚和路径边界。
- restore 是可信发布物的受限恢复，不承诺还原全部源工程语义；二进制差异按语义和 block 判断，不只比较包头版本。
- 运行 `pnpm test:changed` 覆盖工作流及 Backend/CLI/MCP 下游；发布设置、输出结构或协议变化必须同步根指引指定文档。
