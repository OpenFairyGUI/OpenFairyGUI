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

正式版 `0.5.0` 已提供 `readSessionState` / `readResourceBytes`。需要试用预发布版本时，将安装命令中的两个包换成 `@openfairygui/cli@next`、`@openfairygui/mcp@next`，仍保存精确版本。各包应使用同一版本与通道，操作依据来自当前安装语料。

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

### 最小连接检查

让 Agent 读取 `openfairygui://docs/index`，报告安装版本，发现工具并读取 Backend capabilities；能返回与本地 CLI 一致的版本及可用方法，即完成连接检查，无需修改工程。然后按索引读取工作流、方法和 operation schema。终端对应入口为：

```bash
./node_modules/.bin/ofgui docs cat workflow
./node_modules/.bin/ofgui docs schema setDisplayNodeProps --json
./node_modules/.bin/ofgui docs cat methods/queryEntity --json
./node_modules/.bin/ofgui docs diagnostic stale_write --json
```

这些查询读取随包文档，无需访问网站。`ofgui docs cat skill` 返回导航用 Skill，供宿主阅读或启用。完整格式见[安装版本文档](./installed-docs.md)。

## 完成首个编辑任务

主任务是把一个静态奖励面板改成由控制器驱动的三状态组件，一次编辑同时覆盖控制器、文字、按钮交互和显示条件。使用稳定版 `0.5.0` 即可完成本任务。

### 准备待编辑工程

按[可运行示例](./examples.md)将 `examples/` 复制到仓库外并执行 `npm install`，再运行：

```bash
node reward-panel-states/index.mjs --create
```

命令只创建独立临时工程，尚未配置三状态。将输出 `projectPath`（`.fairy` 文件）的父目录设为 `OPENFAIRYGUI_ALLOWED_PROJECT_ROOTS`，更新配置后重启 MCP 连接，并在任务中填入实际 `projectPath`。保留该路径供编辑器打开检查；示例不会覆盖用户工程。

若只想排查工具调用，可先运行[只读 MCP 示例](./examples.md#mcp-stdio-客户端)；[单字段编辑示例](./examples.md#带-revision-的修改、保存与回读)保留为最小编辑检查。

### 交给 Agent 的任务

> 在 `<projectPath>` 的 `Main/RewardPanel` 中新增 `rewardState` 控制器，页面为 `Locked`、`Claimable`、`Claimed`，初始为 `Locked`。通过 gear 让 `claimButton` 在三页分别显示“未达成”“领取奖励”“已领取”，只有 `Claimable` 页可交互且不置灰；让 `claimedMark` 仅在 `Claimed` 页显示。保持现有布局、其他组件和资源字节不变。先查询目标并预演整批操作，再一次提交、验证、保存并重新打开核对。若目标不唯一、已有同名控制器、revision 冲突或验证不完整，停止并报告，保留已提交但未保存的修改。

验收目标：

| `rewardState` 页面 | `claimButton` 文字 | `grayed` / `touchable` | `claimedMark` |
|---|---|---|---|
| `Locked`（初始页） | 未达成 | `true` / `false` | 隐藏 |
| `Claimable` | 领取奖励 | `false` / `true` | 隐藏 |
| `Claimed` | 已领取 | `true` / `false` | 显示 |

这里配置的是界面状态。页面切换由编辑器预览或宿主驱动；奖励发放、领取条件和点击后自动切页属于业务逻辑。

### 编辑与验收流程

工作流使用正式 Backend 能力，MCP 工具名与精确参数以发现结果和安装 schema 为准：

1. 打开授权工程会话，从 outline 获取包、组件和节点的唯一 ID，用 `queryEntity` 查询当前属性与实际 revision，并检查是否已有 `rewardState`。
2. 按安装 schema 组装一个 `addController` 和三个 `addGear`（`text`、`look`、`display`），用同一 `expectedRevision` 调用 `preflightTransaction`。检查文件影响仅涉及 `Main/RewardPanel.xml`；预演不会提交、保存或预留 revision。
3. 按同一 revision 调用 `applyTransaction`。遇到 `stale_write` 时刷新并重新规划，不盲目替换 revision 重试。
4. 用 `validateSession` 检查新状态，要求 `status: "valid"` 且 `complete: true`。
5. 用提交后的 revision 调用 `saveSession`，要求 `dirty: false`。保存成功后关闭会话，再重新打开工程，用 `queryEntity` 核对控制器、三页及 gear 配置，完成后关闭回读会话。
6. 在编辑器或实际 FairyGUI 运行时逐页切换 `rewardState`，按上表检查文字、置灰、交互和显示状态。没有执行这一步时，界面效果与点击行为应标为“未验证”。

其他工程语义与资源字节是否保持不变，需要具备文件读取能力的宿主独立比较保存前后的结果；未执行时应报告“未验证”。当前会话查询、`dirty: false` 或验证通过都不能替代这项比较。验证或保存失败时保留会话和未保存工作，由宿主处理原因。

[奖励面板示例](./examples.md#三状态奖励面板)提供完整 SDK 实现；消费者检查将同一编辑函数分别接到 SDK 与真实 MCP stdio，独立比较保存前后的完整 UAM 和文件字节。检查覆盖四个预期操作、重新打开与重复任务拒绝，不等同于 Agent 模型成功率或 FairyGUI 界面验收。

### 进阶案例

完成主任务后，可继续执行 B，或用独立模板工程运行 C：

| 方向 | 任务与验收重点 |
|---|---|
| B · 视觉改版 | [布局与入场动画示例](./examples.md#奖励面板布局与入场动画)：将面板调整为 420 × 320，一批七个操作修改布局并新增 0.4 秒入场动画，保留三状态配置；提供前后发布产物、实际渲染截图与验收表。 |
| C · 组件生成 | [模板生成奖励卡片示例](./examples.md#从模板生成奖励卡片)：以三个 `addComponent` 生成不同标题和图标的导出组件，共用一个 Label 模板与现有图片；包含原模板/文件保持不变的独立比较及实际渲染截图。 |

若宿主需要读取生成后尚未保存的完整模型，正式版 `0.5.0` 可用 `readSessionState`，再按返回 revision 调用 `readResourceBytes` 读取所需主资源。响应预算、读取诊断与 `stale_read` 的处理见[契约指南](./contracts.md)。

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
