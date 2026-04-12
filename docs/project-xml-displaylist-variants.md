# Project XML DisplayList Tag 对齐

## 结论

`component.xml` 的 `displayList` 当前需要同时区分三套命名：

| 层 | 含义 |
|---|---|
| 原始 XML tag | `component.xml <displayList>` 中实际出现的标签名 |
| `displayList` variant | 工程协议中用于容器校验的有序多态变体名 |
| editor `DisplayListItem.type` | FairyGUI 编辑器运行时在加载后使用的显示列表项类型名 |

本文档用于固定这三套命名的当前正式口径，避免后续 `displayList` 容器协议、工程读写逻辑和编辑器侧 `DisplayListItem.type` 继续漂移。

## 命名对齐规则

| 规则 | 说明 |
|---|---|
| 原始 XML tag 只描述文件中出现的标签名 | 例如 `loader3d`、`list` |
| `displayList` variant 只描述容器中的对象变体名 | 例如 `loader3D`、`tree`、`inputtext` |
| editor `DisplayListItem.type` 采用编辑器加载后的归一结果 | 例如 `inputtext`、`tree` |
| 读写时允许“原始 tag”和“variant”不同名 | 当前明确存在 `loader3d -> loader3D`、`list -> tree`、`text -> inputtext` |

## 对齐映射表

| 对象语义 | 原始 XML tag | `displayList` variant | editor `DisplayListItem.type` | 当前写回口径 |
|---|---|---|---|---|
| 图片 | `image` | `image` | `image` | `image` |
| 普通文本 | `text` | `text` | `text` | `text` |
| 输入文本 | `text` 且 `input="true"`，或显式 `inputtext` | `inputtext` | `inputtext` | `inputtext` |
| 富文本 | `richtext` | `richtext` | `richtext` | `richtext` |
| 图形 | `graph` | `graph` | `graph` | `graph` |
| 分组 | `group` | `group` | `group` | `group` |
| Loader | `loader` | `loader` | `loader` | `loader` |
| Loader3D | `loader3d` | `loader3D` | 当前仓库按 `loader3D` 对齐 | `loader3d` |
| MovieClip | `movieclip` | `movieclip` | `movieclip` | `movieclip` |
| JTA 动画 | `jta` | `jta` | `jta` | 当前统一写回 `movieclip` |
| 子组件实例 | `component` | `component` | 资源引用对象通常不单独写 `type`，其显示列表项由引用资源决定 | `component` |
| 列表 | `list` | `list` | `list` | `list` |
| 树 | `list` 且 `treeView="true"`，或显式 `tree` | `tree` | `tree` | `list` 且 `treeView="true"` |

## 条件化变体

下列 variant 不是单看原始 tag 就能确定，而是依赖额外条件：

| 原始 XML 载体 | 条件 | `displayList` variant | editor 侧依据 |
|---|---|---|---|
| `text` | `input="true"` | `inputtext` | `UIPackage.loadComponentChildren(...)` |
| `list` | `treeView="true"` | `tree` | `UIPackage.loadComponentChildren(...)` |
| `loader3d` | 无额外条件，但 variant 采用 CamelCase | `loader3D` | 当前工程协议容器口径 |

## 当前写回规则

| 场景 | 写回结果 |
|---|---|
| `GTextField` | `text` |
| `GTextInput` | `inputtext` |
| `GRichTextField` | `richtext` |
| `GTree` | `list`，同时写 `treeView="true"` |
| `GLoader3D` | `loader3d` |
| `GMovieClip` | `movieclip` |
| 兼容读入的 `jta` | 当前统一写回 `movieclip` |
| `GComponent / GButton / GLabel / GComboBox / GProgressBar / GSlider / GScrollBar` | `component` |

## 维护要求

| 项目 | 要求 |
|---|---|
| 新增 `displayList` 对象类型 | 必须同时更新原始 XML tag、`displayList` variant、editor 对齐口径和本表 |
| 调整 `displayList` 容器 variant 集合 | 必须同步检查工程读入、工程写回和编辑器 `DisplayListItem.type` 是否仍一致 |
| 修改 `text/tree/loader3d/jta` 等归一规则 | 必须同步更新本表，不允许只改代码常量 |
| 文档边界 | 本文档只描述 `displayList` 命名与变体协议，不描述内部 reader / writer 实现细节 |
