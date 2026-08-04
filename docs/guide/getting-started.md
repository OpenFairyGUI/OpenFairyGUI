# 快速开始

OpenFairyGUI 面向 Node.js 与自动化工作流。先安装脚本侧的核心包：

```bash
npm install @openfairygui/core @openfairygui/functions
```

读取工程后，可以检查文档模型，再按需发布或写回：

```ts
import { NodeIO } from '@openfairygui/core/node';
import { inspect } from '@openfairygui/functions';

const io = new NodeIO();
const document = await io.readProject('./MyProject/MyProject.fairy');
const report = inspect(document);

console.log(report.projectType, report.totals.packages);
```

## 接下来

- 需要批处理或在终端中执行操作：使用 [`@openfairygui/cli`](https://www.npmjs.com/package/@openfairygui/cli)。
- 需要把有状态工程会话提供给智能体或客户端：使用 [`@openfairygui/mcp`](https://www.npmjs.com/package/@openfairygui/mcp)。
- 需要理解工程、发布或协议层的正式边界：进入[参考文档](/architecture-overview)。

项目仍处于积极开发阶段；以当前发布包和本仓库文档为准。
