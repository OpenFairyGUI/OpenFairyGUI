# 安装版本文档与产品诊断

安装后无需克隆仓库或访问网站即可读取最小文档语料。`@openfairygui/backend/docs` 提供独立、browser-safe 的数据入口，CLI 和 MCP 共用它；Backend 根入口不加载整份 schema。内容包括索引、工作流、精确 operation/方法 wire schema、逐码诊断及薄 Skill，不复制整个网站。

使用当前项目安装的 `ofgui`（Windows 为 `ofgui.cmd`），先检查 `--version`，再执行：

```bash
ofgui docs ls --json
ofgui docs find "selector" --json
ofgui docs cat workflow
ofgui docs cat restore-limits --json
ofgui docs cat methods/queryEntity --json
ofgui docs schema setDisplayNodeProps --json
ofgui docs diagnostic stale_write --json
ofgui docs cat skill
```

`ls` 返回精确 ID 与 MCP URI。`cat` 只接受已登记 ID，不读任意路径或 URL。`find` 只搜索安装语料。JSON 输出包含包名/版本、契约版本、能力 schema、契约与文档摘要；正文位于 `text`，schema/诊断正文是可解析的 JSON 文本。未知 ID、空搜索或 CLI/文档版本不一致返回错误 JSON 和退出码 1，不自动下载其他版本。省略 `--json` 时显示安装版本及正文/目录。

MCP 读取 `openfairygui://docs/index` 后按条目 URI 读取同一份正文。操作 URI 仍是 `openfairygui://contracts/operations/{kind}`，方法 URI 为 `openfairygui://docs/methods/{method}`，诊断 URI 见[诊断与恢复](./diagnostics.md)。索引标识 Backend 文档包版本，应与所使用的安装版本核对；自定义 MCP server 名称/版本不改变语料版本。

## 产品 doctor

```bash
ofgui doctor --json
ofgui doctor ./MyProject --json
```

不传工程时检查 Node 最低版本、CLI/文档版本一致性，并读取 Node Backend 能力声明；不声称已验证源字节或 Sharp。传入工程时复用 `validateProjectNode` 的只读路径解析、工程读取与现有图片解码检查；不创建 Backend session/锁，不安装、不写探针、不改配置、不修复。

退出码 0 表示本次请求的检查完成；1 表示错误；2 表示工程验证不完整。JSON `scope` 为 `installed-product`，包含 `status`、`errors`、能力 envelope、原始 `project` 验证报告及 `limits`。不传工程时 `project` 为 null；能力声明不等于写权限、发布或运行时渲染验证。会话已有未保存编辑时，CLI doctor 只检查磁盘工程；当前内存状态应使用 `validateSession`。

仓库开发环境仍使用 `pnpm repo:doctor`：它诊断 Git、pnpm、构建存在性、临时目录权限及 fixture；产品 doctor 不检查这些仓库前置条件。

## 随包与维护

原始工作流与 Skill 位于 Backend 包的 `docs/workflow.md`、`docs/skills/openfairygui/SKILL.md`。Skill 只导航到当前安装的文档，不维护另一份 operation grammar，也不自动安装到个人目录。可用 `docs cat skill` 阅读，然后由宿主决定如何启用。

`pnpm contracts:generate` 从 Core/Backend 类型、MCP 传输元数据、Backend 包版本及上述 Markdown 生成 `packages/backend/src/generated/`。修改版本或原文后必须重新生成；`contracts:check` 拒绝漂移。发布流程仍检查即将发布的同一组 tarball，不能以网站或另一次 build 替代安装产物证据。

`pack:check` 在仓库外安装五包，验证文档/Skill 存在、包版本与摘要一致、CLI/MCP 正文一致、doctor 只读及缺少解码器时的 incomplete 退出码，并运行 inspect/edit/save/reread 及 publish/restore 示例；`restore-limits` 正文直接由正式恢复边界文档生成并随包分发。源码测试和安装消费者验证分开保留。
