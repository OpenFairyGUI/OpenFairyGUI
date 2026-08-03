import { defineConfig } from 'tsdown';

const common = {
	format: ['esm', 'cjs'] as const,
	platform: 'node' as const,
	deps: {
		neverBundle: ['node:fs', 'node:fs/promises', 'node:path'],
	},
	outputOptions: {
		codeSplitting: false,
	},
};

export default defineConfig([
	{
		...common,
		entry: { index: 'src/index.ts' },
	},
	{
		...common,
		entry: { node: 'src/node.ts' },
		clean: false,
	},
]);
