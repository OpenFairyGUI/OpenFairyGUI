# Runnable examples and consumer verification

The four Node examples and one browser-storage example use installed public packages, not source aliases, `referer/`, or test utilities. Copy the repository's `examples/` directory outside the checkout and run inside that copy:

```bash
npm install
node node-inspect-validate/index.mjs
node revision-checked-edit-save/index.mjs
node publish-restore/index.mjs
node mcp-stdio-client/index.mjs
```

Without arguments, each command creates a separate temporary project and prints `projectPath` in its JSON output. Files remain available for inspection. The first two accept a `.fairy` path; the second modifies it and expects `Main/MainView/title`, so use a copy. The third command creates only its own example and accepts no user-directory override. Use `pack:check` below for unpublished branch changes; registry packages do not represent the current checkout.

## Read and validate

The example returns the existing `InspectReport` and project validation report. Exit codes are 0 for `valid`, 1 for `invalid`, and 3 for `incomplete`. This code is included directly from the source executed by the consumer check:

<<< ../../../examples/node-inspect-validate/index.mjs {js}

The corresponding CLI commands are `ofgui inspect <project-path> --json` and `ofgui validate <project-path> --json`. Original reports are in the shared envelope's `result`; JSON read failures use the same envelope, without human logs on stdout. See [CLI machine output](./contracts.md#cli-machine-output) for shapes, exits and offline schemas. Human mode retains its terminal report.

## Revision-checked edit, save and reread

The example obtains IDs from the outline, then reads current properties and the revision with queryEntity. It previews and applies the same text edit, validates the current project, saves using the transaction's returned revision, rereads through public Node I/O, and releases the session lock. Preview reserves no revision. Errors or incomplete validation stop execution; stale writes are not blindly retried.

<<< ../../../examples/revision-checked-edit-save/index.mjs {js}

## Publish, consume artifacts and perform limited recovery

The third example creates two packages containing text, components, two images and cross-package references. It publishes through `publishNode`, reads binaries from the actual returned manifest, restores those self-produced trusted artifacts into a separate directory, rereads and requires complete validation. It compares package/resource IDs, component geometry/text and references, not original project identity, editor-local state or XML spelling.

<<< ../../../examples/publish-restore/index.mjs {js}

`ofgui publish <project> -o <release-directory> --project-type layabox --json` returns `{schemaVersion:1,command:"publish",success:true,result:{files:[{path,size}]}}`. The Node workflow records actual writes with final absolute paths and byte sizes, excluding untouched pre-existing files and arbitrary private plugin I/O. Explicit runtime output is staged atomically; separate codegen destinations and plugin side effects are outside that directory transaction.

`ofgui restore <trusted-release-directory> -o <separate-project-directory> --json` returns `{schemaVersion:1,command:"restore",success:true,result:{projectPath,packages:[{id,name}],warnings}}`. Both commands exit 0 on workflow success, 1 on workflow failure and 2 on syntax errors. Failure JSON contains `success:false` and `error:{code,message}`, with `publish_failed`, `restore_failed` or `invalid_arguments`. Human logs go to stderr; stdout contains one JSON result. Help remains text. Restoration success/warnings do not replace reread validation.

Restoration accepts trusted local artifacts only, requires a separate directory and refuses overwrite by default. Even `--force` replaces the old target only after staging succeeds. See [recovery limits](../published-project-restore-limitations.md); the installed canonical boundary is available offline through `ofgui docs cat restore-limits --json`. Source information absent from published artifacts is not recoverable.

## MCP stdio client

The fourth command uses the official MCP SDK and installed `@openfairygui/mcp/stdio` export, without global executables, shell interpolation or an assumed HTTP port. It discovers tools and version-bound documentation, explicitly restricts `OPENFAIRYGUI_ALLOWED_PROJECT_ROOTS`, obtains exact `Main/MainView/title` IDs from the outline, reads the current revision and previews a text edit. It does not apply/save, asserts unchanged query results and clean session state, and closes both session and stdio transport in finally.

It accepts an optional `.fairy` file with that structure, or creates a separate demo without arguments. Opening a file session still briefly holds a lock and never bypasses another owner. `pack:check` executes this file directly, verifies all project files stay unchanged, and proves lock release by opening a subsequent session. The SDK is an explicitly declared consumer dependency, not a new product abstraction.

<<< ../../../examples/mcp-stdio-client/index.mjs#example {js}

## Real browser storage

Run `npm run browser` in the copied `examples/` directory and open the displayed localhost URL in Chromium. The example seeds only a missing `openfairygui-example/` in this origin's OPFS, never requesting local-folder permission or overwriting an existing example. Clearing site data removes it. Use Open → Preview & apply → Save → refresh → Open to see persisted title, revision and dirty state. Close refuses to discard dirty edits, but refresh can still lose in-memory changes. Validate saved files explicitly hydrates source bytes and calls `validateProjectWeb`; unloaded images cannot count as complete validation.

<<< ../../../examples/browser-project-storage/main.mjs#example {js}

The example reuses Core's File System Access adapter, `WebIO`, Backend's storage bridge and native Web Locks. `pack:check` executes this page in real Chromium: preview/failure leaves files untouched, stale revisions fail, path denial preserves dirty state, save changes only target XML, PNG bytes and red/blue RGBA stay intact, reload reads persisted edits, and two tabs prove lock contention plus release on normal close and abrupt termination. Successful evidence includes `browser-evidence.json` and `browser-consumer.png`; failures preserve the consumer directory.

OPFS is origin-private storage, not a user directory selected by `showDirectoryPicker`. This does not validate local-folder permission, IndexedDB/ZIP adapters, a cross-browser matrix, image-replacement Workers or FairyGUI rendering. See [MDN OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system).

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
- Execute all four Node examples, including the real stdio client, and assert read-only inspection/preview, the requested semantic edit and corresponding XML change only, no unrelated new files, released session locks, and rejected stale revisions.
- Additionally check the actual manifest/file sizes, binary components and cross-package references, red/blue atlas RGBA pixels, recovered assets and project validation. Failed forced recovery with a corrupt atlas must preserve the entire previous target. Real artifact tasks use a separate restricted host; see [agent evaluations](./agent-evaluations.md).
- Only after production execution passes, install pinned TypeScript, Node types, esbuild and Playwright. Compile strict `.mts`/`.cts` consumers without `skipLibCheck` or source aliases, bundle browser/Worker exports without Node externals, then execute the real Chromium page checks above.

Successful checks remove only their own temporary directory. Failures preserve it and print the path; `pnpm pack:check --keep` preserves successful runs too. Registry and matching Chromium downloads require network access or caches; download/launch failures never count as passing. Playwright pins its browser version; see [browser installation](https://playwright.dev/docs/browsers). System dependencies are not installed by default. Linux CI explicitly passes `--browser-deps` to install required system packages, potentially using sudo; Windows ignores that system-dependency option. The external browser cache survives consumer cleanup.

This proves package entrypoints, types, minimal Node workflows and the real Chromium storage page, not local-folder permissions, a complete editor UI, every image format or all publish/restore formats. Project tests and user examples remain separate; all five examples here run in consumer verification.

See the [development guide](./development.md) for verification and CI scope, and [Packages and Tools](./packages.md) for product entrypoints.
