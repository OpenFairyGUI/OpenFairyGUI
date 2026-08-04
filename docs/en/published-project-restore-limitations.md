# Limited Published Project Recovery

`restore` is a constrained local disaster-recovery path. It is not a normal FairyGUI authoring entrypoint, an importer for third-party releases, or a promise to reconstruct source projects. This document defines its safe operating scope and the information that the current repository has verified cannot be recovered reliably from published artifacts alone.

## Supported use and safety boundary

| Item | Current contract |
|---|---|
| Input | Process only trusted local publish directories. Unknown `.fui` or `_fui.bytes` files are not considered safe input. |
| Output | Must be a separate project directory; a single `.fairy` file is not accepted as the destination. |
| Path constraints | Reject path traversal in resource paths, package names, branch names, and filenames. A published resource that resolves outside the input directory also fails. |
| Replacement behavior | Write the project and resources to an adjacent staging directory before replacing the destination. `--force` does not delete old output before binary parsing and resource reconstruction complete. |
| Not guaranteed | This is not a malware scanner and does not guarantee that third-party artifacts can be restored safely or completely. |

In this document, “not recoverable” means:

| Item | Meaning |
|---|---|
| Input scope | Only `.fui` or `_fui.bytes`, atlas PNG files, and loose resources from the publish directory are available. |
| Standard | Original project semantics or XML text cannot be reconstructed reliably and generally without external assistance. |
| Excluded | Ordinary implementation gaps that can still converge through protocol, writer, and test improvements. |

## Summary

| Conclusion | Description |
|---|---|
| Limited recovery goal | Produce a readable, openable, internally consistent FairyGUI project from trusted input. |
| Not a goal | Reproduce a source project byte for byte. |
| Primary reason | Published artifacts omit editor-time information or reduce original values to runtime precision. |

## Confirmed unrecoverable information

### 1. Resources or actions absent from the published package

| Category | Unrecoverable information | Reason | Current sample evidence |
|---|---|---|---|
| Component resources | Component XML present in the source project but omitted from the published package. | The published artifact contains no resource definition, so `restore` cannot recreate real content. | `HitTest/component1.xml`, `PullToRefresh/Button1.xml`, `PullToRefresh/Button2.xml`, `TurnPage/Button3.xml` |
| Transition items | Items present in the source project but absent from the binary transition block. | No corresponding timeline item exists in the binary data. | Six items with `target="n3"` in `Transition/BOSS.xml` |

Synthesizing these entries would create placeholders, not restore the original project.

### 2. Original resource filenames and extensions

| Category | Unrecoverable information | Reason | Current sample evidence |
|---|---|---|---|
| Regular images | Original file extensions and double-extension names. | Published packages retain runtime resource names, not stable source filenames. | `change.jpg -> change.png`, `Paper.jpg -> Paper.png`, `i3.png.png -> i3.png` |
| Some loose resources | Original project names when publish names are unrelated and no stable mapping remains. | The publish directory exposes only post-publish filenames. | A small number of publish-name remnants may still exist. |

The current implementation restores resource ID names where possible, but cannot infer original extensions reliably in general.

### 3. Original text precision of transition paths

| Category | Unrecoverable information | Reason | Current sample evidence |
|---|---|---|---|
| Path strings | Original decimal precision and formatting of paths in editor XML. | Published binaries store float32 values, so writing can reproduce only numerically equivalent strings. | `path` in `Transition/PathDemo.xml` |

The same geometric path can usually be recovered, but its XML string is not guaranteed to match exactly.

### 4. Editor information reduced to runtime defaults

| Category | Unrecoverable information | Reason | Current sample evidence |
|---|---|---|---|
| Transition easing | A specific ease name from the source project. | The relevant samples decode to the default easing, so the binary data cannot prove which non-default ease was authored. | Some `Expo.Out`, `Back.Out`, and `Bounce.Out` entries in `Transition/BOSS.xml`, `TRAP.xml`, and `GoodHit.xml` |
| Simple Group nodes | `GGroup` nodes used only for editor grouping without additional runtime semantics. | Published component data removes these groups; neither a group node nor a stable ownership index remains in the binary child list. | `Basics/Demo_Clip&Scroll.xml`, `Emoji/Main.xml`, `TurnPage/Book.xml` |
| Advanced Group mode | `group.advanced="true"` in source XML. | Published group blocks store runtime layout and spacing but not the editor's advanced-mode switch; decoded groups therefore become `advanced=false`. | `Basics/Demo_Grid.xml`, `Transition/Main.xml`, `Transition/PowerUp.xml` |
| Current controller page | The current `controller.selected` state in source XML. | Published controller blocks stably store `homePageType/homePage`, not the editor's current nonzero page selection. | `bookPos="2"` in `TurnPage/Main.xml`; `style="1"` or `side="1"` in `TurnPage/Page.xml`; `side="1"` in `FrontCover.xml` and `BackCover.xml` |
| Controller export flag | `controller.exported="true"` in source XML. | The controller publish block stores only `name/pages/homePageType/homePage/actions`. | `TurnPage/BackCover.xml`, `TurnPage/FrontCover.xml`, `TurnPage/Page.xml` |
| Explicit defaults | Whether a default property was written explicitly in the source project. | Published packages retain semantic values, not whether a default was explicitly present in XML. | Examples include `xy="0,0"`, empty text, and default booleans. |

This information is normally still usable after recovery, but the editor representation cannot be reproduced item by item.

### 5. Local editor project settings

| Category | Unrecoverable information | Reason |
|---|---|---|
| Project identity | Original `projectId`. | `restore` generates a new project identity. |
| Project settings | Original `.objs`, workspace data, and local editor state. | Publish directories do not contain these local project files. |
| Configuration beyond initialization defaults | Source-project configuration not included in published artifacts. | `restore` initializes project settings from defaults rather than recovering the original workspace. |

The goal is to rebuild a usable project, not the editor's local working environment.

### 6. Text-level details of source XML

| Category | Unrecoverable information | Reason |
|---|---|---|
| Attribute order | Original attribute ordering in a tag. | XML semantics do not depend on attribute order, and published artifacts do not preserve it. |
| Formatting style | Line breaks, indentation, self-closing syntax, and whitespace style. | These are writer output choices rather than publish protocol data. |
| Casing and numeric style | Casing of some colors and formatting of decimal values. | Published packages retain numeric semantics, not source text style. |

The implementation follows FairyGUI Editor conventions where practical, but these formatting details are not treated as data that can be inferred from published artifacts.

## Current recovery output

| Item | Current contract |
|---|---|
| Project | Produce a readable, openable, editable FairyGUI project from trusted input. |
| Resources | Recover packaged assets, component XML, derived font textures, `.jta`, `.fnt`, and other modeled resources where evidence is available. |
| Not guaranteed | Original filenames, text formatting, and local editor state. |

## When external information is required

If the goal is to approximate original source text or naming rather than rebuild a usable project, provide additional input:

| Additional input | Purpose |
|---|---|
| Original project directory | Authoritative names, paths, missing resources, and text style. |
| Editor workspace files | Restore `.objs`, workspace data, and local project state. |
| Pre-publish manifest or mapping | Reconnect publish names to source project names. |

## Conclusions that remain valid for current samples

| Question | Answer |
|---|---|
| Can published artifacts rebuild a working project? | Yes. |
| Can published artifacts reproduce the authentic source project? | No. |
| Should recovery continue to improve? | Yes, but only where published artifacts provide evidence. |
