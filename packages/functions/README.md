# @openfairygui/functions

Composable authoring and publish functions built on top of `@openfairygui/core`.

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

Repository:

- https://github.com/OpenFairyGUI/OpenFairyGUI
