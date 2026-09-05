## Summary / 变更说明

<!-- Describe the user-visible outcome and why this change is needed. -->

- Affected packages / 影响包：
- Change type / 类型：feature / fix / refactor / docs / tooling
- Compatibility / 破坏性影响与版本处理：

## Contract impact / 契约影响

<!-- For each row, state unchanged or describe the change and its authoritative source. -->

| Surface | Impact / 影响 |
|---|---|
| Core UAM / transaction | |
| Backend methods / capabilities / diagnostics | |
| MCP schema / annotations / budgets | |
| CLI JSON / exit codes | |
| Package exports / installed docs / Skill | |

## Documentation / 文档联动

- Updated documents, or why no update is needed / 已更新文档或不适用理由：
- Bilingual changelog needed? / 是否需要双语发布日志：

- [ ] Reviewed the impact-map documents and the [repository rules](../AGENTS.md); relevant protocol, publish settings, architecture and entrypoints are synchronized.
- [ ] Generated contracts/installed content from canonical sources when affected; no manual snapshot, dist or API-page edits.
- [ ] For a release/version change, both changelogs agree on version, release link, category and content; otherwise explain why not applicable.

## Verification / 验证证据

<!-- Report actual commands, base ref/commit, results and limitations. An unchecked or failed item is not a pass. -->

- Tested base / 验证基准：
- Commands and results / 实际命令与结果：
- Not run or failed, and why / 未运行或失败项及原因：
- Consumer/runtime scope not proven / 尚未证明的消费端或运行时行为：

- [ ] Ran `pnpm check:ci`; any missing or failed check is explicitly recorded above.
- [ ] For publication, `pnpm pack:check --artifacts <release-directory>` passed on the exact five tarballs to be published; otherwise not applicable.

See [development and verification](../docs/guide/development.md). This checklist records evidence; checking boxes does not replace automated checks or authorize publication.
