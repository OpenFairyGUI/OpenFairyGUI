# Runnable examples and consumer verification

The two examples use installed public packages, not source aliases, `referer/`, or test utilities. Copy the repository's `examples/` directory outside the checkout and run inside that copy:

```bash
npm install
node node-inspect-validate/index.mjs
node revision-checked-edit-save/index.mjs
```

Without arguments, each command creates a separate temporary project and prints `projectPath` in its JSON output. Files remain available for inspection. You can supply a `.fairy` path instead. The second example modifies the supplied project and expects `Main/MainView/title`; use a project copy.

## Read and validate

The example returns the existing `InspectReport` and project validation report. Exit codes follow validation: 0 for `valid`, 1 for `invalid`, and 2 for `incomplete`. This code is included directly from the source executed by the consumer check:

<<< ../../../examples/node-inspect-validate/index.mjs {js}

The corresponding machine-facing CLI commands are `ofgui inspect <project-path> --json` and `ofgui validate <project-path> --json`. Inspection JSON is the existing `inspect()` report without human logs. Read failures exit nonzero and report errors on stderr. Without `--json`, inspection retains its terminal report.

## Revision-checked edit, save and reread

The example obtains IDs from the outline, then reads current properties and the revision with queryEntity. It previews and applies the same text edit, validates the current project, saves using the transaction's returned revision, rereads through public Node I/O, and releases the session lock. Preview reserves no revision. Errors or incomplete validation stop execution; stale writes are not blindly retried.

<<< ../../../examples/revision-checked-edit-save/index.mjs {js}

## Verify the checkout or release artifacts

From the repository root:

```bash
pnpm pack:check
pnpm pack:check --artifacts .release
```

The first command builds and packs the five current publishable packages. The second reads the five tarballs matching current package names and versions from the supplied directory without repacking. Release runs this second form before either registry publish, checking the exact files to be published.

Checks run in a fresh directory outside the checkout:

- Install production dependencies from the five local tarballs, overriding internal package resolutions to those same files; disallow workspace links and clear ambient Node loader/source-resolution settings.
- Inspect actual `exports`, packed files, ESM imports, CJS requires, and Node/Web entrypoints. The Worker is a separate browser entry, not imported in the Node main thread.
- Verify installed CLI/bin mappings, versions, inspect/validate JSON, and MCP stdio initialization and tool discovery.
- Execute both examples and assert read-only inspection, the requested semantic edit and corresponding XML change only, no unrelated new files, released session locks, and rejected stale revisions.
- Only after production execution passes, declare and install pinned TypeScript, Node types, and esbuild tooling. Compile strict `.mts`/`.cts` consumers without `skipLibCheck` or source aliases, and bundle browser/Worker exports without Node externals.

Successful checks remove only their own temporary directory. Failures preserve it and print the path; `pnpm pack:check --keep` preserves successful runs too. Installation requires registry access or a populated cache; download failures are not successful consumer validation.

This proves package entrypoints, types, a minimal workflow, and browser bundling, not browser folder permissions, real UI behavior, every host's image decoding, or all publish/restore formats. Project tests and user examples remain separate; only the two examples included here are covered by this documentation-code check.

See the [development guide](./development.md) for verification and CI scope, and [Packages and Tools](./packages.md) for product entrypoints.
