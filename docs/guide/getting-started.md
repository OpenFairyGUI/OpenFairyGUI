# 快速开始

OpenFairyGUI 为 Agent、脚本与编辑器宿主提供 FairyGUI 工程能力。Node.js 宿主要求 22+；先选择自己的入口：

| 目标 | 入口 |
|---|---|
| 让 Agent 查询、预演和编辑工程 | MCP 与安装版本文档，按本页从安装开始 |
| 在终端或 CI 中检查、发布工程 | [CLI](#终端工作流) |
| 将工程能力接入自己的工具 | [TypeScript SDK](#typescript-sdk) 与[包与工具](./packages.md) |

## 安装与核对版本

在用于 Agent 工具的目录执行，安装稳定版并保存精确版本：

```bash
npm install --save-exact @openfairygui/cli @openfairygui/mcp
./node_modules/.bin/ofgui --version
./node_modules/.bin/ofgui docs ls --json
```

macOS / Linux 可直接使用上面的命令；Windows PowerShell 将 `./node_modules/.bin/ofgui` 换成 `.\node_modules\.bin\ofgui.cmd`。下文均使用该本地安装，不依赖全局命令。

核对 CLI 版本与文档索引的 `result.packageVersion`；索引同时给出契约版本、能力 schema 和正文 URI。版本不一致时先由宿主统一安装，再进行编辑。

需要试用预发布能力时，将安装命令中的两个包换成 `@openfairygui/cli@next`、`@openfairygui/mcp@next`，仍保存精确版本。`readSessionState` / `readResourceBytes` 从 `0.5.0-alpha.1` 起提供。各包应使用同一版本与通道，操作依据来自当前安装语料。

## 连接本地 MCP

在 MCP 客户端中添加下列配置。替换两个绝对路径：第一个指向安装目录内的包启动器；第二个是授权访问的工程目录。Windows 可用 `C:/Work/...` 格式。

```json
{
  "mcpServers": {
    "openfairygui": {
      "command": "node",
      "args": [
        "/absolute/path/to/agent-tools/node_modules/@openfairygui/mcp/bin/ofgui-mcp.cjs"
      ],
      "env": {
        "OPENFAIRYGUI_ALLOWED_PROJECT_ROOTS": "/absolute/path/to/MyProject"
      }
    }
  }
}
```

这是常见的 JSON 客户端配置示例，具体格式以客户端为准。客户端需能找到 `node`，否则将 `command` 换成 Node 的绝对路径。服务通过本地 stdio 通信，无需 HTTP 端口。

连接后读取 `openfairygui://docs/index`，按索引读取工作流、方法和 operation schema，再发现可用工具与能力。终端对应入口为：

```bash
./node_modules/.bin/ofgui docs cat workflow
./node_modules/.bin/ofgui docs schema setDisplayNodeProps --json
./node_modules/.bin/ofgui docs cat methods/queryEntity --json
./node_modules/.bin/ofgui docs diagnostic stale_write --json
```

这些查询读取随包文档，无需访问网站。`ofgui docs cat skill` 返回导航用 Skill，供宿主阅读或启用。完整格式见[安装版本文档](./installed-docs.md)。

## 完成首个编辑任务

没有现成工程时，可按[可运行示例](./examples.md)运行读取示例，生成独立临时工程。将输出的 `projectPath`（`.fairy` 文件）的父目录设为 MCP 授权目录，并填入下方任务。

示例工程具有 `Main/MainView/title` 文本节点；使用自己的工程时，将路径、包、组件和节点名替换为实际目标：

> 将 `/absolute/path/to/MyProject` 中 `Main/MainView` 组件的 `title` 文本改为“开始游戏”，保持其他对象和资源不变。先查询目标并预演修改，再提交、验证、保存并回读。若目标不唯一、发生 revision 冲突或验证不完整，停止并报告，保留未保存修改。

工作流使用正式 Backend 能力，MCP 工具名与精确参数以发现结果和安装 schema 为准：

1. 读取能力并打开授权工程会话，从 outline 获取目标 ID，再用 `queryEntity` 查询属性与实际 revision。
2. 用当前 selector、最小操作批次和 `expectedRevision` 调用 `preflightTransaction`，查看影响。预演不会提交、保存或预留 revision。
3. 按同一 revision 调用 `applyTransaction`。遇到 `stale_write` 时刷新并重新规划，不盲目替换 revision 重试。
4. 用 `validateSession` 检查新状态，要求 `status: "valid"` 且 `complete: true`。
5. 用提交后的 revision 调用 `saveSession`，要求 `dirty: false`。保存成功后关闭会话，再重新打开工程，用 `queryEntity` 核对目标文字，完成后关闭回读会话。

其他工程语义与资源字节是否保持不变，需要具备文件读取能力的宿主独立比较保存前后的结果；未执行时应报告“未验证”。当前会话查询、`dirty: false` 或验证通过都不能替代这项比较。验证或保存失败时保留会话和未保存工作，由宿主处理原因。

[可运行示例](./examples.md)可自动创建独立临时工程，执行同一条 SDK 编辑/保存链路；真实 MCP stdio 示例演示查询与预演。这些示例随安装包消费者检查执行，无需另写一份事务语法。

要消费已提交但未保存的完整模型，在支持的版本中调用 `readSessionState`，再按它返回的 revision 用 `readResourceBytes` 读取所需主资源。响应预算、读取诊断与 `stale_read` 的处理见[契约指南](./contracts.md)。

## 终端工作流

只使用终端或 CI 时，可单独安装 CLI；若已有 OpenFairyGUI 包，保持版本与通道一致：

```bash
npm install --save-exact @openfairygui/cli
```

CLI 提供独立的只读检查与 JSON 报告：

```bash
./node_modules/.bin/ofgui doctor ./MyProject --json
./node_modules/.bin/ofgui inspect ./MyProject --json
./node_modules/.bin/ofgui validate ./MyProject --json
```

需要发布已保存工程时，显式指定输出目录：

```bash
./node_modules/.bin/ofgui publish ./MyProject --output ./release --json
```

发布及可信本地产物的受限恢复由 CLI / Node 工作流执行；MCP 提供会话编辑能力。发布前检查实际验证报告，输出目录、插件和恢复边界见[发布与恢复示例](./examples.md)。

## TypeScript SDK

在自己的宿主中安装所需包，并与已有 OpenFairyGUI 包保持同一版本。下面是稳定版命令；若前面选择了预发布通道，这里的每个包也加上 `@next`：

```bash
npm install --save-exact @openfairygui/backend @openfairygui/core @openfairygui/functions
```

有状态编辑使用 `createNodeBackendRuntime` 打开现有工程，通过 UAM transaction 预演、提交与保存。完整错误处理与回读见[编辑示例](./examples.md)；浏览器宿主入口见[包与工具](./packages.md)。

只需读取和检查文档模型时，可以使用底层 Node I/O：

```ts
import { NodeIO } from '@openfairygui/core/node';
import { inspect } from '@openfairygui/functions';

const document = await new NodeIO().readProject('./MyProject/MyProject.fairy');
const report = inspect(document);
console.log(report.projectType, report.totals.packages);
```

`Document` 是可变低层 API；公共编辑入口使用 UAM transaction。诊断处理见[诊断与恢复](./diagnostics.md)，架构与协议入口见[文档总览](../README.md)。
