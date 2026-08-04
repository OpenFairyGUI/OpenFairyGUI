# Project XML DisplayList Tag Alignment

## Conclusion

The `displayList` in `component.xml` currently distinguishes three naming systems:

| Layer | Meaning |
|---|---|
| Raw XML tag | The tag name present under `component.xml <displayList>`. |
| `displayList` variant | The ordered polymorphic variant used for container validation in the project protocol. |
| Editor `DisplayListItem.type` | The display-list item type used by the FairyGUI Editor runtime after loading. |

This document defines the current alignment among these names so that the `displayList` container protocol, project I/O, and editor `DisplayListItem.type` values do not drift apart.

## Naming rules

| Rule | Description |
|---|---|
| A raw XML tag describes only the tag present in the file. | Examples: `loader3d`, `list`. |
| A `displayList` variant describes only the object variant in the container. | Examples: `loader3D`, `tree`, `inputtext`. |
| Editor `DisplayListItem.type` uses the normalized result after editor loading. | Examples: `inputtext`, `tree`. |
| Raw tags and variants may use different names during I/O. | Confirmed mappings include `loader3d -> loader3D`, `list -> tree`, and `text -> inputtext`. |

## Alignment table

| Object semantics | Raw XML tag | `displayList` variant | Editor `DisplayListItem.type` | Current write contract |
|---|---|---|---|---|
| Image | `image` | `image` | `image` | `image` |
| Plain text | `text` | `text` | `text` | `text` |
| Input text | `text` with `input="true"`, or explicit `inputtext` | `inputtext` | `inputtext` | `inputtext` |
| Rich text | `richtext` | `richtext` | `richtext` | `richtext` |
| Graph | `graph` | `graph` | `graph` | `graph` |
| Group | `group` | `group` | `group` | `group` |
| Loader | `loader` | `loader` | `loader` | `loader` |
| Loader3D | `loader3d` | `loader3D` | Aligned as `loader3D` in this repository | `loader3d` |
| MovieClip | `movieclip` | `movieclip` | `movieclip` | `movieclip` |
| JTA animation | `jta` | `jta` | `jta` | `jta` |
| Child component instance | `component` | `component` | Resource reference objects normally omit an independent `type`; the referenced resource determines the display-list item. | `component` |
| List | `list` | `list` | `list` | `list` |
| Tree | `list` with `treeView="true"`, or explicit `tree` | `tree` | `tree` | `list` with `treeView="true"` |

## Conditional variants

The following variants depend on additional conditions and cannot be determined from the raw tag alone:

| Raw XML carrier | Condition | `displayList` variant | Editor evidence |
|---|---|---|---|
| `text` | `input="true"` | `inputtext` | `UIPackage.loadComponentChildren(...)` |
| `list` | `treeView="true"` | `tree` | `UIPackage.loadComponentChildren(...)` |
| `loader3d` | No extra condition; the variant uses camel case. | `loader3D` | Current project-protocol container contract |

## Current write rules

| Scenario | Written result |
|---|---|
| `GTextField` | `text` |
| `GTextInput` | `inputtext` |
| `GRichTextField` | `richtext` |
| `GTree` | `list` with `treeView="true"` |
| `GLoader3D` | `loader3d` |
| `GMovieClip` | `jta` |
| Compatibility input using `movieclip` | Always written as `jta`. |
| `GComponent / GButton / GLabel / GComboBox / GProgressBar / GSlider / GScrollBar` | `component` |

## Maintenance requirements

| Item | Requirement |
|---|---|
| Add a `displayList` object type | Update the raw XML tag, `displayList` variant, editor alignment, and this table together. |
| Change the `displayList` container variant set | Recheck project reading, project writing, and editor `DisplayListItem.type` alignment together. |
| Change normalization for `text`, `tree`, `loader3d`, or `jta` | Update this table in the same change; changing only a code constant is not allowed. |
| Documentation boundary | This document covers `displayList` naming and variant protocols only, not internal reader or writer implementation details. |
