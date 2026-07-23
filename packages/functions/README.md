# @openfairygui/functions

Composable authoring workflows and thin application seams built on top of `@openfairygui/core`.

## Install

```bash
npm install --save @openfairygui/core @openfairygui/functions
```

## Usage

```ts
import { NodeIO } from '@openfairygui/core/node';
import { inspect } from '@openfairygui/functions';
import { publishNode } from '@openfairygui/functions/node';

const io = new NodeIO();
const doc = await io.readProject('./MyProject/MyProject.fairy');

const report = inspect(doc);
await publishNode({ document: doc, output: './release' });
```

`publishNode` owns the standard Node filesystem, Sharp raster backend, and project plugin discovery. The root `publish()` export remains the lower-level capability-injected core for custom hosts.

## Browser LayaBox publish

Use `@openfairygui/core/web` to read the raw project, then publish through the browser-only entry. Both filesystems are caller-owned, so they can be File System Access, OPFS, IndexedDB, ZIP, or memory adapters.

```ts
import { WebIO } from '@openfairygui/core/web';
import { publishBrowser } from '@openfairygui/functions/web';

const document = await new WebIO(sourceFileSystem).readProject('Project.fairy');
const result = await publishBrowser({
	document,
	sourceFileSystem,
	outputFileSystem,
	projectType: 'layabox',
	output: '.fairygui-runtime',
});

if (!result.success) console.error(result.diagnostics);
```

The browser entry uses native Canvas APIs for atlas PNGs, writes only through `outputFileSystem`, supplies no Node plugin capability, and disables non-runtime code generation.

Publish plugins are documented in the repository guide:

- https://github.com/OpenFairyGUI/OpenFairyGUI/blob/main/docs/publish-plugins.md

## UAM authoring seam

`@openfairygui/functions` also exposes a thin stateless wrapper over the UAM
transaction contract from `@openfairygui/core`.

This seam:

- accepts `UamProject` + `UamTransactionOperation[]`
- returns structured app-level success / failure results
- does not expose `Document`
- does not define a second selector / operation grammar
- does not wrap `publish` or `restore`

The transaction surface includes resource rename/move, byte-backed binary resource
add/replace/remove, and add/update/remove for `display`, `display2`, `look`, `xy`,
`size`, `color`, `animation`, `text`, `icon`, and `fontSize` gears. Resource
rename/move/replace/remove requires `sourceBytes`; opt in with
`ProjectReader.read(path, { hydrateResourceBytes: true })` before lifting a project to
UAM. Source bytes are written back with the project, and stale source files are removed
only after all replacement content succeeds.

```ts
import {
	type UamProject,
	type UamTransactionOperation,
} from '@openfairygui/core';
import { applyUamTransactionApp } from '@openfairygui/functions';

const project: UamProject = /* project read and lifted with hydrateResourceBytes */;
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
