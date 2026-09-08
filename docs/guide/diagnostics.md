# 诊断与恢复

Backend 自有错误由 Backend 定义；事务错误与 support issue 来自 Core，工程读取/验证诊断来自 Core 的 `ProjectDiagnosticCode`。Functions 编排和 MCP 透传不改变这些归属。`meta.diagnostics` 和事件诊断保留原有 `code`、`severity`、路径和操作定位；Core 错误与验证报告正文不被改写。

`BackendDiagnostic.code` 由 Backend 错误、Core 事务错误/support issue、Core 工程验证码的正式联合类型约束；当前 102 个唯一码全部有指引。`contracts:check` 对照这些事实源拒绝遗漏、重复、未知码和错误归属。目录的 `owners` 列出同名码的全部正式来源，响应的 `owner` 保留实际来源；例如 `invalid_uam` 同时用于事务和工程验证。

正式诊断增加 `owner`、`docsUri`、`remediation { kind, message, read? }`。不在类型契约中的宿主输入若出现未知码，仍保留原错误，不承诺恢复指引。capability schema 为 9，`manifest.diagnostics.recoveryGuides` 为 `all-formal-codes`，`automaticRepair` 为 false。CLI 进程错误由独立的 [CLI 输出契约](./contracts.md#cli-机器输出)约束，不冒充 Backend 诊断。

`read` 仅是可执行的只读起点：`getProjectOutline({ sessionId })`。MCP 对应 `openfairygui_backend_get_project_outline`，方法映射见[契约指南](./contracts.md)。随后通过精确查询读取实际属性并重新规划；不能只替换 `expectedRevision` 重发原事务。预演不预留 revision，保存仍独立检查。

`host-action` 表示没有安全的自动恢复步骤：缺字节需宿主经工程 I/O 水合，路径拒绝需审查授权范围，会话失效需先保护未保存工作。不得虚构 hydrate/repair 工具，不得清空诊断或放宽路径策略。outline 不含 gear/branch 等完整属性时，应查询所属实体或由宿主检查，不猜 selector。

SDK：`getBackendDiagnosticCatalog()` / `getBackendDiagnosticGuide(code)`。MCP：读取 `openfairygui://docs/diagnostics` 或以下逐码 URI；未知 code 明确报错。指南均为建议，不执行任何操作。

`revise-operation` 用于正式 payload、冲突、引用与不支持的编辑；先读 schema 和当前实体再规划，不能删除数据来绕过错误。无变化应报告已满足，写入失败必须保留 dirty 状态并检查实际文件，锁冲突不得删除活跃锁；目录覆盖不等于这些情况可以自动修复。

## 完整正式诊断目录

以下内容由 `pnpm contracts:generate` 从 Backend 的带类型目录生成；不要手改。

<!-- diagnostics:start -->
### stale_read

Owners: `backend` · Recovery: `refresh-and-replan`

URI: `openfairygui://docs/diagnostics/stale_read`

Discard the incomplete model/bytes read and restart with readSessionState. Use its revision for every readResourceBytes call. No historical state is retained or reserved; do not combine resources from different edit revisions.

### session_read_failed

Owners: `backend` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/session_read_failed`

Inspect error.reason: invalid_query requires valid inputs; not_found/ambiguous requires exact current resource identifiers; unsupported_resource/bytes_unavailable means primary bytes cannot be read from this session. Budget or non-JSON failures require host inspection. Preserve unsaved work; do not save, reopen, repair or mutate the model merely to obtain a read.

### transaction_preview_failed

Owners: `backend` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/transaction_preview_failed`

No complete preview is available. Inspect error.reason with the host: response_budget_exceeded requires a smaller independently meaningful authorized batch; projection_failed requires inspecting the project serialization failure. Preserve the session and never treat a missing or truncated impact as approval to apply or save.

### stale_write

Owners: `backend` · Recovery: `refresh-and-replan`

URI: `openfairygui://docs/diagnostics/stale_write`

Refresh the outline and affected entities, then replan from their current revision and preflight again. A preview reserves no revision. Never replace expectedRevision and blindly retry the original transaction or save.

### entity_query_failed

Owners: `backend` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/entity_query_failed`

Inspect error.reason: invalid_query requires correcting the target; not_found/ambiguous requires current exact identifiers; response_budget_exceeded/non_json_value requires host inspection of the entity. Do not broaden queries or mutate data to evade the response limits.

### session_not_found

Owners: `backend` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/session_not_found`

Ask the host to confirm the runtime and project, recover any unsaved state, then explicitly open a new session if appropriate. Session IDs are runtime-local. Read its new revision and replan; never reuse an expired session or assume disk contains unsaved changes.

### path_policy_violation

Owners: `backend` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/path_policy_violation`

Ask the host to review the attempted path and authorized project root. saveSession only writes the original project; it is not Save As. Do not widen allowed roots or bypass path checks. A separately authorized export may use materializeSession.

### project_root_not_allowed

Owners: `backend` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/project_root_not_allowed`

Ask the host to review the attempted path and authorized project root. saveSession only writes the original project; it is not Save As. Do not widen allowed roots or bypass path checks. A separately authorized export may use materializeSession.

### invalid_package_selector

Owners: `core.transaction` · Recovery: `revise-selector`

URI: `openfairygui://docs/diagnostics/invalid_package_selector`

Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.

### invalid_component_selector

Owners: `core.transaction` · Recovery: `revise-selector`

URI: `openfairygui://docs/diagnostics/invalid_component_selector`

Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.

### invalid_resource_selector

Owners: `core.transaction` · Recovery: `revise-selector`

URI: `openfairygui://docs/diagnostics/invalid_resource_selector`

Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.

### invalid_display_node_selector

Owners: `core.transaction` · Recovery: `revise-selector`

URI: `openfairygui://docs/diagnostics/invalid_display_node_selector`

Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.

### invalid_resource_folder_selector

Owners: `core.transaction` · Recovery: `revise-selector`

URI: `openfairygui://docs/diagnostics/invalid_resource_folder_selector`

Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.

### invalid_branch_selector

Owners: `core.transaction` · Recovery: `revise-selector`

URI: `openfairygui://docs/diagnostics/invalid_branch_selector`

Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.

### invalid_gear_selector

Owners: `core.transaction` · Recovery: `revise-selector`

URI: `openfairygui://docs/diagnostics/invalid_gear_selector`

Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.

### invalid_look_gear_selector

Owners: `core.transaction` · Recovery: `revise-selector`

URI: `openfairygui://docs/diagnostics/invalid_look_gear_selector`

Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.

### selector_ambiguity

Owners: `core.transaction` · Recovery: `revise-selector`

URI: `openfairygui://docs/diagnostics/selector_ambiguity`

Read the current outline and query the relevant entity. Use its exact identifiers, inspect the reported selector path, then rebuild and preflight the transaction. Do not guess identifiers or retry the unchanged transaction.

### unavailable_resource_source_bytes

Owners: `core.transaction` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/unavailable_resource_source_bytes`

Ask the host to inspect the reported source and hydrate its bytes through project I/O or import. Preserve unsaved work; reopening disk state can discard it. No session hydration/repair API is exposed. Revalidate and replan after the host has supplied a complete project.

### missing_source

Owners: `core.validation` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/missing_source`

Ask the host to inspect the reported source and hydrate its bytes through project I/O or import. Preserve unsaved work; reopening disk state can discard it. No session hydration/repair API is exposed. Revalidate and replan after the host has supplied a complete project.

### unreadable_source

Owners: `core.validation` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/unreadable_source`

Ask the host to inspect the reported source and hydrate its bytes through project I/O or import. Preserve unsaved work; reopening disk state can discard it. No session hydration/repair API is exposed. Revalidate and replan after the host has supplied a complete project.

### decode_capability_unavailable

Owners: `core.validation` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/decode_capability_unavailable`

Validation is incomplete, not passed. Inspect whether source bytes are unloaded or a decoder is unavailable. Ask the host to hydrate sources or provide the required decoder (Node image validation uses optional Sharp), then validate again. Do not install dependencies or change the project automatically.

### session_id_conflict

Owners: `backend` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/session_id_conflict`

Use getSession to inspect the existing session. Reuse it only for the intended project, or choose a new session ID; do not close another owner\u0027s session to make room.

### lock_conflict

Owners: `backend` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/lock_conflict`

Another owner holds the project lock. Preserve unsaved work and ask that owner to close its session, then explicitly reopen. Never remove a live lock, force-close a peer, or bypass locking.

### event_cursor_invalid

Owners: `backend` · Recovery: `refresh-and-replan`

URI: `openfairygui://docs/diagnostics/event_cursor_invalid`

Read the error and getEvents cursor bounds. Request a fresh bounded event page without the invalid cursor and refresh the current outline before replanning; missing retained history is not evidence that nothing changed.

### corrupt_source

Owners: `core.validation` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/corrupt_source`

Ask the host to inspect the reported source and hydrate its bytes through project I/O or import. Preserve unsaved work; reopening disk state can discard it. No session hydration/repair API is exposed. Revalidate and replan after the host has supplied a complete project.

### unsupported_operation

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/unsupported_operation`

Read the operation schema, capabilities and reported target kind/field. Stop unsupported work or replan using supported operations with equivalent intended semantics. Never silently drop fields or objects to make a transaction pass.

### transaction_unsupported

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/transaction_unsupported`

Read the operation schema, capabilities and reported target kind/field. Stop unsupported work or replan using supported operations with equivalent intended semantics. Never silently drop fields or objects to make a transaction pass.

### unsupported_display_node_kind

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/unsupported_display_node_kind`

Read the operation schema, capabilities and reported target kind/field. Stop unsupported work or replan using supported operations with equivalent intended semantics. Never silently drop fields or objects to make a transaction pass.

### unsupported_cross_package_image_ref

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/unsupported_cross_package_image_ref`

Read the operation schema, capabilities and reported target kind/field. Stop unsupported work or replan using supported operations with equivalent intended semantics. Never silently drop fields or objects to make a transaction pass.

### unsupported_gear_kind

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/unsupported_gear_kind`

Read the operation schema, capabilities and reported target kind/field. Stop unsupported work or replan using supported operations with equivalent intended semantics. Never silently drop fields or objects to make a transaction pass.

### unsupported_resource_mutation

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/unsupported_resource_mutation`

Read the operation schema, capabilities and reported target kind/field. Stop unsupported work or replan using supported operations with equivalent intended semantics. Never silently drop fields or objects to make a transaction pass.

### unsupported_display_node_mutation

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/unsupported_display_node_mutation`

Read the operation schema, capabilities and reported target kind/field. Stop unsupported work or replan using supported operations with equivalent intended semantics. Never silently drop fields or objects to make a transaction pass.

### unsupported_text_field_target

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/unsupported_text_field_target`

Read the operation schema, capabilities and reported target kind/field. Stop unsupported work or replan using supported operations with equivalent intended semantics. Never silently drop fields or objects to make a transaction pass.

### unsupported_display_node_field

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/unsupported_display_node_field`

Read the operation schema, capabilities and reported target kind/field. Stop unsupported work or replan using supported operations with equivalent intended semantics. Never silently drop fields or objects to make a transaction pass.

### unsupported_operation_batch

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/unsupported_operation_batch`

Read the operation schema, capabilities and reported target kind/field. Stop unsupported work or replan using supported operations with equivalent intended semantics. Never silently drop fields or objects to make a transaction pass.

### unsupported_resource_kind

Owners: `core.transaction`, `core.validation` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/unsupported_resource_kind`

Read the operation schema, capabilities and reported target kind/field. Stop unsupported work or replan using supported operations with equivalent intended semantics. Never silently drop fields or objects to make a transaction pass.

### invalid_project_settings

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/invalid_project_settings`

Inspect the diagnostic path and current operation schema or UAM issues. Correct values, required fields and indices against exact queried entities, then preflight. Do not invent defaults or coerce away invalid data.

### invalid_package_settings

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/invalid_package_settings`

Inspect the diagnostic path and current operation schema or UAM issues. Correct values, required fields and indices against exact queried entities, then preflight. Do not invent defaults or coerce away invalid data.

### invalid_display_node_payload

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/invalid_display_node_payload`

Inspect the diagnostic path and current operation schema or UAM issues. Correct values, required fields and indices against exact queried entities, then preflight. Do not invent defaults or coerce away invalid data.

### invalid_resource_name

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/invalid_resource_name`

Inspect the diagnostic path and current operation schema or UAM issues. Correct values, required fields and indices against exact queried entities, then preflight. Do not invent defaults or coerce away invalid data.

### invalid_resource_path

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/invalid_resource_path`

Inspect the diagnostic path and current operation schema or UAM issues. Correct values, required fields and indices against exact queried entities, then preflight. Do not invent defaults or coerce away invalid data.

### invalid_resource_folder_path

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/invalid_resource_folder_path`

Inspect the diagnostic path and current operation schema or UAM issues. Correct values, required fields and indices against exact queried entities, then preflight. Do not invent defaults or coerce away invalid data.

### invalid_resource_folder_atlas

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/invalid_resource_folder_atlas`

Inspect the diagnostic path and current operation schema or UAM issues. Correct values, required fields and indices against exact queried entities, then preflight. Do not invent defaults or coerce away invalid data.

### invalid_attach_index

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/invalid_attach_index`

Inspect the diagnostic path and current operation schema or UAM issues. Correct values, required fields and indices against exact queried entities, then preflight. Do not invent defaults or coerce away invalid data.

### invalid_controller_payload

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/invalid_controller_payload`

Inspect the diagnostic path and current operation schema or UAM issues. Correct values, required fields and indices against exact queried entities, then preflight. Do not invent defaults or coerce away invalid data.

### invalid_transition_payload

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/invalid_transition_payload`

Inspect the diagnostic path and current operation schema or UAM issues. Correct values, required fields and indices against exact queried entities, then preflight. Do not invent defaults or coerce away invalid data.

### invalid_look_gear_payload

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/invalid_look_gear_payload`

Inspect the diagnostic path and current operation schema or UAM issues. Correct values, required fields and indices against exact queried entities, then preflight. Do not invent defaults or coerce away invalid data.

### invalid_gear_payload

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/invalid_gear_payload`

Inspect the diagnostic path and current operation schema or UAM issues. Correct values, required fields and indices against exact queried entities, then preflight. Do not invent defaults or coerce away invalid data.

### invalid_resource_payload

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/invalid_resource_payload`

Inspect the diagnostic path and current operation schema or UAM issues. Correct values, required fields and indices against exact queried entities, then preflight. Do not invent defaults or coerce away invalid data.

### invalid_resource_bytes

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/invalid_resource_bytes`

Inspect the diagnostic path and current operation schema or UAM issues. Correct values, required fields and indices against exact queried entities, then preflight. Do not invent defaults or coerce away invalid data.

### invalid_movie_clip_jta

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/invalid_movie_clip_jta`

Inspect the diagnostic path and current operation schema or UAM issues. Correct values, required fields and indices against exact queried entities, then preflight. Do not invent defaults or coerce away invalid data.

### invalid_resource_index

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/invalid_resource_index`

Inspect the diagnostic path and current operation schema or UAM issues. Correct values, required fields and indices against exact queried entities, then preflight. Do not invent defaults or coerce away invalid data.

### invalid_branch_name

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/invalid_branch_name`

Inspect the diagnostic path and current operation schema or UAM issues. Correct values, required fields and indices against exact queried entities, then preflight. Do not invent defaults or coerce away invalid data.

### invalid_package_payload

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/invalid_package_payload`

Inspect the diagnostic path and current operation schema or UAM issues. Correct values, required fields and indices against exact queried entities, then preflight. Do not invent defaults or coerce away invalid data.

### invalid_package_index

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/invalid_package_index`

Inspect the diagnostic path and current operation schema or UAM issues. Correct values, required fields and indices against exact queried entities, then preflight. Do not invent defaults or coerce away invalid data.

### invalid_component_payload

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/invalid_component_payload`

Inspect the diagnostic path and current operation schema or UAM issues. Correct values, required fields and indices against exact queried entities, then preflight. Do not invent defaults or coerce away invalid data.

### invalid_component_index

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/invalid_component_index`

Inspect the diagnostic path and current operation schema or UAM issues. Correct values, required fields and indices against exact queried entities, then preflight. Do not invent defaults or coerce away invalid data.

### invalid_component_move

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/invalid_component_move`

Inspect the diagnostic path and current operation schema or UAM issues. Correct values, required fields and indices against exact queried entities, then preflight. Do not invent defaults or coerce away invalid data.

### invalid_uam

Owners: `core.transaction`, `core.validation` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/invalid_uam`

Inspect the diagnostic path and current operation schema or UAM issues. Correct values, required fields and indices against exact queried entities, then preflight. Do not invent defaults or coerce away invalid data.

### project_settings_unchanged

Owners: `core.transaction` · Recovery: `refresh-and-replan`

URI: `openfairygui://docs/diagnostics/project_settings_unchanged`

Query current settings/entity and compare with the request. If already satisfied, report no change; otherwise replan from the current revision. Do not manufacture a mutation or resubmit the same no-op.

### package_settings_unchanged

Owners: `core.transaction` · Recovery: `refresh-and-replan`

URI: `openfairygui://docs/diagnostics/package_settings_unchanged`

Query current settings/entity and compare with the request. If already satisfied, report no change; otherwise replan from the current revision. Do not manufacture a mutation or resubmit the same no-op.

### display_node_props_unchanged

Owners: `core.transaction` · Recovery: `refresh-and-replan`

URI: `openfairygui://docs/diagnostics/display_node_props_unchanged`

Query current settings/entity and compare with the request. If already satisfied, report no change; otherwise replan from the current revision. Do not manufacture a mutation or resubmit the same no-op.

### resource_folder_atlas_unchanged

Owners: `core.transaction` · Recovery: `refresh-and-replan`

URI: `openfairygui://docs/diagnostics/resource_folder_atlas_unchanged`

Query current settings/entity and compare with the request. If already satisfied, report no change; otherwise replan from the current revision. Do not manufacture a mutation or resubmit the same no-op.

### duplicate_look_gear_controller

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/duplicate_look_gear_controller`

Query current entities and resolve the conflicting ID, name or page explicitly. Choose an unused value only when authorized by the intended edit, then preflight. Never overwrite or delete an existing entity to clear the conflict.

### duplicate_transition_name

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/duplicate_transition_name`

Query current entities and resolve the conflicting ID, name or page explicitly. Choose an unused value only when authorized by the intended edit, then preflight. Never overwrite or delete an existing entity to clear the conflict.

### duplicate_look_gear_state_page

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/duplicate_look_gear_state_page`

Query current entities and resolve the conflicting ID, name or page explicitly. Choose an unused value only when authorized by the intended edit, then preflight. Never overwrite or delete an existing entity to clear the conflict.

### duplicate_gear_controller

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/duplicate_gear_controller`

Query current entities and resolve the conflicting ID, name or page explicitly. Choose an unused value only when authorized by the intended edit, then preflight. Never overwrite or delete an existing entity to clear the conflict.

### duplicate_gear_state_page

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/duplicate_gear_state_page`

Query current entities and resolve the conflicting ID, name or page explicitly. Choose an unused value only when authorized by the intended edit, then preflight. Never overwrite or delete an existing entity to clear the conflict.

### duplicate_branch_name

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/duplicate_branch_name`

Query current entities and resolve the conflicting ID, name or page explicitly. Choose an unused value only when authorized by the intended edit, then preflight. Never overwrite or delete an existing entity to clear the conflict.

### duplicate_component_id

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/duplicate_component_id`

Query current entities and resolve the conflicting ID, name or page explicitly. Choose an unused value only when authorized by the intended edit, then preflight. Never overwrite or delete an existing entity to clear the conflict.

### resource_folder_conflict

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/resource_folder_conflict`

Query current entities and resolve the conflicting ID, name or page explicitly. Choose an unused value only when authorized by the intended edit, then preflight. Never overwrite or delete an existing entity to clear the conflict.

### duplicate_resource_id

Owners: `core.transaction`, `core.validation` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/duplicate_resource_id`

Query current entities and resolve the conflicting ID, name or page explicitly. Choose an unused value only when authorized by the intended edit, then preflight. Never overwrite or delete an existing entity to clear the conflict.

### duplicate_package_id

Owners: `core.transaction`, `core.validation` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/duplicate_package_id`

Query current entities and resolve the conflicting ID, name or page explicitly. Choose an unused value only when authorized by the intended edit, then preflight. Never overwrite or delete an existing entity to clear the conflict.

### duplicate_package_name

Owners: `core.transaction`, `core.validation` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/duplicate_package_name`

Query current entities and resolve the conflicting ID, name or page explicitly. Choose an unused value only when authorized by the intended edit, then preflight. Never overwrite or delete an existing entity to clear the conflict.

### resource_folder_not_empty

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/resource_folder_not_empty`

Query affected entities and references before editing, moving or removing anything. Replan intended dependent changes together and preflight. Do not delete dependent objects or strip references without authorization.

### branch_not_empty

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/branch_not_empty`

Query affected entities and references before editing, moving or removing anything. Replan intended dependent changes together and preflight. Do not delete dependent objects or strip references without authorization.

### branch_referenced

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/branch_referenced`

Query affected entities and references before editing, moving or removing anything. Replan intended dependent changes together and preflight. Do not delete dependent objects or strip references without authorization.

### invalid_resource_reference

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/invalid_resource_reference`

Query affected entities and references before editing, moving or removing anything. Replan intended dependent changes together and preflight. Do not delete dependent objects or strip references without authorization.

### invalid_component_reference

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/invalid_component_reference`

Query affected entities and references before editing, moving or removing anything. Replan intended dependent changes together and preflight. Do not delete dependent objects or strip references without authorization.

### invalid_group_reference

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/invalid_group_reference`

Query affected entities and references before editing, moving or removing anything. Replan intended dependent changes together and preflight. Do not delete dependent objects or strip references without authorization.

### package_referenced

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/package_referenced`

Query affected entities and references before editing, moving or removing anything. Replan intended dependent changes together and preflight. Do not delete dependent objects or strip references without authorization.

### component_referenced

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/component_referenced`

Query affected entities and references before editing, moving or removing anything. Replan intended dependent changes together and preflight. Do not delete dependent objects or strip references without authorization.

### component_has_package_dependencies

Owners: `core.transaction` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/component_has_package_dependencies`

Query affected entities and references before editing, moving or removing anything. Replan intended dependent changes together and preflight. Do not delete dependent objects or strip references without authorization.

### dangling_resource_reference

Owners: `core.validation` · Recovery: `revise-operation`

URI: `openfairygui://docs/diagnostics/dangling_resource_reference`

Query affected entities and references before editing, moving or removing anything. Replan intended dependent changes together and preflight. Do not delete dependent objects or strip references without authorization.

### invalid_project_xml

Owners: `core.validation` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/invalid_project_xml`

Inspect the project path and validation diagnostics with the host. Correct source XML/settings or unsupported geometry using authoritative project data; preserve originals and unsaved work before reopening or validating. Do not guess missing structure or discard rejected content.

### invalid_package_xml

Owners: `core.validation` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/invalid_package_xml`

Inspect the project path and validation diagnostics with the host. Correct source XML/settings or unsupported geometry using authoritative project data; preserve originals and unsaved work before reopening or validating. Do not guess missing structure or discard rejected content.

### invalid_branch_package_xml

Owners: `core.validation` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/invalid_branch_package_xml`

Inspect the project path and validation diagnostics with the host. Correct source XML/settings or unsupported geometry using authoritative project data; preserve originals and unsaved work before reopening or validating. Do not guess missing structure or discard rejected content.

### invalid_component_xml

Owners: `core.validation` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/invalid_component_xml`

Inspect the project path and validation diagnostics with the host. Correct source XML/settings or unsupported geometry using authoritative project data; preserve originals and unsaved work before reopening or validating. Do not guess missing structure or discard rejected content.

### invalid_project_value

Owners: `core.validation` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/invalid_project_value`

Inspect the project path and validation diagnostics with the host. Correct source XML/settings or unsupported geometry using authoritative project data; preserve originals and unsaved work before reopening or validating. Do not guess missing structure or discard rejected content.

### desktop_incompatible_geometry

Owners: `core.validation` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/desktop_incompatible_geometry`

Inspect the project path and validation diagnostics with the host. Correct source XML/settings or unsupported geometry using authoritative project data; preserve originals and unsaved work before reopening or validating. Do not guess missing structure or discard rejected content.

### invalid_settings_json

Owners: `core.validation` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/invalid_settings_json`

Inspect the project path and validation diagnostics with the host. Correct source XML/settings or unsupported geometry using authoritative project data; preserve originals and unsaved work before reopening or validating. Do not guess missing structure or discard rejected content.

### path_collision

Owners: `core.validation` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/path_collision`

Ask the host to review the attempted path and authorized project root. saveSession only writes the original project; it is not Save As. Do not widen allowed roots or bypass path checks. A separately authorized export may use materializeSession.

### unsafe_path

Owners: `core.validation` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/unsafe_path`

Ask the host to review the attempted path and authorized project root. saveSession only writes the original project; it is not Save As. Do not widen allowed roots or bypass path checks. A separately authorized export may use materializeSession.

### capability_unavailable

Owners: `backend` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/capability_unavailable`

Read capability/error details. Ask the host to provide the required filesystem, decoder or complete UAM adapter. Preserve the session and unsaved work; do not substitute a lossy path or bypass checks.

### uam_fidelity_unsupported

Owners: `backend` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/uam_fidelity_unsupported`

Read capability/error details. Ask the host to provide the required filesystem, decoder or complete UAM adapter. Preserve the session and unsaved work; do not substitute a lossy path or bypass checks.

### save_partial_failure

Owners: `backend` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/save_partial_failure`

Preserve the dirty session and inspect the error, actual target files and permissions with the host. Partial writes may have changed files: verify or recover them before a newly authorized save. Do not clear dirty state, discard memory or blindly retry.

### write_failed

Owners: `backend` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/write_failed`

Preserve the dirty session and inspect the error, actual target files and permissions with the host. Partial writes may have changed files: verify or recover them before a newly authorized save. Do not clear dirty state, discard memory or blindly retry.

### project_open_failed

Owners: `backend` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/project_open_failed`

Inspect the project path and validation diagnostics with the host. Correct source XML/settings or unsupported geometry using authoritative project data; preserve originals and unsaved work before reopening or validating. Do not guess missing structure or discard rejected content.

### materialize_validation_failed

Owners: `backend` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/materialize_validation_failed`

Inspect the project path and validation diagnostics with the host. Correct source XML/settings or unsupported geometry using authoritative project data; preserve originals and unsaved work before reopening or validating. Do not guess missing structure or discard rejected content.

### execution_failure

Owners: `core.transaction` · Recovery: `host-action`

URI: `openfairygui://docs/diagnostics/execution_failure`

Inspect the execution/cache failure and current session/revision. Preserve sources and unsaved work and report the cause to the host. Replan after resolution; failed execution or cache work is not a completed edit.
<!-- diagnostics:end -->
