# OpenFairyGUI 项目审查与调整清单（2026-09）

[English](./PROJECT_REVIEW_EN.md)

本文整理对仓库的一次整体审查，覆盖代码质量、开发框架与 CI、Agent 友好性、文档与方向规划，并给出按优先级排列的调整项。本文是一次性审查记录与待办清单，不属于 `docs/` 的现行协议文档；条目完成或确认不做后，应在对应 PR 中勾选或删除。

- 审查基线：`main` @ `176dff2`（v0.6.1）
- 行号均指上述基线，后续提交后可能偏移。


## 最新交付验证（2026-09-25）

已将纯格式化、功能修复、next 合并和 MCP 错误可见性修复整理为独立提交。完整 `pnpm check:ci` 通过：656 项 AVA、42 项仓库测试、五包消费者、11/11 reference、4 项 Chromium 检查和文档构建。`pnpm coverage` 通过，行/语句 93.39%、函数 95.06%、分支 80.62%。模型最终结果见[评测基线](./agent/evals/baselines/README.md)；以下各阶段数量是当时记录。

## 证据等级

| 标记 | 含义 |
|---|---|
| 已复现 | 实际运行代码观察到问题 |
| 已核实 | 审查者亲自阅读对应源码确认 |
| 代码审阅 | 由代码阅读得出，尚未逐行复核或运行，修复前需先确认 |
| 待确认 | 依赖 fixture、上游行为或运行环境，证据不足，不作结论 |

## 总体结论

工程纪律明显高于同规模项目：契约生成与漂移检查、影响映射选测、tarball 消费者冒烟、面向 Agent 的诊断码与恢复指引都已成体系。主要问题集中在四处：

1. 构建产物中存在多份运行时副本（CLI 内联 core/functions，backend 各入口各带完整运行时）。
2. 往返测试只比较结构数量不比较语义，已漏过一个真实的数据丢失问题（R1）。
3. 若干安全与健壮性边界（路径包含比较、空根目录列表、锁恢复、会话上限）。
4. 大量“必须同步文档”的规则只能靠自觉执行，手写事实已出现漂移。

## P0 处理状态

2026-09-24 已完成 R2、R5、R6、R7、B1、B2。B1/B2 完成后，Windows / Node 24.21.0 / pnpm 10.14.0 下重新运行 `pnpm check:ci` 通过：634 项 AVA、36 项仓库脚本测试、fixture 校验、lint、typecheck、指引/契约检查、五包 tarball 消费者（含 CLI 外部依赖与 Backend 双格式入口身份检查）、10/10 个参考 Agent 任务、4 项真实 Chromium 存储/安全检查及文档构建。仍有既有 lint 与构建包体大小警告。下表记录已实现行为及明确边界。

| ID | 处理 | 仍未覆盖 |
|---|---|---|
| R1 | 二进制解码的 group 一律为高级组；新增 Basics/Transition 语义往返测试（去掉修复时测试失败）；删除 restore 限制文档中的“Group 高级模式”行 | — |
| R2 | Node 精确规范路径身份；浏览器 `caseSensitivePaths` 默认 true，可声明不区分大小写；包含检查、会话与锁身份一致 | — |
| R3 | 见下方更正；空列表不再等于不限制，stdio 在变量已设置但为空时拒绝启动 | 保留 cwd 默认值 |
| R4 | `project_open_failed.reason`（8 种）；MCP 未处理异常连同 requestId 写入 stderr | — |
| R5 | 不可变完整 owner 元数据原子发布；操作系统进程创建身份识别 PID 复用；进程票据协调并发回收 | 无法确认身份、跨主机锁仍冲突 |
| R6 | 会话及响应上限；默认 30 分钟回收干净空闲会话，访问续期，脏会话与忙碌会话保留 | 脏会话须显式保存或关闭 |
| R7 | 只暂存并替换工程文件/设置/资源，保留无关目录及根目录；逆序回滚、恢复路径、清理警告 | 外部读取无同时切换快照；崩溃恢复须人工处理 |
| B1 | 已完成：CLI 依赖 core/functions；`dist/cli.mjs` 约 23 KB；消费者检查外部导入、运行时依赖和与 Backend 相同的包解析路径 | — |
| B2 | 已完成：ESM/CJS 各自共享 chunk；根入口与 `/node` 具有相同运行时类身份；CJS 辅助代码独立分块，消除 Node 桥接反向依赖 | ESM 与 CJS 仍是独立模块图 |
| B3 | 已完成：依赖与发布范围已收口；CLI 单进程启动；MCP 契约与发现 schema 按需生成并缓存 | 首次完整工具发现仍需生成全部工具的精确 schema |

契约影响：能力 schema 12 → 14；新增诊断码 `session_limit_exceeded`（共 102 个）；`runProjectWriteTransaction` 必须返回 `ProjectWriteTransactionResult`（已在 CHANGELOG 记为破坏性变更）。

## 一、正确性与安全（P0）

### R1 binary→binary 往返丢失 GGroup — 已复现

- 现象：读取已发布 `.bytes` 后直接写回，再读取，`GGroup` 子项丢失。unity fixture 中 `Basics_fui.bytes` 从 4 个变为 2 个（`Demo_Grid` 的 `n25`、`n35` 消失），`Transition_fui.bytes` 从 2 个变为 0 个；其余抽样包未受影响。
- 原因：解码器仅在 group 带 gears 或 relations 时设置 `advanced=true`（`packages/core/src/io/component-decoder-child.ts:442`），而编码器会过滤非高级组（`packages/core/src/io/component-encoder-shared.ts:172`）。只带布局参数的高级组因此被过滤。
- 协议依据：`docs/published-project-restore-limitations.md:68` 记录“简单 Group 在发布数据中会被直接裁掉”，同文件 `:69` 以 `Basics/Demo_Grid.xml`、`Transition/Main.xml` 为样本，说明这些 group 在源工程中是 `advanced="true"`。因此出现在二进制 child list 中的 group 应均为高级组。
- 调整：二进制解码 group 时一律设为 `advanced=true`；随后复核 restore 限制文档第 69 行是否可以删除。
- 验收：新增语义往返测试，比较每个组件的子项类型、名称、文本、控制器与 group 数量；至少覆盖 `Basics`、`Transition`。

### R2 路径包含检查在区分大小写的文件系统上失效 — 已核实

- `packages/backend/src/path-policy.ts:31` 在 realpath 之后对整个路径 `toLowerCase()`，`:56` 再做前缀比较。Linux 上允许根 `/srv/Proj` 时，`/srv/proj/...` 也被视为在根内；大小写不同的两个项目还会产生误报的“已打开”冲突。
- 影响范围：allowed-roots 检查（`packages/backend/src/services/runtime-service.ts:136`）以及读写包含检查。
- 调整：仅在 win32/darwin 折叠大小写，或探测文件系统是否区分大小写；同步更新 capability 中的 `canonicalization` 声明（当前为 `realpath+normalized-casefold`）。补充大小写变体逃逸测试。

### R3 允许根目录列表为空时等于不限制 — 已核实（原结论已更正）

- 更正：原结论“未设置变量时不限制”有误。`packages/mcp/src/server.ts:57` 在未传入根目录时使用 `[process.cwd()]`。
- 实际问题：变量设为空字符串或只含分隔符时解析为 `[]`，而 `runtime-service.ts:136` 用 `?.length` 判断，空列表被当作不限制。cwd 默认值也没有写进文档。
- 调整：空列表表示不允许任何工程；stdio 在变量已设置但未列出目录时拒绝启动；在入门文档中说明分隔符与 cwd 默认值。

### R4 打开会话失败时丢弃原因 — 已核实

- `packages/backend/src/runtime.ts:113` 的 `catch {}` 把缺少 `.fairy`、多个 `.fairy`、符号链接、ENOENT、读取诊断等全部折叠成 `project_open_failed` / “Unable to open project.”，Agent 无法据此恢复。
- 调整：增加 `reason` 子码与经过脱敏的消息；MCP 的兜底 `backend_unhandled_error`（`packages/mcp/src/tool-handler.ts` 约 198 行）同时把 requestId 与堆栈写到 stderr。

### R5 Node 锁恢复缺口 — 已核实（竞态部分为代码审阅）

- 已核实：`packages/backend/src/node.ts:25-66` 中，锁文件为空或无法解析时 `parseLockMetadata` 返回 `null`，`recoverStaleLock` 直接返回 `false`。进程若在 `open('wx')` 与写入元数据之间崩溃，会留下永久的 `lock_conflict`。
- 代码审阅：第二次读取与 `unlink` 之间存在 TOCTOU 窗口；PID 复用会让陈旧锁被误判为存活。
- 调整：先写临时文件再 link/rename 到锁路径；对超过阈值的空锁文件按陈旧处理。补充空锁恢复测试。

### R6 会话与响应无上限 — 代码审阅

- `open_session` / `open_project_session` 没有会话数量上限，也没有过期机制，每个会话都在内存中持有整个工程的字节（`runtime-service.ts` 约 180 行）。
- `validate_session`、`get_project_outline`、`get_events` 未设置 `maxResponseBytes`（`packages/mcp/src/tool-metadata.ts:67-103`）。
- 调整：增加会话上限与空闲回收，为上述工具补充响应预算。

### R7 Node 保存成本与残留 — 代码审阅

- 每次保存都用 `fs.cp` 复制整个项目根目录并遍历检查符号链接，其中包括 `.git`、Unity `Library` 等非工程目录（`packages/backend/src/node.ts:95-178`）；任何一个无关的符号链接都会阻止打开与保存。
- 备份删除失败被静默吞掉（约 178 行），会残留整份工程副本。Windows 上重命名根目录可能遇到 EBUSY/EPERM。
- 调整：只暂存工程拥有的路径；残留备份以 warning 形式返回路径。

## 二、打包与依赖（P0/P1）

### B1 CLI 内联 core 与 functions — 已完成

- `packages/cli/package.json` 把 `@openfairygui/core`、`@openfairygui/functions` 放在 devDependencies，tsdown 因而把它们打进 `dist/cli.mjs`（约 1.15 MB，可见 `Document`、`ByteBuffer`、pako `Deflate` 等类）。backend 作为外部依赖又会加载一份，导致 `instanceof` 与模块状态分裂、版本漂移。
- 已改为 `dependencies`，构建保留公开包导入，当前 `dist/cli.mjs` 为 22,820 字节。tarball 消费者验证依赖声明、外部导入、体积上限及 CLI/Backend 解析到同一份 Core/Functions。

### B2 backend 各入口各带完整运行时 — 已完成

- `packages/backend/tsdown.config.ts:10` 设置了 `codeSplitting: false`，`dist/index.mjs` 与 `dist/node.mjs` 各自定义了 `BackendRuntime`、`PreviewBudgetError` 等类。v0.6.0 中“跨独立打包入口识别事务结果”的修复就是这一问题的绕行方案。
- 已统一三入口构建并开启 ESM/CJS 共享分块，将 CJS interop 辅助代码独立分块，消除运行时 chunk 对 `node.cjs` 的反向依赖。构建测试与 tarball 消费者均覆盖两种格式、两种加载顺序下的类身份与工厂实例，以及 CJS 根入口不加载 Node 桥接。跨格式/跨宿主错误继续使用结构化诊断。

### B3 依赖与发布内容卫生 — 已完成

- 根 `sharp` 已归入 `devDependencies`；Functions/CLI 保留可选依赖，范围为 `>=0.33.0 <0.35.0`，明确支持 0.33/0.34，不接受未知后续次版本。仓库测试与 tarball 消费者检查依赖分类及上限。
- 五包均排除 `src/` 源码副本，消费者检查实际安装文件。Backend 仍按公开导出提供 ESM/CJS 及声明。
- MCP 工具定义按输入/输出分别缓存 Zod schema；注册和初始化不触发转换。调用只加载对应工具；工具发现按需生成并缓存精确 JSON schema。Host 策略同样按需组合，SDK 动态工具管理保持有效；首次完整工具发现仍需处理全部工具。
- CLI 启动器直接导入入口并在当前进程执行。构建入口测试禁用所有子进程派生 API，检查版本、JSON 参数错误和退出码，防止恢复为二次启动。
- 验收：2026-09-24 在 Windows / Node 24.21.0 / pnpm 10.14.0 下 `pnpm check:ci` 全部通过：636 项 AVA、37 项仓库脚本测试、五包 tarball 消费者、10/10 参考 Agent 任务、4 项真实 Chromium 检查及文档构建。既有 lint 与文档包体警告仍在。

## 三、代码质量（P1）

| ID | 问题 | 证据 | 调整 |
|---|---|---|---|
| Q1 | GButton 子项的 controller/page/sound/volume/checked 从 `extras` 读取，但读写路径都不写入，重编码时总是默认值；违反 AGENTS.md 的 `extras` 边界 | 已核实：`packages/core/src/io/component-encoder-child.ts:579-601` | 在 `GButton` 上建模正式属性，编解码双向使用 |
| Q2 | Label 实例的输入设置固定写 `false`，`promptText` 等可能在发布时丢失 | 已核实写死 `false`：`component-encoder-child.ts:757`；是否真的丢数据 待确认（需用含 prompt 的 fixture 验证） | 取证后补齐编码 |
| Q3 | Button/Label 扩展数据有两套编码实现且已漂移（标题颜色判断、音量写出条件不同）；extension type 映射表定义了三处 | 代码审阅：`component-encoder-child.ts:564-624` 与 `:718-760`；`packages/core/src/io/binary-writer.ts:455` | 每种扩展只保留一个 writer，共享一张枚举表 |
| Q4 | `extras` 仍承载协议或流程字段：`sprites`、`_publishedFile`、`_preservePackageResourceOrder`、`_filePath`、`extensionType` 回退 | 代码审阅：`binary-reader.ts`、`binary-writer.ts`、`project-package-reader.ts` | 提升为正式属性，或移入 reader/writer 上下文；删除 `extras.sprites` |
| Q5 | `_rawBinary` 复用路径实际不可达：读取后组件均为 dirty，写出时总是重新编码。若将来变为可达，复用字节中的字符串索引指向旧字符串表 | 已复现不可达；风险为代码审阅 | 删除该路径，或补齐字符串重映射并加测试 |
| Q6 | `GComponent` getter 的返回类型比默认值更窄，运行时返回 `undefined`，编码器靠 `?? 0` 兜底 | 代码审阅：`packages/core/src/properties/g-component.ts:98-105` | 补齐默认值，去掉与 `IGObject` 重复声明的字段 |
| Q7 | XML 协议表的 key 不受编译器约束（`Record<string, XmlAttrSpec>`）；`implemented` 字段从未被读取；仍保留 `displayObject` 协议节点 | 代码审阅：`packages/core/src/io/project-xml-protocol.ts:4,24-48,616` | 用 `const` 泛型保留字面量 key；删除无用字段；重命名 `displayObject` |
| Q8 | 根入口的 UAM 导出与 `./uam` 不一致，并暴露 `ReaderContext`、`BinaryWriter` 等内部实现 | 代码审阅：`packages/core/src/index.ts:19-166` | 统一 re-export，内部实现移出公开入口或标记为 `@internal` |
| Q9 | core 的错误缺少结构化 code（约 155 处 `throw new Error`）；preflight 投影异常被 `catch { return; }` 吞掉 | 代码审阅：`packages/core/src/uam/preflight/projected-state.ts:296,352` | 引入 `ProjectIOError` / `BinaryFormatError`；投影失败返回 `projection_failed` support issue |
| Q10 | 类型逃逸集中在属性访问器：core 约 144 处 `any`、86 处 `as never` | 代码审阅：`g-movie-clip.ts`、`g-combo-box.ts`、`g-button.ts`、`skeleton-resource-base.ts` | 参考 `GImage` 修正 `GComponent` 的泛型 |
| Q11 | 发布时 `--packages` 名称写错会被静默过滤；全部不匹配时只打一条 warn，退出码仍为成功 | 已核实：`packages/functions/src/publish.ts:329-337` | 名称未知时直接失败 |
| Q12 | 没有 `--no-plugins`，工程插件默认通过 jiti 执行；未指定 `-o` 时发布非原子地写入工程配置的输出目录 | 代码审阅：`packages/functions/src/adapters/node/plugins.ts:88-90` | 增加开关并在文档中说明信任边界 |
| Q13 | CLI 与 backend 各有一份 `resolveFairyPath`，行为已经不同（后者会解析 realpath） | 代码审阅：`packages/cli/src/utils/project-input.ts`、`packages/backend/src/path-policy.ts:62` | 只保留一份 |
| Q14 | 图像校验会完整解码像素，仅依赖 sharp 默认像素上限；restore 创建画布时尺寸取自二进制且没有上限 | 代码审阅：`adapters/node/validate.ts:77`、`adapters/node/restore.ts:128` | 显式设置 `limitInputPixels`，并限制画布尺寸 |
| Q15 | 小项：`binary-reader.ts:588` 忽略了 `seek` 的返回值；`ByteBuffer.getCustomString` 每次都新建 `TextDecoder`；Node/Web 的 `exists` 把权限错误也当作“不存在” | 代码审阅 | 顺手修正 |

测试相关：

- 往返测试（`packages/core/test/write-binary.test.ts:737-810`）只比较包 ID、资源数与 sprite 数，这正是 R1 未被发现的原因。
- 超大测试文件建议按主题拆分：`packages/backend/test/browser-safe-project-session.integration.test.ts` 3838 行，`write-binary.test.ts` 2915 行。
- 缺少以下场景的测试：大小写变体路径逃逸、空锁恢复、保存提交与回滚同时失败、MCP 响应上限、未知 `--packages` 名称。

## 四、开发框架与 CI（P1）

| ID | 问题 | 证据 | 调整 |
|---|---|---|---|
| D1 | 格式化没有强制执行：`lint` 与 `lint:ci` 完全相同，都不检查格式；Biome formatter 报告 351 个文件中有 278 个不符合 | 已核实脚本；格式错误数为代理实测 | 单独提交一次全量格式化；`lint:ci` 改为 `biome ci`；删除重复脚本 |
| D2 | AVA 主测试只在 Ubuntu + Node 22 上运行；Windows 只跑 `pack:check`；Node 24 未覆盖 | 已核实：`.github/workflows/ci.yml` | 测试矩阵改为 `{ubuntu, windows} × {22, 24}` |
| D3 | push 事件只在 `main` 上触发 CI，`next` 合并后的结果没有验证 | 已核实：`ci.yml:5-7` | `branches: [main, next]` |
| D4 | release 工作流级别授予 `id-token/contents/packages: write`，所有步骤（包括依赖安装脚本、浏览器下载）都能拿到；action 未按 SHA 固定 | 已核实：`.github/workflows/release.yml:9-12` | 拆成只读的构建校验 job 与发布 job；按 SHA 固定 action |
| D5 | release 的门禁比 `check:ci` 少（缺 `refs:verify`、`test:repo`、`check:agent-links`、`docs:build`）；不校验双语 CHANGELOG 中是否存在对应版本；使用 `generate_release_notes: true`，与 AGENTS.md 的发布日志规则冲突 | 已核实：`release.yml:174` | 运行 `pnpm check:ci` 或要求该 SHA 已通过 CI；校验两份 CHANGELOG 的版本条目，并以其内容作为 Release 正文 |
| D6 | backend 测试在运行中途重建 CLI，可能与并行测试争用 `dist`；也是 impact-map 中 “cli → backend” 规则存在的原因，层次倒置 | 已核实：`packages/backend/test/cli-bootstrap.integration.test.ts:44-47` | 移到 `packages/cli/test`，依赖事先构建；从 cli 规则中去掉 backend |
| D7 | 测试混用 `src`（tsconfig paths）与 `dist`（子进程、隔离构建测试），单独运行 `pnpm test` 可能跑到过期的 `dist` | 代码审阅 | `check:ci` 显式构建，或增加 `pretest` |
| D8 | 覆盖率没有任何门槛，CI 也不收集 | 已核实：只有 `coverage` 脚本 | 在一个 CI job 中启用 `c8 --check-coverage`，或删除该脚本 |
| D9 | TypeScript 别名：`typescript` 指向 TS6（供 API 使用），`@typescript/native` 指向 TS7（供 `tsc` 使用）。两个包都提供 `tsc` bin，契约生成与类型检查使用不同编译器；消费者检查只覆盖 TS6 | 已核实：根 `package.json` | 在 package.json 旁注明原因，显式调用 TS7 路径；考虑增加 TS 5.x 消费者检查 |
| D10 | 诊断脚本不容忍 git 错误：遇到 dubious ownership 时 `repo-doctor` 整体崩溃，`test-changed` 误报“无法解析比较基准”并回退全量 | 已复现 | 分段捕获异常，报告 git stderr，并提示 `safe.directory` |
| D11 | Biome 规则偏宽：`noExplicitAny` 与 `useNodejsImportProtocol` 均关闭 | 已核实：`biome.json` | 立即开启后者（当前没有违规）；前者对 `src` 设为 warn |
| D12 | `--no-worker-threads` 在多处重复 | 代码审阅 | 在 AVA 配置中写 `workerThreads: false` |
| D13 | 文档部署不等待 CI 结果；与 `packageManager` 重复声明 pnpm 版本 | 代码审阅：`.github/workflows/deploy-docs.yml` | 改用 `workflow_run` 在 CI 成功后触发，删除重复版本 |
| D14 | 仓库卫生：`.gitignore` 中的 `referer/` 疑为 `reference/` 的笔误（本地 `reference/` 只靠 `.git/info/exclude` 忽略）；`/[Oo]bj/` 是 .NET 残留 | 已核实 | 修正忽略规则 |

## 五、Agent 友好性（P1）

维护者侧（编码 Agent）：

- A1 根目录缺少 `CLAUDE.md`，Claude Code 不会自动加载 `AGENTS.md`。调整：新增只含一行 `@AGENTS.md` 的 `CLAUDE.md`（已核实缺失）。
- A2 根目录与包级 AGENTS.md 给的验证命令不一致。根目录要求 `check:fast --base origin/next`；backend、cli、core、functions、mcp 五个包写的是 `pnpm test:changed`，后者不运行 lint 与 typecheck。core、test-utils 要求的 `pnpm check:ci` 需要联网并下载浏览器，也没有给出离线替代（已核实）。调整：统一到根目录的命令，并写明离线降级方案。
- A3 AGENTS.md 中字段归属、文档同步、“无历史包袱”等规则分散在多个表中重复出现；影响映射列出的文档只作为提示，缺少 `project-xml-attribute-reference.md`、`publish-plugins.md`、`guide/contracts.md`、`guide/diagnostics.md`、`guide/installed-docs.md`。调整：合并成一张规则表；`check:fast` 在命中规则但相关文档未改动时给出提醒，并支持显式豁免。
- A4 指引与开发文档中限定、免责语句很多，单句过长，token 成本高，下一步动作也被淹没。`docs/architecture-overview.md` 已包含逐文件实现细节，导致每次重构都要改架构文档。调整：架构文档只保留边界与数据流。另外补一份简短的英文贡献摘要。

消费者侧（通过 MCP/CLI 编辑工程的 Agent）：

- A5 stdio MCP 默认不提供 `instructions`（已核实 `packages/mcp/src/stdio.ts`），工作流、schema 与 operation 目录只能作为 resource 获取，而很多 MCP 客户端不会向模型展示 resource。调整：提供约 6 行的默认 instructions（先读 docs index，再 outline → query → preflight → apply → validate → save），并增加只读的文档读取工具。
- A6 工具描述中混入内部术语（`packages/mcp/README.md:9,38` 的 “P1/P2”、“backend P2 runtime surface”）。`open_session` 没有说明可以接受目录或 `.fairy` 文件、允许根变量以及用完需要关闭；`apply_transaction` 没有说明先 preflight、`expectedRevision` 与 `stale_write`（代码审阅）。
- A7 MCP 以 JSON 数字数组传输二进制，体积约为原来的 4 倍，并且在 `content.text` 与 `structuredContent` 中重复出现（代码审阅：`tool-handler.ts:122-136`）。调整：改用 base64 或 resource blob，统一输出紧凑 JSON。输入预算检查可能晚于 SDK 的完整 schema 解析（待确认）。
- A8 两个接入面都走不完完整闭环：CLI 没有 preflight/apply，MCP 没有 publish。调整：增加 `ofgui tx preflight|apply --ops <file> --expected-revision <rev>`；增加由宿主显式开启的 MCP publish。
- A9 模型评测只有 Codex runner，没有公开基线；10 个任务多为单步编辑。调整：增加第二个客户端，并随版本发布分数。

## 六、文档（P2）

| ID | 问题 | 证据 |
|---|---|---|
| W1 | 手写数字已过时：诊断码写 102 个（生成目录为 101）；capability schema 写 9（`packages/backend/src/contracts.ts` 为 12）；MCP README 写 “20-method”，但同一文件只列出 17 个工具 | 已核实：`docs/guide/diagnostics.md:5,7`、`packages/mcp/README.md:36` |
| W2 | `docs/project-validation.md` 没有英文版；`scripts/check-guidance.mjs:129-130` 把 `docs/en/` 归一化后再比较，掩盖了这一缺口 | 已核实 |
| W3 | 正文中硬编码版本号：`getting-started.md` 写 0.6.1，`README.md` 写 `0.5.0-alpha.1`；`examples/package.json` 用 `^` 范围，而文档要求精确版本；`examples/README.md` 漏列 4 个示例 | 代码审阅 |

调整：计数与版本改为由生成器维护的标记区块，并让 `check-guidance` 拒绝手写的数量声明；增加“每个 `docs/**/*.md` 都有 `docs/en/**` 对应文件”的检查。

## 七、方向规划

现状判断：

- 定位：一个无界面、对 Agent 安全的 FairyGUI 编辑内核（UAM 事务、会话与 revision、离线契约）。
- 维护集中：约 400 次提交中约 390 次来自同一位维护者，bus factor 为 1。
- 节奏：4 天内从 v0.4.0 发到 v0.6.1，其中 v0.6.0 把 Backend 契约升到 3.0.0 并删除了 job 方法。最近几个版本以重构与加固为主。
- “不保留历史兼容”适合当前阶段，但外部宿主一旦接入就会受影响。
- UI 视觉结果在文档中明确标注为“未验证”（`docs/guide/getting-started.md`）。

建议优先级：

1. 稳定面：确定 1.0 的公开面（UAM operations + Backend 方法），建立弃用窗口，放慢破坏性发布节奏。
2. 可视化验证：headless 渲染或逐控制器页截图，补上“UI 结果未验证”的缺口，这对 Agent 闭环收益最大。
3. 能力矩阵：生成一张 FairyGUI 编辑器功能 × 读/改/存/发布 支持情况的表，让 Agent 事先知道哪些能力不支持。
4. 接入面对齐：MCP 默认 instructions、CLI 事务命令、可选开启的 MCP publish（A5、A8）。
5. 公开评测：至少覆盖两个客户端，并随版本发布结果（A9）。
6. 降低贡献门槛：英文贡献摘要、good-first-issue、减少文档仪式，争取第二位维护者。

## 八、分阶段执行建议

| 阶段 | 内容 | 说明 |
|---|---|---|
| 第 1 批（修复） | R1 + 语义往返测试；B1；B2；R2；R4 | 每项独立 PR；R1、B1、B2 涉及发布产物，需同步 CHANGELOG |
| 第 2 批（门禁） | D1 全量格式化（单独提交）；D2、D3、D4、D5；D6 | D1 会带来大 diff，应与功能改动分开 |
| 第 3 批（Agent 体验） | A1、A2、A5、A6、W1、W2 | 大部分是文档与元数据改动 |
| 第 4 批（健壮性） | R3（先决定策略）、R5、R6、R7、Q11、Q12、Q14 | R3 需要维护者决定默认策略 |
| 第 5 批（质量债） | Q1–Q10、Q13、Q15、D7–D14、A7、B3 | 可以穿插进行，其中 Q1、Q2 需要先取证 |
| 规划 | 第七节 1–6 | 与根目录路线图对齐后排期 |

## 九、已排除的疑点

- “复用原始组件字节会指向旧字符串表，造成大面积数据损坏”：实测读取后所有组件都是 dirty，写出总会重新编码，该路径不可达，没有造成损坏；已降级为 Q5 的潜在风险。
- 整体分层：functions → core、backend → core/functions、mcp → backend 的运行时依赖符合架构文档；MCP 本身约 600 行，没有领域逻辑；core 没有运行时循环依赖，`node:` 导入仅出现在 Node 入口可达的模块中。

## 十、审查限制

- 审查所用的本地环境中，`node_modules` 的链接失效（指向旧盘符），也没有 pnpm，因此没有运行 typecheck 与 AVA。R1 是在临时目录中用已构建的 core `dist` 复现的。
- 标为“代码审阅”与“待确认”的条目，修复前需要先复核或补充证据；涉及协议字段（Q1、Q2）的，按 AGENTS.md 的取证规则先确认来源与样本。

## Q1–Q15 处理结果（2026-09-24）

- Q1：Button controller/page/checked 使用正式属性，sound/volume 读写采用现有正式访问器；共享实例编码和解码，二进制两次重编码及 XML 往返覆盖。
- Q2：依据固定版本 Unity GLabel.Setup_AfterAdd 与 Editor ChoosePackageDialog 的 Label prompt 样本，写入 prompt 输入块；其他未建模输入覆盖仍不宣称恢复支持。
- Q3：Button/Label 共用扩展实例读写函数；编码器、解码器和 BinaryWriter 共用 ObjectType 派生的扩展表，区分缺省颜色与显式黑色。
- Q4：Atlas/Sprite、publishedFile、preserveResourceOrder 使用正式属性；组件路径进入 ReaderContext；删除 extensionType 的 extras 回退。
- Q5：删除原始组件字节复用、dirty 跟踪与图监听；组件每次按输出字符串表重编码。
- Q6：复核发现当前 GComponent 已提供数值/集合默认值，原报告关于 undefined 的判断不成立；删除重复 IGObject 字段与默认值，新增 getter 回归检查。
- Q7：const 泛型保留 XML key；移除 implemented，将通用属性集合命名为 sharedDisplayAttributes，不作为 XML 实体节点。
- Q8：根入口完整重导出 UAM；BinaryReader/Writer 迁入 project-io 入口，ReaderContext 不公开。
- Q9：协议 I/O 使用 ProjectIOError/BinaryFormatError；投影失败返回 projection_failed 并阻止提交，携带已有操作定位。原生文件系统和 RangeError 保持其原有身份。
- Q10：具体控件的属性访问器去掉 any/never 逃逸；泛型属性图和引用边界保留集中、受限断言，并通过类型检查。
- Q11：任一未知发布包名在主流程 hooks 和输出写入前失败；覆盖混合有效/无效名称。
- Q12：CLI --no-plugins 与 Node plugins: [] 禁用发现/执行；双语文档明确进程级插件信任，以及省略 -o 和输出目录外写入不具备回滚保证。
- Q13：CLI 复用 Backend /node 的 resolveNodeFairyPath，移除重复工程路径解析。
- Q14：Node 图像解码和恢复画布明确限制 16,777,216 像素，分配前校验尺寸。
- Q15：检查 sprite block seek；复用 TextDecoder；exists 只吞“不存在”，保留权限等异常。

协议证据：FairyGUI-unity `8cc8f214cca79685532eef13372d0a4f74acdf08` 的 `Assets/Scripts/UI/GButton.cs:500–539`、`GLabel.cs:190–217`；FairyGUI-Editor `1eab9445dd8e73c716f8a5f71c27dcbca7b4b68f` 的 `ui/assets/Builder/dialogs/ChoosePackageDialog.xml:33`。fixture 版本和完整性已通过 refs:verify。

验收：Windows / Node 24.21.0 / pnpm 10.14.0 下 `pnpm check:ci` 通过：645 项 AVA、37 项仓库测试、41 operation / 17 Backend method 契约、五包 tarball、14 ESM / 14 CJS 入口、10/10 参考 Agent 任务、4 项真实 Chromium 检查与文档构建。lint 无错误，保留 15 项警告；文档构建保留包体大小警告。

最终源码另行通过 `pnpm pack:check`，包括插件发布计划修正后的五包消费者验证。这些结果记录该阶段的 worktree 快照。

## 开发与 CI（D1–D14）处理结果（2026-09-24）

| ID | 处理结果 |
|---|---|
| D1 | 维护源码统一格式化，首次修正 295 个文件；lint:ci 使用 biome ci，移除重复 lint；生成物与 fixture 不参与手工格式化。纯格式化已单独整理为提交。 |
| D2 | quality 矩阵为 Ubuntu/Windows × Node 22/24；本机实际验证 Windows / Node 24，远端四组合执行需提交后触发。 |
| D3 | main 与 next 的 push 都触发全量 CI。 |
| D4 | Release 的 verify job 只读，publish job 单独授予写权限且不检出源码、不安装项目依赖；三个工作流的 Actions 均固定为已核验的提交 SHA。 |
| D5 | release:prepare 校验五包版本与双语日志的对应版本、链接、分类、条目数及非空内容，正文直接取自双语日志。发布执行完整 check:ci --browser-deps，再验证精确 tarball；下载后核验 SHA256 并禁用发布生命周期脚本。翻译语义仍由人工审查。 |
| D6 | bootstrap 测试位于 CLI；删除 CLI/MCP 测试中途对共享 dist 的重建，CLI 影响映射不再反向选择 Backend。 |
| D7 | test、test:debug、coverage 都显式先构建；选测入口继续先构建。完整 CI 保留独立 tarball 构建与测试构建。 |
| D8 | 保留 coverage 并设门槛：lines/statements/functions 90%、branches 75%；Ubuntu / Node 22 执行并上传 LCOV。实测行 93.51%、函数 95.06%、分支 80.59%。 |
| D9 | typecheck 显式调用 TS7 包路径；package.json toolchain 与双语开发指南解释 TS6 Compiler API / TS7 类型检查分工。消费者继续验证 TS6，不承诺未经验证的 TS5。 |
| D10 | doctor 保留其他诊断段，Git stderr 和 safe.directory 指引不会丢失；选测不再把所有 Git 错误称为比较基准错误。真实 dubious ownership 子进程回归通过，不修改 Git 全局信任。 |
| D11 | node: 导入规则为 error；src 的 noExplicitAny 为 warn。 |
| D12 | workerThreads: false 只在根 AVA 配置声明；并行测试文件上限 4，避免 Windows 进程启动争用。 |
| D13 | Pages 仅在 main push CI 成功后触发，检出该次 head_sha，跳过过期提交；pnpm 版本来自 packageManager。构建与部署写权限分离。 |
| D14 | 保留正确的 /reference/ 忽略规则，移除 .NET obj 残留，增加 .release/ 本地产物忽略。 |

验收：`pnpm check:ci` 通过（645 项 AVA、40 项仓库测试、五包消费者、10/10 参考 Agent 任务、4 项 Chromium 存储/安全检查和文档构建）；`pnpm coverage` 通过全部测试及门槛。actionlint 1.7.12 验证三个工作流，24 段 run 命令通过 Bash 语法检查；未运行 shellcheck/pyflakes。保留 15 项 lint 警告与文档包体警告。真实 v0.6.1 双语 Release 正文提取通过。远端四组合 CI、发布和部署未触发；该阶段的改动随后已整理成提交。

## Agent 体验、文档治理与规划处理结果（2026-09-24）

| ID | 处理结果 |
|---|---|
| A1 | 根 CLAUDE.md 仅引用 @AGENTS.md。 |
| A2 | 各包统一 check:fast 与实际 PR 基准；双语开发指南明确离线检查、fixture 缺失与完整 CI 的边界。 |
| A3 | 根规则去重；影响表补齐 XML 字段、插件、契约、诊断与安装文档。check:fast 报告未触及文档并支持带理由的 --docs-waiver。 |
| A4 | 双语架构压缩到包边界/数据流；CONTRIBUTING.md 与英文开发指南提供贡献入口。 |
| A5 | 默认六行 MCP instructions 与只读 openfairygui_docs_read，支持仅显示工具的客户端。 |
| A6 | 移除 MCP README 的 P1/P2 与过时数量；补齐目录/.fairy、allowed roots、关闭会话、preflight/revision/stale_write 指引。 |
| A7 | 生成的正式输出字节路径转 base64，完整 payload 只放 structuredContent；快照 schemaVersion 2，输入保持数组，扩展 JSON 不转换。输入预算先于 schema 编译/深层解析，传输 JSON 解析仍由 SDK 执行。 |
| A8 | CLI tx preflight/apply 复用 Backend，JSON 字节解码与 MCP 共用。apply 在一次会话中预演、提交、验证、保存和关闭；每次新会话 revision 0 不是跨进程磁盘版本。MCP publish 仅由显式宿主回调启用，宿主拥有授权/路径/插件策略。 |
| A9 | 完整评测已完成：合入 next 与 MCP 错误摘要修复后的同组五包，reference、原生 Codex、原生 Claude 均 11/11。Claude Code 2.1.281 报告模型 claude-opus-5-5；Codex 0.154.0 未覆盖默认模型。首轮 Claude 9/11 的失败证据保留，评分规则未放宽。详见评测基线；这是本地工作区包快照验收，不是已发布版本认证。 |
| W1 | README/快速开始/诊断/MCP 版本与数量由 product-facts 标记区生成；检查拒绝常见手写数量/版本声明，仍需语义审查。 |
| W2 | 补齐英文 project-validation；检查每个规范 docs 页面确有英文对应文件，而非只归一化导航链接。 |
| W3 | 示例 OpenFairyGUI 依赖锁精确版本并校验一致性；补齐遗漏示例入口，快速开始使用安装版本语料。 |
| 规划 1–6 | 根 ROADMAP 双语入口与站点规划页对齐阶段、责任角色和验收：1.0 公共面/废弃窗口、视觉验证、能力矩阵、消费者入口、双客户端评测、贡献与第二维护者培养。视觉宿主与全功能矩阵仍是计划，不宣称已实现。 |

确定性与模型证据见 [评测基线](./agent/evals/baselines/README.md)。配置与连接失败的原始报告保留在[历史尝试](./agent/evals/baselines/history.md)，不计模型能力成绩。下列阶段记录保留当时的验证范围；当前交付以最新验收为准。

该阶段验证：pnpm check:ci 全程通过（648 项 AVA、42 项仓库脚本测试、五包 tarball 消费者、11/11 reference 任务、4 项 Chromium 存储/安全检查、类型消费者与文档构建）。另行导出的 reference 基线 11/11，任务脚本摘要无漂移。保留现有 15 项 lint 警告及文档包体提示；本轮后续真实 Codex 评测 11/11；Claude 后续完整结果见评测基线。新增参数后 check:fast --base origin/next 通过（648 AVA、42 仓库测试），docs:check 通过；远端 CI 和发布未执行。
