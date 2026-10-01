import { defineConfig } from 'tsdown';

const common = {
	platform: 'node' as const,
	deps: {
		neverBundle: ['node:fs', 'node:fs/promises', 'node:path'],
	},
};

const entries = { index: 'src/index.ts', node: 'src/node.ts', docs: 'src/docs.ts' };

export default defineConfig({
	...common,
	format: ['esm', 'cjs'],
	entry: entries,
	outputOptions: {
		// Keep interop helpers out of the Node entry: shared CJS chunks must not
		// acquire a back-edge to node.cjs just to initialize bundler helpers.
		codeSplitting: { groups: [{ name: 'interop', test: /\0rolldown\/runtime\.js/ }] },
	},
});
