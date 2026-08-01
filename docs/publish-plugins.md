# Publish 插件

本文记录 OpenFairyGUI Node 发布链路当前支持的插件口径。这里的插件只面向
OpenFairyGUI 自动化发布链路，不等同于 FairyGUI 编辑器插件。

## 宿主边界

只有 Node adapter（`@openfairygui/functions/node` 的 `publishNode()`）会从工程 `plugins/` 目录自动发现和加载 publish 插件。

- 低层 `publish()` 内核不访问 Node 文件系统；它只执行调用方通过 `PublishOptions.plugins` 注入的 hooks。
- `publishBrowser()` 不注入插件，因此 browser-safe 发布不会加载 Node 插件。
- `genCode` 仍是通用发布后的处理能力；Node adapter 默认启用，browser adapter 默认关闭。

## 插件目录

`publishNode()` 默认从工程根目录下的 `plugins/` 目录加载 publish 插件：

```text
MyProject/
  MyProject.fairy
  assets/
  plugins/
    my-openfairygui-plugin/
      package.json
      index.mjs
```

读取工程后，`publishNode()` 会优先按文档的工程根目录查找该目录。若文档没有工程根目录，
但传入的 `assetsPath` 可定位到工程根目录，则按该根目录查找；两者都不可用时不加载插件，
发布流程继续执行。

## Manifest

每个 OpenFairyGUI publish 插件必须放在独立子目录中，并提供 `package.json`：

```json
{
  "name": "my-openfairygui-plugin",
  "main": "index.mjs"
}
```

当前规则：

| 字段 | 规则 |
|---|---|
| `name` | 必填，用于日志和插件标识 |
| `main` | 必填，必须解析到当前插件目录内部 |

缺少必要字段、入口越界、入口加载失败或不符合 OpenFairyGUI 插件 API 的目录会被跳过。
跳过插件不会阻断发布流程。

## 插件 API

插件可以使用 default object export：

```js
export default {
  async genCode(doc, settings, options) {
    // custom code generation
  },
};
```

也可以使用 named export：

```js
export async function genCode(doc, settings, options) {
  // custom code generation
}
```

当前支持的 hook：

| Hook | 签名 | 说明 |
|---|---|---|
| `onPublishStart` | `(doc, options)` | 发布主流程开始前执行 |
| `genCode` | `(doc, settings, options)` | 代码生成阶段执行 |
| `onPublishEnd` | `(doc, options)` | 发布主流程结束前执行 |

`genCode` 的参数含义：

| 参数 | 说明 |
|---|---|
| `doc` | 当前 `Document` |
| `settings` | 已解析并补齐默认值的代码生成设置 |
| `options` | 发布时传入的代码生成上下文，包含 `fs`、`packages`、`basePath`、`plugins` 等 |

## 生命周期与降级规则

当前执行顺序：

```text
onPublishStart -> built-in publish preflight -> atlas / binary publish -> genCode -> onPublishEnd
```

`onPublishStart` 接收宿主的可写文件系统，并且会在 OpenFairyGUI 内置发布 preflight 之前执行，以便插件对 `Document` 的修改进入本次发布。插件在这个 hook 中产生的文件或其他外部副作用不属于内置发布的零输出保证，也不会在后续 preflight 或发布失败时自动回滚。需要失败时保持零副作用的插件应延后写入，或自行使用临时目录和提交步骤。

代码生成阶段的规则：

| 场景 | 行为 |
|---|---|
| 没有 `genCode` 插件 | 使用 OpenFairyGUI 内置代码生成 |
| 至少一个 `genCode` 插件成功执行 | 视为插件已接管代码生成，跳过内置代码生成 |
| `genCode` 插件执行失败 | 记录 warning，继续尝试其他插件 |
| 所有 `genCode` 插件都失败 | 回退到内置代码生成 |
| publish hook 执行失败 | 记录 warning，不阻断发布 |

## 与 FairyGUI 编辑器插件的关系

OpenFairyGUI publish 插件和 FairyGUI 编辑器插件不是同一种插件协议，不能直接通用。

两类插件可以放在相同的 `plugins/` 目录下，不会互相影响：

- OpenFairyGUI 只按本文档的 manifest 与 API 约定加载 publish 插件。
- FairyGUI 编辑器按编辑器自身的插件规则加载编辑器插件。
- 不符合 OpenFairyGUI publish 插件约定的目录会被跳过，不应影响自动化发布。

如果同一个功能需要同时支持 FairyGUI 编辑器和 OpenFairyGUI 自动化发布，需要分别开发
两套插件入口或适配层。两边可以共享内部业务代码，但插件入口、生命周期和 API 契约必须
分别实现。

## 当前限制

- 插件加载依赖 Node 环境。
- 插件不属于 browser-safe authoring session 的能力。
- 插件 API 以当前实现为准，不承诺与 FairyGUI 编辑器插件 API 兼容。
