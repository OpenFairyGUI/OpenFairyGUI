# 包与工具

| 包 | 用途 |
|---|---|
| `@openfairygui/core` | 属性图、文档模型、工程读写与二进制读写等底层能力。 |
| `@openfairygui/functions` | 检查、转换、发布、还原和其他高层工作流。 |
| `@openfairygui/backend` | 有状态工程会话、存储适配与运行时服务。 |
| `@openfairygui/mcp` | 将 backend runtime 暴露为 MCP tools、resources 与 prompts 的薄适配层。 |
| `@openfairygui/cli` | 面向脚本和终端的命令行入口。 |

## 选择入口

- Agent 接入：安装 `mcp`，通过随包文档和工具发现查询、预演并编辑工程；`cli` 提供同一份文档与独立终端工作流。配置见[快速开始](./getting-started.md)。
- 脚本与 CI：使用 `cli` 执行检查、验证、发布及可信本地产物的受限恢复；库式 Node 工作流使用 `core` 和 `functions`。
- 编辑器与自定义宿主：使用 `backend` 管理 session、revision 与保存，通过 UAM transaction 编辑；`core` 提供底层模型与 I/O。

MCP 是 Backend 会话能力的适配层；发布与恢复使用显式授权的 CLI / Node 工作流。保持 OpenFairyGUI 包的安装版本与通道一致。

## 公开入口

| 入口 | 使用边界 |
|---|---|
| `@openfairygui/core` | 运行时无关的属性模型、`Document`、UAM、二进制协议与可注入文件系统的工程读写。 |
| `@openfairygui/core/uam` | 聚焦 UAM 模型、规范化、校验、事务和 lift/materialize。 |
| `@openfairygui/core/project-io` | 使用调用方提供的 `FileSystem` 读写工程，不绑定 Node 或浏览器宿主。 |
| `@openfairygui/core/node` | Node.js 文件系统入口 `NodeIO`。 |
| `@openfairygui/core/web` | 浏览器工程读写入口 `WebIO` 与 File System Access API 适配器。 |
| `@openfairygui/core/image-validation-worker` | 浏览器图片校验 Worker 的独立打包入口，不是普通业务模块入口；包元数据保留其消息监听器初始化副作用。 |
| `@openfairygui/functions` | 运行时无关的检查、校验、变换、发布内核、代码生成与受限恢复流程。 |
| `@openfairygui/functions/uam` | 将 UAM 事务错误转换为适合应用消费的结构化结果。 |
| `@openfairygui/functions/node` | Node 发布与恢复适配器 `publishNode()`、`restoreNode()`；Node publish 插件也只在此入口加载。 |
| `@openfairygui/functions/web` | 浏览器发布适配器 `publishBrowser()`；不加载 Node 插件。 |
| `@openfairygui/backend` | 使用宿主注入能力的 backend runtime、会话、存储与能力契约。 |
| `@openfairygui/backend/node` | Node 文件系统、锁与 backend runtime 默认适配器。 |
| `@openfairygui/backend/docs` | 独立的 browser-safe 安装版本文档、操作/方法 schema 与诊断查询；CLI/MCP 共用，见[安装版本文档](./installed-docs.md)。 |
| `@openfairygui/mcp` | backend runtime 的 MCP server、tools、resources 与 prompts 适配层。 |
| `@openfairygui/mcp/stdio` | 本地 MCP stdio transport 入口。 |
| `@openfairygui/cli` | `ofgui` 命令行程序，不提供库式子路径入口。 |

浏览器代码应使用运行时无关入口或明确的 `/web` 入口，不要从 `/node`、`/stdio` 或 CLI 入口引入 Node.js 能力。

[打开自动生成的 API Reference](/api/)
