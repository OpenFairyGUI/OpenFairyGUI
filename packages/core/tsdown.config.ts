import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsdown';

const packageVersion = (
	JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
).version;

export default defineConfig({
	entry: [
		'src/index.ts',
		'src/uam/index.ts',
		'src/project-io.ts',
		'src/node.ts',
		'src/web.ts',
		'src/image-validation-worker.ts',
	],
	format: ['esm', 'cjs'],
	platform: 'neutral',
	deps: {
		alwaysBundle: ['jpeg-js', 'pako'],
		onlyBundle: false,
		neverBundle: ['node:fs', 'node:path', 'node:fs/promises'],
	},
	define: { __OPENFAIRYGUI_PACKAGE_VERSION__: JSON.stringify(packageVersion) },
});
