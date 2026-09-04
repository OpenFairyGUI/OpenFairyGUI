# Runnable examples and consumer verification

The three examples use installed public packages, not source aliases, `referer/`, or test utilities. Copy the repository's `examples/` directory outside the checkout and run inside that copy:

```bash
npm install
node node-inspect-validate/index.mjs
node revision-checked-edit-save/index.mjs
node publish-restore/index.mjs
```

Without arguments, each command creates a separate temporary project and prints `projectPath` in its JSON output. Files remain available for inspection. The first two accept a `.fairy` path; the second modifies it and expects `Main/MainView/title`, so use a copy. The third command creates only its own example and accepts no user-directory override. Use `pack:check` below for unpublished branch changes; registry packages do not represent the current checkout.

## Read and validate

The example returns the existing `InspectReport` and project validation report. Exit codes follow validation: 0 for `valid`, 1 for `invalid`, and 2 for `incomplete`. This code is included directly from the source executed by the consumer check:

<<< ../../../examples/node-inspect-validate/index.mjs {js}

The corresponding machine-facing CLI commands are `ofgui inspect <project-path> --json` and `ofgui validate <project-path> --json`. Inspection JSON is the existing `inspect()` report without human logs. Read failures exit nonzero and report errors on stderr. Without `--json`, inspection retains its terminal report.

## Revision-checked edit, save and reread

The example obtains IDs from the outline, then reads current properties and the revision with queryEntity. It previews and applies the same text edit, validates the current project, saves using the transaction's returned revision, rereads through public Node I/O, and releases the session lock. Preview reserves no revision. Errors or incomplete validation stop execution; stale writes are not blindly retried.

<<< ../../../examples/revision-checked-edit-save/index.mjs {js}

## Publish, consume artifacts and perform limited recovery

The third example creates two packages containing text, components, two images and cross-package references. It publishes through `publishNode`, reads binaries from the actual returned manifest, restores those self-produced trusted artifacts into a separate directory, rereads and requires complete validation. It compares package/resource IDs, component geometry/text and references, not original project identity, editor-local state or XML spelling.

<<< ../../../examples/publish-restore/index.mjs {js}

`ofgui publish <project> -o <release-directory> --project-type layabox --json` returns `{schemaVersion:1,command:"publish",success:true,result:{files:[{path,size}]}}`. The Node workflow records actual writes with final absolute paths and byte sizes, excluding untouched pre-existing files and arbitrary private plugin I/O. Explicit runtime output is staged atomically; separate codegen destinations and plugin side effects are outside that directory transaction.

`ofgui restore <trusted-release-directory> -o <separate-project-directory> --json` returns `{schemaVersion:1,command:"restore",success:true,result:{projectPath,packages:[{id,name}],warnings}}`. Both commands exit 0 on workflow success, 1 on workflow failure and 2 on syntax errors. Failure JSON contains `success:false` and `error:{code,message}`, with `publish_failed`, `restore_failed` or `invalid_arguments`. Human logs go to stderr; stdout contains one JSON result. Help remains text. Restoration success/warnings do not replace reread validation.

Restoration accepts trusted local artifacts only, requires a separate directory and refuses overwrite by default. Even `--force` replaces the old target only after staging succeeds. See [recovery limits](../published-project-restore-limitations.md); the installed canonical boundary is available offline through `ofgui docs cat restore-limits --json`. Source information absent from published artifacts is not recoverable.

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
- Execute all three examples and assert read-only inspection, the requested semantic edit and corresponding XML change only, no unrelated new files, released session locks, and rejected stale revisions.
- Additionally check the actual manifest/file sizes, binary components and cross-package references, red/blue atlas RGBA pixels, recovered assets and project validation. Failed forced recovery with a corrupt atlas must preserve the entire previous target. Real artifact tasks use a separate restricted host; see [agent evaluations](./agent-evaluations.md).
- Only after production execution passes, declare and install pinned TypeScript, Node types, and esbuild tooling. Compile strict `.mts`/`.cts` consumers without `skipLibCheck` or source aliases, and bundle browser/Worker exports without Node externals.

Successful checks remove only their own temporary directory. Failures preserve it and print the path; `pnpm pack:check --keep` preserves successful runs too. Installation requires registry access or a populated cache; download failures are not successful consumer validation.

This proves package entrypoints, types, a minimal workflow, and browser bundling, not browser folder permissions, real UI behavior, every host's image decoding, or all publish/restore formats. Project tests and user examples remain separate; only the three examples included here are covered by this documentation-code check.

See the [development guide](./development.md) for verification and CI scope, and [Packages and Tools](./packages.md) for product entrypoints.
