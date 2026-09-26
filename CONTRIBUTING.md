# Contributing

Read [AGENTS.md](./AGENTS.md), the [development guide](./docs/en/guide/development.md), and the relevant package guidance. Use the Node and pnpm versions declared in the repository, then run `pnpm repo:setup`.

1. Choose a bounded change. Translation corrections and a regression test for an existing diagnostic are good first contributions. Describe the expected behavior and evidence before changing protocol models.
2. Use formal properties and current contracts. Consult pinned fixtures for protocol facts; stop unsupported conclusions when evidence is missing.
3. Run `pnpm check:fast --base origin/next`, replacing the base with the actual PR target. Documentation-only changes use `pnpm docs:check`; broad/package-required changes use `pnpm check:ci`. Offline limits are documented in the development guide.
4. Update linked documentation and both languages where applicable. Generate contract snapshots with `pnpm contracts:generate`; never edit build output or generated blocks by hand.
5. Explain the behavior, validation and remaining limitations in the PR. Keep unrelated edits out of your change. Release changes require matching English and Chinese changelogs.

Maintainer onboarding starts with a reviewed contribution and a release rehearsal; permissions follow demonstrated ownership. Planned work and acceptance criteria live in the [roadmap](./ROADMAP_EN.md).
