# 真实 Agent 任务评测

评测观察安装后的产品能否被 Agent 正确使用，不按指定工具顺序打分，也不把随机模型表现作为每个 PR 的门禁。任务定义在 [tasks.json](../../agent/evals/tasks.json)，入口是 `pnpm eval:agent`。

## 首批任务

| ID | 用户目标 | 确定性验收 |
|---|---|---|
| `inspect-validate` | 只读检查工程并报告包数、资源数、验证状态 | 实际验证调用成功，事实正确，完整工程语义和文件字节均不变 |
| `rename-save` | 将 `Main/MainView` 改名为 `RenamedView` 并保存 | 真实保存成功；重新读取后的差异仅为名称及对应文件重命名；ID、内容和无关文件不变 |
| `stale-revision-recovery` | 完成相同重命名并保留并发编辑 | 第一次有效提交前，宿主通过正式 Backend 另行修改并保存 title；原提交实际返回 `stale_write`，最终工程同时保留并发文字和重命名 |

fixture 复用公开可运行示例，只包含一个文本组件。宿主不伪造冲突响应，不自动代替模型保存。预演、文档阅读次数和重复提交属于观察项，不是强制调用顺序；最终工程、真实验证/保存证据和隔离检查才决定通过。

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

- 共用 `pack:check` 的五包打包/生产依赖安装流程：临时目录在仓库外，不安装 workspace、tsx、TypeScript 或 test-utils，不提供仓库源码。模型工作目录是独立空目录，题目只提供工程路径和安装文档入口。
- 使用安装包的正式 MCP 服务、契约、Backend 和 Node 文件系统。宿主仅开放十个 session 查询/编辑方法，以及正式资源文档；不开放虚拟工程创建、materialize、发布或任意文件命令。
- 忽略用户 CLI 配置、规则、AGENTS 和本机 Skill 发现，关闭 shell、原生执行、浏览器、外部应用、插件、记忆和多 Agent 工具。仅自动批准当前受限 MCP 宿主的工具。保留 Code Mode 宿主供模型编排已开放的 MCP 工具；它不是 Node shell。只读 sandbox 是附加限制，不替代 MCP 宿主边界。
- Backend 文件系统包装对真实路径做范围检查，包含 staging 回调；只允许当前案例的 `workspace`。正常保存可以在该目录内创建临时 staging/backup。额外保留工程内、工程外两份无关文件，最终对整个 workspace 做字节比较。越界尝试会记为失败，不仅检查是否留下文件。
- 判定器独立重读工程、执行 Node 验证，并比对完整 UAM 与预期文件集合。预期 UAM 直接按任务修改，不调用被测的 rename transaction 来生成答案。最终回复只参与检查任务的事实答案，不作为保存成功的依据。
- MCP 宿主退出只释放自己的锁，不保存未提交工作。客户端强行结束 stdio 后，通过正式 Backend 锁 API 恢复死进程锁；仍存活的锁持有者会让该次验证失败。

这是受控产品任务评测，不是恶意模型的操作系统级逃逸测试；Codex 自身的登录/日志写入不属于工程写入计分范围。首次任务不覆盖图片、复杂组件、发布、浏览器交互或第三方 Agent 客户端的全部行为。安装包的 CLI 与 ESM/CJS/browser 检查继续由 `pack:check` 覆盖。

## 记录与复现

每次 `pnpm eval:agent` 均创建新目录，不覆盖旧评测。成功和失败均保留现场，终端打印绝对路径（`pack:check` 内的 reference 自测仍遵循消费者检查自身的清理/`--keep` 规则）：

- `artifacts/`：实际使用的五包 tarball，包括从 `--artifacts` 输入复制的归档。
- `evaluations/report.json`：包版本、文档/契约摘要、tarball SHA-256、Git HEAD、评测脚本/任务 SHA-256、消费者锁文件摘要、Node/平台、逐项硬检查和汇总。未提交脚本用摘要识别，不能仅依赖 HEAD。
- 每个任务的 `case.json`、`prompt.txt`、`runner.json`、`agent.jsonl`、`agent.stderr.txt`、`mcp.jsonl` 和 `final.json`：题目、实际 CLI 参数/版本、模型事件、完整 MCP 请求响应、注入/范围检查证据与最终回答；reference 没有模型专属文件。
- `before.json`、`expected.json`、`actual.json`、`result.json` 和 `workspace/`：原始/预期/实际 UAM、base64 文件快照、各项结果和最终工程。宿主或模型失败时也保存已经取得的证据。

观察项包括耗时（不含构建安装和最终判定）、完成的工具调用数、失败调用数（包括预期的 stale 拒绝）、文档 URI、预演次数、完全相同 apply 参数的重试次数、成功提交相同 operations 的次数以及 CLI 返回的 token usage。对象字段顺序不影响重复计数。宿主 `failedCalls` 包含 MCP 协议/工具错误；`clientToolCalls` / `clientFailedCalls` 另外记录客户端层的发现、批准拒绝等调用，不相加计算。模型服务错误在 runner 结果和 stderr 中记录，客户端跳过工具的告警另列为 `clientWarnings`。

消费者的 `app/pnpm-lock.yaml` 也保留在现场。重跑同一 tarball 仍可能解析到新的传递依赖，比较结果时须核对消费者锁文件和 Node/CLI 版本；需要字节级重现安装环境时使用保留现场的锁文件与 frozen 安装，而不是仅比较 tarball 版本号。

`modelSuccessRate` 只在 `codex` 运行中计算；`reference` 永远为 null。一次三个小任务的结果不是模型排行榜或稳定成功率保证。缺工具、客户端解析失败、超时与模型执行错误都应结合原始证据分开解释，不能只看汇总分数。

## CI 门禁

`pnpm test:repo` 覆盖判定器的假阳性、统计、范围与 CLI 配置检查；`pnpm pack:check` 在同一 tarball 消费者中运行三个 **reference** 任务，验证真实 MCP 链路和冲突注入。这些确定性检查已进入 `check:ci`。

真实模型仅手动运行，不在 PR CI 中调用，不创建定时任务，也不自动重试到通过。复现失败请先使用保留归档和同一 CLI/模型，再决定修复产品、宿主还是客户端兼容问题；新运行不删除旧失败记录。

## 首轮实测记录

[2026-09-04 记录](../../agent/evals/baseline-2026-09-04.json)：Windows x64、Node 24.20.0、五包 0.3.1、Codex CLI 0.153.2、`gpt-5.6-sol`。这是一轮修正评测配置后的完整运行，前期配置调试失败现场单独保留，不合并计数。

| 任务 | 真实模型结果 | 耗时 | 宿主工具调用 / 文档读取 / 预演 |
|---|---|---|---|
| inspect/validate | 通过 | 29.622 秒 | 3 / 1 / 0 |
| rename/save | 未通过：客户端跳过编辑工具 | 49.570 秒 | 4 / 2 / 0 |
| stale recovery | 未到达冲突执行：客户端跳过编辑工具 | 57.397 秒 | 6 / 4 / 0 |

原始 stderr 显示 Codex 转换 apply/preflight 的 MCP schema 时报告 `invalid type: map, expected a string`，并跳过工具。宿主 `tools/list` 中确实包含这两个正式工具；不能据模型“host 未提供”的表述认定产品根本没有该方法。该失败记录原样保留，后续定位与修复验证见下节。

三份工程均经独立比较确认没有改动、没有越界；模型没有假报保存成功。模型任务完成率是 1/3，但不能据此判断其重命名或冲突恢复能力。确定性 reference 在 Node 20/24 的真实 MCP 消费者中均为 3/3，已实际覆盖重命名、保存、并发注入和 stale 拒绝。此差异正是单元/消费者测试之外需要真实 Agent 评测的接入证据。

## 修复后验证

[2026-09-04 修复验证记录](../../agent/evals/verification-2026-09-04.json)使用同一 CLI、模型、任务提示和验收条件，重新打包并安装到全新现场；首轮完整运行通过 3/3。产品代码修复仅涉及契约生成器及对应生成物，不修改任务、判定器或模型权限，也不升级客户端。

最小复现确认，Codex CLI 0.153.2 会拒绝 draft-7 的位置元组 `items: [{ type: 'number' }, ...]`，从而丢弃包含它的整个工具。生成器现在把同类型定长元组表示为单一 `items` 加相等的 `minItems` / `maxItems`；合法输入集合不变，不放宽长度、元素类型、revision 或保存校验。真实 `tools/list` 回归测试覆盖全部工具输入，以及 apply/preflight 中四数值元组的合法、错误长度和错误类型输入。

| 任务 | 真实模型结果 | 耗时 | 宿主工具调用 / 文档读取 / 预演 |
|---|---|---|---|
| inspect/validate | 通过 | 48.122 秒 | 4 / 2 / 0 |
| rename/save | 通过 | 61.369 秒 | 7 / 3 / 1 |
| stale recovery | 通过，实际触发一次 `stale_write` | 71.043 秒 | 15 / 3 / 2 |

两个编辑任务均真实保存，完整工程和文件字节符合预期；冲突任务从 revision 0 的拒绝中恢复，重新查询、预演并提交到 revision 2，保留 `Title edited concurrently`。没有客户端跳过工具警告、越界访问或重复成功提交。记录中的一次失败调用是预期的真实冲突拒绝，保留在失败计数中。

Node 24 的 `check:ci` 通过（522 项 AVA、24 项仓库自测及文档/安装包检查）；Node 20.20.2 使用这轮同一组五包 tarball 的 `pack:check` 也通过，均包含 3/3 确定性 reference 任务。包版本仍为开发分支的 0.3.1，精确修复状态以记录中的源文件、归档和契约摘要为准；这不是已发布版本声明，也不是长期模型成功率保证。
