# 仓库开发与验证

本页面向贡献者与 Agent；使用 SDK 请先看[快速开始](./getting-started.md)和[包与工具](./packages.md)。所有命令都从仓库根目录执行。

## 首次启动

1. 准备 Git、Node.js 和 pnpm。推荐开发 Node 主版本由 `.node-version` 指定（22），pnpm 精确版本由根 `package.json` 的 `packageManager` 指定（10.14.0）。使用本机已有版本管理方式切换，不要求全局工具或个人配置文件。
2. 包的 `engines.node` 为 `>=22`；CI、文档部署和发布流程统一使用 `.node-version` 中的 Node 22。更高主版本满足包的声明范围，但不进入持续验证。开发依赖还可能要求 Node 22 的较新补丁版。
3. 在已有 checkout 中运行：

```bash
pnpm repo:setup
```

`repo:setup` 依次初始化 Git 固定提交的子模块、执行 frozen-lockfile 安装、构建、运行仓库脚本自测和 doctor。它不修改锁文件、切换 Node 或安装全局工具；会写入依赖、构建产物并初始化子模块。使用 `repo:setup` 而非 pnpm 自带的环境配置命令 `setup`。

仓库已有未提交工作时，先判断是否需要隔离 worktree；不要通过清空 node_modules、重置工作区或重建锁文件“修复”环境。子模块网络/TLS 失败应先作为资料获取问题报告，不归咎于 Node 或产品代码。

## 验证入口

按场景选择一个入口，不必按顺序全部执行。包级 AGENTS 要求完整检查时，使用 `check:ci`。

| 场景 | 命令 | 实际覆盖 |
|---|---|---|
| 首次启动 | `pnpm repo:setup` | 获取固定 fixture、安装、构建、仓库脚本自测与环境诊断；完成后即可开始开发 |
| 代码修改 | `pnpm check:fast --base origin/next` | lint、typecheck、仓库脚本基础自测与指引检查；选中 AVA 测试时先构建再测试。base 换成实际 PR 目标 |
| 普通文档修改 | `pnpm docs:check` | 本地链接、指令路径/命令、影响表、公开源码入口、双语导航、Changelog 结构和契约漂移 |
| 大范围改动或完整 CI 复现 | `pnpm check:ci` | fixture、lint、typecheck、指引/契约、构建、全部仓库脚本与 AVA 测试、tarball 消费者和文档构建 |

预览与执行使用同一基准；`--list` 只输出计划，不运行 lint、typecheck 或构建：

```bash
pnpm check:fast --base origin/next --list
pnpm check:fast --base origin/next
```

快速检查不是完整回归。普通文档不包括 `docs/.vitepress/` 站点配置或主题代码；需要页面预览时运行 `pnpm docs:build`，它显式先生成 TypeDoc API，再构建 VitePress。CI 仍会检查并构建文档。

### 专项检查与环境诊断

`pnpm test:repo` 单独运行 Node 内置仓库脚本测试，不需要产品构建或外部 fixture。`pnpm check` 是 CI quality job 使用的产品检查组合（fixture、lint、typecheck、构建、仓库自测与完整 AVA）；日常按上表选择，不必叠加运行。

`pnpm repo:doctor --json` 输出只读环境报告，覆盖 Node/pnpm、依赖、公开导出文件、原生图片能力、临时目录权限与参考资料状态。

doctor 不安装、不下载、不写文件；子模块状态查询也禁用 Git 可选的索引刷新写入。它只检查导出文件是否存在，不证明构建新鲜度或 Node/Web 运行行为；实际消费者边界由 `pack:check` 验证。Sharp 检查会在内存完成 PNG/JPEG 编码和像素解码，而非只读取版本；不可用或失败会警告，不能据此宣称已验证真实 publish/restore。临时路径必须是可访问目录，但访问标志不证明 ACL、磁盘容量、后续写入或回滚。推荐 Node 不匹配仅警告；低于包支持范围、pnpm 不匹配、缺少必需 fixture/构建产物则失败。

### 变更选择规则

数据仅维护在 `agent/impact-map.json`；根 AGENTS 中的表由 `pnpm test:changed --matrix` 输出，文档检查拒绝表格漂移。

- `check:fast` 使用显式 `--base` 或 PR 环境的 `GITHUB_BASE_REF`；两者都缺少时直接报错并提示用法。底层 `test:changed` 仍可回退到本地 `origin/HEAD`。不会自动 fetch；目标 ref 必须已在本地。显式提供但无法解析的基准仍回退全量。
- 基于 merge-base 收集分支提交差异，并合并 staged、unstaged、untracked 文件；rename 以旧/新路径处理，删除也参与选择。
- 路径按首个规则匹配。Core/test-utils 覆盖全部下游，functions/backend 覆盖各自下游；CLI 还覆盖 Backend 内的 bootstrap 测试。
- 未知路径、依赖/公共配置变化、无法解析基准或浅历史、无变更时回退全量；不能静默选择零个测试。
- 只有已识别的纯文档变更可以采用 repository-only 模式；仍运行仓库自测与指引检查。完整文档构建由 `check:ci` 保证。
- 每个选中测试组必须匹配文件。计划中的文档是审查提示，不意味着只改注释也必须重写协议文档。
- 执行选中的 AVA 测试前统一运行工作区构建，确保 CLI/MCP/Backend 的构建测试不会加载旧依赖产物；构建失败立即停止。纯文档模式及 `--list`/`--matrix` 不触发构建。
- 测试通过 pnpm 的 AVA 启动器运行，保留现有隔离构建测试需要的环境；不要直接调用 AVA 的 JS 文件。直接用 Node 调用选择脚本仅支持查看计划/矩阵。

PR CI 先获取完整 Git 历史，使用 PR 目标提交与 `test:changed --list` 的现有影响映射判定范围。仅 `repository-only` 计划跳过 quality/consumer jobs；documentation job 仍执行 `scripts/repository.test.mjs` 仓库脚本自测、`docs:check` 与 `docs:build`。代码、站点配置、脚本、依赖、未知路径、无变更或无法确认比较基准时执行全量；范围判定 job 失败也不会静默跳过产品检查。工作流保持触发，跳过的是具体 job。

全量 CI 的 quality job 在 Node 22 执行 `check`；documentation job 在同一 Node 主版本上检查并构建文档；consumer job 在同一 Node 主版本的 Linux/Windows 环境执行 `pack:check`。文档与消费者 job 不下载 fixture。全量三类 job 合起来对应本地 `check:ci`；纯文档分流不等于完整回归，`check:fast` 和 `check` 不包含 tarball 安装。主分支 push 始终运行全量；同一 PR 的新运行会取消旧运行，主分支各次 push 不互相取消。远端链接、Markdown 标题锚点、翻译含义和协议解释仍需人工审查。

本地 `check:ci` 先验证 fixture、lint、typecheck 与指引，再运行 `pack:check`，随后执行全部仓库脚本测试、AVA 与文档构建。契约检查与工作区构建各由 `pack:check` 执行一次，AVA 使用本次构建产物；不使用缓存或跳过开关。独立执行 `pack:check` 仍自行验证契约并构建。远端 CI 的独立 job 各自准备所需产物。

发布工作流在 Node 22 上单独安装 npm 11，以满足 [npm 可信发布](https://docs.npmjs.com/trusted-publishers/)的 CLI 要求；仓库依赖安装和验证仍使用指定的 pnpm。

`pnpm pack:check` 构建五包并在仓库外安装，验证公开入口、类型、CLI/MCP、Node 示例及真实 Chromium OPFS 编辑/保存/刷新/锁/路径与图片字节。它会联网安装依赖，首次下载匹配浏览器；成功清理自身临时目录，失败保留现场，`--keep` 可保留成功现场。发布前用 `pnpm pack:check --artifacts .release` 检查同一组已打包文件。入口、示例及验证限制见[可运行示例与消费者验证](./examples.md)。

提交 PR 时使用仓库的 `.github/pull_request_template.md`，逐项说明影响包、UAM/Backend/MCP/CLI 契约、版本处理、文档与双语发布日志，以及真实执行的验证基准、命令、失败/未运行项。模板是审查记录，不替代 CI，也不把勾选框当作发布授权或验证通过。

Agent 评测共用 tarball 安装流程。`pnpm eval:agent --runner reference` 运行十个确定性任务，含编辑、安全停止和独立发布/恢复，已进入消费者门禁；`pnpm eval:agent --runner codex --codex codex` 手动运行真实模型任务，成功率只作观察。任务、隔离、Windows 可执行文件要求和复现方法见[真实 Agent 任务评测](./agent-evaluations.md)。

## 参考资料与取证

`references.json` 只登记公开 fixture 的职责与探针。三个必需上游仓库位于 `packages/test-utils/test/fixtures/`：

| 子模块 | 可证明的内容 | 版本与获取 |
|---|---|---|
| FairyGUI-Editor | 新版编辑器 UI 工程、设置与插件 API；不替代旧版 exporter | URL 从 `.gitmodules` 读取；提交由 Git gitlink 固定；`pnpm refs:sync` 获取 |
| FairyGUI-layabox | Layabox 消费代码和对应 demo 源工程/发布资源 | 同上 |
| FairyGUI-unity | Unity 消费代码和对应示例源工程/发布资源 | 同上 |

构建与测试使用这些公开子模块、Git 跟踪的 FairyGUI-Experiments 以及代码生成的最小测试对象。

`pnpm refs:status` 查看状态，资料缺失不会让普通查询失败；`pnpm refs:sync` 初始化/更新到 gitlink，不追踪远端最新版本或强制覆盖修改；`pnpm refs:verify` 严格检查必需 fixture 的提交、工作区状态与探针文件。`pnpm refs:grep "literal text"` 验证后搜索区分大小写的字面量，输出仓库相对路径与行号；退出码 0 表示命中、1 表示无匹配、2 表示错误。

`refs:grep` 复用上述登记与版本检查，只搜索三个子模块各自 Git 跟踪的文本，跳过二进制、未跟踪/忽略文件及登记范围外的文件。缺失、dirty、mismatch、探针不完整或 Git 搜索失败时不返回部分成功；先处理报告的问题，不自动同步或覆盖修改。返回的路径/行号只是定位结果，不代表该来源能证明旧版 exporter 行为。需要特定来源或更复杂条件时，先用 `refs:status` 核对来源与职责，再在对应目录使用原生 Git/rg。

协议判断依据仓库内正式文档、固定版本的公开 fixture 及可公开核验的一手资料，记录来源、适用版本及测试证据。缺少能决定正式字段或发布规则的必要证据时，明确标为未验证，停止该项判断并报告缺失项，可继续不依赖该结论的工作。公开 fixture 的状态检查不代表所有协议已获验证。

发布命名与设置结合对应版本的公开文档、工程样本和配对发布物核对；字段落点先统计 source XML 的标签分布。不同版本的行为应分别验证，运行时兼容性不能单独证明工程或发布协议。二进制优先源工程/发布物成对验证，不凭单个包或包头 Version 差异下结论。

## 产品文档与仓库诊断

安装包使用 `ofgui docs` 和 `ofgui doctor --json`，不依赖仓库。语料与契约统一由 `pnpm contracts:generate` 更新到 `packages/backend/src/generated/`；包版本、工作流或薄 Skill 变化也必须生成并运行 `pnpm contracts:check`。`pnpm pack:check` 验证离线 CLI/MCP 语料一致性、版本、doctor 与随包 Skill。仓库环境诊断仍用 `pnpm repo:doctor`，完整区别见[安装版本文档](./installed-docs.md)。

契约生成从 Core/Backend/CLI 类型更新 MCP/CLI 结构契约、操作目录、诊断指引、快照与双语表格；`contracts:check` 只读检查映射、正式诊断码覆盖/归属与生成物漂移。CLI 命令注册覆盖另由仓库自测检查。修改入口见[契约指南](./contracts.md)。

## 最小术语表

| 术语 | 本仓库含义 |
|---|---|
| Source Project / Published Package | 可编辑工程与运行时发布物，二者不是同一契约 |
| UAM / Document | 公开声明式 authoring 模型与底层可变属性图；事务保证来自 UAM 入口 |
| Lift / Materialize | Document 转 UAM / UAM 转 Document；物化不等于写盘或发布 |
| Session / Revision | Backend 编辑会话及其版本；mutation 必须提供 expectedRevision |
| Transaction support / Apply | 支持性检查与实际执行是不同阶段，检查通过不承诺保存成功 |
| Source bytes | 显式 hydration 的二进制内容，不通过 JSON clone 保留 |
| Capability plane | 分离的服务/宿主能力面；能读取不代表能编辑、保存或发布 |
| Semantic round-trip | 往返后保持受支持语义，不要求 XML 文本或整个二进制逐字节相同 |

包职责、公开契约入口和不可改变的不变量由根及包级 AGENTS 维护；[架构总览](../architecture-overview.md)解释实际数据流。不要手改 `packages/*/dist/`、`docs/public/api/`、`docs/.vitepress/dist/`。新增关键文档同步中英文 README 与文档索引；发布时同步双语 Changelog。结构检查不替代语义审查。

具体修改起点、证据要求与验收清单见[开发任务指引](./task-recipes.md)。该页只导航现有实现，不维护第二份协议或 operation grammar。
