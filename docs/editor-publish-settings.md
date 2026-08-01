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

### SVG 图像发布

当 `package.xml` 的 `image` 资源指向 `.svg`，并声明了正的 `width` 和 `height` 时，发布会先按这两个声明尺寸栅格化，再执行可选裁边和图集合成。发布物只包含 PNG 图集；sprite 的原始尺寸保持为工程声明值。

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
- 工程 `package.xml` 中的 `publish` 节点当前正式支持 `name`、`path`、`branchPath`、`packageCount`、`genCode`、`codePath`，以及包级图集子节点 `<atlas name="Default" index="0"/>`。
- 工程 `package.xml` 的 `packageDescription` 根节点当前正式支持 `compressPNG`、`jpegQuality` 与派生的 `hasFavorites`；未设置的图片压缩选项保持省略，`hasFavorites` 仅在包内存在收藏资源或资源文件夹时写为 `true`。

## 工程资源树元数据

`package.xml` 与 `package_branch.xml` 的 component/asset 资源节点使用 `exported="true"` 与 `favorite="true"` 记录导出和收藏状态；未导出、未收藏时省略对应属性。UAM 通过 `resource.exported`、`resource.favorite` 承载这些字段，公开事务分别使用幂等的 `setResourceExported`、`setResourceFavorite` 设置目标布尔值。

资源文件夹由 `package.folders` 正式承载 `branch / path / favorite / atlas`。文件夹路径使用以 `/` 开头和结尾的规范形式，根目录是隐式节点；实际 `assets[/_<branch>]/<包名>/` 目录是存在性的事实来源，`<folder>` 节点只写入需要持久化的收藏或图集元数据。`setResourceFolderFavorite` 可更新既有主分支或资源分支文件夹的收藏状态，且单个操作只修改 selector 指定的文件夹；需要匹配编辑器的后代收藏行为时，调用方应在同一事务中显式提交后代文件夹与资源收藏操作。公开事务 `addResourceFolder`、`renameResourceFolder`、`moveResourceFolder`、`removeResourceFolder` 只操作空文件夹；父目录必须存在，根目录、路径冲突和非空操作会在提交前拒绝。浏览器存储适配器须提供非递归 `rmdir`，保存成功后才清理被移除的空目录。

主 `package.xml` 的 `packageDescription@hasFavorites` 由包内资源与资源文件夹的收藏状态派生，不作为独立可编辑状态。收藏状态只影响编辑器工程数据，不进入运行时二进制发布协议。

## 工程图片资源属性

`package.xml` 与 `package_branch.xml` 的 `image` 资源属性由 UAM `resource.image` 完整快照承载，包括纹理集模式、质量选项与自定义质量、平滑、边缘复制、缩放模式、九宫格和 tile-grid 位掩码。公开事务 `setImageResourceProps` 只替换这份正式属性快照，不修改图片 source bytes；非图片 selector、不完整快照、非法缩放模式、九宫格或位掩码会在写回前被拒绝。

图片 source bytes 通过 `replaceResourceBytes` 更新时，当前只支持 PNG 与常见 8-bit Huffman JPEG。preflight 会检查 PNG 的 chunk CRC、zlib/scanline 边界和容器顺序；JPEG 除检查 quantization/Huffman table、frame/scan 顺序及编码约束外，还会完成像素解码。两者都会核对实际格式与操作时、最终文件扩展名；畸形或不匹配返回 `invalid_resource_bytes`，SVG、WebP、GIF、PSD、TGA 等未支持格式返回 `unsupported_resource_mutation`。浏览器 backend 通过 `applyUamTransactionAsync` 在包内 Web Worker 中执行相同的严格校验，browser 环境误用同步入口会直接拒绝而不会在主线程扫描或解码。消费端 bundler 必须把公开入口 `@openfairygui/core/image-validation-worker` 再打成与主 bundle 相邻的 self-contained ESM `image-validation-worker.js`；仅重打主入口或只复制 worker 文件不会带上其解码 chunk。Worker 无响应会在 10 秒后终止。浏览器 source 上限为 8 MiB，decoded raster 上限为 8,388,608 pixels；Node/CLI 同步校验的 source/PNG decoded bytes 上限为 128 MiB，JPEG 严格解码另限 8,388,608 pixels 与 64 MiB。

有效替换会从 bytes 派生新的 raster 宽高，并在同一内存 transaction 中原子投影到 UAM 与 Document。后续 Save 仍沿用现有多文件写回，不承诺文件系统级 `atomicSave`。`ProjectReader` 在请求 `hydrateResourceBytes` 时以可解析且字段合法的 PNG IHDR / JPEG SOF header 覆盖陈旧 XML 尺寸，不在批量水合时扫描完整容器或重复执行像素解码；SVG 继续使用工程声明尺寸。

## 工程 MovieClip 资源属性与 JTA 事务

`package.xml` 与 `package_branch.xml` 的 `movieclip` 资源使用 `atlas` 记录纹理集模式，并使用 `smoothing` 记录平滑设置。缺少 `smoothing` 时按 `true` 读取；写回时仅为非默认值输出 `smoothing="false"`。MovieClip 资源使用正式的 `UamMovieClipResource.movieClip` 快照承载 `interval`、`repeatDelay`、`swing`、`smoothing` 和逐帧矩形/附加延迟/sprite id，不读取旧式 `metadata` 属性袋。

`ProjectReader` 水合 JTA v100-v102 时，以 source bytes 派生尺寸、播放 timing 与帧列表；`fps === 0` 按 24 归一，负值无效，毫秒字段使用整数截断。无法解析派生模型时仍保留原始 source bytes 和 XML 属性。JTA 不携带的 `smoothing` 继续以 XML/UAM 为事实来源。

`addResource`、包含 MovieClip 的 `addPackage` 与 `replaceResourceBytes` 会先完成有边界的 JTA 解析，再在同一个原子 transaction 中替换 bytes 和重建模型。解析失败统一返回 `invalid_movie_clip_jta`；UAM project、backend revision/dirty 与 storage 均保持不变。MovieClip 不经过图片 raster worker，所以 Browser 与 Node 使用相同的 Core parser 和派生规则。Save/reload 与 inverse/save/reload 都从持久化的 JTA source 重建同一模型。

## 当前发布输出路径解析

发布时显式传入的输出目录优先于设置文件。未传入时，当前选择顺序如下：

1. 活跃分支发布的包级 `branchPath`，再到全局 `branchPath`。
2. 包级 `path`。
3. 全局 `path`。

选中的相对路径以工程根目录为基准；若以上都未配置，发布不会隐式选择输出目录。

## 当前发布完整性要求

这些要求是 OpenFairyGUI 当前发布执行时的能力边界，不是新增的编辑器设置字段：

| 条件 | 当前行为 |
|---|---|
| 已解析到发布输出目录 | 必须提供输出文件系统；缺失时不会把流程当作发布成功 |
| 有需要封包的图像或动画帧 | 必须提供 raster encoder、源资源路径和 atlas 输出目录 |
| 图集装箱、图像读取或合成失败 | 中止发布，不生成带透明空洞或缺页的成功结果 |
| 发布集合包含 MovieClip | 按 JTA 长度表读取 PNG / JPEG（可混合）纹理；重复 texture index 复用首次引用帧的 sprite，`-1` 表示空帧。所有选中包会先完成 JTA 解析、严格 PNG/JPEG 校验、引用纹理完整解码与规范化缓存；越界索引、被引用的空纹理、未支持格式、截断数据或解码失败会在创建任何 OpenFairyGUI 内置输出目录或写入内置发布文件前中止整次发布 |
| `SoundResource`、`MiscResource`、`SpineResource`、`DragonBonesResource` 及其依赖复制失败 | 中止发布，不把缺失的 runtime 资源降级为 warning |

未请求任何输出目录时，低层 `publish()` 可以只计算 layout；这不是文件发布，也不会写出二进制或资源文件。标准 Node 工作流应使用 `publishNode()`。

这里的零输出保证只覆盖 OpenFairyGUI 内置的 sound、external resource、atlas、package binary 与 codegen 输出。Node `onPublishStart` 插件在内置 preflight 之前运行，并可通过宿主提供的文件系统执行自己的副作用；这些插件写入不会被 staging 或自动回滚。需要零副作用的插件应把写入延后到 `onPublishEnd`，或自行实现临时目录与提交策略。

## 代码生成的当前实现范围

OpenFairyGUI 当前已经把“代码生成”接入现有 `publish` 流程，但实现范围仍是**正式收口的一条首发口径**，不是编辑器全部模板矩阵。

| 条件 | 当前行为 |
|---|---|
| 全局 `codeGeneration.allowGenCode=false` | 不生成代码 |
| 包级 `publish@genCode=false` 或未开启 | 该包不生成代码 |
| 包级 `publish@codePath` 有值 | 优先使用包级代码输出路径 |
| 包级 `publish@codePath` 为空 | 回退到全局 `codeGeneration.codePath` |
| Unity 项目，且 `codeType` 为空字符串 | 生成 Unity 风格 `.cs` 代码 |
| Laya / Cocos Creator 项目 | 生成共享的 `fgui` TypeScript 代码 |
| 其他项目类型 | 当前未实现，跳过生成 |

当前正式落地的代码生成口径如下：

| Lane | 输出项 | 当前行为 |
|---|---|---|
| Unity + 空 `codeType` | 输出目录 | `codePath/<规范化包名>/` |
| Unity + 空 `codeType` | 组件类 | 每个导出组件生成一个 `.cs` 类文件 |
| Unity + 空 `codeType` | Binder | 每个包生成一个 `包名Binder.cs` |
| Unity + 空 `codeType` | 清理规则 | 只清理当前包输出目录下、带 FairyGUI 自动生成标记的旧 `.cs` 文件 |
| 共享 `fgui` TypeScript 模式（Layabox / Cocos Creator） | 输出目录 | `codePath/<规范化包名>/` |
| 共享 `fgui` TypeScript 模式（Layabox / Cocos Creator） | 组件类 | 每个导出组件生成一个 `.ts` 类文件 |
| 共享 `fgui` TypeScript 模式（Layabox / Cocos Creator） | Binder | 每个包生成一个 `包名Binder.ts` |
| 共享 `fgui` TypeScript 模式（Layabox / Cocos Creator） | 运行时口径 | 使用 `fgui` 与 `UIObjectFactory.setExtension(...)` |
| 共享 `fgui` TypeScript 模式（Layabox / Cocos Creator） | 清理规则 | 只清理当前包输出目录下、带 FairyGUI 自动生成标记的旧 `.ts` 文件 |

说明：
- 这里描述的是 OpenFairyGUI 当前已实现行为，不等同于 FairyGUI 编辑器所有项目类型 / `codeType` 模板都已支持。
- 这里的 `fgui` TypeScript 代码生成口径已经不再依赖 `codeType` 字段分流；当前由 Layabox 与 Cocos Creator 共用同一条 TS lane。
- `publish` 流程也支持 OpenFairyGUI publish 插件接管代码生成。插件目录、生命周期、失败降级，以及与 FairyGUI 编辑器插件的关系见 [Publish 插件](./publish-plugins.md)。

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

## `fileExtension` 的当前实现规则

`fileExtension` 在 OpenFairyGUI 当前实现中不是完整复刻编辑器全部项目类型矩阵，而是基于已落地的发布逻辑生效。当前正式行为如下：

| 场景 | 结果 |
|---|---|
| Unity 项目 | 固定为 `bytes` |
| Cocos Creator 项目，且 `Publish.json` 显式设置了 `fileExtension` | 使用设置值 |
| Cocos Creator 项目，且 `Publish.json` 未显式设置 `fileExtension` | 默认使用 `bin` |
| 其他非 Unity 项目，且 `Publish.json` 显式设置了 `fileExtension` | 使用设置值 |
| 其他非 Unity 项目，且 `Publish.json` 未显式设置 `fileExtension` | 回退为 `fui` |

当前仓库已正式覆盖的非 Unity 二进制发布口径包括：
- Layabox：样例工程使用 `binaryFormat=true` 和 `fileExtension="fui"`，发布结果为 `包名.fui`
- Cocos Creator：未显式设置 `fileExtension` 时默认发布为 `包名.bin`

编辑器文档中其他项目类型的默认扩展名矩阵，目前**不应**直接视为 OpenFairyGUI 已实现行为；若仓库尚未实现对应项目类型发布规则，应从当前实现文档中删除，或明确标注为“未实现”。

## `fileExtension` 的编辑器参考矩阵

下面这张表保留的是 FairyGUI 编辑器侧的项目类型规则，用作后续实现对齐时的参考索引；**它不代表当前 OpenFairyGUI 已全部实现这些项目类型的发布行为**。

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

`includeHighResolution` 可以理解为 `2x`、`3x`、`4x` 资源开关对应的位掩码字段：`@2x=1`、`@3x=2`、`@4x=4`。

发布流程只发现并链接工程中已经存在的同路径、同分支、同类型 `@2x` / `@3x` / `@4x` 资源，例如 `icon.png` 对应 `icon@2x.png`。它们会作为独立 `image` / `movieclip` package item 写入，再由基础 item 的 high-resolution 列表引用；发布期不会主动把原始位图缩放或放大生成高分辨率资源。

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

## 工程写回联动边界

发布设置不改变 `component.xml` 的 authoring 属性语义。工程读写会独立保留组件根属性、根组件
`customProperty` 定义，以及组件引用的 `Button`、`Label`、`ComboBox`、`ProgressBar`、`Slider`、
`ScrollBar` 实例扩展覆盖；对应 XML 协议见 [Project XML 属性协议](./project-xml-attribute-reference.md)。

列表与树节点的布局、渲染顺序、滚动区域、静态条目和树行为属性也按该 XML 协议独立读写；
其中 `renderOrder="arch"` 使用 `apex` 记录顶点子项，树节点通过 `treeView`、`indent` 和
`clickToExpand` 保留树行为。

## 文档边界

| 项目 | 约束 |
|---|---|
| 本文关注点 | 只记录编辑器真实属性、默认值和序列化规则 |
| 不写内容 | 不引入项目内部类型、字段映射或实现细节 |
| 文档边界 | 本页只描述编辑器设置协议本身，不描述具体项目如何消费这些属性 |
