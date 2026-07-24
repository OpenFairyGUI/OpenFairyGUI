# 包与工具

| 包 | 用途 |
|---|---|
| `@openfairygui/core` | 属性图、文档模型、工程读写与二进制读写等底层能力。 |
| `@openfairygui/functions` | 检查、转换、发布、还原和其他高层工作流。 |
| `@openfairygui/backend` | 有状态工程会话、存储适配与运行时服务。 |
| `@openfairygui/mcp` | 将 backend runtime 暴露为 MCP tools、resources 与 prompts 的薄适配层。 |
| `@openfairygui/cli` | 面向脚本和终端的命令行入口。 |

## 选择入口

只需读取、修改或发布工程时，从 `core` 和 `functions` 开始。需要 CLI 批处理时安装 `@openfairygui/cli`；需要会话、能力发现或 MCP 客户端集成时，再接入 `backend` 与 `mcp`。

[打开自动生成的 API Reference](/api/)
