# Test utilities

先读[根指引](../../AGENTS.md)。下面路径与命令均相对仓库根目录。

- 公共测试构造器在 `packages/test-utils/src/index.ts`。优先复用最小 UAM/字节构造器，再补与任务相关的真实 fixture。
- fixture 来源见 `references.json`。子模块 URL 以 `.gitmodules` 为准，版本以 Git gitlink 为准；不要使用 `git submodule update --remote`。
- `pnpm refs:verify` 必须拒绝缺失、错误提交、修改过或不完整的上游 fixture。需要调整 fixture 版本时单独审查 gitlink 变化。
- 不向上游子模块写生成结果。测试在自有临时目录中输出并清理，不修改真实输入工程。
- 不把可选 referer 资料变成普通测试的隐式依赖；真正需要但未提供的协议证据应明确阻塞。
- 这里的改动影响所有包；运行 `pnpm check:ci`。
