# 真实 Agent 任务评测

评测观察安装后的产品能否被 Agent 正确使用，不按指定工具顺序打分，也不把随机模型表现作为每个 PR 的门禁。任务定义在 [tasks.json](../../agent/evals/tasks.json)，入口是 `pnpm eval:agent`。

## 当前任务

| ID | 用户目标 | 确定性验收 |
|---|---|---|
| `inspect-validate` | 只读检查工程并报告包数、资源数、验证状态 | 实际验证调用成功，事实正确，完整工程语义和文件字节均不变 |
| `rename-save` | 将 `Main/MainView` 改名为 `RenamedView` 并保存 | 真实保存成功；重新读取后的差异仅为名称及对应文件重命名；ID、内容和无关文件不变 |
| `stale-revision-recovery` | 完成相同重命名并保留并发编辑 | 第一次有效提交前，宿主通过正式 Backend 另行修改并保存 title；原提交实际返回 `stale_write`，最终工程同时保留并发文字和重命名 |
| `edit-display-node` | 精确修改目标文本节点的文字与位置并保存 | 同组件有前置同名节点，另一组件有相同节点 ID；仅目标文字与坐标变化，完整 UAM、ID 和文件集合符合预期 |
| `edit-controller` | 查询 `Main/MainView` 的 state 控制器，将 Active 页改名为 Ready 并保存 | 实际查询目标控制器；只改页名，保留页面 ID/顺序/备注、actions、gears、同名干扰对象及全部无关文件 |
| `edit-transition` | 查询 `Main/MainView` 的 intro 动画，将 move-title item 的 duration 改为 18、endValue 改为 `[120, 64]` 并保存 | 实际查询目标动画；只改指定 item 的两字段，保留目标引用、其余字段/items、动画顺序、控制器引用及同名干扰对象 |
| `missing-source-bytes` | 重命名缺少已加载源字节的资源；受阻则安全停止 | 正式诊断 `unavailable_resource_source_bytes`；如实报告 blocked，文件不变，原会话及未保存工作保留 |
| `path-policy` | 检查并尝试保存到指定受限目标；受阻则安全停止 | 正式诊断 `path_policy_violation`；如实报告 blocked，不改目标或另存原路径，不丢失未保存工作 |
| `publish-consume` | 发布 Layabox 产物、读取二进制/图集，再受限恢复并验证 | 实际安装 CLI 发布与恢复；manifest 对应实际文件，组件 ID/几何/文字、跨包引用和红蓝 RGBA 正确，恢复工程 valid/complete，源工程和无关文件不变 |
| `restore-trusted` | 从可信本地备份恢复到独立新工程并验证 | 实际读取备份并调用安装 CLI restore；受支持语义和像素正确、工程 valid/complete，不可重发输入或强制覆盖，原输入字节不变 |

原三个任务的 fixture、提示与硬验收条件保留；新任务在公开示例基础上单独增加干扰节点、控制器/动画或二进制资源。复杂编辑案例包含多个页面、动作、动画及 items，以及指向页面的 gear；另一组件包含同名控制器/动画和相同节点 ID。两项复杂编辑须实际查询目标，再独立比较完整保存回读 UAM 和文件集合；不只比较目标字段。宿主不伪造冲突或安全拒绝，不自动代替模型保存。预演、文档阅读次数和重复提交属于观察项，不是强制调用顺序。

六个正向任务必须满足各自的真实读取/验证/保存要求；两个安全失败任务单独判定，不能用“保存成功”代替正确受阻。宿主通过公开 `openProjectSession` 创建已有未保存修改的真实会话；缺字节案例仅移除内存中资源的 `sourceBytes`，磁盘原文件仍完整。模型得到会话 ID，不获得替换会话或补造源数据的工具。每次工具响应后，宿主用正式查询记录原会话 revision、dirty、outline、实体投影与验证状态，并与初始快照严格比较；关闭、重开、提交后回滚或丢掉未保存工作均不能通过。受限目标在当前一次性 workspace 内、原工程外，带有不可覆盖的哨兵文件。

安全停止要求实际工具返回相应正式诊断、模型明确报告 `outcome: blocked` 和准确 `blocker`，且没有成功 apply/save/close。磁盘仍须独立读取、验证通过和逐字节不变；内存验证状态按原始会话检查，不能冒称缺数据会话已修复。不会为了安全失败用例放宽原三个任务的有效工程或保存条件。

### 独立发布与恢复宿主

两项 artifact 任务不共用编辑工具权限。`scripts/consumer/artifact-eval.mjs` 是评测专用的 Node 宿主，只暴露 context、固定项目发布、固定目录恢复、published/restored 两种检查；restore-trusted 不提供发布工具。所有命令由宿主固定装配，工具不接受命令、路径、参数、force、插件或源代码，越权尝试记为失败。它调用安装后的真实 `ofgui` 启动器及公开 Node I/O，不新增产品 MCP/Backend artifact API，也不开放模型终端。

输入由公开两包示例创建，不依赖本地受限语料；独立恢复任务的备份在模型启动前由宿主发布。发布清单只取正式 Node 工作流结果，检查按 Layabox 运行时的资源路径规则读取图集，解码 sprite 对应的红蓝 RGBA；单包 NodeIO 读取所含的空依赖占位按包 ID 与实际包合并。恢复判定只比较文档承诺的组件/资源 ID、几何、文字、跨包引用和像素；不要求原 projectId、文件扩展名、编辑器工作区状态或 XML 原文。完整边界来自随包 `restore-limits`，其唯一正文源是[正式恢复文档](../published-project-restore-limitations.md)。

判定器再次独立读取发布目录和恢复工程、验证 valid/complete、检查 manifest 的完整文件集合与字节长度、恢复工程可重写的文件集合、所有输入/哨兵文件的原始字节；临时 staging 泄漏也失败。模型必须实际执行发布（仅发布任务）/恢复并检查两侧产物，最终 facts 要准确；不能仅凭完成声明通过。不对恢复工程做超出受限恢复承诺的完整源 UAM/原 XML 字节比较。`mcp.jsonl` 保留实际 CLI argv、stdout、stderr 和退出码，`publish.json` / `restore.json` 保留机器报告；示例消费者检查另覆盖损坏图集下 `--force` 失败保留旧目录。

## 手动运行

```bash
# 无模型、无模型额度消耗：验证宿主、MCP 链路、注入和判定器
pnpm eval:agent --runner reference

# 真实模型：先自行安装并登录 Codex CLI，显式提供可执行文件
pnpm eval:agent --runner codex --codex codex --model MODEL

# 针对失败任务，使用保留的同一组五包 tarball 创建全新现场
pnpm eval:agent --runner codex --codex codex --model MODEL --case stale-revision-recovery --artifacts /path/to/retained/artifacts
```

`MODEL` 换成账户实际可用的模型。不提供 `--model` 时使用该 CLI 的内建默认值，并在报告中将 `modelRequested` 记为 null，不冒称已固定模型。Windows 必须为 `--codex` 提供原生 `codex.exe` 路径；不通过 `.cmd`、`.bat`、PowerShell 或字符串拼接 shell 执行模型。推荐开发 Node 和 pnpm 仍见[开发指南](./development.md)。

真实运行会使用本机已经配置的 Codex 登录与额度。脚本不登录、不读取/复制凭据、不安装 Codex、不更改用户配置；构建/安装 tarball 需要依赖网络，模型调用需要模型服务网络。不要向评测进程注入无关秘密。`--timeout-seconds` 为每个模型任务设置超时，默认 240 秒，允许 1–1800 秒；超时或模型服务失败保留现场并返回非零状态，不当作通过。

Codex 非交互参数、JSONL 事件与配置覆盖依据[官方非交互文档](https://learn.chatgpt.com/docs/non-interactive-mode)和[配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)。本机验证的 CLI 版本随每次运行记录在 `runner.json`，CLI 升级后应先运行一个只读任务检查兼容性。

## 隔离和判定边界

- 共用 `pack:check` 的五包打包/生产依赖安装流程：临时目录在仓库外，不安装 workspace、tsx、TypeScript 或 test-utils，不提供仓库源码。模型工作目录是独立空目录，题目提供工程路径、必要的会话 ID/目的路径和安装文档入口。
- 使用安装包的正式 MCP 服务、契约、Backend 和 Node 文件系统。编辑宿主仅开放十个 session 查询/编辑方法，以及正式资源文档；不开放虚拟工程创建、materialize、发布或任意文件命令。
- 忽略用户 CLI 配置、规则、AGENTS 和本机 Skill 发现，关闭 shell、原生执行、浏览器、外部应用、插件、记忆和多 Agent 工具。仅自动批准当前受限 MCP 宿主的工具。保留 Code Mode 宿主供模型编排已开放的 MCP 工具；它不是 Node shell。只读 sandbox 是附加限制，不替代 MCP 宿主边界。
- 编辑案例的 Backend 文件系统包装对真实路径做范围检查，包含 staging 回调；只允许当前案例的 `workspace`。正常保存可以在该目录内创建临时 staging/backup。额外保留工程内、工程外两份无关文件，最终对整个 workspace 做字节比较。越界尝试会记为失败，不仅检查是否留下文件。
- 编辑案例的判定器独立重读工程、执行 Node 验证，并比对完整 UAM 与预期文件集合。预期 UAM 直接按任务修改，不调用被测事务来生成答案。最终回复参与事实答案和安全停止声明检查，不作为保存或保留未保存工作的唯一证据。
- 编辑 MCP 宿主退出只释放自己的锁，不保存未提交工作。客户端强行结束 stdio 后，通过正式 Backend 锁 API 恢复死进程锁；仍存活的锁持有者会让该次验证失败。

这是受控产品任务评测，不是恶意模型的操作系统级逃逸测试；Codex 自身的登录/日志写入不属于工程写入计分范围。未保存工作须保留到模型结束；评测宿主随后销毁一次性会话，不承诺进程重启恢复。当前任务不覆盖图片编辑、任意复杂组件编辑、任意发布格式、浏览器交互或第三方 Agent 客户端的全部行为；控制器/动画仅验证表中编辑目标。宿主补齐源数据后的恢复是另一个正向场景，本轮不把安全停止算成恢复成功。安装包的 CLI 与 ESM/CJS/browser 检查继续由 `pack:check` 覆盖。

## 记录与复现

`agent/` 目录只保留 `impact-map.json` 与 `evals/tasks.json`；运行报告保存在本节说明的仓库外目录。此前提交的评测与验收记录可从 Git 历史查阅。

每次 `pnpm eval:agent` 均创建新目录，不覆盖旧评测。成功和失败均保留现场，终端打印绝对路径（`pack:check` 内的 reference 自测仍遵循消费者检查自身的清理/`--keep` 规则）：

- `artifacts/`：实际使用的五包 tarball，包括从 `--artifacts` 输入复制的归档。
- `evaluations/report.json`：包版本、文档/契约摘要、tarball SHA-256、Git HEAD、评测脚本/任务 SHA-256、消费者锁文件摘要、Node/平台、逐项硬检查和汇总。未提交脚本用摘要识别，不能仅依赖 HEAD。
- 每个任务的 `case.json`、`prompt.txt`、`runner.json`、`agent.jsonl`、`agent.stderr.txt`、`mcp.jsonl` 和 `final.json`：题目、实际 CLI 参数/版本、模型事件、完整 MCP 请求响应、注入/范围检查证据与最终回答；reference 没有模型专属文件。
- `before.json`、`expected.json`、`actual.json`、`result.json` 和 `workspace/`：原始/预期/实际 UAM、base64 文件快照、各项结果和最终工程。宿主或模型失败时也保存已经取得的证据。

观察项包括耗时（不含构建安装和最终判定）、完成的工具调用数、失败调用数（包括预期的 stale 拒绝）、文档 URI、预演次数、完全相同 apply 参数的重试次数、成功提交相同 operations 的次数以及 CLI 返回的 token usage。对象字段顺序不影响重复计数。宿主 `failedCalls` 包含 MCP 协议/工具错误；`clientToolCalls` / `clientFailedCalls` 另外记录客户端层的发现、批准拒绝等调用，不相加计算。模型服务错误在 runner 结果和 stderr 中记录，客户端跳过工具的告警另列为 `clientWarnings`。

`observations.discoveries` 记录每次真实 `tools/list` 中各工具及合计的输入/输出 schema 紧凑 JSON UTF-8 字节数。它不是 token 数、模型实际上下文长度或计费估算。MCP 复用现有 Zod 的本地 `definitions`/`$ref` 表达重复结构，保留完整的 41 类操作和 18 个方法；服务端结构校验、预算与 Backend 安全边界不变。具体客户端可能自行展开引用，字节下降不能直接换算为 token 节省。

消费者的 `app/pnpm-lock.yaml` 也保留在现场。重跑同一 tarball 仍可能解析到新的传递依赖，比较结果时须核对消费者锁文件和 Node/CLI 版本；需要字节级重现安装环境时使用保留现场的锁文件与 frozen 安装，而不是仅比较 tarball 版本号。

`modelSuccessRate` 只在 `codex` 运行中计算；`reference` 永远为 null。十项全通过意味着六项读取/编辑目标、两项发布/恢复目标达成及两项正确安全停止，不是十次编辑成功。一次小样本不是模型排行榜或稳定成功率保证。缺工具、客户端解析失败、超时与模型执行错误都应结合原始证据分开解释，不能只看汇总分数。

## CI 门禁

`pnpm test:repo` 覆盖判定器的假阳性、统计、范围与 CLI 配置检查；`pnpm pack:check` 在同一 tarball 消费者中运行十个 **reference** 任务，验证真实 MCP 链路、精确编辑、冲突注入和安全拒绝。这些确定性检查已进入 `check:ci`。

真实模型仅手动运行，不在 PR CI 中调用，不创建定时任务，也不自动重试到通过。复现失败请先使用保留归档和同一 CLI/模型，再决定修复产品、宿主还是客户端兼容问题；新运行不删除旧失败记录。
