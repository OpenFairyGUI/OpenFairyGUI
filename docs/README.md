# OpenFairyGUI 文档总览

本文档目录用于维护协议、设置结构与架构说明，并作为官网静态文档站的内容源。文档以中文为主，只描述当前正式口径，不记录历史兼容方案、过渡结构或未来规划。

[English documentation](./en/README.md)

## 文档索引

| 文档 | 说明 |
|---|---|
| [版本变更记录](https://github.com/OpenFairyGUI/OpenFairyGUI/blob/main/CHANGELOG_CN.md) | 按发布版本汇总公开功能、修复、破坏性变更与维护事项 |
| [架构图说明](./architecture-overview.md) | 说明 monorepo 包职责、模块边界、核心数据流，以及 `backend` 的 browser-safe storage adapter、`materializeSession`、stateful runtime、service-layer、events/jobs/cache 与 `mcp` 薄适配 / resources / prompts 定位 |
| [编辑器发布设置](./editor-publish-settings.md) | 说明 FairyGUI 编辑器发布设置的结构、字段、默认值与写回规则 |
| [Publish 插件](./publish-plugins.md) | 说明 OpenFairyGUI publish 插件目录、manifest、生命周期、降级规则，以及与 FairyGUI 编辑器插件的关系 |
| [发布产物恢复边界](./published-project-restore-limitations.md) | 记录可信本地发布物的受限恢复范围、安全约束与不可稳定恢复的内容 |
| [Project XML 属性协议](./project-xml-attribute-reference.md) | 汇总 `package.xml`、`component.xml` 及结构节点当前正式支持的 XML 属性协议 |
| [Project XML DisplayList Tag 对齐](./project-xml-displaylist-variants.md) | 固定 `component.xml` `displayList` 的原始 XML tag、容器 variant 与 editor `DisplayListItem.type` 对齐口径 |
| [二进制封包协议](./fairygui-binary-package-format.md) | 说明 `.fui` / `_fui.bytes` 的协议布局、block 结构与 Component 解码规则 |
| [网站首页](./index.md) | 面向使用者的入门、包导航、参考文档与 API 入口 |

## 使用约定

| 项目 | 说明 |
|---|---|
| 适用对象 | 仓库维护者、后续实现者、协议补齐与发布链路开发者 |
| 文档口径 | 只写当前正式口径；文档同步要求以 `AGENTS.md` 为准 |
| README 入口 | 根目录 `README.md` 与 `README_EN.md` 只承担导航，不承载协议正文 |
| 官网构建 | `pnpm docs:dev` 用于本地预览；`pnpm docs:build` 会生成公开 API 参考和静态站点 |
