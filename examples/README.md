# Runnable examples / 可运行示例

These examples use installed public packages, not workspace aliases or test utilities. Copy this directory outside the repository to try the published packages:

这些示例只使用安装后的公开包，不依赖源码别名或测试工具包。将本目录复制到仓库外后运行：

```bash
npm install
node node-inspect-validate/index.mjs
node revision-checked-edit-save/index.mjs
node publish-restore/index.mjs
node mcp-stdio-client/index.mjs
```

With no arguments, each command creates its own small project in the system temporary directory and prints its path. The files are kept so you can inspect them. / 不传参数时，每个命令会新建独立的临时工程并打印路径，保留文件供检查。

- [inspect/validate](./node-inspect-validate/index.mjs): accepts an optional `.fairy` path; reads without modifying it. Exit codes are 0/1/3 for valid/invalid/incomplete.
- [revision-checked edit/save](./revision-checked-edit-save/index.mjs): accepts an optional `.fairy` path and replacement text; **modifies that project**. It expects `Main/MainView/title`, uses IDs from the outline and actual revisions, requires valid and complete validation, saves, rereads, and closes the session. An error stops execution; it never retries a stale write blindly. After apply, failures keep the session open and throw an error with `recovery: { runtime, sessionId, projectPath }` and the original `cause`. An importing host must catch it and handle recovery before closing; it can supply its own runtime as the third `editAndSave` argument.

第二个示例传入路径时会修改该工程；仅用于具有 `Main/MainView/title` 结构的工程副本。默认不传参最安全。

提交后的失败通过 `error.recovery` 交回仍然打开的 runtime、sessionId 和工程路径，`cause` 链保留原始错误和验证报告。导入函数的宿主应捕获错误，处理故障后使用同一会话验证、保存，再明确关闭；第三个参数可传入宿主的 runtime。恢复句柄仅在当前进程中有效：独立命令失败退出后不会持久保留内存编辑。/ Recovery handles live only in the current process; the standalone command does not persist in-memory edits after exiting on failure.

- [MCP stdio client](./mcp-stdio-client/index.mjs): uses the official SDK and installed public stdio entry, reads tools/version-bound docs, opens a root-restricted session, queries an exact node and previews without applying/saving. It closes the clean session and transport even on failure. Accepts an optional `.fairy` path with `Main/MainView/title`; otherwise creates a new demo. / 使用正式 SDK 与安装包 stdio 入口，发现工具/版本文档、限定工程根、精确查询和预演；不提交、不保存，失败也关闭干净会话和连接。不传参时新建样例；已有工程需上述结构。

- [publish/limited restore](./publish-restore/index.mjs): creates its own two-package project, publishes components/images/cross-package references, reads actual artifacts and validates a separate recovered project. Only trusted self-produced artifacts are restored; original editor state/XML is not promised. / 创建自己的两包工程，发布组件、图片与跨包引用，读取真实产物，再受限恢复并验证；不覆盖用户目录、不承诺还原原始 XML 或编辑器本地信息。

Unpublished branch changes must be tested with `pack:check`, not assumed present in the registry version. / 未发布分支的新增能力以 `pack:check` 实际打包结果为准，不假设已进入 registry 版本。

For the current checkout, run `pnpm pack:check` from the repository root. It copies these same files into an isolated consumer, installs the five freshly packed tarballs and checks the results. The examples are not workspace packages or shipped library files.

当前源码的验证命令为仓库根目录的 `pnpm pack:check`：复制这些示例到隔离目录，安装当前五包 tarball 后执行并验证结果。示例不加入 workspace，也不进入库发布包。
