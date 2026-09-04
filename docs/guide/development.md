# 仓库开发与验证

本页面向贡献者与 Agent；使用 SDK 请先看[快速开始](./getting-started.md)和[包与工具](./packages.md)。所有命令都从仓库根目录执行。

## 首次启动

1. 准备 Git、Node.js 和 pnpm。推荐开发 Node 主版本由 `.node-version` 指定（24），pnpm 精确版本由根 `package.json` 的 `packageManager` 指定（10.14.0）。使用本机已有版本管理方式切换，不要求全局工具或个人配置文件。
2. 包的 `engines.node` 仍为 `>=20`；CI 验证 20、22、24，开发推荐版本并不缩小支持范围。开发依赖还可能要求相应主版本的较新补丁版。
3. 在已有 checkout 中运行：

```bash
pnpm repo:setup
pnpm check:ci
```

`repo:setup` 依次初始化 Git 固定提交的子模块、执行 frozen-lockfile 安装、构建、运行仓库脚本自测和 doctor。它不修改锁文件、切换 Node、安装全局工具或获取受限本地语料；会写入依赖、构建产物并初始化子模块。使用 `repo:setup` 而非 pnpm 自带的环境配置命令 `setup`。

仓库已有未提交工作时，先判断是否需要隔离 worktree；不要通过清空 node_modules、重置工作区或重建锁文件“修复”环境。子模块网络/TLS 失败应先作为资料获取问题报告，不归咎于 Node 或产品代码。

## 验证入口

| 命令 | 实际覆盖 |
|---|---|
| `pnpm repo:doctor --json` | 只读环境报告：Node/pnpm、依赖、公开导出文件、原生图片能力、临时目录权限与参考资料状态 |
| `pnpm refs:status` | 查看必需 fixture 与可选资料；普通状态查询不因资料缺失返回失败 |
| `pnpm refs:sync` | 原生 Git submodule 初始化/更新到 gitlink，不追踪远端最新版本，不强制覆盖修改 |
| `pnpm refs:verify` | 必需 fixture 的提交、工作区状态和探针文件检查；不通过时非零退出 |
| `pnpm test:repo` | 无需产品构建或外部语料的 Node 内置测试，覆盖仓库脚本 |
| `pnpm test:changed --base origin/next --list` | 只输出选择计划；base 应换成实际 PR 目标，不执行测试 |
| `pnpm check:fast` | lint、typecheck、仓库自测、指引检查；选中 AVA 测试时先构建工作区再运行测试；不构建文档站，不等于全量 |
| `pnpm check` | fixture 验证、lint、typecheck、构建、仓库自测、完整 AVA 测试 |
| `pnpm docs:check` | 本地链接、指令路径/命令、影响表、公开源码入口、双语导航、Changelog 结构和契约漂移 |
| `pnpm contracts:generate` | 从 Core/Backend 类型生成 MCP 结构契约、操作目录、快照与双语表格 |
| `pnpm contracts:check` | 只读检查 operation/方法映射和生成物漂移；仓库自测与 `docs:check` 均覆盖 |
| `pnpm docs:build` | 显式先生成 TypeDoc API，再构建 VitePress；不依赖隐式 pre-script 配置 |
| `pnpm pack:check` | 构建并打包五包，在仓库外安装生产依赖，验证入口、类型、浏览器打包、CLI/MCP 和三个可运行示例 |
| `pnpm eval:agent --runner reference` | 十个真实 tarball/MCP 任务的确定性宿主自测，含编辑、安全停止和独立发布/恢复任务；`pack:check` 也执行，不调用模型 |
| `pnpm eval:agent --runner codex --codex codex` | 手动真实模型任务，保存状态判定、调用轨迹与失败现场；不进入 PR CI |
| `pnpm check:ci` | 完整 `check`、`docs:check`、文档构建和 tarball 消费者检查；提交前使用此入口 |

doctor 不安装、不下载、不写文件。它只检查导出文件是否存在，不证明构建新鲜度或浏览器行为；临时目录只做权限检查，不证明磁盘容量。缺少原生图片能力会警告，图片相关任务仍需实际验证。推荐 Node 不匹配仅警告；低于包支持范围、pnpm 不匹配、缺少必需 fixture/构建产物则失败。

### 变更选择规则

数据仅维护在 `agent/impact-map.json`；根 AGENTS 中的表由 `pnpm test:changed --matrix` 输出，文档检查拒绝表格漂移。

- 比较基准优先使用 `--base`，其次使用 PR 环境的 `GITHUB_BASE_REF`，再使用本地 `origin/HEAD`。不会自动 fetch；目标 ref 必须已在本地。
- 基于 merge-base 收集分支提交差异，并合并 staged、unstaged、untracked 文件；rename 以旧/新路径处理，删除也参与选择。
- 路径按首个规则匹配。Core/test-utils 覆盖全部下游，functions/backend 覆盖各自下游；CLI 还覆盖 Backend 内的 bootstrap 测试。
- 未知路径、依赖/公共配置变化、无法解析基准或浅历史、无变更时回退全量；不能静默选择零个测试。
- 只有已识别的纯文档变更可以采用 repository-only 模式；仍运行仓库自测与指引检查。完整文档构建由 `check:ci` 保证。
- 每个选中测试组必须匹配文件。计划中的文档是审查提示，不意味着只改注释也必须重写协议文档。
- 执行选中的 AVA 测试前统一运行工作区构建，确保 CLI/MCP/Backend 的构建测试不会加载旧依赖产物；构建失败立即停止。纯文档模式及 `--list`/`--matrix` 不触发构建。
- 测试通过 pnpm 的 AVA 启动器运行，保留现有隔离构建测试需要的环境；不要直接调用 AVA 的 JS 文件。直接用 Node 调用选择脚本仅支持查看计划/矩阵。

PR CI 的 quality job 在三个 Node 主版本执行 `check`；documentation job 在推荐 Node 上检查并构建文档；consumer job 在推荐 Node 的 Linux/Windows 环境执行 `pack:check`。文档与消费者 job 不下载 fixture。三类 job 合起来对应本地 `check:ci`；`check:fast` 和 `check` 不包含 tarball 安装。远端链接、Markdown 标题锚点、翻译含义和协议解释仍需人工审查。

消费者检查会联网安装依赖，成功清理自身临时目录，失败保留现场；`--keep` 可保留成功现场。发布前用 `pnpm pack:check --artifacts .release` 检查同一组已打包文件。入口、示例及验证限制见[可运行示例与消费者验证](./examples.md)。

Agent 评测共用 tarball 安装流程，确定性自测进入消费者门禁，模型成功率只作手动观察。任务、隔离、Windows 可执行文件要求和复现方法见[真实 Agent 任务评测](./agent-evaluations.md)。

## 参考资料与取证

`references.json` 登记材料职责、探针和获取限制。三个必需上游仓库位于 `packages/test-utils/test/fixtures/`：

| 子模块 | 可证明的内容 | 版本与获取 |
|---|---|---|
| FairyGUI-Editor | 新版编辑器 UI 工程、设置与插件 API；不替代旧版 exporter | URL 从 `.gitmodules` 读取；提交由 Git gitlink 固定；`pnpm refs:sync` 获取 |
| FairyGUI-layabox | Layabox 消费代码和对应 demo 源工程/发布资源 | 同上 |
| FairyGUI-unity | Unity 消费代码和对应示例源工程/发布资源 | 同上 |

普通构建和完整测试不要求 `referer/`。Git 跟踪的 FairyGUI-Experiments 以及代码生成的最小测试对象仍作为受控 fixture 使用，不移动现有目录。

本地资料登记的 `source`/`revision` 为 null 时表示来源未知，不是锁定版本。`refs:status` 会区分 missing 与 unverified；即使把目录放回来，也不会自动视为可信。受限任务可显式运行：

```bash
pnpm refs:verify --require legacy-editor
```

当前本地语料没有可自动验证的来源记录，因此显式 require 会失败。应向维护者索取来源、版本、成对样本及分发权限，并完成任务级核验；不要下载猜测来源、伪造 commit，或让普通 CI 等待无法分发的旧源码。

取证顺序保持：官方文档 → 编辑器实现（含 worker）→ 同名源工程/发布物配对 → 运行时消费代码 → 补充参考。缺少能决定正式字段或发布规则的必要证据时，停止该项判断，报告缺失项；可继续不依赖该证据的工作。

| 可选本地路径 | 职责与约束 |
|---|---|
| `referer/Docs` | 官方中英文概念、术语、默认行为与用户可见规则；文档与样本冲突时用源码核实 |
| `referer/Editor/scripts/fairygui/editor` | 旧版 AS3/AIR 编辑器的工程 I/O、设置和 exporter；优先查 publish/exporter、settings、gui、api |
| `referer/Editor/scripts/fairygui/editor/worker` | 主线程找不到的发布/转换细节；不能漏查 worker |
| `referer/UIProject` 与 `referer/Release` | 旧版源工程与发布物配对；字段归属统计真实 XML 标签，命名与封包结合源工程核对 |
| `referer/Runtimes` | 消费侧证据；优先用已锁定的 Unity/Layabox 子模块，运行时兼容不代表编辑器应复制历史写法 |
| `referer/FairyGUI-Editor` | 新版设置 JSON、UI 工程与插件接口；优先用对应子模块，不反推底层二进制协议 |
| `referer/API` | 静态 API 页面仅补充接口查询；哈希页面不是首选证据 |
| `referer/fgui-restore` | parser sanity check 与小型回归样本，不是正式协议定义 |
| `referer/glTF-Transform` | 仅参考分包、命名、测试和 API 设计，不作为 FairyGUI 语义依据 |

发布命名差异先查 exporter；发布设置结合文档、settings JSON 和编辑器源码；字段落点先统计 source XML 的标签分布。旧版 UIProject/Release 与新版 editor/runtime 样本要区分。二进制优先源工程/发布物成对验证，不凭单个包或包头 Version 差异下结论。API/插件问题先查插件接口，再回查源码。Unity Library、缓存和静态哈希页面不作为优先扫描对象。

## 产品文档与仓库诊断

安装包使用 `ofgui docs` 和 `ofgui doctor --json`，不依赖仓库。语料与契约统一由 `pnpm contracts:generate` 更新到 `packages/backend/src/generated/`；包版本、工作流或薄 Skill 变化也必须生成并运行 `pnpm contracts:check`。`pnpm pack:check` 验证离线 CLI/MCP 语料一致性、版本、doctor 与随包 Skill。仓库环境诊断仍用 `pnpm repo:doctor`，完整区别见[安装版本文档](./installed-docs.md)。

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
