# OpenFairyGUI

[English](./README_EN.md)

OpenFairyGUI 是一个面向 FairyGUI 项目的无头创作 SDK。

本仓库采用 `pnpm workspace` + `Lerna` 的 monorepo 组织方式，目前包含以下包：

- `@openfairygui/core`：属性图、文档模型，以及项目 / 二进制读写能力
- `@openfairygui/functions`：可组合的转换函数与更高层的创作辅助能力
- `@openfairygui/cli`：构建在核心包之上的命令行工具
- `@openfairygui/test-utils`：测试与夹具共享工具

## 项目目标

OpenFairyGUI 旨在为 FairyGUI 资源与项目提供可编程工作流支持，包括：

- 读取和写入 FairyGUI 项目数据
- 读取和写入二进制包数据
- 通过代码检查、修改和转换文档
- 组合可复用的创作与发布函数
- 提供适合自动化场景的 CLI 接口

## 工作区结构

```text
packages/
  cli/
  core/
  functions/
  test-utils/
```

## 环境要求

- 推荐使用 Node.js 22 或更高版本
- `pnpm` 10.x

## 快速开始

安装依赖：

```bash
pnpm install
```

构建全部包：

```bash
pnpm build
```

运行测试：

```bash
pnpm test
```

以开发模式运行 CLI：

```bash
pnpm dev:cli
```

## 常用脚本

| 脚本 | 说明 |
|---|---|
| `pnpm build` | 构建全部工作区包 |
| `pnpm build:cli-deps` | 构建 CLI 依赖的核心包 |
| `pnpm build:watch` | 以监听模式持续构建 |
| `pnpm test` | 运行 AVA 测试集 |
| `pnpm coverage` | 运行测试并生成覆盖率报告 |
| `pnpm lint` | 运行 Biome lint 检查 |
| `pnpm dev:cli` | 以开发模式运行 CLI 入口 |

## 当前状态

项目仍处于积极开发阶段。当前 API 与包内容应视为现行实现，而不是长期兼容承诺。

## 许可证

本项目基于 MIT License 发布，详见 `LICENSE`。
