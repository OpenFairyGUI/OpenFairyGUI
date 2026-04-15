# OpenFairyGUI 文档总览

本文档目录用于维护协议、设置结构与架构说明。文档以中文为主，只描述当前正式口径，不记录历史兼容方案、过渡结构或未来规划。

## 文档索引

| 文档 | 说明 |
|---|---|
| [架构图说明](./architecture-overview.md) | 说明 monorepo 包职责、模块边界、核心数据流与 `extras` 的当前定位 |
| [编辑器发布设置](./editor-publish-settings.md) | 说明 FairyGUI 编辑器发布设置的结构、字段、默认值与写回规则 |
| [发布产物还原限制](./published-project-restore-limitations.md) | 记录仅凭发布目录重建工程时，当前已确认不可稳定恢复的内容边界 |
| [Project XML 属性协议](./project-xml-attribute-reference.md) | 汇总 `package.xml`、`component.xml` 及结构节点当前正式支持的 XML 属性协议 |
| [Project XML DisplayList Tag 对齐](./project-xml-displaylist-variants.md) | 固定 `component.xml` `displayList` 的原始 XML tag、容器 variant 与 editor `DisplayListItem.type` 对齐口径 |
| [二进制封包协议](./fairygui-binary-package-format.md) | 说明 `.fui` / `_fui.bytes` 的协议布局、block 结构与 Component 解码规则 |

## 使用约定

| 项目 | 说明 |
|---|---|
| 适用对象 | 仓库维护者、后续实现者、协议补齐与发布链路开发者 |
| 文档口径 | 只写当前正式口径；文档同步要求以 `AGENTS.md` 为准 |
| README 入口 | 根目录 `README.md` 与 `README_EN.md` 只承担导航，不承载协议正文 |
