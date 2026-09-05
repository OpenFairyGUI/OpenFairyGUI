# 可运行示例与消费者验证

三个 Node 示例和一个浏览器存储示例只使用安装后的公开包，不依赖仓库源码别名、`referer/` 或测试工具包。把仓库的 `examples/` 目录复制到仓库外，在复制后的目录执行：

```bash
npm install
node node-inspect-validate/index.mjs
node revision-checked-edit-save/index.mjs
node publish-restore/index.mjs
```

不传参数时会创建独立的临时工程，并在 JSON 输出中给出 `projectPath`；文件保留供检查。前两个示例也可传入 `.fairy` 路径。第二个示例会修改传入的工程，且要求 `Main/MainView/title` 结构，请只对工程副本执行。第三个命令只创建自己的示例，不接受用户目录覆盖；验证当前分支未发布的代码请用下方 `pack:check`，不能把 registry 版本当作当前源码。

## 读取与校验

示例返回现有 `InspectReport` 和工程验证报告。退出码为：`valid` 为 0、`invalid` 为 1、`incomplete` 为 3。以下代码直接引用受消费者检查执行的源文件：

<<< ../../examples/node-inspect-validate/index.mjs {js}

CLI 的对应机器入口是 `ofgui inspect <工程路径> --json` 与 `ofgui validate <工程路径> --json`。它们在统一 envelope 的 `result` 保留原报告，JSON 模式的读取失败也返回同一 envelope；stdout 不混入人类日志。完整结构、退出码及离线 schema 见 [CLI 机器输出](./contracts.md#cli-机器输出)。无 `--json` 时保留终端报告格式。

## 带 revision 的修改、保存与回读

示例从 outline 获取资源 ID，再用 queryEntity 读取当前属性与 revision；将同一批文本修改先预演、再正式 apply，验证当前工程后使用事务返回的 revision 保存，通过公开 Node I/O 重新读取工程，最后释放会话锁。预演不预留 revision。失败或验证不完整直接终止，不盲目重试 stale write。

<<< ../../examples/revision-checked-edit-save/index.mjs {js}

## 发布、读取产物与受限恢复

第三个示例创建两包工程，包含文字、组件、两张图片及跨包引用，通过 `publishNode` 发布，从返回的真实文件清单读取二进制，再将自己生成的可信产物恢复到独立目录，回读并要求完整验证通过。对比包/资源 ID、组件几何与文字、跨包引用；不比较原工程标识、编辑器本地状态或 XML 文本。

<<< ../../examples/publish-restore/index.mjs {js}

`ofgui publish <工程> -o <发布目录> --project-type layabox --json` 返回 `{schemaVersion:1,command:"publish",success:true,result:{files:[{path,size}]}}`；文件清单由 Node 工作流在实际写入后产生，路径是最终绝对路径、size 为字节数，不含未改动旧文件或任意插件私有 I/O。显式运行时输出目录原子提交，不扩大到独立 codegen 路径或插件副作用。

`ofgui restore <可信发布目录> -o <独立工程目录> --json` 返回 `{schemaVersion:1,command:"restore",success:true,result:{projectPath,packages:[{id,name}],warnings}}`。两命令退出 0 表示工作流成功，1 为工作流失败，2 为命令语法错误；错误 JSON 使用 `success:false` 和 `error:{code,message}`，code 为 `publish_failed`、`restore_failed` 或 `invalid_arguments`。JSON 模式的人类日志进入 stderr，stdout 只有一个结果；帮助仍为文本。恢复成功及 warnings 不替代回读验证。

恢复只接受可信本地产物；输出必须为独立目录，默认拒绝覆盖，`--force` 也须等暂存恢复完成才替换旧目录。完整限制见[恢复边界](../published-project-restore-limitations.md)，安装后可离线读 `ofgui docs cat restore-limits --json`。不承诺还原发布物未携带的源码信息。

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
- 运行本页三个示例，检查读操作不写盘、保存后只改变目标文本与对应 XML、无新增无关文件、会话锁释放、stale revision 被拒绝。
- 发布示例额外核对实际 manifest/文件字节长度、二进制组件与跨包引用、图集红蓝 RGBA 像素、恢复后素材与工程验证；损坏图集下强制恢复失败须保留完整旧目录。发布/恢复真实 Agent 任务使用独立受限宿主，见[评测指南](./agent-evaluations.md)。
- 生产运行通过后，再声明并安装锁定版本的 TypeScript、Node 类型、esbuild 和 Playwright，严格编译 `.mts`/`.cts` 消费者，不启用 `skipLibCheck` 或源码 alias；浏览器/Worker 无 Node external 打包后，执行上述真实 Chromium 页面验证。

成功后自动删除检查器创建的临时目录；失败保留现场并打印路径。`pnpm pack:check --keep` 可以保留成功现场。安装需要 registry 和匹配 Chromium 的网络或缓存；浏览器下载失败/启动失败不算通过。Playwright 与 Chromium 安装版本绑定，见 [浏览器安装说明](https://playwright.dev/docs/browsers)。默认不安装系统依赖；Linux CI 显式使用 `--browser-deps` 安装 Chromium 所需系统包（可能需要 sudo），Windows 忽略该系统依赖选项。浏览器缓存位于仓库外，不随消费者临时目录删除。

这些检查证明包入口、类型、最小 Node 工作流及真实 Chromium 存储页面行为，不证明本地目录权限、完整编辑器 UI、所有图片格式或全部发布/恢复格式。项目测试与用户示例分别维护；本页四个示例均纳入消费者验证。

验证入口和 CI 范围见[开发指南](./development.md)，产品入口见[包与工具](./packages.md)。
