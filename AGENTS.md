# OpenFairyGUI Maintainer Notes

## 从这里开始

- 推荐开发 Node 版本见 `.node-version`；包的最低支持范围仍以 `package.json` 的 `engines` 为准，pnpm 版本以 `packageManager` 为准。
- 准备 Git、Node 与指定 pnpm 后，在仓库根目录运行 `pnpm repo:setup`，再运行 `pnpm check:ci`。不需要个人机器路径。
- 先读[开发指南](docs/guide/development.md)的环境、术语和参考资料规则；用户 API 入口见[包与工具](docs/guide/packages.md)。
- XML 字段、UAM operation、Backend 方法、MCP 工具与发布排查的修改路径见[开发任务指引](docs/guide/task-recipes.md)，只展开当前任务需要的模块。
- 快速反馈用 `pnpm check:fast`；PR 差异可用 `pnpm test:changed --base origin/next --list` 显示范围（base 换成实际目标分支）。快速检查不是完整回归。
- `pnpm pack:check` 在仓库外安装当前五包 tarball，验证公开入口、类型、CLI/MCP、Node 示例与真实 Chromium OPFS 存储/安全失败；已包含在 `check:ci`。首次下载匹配浏览器；Linux CI 显式加 `--browser-deps` 安装系统依赖。发布前用 `--artifacts .release` 验证将要发布的同一组文件。
- `pnpm eval:agent --runner reference` 自测十个真实消费者任务（含编辑、安全停止及独立发布/恢复宿主）；模型评测显式用 `--runner codex --codex <可执行文件>` 手动运行。模型分数不进入 PR 门禁，失败现场保留在仓库外，见[评测指南](docs/guide/agent-evaluations.md)。
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
| `packages/core/**`, `packages/test-utils/**` | core, functions, backend, cli, mcp | `docs/architecture-overview.md`, `docs/editor-publish-settings.md`, `docs/fairygui-binary-package-format.md` |
| `packages/functions/**` | functions, backend, cli, mcp | `docs/architecture-overview.md`, `docs/project-validation.md`, `docs/editor-publish-settings.md`, `docs/published-project-restore-limitations.md` |
| `packages/backend/**` | backend, cli, mcp | `docs/architecture-overview.md`, `docs/project-validation.md` |
| `packages/cli/**` | cli, backend | `docs/guide/getting-started.md`, `docs/project-validation.md` |
| `packages/mcp/**` | mcp | `docs/architecture-overview.md` |
| `docs/.vitepress/**`, `scripts/**`, `examples/**`, `agent/**`, `references.json`, `.github/**`, `.node-version` | core, functions, backend, cli, mcp | `docs/guide/development.md`, `docs/en/guide/development.md` |
| `docs/**`, `AGENTS.md`, `README.md`, `README_EN.md`, `CHANGELOG.md`, `CHANGELOG_CN.md` | 仅仓库检查 | `docs/README.md`, `docs/en/README.md` |
<!-- impact-map:end -->

规则按首个匹配项选择；依赖/公共配置等未登记路径、无法解析的比较基准、没有变更，都回退完整测试。新增测试必须进入映射，空测试组会失败。具体命令与覆盖限制见开发指南。

## 核心约束

| 事项 | 规则 |
|---|---|
| 历史兼容 | 当前项目没有历史包袱。新增或调整协议时，默认直接采用当前正式模型，不为旧结构、过渡写法、临时 fallback 保留兼容分支。 |
| 属性建模 | 能落成正式属性字段或公开 API 的数据，不要继续放在 `extras` 中承载。 |
| 协议建模准确性 | 协议字段应优先落到语义最准确、约束最小的属性层级，不要只为 round-trip 方便而先挂到更宽泛的基类。若样本显示字段只属于少数标签，应优先建模到对应具体类或最小共享抽象层，而不是默认提升到 `GObject` / 通用协议层。 |
| XML 字段归属 | 工程 XML 中只有具体标签，没有 `displayObject` 这类通用实体节点。凡是来源于具体标签属性的字段，默认应下沉到对应具体类或最小共享抽象层；除非样本和协议都能证明它是稳定的跨标签公共字段，否则不要把它建模成 `GObject` 公共属性。 |
| `extras` 使用边界 | `extras` 仅用于临时元数据、外部扩展数据、或尚未完成建模但必须短期保留的内部桥接字段。进入长期维护范围的协议字段，应尽快提升为正式属性。 |
| 文档同步 | 协议变更后，文档应只描述当前实现，不记录历史过渡方案或兼容层。任何影响编辑器发布设置、项目读写、二进制封包协议、发布产物命名/结构的代码变更，提交时必须同步更新 `docs` 中对应文档。 |
| 发布日志同步 | 每次发布正式版或预发布版时，必须在同一轮更新 `CHANGELOG_CN.md` 与 `CHANGELOG.md`；版本号、发布链接、变更分类和内容必须双语一致，不得只依赖 GitHub Release 自动生成说明。 |
| 架构同步 | 任何改变包职责、模块边界、核心数据流、发布链路的改动，提交时必须同步更新 `docs/architecture-overview.md`。 |
| 入口同步 | 若新增、重组或重命名关键文档，必须同步更新 `docs/README.md`、`README.md`、`README_EN.md` 的入口。 |

## 文档联动规则

| 代码变更类型 | 提交时必须同步更新 |
|---|---|
| 包职责、模块边界、核心数据流变化 | `docs/architecture-overview.md` |
| FairyGUI 编辑器发布设置结构、默认值、写回规则变化 | `docs/editor-publish-settings.md` |
| 项目文件结构、工程读写规则变化 | `docs/editor-publish-settings.md`，必要时同步 `docs/architecture-overview.md` |
| 二进制封包协议、Component block、资源编码结构变化 | `docs/fairygui-binary-package-format.md`，必要时同步 `docs/architecture-overview.md` |
| 版本号、发布标签或 Release 变化 | `CHANGELOG_CN.md`、`CHANGELOG.md` |
| `docs` 目录重组或新增关键文档 | `docs/README.md`、`README.md`、`README_EN.md` |

## 文档口径约束

| 项目 | 要求 |
|---|---|
| 事实依据 | 必须以当前仓库正式口径为准 |
| 历史兼容 | 不记录旧结构、临时 fallback、过渡层说明 |
| 未实现内容 | 不写成现行协议，不用猜测填空 |
| 协议文档边界 | 协议文档只描述协议本身，不描述项目内部承载方式或实现对齐关系 |

## 提交前检查

| 检查项 | 通过标准 |
|---|---|
| 文档是否同步 | 改动涉及协议、发布设置、架构边界时，对应文档已同一轮更新 |
| 双语 Changelog 是否同步 | 每个新版本均在 `CHANGELOG_CN.md` 与 `CHANGELOG.md` 中有内容一致的版本条目和发布链接 |
| README 入口是否闭环 | `README.md`、`README_EN.md`、`docs/README.md` 没有失效入口 |
| 架构图是否准确 | Mermaid 图没有画出当前仓库不存在的模块或链路 |
| 协议说明是否干净 | 没有混入未来规划、旧兼容层、未验证行为或项目内部实现描述 |

## 维护偏好

| 场景 | 默认做法 |
|---|---|
| Reader / Writer / BinaryEncoder 调整 | 优先补齐正式属性模型，再同步读写逻辑和测试 |
| 新协议字段 | 优先在 `properties/*.ts` 中定义属性和访问器 |
| 字段归属判断 | 先检查真实工程样本中的标签分布，再决定字段应落到具体组件类、最小共享抽象层还是扩展块协议。因为工程 XML 不存在通用 `displayObject` 节点，默认不要提升到 `GObject`；只有在协议和样本都能稳定证明它是公共字段时，才允许保留在通用层。 |
| 临时桥接字段 | 若必须先放 `extras`，应在后续任务中明确收口计划 |
| 二进制文件对比 | 对比 `.fui/.bytes` 时，不要把包头 `Version` 差异直接视为问题依据；FairyGUI 运行时对该版本字段向下兼容，判断偏差应优先看反序列化后的语义、block 结构和字段内容 |

## 参考资料与取证

`references.json` 只登记三个公开 fixture 子模块的用途与探针；URL 只从 `.gitmodules` 读取，提交只从 Git gitlink 读取，不复制一份版本锁。`pnpm refs:sync` 获取这些固定版本，`pnpm refs:verify` 检查其完整性与工作区状态。

协议修改必须有可核验的来源、对应版本及测试证据。缺少能确定字段归属、默认值、发布命名或封包规则的必要证据时，明确标为未验证，停止该项协议判断并说明缺失材料；不猜测、不把跳过算作通过，可继续不依赖该结论的工作。资料职责与获取办法见[开发指南](docs/guide/development.md#参考资料与取证)。
