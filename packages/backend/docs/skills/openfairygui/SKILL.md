---
name: openfairygui
description: Navigate an installed OpenFairyGUI SDK, CLI or MCP server for FairyGUI project inspection, precise queries, revision-checked authoring and diagnosis. Use the installed version's offline documentation and generated schemas before constructing operations.
---

# OpenFairyGUI installed-version navigation

Use this skill for OpenFairyGUI project workflows, not unrelated GUI frameworks.

1. Locate the intended project's installed `ofgui` binary (local `node_modules/.bin/ofgui`, `ofgui.cmd` on Windows) or its configured MCP server. Do not use `npx`, install, upgrade, or fall back to a global executable automatically. If missing, report the missing installation and ask the host to choose it.
2. Read `ofgui --version` and `ofgui docs ls --json`; compare the CLI and documentation package versions. In MCP, read `openfairygui://docs/index` and the server's version. Report mismatches before authoring; do not use online latest-version docs as the installed contract.
3. Read `ofgui docs cat workflow` or the index's workflow URI. Use `docs find`, `docs schema <kind>`, `docs cat methods/<method>` and `docs diagnostic <code>` (or the listed MCP URIs) for exact current inputs and recovery boundaries. Never copy or guess operation grammar from this skill.
4. Follow outline → exact query → plan → preflight → authorized apply → validate → authorized save → reread. Revision changes require refreshing and replanning, not blind retries. Read-only requests do not authorize opening locked file sessions, mutations or repairs.
5. Use `ofgui doctor [project] --json` for read-only installation/project diagnosis. Missing bytes/decoders and path/session failures may require host action. Preserve unsaved work and report incomplete checks honestly.

The commands above navigate this installed corpus; they do not grant permission to change projects, install dependencies or widen filesystem access.
