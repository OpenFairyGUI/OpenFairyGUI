# Getting Started

OpenFairyGUI targets Node.js and automation workflows. Install the core scripting packages first:

```bash
npm install @openfairygui/core @openfairygui/functions
```

After reading a project, inspect its document model and then publish or write it as needed:

```ts
import { NodeIO } from '@openfairygui/core/node';
import { inspect } from '@openfairygui/functions';

const io = new NodeIO();
const document = await io.readProject('./MyProject/MyProject.fairy');
const report = inspect(document);

console.log(report.projectType, report.totals.packages);
```

## Next steps

- For batch processing and terminal workflows, use [`@openfairygui/cli`](https://www.npmjs.com/package/@openfairygui/cli).
- To expose stateful project sessions to agents or clients, use [`@openfairygui/mcp`](https://www.npmjs.com/package/@openfairygui/mcp).
- For the current boundaries of project handling, publishing, and protocols, open the [documentation index](/en/README).

The project is under active development. Treat the currently published packages and repository documentation as the source of truth.
