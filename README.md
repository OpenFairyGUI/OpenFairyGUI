# OpenFairyGUI

OpenFairyGUI is a headless authoring SDK for FairyGUI projects.

This repository is organized as a pnpm workspace / Lerna monorepo and currently contains:

- `@openfairygui/core`: property graph, document model, and project / binary I/O
- `@openfairygui/functions`: composable transforms and higher-level authoring helpers
- `@openfairygui/cli`: command-line interface built on top of the core packages
- `@openfairygui/test-utils`: shared utilities for tests and fixtures

## Goals

OpenFairyGUI is intended to support programmatic workflows around FairyGUI assets and projects, including:

- reading and writing FairyGUI project data
- reading and writing binary package data
- inspecting and transforming documents in code
- composing reusable authoring and publishing functions
- providing a scriptable CLI for automation workflows

## Workspace Layout

```text
packages/
  cli/
  core/
  functions/
  test-utils/
```

## Requirements

- Node.js 22 or newer is recommended
- pnpm 10.x

## Getting Started

Install dependencies:

```bash
pnpm install
```

Build all packages:

```bash
pnpm build
```

Run tests:

```bash
pnpm test
```

Run the CLI in development mode:

```bash
pnpm dev:cli
```

## Available Scripts

| Script | Description |
|---|---|
| `pnpm build` | Build all workspace packages |
| `pnpm build:cli-deps` | Build the core packages needed by the CLI |
| `pnpm build:watch` | Start package builds in watch mode |
| `pnpm test` | Run the AVA test suite |
| `pnpm coverage` | Run tests with coverage reporting |
| `pnpm lint` | Run Biome lint checks |
| `pnpm dev:cli` | Run the CLI entry in development mode |

## Status

The project is under active development. APIs and package contents should be treated as current implementation rather than a long-term compatibility contract.

## License

This project is licensed under the MIT License. See `LICENSE` for details.
