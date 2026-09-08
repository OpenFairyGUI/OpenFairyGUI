# OpenFairyGUI

<p align="center"><img src="./docs/public/logo.svg" alt="OpenFairyGUI logo" width="160"></p>

[![Documentation](https://img.shields.io/badge/docs-online-0f766e.svg)](https://fairygui.dev/)
[![npm](https://img.shields.io/badge/npm-%40openfairygui%2Fmcp-cb3837.svg)](https://www.npmjs.com/package/@openfairygui/mcp)
[![License](https://img.shields.io/badge/license-MIT-007ec6.svg)](./LICENSE)

[English](./README_EN.md) · [Agent 接入指南](./docs/guide/getting-started.md) · [官网文档](https://fairygui.dev/) · [API Reference](https://fairygui.dev/api/) · [更新日志](./CHANGELOG_CN.md)

> **面向 AI Agent 与自动化工作流的 FairyGUI 工程工具链。**
> 通过 MCP、CLI 和 TypeScript SDK 读取、编辑、验证与发布工程，无需启动桌面编辑器。

> **与 FairyGUI 的关系：** OpenFairyGUI 是围绕 FairyGUI 工程格式与工具链开发的非官方开源项目，并非 FairyGUI 官方产品。“FairyGUI”名称、Logo 及相关品牌标识的权利归其权利人所有；官方产品与信息请访问 [FairyGUI 官网](https://fairygui.com/)。

让 Agent 修改指定组件的文案、位置或控制器配置，让脚本检查工程、发布运行时资源，或为自己的编辑器接入有状态工程会话。

| 你要做什么 | 从这里开始 |
|---|---|
| 让 Agent 查询和编辑工程 | [Agent 接入指南](./docs/guide/getting-started.md)：安装、MCP 配置与首个编辑任务 |
| 批量检查、CI 发布或受限恢复 | [CLI 使用](./docs/guide/getting-started.md#终端工作流)：独立安装、检查与发布 |
| 开发编辑器或自定义宿主 | [TypeScript SDK](./docs/guide/getting-started.md#typescript-sdk)：安装、UAM 编辑与宿主示例 |

## 一个 Agent 任务示例

> 将授权工程的奖励面板配置为“未达成 / 可领取 / 已领取”三种状态：用控制器和 gear 联动按钮文字、交互与已领取标记，保持其他内容不变。先查询并预演整批操作，再提交、验证、保存并回读；遇到目标不唯一、revision 冲突或验证不完整时停止并报告。

[接入指南](./docs/guide/getting-started.md#完成首个编辑任务)提供待编辑工程和三状态验收表；[奖励面板](./docs/guide/examples.md#三状态奖励面板)、[布局和入场动画](./docs/guide/examples.md#奖励面板布局与入场动画)、[模板生成卡片](./docs/guide/examples.md#从模板生成奖励卡片)均已纳入 SDK 和真实 MCP 消费者验证。

## 为什么适合 Agent

- **先查契约再调用**：operation、方法输入输出和诊断来自正式类型与安装版本文档，CLI 与 MCP 共用同一份语料。
- **修改有依据**：查询返回实际属性与 revision，预演给出变更影响，提交和保存分别检查 revision；冲突需要刷新并重新规划。
- **如实报告失败**：缺少源字节、保真写回受限、路径拒绝或验证不完整都有明确结果，宿主可保留会话并处理原因。
- **消费未保存状态**：`readSessionState` 与 `readResourceBytes` 提供有界、独立的模型和主资源字节副本，按编辑 revision 校验；读取不会触发保存或补读磁盘。

完整状态读取从 `0.5.0-alpha.1` 起提供。稳定版与预发布版的安装见[接入指南](./docs/guide/getting-started.md#安装与核对版本)，能力以当前安装文档为准，响应与版本边界见[契约指南](./docs/guide/contracts.md)。

[任务评测](./docs/guide/agent-evaluations.md)检查真实编辑、冲突处理与安全停止。CI 中的 reference 运行验证工具链和判定器；真实模型评测单独执行，不以确定性检查代替模型成功率。

## 包导航

| 包 | 用途 |
|---|---|
| [`@openfairygui/mcp`](https://www.npmjs.com/package/@openfairygui/mcp) | MCP tools、resources 与 prompts |
| [`@openfairygui/cli`](https://www.npmjs.com/package/@openfairygui/cli) | 检查、验证、发布、恢复及离线文档命令 |
| [`@openfairygui/backend`](https://www.npmjs.com/package/@openfairygui/backend) | 会话、revision、查询、预演、事务提交与保存 |
| [`@openfairygui/core`](https://www.npmjs.com/package/@openfairygui/core) | UAM、工程读写与二进制协议 |
| [`@openfairygui/functions`](https://www.npmjs.com/package/@openfairygui/functions) | 检查、验证、发布与恢复工作流 |

MCP 提供 Backend 会话编辑能力；发布已保存工程与可信本地产物的受限恢复由 CLI / Node 工作流执行。SDK 入口与宿主边界见[包与工具](./docs/guide/packages.md)，发布与恢复范围见[可运行示例](./docs/guide/examples.md)。

## 推荐项目

### FairyGUI Editor Online

[FairyGUI Editor Online](https://editor.fairygui.dev/) 是基于 OpenFairyGUI 构建的浏览器端 FairyGUI 工程编辑器，支持从本地文件夹或 ZIP 导入工程，并在浏览器中编辑、保存、发布与预览。

[在线体验](https://editor.fairygui.dev/) · [GitHub 仓库](https://github.com/OpenFairyGUI/FairyGUI-Editor-Online)

## 深入使用

| 方向 | 文档 |
|---|---|
| 接入与示例 | [Agent 接入指南](./docs/guide/getting-started.md) · [包与工具](./docs/guide/packages.md) · [可运行示例](./docs/guide/examples.md) |
| Agent 契约与诊断 | [安装版本文档](./docs/guide/installed-docs.md) · [契约查询](./docs/guide/contracts.md) · [诊断与恢复](./docs/guide/diagnostics.md) · [任务评测](./docs/guide/agent-evaluations.md) |
| 架构与协议 | [架构总览](./docs/architecture-overview.md) · [完整文档索引](./docs/README.md) · [API Reference](https://fairygui.dev/api/) |
| 参与开发 | [开发与验证](./docs/guide/development.md) · [开发任务指引](./docs/guide/task-recipes.md) |

## 当前状态与边界

0.x API 仍可能演进，稳定版与预发布版见[更新日志](./CHANGELOG_CN.md)。Node.js 宿主要求 22+；浏览器宿主使用运行时无关入口或明确的 `/web` 入口，并注入宿主能力。无法保真写回时会拒绝保存；预演或状态读取成功不保证后续写盘、发布或渲染成功。

## 本地开发

准备 Git、`.node-version` 推荐的 Node 和 `package.json` 指定的 pnpm，然后在仓库根目录执行：

```bash
pnpm repo:setup
pnpm check:ci
```

## License

[MIT](./LICENSE)
