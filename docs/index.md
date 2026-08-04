---
layout: home

hero:
  name: OpenFairyGUI
  text: FairyGUI 工程的 Node.js SDK
  tagline: 以代码读取、检查、转换、发布和还原 FairyGUI 工程，适合自动化工作流与工具集成。
  image:
    src: /logo.svg
    alt: OpenFairyGUI logo
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: 浏览 API
      link: /api/

features:
  - title: 工程与发布包双向处理
    details: 读取和写入工程目录、发布二进制包，并将已发布产物还原为可继续编辑的工程。
  - title: 自动化优先
    details: 通过 TypeScript API、CLI 与 MCP 适配层，将工程处理接入脚本和智能体工作流。
  - title: 正式协议参考
    details: 当前实现、项目 XML、发布设置与二进制格式均有明确的参考文档与源码入口。
---

## 从一个工程开始

先读取 FairyGUI 工程，再围绕 `Document` 进行检查、变换、发布或写回。完整步骤见[快速开始](/guide/getting-started)。

如果你正在补齐工程格式或发布链路，请从[参考文档](/architecture-overview)开始；如果你需要查看可调用的公开符号，请打开[API Reference](/api/)。
