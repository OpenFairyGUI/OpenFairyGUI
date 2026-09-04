# Runnable examples / 可运行示例

These examples use installed public packages, not workspace aliases or test utilities. Copy this directory outside the repository to try the published packages:

这些示例只使用安装后的公开包，不依赖源码别名或测试工具包。将本目录复制到仓库外后运行：

```bash
npm install
node node-inspect-validate/index.mjs
node revision-checked-edit-save/index.mjs
```

With no arguments, each command creates its own small project in the system temporary directory and prints its path. The files are kept so you can inspect them. / 不传参数时，每个命令会新建独立的临时工程并打印路径，保留文件供检查。

- [inspect/validate](./node-inspect-validate/index.mjs): accepts an optional `.fairy` path; reads without modifying it. Exit codes are 0/1/2 for valid/invalid/incomplete.
- [revision-checked edit/save](./revision-checked-edit-save/index.mjs): accepts an optional `.fairy` path and replacement text; **modifies that project**. It expects `Main/MainView/title`, uses IDs from the outline and actual revisions, saves, rereads, and closes the session. An error stops execution; it never retries a stale write blindly.

第二个示例传入路径时会修改该工程；仅用于具有 `Main/MainView/title` 结构的工程副本。默认不传参最安全。

For the current checkout, run `pnpm pack:check` from the repository root. It copies these same files into an isolated consumer, installs the five freshly packed tarballs and checks the results. The examples are not workspace packages or shipped library files.

当前源码的验证命令为仓库根目录的 `pnpm pack:check`：复制这些示例到隔离目录，安装当前五包 tarball 后执行并验证结果。示例不加入 workspace，也不进入库发布包。
