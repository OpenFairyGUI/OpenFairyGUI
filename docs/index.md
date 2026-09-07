---
layout: home

hero:
  name: OpenFairyGUI
  text: 面向 Agent 的 FairyGUI 工具链
  tagline: 通过 MCP、CLI 和 TypeScript SDK 读取、编辑、验证与发布工程，接入 AI Agent、自动化脚本与编辑器宿主。
  image:
    src: /logo.svg
    alt: OpenFairyGUI logo
  actions:
    - theme: brand
      text: 接入 Agent
      link: /guide/getting-started
    - theme: alt
      text: 可运行示例
      link: /guide/examples

features:
  - title: 按安装版本发现能力
    details: CLI 与 MCP 共用随包工作流、精确 schema 和诊断文档，Agent 可以先查询当前契约再构造操作。
  - title: 查询、预演与事务编辑
    details: 从真实属性和 revision 规划修改，检查预演影响，提交与保存分别校验版本，并如实报告冲突和不完整结果。
  - title: 接入现有工作流
    details: MCP 提供有状态工程编辑；CLI 与 Node SDK 执行检查、发布及可信本地产物的受限恢复，浏览器宿主使用注入能力。
---

## 从一个任务开始

让 Agent 修改指定组件的文案，先查询和预演，再按 revision 提交、验证、保存并回读。[快速开始](/guide/getting-started)提供本地 MCP 配置与任务示例，[可运行示例](/guide/examples)用独立临时工程验证编辑与保存结果。

脚本与编辑器集成从[包与工具](/guide/packages)选择 CLI、Backend 或 SDK 入口；底层格式与公开符号见[文档索引](/README)和 <a href="/api/" target="_self">API Reference</a>。

## 推荐项目

**[FairyGUI Editor Online](https://editor.fairygui.dev/)** 已将 OpenFairyGUI 落地为可直接使用的浏览器端 FairyGUI 工程编辑器，支持从本地文件夹或 ZIP 导入工程，并在浏览器中编辑、保存、发布与预览。

[在线体验](https://editor.fairygui.dev/) · [GitHub 仓库](https://github.com/OpenFairyGUI/FairyGUI-Editor-Online)

## 与 FairyGUI 的关系

OpenFairyGUI 是围绕 FairyGUI 工程格式与工具链开发的非官方开源项目，并非 FairyGUI 官方产品。“FairyGUI”名称、Logo 及相关品牌标识的权利归其权利人所有；官方产品与信息请访问 [FairyGUI 官网](https://fairygui.com/)。
