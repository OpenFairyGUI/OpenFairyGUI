import test from 'ava';
import fs from 'node:fs/promises';
import path from 'node:path';
import { BackendRuntime } from '../src/index.js';

const PUBLISHED_PACKAGES = [
	'packages/backend/package.json',
	'packages/functions/package.json',
	'packages/cli/package.json',
	'packages/mcp/package.json',
	'packages/test-utils/package.json',
] as const;

test('published package metadata does not use workspace protocol dependencies', async (t) => {
	for (const manifestPath of PUBLISHED_PACKAGES) {
		const manifest = JSON.parse(await fs.readFile(path.resolve(manifestPath), 'utf-8')) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
			optionalDependencies?: Record<string, string>;
		};
		for (const dependencySet of [manifest.dependencies, manifest.devDependencies, manifest.optionalDependencies]) {
			for (const [dependencyName, dependencyVersion] of Object.entries(dependencySet ?? {})) {
				t.false(
					dependencyVersion.startsWith('workspace:'),
					`${manifestPath} ${dependencyName} must publish with semver, got ${dependencyVersion}`,
				);
			}
		}
	}
});

test('backend root entry advertises browser-safe project session boundary', (t) => {
	const runtime = new BackendRuntime();
	const result = runtime.getCapabilities();

	t.true(result.data.manifest.browserSafe);
	t.is(result.data.manifest.rootEntrypoint, '@openfairygui/backend');
	t.is(result.data.manifest.nodeEntrypoint, '@openfairygui/backend/node');
	t.is(result.data.manifest.executionBoundaries.projectSession, 'in-process-browser-safe');
	t.is(result.data.manifest.executionBoundaries.artifactPublish.bridgeEntrypoint, '@openfairygui/backend/node');
});

test('root browser-safe barrels do not export NodeIO', async (t) => {
	const coreRoot = await fs.readFile(path.resolve('packages/core/src/index.ts'), 'utf-8');
	const coreIoRoot = await fs.readFile(path.resolve('packages/core/src/io/index.ts'), 'utf-8');

	t.false(coreRoot.includes('NodeIO'));
	t.false(coreIoRoot.includes('NodeIO'));
});
