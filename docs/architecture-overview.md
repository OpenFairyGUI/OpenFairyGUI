# OpenFairyGUI 架构图说明

## 结论

当前仓库在 **Gate A** 阶段更适合理解成七段式结构：`输入源 -> 协议适配 -> 统一声明式 Authoring Model -> 内部图物化层 -> 工作流 / 后端运行时 -> MCP 薄适配 -> 输出物`。  
其中新的主真相层是 **Unified Authoring Model (UAM)**；`Document + Property Graph` 仍然存在，并且当前大多数既有流程仍围绕它执行，但在架构定位上已经进入内部执行 / 存储 / 适配层，而不是长期公开的 authoring 中心。  
当前还存在两条关键后端接缝：

- **UAM-public / Document-private** 的 Phase A authoring transaction seam
- 建立在该 seam 之上的 `backend` stateful runtime / service layer

```mermaid
flowchart LR
    subgraph IN["输入源"]
        PROJ["FairyGUI 工程目录<br/>.fairy / settings / package.xml / component.xml"]
        PACK["发布包文件<br/>.fui / .bin / _fui.bytes"]
    end

    subgraph IO["协议适配与 I/O"]
        FS["PlatformIO / NodeIO / WebIO / BackendStorageFS"]
        PR["ProjectReader"]
        BR["BinaryReader"]
        PW["ProjectWriter"]
        BW["BinaryWriter"]
    end

    subgraph UAM["统一声明式 Authoring Model"]
        UPROJECT["UAM Project"]
        UPKG["UAM Package / Resource"]
        UCOMP["UAM Component"]
        UBEHAVIOR["DisplayList / Controller / Transition / Gear"]
        UTX["Phase A Transaction Kernel<br/>explicit ops / support preflight / UAM-native or Document commit"]
    end

    subgraph GRAPH["内部图物化层"]
        DOC["Document"]
        ROOT["Root / Package"]
        RES["Resource 集合"]
        COMP["Component 语义结构"]
        UI["DisplayList / Controller / Transition / Gear"]
    end

    subgraph WF["工作流能力"]
        OPS["inspect / validate / prune / rename"]
        APP["Phase A authoring app seam"]
        PUB["publish core"]
        PUBNODE["publishNode"]
        PUBWEB["publishBrowser"]
        RST["受限 restore<br/>trusted-local recovery"]
        ATLAS["atlas"]
        CG["codegen"]
        PUBNODE --> PUB
        PUBWEB --> PUB
    end

    subgraph BE["状态化后端服务层"]
        RT["BackendRuntime"]
        RS["read services"]
        AS["authoring services"]
        AR["artifact bridge manifest<br/>publish / restore Node boundary"]
        RU["runtime/admin services"]
        SS["session registry / revision / dirty"]
        LK["canonical path / advisory lock"]
        SV["per-session serialized save (non-atomic)"]
        CAP["capability planes / version surface"]
        EV["runtime events<br/>polling cursor / retention"]
        JOB["in-memory jobs<br/>cache.refresh / cooperative cancel"]
        CACHE["derived read-only cache<br/>revision-bound"]
    end

    subgraph MCP["MCP 薄适配层"]
        MS["McpServer"]
        MT["backend P2 tools"]
        MR["identity resources / prompts"]
        STDIO["stdio transport"]
    end

    subgraph OUT["输出物"]
        PROJOUT["工程文件写回<br/>.fairy + settings + assets/*"]
        BIN["发布包<br/>.fui / .bin / _fui.bytes"]
        ART["发布附属资源<br/>atlas*.png / sounds / 其他文件"]
        CODEOUT["生成代码<br/>binder / component classes"]
    end

    PROJ --> FS --> PR --> DOC --> UPROJECT
    PACK --> FS --> BR --> DOC --> UPROJECT
    PACK --> RST
    ART --> RST
    RST --> UPROJECT

    UPROJECT --> UPKG --> UCOMP --> UBEHAVIOR
    UPROJECT --> UTX --> DOC
    UTX --> UPROJECT
    DOC --> ROOT --> RES --> COMP --> UI
    UPROJECT --> OPS
    UPROJECT --> APP
    APP --> RT
    RT --> RS
    RT --> AS
    RT --> AR
    RT --> RU
    RT --> SS
    RT --> LK
    RT --> SV
    RT --> CAP
    RT --> EV
    RT --> JOB
    RT --> CACHE
    RT --> MS
    MS --> MT
    MS --> MR
    MS --> STDIO
    PUB --> ATLAS
    PUB --> BW
    PUB --> CG
    RST --> BR
    RST --> PW

    UPROJECT --> PW
    APP --> PW
    DOC --> PW
    PW --> PROJOUT
    BW --> BIN
    ATLAS --> ART
    CG --> CODEOUT
```

## 关键细节

| 层级 | 当前职责 | 核心文件 |
|---|---|---|
| 入口层 | 命令行注册、参数解析与 workflow 装配 | `packages/cli/src/cli.ts`、`packages/cli/src/commands/*.ts`、`packages/cli/src/utils/*.ts` |
| 协议适配层 | 屏蔽平台文件系统差异，承接工程格式、二进制格式与工程 XML 协议元数据 | `packages/core/src/io/platform-io.ts`、`packages/core/src/io/node-io.ts`、`packages/core/src/io/web-io.ts`、`packages/core/src/io/project-xml-protocol.ts`、`packages/core/src/io/project-reader.ts`、`packages/core/src/io/binary-reader.ts`、`packages/core/src/io/component-decoder.ts` |
| UAM 主真相层 | 统一声明式工程级 authoring model，承接 `project / package / resource / component internals` 与行为语义，并公开 Phase A transaction kernel | `packages/core/src/uam/*.ts` |
| 内部图物化层 | `Document` 持有 `Property Graph`，用于当前内部执行、存储、适配与既有工作流复用 | `packages/core/src/document.ts`、`packages/core/src/properties/property.ts` |
| 项目骨架层 | `Root -> Package -> Resource -> Component` 组成基础结构 | `packages/core/src/properties/root.ts`、`packages/core/src/properties/package.ts`、`packages/core/src/properties/component.ts` |
| 工作流层 | 面向自动化的可组合处理管线，以及建立在 `core` Phase A transaction contract 之上的薄 authoring app seam | `packages/functions/src/inspect.ts`、`packages/functions/src/validate.ts`、`packages/functions/src/prune.ts`、`packages/functions/src/rename.ts`、`packages/functions/src/publish.ts`、`packages/functions/src/publish/contracts.ts`、`packages/functions/src/adapters/node/publish.ts`、`packages/functions/src/adapters/web/publish.ts`、`packages/functions/src/node.ts`、`packages/functions/src/web.ts`、`packages/functions/src/restore.ts`、`packages/functions/src/codegen.ts`、`packages/functions/src/uam-transaction.ts` |
| 状态化后端服务层 | browser-safe project session、browser-safe async project storage adapter、adapter-backed file session、revision/dirty tracking、backend-local canonical path / advisory lock、coordinated save、capability planes / manifest、version surface、runtime events、in-memory jobs、derived read-only cache，以及 `read / authoring / artifact / runtime` service stratification | `packages/backend/src/runtime.ts`、`packages/backend/src/storage.ts`、`packages/backend/src/node.ts`、`packages/backend/src/contracts.ts`、`packages/backend/src/path-policy.ts`、`packages/backend/src/services/*.ts` |
| MCP 薄适配层 | 把 backend P2 方法完整映射为 MCP tools；承接 stdio transport、MCP tool output schema、identity resources 与 guidance prompts，不重新定义 UAM / backend 语义 | `packages/mcp/src/server.ts`、`packages/mcp/src/tool-definitions.ts`、`packages/mcp/src/tool-handler.ts`、`packages/mcp/src/resource-definitions.ts`、`packages/mcp/src/prompt-definitions.ts`、`packages/mcp/src/stdio.ts` |
| 输出层 | 工程文件写回、图集产物生成、二进制封包输出与代码生成输出 | `packages/core/src/io/project-writer.ts`、`packages/functions/src/atlas.ts`、`packages/core/src/io/binary-writer.ts`、`packages/functions/src/codegen.ts` |

补充说明：
- `@openfairygui/core` 当前同时承载 UAM 主真相层与内部图物化层。
- `packages/core/src/uam/model.ts` 当前的 materialization scope 覆盖现有全部 display node 类：`GImage`、`GTextField`、`GRichTextField`、`GTextInput`、`GComponent`、`GList`、`GTree`、`GGraph`、`GGroup`、`GLoader`、`GLoader3D`、`GMovieClip`、`GButton`、`GLabel`、`GComboBox`、`GProgressBar`、`GSlider`、`GScrollBar`。其中 component-derived controls 以具体 UAM node kind 建模，不通过长期 `extras` 或通用属性袋承载。
- `packages/core/src/uam/transaction.ts` 当前提供的是 **UAM-public explicit operation batch API**；它的 `commit()` 结果是新的 normalized `UamProject`。纯 `setDisplayNodeProps`、包/组件生命周期事务，以及生命周期与 `attachDisplayNode` / `detachDisplayNode` 引用重写的混合批次直接在 UAM 上执行；未触及的复杂节点、引用、relation、transition 作为 lossless passthrough 保留，其余资源、结构和 gear 事务通过私有 `Document` 工作副本执行，并在失败时整体丢弃。
- `packages/core/src/uam/bridge.ts` 当前负责 UAM 与内部 `Document` 之间的 lift/materialize。真实工程里可保存但不一定可解析到当前资源图的弱引用会按工程 XML 语义透传：空 relation target 表示组件容器，display resource refs 允许悬空或跨包保留，transition item target 与 display gear pages 允许保留编辑器旧数据。`validateUamProject` 只阻塞会破坏当前物化/写回的硬结构错误。
- `ProjectReader.read(path, { hydrateResourceBytes: true })` 是 source-byte hydration 的显式入口；它会为 main 与 branch package 中的 image、sound、misc、font、movie-clip、Spine、DragonBones 资源附加 primary source bytes，并拒绝 XML 中包含 traversal 的资源路径。UAM bridge 在 lift/materialize 时复制 `Uint8Array`，不以 JSON clone 承载二进制数据。
- UAM materialization scope 与 transaction scope 是两个独立能力面；全量 display node lift/materialize 不代表 `UamTransactionOperation` 已开放这些 node kind 的全字段 mutation。当前 transaction scope 覆盖已建模资源的 rename/move、二进制资源 add/replace/remove、基础 display props、attach/detach、controller、transition，以及 `display`、`display2`、`look`、`xy`、`size`、`color`、`animation`、`text`、`icon`、`fontSize` gear 的 add/update/remove；它仍不开放任意 display-list、controller 或 transition 的面板式编辑。二进制资源的 rename/move/replace/remove 要求 UAM 持有已水合的 primary source bytes。`validateTransactionSupport(project)` 保留全项目体检语义；`validateTransactionSupport(project, operations)` 与实际 transaction preflight 按 operation touch-set 判定，并在物化前拒绝缺失源字节、无效 controller/page、被操作 transition 中的无效 target 引用、重复或无效 gear，以及不安全的新增资源 source path。UAM/writer 同时拒绝会覆盖 package descriptor、component XML 或其他资源的输出目标。
- `packages/functions/src/uam-transaction.ts` 当前提供的是建立在上述 transaction contract 之上的 **thin stateless pre-MCP app seam**；它只接收 `UamProject + UamTransactionOperation[]`，返回结构化 app result，不重新定义 selector / op grammar，也不暴露 `Document`。
- `packages/backend/src/runtime.ts` 当前提供 browser-safe 的第一层 **stateful backend runtime**；它通过 `functions.applyUamTransactionApp` 包装既有 authoring seam，支持 `openProjectSession` 直接从 UAM project 建立纯内存 session，并可在 session 级注入 browser-safe async project storage 承接 clean session `materializeSession` 与 dirty session `saveSession` 工程写回。file-backed `openSession` 会显式水合资源 primary source bytes，并比较原始 `Document` 与 UAM 往返后的完整 `ProjectWriter` 输出；存在未建模写回差异时，session 标记为 `uamFidelity: unsupported`，实际写盘返回 `uam_fidelity_unsupported`。
- `packages/backend/src/storage.ts` 当前提供 browser-safe 的 async storage adapter factory：`createBackendStorageFileSystem()` 把 OPFS、IndexedDB、ZIP 虚拟文件系统或 File System Access API bridge 适配为 backend/core project writer 可共用的文件系统面，并要求 storage 提供 `unlink`。写回时先写新的工程内容和 primary resource bytes，只有全部写入成功后才按结构化 package source reference 删除已被 rename/move/remove 替换的旧 source files；dirty `saveSession` 始终写回 session 绑定的文件系统。
- `packages/backend/src/runtime.ts` 的 capability authoring scope 当前声明正式 UAM lift/materialize 与 transaction 覆盖面；`authoring.transactionScope` 单独声明 `applyTransaction` 的正式 operation 范围，避免把全量 UAM display node 建模误解成任意字段 mutation 能力。
- `packages/backend/src/node.ts` 当前只承接 Node 默认装配：Node filesystem adapter、Node lock metadata，以及 `createNodeBackendRuntime()`。根入口不再默认导入 Node 文件系统。
- `packages/backend/src/services/*.ts` 当前把 backend 进一步分成 `read / authoring / artifact / runtime` 四类内部服务面；`authoring` plane 以 per-session 队列串行化 transaction、save 与 materialize，使一次写盘完成后的 `dirty / lastSavedRevision / stale source path` 只对应实际落盘 revision。`materializeSession` 可在不推进普通 edit revision 的情况下把可保真 clean session 完整写入 project storage，并返回 `writtenPaths / skippedPaths / diagnostics / lastSavedRevision`；`artifact` plane 不执行 `publish` / `restore`，而是通过 capability manifest 声明它们需要 `@openfairygui/backend/node` 侧的 Node bridge boundary。
- `packages/backend/src/contracts.ts` 当前提供 backend contract version、capability schema version、compatibility policy，以及统一 response metadata / diagnostics 面；当前 metadata 至少覆盖 `requestId / sessionId / revision / durationMs / warnings / diagnostics / stage`，失败 envelope 会稳定把错误码/消息镜像到 `meta.diagnostics`。Transaction failure diagnostics 额外保留稳定 `code / path / nodeKind / operationKind` 字段，供浏览器编辑器禁用对应操作或定位提示。
- `packages/backend/src/services/event-service.ts` 当前提供 per-runtime monotonic sequence 的 polling event snapshot，事件按 session 绑定并保留最近 1000 条；不提供 subscription 或 transport-specific cursor。
- `packages/backend/src/services/job-service.ts` 当前只支持 `cache.refresh` in-memory job，提供 queued/running/completed/failed/cancelled 状态、active/terminal 查询、cooperative cancel，以及每 session 最近 100 个终态 job 保留。
- `packages/backend/src/services/cache-service.ts` 当前提供 revision-bound derived read-only cache snapshot；cache 只作为运行时索引和摘要，不作为 source of truth。
- `packages/mcp/src/*` 当前提供 **thin backend P2 MCP adapter**；它完整映射 backend 的 `getCapabilities / openSession / getSession / applyTransaction / saveSession / materializeSession / closeSession / getEvents / getJob / listJobs / cancelJob / getCacheSnapshot / refreshCache`，并为这些工具提供共享 backend envelope output schema。
- `packages/mcp/src/resource-definitions.ts` 当前只提供 identity-addressable read-only snapshots：capabilities、session、cache、job；`getEvents` 与 `listJobs` 仍保持 tool 形式，不引入 MCP URI query grammar。
- `packages/mcp/src/prompt-definitions.ts` 当前只提供 guidance prompts，引导客户端使用既有 backend tools；prompts 不定义 transaction grammar、selector grammar 或具体 operation payload。
- `@openfairygui/mcp` 不拥有 transaction grammar、selector grammar、path policy、job semantics、cache semantics 或 artifact publish/restore；MCP roots 只作为客户端上下文说明，路径安全仍由 backend path policy 决定。
- `BinaryReader` 仍然是二进制读入口；component block 的展开逻辑当前拆到内部 helper `component-decoder.ts`，对外调用面不变。
- `@openfairygui/functions` 仍以 workflow composition 为主，不重新定义底层协议；当前 `publish` 与 `restore` 仍主要围绕图物化后的内部表示执行，新 authoring seam 也明确不包装 `publish` / `restore`。
- `@openfairygui/backend` 不拥有 transaction grammar / selector grammar / support semantics；它只承接 stateful runtime concerns，并保持 transport-neutral。根入口是 browser-safe API 面，Node 文件系统与必须 Node 执行的 artifact 能力通过 `@openfairygui/backend/node` 明确桥接。
- `@openfairygui/core` 根入口当前保持 browser-safe，不再导出 `NodeIO` 或 `WebIO`；Node 默认工程 I/O 只从 `@openfairygui/core/node` 暴露，浏览器工程目录读写只从 `@openfairygui/core/web` 暴露。需要 project reader / writer adapter 类型但不能引入平台文件系统实现时，使用 `@openfairygui/core/project-io`。
- `@openfairygui/core/web` 当前只承接 browser-safe 的 FairyGUI 工程树读写：它通过可注入 Core `FileSystem` 或 File System Access API directory handle 适配 `.fairy / settings / assets`，不暴露 binary package I/O，不执行 `publish` / `restore`，也不提供 backend session lifecycle、path policy 或 capability manifest。
- `@openfairygui/backend` 根入口当前提供 browser-safe async storage bridge；浏览器宿主把 OPFS、IndexedDB、ZIP 虚拟文件系统等实现注入 `openProjectSession` 后，`materializeSession` 可用于 workspace bootstrap / first write，`saveSession` 使用该 session 绑定的文件系统写回 dirty session。
- `@openfairygui/functions/uam` 当前只暴露 UAM transaction app seam，用于 `@openfairygui/backend` browser root entry；根入口的 `publish` 是 capability-injected 内核，正式 Node/Web 宿主入口分别是 `@openfairygui/functions/node` 与 `@openfairygui/functions/web`。
- 当前 Unity、Layabox、Cocos Creator 共用同一条 `publish -> atlas / binary / codegen` 主链；差异主要体现在描述文件扩展名和代码生成 lane 选择，而不是工作流分叉。
- `@openfairygui/cli` 是入口层，不下沉协议细节；`cli.ts` 只负责 program 注册和进程生命周期，`inspect`、`publish`、`restore`、backend capabilities 分别由独立 command 模块装配。

## Publish 宿主边界

`publish.ts` 只编排发布设置、资源闭包、atlas、二进制写出与通用代码生成；文件系统、raster backend 与 publish hooks 都由宿主提供。

- `@openfairygui/functions/node` 的 `publishNode()` 组装 Node 文件系统、Sharp 与工程 `plugins/` 自动发现。
- `@openfairygui/functions/web` 的 `publishBrowser()` 接收调用方的源/输出 `FileSystem`，用 Canvas 生成 atlas PNG，注入空 hooks，并关闭非 runtime 代码生成。

两种宿主都复用 `publish -> atlas / BinaryWriter` 主链；Web 入口不经过 backend Node bridge。

## 当前工程 XML 协议元数据结构

`packages/core/src/io/project-xml-protocol.ts` 当前已经把工程 XML 协议拆成三层元数据：

| 层 | 作用 | 当前典型节点 |
|---|---|---|
| `attrs` | 描述节点自身允许的 XML 属性，统一 canonical 名与 aliases | `componentRoot.attrs`、`componentInstance.attrs`、`image.attrs`、`packageImageResource.attrs` |
| `children` | 描述稳定命名子节点集合，用于 `relation`、`gear*`、`action`、`item`、扩展子节点等结构 | `componentInstance.children`、`controller.children`、`transition.children`、`comboBoxExtension.children` |
| `containers` | 描述容器型结构，而不是普通 child map；当前用于表达有序多态的 `displayList` | `componentRoot.containers.displayList` |

当前三层结构的职责边界如下：

| 元数据层 | 当前 reader / writer 使用方式 | 当前限制 |
|---|---|---|
| `attrs` | `ProjectReader / ProjectWriter` 已作为属性读写的主依据 | 不表达结构条件 |
| `children` | 已参与稳定结构节点的读写与集合校验 | 目前是静态允许集合，不表达 `advanced=true`、`extention=...` 这类条件 |
| `containers` | 当前已参与 `displayList` 变体集合校验 | 只表达允许的 variant 集合，不负责顺序算法，也不表达 `text -> inputtext`、`list -> tree` 这类条件归一来源 |

`displayList` 当前在协议层的表达不是普通 `children.displayList`，而是容器元数据：

| 项目 | 当前实现 |
|---|---|
| 容器宿主 | `componentRoot` |
| 容器名 | `displayList` |
| 容器类型 | `orderedVariants` |
| 当前 variant 集合 | `image`、`graph`、`movieclip`、`jta`、`component`、`loader`、`loader3D`、`text`、`richtext`、`inputtext`、`group`、`list`、`tree` |

其中：

- `attrs` 和 `children` 已经进入 `ProjectReader / ProjectWriter` 的正式消费路径。
- `containers.displayList` 当前用于读写期的合法性校验，不直接替代现有 `displayList` 的顺序解析和序列化逻辑。
- 当前正式属性协议总表见 [Project XML 属性协议](./project-xml-attribute-reference.md)。
- `displayList` 的原始 XML tag、容器 variant 与 editor `DisplayListItem.type` 对齐口径，见 [Project XML DisplayList Tag 对齐](./project-xml-displaylist-variants.md)。

## 当前工程 XML 资源层覆盖

`ProjectReader / ProjectWriter` 当前对 `package.xml` 资源层的正式覆盖范围如下：

| 节点 | 当前正式读写属性 |
|---|---|
| `packageDescription` 骨架 | `id` |
| `branchDescription` 骨架 | 分支资源清单根节点 |
| `packageDescription > publish` | `name`、`path`、`branchPath`、`packageCount`、`genCode`、`codePath`，以及子节点 `atlas@name/index` |
| 通用资源节点 | `id`、`name`、`path`、`exported` |
| `image` 资源 | `atlas`、`scale`、`scale9grid`、`width`、`height`、`gridTile`、`qualityOption`、`duplicatePadding`、`smoothing` |
| `movieclip` 资源 | `atlas` |
| `font` 资源 | `texture`、`renderMode`、`samplePointSize` |
| `misc` 资源 | 无附加属性；资源文件名由通用 `name` 承载 |
| `spine` 资源 | `width`、`height`、`require`、`atlasNames`、`anchor` |
| `dragonbones` 资源 | `width`、`height`、`require`、`atlasNames`、`anchor` |

其中 `image@atlas` 与 `movieclip@atlas` 当前分别作为图片和动画资源的纹理集模式字段读写，在正式模型中由 `ImageResource.textureSetMode` 与 `MovieClipResource.textureSetMode` 承载。

## 当前分支工程目录口径

`ProjectReader / ProjectWriter` 当前已按编辑器目录结构处理资源分支：

| 目录 / 文件 | 当前口径 |
|---|---|
| `assets/<包名>/package.xml` | 主分支资源清单 |
| `assets_<branch>/<包名>/package_branch.xml` | 指定分支的资源清单 |
| `Root.branches` | 当前工程已发现的分支名列表 |
| 资源节点 `branch` | 分支资源通过正式资源字段区分，不再停留在临时 `extras` |

## 当前发布附属资源口径

`publish` 当前除二进制描述文件外，还会输出资源闭包内需要的附属文件。当前正式规则如下：

| 资源类型 | 当前发布行为 |
|---|---|
| `SoundResource` | 输出发布后的声音文件名 |
| `MiscResource` | 输出资源文件；Unity 项目中源文件扩展名为 `.atlas` 时，发布名改为 `.atlas.txt`，其他项目保持原文件名 |
| `ImageResource` / `MovieClipResource` 高分辨率变体 | 当 `includeHighResolution` 启用对应倍率时，按同路径、同分支、同类型的 `@2x` / `@3x` / `@4x` 资源加入发布闭包，并在基础 item 的 high-resolution 列表中引用；发布流程不主动缩放原图 |
| `SpineResource` | 输出 skeleton 主文件；Unity 项目中源文件扩展名为 `.skel` 时，发布名改为 `.skel.bytes`，其他项目保持原文件名 |
| `DragonBonesResource` | 输出 skeleton 主文件，当前保持原文件名 |
| `SpineResource` / `DragonBonesResource` 依赖 | 按 `require` 形成资源闭包，依赖的 `misc` / `image` 资源一并发布 |

发布输出采用完整性优先的失败口径：已解析到输出目录时必须有文件系统能力；存在可封包的图像时必须有 raster encoder、源资源路径和 atlas 输出目录；图集装箱/合成、声音或外部资源复制失败都会中止发布，不会报告为成功。

## 当前分支发布口径

`publish` 当前已区分两种分支发布语义：

| 模式 | 当前实现 |
|---|---|
| `主干包含所有分支` | 保留包级 branch 表与主资源到分支资源的 item 映射，运行时可再切换分支 |
| `主干合并活跃分支` | 先在发布期选出主干与活跃分支合并后的资源集合，再进行 atlas 与二进制描述文件写出；分支资源复用主资源 id，二进制不再写 branch 表 |

当前 `publish` 在 `主干合并活跃分支` 模式下还会接受一个显式的活跃分支输入；未指定时视为发布主干。

## 受限发布产物恢复

`restore` 不是常规 authoring 工作流。它只用于可信本地发布目录的辅助恢复，输出为独立工程目录；不承诺原工程设置、历史布局或源码级一致性。

| 边界 | 当前行为 |
|---|---|
| 输入 | 读取同目录 `*_fui.bytes` / `.fui`、图集和 loose 资源；资源路径与解析后的源文件都必须留在输入目录内 |
| 写入 | 先在相邻暂存目录重建工程和资源，完整成功后才替换目标目录 |
| 恢复内容 | 按二进制和同目录资源重建当前模型可表达的包、素材、部分 `.jta` / `.fnt` 与 skeleton sidecar 关系 |
| 非目标 | 不处理未知产物的安全判定，也不恢复原始编辑器设置、文件命名、XML 文本或本地工作区状态 |

## 当前最关键的数据流

```mermaid
flowchart TD
    A["工程目录输入"] --> B["ProjectReader"]
    X["二进制包输入"] --> Y["BinaryReader"]
    R["可信本地发布目录<br/>.fui/.bytes + atlas/sounds"] --> S["受限 restore"]
    B --> C["Document / Property Graph"]
    Y --> C
    S --> C
    C --> U["Unified Authoring Model"]
    U --> D["结构检查与整理<br/>UAM normalization / validation"]
    U --> T["UAM transaction kernel<br/>explicit ops -> bytes/refs/gear preflight -> UAM-native props/lifecycle rewrites or private Document commit"]
    U --> A2["functions app seam<br/>structured app result / no Document leakage"]
    A2 --> B2["backend runtime<br/>session / revision / save / lock / capabilities"]
    B2 --> B3["service planes<br/>read / authoring / artifact / runtime"]
    B3 --> B4["runtime coordination<br/>events / jobs / cache"]
    B2 --> M1["MCP adapter<br/>backend P2 tools / resources / prompts / stdio"]
    T --> U
    T --> C
    U --> F["工程写回<br/>ProjectWriter via narrow materialization"]
    A2 --> F
    B2 --> F
    U --> C
    C --> EN["Node 发布适配<br/>publishNode"]
    C --> EW["Web 发布适配<br/>publishBrowser"]
    EN --> E["发布内核<br/>publish"]
    EW --> E
    E --> G["图集布局与合图<br/>atlas"]
    E --> H["二进制写出<br/>BinaryWriter"]
    F --> I["FairyGUI 工程输出"]
    G --> J["atlas PNG / 附属资源"]
    H --> K[".fui / .bin / _fui.bytes"]
```

## UAM package / component 生命周期事务

`@openfairygui/core/uam` 的公开 `UamTransactionOperation` 包含以下直接在 UAM 上执行的生命周期操作：

- `addPackage` 以完整 `UamPackage` 快照和 `atIndex` 新增包；`renamePackage`、`removePackage` 使用稳定的 `packageId` selector。
- `addComponent` 以完整 `UamComponentResource` 快照和 `atIndex` 新增组件，快照包含初始 `displayList`、controller 与 transition；`removeComponent` 使用 `packageId + componentResourceId` selector。
- `moveComponent` 使用组件 selector、目标 `toPackageId` 与 `toIndex` 在包之间移动组件。

生命周期操作可与 `attachDisplayNode` / `detachDisplayNode` 组成 transaction batch；其他非生命周期操作仍需单独提交。预检会按整个批次的投影状态校验 selector、插入位置和最终引用，执行阶段在同一份 UAM 工作副本中原子应用。display resource ref 的 `packageId` 省略或为空字符串都表示 owner package；attach 后会规范化为 owner package ID。删除包或组件、以及移动组件仍会拒绝最终状态中的悬空引用或源包依赖：调用方必须在同一批次中显式 detach 或 retarget inbound component node。`writeProjectFromUam()` 会在新工程文件全部写入成功后，清理前一版本不再存在的 `package.xml`、`package_branch.xml`、component XML 和原始资源文件，避免删除或重命名的包在下次 `ProjectReader` reload 时被重新发现。

## 模块边界

| 模块 | 负责内容 | 不负责内容 |
|---|---|---|
| `@openfairygui/core` | UAM 主真相层、内部图物化层、项目格式读写、二进制协议读写等底层能力 | 高层发布/还原策略、命令行参数封装 |
| `@openfairygui/functions` | inspect / validate / prune / rename / atlas / publish / restore 等流程组合，以及薄的 pre-MCP authoring app seam | UAM schema 定义、Graph/UAM 核心建模、第二套 selector / operation grammar、`Document` 暴露、`publish` / `restore` 包装 |
| `@openfairygui/backend` | browser-safe project session、browser-safe async project storage adapter、可注入 filesystem adapter、session lifecycle、request/result envelope、revisioned transaction orchestration、backend-local canonical path / advisory lock、coordinated save、capability discovery / manifest、runtime events、in-memory jobs、derived read-only cache、transport bootstrap，以及 `read / authoring / artifact / runtime` 服务分层 | transaction kernel ownership、第二套 app seam、第二套 selector / operation grammar、在 browser-safe session 内执行 `publish` / `restore`、transport-specific wire protocol、MCP transport |
| `@openfairygui/mcp` | MCP server、stdio transport、backend P2 tool schema / output schema、identity resources、guidance prompts 和 backend runtime method 调用映射 | UAM / backend 语义定义、transaction grammar、selector grammar、path policy、roots enforcement、artifact publish/restore 激活 |
| `@openfairygui/cli` | 命令入口、参数解析、调用装配 | 领域模型定义、协议定义 |
| `@openfairygui/test-utils` | 测试辅助与夹具支持 | 生产协议与运行时流程 |
