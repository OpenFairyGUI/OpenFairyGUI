import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: ['src/index.ts', 'src/uam-transaction.ts', 'src/node.ts', 'src/web.ts'],
	format: ['esm', 'cjs'],
	platform: 'neutral',
});
