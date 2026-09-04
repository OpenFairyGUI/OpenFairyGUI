# 诊断与恢复

Backend 自有错误由 Backend 定义；事务错误与 support issue 来自 Core，工程读取/验证诊断来自 Core 的 `ProjectDiagnosticCode`。Functions 编排和 MCP 透传不改变这些归属。`meta.diagnostics` 和事件诊断保留原有 `code`、`severity`、路径和操作定位；Core 错误与验证报告正文不被改写。

首批覆盖项增加 `owner`、`docsUri`、`remediation { kind, message, read? }`。未知诊断仍原样传递，不代表可重试或被自动修复。目录不是全部错误码清单。capability schema 为 6，`manifest.diagnostics` 声明首批恢复指引及禁止自动修复。

`read` 仅是可执行的只读起点：`getProjectOutline({ sessionId })`。MCP 对应 `openfairygui_backend_get_project_outline`，方法映射见[契约指南](./contracts.md)。随后通过精确查询读取实际属性并重新规划；不能只替换 `expectedRevision` 重发原事务。预演不预留 revision，保存仍独立检查。

`host-action` 表示没有安全的自动恢复步骤：缺字节需宿主经工程 I/O 水合，路径拒绝需审查授权范围，会话失效需先保护未保存工作。不得虚构 hydrate/repair 工具，不得清空诊断或放宽路径策略。outline 不含 gear/branch 等完整属性时，应查询所属实体或由宿主检查，不猜 selector。

SDK：`getBackendDiagnosticCatalog()` / `getBackendDiagnosticGuide(code)`。MCP：读取 `openfairygui://docs/diagnostics` 或以下逐码 URI；未知 code 明确报错。指南均为建议，不执行任何操作。

## 首批诊断目录

以下内容由 `pnpm contracts:generate` 从 Backend 的带类型目录生成；不要手改。

<!-- diagnostics:start -->
### stale_write

Owner: `backend` · Recovery: `refresh-and-replan`

URI: `openfairygui://docs/diagnostics/stale_write`

Refresh the outline and affected entities, then replan from their current revision and preflight again. A preview reserves no revision. Never replace expectedRevision and blindly retry the original transaction or save.

### entity_query_failed

Owner: `backend` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/entity_query_failed`

Inspect error.reason: invalid_query requires correcting the target; not_found/ambiguous requires current exact identifiers; response_budget_exceeded/non_json_value requires host inspection of the entity. Do not broaden queries or mutate data to evade the response limits.

### session_not_found

Owner: `backend` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/session_not_found`

Ask the host to confirm the runtime and project, recover any unsaved state, then explicitly open a new session if appropriate. Session IDs are runtime-local. Read its new revision and replan; never reuse an expired session or assume disk contains unsaved changes.

### path_policy_violation

Owner: `backend` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/path_policy_violation`

Ask the host to review the attempted path and authorized project root. saveSession only writes the original project; it is not Save As. Do not widen allowed roots or bypass path checks. A separately authorized export may use materializeSession.

### project_root_not_allowed

Owner: `backend` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/project_root_not_allowed`

Ask the host to review the attempted path and authorized project root. saveSession only writes the original project; it is not Save As. Do not widen allowed roots or bypass path checks. A separately authorized export may use materializeSession.

### invalid_package_selector

Owner: `core.transaction` · Recovery: `revise-selector`

URI: `openfairygui://docs/diagnostics/invalid_package_selector`

Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.

### invalid_component_selector

Owner: `core.transaction` · Recovery: `revise-selector`

URI: `openfairygui://docs/diagnostics/invalid_component_selector`

Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.

### invalid_resource_selector

Owner: `core.transaction` · Recovery: `revise-selector`

URI: `openfairygui://docs/diagnostics/invalid_resource_selector`

Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.

### invalid_display_node_selector

Owner: `core.transaction` · Recovery: `revise-selector`

URI: `openfairygui://docs/diagnostics/invalid_display_node_selector`

Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.

### invalid_resource_folder_selector

Owner: `core.transaction` · Recovery: `revise-selector`

URI: `openfairygui://docs/diagnostics/invalid_resource_folder_selector`

Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.

### invalid_branch_selector

Owner: `core.transaction` · Recovery: `revise-selector`

URI: `openfairygui://docs/diagnostics/invalid_branch_selector`

Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.

### invalid_gear_selector

Owner: `core.transaction` · Recovery: `revise-selector`

URI: `openfairygui://docs/diagnostics/invalid_gear_selector`

Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.

### invalid_look_gear_selector

Owner: `core.transaction` · Recovery: `revise-selector`

URI: `openfairygui://docs/diagnostics/invalid_look_gear_selector`

Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.

### selector_ambiguity

Owner: `core.transaction` · Recovery: `revise-selector`

URI: `openfairygui://docs/diagnostics/selector_ambiguity`

Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.

### unavailable_resource_source_bytes

Owner: `core.transaction` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/unavailable_resource_source_bytes`

Ask the host to inspect the reported source and hydrate its bytes through project I/O or import. Preserve unsaved work; reopening disk state can discard it. No session hydration/repair API is exposed. Revalidate and replan after the host has supplied a complete project.

### missing_source

Owner: `core.validation` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/missing_source`

Ask the host to inspect the reported source and hydrate its bytes through project I/O or import. Preserve unsaved work; reopening disk state can discard it. No session hydration/repair API is exposed. Revalidate and replan after the host has supplied a complete project.

### unreadable_source

Owner: `core.validation` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/unreadable_source`

Ask the host to inspect the reported source and hydrate its bytes through project I/O or import. Preserve unsaved work; reopening disk state can discard it. No session hydration/repair API is exposed. Revalidate and replan after the host has supplied a complete project.

### decode_capability_unavailable

Owner: `core.validation` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/decode_capability_unavailable`

Validation is incomplete, not passed. Inspect whether source bytes are unloaded or a decoder is unavailable. Ask the host to hydrate sources or provide the required decoder (Node image validation uses optional Sharp), then validate again. Do not install dependencies or change the project automatically.
<!-- diagnostics:end -->
