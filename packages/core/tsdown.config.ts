import { defineConfig } from 'tsdown';

export default defineConfig({
	deps: { alwaysBundle: ['jpeg-js', 'pako'], onlyBundle: false },
});
