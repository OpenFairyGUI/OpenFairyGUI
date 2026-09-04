# MCP

先读[根指引](../../AGENTS.md)。下面路径与命令均相对仓库根目录。

- Tool/schema：`packages/mcp/src/tool-definitions.ts`；分发：`packages/mcp/src/tool-handler.ts`；resources/prompts 在同目录的对应文件。
- MCP 是 Backend 的薄适配，不拥有事务语义、selector 语法、路径策略或 publish/restore 服务。
- 方法变更同步 tool 映射、input/output schema、annotations、resources/prompts 和集成测试；保持输入数量/深度/字节预算及稳定错误 envelope。
- 默认是本地 stdio，不假设 HTTP 端口。stdout 只能承载协议消息；日志使用 stderr。
- 运行 `pnpm test:changed` 覆盖 MCP；`packages/mcp/test/stdio-smoke.integration.test.ts` 检查构建入口，不代表已安装 tarball 的消费者测试。
