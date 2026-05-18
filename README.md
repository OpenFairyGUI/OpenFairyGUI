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
- 通过 MCP 薄适配层暴露 backend runtime 能力

## 包结构

本仓库采用 `pnpm workspace` + `Lerna` 的 monorepo 组织方式，当前包含以下包：

| 包 | 作用 |
|---|---|
| `@openfairygui/core` | 属性图、文档模型、工程读写、二进制读写等底层能力 |
| `@openfairygui/functions` | 发布、还原、检查、转换等高层函数能力 |
| `@openfairygui/backend` | stateful backend runtime、browser-safe project session、可注入 async storage adapter、save/lock/capability 协调，以及 events/jobs/cache |
| `@openfairygui/mcp` | MCP server 薄适配层，完整映射 backend P2 工具面，并提供 resources / prompts / output schema 等客户端可用性表面 |
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

如果你需要走当前正式支持的 **Phase A UAM authoring seam**，可以直接把
`UamProject` 与显式 operation batch 交给 `@openfairygui/functions` 的薄应用接缝。
这条路径保持 `UAM-public / Document-private`，适合未来自动化 / MCP 适配继续复用，
但当前仍只覆盖 Phase A 已冻结的窄写入面，不等价于通用编辑后端。

```ts
import {
	type UamProject,
	type UamTransactionOperation,
} from '@openfairygui/core';
import { applyUamTransactionApp } from '@openfairygui/functions';

const project: UamProject = /* ... */;
const operations: UamTransactionOperation[] = [
	{
		kind: 'renameResource',
		selector: { packageId: 'pkg001', resourceId: 'img001' },
		newName: 'renamed.png',
	},
];

const result = applyUamTransactionApp({ project, operations });
if (!result.ok) {
	console.error(result.error.code, result.error.stage, result.error.message);
}
```

如果你更关心“发布产物 -> 工程”的恢复链路，也可以直接调用 `functions` 层的 restore workflow：

```ts
import { ProjectType } from '@openfairygui/core';
import { restore } from '@openfairygui/functions';
import fs from 'node:fs/promises';
import path from 'node:path';

await restore({
  inputDir: './release',
  output: './restored-project',
  projectType: ProjectType.Unity,
  fs: {
    async readFile(filePath) { return fs.readFile(filePath, 'utf-8'); },
    async readFileRaw(filePath) {
      const buf = await fs.readFile(filePath);
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    },
    async writeFile(filePath, content) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
    },
    async writeFileRaw(filePath, data) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, data);
    },
    async mkdir(dirPath) { await fs.mkdir(dirPath, { recursive: true }); },
    async readdir(dirPath) { return fs.readdir(dirPath); },
    async exists(filePath) { try { await fs.access(filePath); return true; } catch { return false; } },
    async isFile(filePath) { try { return (await fs.stat(filePath)).isFile(); } catch { return false; } },
    async resolvePath(filePath) { try { return await fs.realpath(filePath); } catch { return path.resolve(filePath); } },
    async rm(targetPath, options) { await fs.rm(targetPath, { recursive: options?.recursive ?? false, force: options?.force ?? false }); },
    join: path.join,
    dirname: path.dirname,
  },
});
```

如果你需要一个带 session / revision / save / advisory lock 的 **backend runtime**，可以使用
browser-safe 的 `@openfairygui/backend` 根入口，或通过 `@openfairygui/backend/node` 装配 Node 文件系统。
这层是 transport-neutral 的后端基础，不等价于 `packages/mcp`，也不重新定义
`core` 的 transaction 语义。当前 backend 内部分成 `read / authoring / artifact / runtime`
planes，并为所有 backend response 提供统一 metadata / diagnostics / version surface，
包括 `requestId / sessionId / revision / durationMs / warnings / diagnostics / stage`。
runtime plane 还提供 polling events、`cache.refresh` in-memory jobs、cooperative cancel，
以及 revision-bound derived read-only cache snapshot。浏览器编辑器可以通过
`createBackendStorageFileSystem` 注入 OPFS / IndexedDB / ZIP 虚拟文件系统，用于
`openProjectSession` 与 `saveSession` 的工程写回。`publish / restore` 不在 browser-safe
authoring session 内执行，capability manifest 会声明它们需要 Node bridge boundary。

```ts
import { BackendRuntime, createBackendStorageFileSystem } from '@openfairygui/backend';

const fileSystem = createBackendStorageFileSystem(browserStorage);
const runtime = new BackendRuntime();
const opened = runtime.openProjectSession({
	project: uamProject,
	storage: { fileSystem, fairyPath: 'Project.fairy' },
});
if (!opened.ok) throw new Error(opened.error.message);

await runtime.saveSession({ sessionId: opened.data.sessionId });
```

```ts
import { createNodeBackendRuntime } from '@openfairygui/backend/node';

const runtime = createNodeBackendRuntime();
const opened = await runtime.openSession({ projectPath: './MyProject' });
if (!opened.ok) throw new Error(opened.error.message);

const capabilities = runtime.getCapabilities();
console.log(capabilities.data.runtimeOwner);
console.log(capabilities.data.manifest.browserSafe);

const refresh = runtime.refreshCache({ sessionId: opened.data.sessionId });
if (refresh.ok) {
	const events = runtime.getEvents({ sessionId: opened.data.sessionId });
	console.log(refresh.data.status, events.ok ? events.data.currentSequence : 0);
}

await runtime.closeSession({ sessionId: opened.data.sessionId });
```

如果你要把当前 backend runtime 暴露给 MCP 客户端，可以使用 `@openfairygui/mcp`。
这层只做 transport adapter，不重新定义 backend / UAM 语义。当前 MCP 包除 13 个 backend P2 tools 外，
还提供 identity snapshot resources、workflow guidance prompts，以及 `structuredContent.backendResult`
的共享 output schema；MCP roots 只作为客户端上下文说明，不作为路径安全边界。

```ts
import { createOpenFairyGuiMcpServer } from '@openfairygui/mcp';

const server = createOpenFairyGuiMcpServer();
```

stdio 客户端可以使用包二进制：

```bash
ofgui-mcp
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
