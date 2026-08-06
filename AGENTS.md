# OpenFairyGUI Maintainer Notes

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
| 证据来源优先级 | 当样本不足以确定字段语义、默认值、枚举值或归属时，优先查 `referer/Editor/scripts/fairygui/editor` 中的编辑器源码和 `referer/Docs` 中的官方文档，再决定正式模型；不要只凭样本名或内部实现猜测字段含义。 |
| 临时桥接字段 | 若必须先放 `extras`，应在后续任务中明确收口计划 |
| 二进制文件对比 | 对比 `.fui/.bytes` 时，不要把包头 `Version` 差异直接视为问题依据；FairyGUI 运行时对该版本字段向下兼容，判断偏差应优先看反序列化后的语义、block 结构和字段内容 |

## referer 取证指南

### 查证顺序

1. 先看 `referer/Docs`，确认官方概念、编辑器行为、术语和用户可见规则。
2. 再看 `referer/Editor/scripts/fairygui/editor` 与 `referer/Editor/scripts/fairygui/editor/worker`，确认旧版编辑器真实实现、工程读写和发布链路。
3. 需要验证字段落点、资源命名或封包结果时，对照 `referer/UIProject` 与 `referer/Release` 的同名样例做工程/产物配对检查。
4. 需要确认运行时如何消费资源时，再看 `referer/Runtimes`。
5. 需要确认新版编辑器插件接口、界面工程或设置样例时，看 `referer/FairyGUI-Editor`。
6. `referer/API`、`referer/fgui-restore`、`referer/glTF-Transform` 仅作补充参考，不替代前面的主证据链。

### 目录职责

| 目录 | 用途 | 使用规则 |
|---|---|---|
| `referer/Docs` | 官方中英文文档，覆盖编辑器、发布、组件、SDK、Unity/Lua 等说明 | 优先用于确认术语、默认行为、用户可见规则；文档与样本冲突时，再用源码核实实现细节 |
| `referer/Editor/scripts/fairygui/editor` | 旧版编辑器 AS3/AIR 源码，是工程结构、发布设置、封包流程的重要实现依据 | 优先看 `publish/exporter`、`settings`、`gui`、`api`；协议、命名、写回规则以这里的实现为关键证据 |
| `referer/Editor/scripts/fairygui/editor/worker` | 旧版编辑器的 worker 侧消息与转换逻辑 | 主线程源码找不到的发布/转换细节，要补查这里，不要只看 `editor` 主目录就下结论 |
| `referer/UIProject` | 旧版编辑器工程样例 | 用于观察真实 XML 标签分布、字段出现条件、设置写法；判断字段归属时优先基于这里的真实工程 |
| `referer/Release` | 与 `referer/UIProject` 对应的旧版发布产物 | 用于核对旧版发布后的文件命名、资源拆分、二进制输出；应与 UI 工程配对分析，不要脱离源工程单独猜协议 |
| `referer/Runtimes` | Unity、Layabox 等运行时代码和 demo，内含新版编辑器导出的 UIProject | 用于确认运行时如何消费资源、对哪些产物结构敏感；它是消费侧证据，不是编辑器协议建模的一手来源 |
| `referer/FairyGUI-Editor` | 新版编辑器界面工程、设置样例、插件示例、TS/Lua 插件接口 | 用于确认新版编辑器的设置 JSON 形状、插件 API、Inspector/界面组织；不要单靠它反推底层二进制协议 |
| `referer/API` | 静态 API 文档页面 | 适合快速查类名、方法名、接口面；页面文件名是哈希，检索成本高，源码和官方文档优先级更高 |
| `referer/fgui-restore` | 小型二进制样本和恢复脚本 | 适合做 parser sanity check、回归夹具和旧版产物快速解包验证，不作为正式协议定义来源 |
| `referer/glTF-Transform` | 参考项目 | 仅借鉴分包、命名、测试、API 设计风格；不要把这里的架构或实现习惯当作 FairyGUI 协议依据 |

### 具体约束

| 场景 | 默认做法 |
|---|---|
| 发布产物命名差异 | 先查 `referer/Editor/scripts/fairygui/editor/publish/exporter`；命名差异通常是 exporter 分支差异，不代表协议不同 |
| 发布设置字段含义 | 先看 `referer/Docs` 的发布文档，再对照 `referer/UIProject/*/settings/*.json`、`referer/FairyGUI-Editor/ui/settings/*.json` 和编辑器源码 |
| 工程 XML 字段归属 | 先在 `referer/UIProject` 与 `referer/Runtimes/*/UIProject` 中统计真实标签分布，再决定是否进入正式属性 |
| 新旧编辑器差异 | 先区分样本来自旧版还是新版：`referer/UIProject`/`referer/Release` 主要是旧版，`referer/FairyGUI-Editor` 与 `referer/Runtimes/*/UIProject` 更接近新版 |
| 二进制回归验证 | 优先做“工程样例 -> 发布产物”成对对照；不要只拿单个 `.bin`、`.bytes` 或 `_fui.bytes` 文件推断完整规则 |
| 运行时兼容性判断 | 先看 `referer/Runtimes` 的消费代码与 demo，再回头核对导出规则；运行时能兼容不等于上游协议应该照搬历史写法 |
| API/插件问题 | 先看 `referer/FairyGUI-Editor/plugin` 和 `referer/API`；若接口行为不清楚，再回查编辑器源码或官方文档 |
| 噪声目录处理 | `referer/Runtimes/Unity/Library`、缓存文件、静态页面哈希文件不作为优先分析对象，除非任务明确要求 |
