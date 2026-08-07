# FairyGUI Binary Package Format

This document describes only the protocol structure of FairyGUI published binary packages. It follows the formal V7 protocol and does not expand into a multi-version manual or describe project-specific internal storage.

## Contents

| Section | Link |
|---|---|
| Overall layout | [View](#overall-layout) |
| File header | [View](#file-header) |
| Compression | [View](#compression) |
| Index table | [View](#index-table) |
| String table | [View](#string-table) |
| Block 0: Dependencies | [View](#block-0-dependencies) |
| Block 1: Package Items | [View](#block-1-package-items) |
| Block 2: Sprites | [View](#block-2-sprites) |
| Block 3: Pixel Hit Test | [View](#block-3-pixel-hit-test) |
| Component decoding | [View](#component-decoding) |
| Component / Decode target | [View](#decode-target) |
| Component / Decode entry | [View](#decode-entry) |
| Component / Top-level block layout | [View](#top-level-block-layout) |
| Component / Top-level block details | [View](#top-level-block-details) |
| Component / Child decoding | [View](#child-decoding) |
| Component / Child Block 8 | [View](#child-block-8-static-list-items) |
| Component / Extension types and afterAdd data | [View](#extension-types-and-afteradd-data) |
| Component / Structured-object boundary | [View](#structured-object-decoding-boundary) |
| Component / Runtime phase mapping | [View](#runtime-phase-mapping) |
| Component / Decode result | [View](#decode-result) |
| Version contract | [View](#version-contract) |

## Overall layout

A binary package consists of a fixed header followed by a data region. The header is always uncompressed. When `compressed=true`, the data region after the header uses raw deflate.

```text
[Header]
  magic
  version
  compressed
  packageId
  packageName
  reserved(20 bytes)

[Body]
  index table
  block 0: dependencies
  block 1: package items
  block 2: sprites
  block 3: pixel hit test
  block 4: string table
  block 5: long string patches
```

## File header

| Field | Protocol |
|---|---|
| `magic` | Fixed to `FGUI_MAGIC`, the `uint32` value for `"FGUI"` |
| `version` | Fixed to `7` by the V7 protocol |
| `compressed` | `bool` indicating whether the data region after the header uses raw deflate |
| `packageId` | Package ID |
| `packageName` | Package-name string |
| `reserved` | Exactly 20 reserved bytes |

Notes:

- This document defines only the V7 protocol.
- `packageName` is the package-name field, not the published output filename.

## Compression

| Scenario | Protocol |
|---|---|
| `compressed=false` | Writes the uncompressed data region immediately after the header |
| `compressed=true` | Writes the raw-deflate-compressed data region after the header |

## Index table

The data region begins with an index table locating the following six blocks.

| Field | Protocol |
|---|---|
| `segCount` | `6` |
| `useShort` | `false` |
| Offset type | `uint32` |

Offsets appear in this order:

| Block | Meaning |
|---|---|
| 0 | dependencies |
| 1 | package items |
| 2 | sprites |
| 3 | pixel hit test |
| 4 | string table |
| 5 | long string patches |

## String table

### Block 4

| Content | Protocol |
|---|---|
| String count | `int32` |
| Normal string | Written directly as `UTFString` |
| Long string | An empty placeholder is written in block 4, with content stored in block 5 |

### Block 5

| Content | Protocol |
|---|---|
| Patch count | `int32` |
| Each patch | `index` + `byteLength` + raw UTF-8 bytes |

A block 5 patch replaces the placeholder at the same string-table index in block 4.

## Block 0: Dependencies

| Field | Protocol |
|---|---|
| `depCnt` | `int16` |
| Dependency | Each entry writes `id` and `name` |
| Conditional fields | The branch segment writes `branchCount:int16`, followed by branch names in order |

This branch-name list belongs to the current package. Its order defines the slot meaning of every `branchItemIds` list for that package in Block 1. Different packages may use different branch subsets and orders; the project-level branch list cannot replace it.

## Block 1: Package Items

This block stores package entries. Every entry has a common header followed by its type-specific data segment.

### Recorded item types

| Type code | Item type | Protocol content |
|---|---|---|
| `0` | `Image` | `id`, `name`, `path`, dimensions, `scaleOption`, `scale9Grid`, `tileGridIndice`, `smoothing` |
| `1` | `MovieClip` | Common fields plus frame-data block |
| `2` | `Sound` | Common fields plus sound filename |
| `3` | `Component` | Common fields plus extension type code and component binary data |
| `4` | `Atlas` | Atlas-entry `id`, `file`, and dimensions |
| `5` | `Font` | Common fields plus glyph-data block |
| `7` | `Misc` | Unclassified item |
| `8` | `Unknown` | Unmodeled package item type code |
| `9` | `Spine` | Common fields plus resource filename, `skeletonAnchor.x`, and `skeletonAnchor.y` |
| `10` | `DragonBones` | Common fields plus resource filename, `skeletonAnchor.x`, and `skeletonAnchor.y` |

### Common header fields

Every package item writes this common header before its type-specific segment:

| Field | Protocol |
|---|---|
| `type` | `uint8` item type code |
| `id` | Resource ID |
| `name` | Resource name |
| `path` | Resource path |
| `file` | Filename or relative path loaded by the runtime after publishing |
| `exported` | Whether the resource is exported |
| `width` | Resource width |
| `height` | Resource height |

### `Spine` / `DragoneBones` item segment

`Spine` and `DragoneBones` append a skeleton anchor after the common header:

| Field | Protocol |
|---|---|
| `skeletonAnchor.x` | `float32` |
| `skeletonAnchor.y` | `float32` |

Notes:

- Project resource fields such as `require` and `atlasNames` are not written directly into the package-item segment.
- The runtime locates and aligns a skeleton resource through `file` and `skeletonAnchor`.

### Publish semantics of `file`

`file` stores the resource location in published output, not the original filename under the project resource directory:

| Resource type | Meaning of `file` |
|---|---|
| `Atlas` / `Sound` / `Misc` | Published auxiliary-resource filename; the runtime adds the package asset prefix required by the target |
| `Spine` / `DragoneBones` | Published primary skeleton-resource filename, which the runtime uses to load the corresponding resource |

For `Sound` / `Misc`, `file` is the published item ID plus the source extension. Unity additionally appends `.txt` to `.atlas`. For example, `hero.json` with item ID `biss7` is stored as `biss7.json`; its physical auxiliary file carries the package publish-name prefix expected by the runtime.

Current Unity naming for `Spine` primary and dependent resources is:

| Project resource file | Published result |
|---|---|
| `*.skel` | `*.skel.bytes` |
| `*.atlas` (`Misc` dependency) | `<item-id>.atlas.txt` |
| `*.png` | Original filename retained |

Non-Unity primary skeleton files retain the filename required by their target; dependencies published as `Misc` still use `<item-id><source-extension>`.

When publish settings enable separate branch atlases, an atlas item's `file` contains a branch suffix, such as `atlas0_dev.png`. The main atlas remains `atlas0.png`.

The `DragoneBones` primary file retains the filename required by its target. `Misc` dependencies use their published item IDs, while image dependencies retain their published image names.

### Conditional trailing fields

The end of an item contains conditional data:

| Field | Protocol |
|---|---|
| branch name | Branch containing the current item; a main-branch item writes `null` |
| branchCount | Number of branch mappings. When the package has a branch table, a main item writes branch-variant item IDs in package-level branch order. |
| highResCount | Number of high-resolution variant slots, followed by package item IDs in `@2x`, `@3x`, `@4x` order |

Notes:

- When a package-level branch table exists, a main item's `branchCount` is the number of branch slots written.
- A branch variant item writes only its branch name and does not recursively contain another `branchCount` mapping.
- The high-resolution list references only `image` or `movieclip` resources already published as package items. Publishing does not enlarge source bitmaps.
- If an intermediate scale is missing while a later scale exists, the missing slot is `null`; missing trailing slots are omitted.
- In **merge active branch into main** mode, branch replacement is already complete. Package-level `branchCount` is `0`, and item branch name and `branchCount` are empty.
- When branches are retained and branch atlases are separate, a branch may use independent atlas items. Current editor samples use `100 + pageIndex` as the branch atlas index.

## Block 2: Sprites

| Field | Protocol |
|---|---|
| Sprite count | `uint16` |
| Base fields | `itemId`, `atlasId`, `x`, `y`, `w`, `h`, `rotated` |
| Conditional fields | `offsetX`, `offsetY`, `originalWidth`, `originalHeight` |

This block describes each resource's trimmed atlas rectangle and original dimensions. The trailing segment is present when offsets are non-zero, the sprite is rotated or zero-sized direct output, or the original dimensions differ from the trimmed rectangle. A sprite trimmed only on its right or bottom edge therefore retains `originalWidth` / `originalHeight` even with zero offsets.

## Block 3: Pixel Hit Test

| Field | Protocol |
|---|---|
| Count | `int16` |
| Each entry | `itemId`, deprecated offset, `pixelWidth`, `scaleDenominator`, and bitmask length/data |

This block describes pixel-level hit-test data for image resources.

## Component decoding

### Decode target

The data region of a `Component` item is an independent component buffer rather than an ordinary resource-field set. It expands according to the component protocol into semantic structures including:

| Semantic object | Decoded result |
|---|---|
| `Component` | Header, relations, advanced properties, extension definition, scroll pane, transitions |
| Child nodes | beforeAdd / afterAdd / gears / relations / type-specific data |
| `Controller` | Name, pages, home-page type, actions container |
| `Transition` | Header, items, tweens, values, paths, labels, targets |
| `Gear` | Controller binding, pages, state values, tween conditions |
| ScrollPane / List / Tree | Scroll configuration, list layout, tree settings, resource references, and controller references |

### Decode entry

When the package item type is `Component`, its data region contains these steps:

| Step | Protocol action |
|---|---|
| 1 | Read `extension type` |
| 2 | Read the component binary buffer |
| 3 | Interpret the buffer through its component-level index table |
| 4 | Decode the component in top-level block order |
| 5 | Decode every display-list child through the child's own index table |

### Top-level block layout

A component has eight top-level blocks in a fixed order:

| Block | Decode target |
|---|---|
| 0 | Component header: dimensions, restricted size, pivot, margin, overflow, clipSoftness |
| 1 | Controllers: controller list, pages, action containers |
| 2 | Display list: child list, with nested per-child decoding |
| 3 | Component-level relations |
| 4 | Advanced properties: customData, opaque, mask, hitTest, stage sounds |
| 5 | Transitions |
| 6 | Extension definition: Button / Label / ComboBox / ProgressBar / Slider / ScrollBar |
| 7 | ScrollPane: present only for `overflow=scroll` |

Required decode order:

- First read `blockCount` and `useShort` from the component index-table header.
- Then read the eight block offsets in order.
- An offset of `0` for block 6 or 7 means that block is absent.

### Top-level block details

#### Block 0: Component header

| Field group | Content |
|---|---|
| Dimensions | `sourceWidth`, `sourceHeight` |
| Restricted size | `minWidth`, `maxWidth`, `minHeight`, `maxHeight` |
| Pivot | `pivotX`, `pivotY`, `pivotAsAnchor` |
| Margin | `top`, `bottom`, `left`, `right` |
| Overflow | `Visible` / `Hidden` / `Scroll` |
| Clip softness | `x`, `y` |

#### Block 1: Controllers

Every controller has its own three-block index table:

| Sub-block | Content |
|---|---|
| 0 | `name`, `autoRadioGroupDepth` |
| 1 | `pages` as ID and name, plus `homePageType` |
| 2 | `actions` container and action payload |

The formal `homePageType:uint8` values and their trailing payloads are:

| Value | Meaning | Trailing payload |
|---|---|---|
| `0` | First page (`default`) | None |
| `1` | Specific page (`specific`) | Page index as `int16` |
| `2` | Match branch name (`branch`) | None |
| `3` | Match variable value (`variable`) | Project-variable key string |

Controller `alias` and `exported` are editor metadata in project XML and are not written into this runtime Controller block.

The `actions` block begins with `actionCount:int16`. Each action then starts with `chunkSize:int16`, followed by fields in this fixed order:

| Field | Meaning |
|---|---|
| `actionType:uint8` | `0 = PlayTransition`, `1 = ChangePage` |
| `fromPageCount:int16` + `fromPage[]` | Source-page ID filters |
| `toPageCount:int16` + `toPage[]` | Target-page ID filters |
| Conditional payload | Further fields selected by `actionType` |

Conditional payloads:

| `actionType` | Payload |
|---|---|
| `PlayTransition` | `transitionName`, `playTimes:int32`, `delay:float32`, `stopOnExit:bool` |
| `ChangePage` | `objectId`, `controllerName`, `targetPage` |

#### Block 2: Display list

This block stores the child list:

| Step | Protocol action |
|---|---|
| 1 | Read child count |
| 2 | Read each child's `dataLen` |
| 3 | Read the child's index table |
| 4 | Select the child type by object type |
| 5 | Decode common fields, type-specific fields, relations, gears, and afterAdd data in child-block order |

#### Block 3: Component-level relations

| Content | Description |
|---|---|
| Target | Resolved by child index first |
| Relation pairs | Each target has multiple relation-type and `usePercent` pairs |

#### Block 4: Advanced properties

| Field | Description |
|---|---|
| `customData` | Component custom data |
| `opaque` | Whether the component is opaque |
| `mask` / `reversedMask` | References a child by display-list index |
| `hitTest` | Child-index mode or external hit-test-resource mode |
| `addedToStageSound` / `removedFromStageSound` | Conditional fields |

#### Block 5: Transitions

| Content | Description |
|---|---|
| Transition header | `name`, `options`, `autoPlay`, `autoPlayTimes`, `autoPlayDelay` |
| Item header | `actionType`, `time`, `target`, `label`, `tween` |
| Tween block | `duration`, `easeType`, `repeat`, `yoyo`, `endLabel` |
| Value block | `value` / `startValue` / `endValue` |
| Path block | `path`, custom-ease path |

#### Block 6: Extension definition

| Extension type | Content |
|---|---|
| `Button` | `mode`, `sound`, `soundVolumeScale`, `downEffect`, `downEffectValue` |
| `Label` | No additional definition block |
| `ComboBox` | `dropdown` |
| `ProgressBar` | `titleType`, `reverse` |
| `Slider` | `titleType`, `reverse`, `wholeNumbers`, `changeOnClick` |
| `ScrollBar` | `fixedGripSize` |

#### Block 7: ScrollPane

Present only when component `overflow=scroll`:

| Field group | Content |
|---|---|
| Scroll base | `scrollType`, `scrollBarFlags` |
| Margin | `scrollBarMargin` |
| Resource references | `vtScrollBarRes`, `hzScrollBarRes`, `headerRes`, `footerRes` |

### Child decoding

#### Common child structure

Each child has an independent index table, with a block count determined by object type:

| Child type | Block count |
|---|---|
| Ordinary child | 7 |
| `GList` | 9 |
| Tree | 10 |

Notes:

- Tree is not an independent outer resource-entry type.
- The current formal model uses `GTree`, while Project XML follows the editor form `<list treeView="true">`.

#### Object type mapping

| Object type index | Component object type |
|---|---|
| 0 | `GImage` |
| 1 | `GMovieClip` |
| 3 | `GGraph` |
| 4 | `GLoader` |
| 5 | `GGroup` |
| 6 | `GTextField` |
| 7 | `GRichTextField` |
| 8 | `GTextInput` |
| 9 | `GComponent` |
| 10 | `GList` |
| 11 | `GLabel` |
| 12 | `GButton` |
| 13 | `GComboBox` |
| 14 | `GProgressBar` |
| 15 | `GSlider` |
| 16 | `GScrollBar` |
| 17 | `GTree` |
| 18 | `GLoader3D` |

#### Child block decode order

| Block | Content |
|---|---|
| 0 | beforeAdd: object type, src, pkgId, id, name, xy, size, restricted size, scale, skew, pivot, alpha, rotation, visible, touchable, grayed, blend, color filter, customData |
| 1 | Common afterAdd segment: tooltips, group |
| 2 | Gears |
| 3 | Relations |
| 4 | `GComponent` / `GList` page controller or `GTextInput` type-specific segment |
| 5 | Child-type-specific extension |
| 6 | afterAdd text/icon/extension-instance data |
| 7 | `GList` scroll pane |
| 8 | `GList` static list items |
| 9 | Tree settings |

#### Child Block 4

| Type | Content |
|---|---|
| `GComponent`, `GList`, `GButton`, `GLabel`, `GComboBox`, `GProgressBar`, `GSlider`, `GScrollBar` | Page controller and controller overrides; V2+ then stores ordered property overrides as `target / propertyId / value` |
| `GTextInput` | Input-field-specific settings |
| Other types | Offset is `0`; the block is absent |

#### Child Block 5: Type-specific extensions

| Type | Main fields |
|---|---|
| `GImage` | color, flip, fillMethod, fillOrigin, fillClockwise, fillAmount |
| `GTextField` / `GRichTextField` / `GTextInput` | font, fontSize, color, align, vAlign, leading, letterSpacing, ubb, autoSize, underline, italic, bold, singleLine, stroke, shadow, strikethrough, faceDilate, outlineSoftness, underlaySoftness |
| `GGraph` | graphType, lineSize, lineColor, fillColor, cornerRadius, points, sides, startAngle, distances |
| `GGroup` | layout, lineGap, columnGap, excludeInvisibles, autoSizeDisabled, mainGridIndex |
| `GLoader` | url, align, vAlign, fill, shrinkOnly, autoSize, playing, frame, color, fillMethod, useResize |
| `GLoader3D` | url, align, vAlign, fill, shrinkOnly, autoSize, animationName, skinName, playing, frame, loop, color |
| `GMovieClip` | color, frame, playing |
| `GList` | layout, selectionMode, align, vAlign, lineGap, columnGap, lineCount, columnCount, autoResizeItem, childrenRenderOrder, apexIndex, margin, overflow, clipSoftness, scrollItemToViewOnClick, foldInvisibleItems |

### Extension types and afterAdd data

Block 6 restores data written during the afterAdd phase:

| Type | Content |
|---|---|
| `GTextField` / `GRichTextField` / `GTextInput` | `text` |
| `GButton` | `title`, `selectedTitle`, `icon`, `selectedIcon`, `titleColor`, `titleFontSize`, `relatedController`, `relatedPageId`, `sound`, `soundVolume`, `selected` |
| `GLabel` | `title`, `icon`, `titleColor`, `titleFontSize`, input-setting placeholder, `sound`, `soundVolumeScale` |
| `GComboBox` | `items`, `values`, `icons`, `title`, `icon`, `titleColor`, `visibleItemCount`, `popupDirection`, `selectionController`, `sound`, `soundVolumeScale` |
| `GProgressBar` | `value`, `max`, `min`, `sound`, `soundVolumeScale` |
| `GSlider` | `value`, `max`, `min` |
| `GList` | `selectionController` |
| `GComponent` Button extension instance | `title`, `selectedTitle`, `icon`, `selectedIcon`, `titleColor`, `titleFontSize`, `relatedController`, `relatedPageId`, `sound`, `soundVolumeScale`, `selected` |
| `GComponent` Label extension instance | `title`, `icon`, `titleColor`, `titleFontSize`, input settings, `sound`, `soundVolumeScale` |
| `GComponent` ComboBox extension instance | `items`, `title`, `icon`, `titleColor`, `visibleItemCount`, `popupDirection`, `selectionController`, `sound`, `soundVolumeScale` |
| `GComponent` ProgressBar extension instance | `value`, `max`, `min`, `sound`, `soundVolumeScale` |
| Other extension-instance data | Slider / ScrollBar instance data selected by the `InstanceExtType` branch |

### Child Block 7: List ScrollPane

`GList` and `GTree` share Block 7. It stores `scrollType`, `scrollBarDisplay` (`0` default, `1` visible, `2` auto, `3` hidden), `scrollBarFlags`, scrollbar margins, and scrollbar/pull-to-refresh resource references in that order.

### Child Block 8: Static List Items

`GList` and `GTree` share Block 8. The block first writes the default item resource and item count, then stores every static item as a length-prefixed chunk:

| Order | Field | Encoding and semantics |
|---|---|---|
| 1 | `defaultItem` | String-table reference |
| 2 | `itemCount` | `Int16` |
| 3 | `chunkSize` | One `Int16` per item, giving the byte length of item data after this length field |
| 4 | `url` | String-table reference |
| 5 | `isFolder` | Present only for `GTree`; `Bool` |
| 6 | `level` | Present only for `GTree`; `UInt8`; negative values clamp to `0` before writing |
| 7 | `title`, `selectedTitle` | Nullable string references |
| 8 | `icon`, `selectedIcon`, `name` | Nullable string-table references |
| 9 | `controllerOverrideCount` | `Int16` |
| 10 | Controller overrides | Repeated `controllerOverrideCount` times; each entry writes `(controllerName, selectedPageId)` as two string-table references |
| 11 | `propertyOverrideCount` | `Int16` in V2+ |
| 12 | Property overrides | Repeated `propertyOverrideCount` times; each entry writes `target`, `propertyId: Int16`, and `value` |

The static-item `controllers` field uses comma-separated pairs: `controllerName,selectedPageId,...`. Encoding writes one controller override per pair. An empty controller name does not create an override, and a missing selected-page ID is written as an empty string. Decoding reconstructs the paired string in the same order. Property overrides round-trip in model order.

A Tree item's `isFolder` has no `null` representation in the binary, so encoding resolves it as follows:

- Explicit `true` or `false` is written unchanged.
- When `null` or omitted, it is `true` only if the next item's `level` is greater than the current item's `level`.
- It is `false` when the next item is at the same or a shallower level, or when the current item is last.

This preserves hierarchy semantics for leaf nodes without icons or URLs. Icons and resource URLs do not participate in folder inference.

### Structured-object decoding boundary

#### Controller

| Content | Requirement |
|---|---|
| Name | `name` |
| Pages | `ControllerPage.id`, `ControllerPage.name` |
| Home-page data | `homePageType` and selected-page semantics |
| Actions | `fromPage` and `toPage` filters plus the payload for `PlayTransition` or `ChangePage` |

#### Gear

| Content | Requirement |
|---|---|
| Gear type | Matches the gear type on the child |
| Controller binding | Resolves the controller index to a controller reference |
| Pages | Page-ID list |
| Values/default | State structure determined by gear type |
| Tween | Ease, duration, delay, and custom-ease path |
| Extended state | Conditional fields such as GearXY percentages and GearAnimation extended state |

#### Transition

| Content | Requirement |
|---|---|
| Item header | `actionType`, `time`, `target`, `label` |
| Tween | `duration`, `easeType`, `repeat`, `yoyo`, `endLabel` |
| Value | `value` / `startValue` / `endValue` |
| Path | `path`, custom-ease path |

#### ScrollPane

| Content | Requirement |
|---|---|
| Component scroll pane | `scrollType`, `scrollBarFlags`, `scrollBarMargin`, `vt/hz scrollBarRes`, `headerRes`, `footerRes` |
| List scroll pane | The list's own scroll-pane data |
| Tree/list additional flags | `scrollItemToViewOnClick`, `foldInvisibleItems`, and tree settings |

#### Relations

| Content | Requirement |
|---|---|
| Child/component relations | Relation type and `usePercent` |
| Target resolution | Resolve by child index first, then handle numeric indices |

### Runtime phase mapping

| Phase | Corresponding data |
|---|---|
| `constructFromResource2` | Component top-level blocks 0-7 and child-list assembly |
| `setup_beforeAdd` | Child blocks 0 and 5 plus list/tree extension blocks |
| `setup_afterAdd` | Child blocks 1, 4, and 6 plus extension-instance data |
| ScrollPane / Extension definition | Component blocks 6 and 7 plus extra list blocks |

### Decode result

After component decoding, the result should directly provide:

| Dimension | Result |
|---|---|
| Structure | Top-level component structure, child list, controllers, transitions, gears, relations, and scroll pane |
| Semantics | Direct semantic field access rather than raw byte blocks |
| Re-encoding | Component data can be encoded again from the structured result |

## Version contract

| Topic | Description |
|---|---|
| Formal protocol | This document defines and describes V7 only |
| Standard written value | The package-header `version` is always `7` when encoding according to this document |
| Conditional fields | A conditional field appears only under its stated condition; it does not indicate a parallel protocol version |
