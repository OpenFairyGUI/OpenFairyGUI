# Roadmap

This is a plan for undelivered work, not a capability declaration. Releases depend on acceptance evidence, not calendar promises. Package maintainers own the stages; unassigned work must be claimed before becoming a release commitment.

| Stage | Deliverable and owner | Acceptance |
|---|---|---|
| Current review closure | CLI/MCP/docs maintainers: tool docs, transaction commands, host publish extension, generated facts, bilingual navigation, second evaluation client | Full CI, tarball consumers and deterministic compound tasks pass; real model results remain separate |
| Next prerelease | Core/Backend maintainers: 1.0 public surface audit | Generated UAM operations, Backend methods and public exports inventory; compatibility impact, replacement API and migration tests for each change |
| Before 1.0 candidate | Functions/test maintainers: editor feature × read/edit/save/publish matrix | Generate bilingual tables from pinned fixtures, formal model/operations and test inventory; evidence per cell and explicit unverified states; round-trip alone is insufficient |
| Before 1.0 candidate | Rendering/test maintainers: reproducible visual host | Fixed runtime/fonts/viewport; screenshots for every controller page; references, fonts, masks and layout checks; before/after images and pixel diffs. Structural validity is not visual verification |
| Every candidate | Evaluation maintainers: Codex + Claude Code runs | Same tarball digests/task set, isolated workspaces; versioned results, client/model versions, failures, cost/time. Missing runs remain unverified; model scores are not PR gates |
| Ongoing before 1.0 | Repository maintainers: contribution onboarding and second maintainer | Translation and isolated regression cases as good-first-issue candidates; a completed review and release rehearsal before granting maintainer access |

Generated contracts define the planned stable public surface; internal paths are excluded. After 1.0, deprecated public APIs remain for at least two minor releases with migration guidance; removal requires a major release. Before 1.0, necessary breaking changes are grouped into announced prerelease cycles with bilingual changelog entries, without long-lived transitional compatibility layers. Version 1.0 has not been declared.

See [contributing](./development.md#contributing), [evaluations](./agent-evaluations.md), [contracts](./contracts.md) and [architecture](../architecture-overview.md).
