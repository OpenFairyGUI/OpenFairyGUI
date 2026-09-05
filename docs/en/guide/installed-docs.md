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
ofgui docs schema cli/validate --json
ofgui docs diagnostic stale_write --json
ofgui docs cat skill
```

`ls` returns exact IDs and MCP URIs. `cat` accepts registered IDs, never arbitrary paths or URLs. `find` searches only the installed corpus. All JSON uses the [shared CLI envelope](./contracts.md#cli-machine-output): package/version, contract/capability versions, digests and content are inside `result`, with body at `result.text`; schema/diagnostic bodies are JSON text. Unknown IDs, empty searches and version mismatches produce error JSON and exit 1 without downloading a replacement. Missing arguments/unknown commands exit 2. Human output includes the installed version and content/index.

Read `openfairygui://docs/index` in MCP, then follow its content URIs. Operations retain `openfairygui://contracts/operations/{kind}`; methods use `openfairygui://docs/methods/{method}`. See [diagnostic URIs](./diagnostics.md). The index identifies the Backend documentation package version; compare it with the installation in use. Custom MCP server branding/version does not change the corpus version.

## Product doctor

```bash
ofgui doctor --json
ofgui doctor ./MyProject --json
ofgui doctor ./MyProject --output-dir ./Release --json
```

Every invocation checks the minimum Node version, CLI/documentation version agreement, Node Backend capability declaration, in-memory Sharp PNG/JPEG encoding and pixel decoding, and temporary-directory access flags. With a project, the command additionally reuses `validateProjectNode` for read-only path resolution, project reading and image decoding checks. It creates no Backend session/lock, installs nothing, writes no probes, changes no configuration and performs no repair.

`--output-dir` inspects only the explicit directory. If absent, it checks the nearest existing ancestor, reporting the original absolute `path`, link-resolved `inspectedPath` and `exists` (null when unknown), without creating directories. Files, dangling links and access errors fail. The temporary directory must already exist. Project plugins are not executed, and other configured publish/code destinations are not inspected automatically.

Exit 0 means the requested checks completed; 1 means an error; 2 means argument errors; 3 means native image capability is unavailable/failed or project validation is incomplete. The full report stays in `result`; errors/incomplete checks also return `success:false` and `error`. The report has `scope: installed-product`, `status`, `errors`, individual `checks`, the capability envelope, original `project` validation report and `limits`. Without a project, `project` is null; sample image checks do not prove project sources are available. Access flags do not guarantee effective ACL permissions, space, later creation/writes/rename/rollback or continued authorization. These checks do not prove publish/restore or runtime rendering. CLI doctor checks disk state only; use `validateSession` for unsaved in-memory edits.

Maintainers still use `pnpm repo:doctor` to additionally check Git, pnpm, build existence and fixtures. Product doctor does not check repository prerequisites.

## Packaging and maintenance

Backend ships the source workflow at `docs/workflow.md` and the skill at `docs/skills/openfairygui/SKILL.md`. The skill navigates installed documentation without duplicating operation grammar or installing itself into personal directories. Read it using `docs cat skill`; the host chooses how to enable it.

`pnpm contracts:generate` generates `packages/backend/src/generated/` from Core/Backend/CLI types, MCP transport metadata, Backend package version and those Markdown files. CLI output schemas use `cli/<command path>` IDs and `openfairygui://docs/cli/{command}` URIs, with URI spaces encoded as `%20`. Regenerate after version/content changes; `contracts:check` rejects drift. Release verification uses the exact tarballs being published, not a website or separate build as proof.

`pack:check` installs five tarballs outside the repository and verifies documentation/skill presence, package versions/digests, identical CLI/MCP content, read-only doctor behavior and incomplete exit codes when decoding is unavailable. It also executes inspect/edit/save/reread and publish/restore examples. The installed `restore-limits` document is generated directly from the canonical recovery-boundary document. Source tests and installed-consumer verification remain distinct.
