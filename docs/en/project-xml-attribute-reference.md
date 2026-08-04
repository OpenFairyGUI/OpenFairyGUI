# Project XML Attribute Protocol

## Summary

This document lists the XML attribute protocol formally declared by `packages/core/src/io/project-xml-protocol.ts`. It describes only:

| Scope | Description |
|---|---|
| Nodes | Current `package.xml` and `component.xml` nodes formally included in the protocol |
| Attributes | Canonical attribute names and aliases declared by the current protocol-layer `attrs` metadata |
| Contract | Current formal implementation only, without historical compatibility, internal storage details, or future plans |

This document does not cover:

| Outside this document | Description |
|---|---|
| `children` protocol | Structures such as `relation`, `gear*`, `item`, and extension children; see the architecture and test contracts |
| `containers` protocol | `displayList` container variants; see [Project XML DisplayList Tag Alignment](./project-xml-displaylist-variants.md) |
| Reader/writer implementation | This page describes the protocol, not its internal consumption path |

## Conventions

| Column | Meaning |
|---|---|
| Attribute | Current canonical XML attribute name |
| Alias | Alias accepted by the current protocol; blank means none |
| Description | Node semantics only, without internal model details |

## `package.xml`

### `packageDescription`

| Attribute | Alias | Description |
|---|---|---|
| `id` |  | Package root identifier |
| `hasFavorites` |  | Whether the package contains favorite resources |
| `compressPNG` |  | Package image-compression switch |
| `jpegQuality` |  | Package JPEG quality |

### `package_branch.xml > branchDescription`

| Attribute | Alias | Description |
|---|---|---|
| No attributes |  | Root node of a branch resource list |

### `packageDescription > publish`

| Attribute | Alias | Description |
|---|---|---|
| `name` |  | Package publish name |
| `path` |  | Package publish path |
| `branchPath` |  | Branch publish path |
| `packageCount` |  | Published package-split count |

### Common resource nodes

These base attributes apply to resources under `resources` in both `package.xml` and `package_branch.xml`.

| Attribute | Alias | Description |
|---|---|---|
| `id` |  | Resource identifier |
| `name` |  | Resource name |
| `path` |  | Resource path |
| `exported` |  | Whether the resource participates in export |
| `favorite` |  | Whether the resource is a favorite |

### `resources > image`

| Attribute | Alias | Description |
|---|---|---|
| `atlas` |  | Image texture-set mode |
| `scale` |  | Scale mode |
| `scale9grid` |  | Nine-slice settings |
| `width` |  | Resource width |
| `height` |  | Resource height |
| `gridTile` |  | Tiled-grid settings |
| `qualityOption` |  | Image quality option |
| `quality` |  | Custom image quality; written when `qualityOption="custom"` |
| `duplicatePadding` |  | Whether edge pixels are duplicated |
| `smoothing` |  | Whether smoothing is enabled |

### `resources > movieclip`

| Attribute | Alias | Description |
|---|---|---|
| `atlas` |  | Animation texture-set mode |
| `smoothing` |  | Whether smoothing is enabled; defaults to `true` and is written only when `false` |

### `resources > font`

| Attribute | Alias | Description |
|---|---|---|
| `texture` |  | Font texture resource |
| `renderMode` |  | Font render mode |
| `samplePointSize` |  | Font sample point size |

### `resources > misc`

| Attribute | Alias | Description |
|---|---|---|
| No additional attributes |  | Uses only common resource attributes; the common `name` carries the resource filename |

### `resources > spine`

| Attribute | Alias | Description |
|---|---|---|
| `width` |  | Skeleton resource width |
| `height` |  | Skeleton resource height |
| `require` |  | Comma-separated dependent resource IDs |
| `atlasNames` |  | Comma-separated atlas names |
| `anchor` |  | Skeleton anchor in `x,y` format |

### `resources > dragonbones`

| Attribute | Alias | Description |
|---|---|---|
| `width` |  | Skeleton resource width |
| `height` |  | Skeleton resource height |
| `require` |  | Comma-separated dependent resource IDs |
| `atlasNames` |  | Comma-separated atlas names |
| `anchor` |  | Skeleton anchor in `x,y` format |

## `component.xml`

Current project write-back contract:

| Item | Description |
|---|---|
| Display-object `xy` | Nodes in `displayList` that support `xy` explicitly write their position; the default origin is written as `xy="0,0"` |

### Root `<component>`

| Attribute | Alias | Description |
|---|---|---|
| `size` |  | Root component size |
| `pivot` |  | Root component pivot |
| `anchor` |  | Root component anchor |
| `margin` |  | Root component margin |
| `restrictSize` |  | Root component size constraints |
| `overflow` |  | Root component overflow mode |
| `clipSoftness` |  | Soft clipping edge |
| `opaque` |  | Whether the component is opaque |
| `mask` |  | Mask target |
| `reversedMask` |  | Whether the mask is reversed |
| `hitTest` |  | Hit-test resource |
| `customData` |  | Custom data |
| `scroll` |  | Scroll mode |
| `scrollBar` |  | Scrollbar display mode |
| `scrollBarFlags` |  | Scrollbar flags |
| `scrollBarMargin` |  | Scrollbar margin |
| `scrollBarRes` |  | Scrollbar resource |
| `ptrRes` |  | Pull-to-refresh resource |
| `extention` |  | Root component extension type |
| `bgColor` |  | Background color |
| `bgColorEnabled` |  | Whether the background color is enabled |
| `idnum` |  | Internal number |
| `initName` |  | Initial name |
| `remark` |  | Remarks |
| `designImageAlpha` |  | Design-image opacity |
| `designImageLayer` |  | Design-image layer |
| `designImageOffsetX` |  | Design-image X offset |
| `designImageOffsetY` |  | Design-image Y offset |

### Root custom property `<customProperty>`

`<customProperty>` is a repeatable direct child of `<component>`.

| Attribute | Alias | Description |
|---|---|---|
| `target` |  | Target object path inside the component |
| `propertyId` |  | Exposed property type: `0` for text, `1` for icon |
| `label` |  | Label displayed by the editor |

### Common display-object attributes

These attributes apply to every concrete display-list object. The tag-specific tables below add their own attributes or restate important fields. An omitted common attribute remains applicable.

| Attribute | Alias | Description |
|---|---|---|
| `id` |  | Object identifier |
| `name` |  | Object name |
| `relation` |  | Relation reference field |
| `xy` |  | Position |
| `size` |  | Size |
| `locked` |  | Whether the object is locked |
| `restrictSize` |  | Size constraints |
| `aspect` |  | Aspect-ratio constraint |
| `pivot` |  | Pivot |
| `anchor` |  | Whether the pivot is used as the coordinate anchor |
| `scale` |  | Scale |
| `skew` |  | Skew in `x,y` format |
| `rotation` |  | Rotation |
| `alpha` |  | Opacity |
| `visible` |  | Whether the object is visible |
| `touchable` |  | Whether the object is touchable |
| `grayed` |  | Whether the object is grayed out |
| `tooltips` |  | Tooltip text |
| `customData` |  | Custom data |
| `blend` |  | Blend mode |
| `filter` |  | Filter type |
| `filterData` |  | Filter data |

### Child component instance `<component>`

| Attribute | Alias | Description |
|---|---|---|
| `src` |  | Referenced component resource |
| `controller` |  | Instance controller override |
| `pageController` |  | Instance page controller |
| `xy` |  | Position |
| `size` |  | Size |
| `locked` |  | Whether the instance is locked |
| `restrictSize` |  | Size constraints |
| `aspect` |  | Aspect-ratio constraint |
| `pivot` |  | Pivot |
| `anchor` |  | Anchor |
| `scale` |  | Scale |
| `group` |  | Owning group |
| `rotation` |  | Rotation |
| `alpha` |  | Opacity |
| `visible` |  | Whether the instance is visible |
| `touchable` |  | Whether the instance is touchable |
| `grayed` |  | Whether the instance is grayed out |
| `tooltips` |  | Tooltip text |
| `customData` |  | Custom data |
| `fileName` |  | Resource filename |
| `pkg` |  | Resource package identifier |
| `filter` |  | Filter type |
| `filterData` |  | Filter data |

### `<image>`

| Attribute | Alias | Description |
|---|---|---|
| `src` |  | Image resource |
| `color` |  | Color |
| `flip` |  | Flip mode |
| `fillMethod` |  | Fill method |
| `fillOrigin` |  | Fill origin |
| `fillClockwise` |  | Whether filling is clockwise |
| `fillAmount` |  | Fill ratio |
| `xy` |  | Position |
| `size` |  | Size |
| `locked` |  | Whether the image is locked |
| `aspect` |  | Aspect-ratio constraint |
| `pivot` |  | Pivot |
| `anchor` |  | Anchor |
| `scale` |  | Scale |
| `skew` |  | Skew in `x,y` format |
| `group` |  | Owning group |
| `rotation` |  | Rotation |
| `alpha` |  | Opacity |
| `visible` |  | Whether the image is visible |
| `touchable` |  | Whether the image is touchable |
| `grayed` |  | Whether the image is grayed out |
| `pkg` |  | Resource package identifier |
| `filter` |  | Filter type |
| `filterData` |  | Filter data |

### `<graph>`

| Attribute | Alias | Description |
|---|---|---|
| `xy` |  | Position |
| `size` |  | Size |
| `locked` |  | Whether the graph is locked |
| `restrictSize` |  | Size constraints |
| `pivot` |  | Pivot |
| `anchor` |  | Anchor |
| `group` |  | Owning group |
| `rotation` |  | Rotation |
| `alpha` |  | Opacity |
| `visible` |  | Whether the graph is visible |
| `touchable` |  | Whether the graph is touchable |
| `grayed` |  | Whether the graph is grayed out |
| `skew` |  | Skew |
| `type` |  | Graph type |
| `lineSize` |  | Line width |
| `lineColor` |  | Line color |
| `fillColor` |  | Fill color |
| `corner` |  | Corner radius |
| `points` |  | Vertex coordinates |
| `sides` |  | Polygon side count |
| `startAngle` |  | Start angle |
| `distances` |  | Vertex distances |

### `<movieclip>` / `<jta>`

| Attribute | Alias | Description |
|---|---|---|
| `src` |  | Animation resource |
| `playing` |  | Whether playback is active |
| `frame` |  | Frame number |
| `color` |  | Color |
| `xy` |  | Position |
| `size` |  | Size |
| `pivot` |  | Pivot |
| `anchor` |  | Whether the pivot is used as the coordinate anchor |
| `group` |  | Owning group |
| `rotation` |  | Rotation |
| `alpha` |  | Opacity |
| `visible` |  | Whether the object is visible |
| `touchable` |  | Whether the object is touchable |
| `grayed` |  | Whether the object is grayed out |
| `fileName` |  | Resource filename |
| `pkg` |  | Resource package identifier |
| `filter` |  | Filter type |
| `filterData` |  | Filter data |

### `<loader>`

| Attribute | Alias | Description |
|---|---|---|
| `xy` |  | Position |
| `size` |  | Size |
| `pivot` |  | Pivot |
| `anchor` |  | Whether the pivot is used as the coordinate anchor |
| `scale` |  | Scale |
| `rotation` |  | Rotation |
| `alpha` |  | Opacity |
| `visible` |  | Whether the loader is visible |
| `touchable` |  | Whether the loader is touchable |
| `grayed` |  | Whether the loader is grayed out |
| `url` |  | Load URL |
| `align` |  | Horizontal alignment |
| `vAlign` |  | Vertical alignment |
| `fill` |  | Fill mode |
| `shrinkOnly` |  | Whether only shrinking is allowed |
| `autoSize` |  | Automatic sizing |
| `useResize` |  | Whether resize is used |
| `color` |  | Color |
| `playing` |  | Whether playback is active |
| `frame` |  | Frame number |
| `fillMethod` |  | Fill method |
| `fillOrigin` |  | Fill origin |
| `fillClockwise` |  | Whether filling is clockwise |
| `fillAmount` |  | Fill ratio |
| `clearOnPublish` |  | Whether the value is cleared on publish |
| `filter` |  | Filter type |
| `filterData` |  | Filter data |

### `<loader3d>`

| Attribute | Alias | Description |
|---|---|---|
| `xy` |  | Position |
| `size` |  | Size |
| `pivot` |  | Pivot |
| `anchor` |  | Whether the pivot is used as the coordinate anchor |
| `rotation` |  | Rotation |
| `alpha` |  | Opacity |
| `visible` |  | Whether the loader is visible |
| `touchable` |  | Whether the loader is touchable |
| `grayed` |  | Whether the loader is grayed out |
| `url` |  | Load URL |
| `align` |  | Horizontal alignment |
| `vAlign` |  | Vertical alignment |
| `fill` |  | Fill mode |
| `shrinkOnly` |  | Whether only shrinking is allowed |
| `autoSize` |  | Automatic sizing |
| `animation` | `animationName` | Animation name |
| `skin` | `skinName` | Skin name |
| `playing` |  | Whether playback is active |
| `frame` |  | Frame number |
| `loop` |  | Whether playback loops |
| `color` |  | Color |
| `clearOnPublish` |  | Whether the value is cleared on publish |

### `<text>`

| Attribute | Alias | Description |
|---|---|---|
| `xy` |  | Position |
| `size` |  | Size |
| `restrictSize` |  | Size constraints |
| `pivot` |  | Pivot |
| `anchor` |  | Whether the pivot is used as the coordinate anchor |
| `customData` |  | Custom data |
| `group` |  | Owning group |
| `rotation` |  | Rotation |
| `alpha` |  | Opacity |
| `visible` |  | Whether the text is visible |
| `touchable` |  | Whether the text is touchable |
| `grayed` |  | Whether the text is grayed out |
| `font` |  | Font |
| `fontSize` |  | Font size |
| `color` |  | Color |
| `align` |  | Horizontal alignment |
| `vAlign` |  | Vertical alignment |
| `autoSize` |  | Automatic sizing |
| `singleLine` |  | Single-line mode |
| `text` |  | Text content |
| `input` |  | Whether the text is editable input |
| `ubb` |  | Whether UBB is enabled |
| `leading` |  | Line spacing |
| `letterSpacing` |  | Letter spacing |
| `underline` |  | Underline |
| `italic` |  | Italic |
| `bold` |  | Bold |
| `strikethrough` |  | Strikethrough |
| `strokeColor` |  | Stroke color |
| `strokeSize` |  | Stroke width |
| `shadowColor` |  | Shadow color |
| `shadowOffset` |  | Shadow offset |
| `autoClearText` |  | Whether text is cleared automatically |
| `demoText` |  | Sample text |
| `faceDilate` |  | Face dilation |
| `underlaySoftness` |  | Underlay softness |
| `vars` |  | Template-variable switch |
| `prompt` | `promptText` | Input prompt |
| `maxLength` |  | Maximum length |
| `restrict` |  | Input restriction |
| `password` |  | Password mode |
| `keyboardType` |  | Keyboard type |

### `<inputtext>`

| Attribute | Alias | Description |
|---|---|---|
| `xy` |  | Position |
| `size` |  | Size |
| `restrictSize` |  | Size constraints |
| `pivot` |  | Pivot |
| `anchor` |  | Whether the pivot is used as the coordinate anchor |
| `customData` |  | Custom data |
| `group` |  | Owning group |
| `rotation` |  | Rotation |
| `alpha` |  | Opacity |
| `visible` |  | Whether the text is visible |
| `touchable` |  | Whether the text is touchable |
| `grayed` |  | Whether the text is grayed out |
| `font` |  | Font |
| `fontSize` |  | Font size |
| `color` |  | Color |
| `align` |  | Horizontal alignment |
| `vAlign` |  | Vertical alignment |
| `autoSize` |  | Automatic sizing |
| `singleLine` |  | Single-line mode |
| `text` |  | Text content |
| `input` |  | Whether the text is editable input |
| `ubb` |  | Whether UBB is enabled |
| `leading` |  | Line spacing |
| `letterSpacing` |  | Letter spacing |
| `underline` |  | Underline |
| `italic` |  | Italic |
| `bold` |  | Bold |
| `strikethrough` |  | Strikethrough |
| `strokeColor` |  | Stroke color |
| `strokeSize` |  | Stroke width |
| `shadowColor` |  | Shadow color |
| `shadowOffset` |  | Shadow offset |
| `autoClearText` |  | Whether text is cleared automatically |
| `demoText` |  | Sample text |
| `faceDilate` |  | Face dilation |
| `underlaySoftness` |  | Underlay softness |
| `vars` |  | Template-variable switch |
| `prompt` | `promptText` | Input prompt |
| `maxLength` |  | Maximum length |
| `restrict` |  | Input restriction |
| `password` |  | Password mode |
| `keyboardType` |  | Keyboard type |

### `<richtext>`

| Attribute | Alias | Description |
|---|---|---|
| `xy` |  | Position |
| `size` |  | Size |
| `pivot` |  | Pivot |
| `anchor` |  | Whether the pivot is used as the coordinate anchor |
| `customData` |  | Custom data |
| `group` |  | Owning group |
| `rotation` |  | Rotation |
| `alpha` |  | Opacity |
| `visible` |  | Whether the text is visible |
| `touchable` |  | Whether the text is touchable |
| `grayed` |  | Whether the text is grayed out |
| `font` |  | Font |
| `fontSize` |  | Font size |
| `color` |  | Color |
| `align` |  | Horizontal alignment |
| `vAlign` |  | Vertical alignment |
| `autoSize` |  | Automatic sizing |
| `singleLine` |  | Single-line mode |
| `text` |  | Text content |
| `ubb` |  | Whether UBB is enabled |
| `leading` |  | Line spacing |
| `letterSpacing` |  | Letter spacing |
| `underline` |  | Underline |
| `italic` |  | Italic |
| `bold` |  | Bold |
| `strikethrough` |  | Strikethrough |
| `strokeColor` |  | Stroke color |
| `strokeSize` |  | Stroke width |
| `shadowColor` |  | Shadow color |
| `shadowOffset` |  | Shadow offset |
| `autoClearText` |  | Whether text is cleared automatically |
| `restrictSize` |  | Size constraints |
| `underlaySoftness` |  | Underlay softness |

### `<group>`

| Attribute | Alias | Description |
|---|---|---|
| `xy` |  | Position |
| `size` |  | Size |
| `locked` |  | Whether the group is locked |
| `pivot` |  | Pivot |
| `anchor` |  | Whether the pivot is used as the coordinate anchor |
| `group` |  | Owning group |
| `rotation` |  | Rotation |
| `alpha` |  | Opacity |
| `visible` |  | Whether the group is visible |
| `touchable` |  | Whether the group is touchable |
| `grayed` |  | Whether the group is grayed out |
| `layout` |  | Layout mode |
| `lineGap` |  | Row gap |
| `colGap` | `columnGap` | Column gap |
| `advanced` |  | Whether advanced grouping is enabled |
| `excludeInvisibles` |  | Whether invisible objects are excluded |
| `autoSizeDisabled` |  | Whether automatic sizing is disabled |
| `mainGridIndex` |  | Main-grid index |

### `<list>` / tree list

| Attribute | Alias | Description |
|---|---|---|
| `src` |  | List resource |
| `layout` |  | Layout mode |
| `align` |  | Horizontal alignment |
| `vAlign` |  | Vertical alignment |
| `lineGap` |  | Row gap |
| `colGap` | `columnGap` | Column gap |
| `lineItemCount` |  | Items per row for `flow_hz`, per column for `flow_vt`, or columns per page for `pagination` |
| `lineItemCount2` |  | Rows per page for `pagination` |
| `autoItemSize` | `autoResizeItem` | Whether item size is adjusted automatically |
| `renderOrder` |  | Child render order: `ascent`, `descent`, or `arch` |
| `apex` |  | Apex child index when `renderOrder="arch"` |
| `selectionMode` |  | Selection mode |
| `selectionController` |  | Selection controller |
| `defaultItem` |  | Default item resource |
| `pageController` |  | Page controller |
| `controller` |  | Controller override |
| `overflow` |  | Overflow mode |
| `scroll` |  | Scroll mode |
| `scrollBar` |  | Scrollbar display mode |
| `scrollBarFlags` |  | Scrollbar flags |
| `scrollBarMargin` |  | Scrollbar margin |
| `scrollBarRes` |  | Scrollbar resource |
| `ptrRes` |  | Pull-to-refresh resource |
| `margin` |  | Margin |
| `clipSoftness` |  | Soft clipping edge |
| `treeView` |  | Whether tree mode is enabled |
| `indent` |  | Tree indentation |
| `clickToExpand` |  | Click-to-expand behavior |
| `autoClearItems` |  | Whether items are cleared automatically |
| `scrollItemToViewOnClick` |  | Whether clicking an item scrolls it into view |
| `foldInvisibleItems` |  | Whether invisible items collapse during layout |
| `xy` |  | Position |
| `size` |  | Size |
| `pivot` |  | Pivot |
| `anchor` |  | Whether the pivot is used as the coordinate anchor |
| `group` |  | Owning group |
| `rotation` |  | Rotation |
| `alpha` |  | Opacity |
| `visible` |  | Whether the list is visible |
| `touchable` |  | Whether the list is touchable |
| `grayed` |  | Whether the list is grayed out |

## Extension child-node protocol

### `<Button>`

| Attribute | Alias | Description |
|---|---|---|
| `mode` |  | Button mode |
| `sound` |  | Click sound |
| `soundVolumeScale` | `volume` | Volume scale |
| `downEffect` |  | Pressed effect |
| `downEffectValue` |  | Pressed-effect value |
| `title` |  | Title |
| `selectedTitle` |  | Selected title |
| `icon` |  | Icon |
| `selectedIcon` |  | Selected icon |
| `titleColor` |  | Title color |
| `titleFontSize` |  | Title font size |
| `controller` |  | Associated controller |
| `page` |  | Associated page |
| `checked` |  | Whether the button is checked |

### `<Label>`

| Attribute | Alias | Description |
|---|---|---|
| `title` |  | Title |
| `icon` |  | Icon |
| `titleColor` |  | Title color |
| `titleFontSize` |  | Title font size |
| `prompt` |  | Prompt text |

### `<ComboBox>`

| Attribute | Alias | Description |
|---|---|---|
| `dropdown` |  | Dropdown component resource |
| `title` |  | Title |
| `icon` |  | Icon |
| `visibleItemCount` |  | Number of visible items |
| `selectionController` |  | Selection controller |
| `autoClearItems` |  | Whether items are cleared automatically |

### `<ProgressBar>`

| Attribute | Alias | Description |
|---|---|---|
| `titleType` |  | Title type |
| `reverse` |  | Whether direction is reversed |
| `value` |  | Current value |
| `max` |  | Maximum value |
| `min` |  | Minimum value |

### `<Slider>`

| Attribute | Alias | Description |
|---|---|---|
| `titleType` |  | Title type |
| `reverse` |  | Whether direction is reversed |
| `wholeNumbers` |  | Whether values use integer steps |
| `changeOnClick` |  | Whether clicking changes the value |
| `value` |  | Current value |
| `max` |  | Maximum value |
| `min` |  | Minimum value |

### `<ScrollBar>`

| Attribute | Alias | Description |
|---|---|---|
| `fixedGripSize` |  | Whether the grip has a fixed size |

## Structural-node attributes

### `<relation>`

| Attribute | Alias | Description |
|---|---|---|
| `target` |  | Target object |
| `sidePair` |  | Relation-side pair |

### `<gear*>`

| Attribute | Alias | Description |
|---|---|---|
| `controller` |  | Controller |
| `pages` |  | Page set |
| `values` |  | Value set |
| `default` |  | Default value |
| `tween` |  | Whether tweening is enabled |
| `positionsInPercent` |  | Whether positions use percentages |
| `condition` |  | Gear condition |
| `ease` |  | Easing type |
| `duration` |  | Duration |

### `<controller>`

| Attribute | Alias | Description |
|---|---|---|
| `name` |  | Controller name |
| `pages` |  | Page set |
| `selected` |  | Currently selected page |

### `<action>`

| Attribute | Alias | Description |
|---|---|---|
| `type` |  | Action type |
| `fromPage` |  | Source page |
| `toPage` |  | Target page |
| `transition` |  | Transition name |
| `repeat` |  | Repeat count |
| `delay` |  | Delay |
| `stopOnExit` |  | Whether to stop on exit |
| `objectId` |  | Target object |
| `controller` |  | Controller name |
| `targetPage` |  | Target page name |

### `<transition>`

| Attribute | Alias | Description |
|---|---|---|
| `name` |  | Transition name |
| `autoPlay` |  | Whether playback starts automatically |
| `autoPlayRepeat` | `autoPlayTimes` | Automatic-play repeat count |
| `autoPlayDelay` |  | Automatic-play delay |
| `options` |  | Options |
| `fps` |  | Frame rate |

### `<transition><item>`

| Attribute | Alias | Description |
|---|---|---|
| `time` |  | Time point |
| `target` |  | Target object |
| `tween` |  | Whether tweening is enabled |
| `duration` |  | Duration |
| `repeat` |  | Repeat count |
| `yoyo` |  | Whether playback alternates direction |
| `label` |  | Label |
| `label2` |  | Secondary label |
| `path` |  | Motion path for XY tweening |
| `customEase` |  | Custom easing-curve data used when `ease="Custom"`; independent of the `path` motion path |
| `ease` |  | Easing type; `Custom` selects `customEase` |
| `type` |  | Item type |
| `value` |  | Value |
| `startValue` |  | Start value |
| `endValue` |  | End value |

### `<list><item>`

| Attribute | Alias | Description |
|---|---|---|
| `title` |  | Title |
| `icon` |  | Icon |
| `url` |  | Linked resource |
| `name` |  | Name |
| `selectedTitle` |  | Selected title |
| `selectedIcon` |  | Selected icon |
| `level` |  | Hierarchy level |
| `isFolder` |  | Whether the item is a folder |
| `controllers` |  | Controller overrides |

### `<component><property>` / `<list><item><property>`

| Attribute | Alias | Description |
|---|---|---|
| `target` |  | Overridden object identifier; must not be empty |
| `propertyId` |  | Non-negative integer property number |
| `value` |  | Override value; an empty string is valid |

`property` children under the same host are preserved in XML order.

### `<ComboBox><item>`

| Attribute | Alias | Description |
|---|---|---|
| `title` |  | Title |
| `value` |  | Value |
| `icon` |  | Icon |

## Maintenance requirements

| Change | Requirement |
|---|---|
| Add an XML attribute | Update this document in the same change |
| Add an alias | Update the canonical/alias mapping together |
| Change tag naming or `displayList` variants | Update [Project XML DisplayList Tag Alignment](./project-xml-displaylist-variants.md) together |
| Protocol-document boundary | Describe only the XML protocol, without internal storage or implementation-alignment details |
