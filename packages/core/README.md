# @openfairygui/core

Core SDK for OpenFairyGUI, providing the document model, property graph, project I/O, binary I/O, and publish-restore primitives.

## Install

```bash
npm install --save @openfairygui/core
```

## Usage

```ts
import { NodeIO } from '@openfairygui/core';

const io = new NodeIO();
const doc = await io.readProject('./MyProject/MyProject.fairy');
```

See the repository README for broader examples and workflow guidance:

- https://github.com/OpenFairyGUI/OpenFairyGUI
