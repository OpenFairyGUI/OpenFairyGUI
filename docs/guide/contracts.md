# 契约事实源与操作查询

Core 的 `UamTransactionOperation` 与 UAM 模型拥有参数结构和事务语义；Backend 的公开方法签名拥有会话输入、结果和错误类型；MCP 只拥有工具元数据、JSON 传输转换及输入预算。

`pnpm contracts:generate` 使用仓库已有 TypeScript 编译器读取这些类型，生成 MCP 的结构 schema、operation catalog、契约快照和本页表格。MCP 复用已有 Zod 从 JSON Schema 创建校验器；Core 不依赖 Zod。`pnpm contracts:check` 只比较、不写文件，检查映射完整性和生成物漂移，已接入仓库自测与 `docs:check`。

## 查询精确参数

MCP `resources/list` 提供 `openfairygui://contracts/operations`，列出正式 operation 及对应 schema URI；使用 `resources/read` 读取 `openfairygui://contracts/operations/{kind}`，例如 `openfairygui://contracts/operations/addComponent`。单项 schema 包含它需要的全部 `$defs`，不需要仓库源码。

`tools/list` 的每个工具使用对应 Backend 方法的输入/输出 schema，不再共享宽泛的结果定义。工具 `_meta` 中的 `openfairygui/contractDigest`、operation catalog 和下表摘要对应同一份生成快照。参数或注解变化后，未更新快照或双语表格会使检查失败。

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

首版只提供固定的属性投影，不接受任意字段表达式：

| target.kind | 正式 selector | entity.properties |
|---|---|---|
| `resource` | `packageId`、`resourceId` | 资源身份、名称、路径、导出/收藏/分支，以及存在的文件名、尺寸、image/movieClip 属性；不含 source bytes、sourcePath、任意 metadata 或组件内容 |
| `component` | `packageId`、`componentResourceId` | 组件 `size`、`properties`、`customData`；不展开 displayList、controllers、transitions |
| `displayNode` | `packageId`、`componentResourceId`、`displayNodeId` | 正式 UAM 节点属性（含已建模的引用、relations、gears） |

查询不改变工程、revision、dirty、缓存或业务事件，返回对象与会话深度隔离。selector 不猜测、不按名称模糊匹配：结构不正确、目标不存在或 ID 不唯一时返回 `entity_query_failed`，`reason` 分别为 `invalid_query`、`not_found`、`ambiguous`；关闭或失效会话返回 `session_not_found`。

`data` 的紧凑 JSON UTF-8 大小不得超过 262144 字节，遍历深度不得超过 32，节点数不得超过 100000；边界已在 `read.entityQuery.limits` 中声明。不截断属性：超限返回 `response_budget_exceeded`，非 JSON 值返回 `non_json_value`，均位于 `entity_query_failed.reason`。预算在克隆前检查，MCP envelope 和文本副本不计入此数据预算。

## 预演一次事务

`preflightTransaction` / `openfairygui_backend_preflight_transaction` 接受与 `applyTransaction` 相同的 `{ sessionId, expectedRevision, operations }`。它不是仅查询支持范围：Backend 的 `AuthoringService` 在现有会话排他队列中检查 revision，深度复制工程和源字节，再调用正式的 `applyUamTransactionAppAsync`，执行后丢弃新工程。

成功返回 `ok: true`，`data` 为 `{ sessionId, baseRevision, mode: 'execute-and-discard' }`；失败保留正式事务的 `error.code`、`stage`、operation 定位及 `meta.diagnostics`。当前基准见 `meta.revision`；失效或关闭会话返回 `session_not_found`，revision 不匹配返回 `stale_write`。输入参数在排队前复制，SharedArrayBuffer 支撑的字节也会脱离共享内存。

成功和失败都不改变 authoritative 工程、revision、dirty、待清理文件记录、缓存、任务或业务事件，也不写入磁盘。不返回未经计算的实体差异或文件影响列表。

推荐工作流：outline 发现 ID → queryEntity 读取当前属性与 revision → preflightTransaction 预演 → applyTransaction 提交相同批次 → validateSession 检查当前工程 → saveSession 保存。完整可运行代码见[带 revision 的修改、保存与回读](./examples.md#带-revision-的修改、保存与回读)。

预演不预留 revision，不证明后续 apply/save 或发布一定成功。正式 apply 必须再次提交 `expectedRevision`；期间若有编辑，应重新查询并规划，不能把旧预演当作授权凭证。预演复用当前事务执行路径，不额外执行工程保存、文件权限/目标校验或发布检查；缺少文件系统的内存会话也可以预演。

能力通过 `authoring.preflightTransaction` 声明为 `mode: 'execute-and-discard'`、`reservesRevision: false`。当前能力 schema 版本为 6，包含首批[诊断恢复指引](./diagnostics.md)；原有事务契约版本不变。

## 传输与语义边界

- Core 中的二进制仍是 `Uint8Array`。MCP 的正式二进制字段使用整数数组（0–255），通过生成的字段路径显式还原；`replaceResourceBytes`、资源/包快照和导入工程使用同一转换。扩展 JSON 中同名的 `sourceBytes` 不会被改写。
- MCP 不接受宿主对象：`openProjectSession.storage`、`saveSession.fileSystem`、`materializeSession.storage/fileSystem/targetPath` 不在工具输入中。宿主注入继续通过 Backend API 完成。
- 结构 schema 保留正式类型声明的开放字段，例如扩展设置、资源 metadata 和部分动态值；它们不是凭空补齐的协议。未知的封闭对象字段会被拒绝，不静默丢弃。
- 输入继续受批次上限（1–1000）、revision 整数、selector 长度及总节点/深度/字符串预算约束。通用预算为深度 32、节点 100000、单个数组/对象 10000 项、单个字符串 1000000 字符、键长 256；JSON 字节数组也受通用数组预算限制。schema 中的单字段限制不覆盖总预算。
- schema 不替代 Core 的引用、资源内容、字段适用性和合法批次检查；校验成功不表示事务可执行或保存会成功。MCP 不增加第二套事务内核，预演也只映射 Backend 的正式入口。
- 方法专属结果保留 Backend 的错误分类；适配层抛出的未处理错误使用 `backend_unhandled_error`，不暴露内部异常详情。响应预算及诊断修复策略不由结构 schema 承诺。

## 当前生成目录

下表只摘要顶层参数；嵌套字段和具体结果请读取对应 schema。SHA-256 变化表示生成契约发生变化，不等同于包版本号。

<!-- contracts:start -->
SHA-256: `a707a63e5cc43430968a630de348da18bdd128d6fddaf64caae49865c6211f00`

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
| `validateSession` | `openfairygui_backend_validate_session` | `sessionId` | `true` |
| `preflightTransaction` | `openfairygui_backend_preflight_transaction` | `sessionId`, `expectedRevision`, `operations` | `true` |
| `applyTransaction` | `openfairygui_backend_apply_transaction` | `sessionId`, `expectedRevision`, `operations` | `false` |
| `saveSession` | `openfairygui_backend_save_session` | `sessionId`, `expectedRevision?`, `targetPath?`, `force?`, `mode?` | `false` |
| `materializeSession` | `openfairygui_backend_materialize_session` | `sessionId`, `expectedRevision?`, `mode?`, `reason?` | `false` |
| `closeSession` | `openfairygui_backend_close_session` | `sessionId` | `false` |
| `getEvents` | `openfairygui_backend_get_events` | `sessionId`, `after?`, `limit?` | `true` |
| `getJob` | `openfairygui_backend_get_job` | `sessionId`, `jobId` | `true` |
| `listJobs` | `openfairygui_backend_list_jobs` | `sessionId`, `status?`, `kind?`, `limit?` | `true` |
| `cancelJob` | `openfairygui_backend_cancel_job` | `sessionId`, `jobId` | `false` |
| `getCacheSnapshot` | `openfairygui_backend_get_cache_snapshot` | `sessionId` | `true` |
| `refreshCache` | `openfairygui_backend_refresh_cache` | `sessionId`, `reason?` | `false` |
<!-- contracts:end -->

新增不支持的 TypeScript 构造会使生成失败，不能降级成任意 payload。新增方法必须同时进入 Backend capability 列表和 MCP 元数据；新增 operation 自动来自 Core union。修改后运行 `pnpm contracts:generate`、`pnpm check:ci`，验证范围见[开发指南](./development.md)。
