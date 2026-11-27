import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsdown';

const packageVersion = (
	JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
).version;

export default defineConfig([
	{
		entry: ['src/index.ts'],
		format: ['esm', 'cjs'],
		platform: 'node',
		define: { __OPENFAIRYGUI_PACKAGE_VERSION__: JSON.stringify(packageVersion) },
	},
	{
		entry: ['src/stdio.ts'],
		format: ['esm', 'cjs'],
		platform: 'node',
		clean: false,
		define: { __OPENFAIRYGUI_PACKAGE_VERSION__: JSON.stringify(packageVersion) },
	},
]);
