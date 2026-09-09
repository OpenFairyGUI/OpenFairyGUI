# 契约事实源与操作查询

Core 的 `UamTransactionOperation` 与 UAM 模型拥有参数结构和事务语义；Backend 的公开方法签名拥有会话输入、结果和错误类型；CLI 拥有进程 JSON envelope，各 result 复用原工作流类型；MCP 只拥有工具元数据、JSON 传输转换及传输预算。

`pnpm contracts:generate` 使用仓库已有 TypeScript 编译器读取这些类型，生成 MCP 的结构 schema、operation catalog、契约快照和本页表格。MCP 复用已有 Zod 从 JSON Schema 创建校验器；Core 不依赖 Zod。`pnpm contracts:check` 只比较、不写文件，检查映射完整性和生成物漂移，已接入仓库自测与 `docs:check`。

## 读取当前会话模型与资源字节

需要消费当前完整 UAM 时，调用 `readSessionState({ sessionId, expectedRevision? })`；只需局部属性时使用下文的 `queryEntity`。完整读取返回本次调用时已提交状态的独立副本，包含 `project`、实际 `revision`、`dirty`、`lastSavedRevision`、`readComplete`、`readDiagnostics` 和 `uamFidelity`。

`project` 直接派生自 Core 的公开 UAM 类型，只移除每个 asset resource 的正式 `sourceBytes` 字段，保留 `sourcePath`、组件完整内容及 Reader 保留的 JSON 扩展字段。不会按属性名递归删除扩展数据中的 `sourceBytes`。只有这份完整只读模型的输出 schema 允许未列名的对象字段；已列名字段仍保留正式类型，事务输入及现有查询契约不变。读取不重新验证引用、不规范化或修复工程，也不返回内部 Document、锁、文件系统、缓存或清理队列。

通过 `readResourceBytes({ sessionId, expectedRevision, selector: { packageId, resourceId } })` 获取单个 asset resource 已在会话中的主文件字节。返回实际 revision、selector 和独立 `Uint8Array`；MCP 对应数字数组。不读取磁盘、不加载辅助文件、不补齐缺失字节；component 不提供此字节读取。

```ts
const state = runtime.readSessionState({ sessionId });
if (!state.ok) throw new Error(state.error.code);
const bytes = runtime.readResourceBytes({
  sessionId,
  expectedRevision: state.data.revision,
  selector: { packageId, resourceId },
});
if (!bytes.ok) throw new Error(bytes.error.code);
```

每次资源读取必须携带模型的 revision。`stale_read` 同时返回 `expectedRevision` 和 `actualRevision`；出现后丢弃这一轮未完成的模型/字节组合并重新读取，不能混用不同编辑 revision 的资源。读取不等待尚未提交的事务、不保留历史版本、不预留 revision。保存会更新公开 `sourcePath`、dirty 等状态，但不推进编辑 revision，因此相同 sessionId + revision 不代表永远相同的完整原始 UAM。

`readComplete` 与 `uamFidelity` 如实反映现有会话标记；纯内存会话即使未提供资源字节也可能是 `true` / `full`。这些字段不证明字节齐全、可渲染或可保存。失效/关闭会话返回 `session_not_found`；其他拒绝使用 `session_read_failed.reason`：`invalid_query`、`not_found`、`ambiguous`、`unsupported_resource`、`bytes_unavailable`、`response_budget_exceeded` 或 `non_json_value`。失败不会截断数据为成功结果。

| 预算 | 上限 |
|---|---|
| `read.sessionState.limits` | 完整 `data` 的紧凑 JSON UTF-8 为 4 MiB，深度 64，节点 500000；克隆前检查 |
| `read.resourceBytes.maxBytes` | 单个主文件 1 MiB；复制前检查，空字节数组可以读取 |
| 两个新 MCP 工具 | 每个完整 `CallToolResult` 序列化为 JSON 后为 16 MiB，包含紧凑文本和 structuredContent 两份内容；超限返回 `mcp_response_budget_exceeded`，不改变 Backend 预算或其他工具 |

仓库固定 fixture 的实测规模如下（字节；模型为 `readSessionState.data`，响应为完整 `CallToolResult`，请求 ID 长度等可造成小幅变化）。这决定了模型与资源分开读取的粒度；不是无限工程大小的承诺。

| 工程 | 模型 JSON | 模型 MCP 响应 | 最大主文件 | 该资源 MCP 响应 |
|---|---:|---:|---:|---:|
| FairyGUI-Experiments | 15357 | 33882 | 460259 | 3254840 |
| FairyGUI-layabox demo | 938862 | 2049115 | 254483 | 1818508 |
| FairyGUI-unity UIProject | 1173851 | 2561306 | 350200 | 2049424 |
| FairyGUI-Editor ui | 2717892 | 5935515 | 18048 | 114842 |

## CLI 机器输出

所有业务命令和 `docs` 子命令使用同一结构：成功为 `{schemaVersion:1,command,success:true,result}`；失败为 `{schemaVersion:1,command,success:false,error:{code,message},result?}`。`command` 是规范命令路径（如 `docs cat`），未知顶层命令为 `ofgui`。`validate` 无效/不完整和 `doctor` 错误/不完整仍在 `result` 保留完整报告；启动/读取异常没有伪造 result。

退出码统一为 0 成功、1 工作流失败、2 参数错误、3 验证不完整。`--json` 可位于命令前后；stdout 只有一个 JSON，普通日志进入 stderr。帮助和版本仍为文本。无 `--json` 时保留人类报告，使用同一退出码。

`packages/cli/src/contracts.ts` 是输出事实源。生成器提供 13 个命令路径（含 `ofgui`/`docs` 的解析失败）的 schema，`test:repo` 检查命令注册遗漏，消费者按生成 schema 校验真实输出。运行 `ofgui docs schema cli/validate --json` 或 `ofgui docs cat "cli/docs cat" --json` 读取自包含 schema；内容位于 envelope 的 `result.text`。MCP 对应 `openfairygui://docs/cli/{command}`，空格用 `%20` 编码。生成快照只收集类型，不增加 Backend 到 CLI 的运行时依赖。

## 查询精确参数

MCP `resources/list` 提供 `openfairygui://contracts/operations`，列出正式 operation 及对应 schema URI；使用 `resources/read` 读取 `openfairygui://contracts/operations/{kind}`，例如 `openfairygui://contracts/operations/addComponent`。单项 schema 包含它需要的全部 `$defs`，不需要仓库源码。

`tools/list` 的每个工具使用对应 Backend 方法的输入/输出 schema，不再共享宽泛的结果定义。工具 `_meta` 中的 `openfairygui/contractDigest`、operation catalog 和下表摘要对应同一份生成快照。参数或注解变化后，未更新快照或双语表格会使检查失败。

MCP 服务工厂暴露固定的 Backend 工具目录；发现声明使用已有 Zod 的 draft-07 `definitions` 与本地 `$ref` 复用重复结构，不展开整份事务子树。所有引用包含在单个 schema 内，无需网络解析。调用继续使用原 Zod 校验器和预算检查；这是传输表达优化，不新增或省略字段。原始安装契约/单项操作文档仍提供 draft-2020-12 `$defs`。真实客户端的发现和执行检查见[Agent 评测](./agent-evaluations.md)。

## 查询当前实体

`queryEntity` / `openfairygui_backend_query_entity` 在现有只读服务中查询当前值，返回 `sessionId`、实际 `revision`、`target` 和 `entity`。例如：

```json
{
  "sessionId": "当前会话 ID",
  "target": {
    "kind": "displayNode",
    "selector": { "packageId": "pkg001", "componentResourceId": "cmp001", "displayNodeId": "n1" }
  }
}
```

只提供固定的属性投影，不接受任意字段表达式；支持的类型由 `read.entityQuery.kinds` 声明：

| target.kind | 正式 selector | entity.properties |
|---|---|---|
| `project` | 不传 selector，target 仅为 `{ "kind": "project" }` | `projectId` 和完整工程 `settings` |
| `package` | `packageId` | 包 `id`、`name` 和完整 `settings`（`compressPNG`、`jpegQuality`、`publish`） |
| `resource` | `packageId`、`resourceId` | 资源身份、名称、路径、导出/收藏/分支，以及存在的文件名、尺寸、image/movieClip 属性；不含 source bytes、sourcePath、任意 metadata 或组件内容 |
| `component` | `packageId`、`componentResourceId` | 组件 `size`、`properties`、`customData`；不展开 displayList、controllers、transitions |
| `displayNode` | `packageId`、`componentResourceId`、`displayNodeId` | 正式 UAM 节点属性（含已建模的引用、relations、gears） |
| `controller` | `packageId`、`componentResourceId`、`controllerName` | 完整 `UamControllerModel`，含当前选择、初始页设置、pages（ID/名称/备注）和 actions |
| `transition` | `packageId`、`componentResourceId`、`transitionName` | 完整 `UamTransitionModel`，含播放设置、fps 和有序 items（目标引用、起止值等） |

`updateProjectSettings` 和 `updatePackageSettings` 都替换完整设置快照。先查询对应的 `project` 或 `package`，复制 `entity.properties.settings`，仅修改请求字段，保留其余嵌套设置和可选字段；将完整 `settings` 与查询得到的 revision 一起提交。包设置还需使用原 `packageId` selector。出现 `stale_write` 后重新查询并规划，避免用旧快照覆盖其他编辑。设置查询与其他实体共享相同的响应预算。

查询不改变工程、revision、dirty、缓存或业务事件，返回对象与会话深度隔离。selector 不猜测、不按名称模糊匹配：控制器和动画使用组件范围内区分大小写的精确名称，不虚构 ID；不同组件中的同名对象不冲突。结构不正确、目标不存在或指定范围内身份不唯一时返回 `entity_query_failed`，`reason` 分别为 `invalid_query`、`not_found`、`ambiguous`；关闭或失效会话返回 `session_not_found`。

`updateController` 和 `updateTransition` 接收完整快照，而非局部 patch。复制查询的 `entity.properties`，仅修改请求字段；保留页面 ID、顺序、备注、actions、动画 items 顺序及目标引用，使用原 selector 和查询 revision 提交。事务更新保留未修改页面备注及动画在组件内的顺序。出现 stale_write 后重新查询、重新规划完整快照，不盲目替换 revision。读取成功不代表引用有效；预演与正式校验仍独立执行。gears 已随 displayNode 返回，不需要独立查询工具。

动画 item 的 `startValue` / `endValue` 沿用 Core 的 `unknown[]`，查询不会猜测动作类型或强制数值化。当前 XML 读取器将 CSV 值读为字符串数组；例如数值 `[120, 64]` 写入后回读为 `["120", "64"]`。修改时保留未授权字段的原始表示，验收按正式保存回读结果比较。

`data` 的紧凑 JSON UTF-8 大小不得超过 262144 字节，遍历深度不得超过 32，节点数不得超过 100000；边界已在 `read.entityQuery.limits` 中声明。不截断属性：超限返回 `response_budget_exceeded`，非 JSON 值返回 `non_json_value`，均位于 `entity_query_failed.reason`。预算在克隆前检查，MCP envelope 和文本副本不计入此数据预算。

## 预演一次事务

`preflightTransaction` / `openfairygui_backend_preflight_transaction` 接受与 `applyTransaction` 相同的 `{ sessionId, expectedRevision, operations }`。它不是仅查询支持范围：Backend 的 `AuthoringService` 在现有会话排他队列中检查 revision，深度复制工程和源字节，再调用正式的 `applyUamTransactionAppAsync`，执行后丢弃新工程。

成功返回 `ok: true`，`data` 包含 `sessionId`、`baseRevision`、`projectedRevision`（正式 apply 后的 revision，未预留）、`mode: 'execute-and-discard'`、`impact` 和 `persistence`；失败保留正式事务的 `error.code`、`stage`、operation 定位及 `meta.diagnostics`。当前基准见 `meta.revision`；失效或关闭会话返回 `session_not_found`，revision 不匹配返回 `stale_write`。输入参数在排队前复制，SharedArrayBuffer 支撑的字节也会脱离共享内存。

成功和失败都不改变 authoritative 工程、revision、dirty、待清理文件记录、缓存或业务事件，也不写入磁盘。

`impact.entities` 比较当前与预演后的正式 UAM：每项包含精确 `target`、`change`（added/removed/updated）和变更的顶层 `fields`，不返回属性值或源字节。包与工程有各自 target；子集合在父实体上比较 ID/名称顺序，节点、控制器、动画分别比较自身属性。正式执行产生的引用补全/重写也会列出，不只照抄输入 selector。

`impact.files` 使用正式 ProjectWriter 在内存中分别序列化两份 UAM，再比较文件内容及空目录，返回工程相对 `path`、`kind` 和 `change`。它只表示当前 revision 到预演结果的模型差异，不是自上次保存以来的累计 dirty 差异，也不是磁盘清单、实际写入列表或删除授权；实际 save 会重写完整工程并按路径策略清理受控文件。

事务前的已有快照允许含待修复的无效引用，其物化只用于内存比较；事务后的快照仍严格校验。Core `materializeUamProject` 默认校验，显式 `{ validate: false }` 仅供检查无效快照。`writeProjectFromUam`、Backend Save 和 Materialize 不跳过校验。无法表示或序列化的快照仍返回 `projection_failed`。

`persistence.requiredAfterApply` 为 true（空批次 apply 也会增加 revision 并标 dirty）。已有存储会话建议 `saveSession`；只有运行时适配器的内存会话需宿主显式指定 `materializeSession.storage`；缺少适配器或 UAM fidelity 不支持时为 `host-action`。`writeVerified` 始终 false。两份内存序列化失败返回 `transaction_preview_failed.reason: projection_failed`；完整摘要超过 2000 项或 `data` 紧凑 JSON 超过 262144 UTF-8 字节时返回 `response_budget_exceeded`，不截断、不伪造成功。

推荐工作流：outline 发现 ID → queryEntity 读取当前属性与 revision → preflightTransaction 预演 → applyTransaction 提交相同批次 → validateSession 检查当前工程 → saveSession 保存。完整可运行代码见[带 revision 的修改、保存与回读](./examples.md#带-revision-的修改、保存与回读)。

预演不预留 revision，不证明后续 apply/save 或发布一定成功。正式 apply 必须再次提交 `expectedRevision`；期间若有编辑，应重新查询并规划，不能把旧预演当作授权凭证。预演复用当前事务执行路径，不额外执行工程保存、文件权限/目标校验或发布检查；缺少文件系统的内存会话也可以预演。

能力通过 `authoring.preflightTransaction` 声明为 `mode: 'execute-and-discard'`、`reservesRevision: false`、`impact: 'model-diff'` 和摘要 `limits`。`read.entityQuery.kinds` 声明七类实体查询，并包含完整正式[诊断恢复指引](./diagnostics.md)；当前契约与能力 schema 版本以 `getCapabilities` 返回值为准。

## 传输与语义边界

- Core 中的二进制仍是 `Uint8Array`。MCP 的正式二进制字段使用整数数组（0–255），通过生成的字段路径显式还原；`replaceResourceBytes`、资源/包快照和导入工程使用同一转换。扩展 JSON 中同名的 `sourceBytes` 不会被改写。
- MCP 不接受宿主对象：`openProjectSession.storage`、`saveSession.fileSystem`、`materializeSession.storage/fileSystem/targetPath` 不在工具输入中。宿主注入继续通过 Backend API 完成。
- 结构 schema 保留正式类型声明的开放字段，例如扩展设置、资源 metadata 和部分动态值；它们不是凭空补齐的协议。未知的封闭对象字段会被拒绝，不静默丢弃。
- 同类型定长元组（例如四个数值的 `scale9Grid` / `cornerRadius`）生成单一 `items` schema，并保留相等的 `minItems` / `maxItems`；MCP 工具发现无需解析位置数组，元素类型和固定长度约束不变。不同类型的位置元组仍保留逐位置约束。
- 输入继续受批次上限（1–1000）、revision 整数、selector 长度及总节点/深度/字符串预算约束。通用预算为深度 32、节点 100000、单个数组/对象 10000 项、单个字符串 1000000 字符、键长 256。仅生成契约声明的字节路径使用整数 0–255 数组，绕过通用数组长度和逐字节节点计数；所有字节字段合计最多 8 MiB。任意 metadata 中同名字节字段不获此豁免。schema 中的单字段限制不覆盖总预算。
- schema 不替代 Core 的引用、资源内容、字段适用性和合法批次检查；校验成功不表示事务可执行或保存会成功。MCP 不增加第二套事务内核，预演也只映射 Backend 的正式入口。
- 方法专属结果保留 Backend 的错误分类；适配层抛出的未处理错误使用 `backend_unhandled_error`，不暴露内部异常详情。响应预算及诊断修复策略不由结构 schema 承诺。
- MCP 工厂的 `toolPolicies` 可为指定工具声明 Host `failureSchema` 和 `beforeCall` 检查。检查在输入校验后收到独立的 wire 参数副本；返回 `undefined` 以原参数调用 Backend 一次，返回已声明的 `ok: false` 分支则停止。Host 失败同样受工具响应预算约束；Backend 返回值始终按正式 schema 校验。SDK 动态发现包含后注册的 Host 工具及对应策略的输出扩展，`openfairygui/hostPolicy` 元数据标识策略；固定契约摘要和随包语料仅描述 Backend 分支。

## 当前生成目录

下表只摘要顶层参数；嵌套字段和具体结果请读取对应 schema。SHA-256 变化表示生成契约发生变化，不等同于包版本号。

<!-- contracts:start -->
SHA-256: `758763ae4b6724a25a82dc0edbe10c7c13478589bdabf84b847dd2d7b745331d`

| 操作 | 参数（`?` 表示可选） |
|---|---|
| `updateProjectSettings` | `settings`, `opId?` |
| `updatePackageSettings` | `selector`, `settings`, `opId?` |
| `renameResource` | `selector`, `newName`, `opId?` |
| `moveResource` | `selector`, `toPath`, `opId?` |
| `setResourceFavorite` | `selector`, `favorite`, `opId?` |
| `setResourceFolderFavorite` | `selector`, `favorite`, `opId?` |
| `setResourceFolderAtlas` | `selector`, `atlas`, `opId?` |
| `setResourceExported` | `selector`, `exported`, `opId?` |
| `addResourceFolder` | `selector`, `path`, `branch?`, `favorite?`, `atlas?`, `opId?` |
| `renameResourceFolder` | `selector`, `newName`, `opId?` |
| `moveResourceFolder` | `selector`, `toPath`, `opId?` |
| `removeResourceFolder` | `selector`, `opId?` |
| `setImageResourceProps` | `selector`, `props`, `opId?` |
| `addResource` | `selector`, `resource`, `atIndex?`, `opId?` |
| `addBranch` | `branch`, `opId?` |
| `renameBranch` | `selector`, `newName`, `opId?` |
| `removeBranch` | `selector`, `opId?` |
| `addPackage` | `package`, `atIndex`, `opId?` |
| `renamePackage` | `selector`, `newName`, `opId?` |
| `removePackage` | `selector`, `opId?` |
| `addComponent` | `selector`, `component`, `atIndex`, `opId?` |
| `removeComponent` | `selector`, `opId?` |
| `moveComponent` | `selector`, `toPackageId`, `toIndex`, `opId?` |
| `replaceResourceBytes` | `selector`, `sourceBytes`, `opId?` |
| `removeResource` | `selector`, `opId?` |
| `setDisplayNodeProps` | `selector`, `props`, `opId?` |
| `setComponentProps` | `selector`, `props`, `opId?` |
| `attachDisplayNode` | `selector`, `atIndex`, `node`, `opId?` |
| `detachDisplayNode` | `selector`, `opId?` |
| `addController` | `selector`, `controller`, `opId?` |
| `updateController` | `selector`, `controller`, `opId?` |
| `removeController` | `selector`, `opId?` |
| `addTransition` | `selector`, `transition`, `opId?` |
| `updateTransition` | `selector`, `transition`, `opId?` |
| `removeTransition` | `selector`, `opId?` |
| `addLookGear` | `selector`, `gear`, `opId?` |
| `updateLookGear` | `selector`, `gear`, `opId?` |
| `removeLookGear` | `selector`, `opId?` |
| `addGear` | `selector`, `gear`, `opId?` |
| `updateGear` | `selector`, `gear`, `opId?` |
| `removeGear` | `selector`, `opId?` |

| Backend 方法 | MCP 工具 | 参数 | 只读提示 |
|---|---|---|---|
| `getCapabilities` | `openfairygui_backend_get_capabilities` | — | `true` |
| `openSession` | `openfairygui_backend_open_session` | `projectPath` | `false` |
| `openProjectSession` | `openfairygui_backend_open_project_session` | `project`, `sessionId?`, `canonicalProjectPath?`, `canonicalPathKey?` | `false` |
| `getSession` | `openfairygui_backend_get_session` | `sessionId` | `true` |
| `getProjectOutline` | `openfairygui_backend_get_project_outline` | `sessionId` | `true` |
| `queryEntity` | `openfairygui_backend_query_entity` | `sessionId`, `target` | `true` |
| `readSessionState` | `openfairygui_backend_read_session_state` | `sessionId`, `expectedRevision?` | `true` |
| `readResourceBytes` | `openfairygui_backend_read_resource_bytes` | `sessionId`, `expectedRevision`, `selector` | `true` |
| `validateSession` | `openfairygui_backend_validate_session` | `sessionId` | `true` |
| `preflightTransaction` | `openfairygui_backend_preflight_transaction` | `sessionId`, `expectedRevision`, `operations` | `true` |
| `applyTransaction` | `openfairygui_backend_apply_transaction` | `sessionId`, `expectedRevision`, `operations` | `false` |
| `saveSession` | `openfairygui_backend_save_session` | `sessionId`, `expectedRevision?`, `targetPath?`, `force?`, `mode?` | `false` |
| `materializeSession` | `openfairygui_backend_materialize_session` | `sessionId`, `expectedRevision?`, `mode?`, `reason?` | `false` |
| `closeSession` | `openfairygui_backend_close_session` | `sessionId` | `false` |
| `getEvents` | `openfairygui_backend_get_events` | `sessionId`, `after?`, `limit?` | `true` |
| `getCacheSnapshot` | `openfairygui_backend_get_cache_snapshot` | `sessionId` | `true` |
| `refreshCache` | `openfairygui_backend_refresh_cache` | `sessionId`, `reason?` | `false` |

| CLI 命令 | 已安装输出 Schema |
|---|---|
| `publish` | `cli/publish` |
| `validate` | `cli/validate` |
| `restore` | `cli/restore` |
| `ofgui` | `cli/ofgui` |
| `docs` | `cli/docs` |
| `inspect` | `cli/inspect` |
| `doctor` | `cli/doctor` |
| `backend-capabilities` | `cli/backend-capabilities` |
| `docs ls` | `cli/docs ls` |
| `docs find` | `cli/docs find` |
| `docs cat` | `cli/docs cat` |
| `docs diagnostic` | `cli/docs diagnostic` |
| `docs schema` | `cli/docs schema` |
<!-- contracts:end -->

新增不支持的 TypeScript 构造会使生成失败，不能降级成任意 payload。新增方法必须同时进入 Backend capability 列表和 MCP 元数据；新增 operation 自动来自 Core union。修改后运行 `pnpm contracts:generate`、`pnpm check:ci`，验证范围见[开发指南](./development.md)。
