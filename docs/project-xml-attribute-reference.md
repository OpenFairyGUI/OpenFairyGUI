# Project XML 属性协议

## 结论

本文档整理 `packages/core/src/io/project-xml-protocol.ts` 当前正式声明的 XML 属性协议，只描述：

| 范围 | 说明 |
|---|---|
| 节点 | 当前已正式纳入协议的 `package.xml`、`component.xml` 相关节点 |
| 属性 | 当前协议层 `attrs` 中声明的 canonical 属性名与 alias |
| 口径 | 只写当前正式实现，不记录历史兼容、内部承载方式或未来规划 |

本文档不覆盖：

| 不在本文档范围内 | 说明 |
|---|---|
| `children` 协议 | `relation`、`gear*`、`item`、扩展子节点等结构，见架构与测试口径 |
| `containers` 协议 | `displayList` 容器变体，见 [Project XML DisplayList Tag 对齐](./project-xml-displaylist-variants.md) |
| reader / writer 实现细节 | 只描述协议本身，不描述内部消费路径 |

## 说明约定

| 列 | 含义 |
|---|---|
| 属性名 | 当前正式 canonical XML 属性名 |
| Alias | 当前协议允许读入的别名；空表示无别名 |
| 说明 | 仅描述节点语义范围，不描述内部模型 |

## `package.xml`

### `packageDescription`

| 属性名 | Alias | 说明 |
|---|---|---|
| `id` |  | 包根标识 |
| `hasFavorites` |  | 包内是否存在收藏资源 |
| `compressPNG` |  | 包级图片压缩开关 |
| `jpegQuality` |  | 包级 JPEG 质量 |

### `package_branch.xml > branchDescription`

| 属性名 | Alias | 说明 |
|---|---|---|
| 无属性 |  | 分支资源清单根节点 |

### `packageDescription > publish`

| 属性名 | Alias | 说明 |
|---|---|---|
| `name` |  | 包级发布名 |
| `path` |  | 包级发布路径 |
| `branchPath` |  | 分支发布路径 |
| `packageCount` |  | 发布分包数量 |

### 通用资源节点

适用于 `package.xml` 与 `package_branch.xml` 的 `resources` 下通用资源基础属性。

| 属性名 | Alias | 说明 |
|---|---|---|
| `id` |  | 资源标识 |
| `name` |  | 资源名 |
| `path` |  | 资源路径 |
| `exported` |  | 是否参与导出 |
| `favorite` |  | 是否加入资源收藏 |

### `resources > image`

| 属性名 | Alias | 说明 |
|---|---|---|
| `atlas` |  | 图片纹理集模式 |
| `scale` |  | 缩放模式 |
| `scale9grid` |  | 九宫格设置 |
| `width` |  | 资源宽度 |
| `height` |  | 资源高度 |
| `gridTile` |  | 平铺网格设置 |
| `qualityOption` |  | 图片质量选项 |
| `quality` |  | 自定义图片质量；`qualityOption="custom"` 时写回 |
| `duplicatePadding` |  | 是否复制边缘像素 |
| `smoothing` |  | 是否允许平滑 |

### `resources > movieclip`

| 属性名 | Alias | 说明 |
|---|---|---|
| `atlas` |  | 动画资源纹理集模式 |

### `resources > font`

| 属性名 | Alias | 说明 |
|---|---|---|
| `texture` |  | 字体贴图资源 |
| `renderMode` |  | 字体渲染模式 |
| `samplePointSize` |  | 字体采样点大小 |

### `resources > misc`

| 属性名 | Alias | 说明 |
|---|---|---|
| 无附加属性 |  | 仅使用通用资源属性；资源文件名由通用 `name` 承载 |

### `resources > spine`

| 属性名 | Alias | 说明 |
|---|---|---|
| `width` |  | skeleton 资源宽度 |
| `height` |  | skeleton 资源高度 |
| `require` |  | 依赖资源 id 列表，逗号分隔 |
| `atlasNames` |  | atlas 名列表，逗号分隔 |
| `anchor` |  | skeleton 锚点，格式为 `x,y` |

### `resources > dragonbones`

| 属性名 | Alias | 说明 |
|---|---|---|
| `width` |  | skeleton 资源宽度 |
| `height` |  | skeleton 资源高度 |
| `require` |  | 依赖资源 id 列表，逗号分隔 |
| `atlasNames` |  | atlas 名列表，逗号分隔 |
| `anchor` |  | skeleton 锚点，格式为 `x,y` |

## `component.xml`

当前工程写回口径：

| 项目 | 说明 |
|---|---|
| 显示对象 `xy` | `displayList` 中支持 `xy` 的对象节点当前显式写出位置；默认原点写为 `xy="0,0"` |

### 根节点 `<component>`

| 属性名 | Alias | 说明 |
|---|---|---|
| `size` |  | 根组件尺寸 |
| `pivot` |  | 根组件 pivot |
| `anchor` |  | 根组件 anchor |
| `margin` |  | 根组件 margin |
| `restrictSize` |  | 根组件尺寸限制 |
| `overflow` |  | 根组件 overflow 模式 |
| `clipSoftness` |  | 裁剪软边 |
| `opaque` |  | 是否不透明 |
| `mask` |  | 遮罩目标 |
| `reversedMask` |  | 反向遮罩 |
| `hitTest` |  | 命中测试资源 |
| `customData` |  | 自定义数据 |
| `scroll` |  | 滚动模式 |
| `scrollBar` |  | 滚动条显示方式 |
| `scrollBarFlags` |  | 滚动条相关标志 |
| `scrollBarMargin` |  | 滚动条 margin |
| `scrollBarRes` |  | 滚动条资源 |
| `ptrRes` |  | 下拉刷新资源 |
| `extention` |  | 根组件扩展类型 |
| `bgColor` |  | 背景颜色 |
| `bgColorEnabled` |  | 是否启用背景颜色 |
| `idnum` |  | 内部编号 |
| `initName` |  | 初始化名 |
| `remark` |  | 备注 |
| `designImageAlpha` |  | 设计图透明度 |
| `designImageLayer` |  | 设计图层 |
| `designImageOffsetX` |  | 设计图 X 偏移 |
| `designImageOffsetY` |  | 设计图 Y 偏移 |

### 根组件自定义属性 `<customProperty>`

`<customProperty>` 是 `<component>` 的直接子节点，可重复出现。

| 属性名 | Alias | 说明 |
|---|---|---|
| `target` |  | 组件内目标对象路径 |
| `propertyId` |  | 对外暴露的属性类型，`0` 表示文本、`1` 表示图标 |
| `label` |  | 编辑器显示标签 |

### 显示对象公共标识层

以下属性由编辑器公共 `FObject` 读写链路承载，适用于全部 display-list 对象。

| 属性名 | Alias | 说明 |
|---|---|---|
| `id` |  | 对象标识 |
| `name` |  | 对象名 |
| `relation` |  | 关系引用字段 |
| `pivot` |  | pivot |
| `anchor` |  | 是否以 pivot 作为坐标锚点 |

### `<component>` 子组件实例

| 属性名 | Alias | 说明 |
|---|---|---|
| `src` |  | 引用组件资源 |
| `controller` |  | 实例 controller override |
| `pageController` |  | 实例 page controller |
| `xy` |  | 位置 |
| `size` |  | 尺寸 |
| `locked` |  | 是否锁定 |
| `restrictSize` |  | 尺寸限制 |
| `aspect` |  | 宽高约束 |
| `pivot` |  | pivot |
| `anchor` |  | anchor |
| `scale` |  | 缩放 |
| `group` |  | 所属 group |
| `rotation` |  | 旋转 |
| `alpha` |  | 透明度 |
| `visible` |  | 是否可见 |
| `touchable` |  | 是否可触摸 |
| `grayed` |  | 是否置灰 |
| `tooltips` |  | tooltip 文本 |
| `customData` |  | 自定义数据 |
| `fileName` |  | 资源文件名 |
| `pkg` |  | 资源包标识 |
| `filter` |  | 滤镜类型 |
| `filterData` |  | 滤镜数据 |

### `<image>`

| 属性名 | Alias | 说明 |
|---|---|---|
| `src` |  | 图片资源 |
| `color` |  | 颜色 |
| `flip` |  | 翻转 |
| `fillMethod` |  | 填充方法 |
| `fillOrigin` |  | 填充起点 |
| `fillClockwise` |  | 顺时针填充 |
| `fillAmount` |  | 填充比例 |
| `xy` |  | 位置 |
| `size` |  | 尺寸 |
| `locked` |  | 是否锁定 |
| `aspect` |  | 宽高约束 |
| `pivot` |  | pivot |
| `anchor` |  | anchor |
| `scale` |  | 缩放 |
| `skew` |  | 倾斜，格式为 `x,y` |
| `group` |  | 所属 group |
| `rotation` |  | 旋转 |
| `alpha` |  | 透明度 |
| `visible` |  | 是否可见 |
| `touchable` |  | 是否可触摸 |
| `grayed` |  | 是否置灰 |
| `pkg` |  | 资源包标识 |
| `filter` |  | 滤镜类型 |
| `filterData` |  | 滤镜数据 |

### `<graph>`

| 属性名 | Alias | 说明 |
|---|---|---|
| `xy` |  | 位置 |
| `size` |  | 尺寸 |
| `locked` |  | 是否锁定 |
| `restrictSize` |  | 尺寸限制 |
| `pivot` |  | pivot |
| `anchor` |  | anchor |
| `group` |  | 所属 group |
| `rotation` |  | 旋转 |
| `alpha` |  | 透明度 |
| `visible` |  | 是否可见 |
| `touchable` |  | 是否可触摸 |
| `grayed` |  | 是否置灰 |
| `skew` |  | 倾斜 |
| `type` |  | 图形类型 |
| `lineSize` |  | 线宽 |
| `lineColor` |  | 线颜色 |
| `fillColor` |  | 填充颜色 |
| `corner` |  | 圆角 |
| `points` |  | 顶点坐标 |
| `sides` |  | 多边形边数 |
| `startAngle` |  | 起始角度 |
| `distances` |  | 顶点距离 |

### `<movieclip>` / `<jta>`

| 属性名 | Alias | 说明 |
|---|---|---|
| `src` |  | 动画资源 |
| `playing` |  | 是否播放 |
| `frame` |  | 帧号 |
| `color` |  | 颜色 |
| `xy` |  | 位置 |
| `size` |  | 尺寸 |
| `pivot` |  | pivot |
| `anchor` |  | 是否以 pivot 作为坐标锚点 |
| `group` |  | 所属 group |
| `rotation` |  | 旋转 |
| `alpha` |  | 透明度 |
| `visible` |  | 是否可见 |
| `touchable` |  | 是否可触摸 |
| `grayed` |  | 是否置灰 |
| `fileName` |  | 资源文件名 |
| `pkg` |  | 资源包标识 |
| `filter` |  | 滤镜类型 |
| `filterData` |  | 滤镜数据 |

### `<loader>`

| 属性名 | Alias | 说明 |
|---|---|---|
| `xy` |  | 位置 |
| `size` |  | 尺寸 |
| `pivot` |  | pivot |
| `anchor` |  | 是否以 pivot 作为坐标锚点 |
| `scale` |  | 缩放 |
| `group` |  | 所属 group |
| `rotation` |  | 旋转 |
| `alpha` |  | 透明度 |
| `visible` |  | 是否可见 |
| `touchable` |  | 是否可触摸 |
| `grayed` |  | 是否置灰 |
| `url` |  | 加载地址 |
| `align` |  | 水平对齐 |
| `vAlign` |  | 垂直对齐 |
| `fill` |  | 填充模式 |
| `shrinkOnly` |  | 仅缩小 |
| `autoSize` |  | 自动尺寸 |
| `useResize` |  | 使用 resize |
| `color` |  | 颜色 |
| `playing` |  | 是否播放 |
| `frame` |  | 帧号 |
| `fillMethod` |  | 填充方法 |
| `fillOrigin` |  | 填充起点 |
| `fillClockwise` |  | 顺时针填充 |
| `fillAmount` |  | 填充比例 |
| `clearOnPublish` |  | 发布时清理 |
| `filter` |  | 滤镜类型 |
| `filterData` |  | 滤镜数据 |

### `<loader3d>`

| 属性名 | Alias | 说明 |
|---|---|---|
| `xy` |  | 位置 |
| `size` |  | 尺寸 |
| `pivot` |  | pivot |
| `anchor` |  | 是否以 pivot 作为坐标锚点 |
| `rotation` |  | 旋转 |
| `alpha` |  | 透明度 |
| `visible` |  | 是否可见 |
| `touchable` |  | 是否可触摸 |
| `grayed` |  | 是否置灰 |
| `url` |  | 加载地址 |
| `align` |  | 水平对齐 |
| `vAlign` |  | 垂直对齐 |
| `fill` |  | 填充模式 |
| `shrinkOnly` |  | 仅缩小 |
| `autoSize` |  | 自动尺寸 |
| `animation` | `animationName` | 动画名 |
| `skin` | `skinName` | 皮肤名 |
| `playing` |  | 是否播放 |
| `frame` |  | 帧号 |
| `loop` |  | 是否循环 |
| `color` |  | 颜色 |
| `clearOnPublish` |  | 发布时清理 |

### `<text>`

| 属性名 | Alias | 说明 |
|---|---|---|
| `xy` |  | 位置 |
| `size` |  | 尺寸 |
| `restrictSize` |  | 尺寸限制 |
| `pivot` |  | pivot |
| `anchor` |  | 是否以 pivot 作为坐标锚点 |
| `customData` |  | 自定义数据 |
| `group` |  | 所属 group |
| `rotation` |  | 旋转 |
| `alpha` |  | 透明度 |
| `visible` |  | 是否可见 |
| `touchable` |  | 是否可触摸 |
| `grayed` |  | 是否置灰 |
| `font` |  | 字体 |
| `fontSize` |  | 字号 |
| `color` |  | 颜色 |
| `align` |  | 水平对齐 |
| `vAlign` |  | 垂直对齐 |
| `autoSize` |  | 自动尺寸 |
| `singleLine` |  | 单行模式 |
| `text` |  | 文本内容 |
| `input` |  | 是否输入文本 |
| `ubb` |  | 是否启用 UBB |
| `leading` |  | 行间距 |
| `letterSpacing` |  | 字间距 |
| `underline` |  | 下划线 |
| `italic` |  | 斜体 |
| `bold` |  | 粗体 |
| `strikethrough` |  | 删除线 |
| `strokeColor` |  | 描边颜色 |
| `strokeSize` |  | 描边宽度 |
| `shadowColor` |  | 阴影颜色 |
| `shadowOffset` |  | 阴影偏移 |
| `autoClearText` |  | 自动清空文本 |
| `demoText` |  | 示例文本 |
| `faceDilate` |  | 字面扩张 |
| `underlaySoftness` |  | 下层柔化 |
| `vars` |  | 模板变量开关 |
| `prompt` | `promptText` | 输入提示 |
| `maxLength` |  | 最大长度 |
| `restrict` |  | 输入限制 |
| `password` |  | 密码模式 |
| `keyboardType` |  | 键盘类型 |

### `<inputtext>`

| 属性名 | Alias | 说明 |
|---|---|---|
| `xy` |  | 位置 |
| `size` |  | 尺寸 |
| `restrictSize` |  | 尺寸限制 |
| `pivot` |  | pivot |
| `anchor` |  | 是否以 pivot 作为坐标锚点 |
| `customData` |  | 自定义数据 |
| `group` |  | 所属 group |
| `rotation` |  | 旋转 |
| `alpha` |  | 透明度 |
| `visible` |  | 是否可见 |
| `touchable` |  | 是否可触摸 |
| `grayed` |  | 是否置灰 |
| `font` |  | 字体 |
| `fontSize` |  | 字号 |
| `color` |  | 颜色 |
| `align` |  | 水平对齐 |
| `vAlign` |  | 垂直对齐 |
| `autoSize` |  | 自动尺寸 |
| `singleLine` |  | 单行模式 |
| `text` |  | 文本内容 |
| `input` |  | 是否输入文本 |
| `ubb` |  | 是否启用 UBB |
| `leading` |  | 行间距 |
| `letterSpacing` |  | 字间距 |
| `underline` |  | 下划线 |
| `italic` |  | 斜体 |
| `bold` |  | 粗体 |
| `strikethrough` |  | 删除线 |
| `strokeColor` |  | 描边颜色 |
| `strokeSize` |  | 描边宽度 |
| `shadowColor` |  | 阴影颜色 |
| `shadowOffset` |  | 阴影偏移 |
| `autoClearText` |  | 自动清空文本 |
| `demoText` |  | 示例文本 |
| `faceDilate` |  | 字面扩张 |
| `underlaySoftness` |  | 下层柔化 |
| `vars` |  | 模板变量开关 |
| `prompt` | `promptText` | 输入提示 |
| `maxLength` |  | 最大长度 |
| `restrict` |  | 输入限制 |
| `password` |  | 密码模式 |
| `keyboardType` |  | 键盘类型 |

### `<richtext>`

| 属性名 | Alias | 说明 |
|---|---|---|
| `xy` |  | 位置 |
| `size` |  | 尺寸 |
| `pivot` |  | pivot |
| `anchor` |  | 是否以 pivot 作为坐标锚点 |
| `customData` |  | 自定义数据 |
| `group` |  | 所属 group |
| `rotation` |  | 旋转 |
| `alpha` |  | 透明度 |
| `visible` |  | 是否可见 |
| `touchable` |  | 是否可触摸 |
| `grayed` |  | 是否置灰 |
| `font` |  | 字体 |
| `fontSize` |  | 字号 |
| `color` |  | 颜色 |
| `align` |  | 水平对齐 |
| `vAlign` |  | 垂直对齐 |
| `autoSize` |  | 自动尺寸 |
| `singleLine` |  | 单行模式 |
| `text` |  | 文本内容 |
| `ubb` |  | 是否启用 UBB |
| `leading` |  | 行间距 |
| `letterSpacing` |  | 字间距 |
| `underline` |  | 下划线 |
| `italic` |  | 斜体 |
| `bold` |  | 粗体 |
| `strikethrough` |  | 删除线 |
| `strokeColor` |  | 描边颜色 |
| `strokeSize` |  | 描边宽度 |
| `shadowColor` |  | 阴影颜色 |
| `shadowOffset` |  | 阴影偏移 |
| `autoClearText` |  | 自动清空文本 |
| `restrictSize` |  | 尺寸限制 |
| `underlaySoftness` |  | 下层柔化 |

### `<group>`

| 属性名 | Alias | 说明 |
|---|---|---|
| `xy` |  | 位置 |
| `size` |  | 尺寸 |
| `locked` |  | 是否锁定 |
| `pivot` |  | pivot |
| `anchor` |  | 是否以 pivot 作为坐标锚点 |
| `group` |  | 所属 group |
| `rotation` |  | 旋转 |
| `alpha` |  | 透明度 |
| `visible` |  | 是否可见 |
| `touchable` |  | 是否可触摸 |
| `grayed` |  | 是否置灰 |
| `layout` |  | 布局模式 |
| `lineGap` |  | 行间距 |
| `colGap` | `columnGap` | 列间距 |
| `advanced` |  | 是否高级分组 |
| `excludeInvisibles` |  | 是否排除不可见对象 |
| `autoSizeDisabled` |  | 是否关闭自动尺寸 |
| `mainGridIndex` |  | 主网格索引 |

### `<list>` / 树列表

| 属性名 | Alias | 说明 |
|---|---|---|
| `src` |  | 列表资源 |
| `layout` |  | 布局模式 |
| `align` |  | 水平对齐 |
| `vAlign` |  | 垂直对齐 |
| `lineGap` |  | 行间距 |
| `colGap` | `columnGap` | 列间距 |
| `lineItemCount` |  | `flow_hz` 每行项目数、`flow_vt` 每列项目数、`pagination` 每页列数 |
| `lineItemCount2` |  | `pagination` 每页行数 |
| `autoItemSize` | `autoResizeItem` | 自动调整项目尺寸 |
| `renderOrder` |  | 子项渲染顺序：`ascent`、`descent`、`arch` |
| `apex` |  | `renderOrder="arch"` 时的顶点子项索引 |
| `selectionMode` |  | 选择模式 |
| `selectionController` |  | 选择控制器 |
| `defaultItem` |  | 默认项目资源 |
| `pageController` |  | 页面控制器 |
| `controller` |  | controller override |
| `overflow` |  | overflow 模式 |
| `scroll` |  | 滚动模式 |
| `scrollBar` |  | 滚动条显示方式 |
| `scrollBarFlags` |  | 滚动条相关标志 |
| `scrollBarMargin` |  | 滚动条 margin |
| `scrollBarRes` |  | 滚动条资源 |
| `ptrRes` |  | 下拉刷新资源 |
| `margin` |  | margin |
| `clipSoftness` |  | 裁剪软边 |
| `treeView` |  | 是否树模式 |
| `indent` |  | 树缩进 |
| `clickToExpand` |  | 点击展开方式 |
| `autoClearItems` |  | 自动清空项目 |
| `scrollItemToViewOnClick` |  | 点击子项后是否自动滚动到可见区域 |
| `foldInvisibleItems` |  | 布局时是否折叠不可见子项 |
| `xy` |  | 位置 |
| `size` |  | 尺寸 |
| `pivot` |  | pivot |
| `anchor` |  | 是否以 pivot 作为坐标锚点 |
| `group` |  | 所属 group |
| `rotation` |  | 旋转 |
| `alpha` |  | 透明度 |
| `visible` |  | 是否可见 |
| `touchable` |  | 是否可触摸 |
| `grayed` |  | 是否置灰 |

## 扩展子节点协议

### `<Button>`

| 属性名 | Alias | 说明 |
|---|---|---|
| `mode` |  | 按钮模式 |
| `sound` |  | 点击音效 |
| `soundVolumeScale` | `volume` | 音量缩放 |
| `downEffect` |  | 按下效果 |
| `downEffectValue` |  | 按下效果值 |
| `title` |  | 标题 |
| `selectedTitle` |  | 选中标题 |
| `icon` |  | 图标 |
| `selectedIcon` |  | 选中图标 |
| `titleColor` |  | 标题颜色 |
| `titleFontSize` |  | 标题字号 |
| `controller` |  | 关联控制器 |
| `page` |  | 关联页面 |
| `checked` |  | 是否选中 |

### `<Label>`

| 属性名 | Alias | 说明 |
|---|---|---|
| `title` |  | 标题 |
| `icon` |  | 图标 |
| `titleColor` |  | 标题颜色 |
| `titleFontSize` |  | 标题字号 |
| `prompt` |  | 提示文本 |

### `<ComboBox>`

| 属性名 | Alias | 说明 |
|---|---|---|
| `dropdown` |  | 下拉组件资源 |
| `title` |  | 标题 |
| `icon` |  | 图标 |
| `visibleItemCount` |  | 可见条目数 |
| `selectionController` |  | 选择控制器 |

### `<ProgressBar>`

| 属性名 | Alias | 说明 |
|---|---|---|
| `titleType` |  | 标题类型 |
| `reverse` |  | 是否反向 |
| `value` |  | 当前值 |
| `max` |  | 最大值 |
| `min` |  | 最小值 |

### `<Slider>`

| 属性名 | Alias | 说明 |
|---|---|---|
| `titleType` |  | 标题类型 |
| `reverse` |  | 是否反向 |
| `wholeNumbers` |  | 是否整数步进 |
| `changeOnClick` |  | 点击时改变值 |
| `value` |  | 当前值 |
| `max` |  | 最大值 |
| `min` |  | 最小值 |

### `<ScrollBar>`

| 属性名 | Alias | 说明 |
|---|---|---|
| `fixedGripSize` |  | 固定 grip 大小 |

## 结构节点属性

### `<relation>`

| 属性名 | Alias | 说明 |
|---|---|---|
| `target` |  | 目标对象 |
| `sidePair` |  | 关系侧对 |

### `<gear*>`

| 属性名 | Alias | 说明 |
|---|---|---|
| `controller` |  | 控制器 |
| `pages` |  | 页面集合 |
| `values` |  | 值集合 |
| `default` |  | 默认值 |
| `tween` |  | 是否补间 |
| `positionsInPercent` |  | 是否按百分比位置 |
| `condition` |  | gear 条件 |
| `ease` |  | 缓动类型 |
| `duration` |  | 时长 |

### `<controller>`

| 属性名 | Alias | 说明 |
|---|---|---|
| `name` |  | 控制器名 |
| `pages` |  | 页面集合 |
| `selected` |  | 当前选中页 |

### `<action>`

| 属性名 | Alias | 说明 |
|---|---|---|
| `type` |  | 动作类型 |
| `fromPage` |  | 起始页 |
| `toPage` |  | 目标页 |
| `transition` |  | 转场名 |
| `repeat` |  | 重复次数 |
| `delay` |  | 延迟 |
| `stopOnExit` |  | 离开时停止 |
| `objectId` |  | 目标对象 |
| `controller` |  | 控制器名 |
| `targetPage` |  | 目标页名 |

### `<transition>`

| 属性名 | Alias | 说明 |
|---|---|---|
| `name` |  | 转场名 |
| `autoPlay` |  | 是否自动播放 |
| `autoPlayRepeat` | `autoPlayTimes` | 自动播放重复次数 |
| `autoPlayDelay` |  | 自动播放延迟 |
| `options` |  | 选项 |
| `fps` |  | 帧率 |

### `<transition><item>`

| 属性名 | Alias | 说明 |
|---|---|---|
| `time` |  | 时间点 |
| `target` |  | 目标对象 |
| `tween` |  | 是否补间 |
| `duration` |  | 时长 |
| `repeat` |  | 重复次数 |
| `yoyo` |  | 是否往返 |
| `label` |  | 标签 |
| `label2` |  | 第二标签 |
| `path` |  | XY 补间的运动轨迹路径 |
| `customEase` |  | `ease="Custom"` 时使用的自定义缓动曲线数据，与 `path` 运动轨迹相互独立 |
| `ease` |  | 缓动类型；`Custom` 表示使用 `customEase` |
| `type` |  | 项目类型 |
| `value` |  | 值 |
| `startValue` |  | 起始值 |
| `endValue` |  | 结束值 |

### `<list><item>`

| 属性名 | Alias | 说明 |
|---|---|---|
| `title` |  | 标题 |
| `icon` |  | 图标 |
| `url` |  | 链接资源 |
| `name` |  | 名称 |
| `selectedTitle` |  | 选中标题 |
| `selectedIcon` |  | 选中图标 |
| `level` |  | 层级 |
| `isFolder` |  | 是否文件夹 |
| `controllers` |  | controller 覆盖 |

### `<ComboBox><item>`

| 属性名 | Alias | 说明 |
|---|---|---|
| `title` |  | 标题 |
| `value` |  | 值 |
| `icon` |  | 图标 |

## 维护要求

| 项目 | 要求 |
|---|---|
| 新增 XML 属性 | 必须同步更新本文档 |
| 新增 alias | 必须同时更新 canonical/alias 对照 |
| 调整 tag 命名或 `displayList` 变体 | 同步更新 [Project XML DisplayList Tag 对齐](./project-xml-displaylist-variants.md) |
| 协议文档边界 | 只描述 XML 协议本身，不描述项目内部承载方式或实现对齐关系 |
