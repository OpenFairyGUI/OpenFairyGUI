# Installed Documentation and Product Diagnosis

The minimal offline corpus requires neither a repository checkout nor website access. The independent, browser-safe `@openfairygui/backend/docs` entrypoint is shared by CLI and MCP; the Backend root does not load all schemas. It contains an index, workflow, exact operation/method wire schemas, diagnostic guides and a thin skill, not a copy of the website.

Use this project's installed `ofgui` (`ofgui.cmd` on Windows), verify `--version`, then run:

```bash
ofgui docs ls --json
ofgui docs find "selector" --json
ofgui docs cat workflow
ofgui docs cat restore-limits --json
ofgui docs cat methods/queryEntity --json
ofgui docs schema setDisplayNodeProps --json
ofgui docs diagnostic stale_write --json
ofgui docs cat skill
```

`ls` returns exact IDs and MCP URIs. `cat` accepts registered IDs, never arbitrary paths or URLs. `find` searches only the installed corpus. JSON includes package/version, contract and capability versions, contract/documentation digests, and a `text` body; schema/diagnostic bodies are JSON text. Unknown IDs, empty searches and mismatched CLI/documentation versions produce error JSON and exit 1, without downloading a replacement. Human output includes the installed version and content/index.

Read `openfairygui://docs/index` in MCP, then follow its content URIs. Operations retain `openfairygui://contracts/operations/{kind}`; methods use `openfairygui://docs/methods/{method}`. See [diagnostic URIs](./diagnostics.md). The index identifies the Backend documentation package version; compare it with the installation in use. Custom MCP server branding/version does not change the corpus version.

## Product doctor

```bash
ofgui doctor --json
ofgui doctor ./MyProject --json
```

Without a project, checks cover the minimum Node version, CLI/documentation version agreement and the Node Backend capability declaration, not source bytes or Sharp. With a project, the command reuses `validateProjectNode` for read-only path resolution, project reading and existing image decoding checks. It creates no Backend session/lock, installs nothing, writes no probes, changes no configuration and performs no repair.

Exit 0 means the requested checks completed; 1 means an error; 2 means incomplete project validation. JSON has `scope: installed-product`, `status`, `errors`, the capability envelope, original `project` validation report and `limits`. Without a project, `project` is null. Capability declarations do not prove write permissions, publishing or runtime rendering. If a session has unsaved edits, CLI doctor checks disk state only; use `validateSession` for its current in-memory state.

Maintainers still use `pnpm repo:doctor` for Git, pnpm, build existence, temporary-directory permissions and fixtures. Product doctor does not check repository prerequisites.

## Packaging and maintenance

Backend ships the source workflow at `docs/workflow.md` and the skill at `docs/skills/openfairygui/SKILL.md`. The skill navigates installed documentation without duplicating operation grammar or installing itself into personal directories. Read it using `docs cat skill`; the host chooses how to enable it.

`pnpm contracts:generate` generates `packages/backend/src/generated/` from Core/Backend types, MCP transport metadata, Backend package version and those Markdown files. Regenerate after version or content changes; `contracts:check` rejects drift. Release verification uses the exact tarballs being published, not a website or a separate build as proof.

`pack:check` installs five tarballs outside the repository and verifies documentation/skill presence, package versions/digests, identical CLI/MCP content, read-only doctor behavior and incomplete exit codes when decoding is unavailable. It also executes inspect/edit/save/reread and publish/restore examples. The installed `restore-limits` document is generated directly from the canonical recovery-boundary document. Source tests and installed-consumer verification remain distinct.
