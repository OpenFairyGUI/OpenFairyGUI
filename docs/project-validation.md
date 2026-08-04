# 工程验证

OpenFairyGUI 的工程验证用于回答：当前工程能否被可靠读取、保持正式 UAM 约束，并在当前宿主已提供的能力范围内确认资源完整性。验证只读，不修改工程，也不等同于发布成功证明。

## 验证范围

| 层级 | 当前检查 |
|---|---|
| 工程读取 | `.fairy`、主/分支 `package.xml`、component XML 与 settings JSON 是否可读和可解析；同时检查 Desktop 按 `Int32` 读取的几何字段，无法解析或不兼容的内容会成为诊断，不再静默丢失 |
| UAM 完整性 | 正式字段约束、ID/包名唯一性、路径安全、大小写不敏感文件系统上的输出冲突、资源文件夹关系，以及组件、字体、骨骼、列表、gear、transition 等资源引用 |
| 源文件 | 声明源文件是否存在、可读、非空；PNG/JPEG/SVG 的可移植检查与 MovieClip JTA 解析 |
| 宿主解码 | Node 入口使用 Sharp 解码图片；Web 入口复用浏览器 Canvas/ImageBitmap 解码能力 |

验证不执行自动修复、风格 lint、发布设置预检、图集生成、二进制封包或运行时加载。需要确认发布产物时，仍应单独运行目标宿主的 publish 流程。

## 报告契约

`ProjectValidationReport` 包含：

- `status: 'valid' | 'invalid' | 'incomplete'`
- `complete`: 当前入口是否完成了它请求的全部检查
- `diagnostics`: 按属性路径稳定排序的 `ProjectDiagnostic[]`

`invalid` 表示发现确定错误；`incomplete` 表示未发现确定错误，但缺少源字节或宿主解码能力，不能宣称完整通过。诊断提供稳定 `code`、`severity`、`path`、`message`，并在适用时提供 `packageId`、`resourceId`、`nodeId` 和 `sourcePath`。

原始 component XML 的 `size`、`xy`、`restrictSize`、边距、`clipSoftness`、设计图偏移及 `gearXY` / `gearSize` 整数部分若不是有符号 32 位整数，会报告 `desktop_incompatible_geometry`。缩放、旋转、透明度、pivot、skew 和 gear 百分比等浮点字段不受此规则限制；检查只报告问题，不修改源工程。

## API

Node 工程目录使用完整入口：

```ts
import { validateProjectNode } from '@openfairygui/functions/node';

const report = await validateProjectNode('./MyProject/MyProject.fairy');
```

自定义读写宿主可以保留读取诊断，再与 UAM 检查组合：

```ts
import { liftDocumentToUamProject } from '@openfairygui/core';
import { validateProject } from '@openfairygui/functions';

const read = await io.readProjectDetailed('Project.fairy', { hydrateResourceBytes: true });
const report = read.document
  ? validateProject(liftDocumentToUamProject(read.document), {
      readDiagnostics: read.diagnostics,
      complete: read.complete,
      validateSources: true,
    })
  : { status: 'invalid', complete: false, diagnostics: read.diagnostics };
```

已水合 UAM 的浏览器图片解码使用 `validateProjectWeb(project)`。若只需要 UAM 结构和引用检查，使用 `validateProject(project)`。

## CLI、Backend 与 MCP

```bash
ofgui validate ./MyProject
ofgui validate ./MyProject --json
```

CLI 退出码为：`0` 有效、`1` 无效、`2` 验证不完整。`--json` 只向标准输出写入报告。

Backend 的 `validateSession({ sessionId })` 验证当前 revision 的 authoritative UAM，并把同一批诊断镜像到 response meta。MCP 工具 `openfairygui_backend_validate_session` 只做该方法的薄映射，不建立第二套规则。
