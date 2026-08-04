# OpenFairyGUI

<p align="center"><img src="./docs/public/logo.svg" alt="OpenFairyGUI logo" width="160"></p>

[![Documentation](https://img.shields.io/badge/docs-online-0f766e.svg)](https://fairygui.dev/)
[![npm](https://img.shields.io/badge/npm-%40openfairygui%2Fcore-cb3837.svg)](https://www.npmjs.com/package/@openfairygui/core)
[![License](https://img.shields.io/badge/license-MIT-007ec6.svg)](./LICENSE)

[English](./README_EN.md) · [官网文档](https://fairygui.dev/) · [快速开始](https://fairygui.dev/guide/getting-started) · [API Reference](https://fairygui.dev/api/) · [更新日志](./CHANGELOG_CN.md)

> 用 TypeScript 读取、修改和发布 FairyGUI 工程，面向脚本、CI/CD 与智能体工具链。

## OpenFairyGUI 是什么

OpenFairyGUI 是一个面向 Node.js 和自动化工作流的 FairyGUI 工程 SDK。它把工程读写、文档变换、发布以及后端会话能力拆分为可组合的 TypeScript 包，同时提供 CLI 与 MCP 接入方式。

它适合：

- 批量检查或修改 FairyGUI 工程
- 在构建流水线中发布运行时资源
- 为生成式工具、在线编辑器或智能体提供工程能力
- 分析 Project XML 与 FairyGUI 二进制包

## 主要能力

| 能力 | 说明 |
|---|---|
| 工程读写 | 读取、修改并写回 `.fairy` 工程目录与资源 |
| 二进制协议 | 读取和写入 `.fui` / `_fui.bytes` 发布包 |
| Headless authoring | 通过 `Document` 或 UAM transaction 批量修改工程 |
| 发布与恢复 | 发布运行时资源，并从可信本地产物执行受限恢复 |
| 工具集成 | 提供 CLI、stateful backend runtime 与 MCP adapter |

## 快速开始

安装脚本侧包：

```bash
npm install @openfairygui/core @openfairygui/functions
```

读取并发布一个工程：

```ts
import { NodeIO } from '@openfairygui/core/node';
import { inspect } from '@openfairygui/functions';
import { publishNode } from '@openfairygui/functions/node';

const io = new NodeIO();
const doc = await io.readProject('./MyProject/MyProject.fairy');

const report = inspect(doc);
console.log(report.projectType, report.totals.packages);

await publishNode({
  document: doc,
  assetsPath: './MyProject/assets',
  output: './release',
});
```

完整的工程写回、Web 入口和 UAM 示例见[快速开始](https://fairygui.dev/guide/getting-started)。

## 命令行

```bash
npm install --global @openfairygui/cli

ofgui inspect ./MyProject
ofgui publish ./MyProject --output ./release
```

运行 `ofgui --help` 查看全部命令和选项。

## 包导航

| 包 | 用途 |
|---|---|
| [`@openfairygui/core`](https://www.npmjs.com/package/@openfairygui/core) | 文档模型、工程读写与二进制协议 |
| [`@openfairygui/functions`](https://www.npmjs.com/package/@openfairygui/functions) | 检查、变换、发布与恢复流程 |
| [`@openfairygui/backend`](https://www.npmjs.com/package/@openfairygui/backend) | session、revision、save 与 capability runtime |
| [`@openfairygui/cli`](https://www.npmjs.com/package/@openfairygui/cli) | 命令行工具 |
| [`@openfairygui/mcp`](https://www.npmjs.com/package/@openfairygui/mcp) | backend runtime 的 MCP 薄适配层 |

包入口和 Node / Web 边界见[包与工具](https://fairygui.dev/guide/packages)。

## 文档

- [快速开始](https://fairygui.dev/guide/getting-started)
- [API Reference](https://fairygui.dev/api/)
- [架构与包边界](./docs/architecture-overview.md)
- [编辑器发布设置](./docs/editor-publish-settings.md)
- [Project XML 属性协议](./docs/project-xml-attribute-reference.md)
- [FairyGUI 二进制包格式](./docs/fairygui-binary-package-format.md)
- [全部文档](./docs/README.md)
- [English documentation](./docs/en/README.md)

## 当前状态与边界

项目目前处于 `0.2.0` alpha 阶段，API 仍可能在正式版前调整。

- Node.js 自动化流程是当前主要使用方式；浏览器宿主使用明确的 `/web` 入口和注入能力。
- UAM 无法保真写回时会拒绝保存，不会静默覆盖源工程。
- `restore` 只用于可信的本地发布产物，不是常规创作流程。

详细限制以[官网文档](https://fairygui.dev/)中的当前实现口径为准。

## 本地开发

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
```

## License

[MIT](./LICENSE)
