# 可运行示例与消费者验证

七个 Node 示例和一个浏览器存储示例只使用安装后的公开包，不依赖仓库源码别名或测试工具包。把仓库的 `examples/` 目录复制到仓库外，在复制后的目录执行：

```bash
npm install
node node-inspect-validate/index.mjs
node revision-checked-edit-save/index.mjs
node publish-restore/index.mjs
node mcp-stdio-client/index.mjs
node reward-panel-states/index.mjs
node reward-panel-layout/index.mjs
node reward-card-generation/index.mjs
```

不传参数时会创建独立的临时工程，并在 JSON 输出中给出 `projectPath`；文件保留供检查。前两个示例也可传入 `.fairy` 路径。第二个示例会修改传入的工程，且要求 `Main/MainView/title` 结构，请只对工程副本执行。第三、第五至第七个命令只创建自己的示例，不接受用户目录覆盖；验证当前分支未发布的代码请用下方 `pack:check`，不能把 registry 版本当作当前源码。

## 三状态奖励面板

这是[首个编辑任务](./getting-started.md#完成首个编辑任务)的完整 SDK 实现，稳定版 `0.6.1` 即可运行。创建两包临时工程后，从 outline 获取 `Main/RewardPanel`、`claimButton` 和 `claimedMark` 的唯一 ID，用一个事务新增 `rewardState` 控制器和 `text` / `look` / `display` 三个 gear，控制未达成、可领取、已领取三种状态。现有布局、其他组件和 Shared 包图片均保留。

让 Agent 自己完成任务时，只创建待编辑工程：

```bash
node reward-panel-states/index.mjs --create
```

运行 `node reward-panel-states/index.mjs`（或 `npm run reward`）则会新建另一份独立工程并完成 SDK 编辑、验证、保存和 UAM 回读。两种命令均输出实际 `projectPath`；无参数命令不会继续编辑上一次 `--create` 的工程。

<<< ../../examples/reward-panel-states/index.mjs#example {js}

导入 `editRewardPanel(projectPath, runtime?)` 可由宿主驱动同一流程。提交后的验证、保存或回读失败保留会话并抛出 `recovery: { runtime, sessionId, projectPath }`，`cause` 保留失败报告；按下方单字段编辑示例的恢复规则处理。再次执行同一任务会因已有控制器而拒绝，宿主应先查询并重新规划。

消费者检查在 SDK 与真实 MCP stdio 上分别执行这段编辑函数：预演不写盘，保存后独立对比完整 UAM，仅允许新增指定控制器和三组 gear；完整文件清单不变，仅 `assets/Main/RewardPanel.xml` 字节改变，其他文件（包括 PNG）不变；重新打开可查询控制器，重复任务被拒绝且不改文件。这些检查不包含 FairyGUI 渲染或实际点击，视觉验收按[三状态表与流程](./getting-started.md#完成首个编辑任务)在编辑器或运行时执行。

## 奖励面板布局与入场动画

进阶任务 B 复用 A 已保存的三状态面板，调整留白、尺寸与位置，并新增一次性入场动画。稳定版 `0.6.1` 即可运行；控制器、gear、文案及图片字节保持不变。

让 Agent 完成 B 时，先创建一份已经完成 A、尚未改版的工程：

```bash
node reward-panel-layout/index.mjs --create
```

按[接入指南](./getting-started.md#完成首个编辑任务)将输出 `projectPath` 的父目录加入 MCP 授权范围并重启连接，再交给 Agent：

> 将 `<projectPath>` 中 `Main/RewardPanel` 改为 420 × 320，按下表调整五个子节点的布局。新增 `intro` 动画：30 fps，第 0 帧同时开始两个 12 帧的 QuadOut tween，让面板自身透明度从 0 到 1、位置偏移从 (0, 24) 到 (0, 0)，入场自动播放一次，无延迟。保留三页 `rewardState`、全部 gear、文案、其他组件和资源字节。查询精确 ID 与当前 revision 后，以同一批七个操作预演、提交、验证、保存并重新打开核对。目标不唯一、缺少 A 的控制器、已有 `intro`、revision 冲突或验证不完整时停止并报告，保留已提交但未保存的工作。

| 节点 | 原位置 → 新位置 | 原尺寸 → 新尺寸 |
|---|---|---|
| `background` | (0, 0) → (0, 0) | 360 × 280 → 420 × 320 |
| `title` | (24, 24) → (32, 28) | 312 × 32 → 356 × 36 |
| `rewardIcon` | (152, 80) → (178, 104) | 56 × 56 → 64 × 64 |
| `claimButton` | (80, 160) → (110, 204) | 200 × 48，保持不变 |
| `claimedMark` | (24, 228) → (32, 272) | 312 × 28 → 356 × 28 |

七个操作为一个 `setComponentProps`、五个 `setDisplayNodeProps` 和一个 `addTransition`。UAM 动画时间与 duration 使用帧；12 / 30 = 0.4 秒。两个 item 的 `targetNodeId` 为空，作用于面板自身；位移相对于宿主放置面板的位置。动画不负责奖励发放或控制器切页。

<<< ../../examples/reward-panel-layout/index.mjs#example {js}

`redesignRewardPanel(projectPath, runtime?)` 可由宿主导入；提交后失败的恢复句柄和处理方式与 A 相同。直接运行 `node reward-panel-layout/index.mjs`（或 `npm run reward-layout`）则会创建另一份独立工程，完成 B，并分别发布修改前后的 `.fui` 和图集。JSON 的 `before.files` / `after.files` 给出真实文件路径；两个发布目录在工程目录之外，不覆盖原工程，也不会继续编辑先前 `--create` 的结果。

### 渲染与动画验收

在已有 FairyGUI/LayaAir 宿主中，分别加载两个发布目录的包，创建 `Main/RewardPanel`；先设置宿主位置，再加入舞台。修改后自动播放一次 `intro`，也可用 `panel.getTransition('intro').play()` 重播。编辑器可直接打开 `projectPath` 检查工程和时间轴。

下图为同一 520 × 420 视口、`Claimable` 页的真实发布产物截图，使用 OpenFairyGUI `0.4.0`、LayaAir `3.3.10` / FairyGUI 和 Chromium `151.0.7922.34`：

| 修改前 | 修改后 | 动画中点（0.2 秒） |
|---|---|---|
| ![360 × 280 原面板](../assets/reward-panel-layout/before.png) | ![420 × 320 改版面板](../assets/reward-panel-layout/after.png) | ![透明度 0.75，向下偏移 6 的动画中点](../assets/reward-panel-layout/intro-midpoint.png) |

| 动画时间 | 面板透明度 | 相对宿主位置的偏移 |
|---|---|---|
| 0 秒 | 0 | (0, 24) |
| 0.2 秒 | 0.75 | (0, 6) |
| 0.4 秒 | 1 | (0, 0) |

该次原生运行时验收已检查自动播放结束、上述时间点、A 的全部三页，以及只有 `Claimable` 页响应真实鼠标点击；控制台无错误。更换工程、样式或运行时后，应重新执行这些视觉检查。

`pack:check` 中的 B 检查覆盖 SDK 与真实 MCP 的查询、预演、保存回读、完整 UAM/文件比较、重复任务拒绝，以及发布二进制中的尺寸和 0.4 秒动画。B 仅改变 `assets/Main/RewardPanel.xml`，其他文件字节不变。上述 FairyGUI 截图验收是单独执行的；消费者门禁中的 Chromium 测试仍是下方 OPFS 存储页面，不能混为一项渲染门禁。

## 从模板生成奖励卡片

任务 C 从已有 `Main/RewardCardTemplate` 生成三个导出的组件，稳定版 `0.6.1` 即可运行。每个新组件只有一个引用模板的 Label 实例，以正式实例属性设置标题与图标；模板的子节点保持在原组件中。图标引用现有 Shared 包的两张 2 × 2 红蓝 PNG，它们是用于验证资源复用的色块。

先创建包含模板与图片、尚未生成卡片的独立工程（不要求先运行 A/B）：

```bash
node reward-card-generation/index.mjs --create
```

按[接入指南](./getting-started.md#完成首个编辑任务)授权实际 `projectPath` 后，将下列任务和配置表交给 Agent：

> 在 `<projectPath>` 的 Main 包中新增表中的三个导出组件。查询 `RewardCardTemplate` 和 Shared 图片的唯一 ID，核实模板为含 `title` 文本及 `icon` Loader 的 Label，图片已经导出。每个新组件与模板同尺寸（示例为 240 × 180），仅包含位于 (0, 0)、同尺寸的 `card` 组件实例，引用原模板并配置 Label 的 title/icon；图标 URL 使用实际包与资源 ID。保留已有资源，不复制模板子节点或图片。查询结果需属于同一 revision，以三个 `addComponent` 一次预演、提交，完整验证后保存并重新打开核对。目标不唯一、ID/名称已占用、revision 冲突或验证不完整时停止并报告，保留已提交但未保存的工作。

| 新组件 | 稳定资源 ID | 标题 | 现有图片 |
|---|---|---|---|
| `DailyRewardCard` | `cardday1` | 每日奖励 ×100 | `Shared/red` |
| `WeeklyRewardCard` | `cardweek` | 连签奖励 ×500 | `Shared/blue` |
| `BonusRewardCard` | `cardbon1` | 额外奖励 ×20 | `Shared/red` |

<<< ../../examples/reward-card-generation/index.mjs#example {js}

宿主可导入 `generateRewardCards(projectPath, runtime?)`；提交后失败的恢复方式与 A 相同。无参数运行 `node reward-card-generation/index.mjs`（或 `npm run reward-cards`）会新建另一份工程，完成生成、验证、保存、回读并发布；JSON 的 `generated` 给出新组件 ID/名称，`published.files` 给出 `.fui` 与图集路径。发布目录在工程目录外，不会继续编辑先前 `--create` 的结果。

### 生成结构与渲染验收

消费者检查在 SDK 与真实 MCP stdio 中分别运行生成函数：预演不写盘；仅新增三个组件 XML，并更新 `assets/Main/package.xml`。独立回读后移除三个新增组件，完整 UAM 必须等于生成前；所有已有文件（除 Main 的资源清单）逐字节不变，包括模板 XML、其他组件和 PNG。另行检查生成结构、标题、图标与模板引用、重新打开后的查询、重复任务拒绝，以及发布二进制中的引用与实例属性。

在实际 FairyGUI/LayaAir 宿主加载发布的 Shared/Main 包，分别创建模板与三个新组件。下图使用 OpenFairyGUI `0.4.0`、LayaAir `3.3.10` / FairyGUI、Chromium `151.0.7922.34`，按左上模板、右上每日奖励、左下连签奖励、右下额外奖励排列：

![原模板与三个引用模板的奖励卡片](../assets/reward-card-generation/cards.png)

该次运行时验收核对了四个对象的文字、尺寸、模板 URL 和图标中心的红蓝 RGBA 像素；修改每日奖励的实例文字后，其他卡片与模板文字不变，控制台无错误。实例保留模板引用，模板样式的后续修改会影响全部实例；外层组件尺寸是生成时的模板尺寸，不自动跟随后续改尺寸。示例不包含奖励发放逻辑。

截图验收单独执行，未纳入 `pack:check` 的浏览器渲染门禁；更换模板、资源或运行时后需重新检查。UAM、XML、二进制或 `dirty: false` 检查不能代替实际渲染。

## 读取与校验

示例返回现有 `InspectReport` 和工程验证报告。退出码为：`valid` 为 0、`invalid` 为 1、`incomplete` 为 3。以下代码直接引用受消费者检查执行的源文件：

<<< ../../examples/node-inspect-validate/index.mjs {js}

CLI 的对应机器入口是 `ofgui inspect <工程路径> --json` 与 `ofgui validate <工程路径> --json`。它们在统一 envelope 的 `result` 保留原报告，JSON 模式的读取失败也返回同一 envelope；stdout 不混入人类日志。完整结构、退出码及离线 schema 见 [CLI 机器输出](./contracts.md#cli-机器输出)。无 `--json` 时保留终端报告格式。

## 带 revision 的修改、保存与回读

示例从 outline 获取资源 ID，再用 queryEntity 读取当前属性与 revision；将同一批文本修改先预演、再正式 apply，要求验证结果为 `valid` 且 `complete: true`，使用事务返回的 revision 保存，通过公开 Node I/O 重新读取工程，最后释放会话锁。预演不预留 revision。失败或验证不完整直接终止，不盲目重试 stale write。

提交后的验证、保存或回读失败会保留打开的会话，并抛出带有 `recovery: { runtime, sessionId, projectPath }` 的错误；`cause` 链保留原始错误及 Backend/验证报告。导入 `editAndSave` 的宿主应捕获错误，处理故障后用同一会话重新验证、明确保存，再关闭；可通过第三个参数传入宿主的 runtime。提交前失败会关闭干净会话。恢复句柄仅在当前进程内有效，独立命令失败退出后不会持久保存内存编辑。

<<< ../../examples/revision-checked-edit-save/index.mjs {js}

## 发布、读取产物与受限恢复

第三个示例创建两包工程，包含文字、组件、两张图片及跨包引用，通过 `publishNode` 发布，从返回的真实文件清单读取二进制，再将自己生成的可信产物恢复到独立目录，回读并要求完整验证通过。对比包/资源 ID、组件几何与文字、跨包引用；不比较原工程标识、编辑器本地状态或 XML 文本。

<<< ../../examples/publish-restore/index.mjs {js}

`ofgui publish <工程> -o <发布目录> --project-type layabox --json` 返回 `{schemaVersion:1,command:"publish",success:true,result:{files:[{path,size}]}}`；文件清单由 Node 工作流在实际写入后产生，路径是最终绝对路径、size 为字节数，不含未改动旧文件或任意插件私有 I/O。显式运行时输出目录原子提交，不扩大到独立 codegen 路径或插件副作用。

`ofgui restore <可信发布目录> -o <独立工程目录> --json` 返回 `{schemaVersion:1,command:"restore",success:true,result:{projectPath,packages:[{id,name}],warnings}}`。两命令退出 0 表示工作流成功，1 为工作流失败，2 为命令语法错误；错误 JSON 使用 `success:false` 和 `error:{code,message}`，code 为 `publish_failed`、`restore_failed` 或 `invalid_arguments`。JSON 模式的人类日志进入 stderr，stdout 只有一个结果；帮助仍为文本。恢复成功及 warnings 不替代回读验证。

恢复只接受可信本地产物；输出必须为独立目录，默认拒绝覆盖，`--force` 也须等暂存恢复完成才替换旧目录。完整限制见[恢复边界](../published-project-restore-limitations.md)，安装后可离线读 `ofgui docs cat restore-limits --json`。不承诺还原发布物未携带的源码信息。

## MCP stdio 客户端

第四个命令复用正式 MCP SDK 启动安装后的 `@openfairygui/mcp/stdio`，不依赖全局可执行文件、shell 命令拼接或 HTTP 端口。它发现工具和版本绑定文档，显式限制 `OPENFAIRYGUI_ALLOWED_PROJECT_ROOTS`，从 outline 取得 `Main/MainView/title` 的精确 ID，读取当前 revision 并预演文本修改。它不执行 apply/save，断言查询结果和干净会话保持不变，并在 finally 中关闭会话和 stdio 连接。

可传入有上述结构的 `.fairy` 文件；没有参数时新建独立样例。打开文件会话仍需短暂持有锁，不会绕过已有锁。`pack:check` 直接执行此文件，核对完整工程文件未变，并由后续会话打开证明锁已释放。SDK 是示例显式声明的消费者依赖，不加入产品的新抽象层。

<<< ../../examples/mcp-stdio-client/index.mjs#example {js}

## 真实浏览器存储

在上述仓库外的 `examples/` 副本执行 `npm run browser`，用 Chromium 打开终端显示的 localhost 地址。示例只在当前 origin 的 OPFS 中首次创建 `openfairygui-example/`，不请求本地目录权限、不覆盖已有示例；清除站点数据会删除该存储。点击 Open → Preview & apply → Save → 刷新 → Open，可看到保存后的 title、revision 和 dirty；未保存时 Close 拒绝丢弃编辑，但刷新仍可能丢失内存修改。Validate saved files 显式水合源字节并调用 `validateProjectWeb`，不能用没有图片字节的检查冒充完整验证。

<<< ../../examples/browser-project-storage/main.mjs#example {js}

示例复用 Core File System Access 适配器、`WebIO`、Backend storage bridge 和浏览器 Web Locks，不实现另一份文件系统/锁。`pack:check` 在真实 Chromium 中执行此页面，断言预演和失败不写盘、stale revision 被拒绝、路径拒绝保留 dirty、保存只改变目标 XML、PNG 字节和红蓝 RGBA 不变、刷新回读、双标签页锁冲突以及正常/异常关闭后释放锁。成功现场包括 `browser-evidence.json` 与 `browser-consumer.png`；失败保留消费者目录。

OPFS 是 origin 私有存储，不等同于 `showDirectoryPicker` 选择的用户目录。这里不承诺本地目录授权、IndexedDB/ZIP 适配器、跨浏览器矩阵、图片替换 Worker 或 FairyGUI 渲染器的验证。平台说明见 [MDN OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)。

## 当前源码与发布物验证

从仓库根目录执行：

```bash
pnpm pack:check
pnpm pack:check --artifacts .release
```

第一条命令先构建并打包当前五个发布包；第二条只读取指定目录内、与当前包名和版本匹配的五个 tarball，不重新打包。发布流程在两个 registry 的 publish 之前运行第二条命令，检查的就是将要发布的文件。

检查在仓库外的全新目录执行：

- 用五个本地 tarball 安装生产依赖，并将内部包依赖固定到这些 tarball；禁止 workspace link，清除环境中的 Node loader/源码解析配置。
- 按真实 `exports` 检查打包文件、ESM import、CJS require、Node/Web 入口；Worker 单独作为浏览器入口，不在 Node 主线程导入。
- 验证安装后的 CLI/bin、版本、inspect/validate JSON，以及 MCP stdio initialize 和工具发现。
- 运行本页七个 Node 示例（包括真实 stdio 客户端），检查读/预演不写盘、保存后只改变预期字段与对应 XML、无新增无关文件、会话锁释放、stale revision 被拒绝；A/B/C 额外执行上述 SDK/MCP 完整语义、文件、发布动画及生成组件引用比较。单字段编辑示例的验证失败和暂存写入失败须保留 revision、dirty、诊断及锁，原文件不变；故障解除后用同一会话明确保存并回读。
- 发布示例额外核对实际 manifest/文件字节长度、二进制组件与跨包引用、图集红蓝 RGBA 像素、恢复后素材与工程验证；损坏图集下强制恢复失败须保留完整旧目录。发布/恢复真实 Agent 任务使用独立受限宿主，见[评测指南](./agent-evaluations.md)。
- 生产运行通过后，再声明并安装锁定版本的 TypeScript、Node 类型、esbuild 和 Playwright，严格编译 `.mts`/`.cts` 消费者，不启用 `skipLibCheck` 或源码 alias；浏览器/Worker 无 Node external 打包后，执行上述真实 Chromium 页面验证。

成功后自动删除检查器创建的临时目录；失败保留现场并打印路径。`pnpm pack:check --keep` 可以保留成功现场。安装需要 registry 和匹配 Chromium 的网络或缓存；浏览器下载失败/启动失败不算通过。Playwright 与 Chromium 安装版本绑定，见 [浏览器安装说明](https://playwright.dev/docs/browsers)。默认不安装系统依赖；Linux CI 显式使用 `--browser-deps` 安装 Chromium 所需系统包（可能需要 sudo），Windows 忽略该系统依赖选项。浏览器缓存位于仓库外，不随消费者临时目录删除。

这些检查证明包入口、类型、Node 工作流及真实 Chromium 存储页面行为，不证明本地目录权限、完整编辑器 UI、所有图片格式或全部发布/恢复格式。项目测试与用户示例分别维护；本页八个示例均纳入消费者验证。

验证入口和 CI 范围见[开发指南](./development.md)，产品入口见[包与工具](./packages.md)。
