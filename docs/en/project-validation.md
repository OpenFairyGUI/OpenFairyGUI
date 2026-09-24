# Project validation

Validation checks whether a project can be read reliably, satisfies the formal UAM constraints, and has complete resources within the current host's capabilities. It is read-only and does not prove that publishing will succeed.

## Scope

| Layer | Checks |
|---|---|
| Project reading | `.fairy`, main/branch package descriptors, component XML and settings JSON; malformed boolean, numeric, tuple and enum attributes are diagnosed before permissive readers can replace them with defaults. |
| UAM | Formal fields, unique IDs/package names, safe paths, output collisions on case-insensitive filesystems, folders and component/font/skeleton/list/gear/transition references. |
| Source files | Existence, readability, nonempty content, portable PNG/JPEG/SVG checks and MovieClip JTA parsing. |
| Host decoding | Sharp in Node; Canvas/ImageBitmap in browsers. |

Validation does not repair files, enforce style, preflight publish settings, generate atlases, encode packages or load a runtime. Test publishing separately on the intended host.

SVG accepts the standard `http://www.w3.org/2000/svg` namespace while rejecting external references, non-fragment URLs, script URLs, event attributes, DTD/entities and active elements.

## Reports and incomplete reads

`ProjectValidationReport` contains `status: 'valid' | 'invalid' | 'incomplete'`, `complete`, and path-sorted `diagnostics`. An invalid report contains definite errors. Incomplete means required bytes or host capabilities are missing; it is not a pass. Diagnostics include stable code, severity, path and message, plus relevant package/resource/node/source identifiers.

Desktop integer geometry (size, position, restrictions, margins, clip softness, design-image offsets and integer gear coordinates) must fit signed Int32; otherwise `desktop_incompatible_geometry` is reported. Scale, rotation, alpha, pivot, skew and gear percentages remain floating point. Lexical validation accepts booleans `true`, `false`, `1`, `0`, finite decimal numbers, exact-length tuples, supported enums and alpha in `0..1`. Invalid values produce `invalid_project_value`.

Directory enumeration failures produce `unreadable_source` and an incomplete read. Only an explicitly missing optional assets directory is treated as empty. Adapters can use stat to distinguish files/directories; without stat, ENOTDIR/TypeMismatchError during directory probing means a file, while access failures remain errors. Backend prevents full write-back from incomplete reads.

## API and CLI

```ts
import { validateProjectNode } from '@openfairygui/functions/node';
const report = await validateProjectNode('./MyProject/MyProject.fairy');
```

For custom hosts, combine detailed read diagnostics and completeness with `validateProject(project, { readDiagnostics, complete, validateSources: true })`. Use `validateProjectWeb(project)` for hydrated browser image checks, or `validateProject(project)` for UAM structure/references alone.

```bash
ofgui validate ./MyProject --json
```

Exit codes: 0 valid, 1 invalid/read failure, 2 invalid arguments, 3 incomplete. JSON stdout contains one envelope; `result` carries the report, with `success:false` and `error` for invalid/incomplete outcomes. See [contracts](./guide/contracts.md).

Backend `validateSession({ sessionId })` checks the current authoritative session revision. MCP maps that method directly. Backend metadata mirrors diagnostics with ownership, documentation URIs and recovery guidance without altering the underlying report. Unknown codes do not imply a guessed repair; see [diagnostics](./guide/diagnostics.md).

`ofgui doctor [project] --json` checks installed versions/capabilities, native in-memory image encoding/decoding and optionally the disk project. It does not inspect unsaved session state, acquire a session lock or write probe files. See [installed documentation](./guide/installed-docs.md).

## Support, preflight and validation

| Entry | Meaning |
|---|---|
| Core `validateTransactionSupport` | Checks supported model/operation scope and projected constraints; not full execution. |
| Backend `preflightTransaction` | Executes on an isolated snapshot at the requested revision and discards it; no revision reservation, file write or guarantee that later apply/save will succeed. |
| Backend `validateSession` | Validates committed session state and available source checks; does not preview pending operations, save or publish. |

Query properties and revision, preflight, apply, validate, then save. Apply and save each check revision. Neither support checks nor successful preflight replace project validation.

Node sessions normalize real file identity; browser storage declares case sensitivity. Project path checks cover the project file, settings and resources without scanning unrelated root contents. Session limits include pending opens; idle expiry only closes clean, inactive sessions. Dirty sessions require explicit save or close. On save failure inspect `diskMayBePartiallyUpdated` and `recoveryPaths`; successful writes with cleanup failures report `save_backup_retained`.
