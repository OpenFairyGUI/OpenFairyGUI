# @openfairygui/functions

Composable authoring workflows and thin application seams built on top of `@openfairygui/core`.

## Install

```bash
npm install --save @openfairygui/core @openfairygui/functions
```

## Usage

```ts
import { NodeIO } from '@openfairygui/core';
import { inspect, publish } from '@openfairygui/functions';

const io = new NodeIO();
const doc = await io.readProject('./MyProject/MyProject.fairy');

const report = inspect(doc);
await doc.transform(publish({ output: './release' }));
```

Publish plugins are documented in the repository guide:

- https://github.com/OpenFairyGUI/OpenFairyGUI/blob/main/docs/publish-plugins.md

## Phase A UAM authoring seam

`@openfairygui/functions` also exposes a thin stateless wrapper over the Phase A UAM
transaction contract from `@openfairygui/core`.

This seam:

- accepts `UamProject` + `UamTransactionOperation[]`
- returns structured app-level success / failure results
- does not expose `Document`
- does not define a second selector / operation grammar
- does not wrap `publish` or `restore`

```ts
import {
	type UamProject,
	type UamTransactionOperation,
} from '@openfairygui/core';
import { applyUamTransactionApp } from '@openfairygui/functions';

const project: UamProject = /* ... */;
const operations: UamTransactionOperation[] = [
	{
		kind: 'renameResource',
		selector: { packageId: 'pkg001', resourceId: 'img001' },
		newName: 'renamed.png',
	},
];

const result = applyUamTransactionApp({ project, operations });
if (!result.ok) {
	console.error(result.error.code, result.error.stage, result.error.message);
}
```

Repository:

- https://github.com/OpenFairyGUI/OpenFairyGUI
