# Editor Publish Settings

This document records only the publish properties and settings-file structures that actually exist in FairyGUI Editor. It is a reference for publish-related development and is organized strictly around real editor properties.

## Project settings sidecars

The project settings directory supports five JSON files:

| File | Formal settings field |
|---|---|
| `Publish.json` | `publish` |
| `Common.json` | `common` |
| `Adaptation.json` | `adaptation` |
| `CustomProperties.json` | `customProperties`, containing a JSON object |
| `i18n.json` | `i18n`, whose `langFiles` stores each language file's `name` and `path` |

All five settings categories preserve their complete nested JSON data through project I/O and UAM round trips. `CustomProperties.json` and `i18n.json` are optional; normalization and write-back do not create them when the source project has no corresponding settings. `updateProjectSettings` replaces project settings with a complete snapshot and rejects an identical snapshot as `project_settings_unchanged`. Removing an optional field from the snapshot deletes an existing sidecar during write-back and requires the filesystem to provide `unlink()`.

## Settings files and levels

Editor publish settings have at least two levels:

| Level | Editor object | Purpose |
|---|---|---|
| Global publish settings | `GlobalPublishSettings` | Stores project-wide defaults in `settings/Publish.json` |
| Package publish settings | `PublishSettings` | Stores the publish parameters, atlas list, and exclusions for one package |

## Actual properties in `settings/Publish.json`

### Top-level properties

The following real publish properties are visible on `GlobalPublishSettings`:

| Property | Meaning |
|---|---|
| `path` | Publish output directory |
| `branchPath` | Branch publish path |
| `fileExtension` | Published file extension |
| `packageCount` | Default package count |
| `compressDesc` | Whether to compress descriptor data |
| `binaryFormat` | Whether to use the binary publish format |
| `jpegQuality` | JPEG quality |
| `compressPNG` | Whether to compress PNG |
| `allowGenCode` | Whether code generation is allowed |
| `codePath` | Generated-code output path |
| `classNamePrefix` | Class-name prefix |
| `memberNamePrefix` | Member-name prefix |
| `packageName` | Package name used for code generation |
| `ignoreNoname` | Whether unnamed objects are ignored |
| `getMemberByName` | Whether members are retrieved by name |
| `codeType` | Code-generation type |
| `includeHighResolution` | Bitmask for included high-resolution resources |
| `branchProcessing` | Branch-processing mode |
| `atlasMaxSize` | Maximum atlas size |
| `atlasPaging` | Whether pagination is enabled |
| `atlasSizeOption` | Atlas-size strategy |
| `atlasForceSquare` | Whether atlases are forced square |
| `atlasAllowRotation` | Whether rotation is allowed |
| `atlasTrimImage` | Whether images are trimmed |

### `codeGeneration`

The code-generation child object in `Publish.json` contains these real properties:

| Property | Meaning |
|---|---|
| `allowGenCode` | Whether code generation is allowed |
| `codePath` | Generated-code output path |
| `classNamePrefix` | Class-name prefix |
| `memberNamePrefix` | Member-name prefix |
| `packageName` | Target package name or namespace |
| `ignoreNoname` | Whether unnamed objects are ignored |
| `getMemberByName` | Whether member-by-name lookup code is generated |
| `codeType` | Code type |

### `atlasSetting`

The atlas child object in `Publish.json` contains these real properties:

| Property | Meaning |
|---|---|
| `maxSize` | Maximum atlas size |
| `paging` | Whether multiple atlas pages are allowed |
| `sizeOption` | Atlas-size strategy |
| `forceSquare` | Whether atlases are forced square |
| `allowRotation` | Whether rotation is allowed |
| `trimImage` | Whether images are trimmed |

Notes:

- Editor `GlobalPublishSettings` also contains the runtime fields `atlasMaxSize`, `atlasPaging`, `atlasSizeOption`, `atlasForceSquare`, `atlasAllowRotation`, and `atlasTrimImage`. They correspond to the `atlasSetting` child object in `Publish.json`.
- `extractAlpha` is not a real global `Publish.json` property; it appears in package-level atlas settings.

### Publishing SVG images

When an `image` resource in `package.xml` points to an `.svg` file and declares positive `width` and `height`, publishing rasterizes it at those declared dimensions before optional trimming and atlas composition. The output contains only PNG atlases, while the sprite's original dimensions remain the project-declared values.

Browser publishing rejects SVG with scripts, event attributes, external resource references, DTD/entities, styles, or dimensions and complexity beyond the defined limits before rasterization. If `createImageBitmap` cannot decode a validated SVG, it falls back to `HTMLImageElement` with a Blob URL; the Blob URL is released on both success and failure paths. Publishing fails without writing output when the host has no usable DOM image-decoding capability.

## Actual package-level publish properties

`PublishSettings` represents one package's publish settings:

| Property | Meaning |
|---|---|
| `path` | Package publish path |
| `fileName` | Published filename |
| `branchPath` | Package branch path |
| `packageCount` | Package-level output count |
| `genCode` | Whether code is generated for this package |
| `codePath` | Code-output path for this package |
| `useGlobalAtlasSettings` | Whether global atlas settings are used |
| `atlasList` | Package atlas-settings list |
| `excludedList` | Publish-exclusion list |

Notes:

- `PublishSettings` is not the top-level structure of `settings/Publish.json`; it is the publish configuration for one package.
- A package can define its own atlas list or use global atlas settings.
- The `publish` node in project `package.xml` formally supports `name`, `path`, `branchPath`, `packageCount`, `genCode`, `codePath`, `maxAtlasSize`, `sizeOption`, `square`, `rotation`, `multiPage`, `extractAlpha`, `maxAtlasIndex`, `excluded`, and sparse package-atlas children such as `<atlas name="Default" index="0" compression="true"/>`. Missing `maxAtlasSize` means global atlas settings are used. `maxAtlasIndex` defaults to `10`, and an atlas child is stored only for a slot that has an actual name or compression enabled.
- The `packageDescription` root in project `package.xml` formally supports `compressPNG`, `jpegQuality`, and derived `hasFavorites`. Unset image-compression options remain omitted; `hasFavorites` is written as `true` only when the package contains a favorite resource or resource folder. UAM stores both the root compression values and the complete package publish snapshot, so lift/materialize retains these fields.
- `<publish><atlas>` is source project configuration and is separate from the generated atlases returned by `Package.listAtlases()` after publishing or binary reads. ProjectWriter writes `<publish><atlas>` only from source configuration and never writes generated atlases back to `package.xml`.

`updatePackageSettings` accepts a complete single-package snapshot containing `compressPNG`, `jpegQuality`, and the complete `publish` object. Fields are removed by submitting a new complete snapshot, and an identical snapshot is rejected as `package_settings_unchanged`. Package names and output paths must be safe relative paths. JPEG quality is limited to 1-100, package atlas maximum size to 1-16384, and `maxAtlasIndex` to 0-255. Sparse atlas indices must be unique and no greater than that limit. `excludedResourceIds` stores CSV-safe resource IDs and may retain IDs absent from the current project; reads and writes do not misclassify them as dangling references.

## List cleanup and property overrides in component XML

Component root extensions, ComboBox component instances, and List/Tree display nodes use the formal boolean `autoClearItems` property. Its default is `false`, and it is written only when enabled. Ordered `<property target="..." propertyId="..." value="..."/>` children for component instances and static list items are stored in formal UAM properties. Reads, materialization, saves, and reloads preserve their original order and raw string values, including leading/trailing whitespace, whitespace-only values, and empty strings. `target` must be non-empty, `propertyId` must be a non-negative safe integer, and `value` must be present; invalid input is rejected before materialization or write-back.

## Project resource-tree metadata

Component and asset resource nodes in `package.xml` and `package_branch.xml` use `exported="true"` and `favorite="true"` to store export and favorite state. The corresponding attribute is omitted when disabled. UAM stores these values as `resource.exported` and `resource.favorite`; public transactions set the target Boolean idempotently through `setResourceExported` and `setResourceFavorite`.

Each package records its own resource branches in the formal ordered `branchNames` list, persisted as the same-named JSON-array attribute on the `package.xml` root. Project reads use that order to establish mappings; binary publishing uses the same order to define that package's `branchItemIds` slots and must not derive them again from root project branch order. Document calls that do not explicitly set a package-local table derive it from actual branch resources in project branch order before publishing.

The public `addBranch`, `renameBranch`, and `removeBranch` transactions maintain the project branch registry sorted by name. Rename atomically updates resources, resource folders, and package-local branch tables while preserving each package's existing slot positions. Removal is allowed only for an empty branch with no variant-ID mapping. A branch name must be a safe, non-reserved single path segment. The branch currently active in the editor is local UI state and is not changed by these project transactions.

ProjectWriter preserves `assets_<branch>/` for every project branch and writes an empty `package_branch.xml` for each empty package-local branch slot. Empty branches and package-local branch subsets therefore survive a ProjectReader reload. After a rename or removal is saved successfully, only the removed controlled branch directories are cleaned up with non-recursive directory deletion.

Resource folders are formally represented by `package.folders` with `branch / path / favorite / atlas`. Folder paths use canonical leading and trailing `/`, and the root is implicit. Actual `assets[/_<branch>]/<package-name>/` directories are the source of truth for existence; `<folder>` nodes store only favorite or atlas metadata that needs persistence. `setResourceFolderFavorite` updates a known folder in the main branch or a resource branch, and one operation changes only the selected folder. To match editor behavior that favorites descendants, callers should explicitly submit favorite operations for descendant folders and resources in the same transaction. Public `addResourceFolder`, `renameResourceFolder`, `moveResourceFolder`, and `removeResourceFolder` transactions operate only on empty folders. The parent must exist, and root, path conflicts, or non-empty operations are rejected before commit. Browser storage adapters must provide non-recursive `rmdir`; removed empty directories are cleaned up only after a successful save.

`packageDescription@hasFavorites` in the main `package.xml` is derived from favorite resources and resource folders in the package and is not independently editable. Favorite state affects editor project data only and does not enter the runtime binary publish protocol.

## Project image-resource properties

Image-resource attributes in `package.xml` and `package_branch.xml` are represented by the complete UAM `resource.image` snapshot, including texture-set mode, quality option and custom quality, smoothing, edge duplication, scale mode, nine-slice grid, and tile-grid bitmask. The public `setImageResourceProps` transaction replaces only that formal property snapshot and does not change image source bytes. A non-image selector, incomplete snapshot, invalid scale mode, nine-slice grid, or bitmask is rejected before write-back.

Updating image source bytes through `replaceResourceBytes` currently supports PNG and common 8-bit Huffman JPEG only. Preflight checks PNG chunk CRCs, zlib/scanline boundaries, and container order. For JPEG it checks quantization/Huffman tables, frame/scan order, and encoding constraints and also completes pixel decoding. Both paths compare the actual format with the filename extension at operation time and in the final state. Malformed or mismatched data returns `invalid_resource_bytes`; unsupported formats such as SVG, WebP, GIF, PSD, and TGA return `unsupported_resource_mutation`. The browser backend performs the same strict validation through `applyUamTransactionAsync` in the packaged Web Worker. Calling the synchronous entry in a browser is rejected immediately rather than scanning or decoding on the main thread. Consumer bundlers must package the public `@openfairygui/core/image-validation-worker` entry as a self-contained ESM `image-validation-worker.js` beside the main bundle; rebundling only the main entry or merely copying the worker file omits its decoder chunks. An unresponsive worker is terminated after ten seconds. Browser source input is limited to 8 MiB and decoded raster size to 8,388,608 pixels. Node/CLI synchronous validation limits source and decoded PNG bytes to 128 MiB; strict JPEG decoding is additionally limited to 8,388,608 pixels and 64 MiB.

A valid replacement derives new raster width and height from the bytes and projects them atomically into UAM and Document in the same in-memory transaction. A later save still uses the existing multi-file write-back and does not promise filesystem-level `atomicSave`. When `hydrateResourceBytes` is requested, `ProjectReader` replaces stale XML dimensions from a parseable PNG IHDR or JPEG SOF header with valid fields. It does not scan the complete container or repeat pixel decoding during batch hydration; SVG continues to use project-declared dimensions.

## Project MovieClip properties and JTA transactions

MovieClip resources in `package.xml` and `package_branch.xml` use `atlas` for texture-set mode and `smoothing` for smoothing. Missing `smoothing` reads as `true`; write-back emits `smoothing="false"` only for the non-default value. A MovieClip uses the formal `UamMovieClipResource.movieClip` snapshot for `interval`, `repeatDelay`, `swing`, `smoothing`, and each frame's rectangle, additional delay, and sprite ID. The legacy `metadata` property bag is not read.

When `ProjectReader` hydrates JTA v100-v102, it derives dimensions, playback timing, and the frame list from source bytes. `fps === 0` normalizes to 24, negative values are invalid, and millisecond fields use integer truncation. If the derived model cannot be parsed, raw source bytes and XML attributes are still retained. `smoothing`, which JTA does not carry, continues to use XML/UAM as its source of truth.

`addResource`, `addPackage` containing a MovieClip, and `replaceResourceBytes` complete bounded JTA parsing before atomically replacing the bytes and rebuilding the model in the same transaction. Parse failure returns `invalid_movie_clip_jta`; the UAM project, backend revision/dirty state, and storage remain unchanged. MovieClips do not enter the image raster worker, so browser and Node use the same Core parser and derivation rules. Save/reload and inverse/save/reload rebuild the same model from persisted JTA source data.

## Current publish output-path resolution

An explicitly supplied output directory takes priority over settings. Without one, the current selection order is:

1. Package-level `branchPath` for an active branch, then global `branchPath`.
2. Package-level `path`.
3. Global `path`.

The selected relative path resolves against the project root. If none is configured, publishing does not implicitly choose an output directory.

Browser Laya publishing never uses project or package desktop output paths beneath an explicit `output`. Explicit `branch`, `packages`, `compressed`, and `atlas` parameters also remain authoritative. Without an explicit override, persisted compression, atlas, and safe file-extension settings directly drive output. The current browser host does not provide code generation. If global settings allow it and any selected package enables `genCode`, publishing rejects with `unsupported_publish_setting`, including `setting` and `path`, before Canvas checks or file writes. On failure, `files` contains only files whose `writeFileRaw` completed. Therefore, `success=false` with a non-empty list means built-in output was written partially; hosts requiring atomic publication must provide a transactional or staging output filesystem.

## Current publish completeness requirements

These are OpenFairyGUI's current execution boundaries, not new editor setting fields:

| Condition | Current behavior |
|---|---|
| A publish output directory resolved | An output filesystem is required; its absence is not reported as a successful publish |
| Images or animation frames need packing | A raster encoder, source-resource path, and atlas output directory are required |
| Atlas packing, image reads, or composition fail | Publishing aborts instead of returning a successful result with transparent holes or missing pages |
| The publish set contains a MovieClip | Reads mixed PNG/JPEG textures through the JTA length table. Duplicate texture indices reuse the first referenced frame's sprite, and `-1` means an empty frame. All selected packages finish JTA parsing, strict PNG/JPEG validation, complete decoding of referenced textures, and normalized caching before any built-in OpenFairyGUI output directory or file is created. Out-of-range indices, referenced empty textures, unsupported formats, truncated data, or decode failure abort the entire publish. |
| Copying a `SoundResource`, `MiscResource`, `SpineResource`, `DragonBonesResource`, or one of their dependencies fails | Publishing aborts instead of downgrading a missing runtime resource to a warning |

When no output directory is requested, low-level `publish()` may calculate layout only. That is not a file publish and writes no binary or resource files. Standard Node workflows should use `publishNode()`.

The zero-output guarantee covers only built-in OpenFairyGUI sound, external-resource, atlas, package-binary, and code-generation output. A Node `onPublishStart` plugin runs before built-in preflight and can perform side effects through the host filesystem; those writes are not staged or rolled back automatically. Plugins requiring zero side effects should defer writes until `onPublishEnd` or implement their own staging and commit policy.

## Current code-generation scope

OpenFairyGUI has integrated code generation into the existing `publish` workflow, but the supported range is a deliberately closed initial contract rather than the editor's complete template matrix.

| Condition | Current behavior |
|---|---|
| Global `codeGeneration.allowGenCode=false` | No code is generated |
| Package `publish@genCode=false` or omitted | No code is generated for that package |
| Package `publish@codePath` is set | Uses the package code-output path |
| Package `publish@codePath` is empty | Falls back to global `codeGeneration.codePath` |
| Unity project with an empty `codeType` | Generates Unity-style `.cs` code |
| Laya / Cocos Creator project | Generates shared `fgui` TypeScript code |
| Other project types | Currently unimplemented; generation is skipped |

The current formal code-generation contract is:

| Lane | Output item | Current behavior |
|---|---|---|
| Unity + empty `codeType` | Output directory | `codePath/<normalized-package-name>/` |
| Unity + empty `codeType` | Component classes | One `.cs` class per exported component |
| Unity + empty `codeType` | Binder | One `<PackageName>Binder.cs` per package |
| Unity + empty `codeType` | Cleanup | Removes only old `.cs` files carrying the FairyGUI generated marker from the current package output directory |
| Shared `fgui` TypeScript (Layabox / Cocos Creator) | Output directory | `codePath/<normalized-package-name>/` |
| Shared `fgui` TypeScript (Layabox / Cocos Creator) | Component classes | One `.ts` class per exported component |
| Shared `fgui` TypeScript (Layabox / Cocos Creator) | Binder | One `<PackageName>Binder.ts` per package |
| Shared `fgui` TypeScript (Layabox / Cocos Creator) | Runtime contract | Uses `fgui` and `UIObjectFactory.setExtension(...)` |
| Shared `fgui` TypeScript (Layabox / Cocos Creator) | Cleanup | Removes only old `.ts` files carrying the FairyGUI generated marker from the current package output directory |

Notes:

- This is the behavior currently implemented by OpenFairyGUI, not support for every project type and `codeType` template available in FairyGUI Editor.
- The `fgui` TypeScript generation path no longer branches on `codeType`; Layabox and Cocos Creator share this TS lane.
- The `publish` workflow also allows OpenFairyGUI publish plugins to take over code generation. See [Publish Plugins](./publish-plugins.md) for plugin directories, lifecycle, failure fallback, and the distinction from FairyGUI Editor plugins.

## Actual package atlas properties

`AtlasSettings` is the real property object for one atlas entry:

| Property | Meaning |
|---|---|
| `name` | Atlas name |
| `compression` | Whether compression is enabled |
| `extractAlpha` | Whether alpha is extracted |
| `packSettings` | Packing-parameter object |

`packSettings` is represented by `PackSettings`, which the editor uses for finer packing control.

## Defaults

These defaults come from the actual behavior of editor `GlobalPublishSettings.read()`:

| Property | Default / rule |
|---|---|
| `path` | Empty string |
| `branchPath` | Empty string |
| `packageCount` | `2` |
| `compressDesc` | `true` |
| `binaryFormat` | `true` |
| `includeHighResolution` | `0` |
| `branchProcessing` | `0` |
| `classNamePrefix` | `UI_` |
| `memberNamePrefix` | `m_` |
| `ignoreNoname` | `false` |
| `codeType` | Empty string |
| `allowGenCode` | `true` |
| `atlasSetting.maxSize` | `2048` |
| `atlasSetting.paging` | `true` |
| `atlasSetting.sizeOption` | `pot` |
| `atlasSetting.forceSquare` | `false` |
| `atlasSetting.allowRotation` | `false` |
| `atlasSetting.trimImage` | Defaults to `true` for project version `>= 500`; otherwise uses the legacy default logic |
| `jpegQuality` | `80` |

## Current `fileExtension` rules

The current OpenFairyGUI implementation of `fileExtension` does not reproduce the editor's full project-type matrix. Its formal behavior is:

| Scenario | Result |
|---|---|
| Unity project | Always `bytes` |
| Cocos Creator project with explicit `fileExtension` in `Publish.json` | Uses the configured value |
| Cocos Creator project without explicit `fileExtension` | Defaults to `bin` |
| Other non-Unity project with explicit `fileExtension` | Uses the configured value |
| Other non-Unity project without explicit `fileExtension` | Falls back to `fui` |

The non-Unity binary publish contracts formally covered by the repository include:

- Layabox: sample projects use `binaryFormat=true` and `fileExtension="fui"`, producing `<package-name>.fui`.
- Cocos Creator: without explicit `fileExtension`, publishing defaults to `<package-name>.bin`.

Default extensions for other project types documented by the editor must not be treated as implemented OpenFairyGUI behavior. If a project-type rule is not implemented in the repository, it should be absent from the current implementation documentation or explicitly marked unimplemented.

## Editor reference matrix for `fileExtension`

This table preserves FairyGUI Editor's project-type rules as an index for future alignment. **It does not mean OpenFairyGUI currently implements publishing for every listed project type.**

| Project type | Result |
|---|---|
| Unity | Always `bytes` |
| Cocos2dx / Vision | `fui` when `binaryFormat=true`, otherwise `bytes` |
| Cry / Monogame / Corona | Always `fui` |
| CocosCreator | Defaults to `bin` when unset |
| H5 project | Defaults to `fui` when unset |
| Other projects | Defaults to `zip` when unset |

## High-resolution and branch-related properties

| Property | Meaning |
|---|---|
| `includeHighResolution` | Bitmask selecting `2x` / `3x` / `4x` resources |
| `branchProcessing` | Branch-processing mode |
| `branchPath` | Branch output path |
| `seperatedAtlasForBranch` | Whether branch atlases are output separately |

`includeHighResolution` is the bitmask for `2x`, `3x`, and `4x` resource switches: `@2x=1`, `@3x=2`, and `@4x=4`.

Publishing only discovers and links existing `@2x` / `@3x` / `@4x` resources with the same path, branch, and type, such as `icon@2x.png` corresponding to `icon.png`. They are emitted as independent `image` or `movieclip` package items and referenced by the base item's high-resolution list. Publishing does not scale or enlarge the source bitmap to generate high-resolution resources.

The visible meanings of `branchProcessing` are:

| Value | Editor behavior |
|---|---|
| `0` | **Main includes every branch**. Output retains the main branch and all branch content and uses `path`. |
| `1` | **Merge active branch into main**. Output retains only the merged main and currently active branch. Main output uses `path`; non-main output uses `branchPath/<branch>` when `branchPath` is set. |

The visible meanings of `seperatedAtlasForBranch` are:

| Condition | Editor behavior |
|---|---|
| `branchProcessing=0` and `seperatedAtlasForBranch=false` | Main and branch resources may share the same atlas pages |
| `branchProcessing=0` and `seperatedAtlasForBranch=true` | Main and branch atlases are output separately; branch atlas names receive an `_branchName` suffix, such as `atlas0_dev.png` |
| `branchProcessing=1` | Branches are already merged in the output, so `seperatedAtlasForBranch` has no separate effect |

## Editor write-back behavior

When the editor writes `Publish.json`, current rules include:

| Item | Write-back rule |
|---|---|
| `branchPath` | Written only when non-empty |
| `fileExtension` | Written only when the project supports a custom extension |
| `includeHighResolution` | Written only when greater than `0` |
| `branchProcessing` | Written only when greater than `0` |
| `atlasSetting.maxSize` | Written when not `2048` |
| `atlasSetting.paging` | Written when `true` |
| `atlasSetting.forceSquare` | Written when `true` |
| `atlasSetting.allowRotation` | Written when `true` |
| `atlasSetting.trimImage` | Written when `true` |
| `compressPNG` / `jpegQuality` | Written only for projects that do not support atlases |

## Project write-back boundary

Publish settings do not change the authoring-property semantics of `component.xml`. Project I/O independently preserves component root properties, root-component `customProperty` definitions, and `Button`, `Label`, `ComboBox`, `ProgressBar`, `Slider`, and `ScrollBar` instance-extension overrides on component references. See [Project XML Attribute Protocol](./project-xml-attribute-reference.md) for the corresponding XML contract.

Layout, render order, scroll area, static items, and tree-behavior attributes for list and tree nodes are also read and written independently according to that XML contract. `renderOrder="arch"` uses `apex` for the apex child, while tree nodes preserve behavior through `treeView`, `indent`, and `clickToExpand`.

## Documentation boundary

| Item | Constraint |
|---|---|
| Focus | Real editor properties, defaults, and serialization rules only |
| Excluded content | No internal project types, field mappings, or implementation details |
| Boundary | This page describes the editor settings protocol itself, not how a particular project consumes those properties |
