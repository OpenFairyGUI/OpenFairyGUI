# MCP

先读[根指引](../../AGENTS.md)。下面路径与命令均相对仓库根目录。

- 工具元数据：`packages/mcp/src/tool-metadata.ts`；schema 由 Core/Backend 类型经 `scripts/generate-contracts.mjs` 生成，`packages/mcp/src/tool-definitions.ts` 仅组装；分发：`packages/mcp/src/tool-handler.ts`。不手写平行 operation union 或宽泛结果 schema。
- 修改契约后运行 `pnpm contracts:generate`；`pnpm contracts:check` 同时检查快照、operation/方法完整性与双语表格。二进制仅在生成的正式字段路径转换，不改写扩展 JSON。
- MCP 的 Backend 工具是薄适配，不拥有事务语义、selector 或路径策略。可选发布工具只调用显式注入的宿主能力，不在 MCP 中实现 publish/restore 内核。
- schema 和离线语料从 `@openfairygui/backend/docs` 读取；生成文件在 `packages/backend/src/generated/`。CLI/MCP 不各维护一份操作说明或诊断指南。
- 方法变更同步 tool 映射、input/output schema、annotations、resources/prompts 和集成测试；保持输入数量/深度/字节预算及稳定错误 envelope。
- 默认是本地 stdio，不假设 HTTP 端口。stdout 只能承载协议消息；日志使用 stderr。
- 运行 `pnpm check:fast --base origin/next` 覆盖 MCP；`packages/mcp/test/stdio-smoke.integration.test.ts` 检查构建入口，不代表已安装 tarball 的消费者测试。

验证基准使用实际 PR 目标；离线验证与完整检查的边界见[开发指南](../../docs/guide/development.md#离线验证)。

MCP 默认握手给出文档 → outline → query → preflight → apply → validate → save → close 的顺序。openfairygui_docs_read 供只支持工具的客户端读取安装语料。正式二进制输出是 structuredContent.backendResult 中的 base64，文本仅给摘要；输入仍按生成契约使用字节数组。显式注入 publish 回调才注册 openfairygui_host_publish，路径授权、输出范围和插件策略归宿主；默认 stdio 不开启发布。
