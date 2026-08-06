# 更新日志

[English](./CHANGELOG.md)

## 未发布

发布比较：

- 稳定线（`main`）：[v0.2.5...main](https://github.com/OpenFairyGUI/OpenFairyGUI/compare/v0.2.5...main)
- 预发布线（`next`）：[v0.3.0-alpha.4...next](https://github.com/OpenFairyGUI/OpenFairyGUI/compare/v0.3.0-alpha.4...next)

其他：

- docs：补齐双语发布记录、当前版本状态、英文整数几何协议与公开包入口说明，并将双语 Changelog 同步纳入发布约束。

## v0.3.x

### v0.3.0-alpha.4（[发布页](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.3.0-alpha.4)）

新功能：

- functions,cli：验证流程拒绝无效工程值，不再把严格校验失败的工程报告为可安全使用。[#101](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/101)

### v0.3.0-alpha.3（[发布页](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.3.0-alpha.3)）

新功能：

- functions,cli：报告与 FairyGUI 桌面编辑器有符号 32 位整数几何范围不兼容的工程值。[#99](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/99)

修复：

- core：工程 XML 的整数几何字段统一向零截断，并拒绝非有限值和越界值。[#98](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/98)

其他：

- docs：加入项目 Logo、双语文档和修正后的 API 链接。[#94](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/94) [#95](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/95)

### v0.3.0-alpha.2（[发布页](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.3.0-alpha.2)）

新功能：

- functions,cli：新增工程验证工作流，提供 `valid`、`invalid`、`incomplete` 状态、诊断信息与 JSON 输出。[#96](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/96)

### v0.3.0-alpha.1（[发布页](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.3.0-alpha.1)）

新功能：

- mcp：新增 `openfairygui_backend_get_project_outline`，用于获取与 revision 绑定的精简工程结构，不返回源文件字节或完整属性数据。[#93](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/93)

## v0.2.x

从 `v0.2.0-alpha.0` 到 `v0.2.0-alpha.38` 的预发布版本统一归入下方正式版记录。

### v0.2.5（[发布页](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.2.5)）

新功能：

- core：将 controller 的 `alias`、`autoRadioGroupDepth` 与 `exported` 建模为正式属性，并在 Project XML、UAM 与 authoring API 中保留。[#117](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/117)

### v0.2.4（[发布页](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.2.4)）

新功能：

- core,backend：新增 `setResourceFolderAtlas` 事务，按规范分支与路径更新资源文件夹的 source Atlas 槽位。[#115](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/115)

### v0.2.3（[发布页](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.2.3)）

新功能：

- core：补齐 Image、MovieClip、List、内置组件实例与组件 authoring 元数据的 UAM、Project XML 和二进制往返契约。[#112](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/112)
- core,backend：支持 Tree 双击展开状态事务，并收紧 no-op 事务安全检查。[#113](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/113)

其他：

- docs：推荐基于 OpenFairyGUI 构建的 FairyGUI Editor Online，并明确 OpenFairyGUI 与 FairyGUI 品牌的非官方关系。[#111](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/111)

### v0.2.2（[发布页](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.2.2)）

修复：

- cli,functions：`--project-type layabox` 使用安全的 Layabox 发布配置，不再沿用不兼容的 Unity 扩展名和旋转图集设置。[#103](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/103)

其他：

- docs：在 VitePress 官网中渲染 Mermaid 架构图。[#100](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/100)

### v0.2.1（[发布页](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.2.1)）

修复：

- core：工程 XML 的整数几何字段统一向零截断，并拒绝非有限值和越界值。[#98](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/98)

其他：

- docs：加入项目 Logo、双语 Changelog、英文文档和修正后的 API 链接。[#94](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/94) [#95](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/95)

### v0.2.0（[发布页](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.2.0)）

破坏性变更：

- core,functions：将运行时无关、Node.js 与 Web API 拆分为 `/node`、`/web`、`/uam`、`/project-io` 等明确的包入口。

新功能：

- core：新增 UAM 工程创作能力，支持包、组件、资源、显示对象、gear、控制器、动效和资源文件夹的原子事务。[#14](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/14) [#37](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/37) [#45](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/45) [#48](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/48)
- core：新增工程设置、包发布设置和包内分支生命周期事务。[#75](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/75) [#76](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/76) [#77](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/77)
- functions：新增发布插件与浏览器发布能力，明确支持持久化发布设置和 SVG 资源。[#2](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/2) [#4](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/4) [#78](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/78) [#85](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/85)
- backend,mcp：新增有状态工程会话、revision、保存与 materialization 流程、能力发现、CLI 集成和 MCP 适配层。

修复：

- core：在往返读写中保留 FairyGUI Project XML、组件、动效、属性覆盖和二进制包语义。[#10](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/10) [#11](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/11) [#13](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/13) [#86](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/86)
- core,functions：安全水合并发布 MovieClip JTA 元数据、尺寸、平滑设置、帧和纹理表。[#19](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/19) [#71](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/71) [#72](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/72) [#73](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/73)
- core：在提交事务前校验替换图片资源的字节内容。[#61](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/61)
- backend：保留浏览器存储保真路径，并在页面刷新后恢复被遗留的会话锁。[#88](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/88) [#89](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/89)

其他：

- 将文档官网发布至 [fairygui.dev](https://fairygui.dev/)，并增加项目赞助信息。[#42](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/42) [#44](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/44)
- 将五个公开包作为稳定版 `0.2.0` 发布，并提供确定性的版本元数据和浏览器安全的包入口。[#91](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/91)

## v0.1.x

### v0.1.1（[发布页](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.1.1)）

新功能：

- core：完善已发布工程的恢复能力，支持对齐属性、可恢复资源元数据、包含点号的资源名称和跨包引用。

其他：

- 稳定 npm 发布工作流和 workspace 依赖发布。

### v0.1.0（[标签](https://github.com/OpenFairyGUI/OpenFairyGUI/tree/v0.1.0)）

首个版本，提供 FairyGUI 工程与二进制包读写、文档变换、发布、已发布工程恢复和 `ofgui` CLI。
