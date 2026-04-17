# OpenFairyGUI

[![npm core version](https://img.shields.io/npm/v/@openfairygui/core.svg)](https://www.npmjs.com/package/@openfairygui/core)
[![npm cli version](https://img.shields.io/npm/v/@openfairygui/cli.svg)](https://www.npmjs.com/package/@openfairygui/cli)
[![License](https://img.shields.io/badge/license-MIT-007ec6.svg)](./LICENSE)
[![GitHub](https://img.shields.io/badge/github-OpenFairyGUI%2FOpenFairyGUI-24292e.svg)](https://github.com/OpenFairyGUI/OpenFairyGUI)

[English](./README_EN.md)

*面向 Node.js 与自动化工作流的 FairyGUI 工程 SDK。*

## 介绍

OpenFairyGUI 用于读取、编辑、写回和发布 FairyGUI 工程数据。和编辑器侧“所见即所得”的交互式工作流不同，OpenFairyGUI 更适合脚本化、批处理、生成式工具链和 CI/CD 场景。

它当前覆盖的核心能力包括：

- 读取和写入 FairyGUI 工程目录
- 读取和写入发布二进制包
- 通过代码检查、修改和转换文档模型
- 从发布目录重建可继续编辑的 FairyGUI 工程
- 为自动化流程提供可脚本调用的 CLI

## 包结构

本仓库采用 `pnpm workspace` + `Lerna` 的 monorepo 组织方式，当前包含以下包：

| 包 | 作用 |
|---|---|
| `@openfairygui/core` | 属性图、文档模型、工程读写、二进制读写、发布产物还原 |
| `@openfairygui/functions` | 发布、检查、转换等高层函数能力 |
| `@openfairygui/cli` | 命令行工具 |
| `@openfairygui/test-utils` | 测试辅助与夹具 |

## Scripting API

安装脚本侧包：

```bash
npm install --save @openfairygui/core @openfairygui/functions
```

典型用法是先读入工程，再基于 `Document` 做变换、发布或写回：

```ts
import { NodeIO } from '@openfairygui/core';
import { inspect, publish } from '@openfairygui/functions';

const io = new NodeIO();
const doc = await io.readProject('./MyProject/MyProject.fairy');

const report = inspect(doc);
console.log(report.projectType, report.totals.packages);

await doc.transform(publish({
  output: './release',
}));
```

如果你更关心“发布产物 -> 工程”的恢复链路，也可以直接调用：

```ts
import { NodeIO, ProjectType } from '@openfairygui/core';

const io = new NodeIO();
await io.restorePublishedProject('./release', './restored-project', {
  projectType: ProjectType.Unity,
});
```

## Command-line API

安装 CLI：

```bash
npm install --global @openfairygui/cli
```

查看帮助：

```bash
ofgui --help
```

常见用法：

```bash
# 检查工程
ofgui inspect ./MyProject

# 发布工程
ofgui publish ./MyProject --output ./release

# 按命令覆盖项目类型
ofgui publish ./MyProject --output ./release --project-type unity

# 从发布目录恢复工程
ofgui restore ./release --output ./restored-project

# 恢复时覆盖项目类型
ofgui restore ./release --output ./restored-project --project-type cocoscreator
```

`--project-type` 支持名称或数字 id，例如：

| 传值 | 含义 |
|---|---|
| `unity` / `0` | Unity |
| `cocoscreator` / `cocos` / `3` | Cocos Creator |
| `layabox` / `laya` / `4` | LayaBox |

## Workspace Development

如果你是在仓库内直接开发，而不是从 npm 安装，常用命令如下：

```bash
pnpm install
pnpm build
pnpm test
pnpm dev:cli --help
```

| 命令 | 说明 |
|---|---|
| `pnpm build` | 构建全部工作区包 |
| `pnpm build:cli-deps` | 构建 CLI 依赖的核心包 |
| `pnpm build:watch` | 监听模式持续构建 |
| `pnpm test` | 运行 AVA 测试 |
| `pnpm coverage` | 运行测试并生成覆盖率报告 |
| `pnpm lint` | 运行 Biome lint |
| `pnpm dev:cli` | 以开发模式运行 CLI |

## 文档

当前实现口径文档以中文维护，入口见 [docs/README.md](./docs/README.md)。

| 文档 | 说明 |
|---|---|
| [架构图说明](./docs/architecture-overview.md) | 包职责、模块边界、核心数据流 |
| [编辑器发布设置](./docs/editor-publish-settings.md) | 发布设置来源、默认值、命名规则与消费位置 |
| [发布产物还原限制](./docs/published-project-restore-limitations.md) | 仅凭发布目录重建工程时的能力边界 |
| [Project XML 属性协议](./docs/project-xml-attribute-reference.md) | `package.xml`、`component.xml` 及结构节点属性协议 |
| [Project XML DisplayList Tag 对齐](./docs/project-xml-displaylist-variants.md) | `displayList` XML tag 与 editor 类型对齐口径 |
| [二进制封包协议](./docs/fairygui-binary-package-format.md) | `.fui` / `_fui.bytes` 当前协议说明 |

## 当前状态

项目仍处于积极开发阶段。当前 API 与包内容应视为现行实现，而不是长期兼容承诺。

## License

MIT
