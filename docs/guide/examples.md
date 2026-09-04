# 可运行示例与消费者验证

两个示例只使用安装后的公开包，不依赖仓库源码别名、`referer/` 或测试工具包。把仓库的 `examples/` 目录复制到仓库外，在复制后的目录执行：

```bash
npm install
node node-inspect-validate/index.mjs
node revision-checked-edit-save/index.mjs
```

不传参数时会创建独立的临时工程，并在 JSON 输出中给出 `projectPath`；文件保留供检查。也可以传入 `.fairy` 路径。第二个示例会修改传入的工程，且要求 `Main/MainView/title` 结构，请只对工程副本执行。

## 读取与校验

示例返回现有 `InspectReport` 和工程验证报告。退出码沿用验证契约：`valid` 为 0、`invalid` 为 1、`incomplete` 为 2。以下代码直接引用受消费者检查执行的源文件：

<<< ../../examples/node-inspect-validate/index.mjs {js}

CLI 的对应机器入口是 `ofgui inspect <工程路径> --json` 与 `ofgui validate <工程路径> --json`。`inspect --json` 直接输出 `inspect()` 的报告，不附加人类日志；读取失败时非零退出并向 stderr 报错。无 `--json` 时保留终端报告格式。

## 带 revision 的修改、保存与回读

示例从 outline 获取资源 ID 和 revision，修改一个文本节点，使用事务返回的 revision 保存，再通过公开 Node I/O 重新读取工程，最后释放会话锁。失败直接终止，不盲目重试 stale write。

<<< ../../examples/revision-checked-edit-save/index.mjs {js}

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
- 运行本页两个示例，检查读操作不写盘、保存后只改变目标文本与对应 XML、无新增无关文件、会话锁释放、stale revision 被拒绝。
- 生产运行通过后，再声明并安装锁定版本的 TypeScript、Node 类型和 esbuild 工具，严格编译 `.mts`/`.cts` 消费者，不启用 `skipLibCheck` 或源码 alias；对浏览器与 Worker 入口执行无 Node external 的打包。

成功后自动删除检查器创建的临时目录；失败保留现场并打印路径。`pnpm pack:check --keep` 可以保留成功现场。安装需要 registry 网络或本机依赖缓存；下载失败不算消费者验证成功。

这些检查证明包入口、类型、最小工作流和浏览器可打包性，不证明浏览器目录授权、真实 UI、图片解码的所有宿主差异或全部发布/恢复格式。项目测试与用户示例分别维护；只有本页引用的两个示例纳入这项文档代码验证。

验证入口和 CI 范围见[开发指南](./development.md)，产品入口见[包与工具](./packages.md)。
