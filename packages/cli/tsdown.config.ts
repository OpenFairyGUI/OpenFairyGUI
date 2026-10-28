import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsdown';

const packageVersion = (
	JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
).version;

export default defineConfig({
	entry: ['src/cli.ts'],
	format: ['esm'],
	platform: 'node',
	dts: false,
	deps: { neverBundle: ['sharp', 'jiti'] },
	define: { __OPENFAIRYGUI_PACKAGE_VERSION__: JSON.stringify(packageVersion) },
});
