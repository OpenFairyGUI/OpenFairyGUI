# FairyGUI 二进制封包协议

本文只描述 FairyGUI 发布二进制包的协议结构。本文按 V7 正式协议组织说明，不展开为多版本协议手册，也不描述具体项目的内部承载方式。

## 目录

| 章节 | 跳转 |
|---|---|
| 总体布局 | [查看](#总体布局) |
| 文件头 | [查看](#文件头) |
| 压缩策略 | [查看](#压缩策略) |
| 索引表 | [查看](#索引表) |
| 字符串表 | [查看](#字符串表) |
| Block 0：Dependencies | [查看](#block-0dependencies) |
| Block 1：Package Items | [查看](#block-1package-items) |
| Block 2：Sprites | [查看](#block-2sprites) |
| Block 3：Pixel Hit Test | [查看](#block-3pixel-hit-test) |
| Component 解码 | [查看](#component-解码) |
| Component / 解码目标 | [查看](#解码目标) |
| Component / 解码入口 | [查看](#解码入口) |
| Component / 顶层 block 布局 | [查看](#顶层-block-布局) |
| Component / 顶层 block 详细内容 | [查看](#顶层-block-详细内容) |
| Component / Child 解码 | [查看](#child-解码) |
| Component / Child Block 8 | [查看](#child-block-8静态-list-items) |
| Component / 扩展类型与 afterAdd 数据 | [查看](#扩展类型与-afteradd-数据) |
| Component / 结构化对象解码边界 | [查看](#结构化对象解码边界) |
| Component / 运行时阶段映射 | [查看](#运行时阶段映射) |
| Component / 解码结果 | [查看](#解码结果) |
| 版本口径 | [查看](#版本口径) |

## 总体布局

二进制包由“固定头部 + 数据区”组成。头部始终未压缩；当 `compressed=true` 时，头部之后的数据区使用 raw deflate。

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

## 文件头

| 字段 | 协议说明 |
|---|---|
| `magic` | 固定为 `FGUI_MAGIC`，即 `"FGUI"` 的 `uint32` |
| `version` | V7 协议固定写 `7` |
| `compressed` | `bool`，表示头部之后的数据区是否经过 raw deflate |
| `packageId` | 包 ID |
| `packageName` | 包名字符串 |
| `reserved` | 固定保留 20 字节 |

说明：
- 本文只定义 V7 协议口径。
- `packageName` 是包名字段，不是发布输出文件名。

## 压缩策略

| 场景 | 协议说明 |
|---|---|
| `compressed=false` | 头部之后直接写未压缩数据区 |
| `compressed=true` | 头部之后写 raw deflate 压缩后的数据区 |

## 索引表

数据区开头是索引表，用于定位后续 6 个 block。

| 字段 | 协议说明 |
|---|---|
| `segCount` | `6` |
| `useShort` | `false` |
| 偏移类型 | `uint32` |

偏移顺序如下：

| Block | 含义 |
|---|---|
| 0 | dependencies |
| 1 | package items |
| 2 | sprites |
| 3 | pixel hit test |
| 4 | string table |
| 5 | long string patches |

## 字符串表

### Block 4

| 内容 | 协议说明 |
|---|---|
| 字符串表数量 | `int32` |
| 常规字符串 | 直接写 `UTFString` |
| 超长字符串 | 在 block 4 中写空串占位，正文放入 block 5 |

### Block 5

| 内容 | 协议说明 |
|---|---|
| patch 数量 | `int32` |
| 每条 patch | `index` + `byteLength` + 原始 UTF-8 字节 |

block 5 的 patch 用于替换 block 4 中相同索引位置的占位字符串。

## Block 0：Dependencies

| 字段 | 协议说明 |
|---|---|
| `depCnt` | `int16` |
| 依赖项 | 每项写 `id` 与 `name` |
| 条件附加字段 | 分支段先写 `branchCount:int16`，再按顺序写 branch 名列表 |

## Block 1：Package Items

该 block 保存包内条目列表。每个条目至少包含通用头部，再按条目类型追加各自数据段。

### 已记录的 item 类型

| type code | item type | 协议内容 |
|---|---|---|
| `0` | `Image` | `id`、`name`、`path`、尺寸、`scaleOption`、`scale9Grid`、`smoothing` |
| `1` | `MovieClip` | 通用字段 + 帧数据块 |
| `2` | `Sound` | 通用字段 + 声音文件名 |
| `3` | `Component` | 通用字段 + 扩展类型码 + 组件二进制 |
| `4` | `Atlas` | atlas 条目 `id`、`file`、尺寸 |
| `5` | `Font` | 通用字段 + glyph 数据块 |
| `7` | `Misc` | 未归类条目 |
| `8` | `Unknown` | 未建模的 package item 类型码 |
| `9` | `Spine` | 通用字段 + 资源文件名 + `skeletonAnchor.x` + `skeletonAnchor.y` |
| `10` | `DragonBones` | 通用字段 + 资源文件名 + `skeletonAnchor.x` + `skeletonAnchor.y` |

### 通用头部字段

每个 package item 在类型数据段之前都先写通用头部：

| 字段 | 协议说明 |
|---|---|
| `type` | `uint8` item 类型码 |
| `id` | 资源 ID |
| `name` | 资源名称 |
| `path` | 资源路径 |
| `file` | 发布后供运行时加载的文件名或相对路径 |
| `exported` | 是否导出 |
| `width` | 资源宽度 |
| `height` | 资源高度 |

### `Spine` / `DragoneBones` item 数据段

`Spine` 与 `DragoneBones` 在通用头部之后追加 skeleton 锚点：

| 字段 | 协议说明 |
|---|---|
| `skeletonAnchor.x` | `float32` |
| `skeletonAnchor.y` | `float32` |

说明：
- `require`、`atlasNames` 等工程资源层字段不直接写入 package item 数据段。
- 运行时通过 `file` 和 `skeletonAnchor` 完成 skeleton 资源定位与对齐。

### `file` 的发布语义

`file` 字段承载的是发布产物中的资源定位结果，而不是工程资源目录下的原始文件名。当前 Unity 侧运行时口径下：

| 资源类型 | `file` 语义 |
|---|---|
| `Atlas` / `Sound` / `Misc` | 指向发布后的附属资源文件名 |
| `Spine` / `DragoneBones` | 指向发布后的 skeleton 主资源文件名；运行时再按该路径加载对应资源 |

当前 Unity 发布侧的 `Spine` 常见附属资源命名规则如下：

| 工程资源文件 | 发布结果 |
|---|---|
| `*.skel` | `*.skel.bytes` |
| `*.atlas` | `*.atlas.txt` |
| `*.png` | 保持原文件名 |

非 Unity 项目保持工程侧 `.skel` 与 `.atlas` 文件名。

当发布设置启用“分支 atlas 单独输出”时，atlas 条目的 `file` 会写成分支后缀形式，例如 `atlas0_dev.png`。主干 atlas 仍写 `atlas0.png`。

`DragoneBones` 样本中的主文件与依赖文件当前保持原文件名，例如 `dragon_ske.json`、`dragon_tex.json`、`dragon.png`。

### 条件附加字段

条目尾部包含条件附加段：

| 字段 | 协议说明 |
|---|---|
| branch name | 当前条目所属分支名；主分支条目写 `null` |
| branchCount | 分支映射数量；当包启用分支表时，主条目按包级 branch 顺序写分支变体 item id 列表 |
| highResCount | 高分辨率变体槽位数量；后续按 `@2x`、`@3x`、`@4x` 顺序写 package item id |

说明：
- package-level branch 表存在时，主条目的 `branchCount` 对应的是已写出的 branch 槽位数量。
- branch 变体条目自身只写 `branch name`，不再继续嵌套 `branchCount` 映射。
- 高分辨率列表只引用已经发布为 package item 的 `image` / `movieclip` 资源，不在发布期主动放大原始位图。
- 当中间倍率缺失但后续倍率存在时，对应槽位写 `null`；尾部缺失槽位省略。
- 当发布模式为 `主干合并活跃分支` 时，发布结果已经完成分支替换，包级 `branchCount` 写 `0`，各 item 的 `branch name` 与 `branchCount` 也都写空值。
- 当发布模式保留分支且 atlas 单独输出时，分支 atlas 可以使用独立 atlas 条目；当前编辑器样本中分支 atlas 的 index 使用 `100 + pageIndex`。

## Block 2：Sprites

| 字段 | 协议说明 |
|---|---|
| sprite 数量 | `uint16` |
| 基础字段 | `itemId`、`atlasId`、`x`、`y`、`w`、`h`、`rotated` |
| 条件附加字段 | `offsetX`、`offsetY`、`originalWidth`、`originalHeight` |

该 block 用于描述资源在 atlas 中的裁切矩形与原始尺寸信息。

## Block 3：Pixel Hit Test

| 字段 | 协议说明 |
|---|---|
| 数量 | `int16` |
| 每项 | `itemId`、废弃 offset、`pixelWidth`、`scaleDenominator`、位图 bitmask 长度与数据 |

该 block 用于描述图像资源的像素级命中测试数据。

## Component 解码

### 解码目标

`Component` 条目的数据区不是普通资源字段集合，而是一段独立组件缓冲区。该缓冲区需要按组件协议展开为组件语义结构，包括：

| 语义对象 | 解码结果 |
|---|---|
| `Component` | header、relations、advanced properties、extension definition、scroll pane、transitions |
| child 节点 | beforeAdd / afterAdd / gears / relations / type-specific data |
| `Controller` | 名称、页面、主页类型、actions 容器 |
| `Transition` | header、item、tween、value、path、label、target |
| `Gear` | controller 绑定、pages、状态值、tween 条件 |
| ScrollPane / List / Tree | 滚动配置、列表布局、树设置、资源引用与控制器引用 |

### 解码入口

当 package item type 为 `Component` 时，条目数据区包含：

| 步骤 | 协议动作 |
|---|---|
| 1 | 读取 `extension type` |
| 2 | 读取组件二进制缓冲区 |
| 3 | 以组件级 index table 解释该缓冲区 |
| 4 | 按顶层 block 顺序解码组件 |
| 5 | 对 display list 中的每个 child 继续按 child 自身 index table 解码 |

### 顶层 block 布局

组件顶层共有 8 个 block，顺序固定：

| Block | 解码目标 |
|---|---|
| 0 | Component header：尺寸、restrict size、pivot、margin、overflow、clipSoftness |
| 1 | Controllers：控制器列表、页面、action 容器 |
| 2 | Display list：child 列表，child 自身再嵌套解码 |
| 3 | Component-level relations |
| 4 | Advanced properties：customData、opaque、mask、hitTest、stage sound |
| 5 | Transitions |
| 6 | Extension definition：Button / Label / ComboBox / ProgressBar / Slider / ScrollBar |
| 7 | ScrollPane：仅 `overflow=scroll` 时存在 |

解码顺序要求：
- 先读取组件 index table 头部的 `blockCount` 与 `useShort`。
- 再按顺序读取 8 个 block offset。
- block 6、7 的 offset 为 `0` 时表示该 block 不存在。

### 顶层 block 详细内容

#### Block 0：Component header

| 字段组 | 内容 |
|---|---|
| 尺寸 | `sourceWidth`、`sourceHeight` |
| restrict size | `minWidth`、`maxWidth`、`minHeight`、`maxHeight` |
| pivot | `pivotX`、`pivotY`、`pivotAsAnchor` |
| margin | `top`、`bottom`、`left`、`right` |
| overflow | `Visible` / `Hidden` / `Scroll` |
| clipSoftness | `x`、`y` |

#### Block 1：Controllers

每个 controller 自带一个 3-block index table：

| 子 Block | 内容 |
|---|---|
| 0 | `name`、`autoRadioGroupDepth` |
| 1 | `pages`（id + name）、`homePageType` |
| 2 | `actions` 容器与 action payload |

`actions` block 先写 `actionCount:int16`，随后每个 action 以 `chunkSize:int16` 开头，action 正文顺序固定如下：

| 字段 | 含义 |
|---|---|
| `actionType:uint8` | `0 = PlayTransition`，`1 = ChangePage` |
| `fromPageCount:int16` + `fromPage[]` | 进入条件页 id 列表 |
| `toPageCount:int16` + `toPage[]` | 目标页 id 列表 |
| 条件 payload | 按 `actionType` 继续读取 |

条件 payload：

| `actionType` | payload |
|---|---|
| `PlayTransition` | `transitionName`、`playTimes:int32`、`delay:float32`、`stopOnExit:bool` |
| `ChangePage` | `objectId`、`controllerName`、`targetPage` |

#### Block 2：Display list

该 block 保存 child 列表：

| 步骤 | 协议动作 |
|---|---|
| 1 | 读取 child 数量 |
| 2 | 逐个 child 读取 `dataLen` |
| 3 | 读取 child 自身 index table |
| 4 | 按 object type 决定 child 类型 |
| 5 | 按 child block 顺序解码公共字段、特定字段、relations、gears、afterAdd 数据 |

#### Block 3：Component-level relations

| 内容 | 说明 |
|---|---|
| target | 优先按 child index 解析 |
| relation pairs | 每个 target 下有多个 relation type + `usePercent` 组合 |

#### Block 4：Advanced properties

| 字段 | 说明 |
|---|---|
| `customData` | 组件自定义数据 |
| `opaque` | 是否 opaque |
| `mask` / `reversedMask` | 通过 display list index 引用 child |
| `hitTest` | child index 模式或外部 hit test 资源模式 |
| `addedToStageSound` / `removedFromStageSound` | 条件字段 |

#### Block 5：Transitions

| 内容 | 说明 |
|---|---|
| transition header | `name`、`options`、`autoPlay`、`autoPlayTimes`、`autoPlayDelay` |
| item header | `actionType`、`time`、`target`、`label`、`tween` |
| tween block | `duration`、`easeType`、`repeat`、`yoyo`、`endLabel` |
| value block | `value` / `startValue` / `endValue` |
| path block | `path`、custom ease path |

#### Block 6：Extension definition

| 扩展类型 | 内容 |
|---|---|
| `Button` | `mode`、`sound`、`soundVolumeScale`、`downEffect`、`downEffectValue` |
| `Label` | 无额外定义块 |
| `ComboBox` | `dropdown` |
| `ProgressBar` | `titleType`、`reverse` |
| `Slider` | `titleType`、`reverse`、`wholeNumbers`、`changeOnClick` |
| `ScrollBar` | `fixedGripSize` |

#### Block 7：ScrollPane

仅当 component `overflow=scroll` 时存在：

| 字段组 | 内容 |
|---|---|
| 滚动基础 | `scrollType`、`scrollBarFlags` |
| margin | `scrollBarMargin` |
| 资源引用 | `vtScrollBarRes`、`hzScrollBarRes`、`headerRes`、`footerRes` |

### Child 解码

#### Child 公共结构

child 自身带独立 index table，不同对象类型的 block 数量不同：

| child 类型 | block 数量 |
|---|---|
| 普通 child | 7 |
| `GList` | 9 |
| Tree | 10 |

说明：
- Tree 不是独立外层资源条目类型。
- 当前实现的正式模型使用 `GTree`，但项目 XML 仍按编辑器口径写成 `<list treeView="true">`。

#### object type 映射

| object type index | 组件对象类型 |
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

#### Child block 解码顺序

| Block | 内容 |
|---|---|
| 0 | beforeAdd：object type、src、pkgId、id、name、xy、size、scale、skew、pivot、alpha、rotation、visible、touchable、grayed、blend、customData |
| 1 | afterAdd 公共段：tooltips、group |
| 2 | gears |
| 3 | relations |
| 4 | `GComponent` / `GList` page controller 或 `GTextInput` 特定段 |
| 5 | child-type-specific extension |
| 6 | afterAdd 文本/图标/扩展实例数据 |
| 7 | `GList` 的 scroll pane |
| 8 | `GList` 的静态 list items |
| 9 | tree settings |

#### Child Block 4

| 类型 | 内容 |
|---|---|
| `GComponent`、`GList`、`GButton`、`GLabel`、`GComboBox`、`GProgressBar`、`GSlider`、`GScrollBar` | page controller / 组件实例关联信息 |
| `GTextInput` | 输入框特定设置 |
| 其他类型 | offset 为 `0`，该 block 不存在 |

#### Child Block 5：类型特定扩展

| 类型 | 主要字段 |
|---|---|
| `GImage` | color、flip、fillMethod、fillOrigin、fillClockwise、fillAmount |
| `GTextField` / `GRichTextField` / `GTextInput` | font、fontSize、color、align、vAlign、leading、letterSpacing、ubb、autoSize、underline、italic、bold、singleLine、stroke、shadow、strikethrough |
| `GGraph` | graphType、lineSize、lineColor、fillColor、cornerRadius、points、sides、startAngle、distances |
| `GGroup` | layout、lineGap、columnGap、excludeInvisibles、autoSizeDisabled、mainGridIndex |
| `GLoader` | url、align、vAlign、fill、shrinkOnly、autoSize、playing、frame、color、fillMethod、useResize |
| `GLoader3D` | url、align、vAlign、fill、shrinkOnly、autoSize、animationName、skinName、playing、frame、loop、color |
| `GMovieClip` | color、frame、playing |
| `GList` | layout、selectionMode、align、vAlign、lineGap、columnGap、lineCount、columnCount、autoResizeItem、childrenRenderOrder、apexIndex、margin、overflow、clipSoftness、scrollItemToViewOnClick、foldInvisibleItems |

### 扩展类型与 afterAdd 数据

Block 6 用于恢复 afterAdd 阶段写入的数据：

| 类型 | 内容 |
|---|---|
| `GTextField` / `GRichTextField` / `GTextInput` | `text` |
| `GButton` | `title`、`selectedTitle`、`icon`、`selectedIcon`、`titleColor`、`titleFontSize`、`relatedController`、`relatedPageId`、`sound`、`soundVolume`、`selected` |
| `GLabel` | `title`、`icon`、`titleColor`、`titleFontSize`、输入设置占位、`sound` |
| `GComboBox` | `items`、`values`、`icons`、`title`、`icon`、`visibleItemCount`、`popupDirection`、`selectionController`、`sound` |
| `GProgressBar` / `GSlider` | `value`、`max`、`min`、`sound` |
| `GList` | `selectionController` |
| `GComponent` Button 扩展实例 | `title`、`selectedTitle`、`icon`、`selectedIcon`、`titleColor`、`titleFontSize`、`relatedController`、`relatedPageId`、`sound`、`soundVolumeScale`、`selected` |
| 其他扩展实例数据 | `InstanceExtType` 分支下的 Label / ComboBox / ProgressBar / Slider / ScrollBar 实例数据 |

### Child Block 8：静态 List Items

`GList` 与 `GTree` 共用 Block 8。Block 开头先写默认项资源与项数，随后每个静态项使用长度前缀分块：

| 顺序 | 字段 | 编码与语义 |
|---|---|---|
| 1 | `defaultItem` | 字符串表引用 |
| 2 | `itemCount` | `Int16` |
| 3 | `chunkSize` | 每项一个 `Int16`，表示该长度字段之后的项数据字节数 |
| 4 | `url` | 字符串表引用 |
| 5 | `isFolder` | 仅 `GTree` 存在，`Bool` |
| 6 | `level` | 仅 `GTree` 存在，`UInt8`；写入前将负值收敛为 `0` |
| 7 | `title`、`selectedTitle` | 可空字符串引用 |
| 8 | `icon`、`selectedIcon`、`name` | 可空字符串表引用 |
| 9 | `controllerOverrideCount` | `Int16` |
| 10 | controller overrides | 重复 `controllerOverrideCount` 次，每次依次写 `(controllerName, selectedPageId)` 两个字符串表引用 |
| 11 | `propertyOverrideCount` | V7 中存在的 `Int16`；当前写入器写 `0`，读取器会跳过已存在的属性覆盖项 |

静态项模型中的 `controllers` 使用逗号分隔的成对形式：`controllerName,selectedPageId,...`。编码时每一对写入一个 controller override；空的 controller name 不形成覆盖项，缺失的 selected page ID 按空字符串写入。解码时再按相同顺序还原为成对字符串。

Tree 项的 `isFolder` 在二进制中没有 `null` 表示，因此编码时按以下规则解析：

- 显式 `true` 或 `false` 原样写入。
- `null` 或未指定时，仅当下一项的 `level` 大于当前项的 `level` 才写为 `true`。
- 下一项同级、层级更浅或当前项已经是最后一项时写为 `false`。

这使无图标、无 URL 的叶节点仍按层级语义编码；图标与资源 URL 不参与文件夹推断。

### 结构化对象解码边界

#### Controller

| 内容 | 要求 |
|---|---|
| 名称 | `name` |
| 页面 | `ControllerPage.id`、`ControllerPage.name` |
| 主页信息 | `homePageType` / 选中页相关语义 |
| actions | `fromPage`、`toPage` 过滤条件，以及 `PlayTransition` / `ChangePage` 对应 payload |

#### Gear

| 内容 | 要求 |
|---|---|
| gear type | 与 child 上的 gear 类型一致 |
| controller 绑定 | controller index 解析为 controller 引用 |
| pages | page id 列表 |
| values/default | 不同 gear 类型对应不同状态结构 |
| tween | ease、duration、delay、custom ease path |
| 扩展状态 | GearXY percent、GearAnimation 扩展状态等条件字段 |

#### Transition

| 内容 | 要求 |
|---|---|
| item header | `actionType`、`time`、`target`、`label` |
| tween | `duration`、`easeType`、`repeat`、`yoyo`、`endLabel` |
| value | `value` / `startValue` / `endValue` |
| path | `path`、custom ease path |

#### ScrollPane

| 内容 | 要求 |
|---|---|
| component scroll pane | `scrollType`、`scrollBarFlags`、`scrollBarMargin`、`vt/hz scrollBarRes`、`headerRes`、`footerRes` |
| list scroll pane | 列表自身的 scroll pane 数据 |
| tree/list 附加位 | `scrollItemToViewOnClick`、`foldInvisibleItems`、tree 设置 |

#### Relations

| 内容 | 要求 |
|---|---|
| child / component 级 relations | relation type 与 `usePercent` |
| target 解析 | 优先按 child index 解析，再处理数值索引 |

### 运行时阶段映射

| 阶段 | 对应数据 |
|---|---|
| `constructFromResource2` | 组件顶层 block 0-7 与 child 列表装配 |
| `setup_beforeAdd` | child block 0、5 以及 list/tree 扩展块 |
| `setup_afterAdd` | child block 1、4、6 与扩展实例数据 |
| ScrollPane / Extension definition | 组件 block 6、7 与 list 额外 block |

### 解码结果

Component 解码完成后，应能直接得到：

| 维度 | 结果 |
|---|---|
| 结构 | 组件顶层结构、child 列表、controller、transition、gear、relations、scroll pane |
| 语义 | 可直接按组件语义访问各字段，而不是停留在原始字节块层面 |
| 编码回写 | 可依据结构化结果重新编码组件数据 |

## 版本口径

| 主题 | 说明 |
|---|---|
| 正式协议口径 | 本文只定义和说明 V7 |
| 标准写出值 | 按本文档封包时，包头 `version` 固定为 `7` |
| 条件字段 | 文中提到的条件字段仅表示字段是否按条件出现，不表示存在并列协议版本 |
