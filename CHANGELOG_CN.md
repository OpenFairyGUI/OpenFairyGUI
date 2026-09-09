# 更新日志

[English](./CHANGELOG.md)

## 未发布

发布比较：

- 稳定线（`main`）：[v0.6.0...main](https://github.com/OpenFairyGUI/OpenFairyGUI/compare/v0.6.0...main)
- 开发线（`next`）：[v0.6.0...next](https://github.com/OpenFairyGUI/OpenFairyGUI/compare/v0.6.0...next)

## v0.6.x

### v0.6.0（[发布页](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.6.0)）

缺陷修复：

- backend：在异步写入前预占物化目标，排队前复制请求值，拒绝已加锁会话改绑，并在锁释放失败时保留会话。Node 锁元数据读取失败或所有权不匹配时，不再误报关闭成功。
- backend：提交和回滚均失败时，如实报告磁盘状态不确定及保留的恢复目录；分别打包的公开入口也能识别事务结果。
- core：保留仅大小写变化的源文件重命名、全部受支持工程类型及零 pivot 的 anchor；在任何文件写入前拒绝无效资源排序提示。独立持有嵌套 Gear 值与资源元数据，避免共享调用方引用。
- core：目录枚举失败保持不完整状态，支持未提供 stat 的文件/目录混合枚举适配器，并限制二进制读取不得越过传入视图或字符串表边界。
- functions：重复图集发布保持确定性并清理失败尝试的新增节点；根据稳定图片 ID 生成无冲突的恢复字形文件名。

其他：

- backend：集中会话所有权与操作队列，将持久化职责从编辑服务分离，并简化缓存刷新。
- core、functions：共享显示属性更新规则，拆分 XML 与恢复职责，并通过 Core typed image write hints 控制恢复资源顺序。
- workspace、docs：按职责拆分契约生成器，扩充故障注入和安装包消费者验证，同步双语契约、架构与使用指南。

破坏性变更：

- backend、mcp：Backend 契约版本为 `3.0.0`，能力 schema 版本为 `12`。`refreshCache` 同步返回快照；移除 `getJob`、`listJobs`、`cancelJob` 及对应 MCP 接口。宿主需更新能力发现与缓存刷新接入。
- core：自定义文件系统适配器必须区分可选目录不存在（`ENOENT` / `NotFoundError`）与读取失败。未提供 `stat` 时，混合条目目录探测必须以 `ENOTDIR` / `TypeMismatchError` 表示普通文件。

## v0.5.x

### v0.5.0（[发布页](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.5.0)）

本正式版包含 `0.5.0-alpha.1` 至 `0.5.0-alpha.4` 的全部变更。

新功能：

- backend、mcp：新增当前已提交公开 UAM 模型与主资源字节的有界读取，返回独立副本、校验 revision 并如实保留源读取诊断。能力 schema 版本为 11。
- mcp：新增按工具声明失败 schema 的 Host 策略、单次 Backend 委托和公开初始化 instructions。Host 失败保留结构化详情，不扩大 Backend 契约。
- examples、docs：新增奖励面板状态、布局与入场动画、可复用奖励卡生成的可执行 Agent 流程，通过 SDK/MCP 验证保存与独立回读。

缺陷修复：

- core：在 UAM 与工程 XML 往返中保留缺省 Gear 默认值和组件实例控制器覆盖。
- functions：发布时包含位图字体纹理和字形图片，统一解析源字体路径，并将外部字体编码为字体名而不发布其源资源。
- functions：展开发布和代码生成路径中的工程变量，将中文标识符转写为拼音，并避免生成的类名与成员名冲突。
- backend：允许预览修复已有失效引用的事务，同时验证预览结果。
- mcp：恢复 SDK 原生 Host 工具发现及注册生命周期变更；按 schema 识别 JSON 字节数组，并执行合计 8 MiB 的输入字节限制。

其他：

- core、functions、backend：统一公共 XML 状态、Loader3D 属性赋值和保存成功后的收尾逻辑，分离恢复流程的字体准备逻辑，并删除未使用的资源过滤代码。
- workspace：移除消费者辅助函数对运行入口的依赖，在 PR 环境之外要求快速检查提供明确比较基准，并避免本地完整验证中重复的构建和契约检查。
- docs：同步双语协议、架构与验证指引，集中 Agent 接入流程，并将示例与安装指南更新到正式版 `0.5.0`。

破坏性变更：

- core、backend：所有带值 UAM Gear 的默认值均可为 `null`，以保留对象初始值；消费者需要在 Look、Size、Color、Animation 和 FontSize Gear 中处理该情况。Backend 契约版本为 `2.0.0-p3`。

### v0.5.0-alpha.4（[发布页](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.5.0-alpha.4)）

缺陷修复：

- core：在 UAM 与工程 XML 往返中保留缺省 Gear 默认值和组件实例控制器覆盖。
- functions：发布时包含位图字体纹理和字形图片，统一解析源字体路径，并将外部字体编码为字体名而不发布其源资源。
- functions：展开发布和代码生成路径中的工程变量，将中文标识符转写为拼音，并避免生成的类名与成员名冲突。
- backend、mcp：允许预览修复已有失效引用的事务，同时验证预览结果；按 schema 识别 JSON 字节数组，并执行合计 8 MiB 的输入字节限制。

其他：

- core、functions、backend：统一公共 XML 状态和 Loader3D 属性赋值，删除未使用的资源过滤代码，分离恢复流程的字体准备逻辑，并复用保存成功后的收尾逻辑。
- workspace：移除消费者辅助函数对运行入口的反向依赖，扩充回归验证，并同步双语协议与架构文档。

破坏性变更：

- core、backend：所有带值 UAM Gear 的默认值均可为 `null`，以保留对象初始值；消费者需要在 Look、Size、Color、Animation 和 FontSize Gear 中处理该情况。Backend 契约版本为 `2.0.0-p3`。

### v0.5.0-alpha.3（[发布页](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.5.0-alpha.3)）

新功能：

- examples、docs：新增奖励面板状态、布局与入场动画、可复用奖励卡生成三个可执行 Agent 编辑流程，通过 SDK/MCP 消费者验证保存与独立回读。

其他：

- workspace：在 PR 环境之外要求快速检查提供 PR 比较基准，预览计划不执行检查，并移除本地完整验证中重复的工作区构建与契约检查。
- docs：按四种常用场景组织验证入口，同步双语接入与开发指南，并在 PR 模板中记录符合改动范围的检查。

### v0.5.0-alpha.2（[发布页](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.5.0-alpha.2)）

新功能：

- mcp：新增按工具声明失败 schema 的 Host 策略、单次 Backend 委托和公开初始化 instructions。Host 失败保留结构化详情，不扩大 Backend 契约。[#138](https://github.com/OpenFairyGUI/OpenFairyGUI/issues/138)

缺陷修复：

- mcp：恢复 SDK 原生工具发现，包含连接前后注册的 Host 工具及公开注册句柄的生命周期变更，同时保留紧凑契约 schema。

其他：

- workspace：通过 SDK 集成测试与隔离 tarball 消费者验证 Host 组合、审批后真实写入、instructions 和随包文档。
- docs：精简双语 README，将 Agent 接入流程集中到快速开始指南。

### v0.5.0-alpha.1（[发布页](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.5.0-alpha.1)）

新功能：

- backend、mcp：新增当前已提交公开 UAM 模型与单资源主文件字节的有界读取，返回独立副本、校验编辑 revision 并如实保留源读取诊断。能力 schema 版本为 11。[#136](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/136)

其他：

- workspace：通过安装后的 SDK 与 stdio MCP 消费者验证未保存模型及资源字节读取，覆盖陈旧 revision 拒绝和源文件保持不变，并同步公开方法目录文档。

## v0.4.x

### v0.4.0（[发布页](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.4.0)）

新功能：

- backend、mcp：新增绑定 revision 且与会话隔离的工程/包设置与实体属性查询，采用固定投影、显式响应预算与 selector 错误；能力 schema 版本为 10。
- backend、mcp：通过现有异步事务入口在隔离快照上执行并丢弃预演结果，保留诊断且不改变会话或磁盘；预演不预留 revision，也不保证保存成功。
- cli：新增 `inspect --json`，复用现有检查报告且不混入终端日志。
- mcp：提供从 Core 类型生成的操作 schema 与目录资源，按 Backend 方法生成精确输入/输出，并对资源快照的 JSON 字节进行显式转换。

修复：

- core：保留图片校验 Worker 在公开入口被打包消费时的消息监听器初始化。
- core：按发布后的子节点列表计算关联索引，保留动效和 Gear 的合法零值，并拒绝同节点重复 Gear 类型。
- core：正式建模 XY Gear 的百分比坐标；Text/Icon Gear 保留空值、`-` 和包含 `|` 的字符串，无法无损写入工程 XML 的每页分隔符在写入前明确拒绝。
- functions：发布依赖与图集扫描读取正式 Gear 按页值，组件出场/退场音效进入资源闭包。

其他：

- workspace：加入可复现开发指引、固定 fixture 校验、只读环境诊断、变更影响测试选择与统一质量入口，并在 PR 中检查文档构建、指令链接和双语记录结构。
- workspace：发布前在隔离的生产消费者中验证五包 tarball，覆盖导出、ESM/CJS 类型、浏览器打包、CLI/MCP，以及与文档共享的可运行 inspect/validate 和 revision-checked edit/save 示例。
- workspace：从正式 TypeScript 类型生成契约快照与双语目录，在仓库和文档检查中拒绝方法映射遗漏及生成物漂移。

破坏性变更：

- workspace：最低要求 Node.js 22，停止支持 Node 20。CI、文档部署和发布流程统一使用 Node 22，保留 Linux/Windows 消费者检查。
- mcp：拒绝封闭契约对象的未知字段和无效嵌套 payload。移除共享的 `OPENFAIRYGUI_BACKEND_TOOL_OUTPUT_SCHEMA` 导出，改用各工具定义的精确 `outputSchema`。
- core、backend：XY/Text/Icon Gear 默认值允许 `null` 表示未覆盖，Backend 契约版本为 `2.0.0-p2`。纯内存会话保存或物化需要宿主显式绑定存储或提供文件系统，路径标签不再自动取得 runtime 文件系统能力。

## v0.3.x

### v0.3.1（[发布页](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.3.1)）

修复：

- core：收紧二进制与 XML 信任边界，加入解压资源预算、数值范围校验和安全 XML 转义，并将位图字体 glyph ID 按无符号 16 位协议读写。
- backend,mcp：加入工程根目录白名单与真实路径 containment、打开前全树符号链接拒绝、陈旧锁恢复、唯一会话 ID、原子工程保存、有界 MCP 入参以及稳定且不泄漏内部信息的错误封装。
- functions：统一结构化 SVG 安全校验，使声明的插件在加载或 hook 失败时默认中止发布，并对显式 Node 输出目录采用可回滚的目录切换。

其他：

- workspace：统一要求 Node.js 20 及以上，扩展 Node 20/22/24 CI、跨平台清理与 lint 覆盖，并记录公开 API 稳定性边界和发布事务限制。

从 `v0.3.0-alpha.1` 到 `v0.3.0-alpha.4` 的预发布版本统一归入下方正式版记录。`v0.3.0` 同时包含截至 `v0.2.6` 的全部稳定版修复。

### v0.3.0（[发布页](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.3.0)）

新功能：

- functions,cli：新增工程验证工作流，提供 `valid`、`invalid`、`incomplete` 结果、桌面编辑器兼容的几何校验、诊断信息与 JSON 输出。[#96](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/96) [#99](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/99) [#101](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/101)
- mcp：新增 `openfairygui_backend_get_project_outline`，用于获取与 revision 绑定的精简工程结构。[#93](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/93)

修复：

- core：在 UAM lift/materialize 与工程 XML 往返过程中保留跨包图片的 `packageId`，并允许标准 SVG namespace，同时继续拒绝外部或可执行脚本的 SVG 来源。[#124](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/124)

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

### v0.2.6（[发布页](https://github.com/OpenFairyGUI/OpenFairyGUI/releases/tag/v0.2.6)）

新功能：

- core：将 SWF 资源、controller page 备注、loader 错误标记和组件自定义扩展 ID 建模为正式的 Project XML、UAM 与二进制属性。[#121](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/121)

修复：

- core：将按钮按下效果、依布局变化的 List 默认值、Transition 帧率、属性覆盖、tile-grid 元数据、裁剪 sprite 原始尺寸及其余组件 XML 字段与编辑器和运行时协议对齐。[#121](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/121)
- functions：强制执行运行时支持的压缩、资源文件名、Layabox 图集旋转与 Cocos Creator 运行时导入规则。[#121](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/121)
- functions：发布时应用包排除列表、发布清空投影、包级图集设置、选中状态资源闭包与 Unity 分离 Alpha 输出。[#121](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/121)

其他：

- docs：补齐双语发布记录、当前版本状态、英文整数几何协议与公开包入口说明，并将双语 Changelog 同步纳入发布约束。[#120](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/120)
- docs：同步架构、编辑器发布设置与二进制封包协议文档，使其与修复后的实现保持一致。[#121](https://github.com/OpenFairyGUI/OpenFairyGUI/pull/121)

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
