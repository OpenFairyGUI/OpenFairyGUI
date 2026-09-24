import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsdown';

const packageVersion = (
	JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
).version;

export default defineConfig({
	deps: { alwaysBundle: ['jpeg-js', 'pako'], onlyBundle: false },
	define: { __OPENFAIRYGUI_PACKAGE_VERSION__: JSON.stringify(packageVersion) },
});
