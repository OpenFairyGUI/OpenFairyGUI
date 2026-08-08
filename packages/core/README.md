# @openfairygui/core

Core SDK for OpenFairyGUI, providing the document model, property graph, project I/O, and binary I/O.

## Install

```bash
npm install --save @openfairygui/core
```

## Usage

Browser-safe root entry:

```ts
import { Document } from '@openfairygui/core';
```

Node project I/O:

```ts
import { NodeIO } from '@openfairygui/core/node';

const io = new NodeIO();
const doc = await io.readProject('./MyProject/MyProject.fairy');
```

Use `readProjectDetailed(..., { hydrateResourceBytes: true })` when a caller must retain parse, skipped-file, and source-read diagnostics instead of failing or silently omitting partial content.

Browser project I/O:

```ts
import { WebIO } from '@openfairygui/core/web';

const io = new WebIO({ root: projectDirectoryHandle });
const doc = await io.readProject('Project.fairy');
```

Shared project I/O types without platform adapters:

```ts
import { ProjectReader, ProjectWriter, type FileSystem } from '@openfairygui/core/project-io';
```

`@openfairygui/core/web` only reads and writes FairyGUI project trees. Publishing, restoring, and Node filesystem defaults stay outside the browser entrypoint.

See the repository README for broader examples and workflow guidance:

- https://github.com/OpenFairyGUI/OpenFairyGUI
