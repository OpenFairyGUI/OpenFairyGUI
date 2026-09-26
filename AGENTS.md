# OpenFairyGUI Maintainer Notes

## 从这里开始

- 推荐开发 Node 版本见 `.node-version`；包的最低支持范围仍以 `package.json` 的 `engines` 为准，pnpm 版本以 `packageManager` 为准。
- 准备 Git、Node 与指定 pnpm 后，在仓库根目录运行 `pnpm repo:setup`。日常验证按下面的改动范围选择，不要求首次启动后再跑完整 CI。不需要个人机器路径。
- 先读[开发指南](docs/guide/development.md)的环境、术语和参考资料规则；用户 API 入口见[包与工具](docs/guide/packages.md)。
- XML 字段、UAM operation、Backend 方法、MCP 工具与发布排查的修改路径见[开发任务指引](docs/guide/task-recipes.md)，只展开当前任务需要的模块。
- 代码修改用 `pnpm check:fast --base origin/next`，加 `--list` 只查看同一选择计划；两次命令使用相同的实际 PR 目标。普通文档修改用 `pnpm docs:check`，需要页面预览时再运行 `pnpm docs:build`。大范围改动、包级指引要求或完整 CI 复现用 `pnpm check:ci`；快速检查不是完整回归。
- `pnpm pack:check` 在仓库外安装当前五包 tarball，验证公开入口、类型、CLI/MCP、Node 示例与真实 Chromium OPFS 存储/安全失败；已包含在 `check:ci`。首次下载匹配浏览器；Linux CI 显式加 `--browser-deps` 安装系统依赖。发布前用 `--artifacts .release` 验证将要发布的同一组文件。
- `pnpm eval:agent --runner reference` 自测真实消费者任务（含编辑、安全停止及独立发布/恢复宿主）；模型评测显式用 `--runner codex --codex <可执行文件>` 手动运行。模型分数不进入 PR 门禁，失败现场保留在仓库外，见[评测指南](docs/guide/agent-evaluations.md)。
- 契约类型由 Core/Backend 拥有；修改后运行 `pnpm contracts:generate`，`pnpm contracts:check` 拒绝映射遗漏与生成物漂移。MCP 参数与操作查询见[契约指南](docs/guide/contracts.md)。不手改生成快照或文档标记区。
- `pnpm repo:doctor --json` 只诊断，不安装、不改配置、不写测试文件。`pnpm refs:status` 查看公开 fixture 状态，`pnpm refs:verify` 验证必需 fixture。
- `pnpm refs:grep "literal text"` 只读搜索通过版本/状态检查的 fixture 跟踪文本；0 命中、1 无匹配、2 前置条件或搜索失败，不把缺少资料当作无匹配。
- 不直接编辑 dist、API 页面或站点输出；它们分别由 build、docs:api、docs:build 生成。修改生成器或源文件。

## 任务路由

| 包 | 职责与局部指引 |
|---|---|
| core | [模型、UAM、协议与 I/O](packages/core/AGENTS.md) |
| functions | [工作流、发布与恢复](packages/functions/AGENTS.md) |
| backend | [会话、revision、存储与宿主能力](packages/backend/AGENTS.md) |
| cli | [终端命令与机器输出](packages/cli/AGENTS.md) |
| mcp | [Backend 的 MCP 薄适配](packages/mcp/AGENTS.md) |
| test-utils | [测试辅助与固定版本 fixture](packages/test-utils/AGENTS.md) |

验证映射的唯一数据源是 `agent/impact-map.json`。下表由 `pnpm test:changed --matrix` 输出，`pnpm docs:check` 检查漂移。执行选中测试时先运行仓库脚本自测与指引检查；`--list`/`--matrix` 仅查看计划。下列文档是审查提示，并非要求无关改动也重写文档。

<!-- impact-map:start -->
| 改动路径 | AVA 测试组（含下游） | 需审查的文档 |
|---|---|---|
| `packages/core/**`, `packages/test-utils/**` | core, functions, backend, cli, mcp | `docs/architecture-overview.md`, `docs/editor-publish-settings.md`, `docs/fairygui-binary-package-format.md`, `docs/project-xml-attribute-reference.md` |
| `packages/functions/**` | functions, backend, cli, mcp | `docs/architecture-overview.md`, `docs/project-validation.md`, `docs/editor-publish-settings.md`, `docs/published-project-restore-limitations.md`, `docs/publish-plugins.md` |
| `packages/backend/**` | backend, cli, mcp | `docs/architecture-overview.md`, `docs/project-validation.md`, `docs/guide/contracts.md`, `docs/guide/diagnostics.md`, `docs/guide/installed-docs.md` |
| `packages/cli/**` | cli | `docs/guide/getting-started.md`, `docs/project-validation.md`, `docs/guide/contracts.md`, `docs/guide/diagnostics.md`, `docs/guide/installed-docs.md` |
| `packages/mcp/**` | mcp | `docs/architecture-overview.md`, `docs/guide/contracts.md`, `docs/guide/diagnostics.md`, `docs/guide/installed-docs.md` |
| `docs/.vitepress/**`, `scripts/**`, `examples/**`, `agent/**`, `references.json`, `.github/**`, `.node-version` | core, functions, backend, cli, mcp | `docs/guide/development.md`, `docs/en/guide/development.md` |
| `docs/**`, `AGENTS.md`, `README.md`, `README_EN.md`, `CHANGELOG.md`, `CHANGELOG_CN.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `ROADMAP.md`, `ROADMAP_EN.md` | 仅仓库检查 | `docs/README.md`, `docs/en/README.md` |
<!-- impact-map:end -->

规则按首个匹配项选择；依赖/公共配置等未登记路径、无法解析的比较基准、没有变更，都回退完整测试。新增测试必须进入映射，空测试组会失败。具体命令与覆盖限制见开发指南。

## 核心约束与提交检查

| 事项 | 要求 |
|---|---|
| 当前模型 | 直接使用当前正式协议，不保留旧结构、过渡 fallback；文档只写已验证的现行行为，规划单列。 |
| 属性归属 | 先检查固定版本真实样本的标签分布。XML 没有通用 displayObject 节点；字段落到具体类或最小共享层，只有跨标签证据充分时才放到 GObject。 |
| 正式属性 | 长期协议字段定义正式属性/API；extras 只承载临时元数据、外部扩展或有明确收口计划的短期桥接。Reader/Writer/BinaryEncoder 调整先补模型，再同步读写与测试。 |
| 协议文档 | 只描述协议，不混入内部承载方式、未来能力或未验证推测。二进制比较看反序列化语义与 block 内容，不单凭包头 Version 差异判断错误。 |
| 架构变更 | 包职责、模块边界、数据流、发布链路变化同步 docs/architecture-overview.md；Mermaid 只画当前模块。 |
| 读写与发布 | 工程结构/设置/读写同步 docs/editor-publish-settings.md；二进制与资源编码同步 docs/fairygui-binary-package-format.md；相关字段与插件文档按上方影响表审查。 |
| 文档入口 | 关键文档新增、重组或改名同步 docs/README.md、docs/en/README.md、README.md、README_EN.md；中文规范文档有英文对应页。 |
| 发布记录 | 正式/预发布同轮更新 CHANGELOG_CN.md 与 CHANGELOG.md；版本、链接、分类和内容一致，不只依赖自动 Release 说明。 |
| 验证证据 | 按改动范围运行检查，记录实际结果及未运行部分。check:fast 对未触及的相关文档发出提示；可用 --docs-waiver "原因" 显式记录无需更新的理由。 |

## 参考资料与取证

`references.json` 只登记三个公开 fixture 子模块的用途与探针；URL 只从 `.gitmodules` 读取，提交只从 Git gitlink 读取，不复制一份版本锁。`pnpm refs:sync` 获取这些固定版本，`pnpm refs:verify` 检查其完整性与工作区状态。

协议修改必须有可核验的来源、对应版本及测试证据。缺少能确定字段归属、默认值、发布命名或封包规则的必要证据时，明确标为未验证，停止该项协议判断并说明缺失材料；不猜测、不把跳过算作通过，可继续不依赖该结论的工作。资料职责与获取办法见[开发指南](docs/guide/development.md#参考资料与取证)。
