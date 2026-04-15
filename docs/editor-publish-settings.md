# 编辑器发布设置

本文只记录 FairyGUI 编辑器侧真实存在的发布属性与设置文件结构，作为发布相关功能开发时的依据。本文只按编辑器真实属性组织内容。

## 设置文件与层级

编辑器发布设置至少分为两层：

| 层级 | 编辑器对象 | 作用 |
|---|---|---|
| 全局发布设置 | `GlobalPublishSettings` | 记录项目级默认发布参数，序列化到 `settings/Publish.json` |
| 包级发布设置 | `PublishSettings` | 记录单个包的发布参数、图集列表和排除列表 |

## `settings/Publish.json` 真实属性

### 顶层属性

以下是 `GlobalPublishSettings` 中可见的真实发布属性：

| 属性 | 含义 |
|---|---|
| `path` | 发布输出目录 |
| `branchPath` | 分支发布路径 |
| `fileExtension` | 发布文件扩展名 |
| `packageCount` | 默认包数量 |
| `compressDesc` | 是否压缩描述数据 |
| `binaryFormat` | 是否使用二进制发布格式 |
| `jpegQuality` | JPEG 质量 |
| `compressPNG` | 是否压缩 PNG |
| `allowGenCode` | 是否允许生成代码 |
| `codePath` | 代码输出路径 |
| `classNamePrefix` | 类名前缀 |
| `memberNamePrefix` | 成员名前缀 |
| `packageName` | 代码生成使用的包名 |
| `ignoreNoname` | 是否忽略无名对象 |
| `getMemberByName` | 是否按名称获取成员 |
| `codeType` | 代码生成类型 |
| `includeHighResolution` | 高分辨率资源包含位掩码 |
| `branchProcessing` | 分支处理模式 |
| `atlasMaxSize` | 图集最大尺寸 |
| `atlasPaging` | 是否分页 |
| `atlasSizeOption` | 图集尺寸策略 |
| `atlasForceSquare` | 是否强制正方形 |
| `atlasAllowRotation` | 是否允许旋转 |
| `atlasTrimImage` | 是否裁边 |

### `codeGeneration`

`Publish.json` 中的代码生成子对象包含以下真实属性：

| 属性 | 含义 |
|---|---|
| `allowGenCode` | 是否允许生成代码 |
| `codePath` | 代码输出路径 |
| `classNamePrefix` | 类名前缀 |
| `memberNamePrefix` | 成员名前缀 |
| `packageName` | 目标包名 / 命名空间 |
| `ignoreNoname` | 是否忽略无名对象 |
| `getMemberByName` | 是否生成按名称获取成员逻辑 |
| `codeType` | 代码类型 |

### `atlasSetting`

`Publish.json` 中的图集子对象包含以下真实属性：

| 属性 | 含义 |
|---|---|
| `maxSize` | 图集最大尺寸 |
| `paging` | 是否允许多页图集 |
| `sizeOption` | 图集尺寸策略 |
| `forceSquare` | 是否强制方图 |
| `allowRotation` | 是否允许旋转 |
| `trimImage` | 是否裁边 |

说明：
- 编辑器 `GlobalPublishSettings` 里还存在 `atlasMaxSize`、`atlasPaging`、`atlasSizeOption`、`atlasForceSquare`、`atlasAllowRotation`、`atlasTrimImage` 这些运行时字段，它们对应 `Publish.json` 里的 `atlasSetting` 子对象。
- `extractAlpha` 不属于全局 `Publish.json` 的真实属性；它在包级图集设置里出现。

## 包级发布设置真实属性

`PublishSettings` 代表单个包的发布设置，真实属性如下：

| 属性 | 含义 |
|---|---|
| `path` | 包级发布路径 |
| `fileName` | 发布文件名 |
| `branchPath` | 包级分支路径 |
| `packageCount` | 包级输出数量 |
| `genCode` | 是否为该包生成代码 |
| `codePath` | 该包代码输出路径 |
| `useGlobalAtlasSettings` | 是否使用全局图集设置 |
| `atlasList` | 包级图集设置列表 |
| `excludedList` | 发布排除列表 |

说明：
- `PublishSettings` 不是 `settings/Publish.json` 的顶层结构，而是单个包发布配置对象。
- 包级设置里可以单独定义图集列表，也可以指定使用全局图集设置。
- 工程 `package.xml` 中的 `publish` 节点可写出包级图集子节点，例如 `<atlas name="Default" index="0"/>`，用于描述该包的发布图集列表。
- 工程 `package.xml` 的 `packageDescription` 根节点当前正式支持 `compressPNG` 与 `jpegQuality`，用于承载包级图片压缩选项；未设置时保持省略，不强制写默认值。

## 包级图集设置真实属性

`AtlasSettings` 是单个图集项的真实属性对象：

| 属性 | 含义 |
|---|---|
| `name` | 图集名称 |
| `compression` | 是否压缩 |
| `extractAlpha` | 是否提取 alpha |
| `packSettings` | 打包参数对象 |

其中 `packSettings` 由 `PackSettings` 承载，编辑器通过它控制更细的打包行为。

## 默认值

以下默认值来自编辑器 `GlobalPublishSettings.read()` 的真实行为：

| 属性 | 默认值 / 规则 |
|---|---|
| `path` | 空字符串 |
| `branchPath` | 空字符串 |
| `packageCount` | `2` |
| `compressDesc` | `true` |
| `binaryFormat` | `true` |
| `includeHighResolution` | `0` |
| `branchProcessing` | `0` |
| `classNamePrefix` | `UI_` |
| `memberNamePrefix` | `m_` |
| `ignoreNoname` | `false` |
| `codeType` | 空字符串 |
| `allowGenCode` | `true` |
| `atlasSetting.maxSize` | `2048` |
| `atlasSetting.paging` | `true` |
| `atlasSetting.sizeOption` | `pot` |
| `atlasSetting.forceSquare` | `false` |
| `atlasSetting.allowRotation` | `false` |
| `atlasSetting.trimImage` | 项目版本号 `>= 500` 时默认 `true`，否则使用旧默认逻辑 |
| `jpegQuality` | `80` |

## `fileExtension` 的编辑器真实规则

`fileExtension` 不是单纯的固定字段，它会受项目类型影响。当前编辑器规则如下：

| 项目类型 | 结果 |
|---|---|
| Unity | 固定为 `bytes` |
| Cocos2dx / Vision | `binaryFormat=true` 时为 `fui`，否则为 `bytes` |
| Cry / Monogame / Corona | 固定为 `fui` |
| CocosCreator | 未显式设置时默认 `bin` |
| H5 项目 | 未显式设置时默认 `fui` |
| 其他项目 | 未显式设置时默认 `zip` |

## 高分辨率与分支相关属性

| 属性 | 含义 |
|---|---|
| `includeHighResolution` | 位掩码字段，用于表示是否包含 `2x` / `3x` / `4x` 资源 |
| `branchProcessing` | 分支处理模式 |
| `branchPath` | 分支输出路径 |
| `seperatedAtlasForBranch` | 分支 atlas 是否单独输出 |

`includeHighResolution` 可以理解为 `2x`、`3x`、`4x` 资源开关对应的位掩码字段。

`branchProcessing` 当前可见语义如下：

| 值 | 编辑器行为 |
|---|---|
| `0` | `主干包含所有分支`，发布结果保留主干与全部分支内容，输出路径使用 `path` |
| `1` | `主干合并活跃分支`，发布结果只保留主干与当前活跃分支合并后的内容；主干输出到 `path`，非主干分支输出到 `branchPath/<branch>`（若 `branchPath` 有值） |

`seperatedAtlasForBranch` 当前可见语义如下：

| 条件 | 编辑器行为 |
|---|---|
| `branchProcessing=0` 且 `seperatedAtlasForBranch=false` | 主干与分支资源可以进入同一组 atlas 页 |
| `branchProcessing=0` 且 `seperatedAtlasForBranch=true` | 主干 atlas 与分支 atlas 分开输出；分支 atlas 文件名带 `_branchName` 后缀，例如 `atlas0_dev.png` |
| `branchProcessing=1` | 发布结果已完成分支合并，`seperatedAtlasForBranch` 不再单独生效 |

## 编辑器写回行为

编辑器在写回 `Publish.json` 时，当前规则包括：

| 项目 | 写回规则 |
|---|---|
| `branchPath` | 仅在有值时写出 |
| `fileExtension` | 仅项目支持自定义扩展名时写出 |
| `includeHighResolution` | 仅大于 `0` 时写出 |
| `branchProcessing` | 仅大于 `0` 时写出 |
| `atlasSetting.maxSize` | 非 `2048` 时写出 |
| `atlasSetting.paging` | 为 `true` 时写出 |
| `atlasSetting.forceSquare` | 为 `true` 时写出 |
| `atlasSetting.allowRotation` | 为 `true` 时写出 |
| `atlasSetting.trimImage` | 为 `true` 时写出 |
| `compressPNG` / `jpegQuality` | 仅项目不支持 atlas 时写出 |

## 文档边界

| 项目 | 约束 |
|---|---|
| 本文关注点 | 只记录编辑器真实属性、默认值和序列化规则 |
| 不写内容 | 不引入项目内部类型、字段映射或实现细节 |
| 文档边界 | 本页只描述编辑器设置协议本身，不描述具体项目如何消费这些属性 |
