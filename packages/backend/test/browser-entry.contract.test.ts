import test from 'ava';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { BackendRuntime } from '../src/index.js';

const execFileAsync = promisify(execFile);

const PUBLISHED_PACKAGES = [
	'packages/core/package.json',
	'packages/backend/package.json',
	'packages/functions/package.json',
	'packages/cli/package.json',
	'packages/mcp/package.json',
	'packages/test-utils/package.json',
] as const;

type PackageManifest = {
	name?: string;
	version?: string;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
};

const SEMVER_SPEC = /^[~^]?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'] as const;

async function readPackageManifest(manifestPath: string): Promise<PackageManifest> {
	return JSON.parse(await fs.readFile(path.resolve(manifestPath), 'utf-8')) as PackageManifest;
}

async function readWorkspacePackageVersions(): Promise<Map<string, string>> {
	const versions = new Map<string, string>();
	for (const manifestPath of PUBLISHED_PACKAGES) {
		const manifest = await readPackageManifest(manifestPath);
		if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string') continue;
		versions.set(manifest.name, manifest.version);
	}
	return versions;
}

function resolveWorkspaceDependencyVersion(
	dependencyName: string,
	dependencyVersion: string,
	workspaceVersions: Map<string, string>,
): string {
	if (!dependencyVersion.startsWith('workspace:')) return dependencyVersion;
	const workspaceVersion = workspaceVersions.get(dependencyName);
	if (!workspaceVersion) return dependencyVersion;
	const range = dependencyVersion.slice('workspace:'.length);
	if (range === '' || range === '*') return workspaceVersion;
	if (range === '^' || range === '~') return `${range}${workspaceVersion}`;
	return range;
}

test('workspace package dependencies resolve to semver for published metadata', async (t) => {
	const workspaceVersions = await readWorkspacePackageVersions();
	for (const manifestPath of PUBLISHED_PACKAGES) {
		const manifest = await readPackageManifest(manifestPath);
		for (const field of DEPENDENCY_FIELDS) {
			const dependencySet = manifest[field];
			for (const [dependencyName, dependencyVersion] of Object.entries(dependencySet ?? {})) {
				const publishedVersion = resolveWorkspaceDependencyVersion(dependencyName, dependencyVersion, workspaceVersions);
				t.false(publishedVersion.startsWith('workspace:'), `${manifestPath} ${dependencyName} must publish with semver, got ${dependencyVersion}`);
				if (dependencyVersion.startsWith('workspace:')) {
					t.regex(publishedVersion, SEMVER_SPEC, `${manifestPath} ${dependencyName} resolves to ${publishedVersion}`);
				}
				const workspaceVersion = workspaceVersions.get(dependencyName);
				if (workspaceVersion !== undefined) {
					t.true(
						dependencyVersion.startsWith('workspace:'),
						`${manifestPath} ${field}.${dependencyName} must use workspace protocol instead of a fixed internal version.`,
					);
					t.is(
						publishedVersion,
						workspaceVersion,
						`${manifestPath} ${field}.${dependencyName} must publish as the current workspace package version.`,
					);
				}
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
	t.true(result.data.manifest.adapters.projectStorage.browserSafe);
	t.is(result.data.manifest.adapters.projectStorage.adapterFactory, 'createBackendStorageFileSystem');
	t.true(result.data.manifest.adapters.projectStorage.requiredFor.includes('materializeSession'));
	t.is(result.data.manifest.executionBoundaries.artifactPublish.bridgeEntrypoint, '@openfairygui/backend/node');
});

test('root browser-safe barrels do not export NodeIO', async (t) => {
	const coreRoot = await fs.readFile(path.resolve('packages/core/src/index.ts'), 'utf-8');
	const coreIoRoot = await fs.readFile(path.resolve('packages/core/src/io/index.ts'), 'utf-8');

	t.false(coreRoot.includes('NodeIO'));
	t.false(coreIoRoot.includes('NodeIO'));
});

test.serial('built backend CommonJS root does not load the Node bridge', async (t) => {
	const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
	const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-backend-build-'));
	try {
		await execFileAsync(pnpmCommand, ['--filter', '@openfairygui/backend', 'exec', 'tsdown', '--out-dir', outputDir], {
			cwd: path.resolve('.'),
			shell: process.platform === 'win32',
		});
		const rootPath = path.join(outputDir, 'index.cjs');
		const rootEntry = await fs.readFile(rootPath, 'utf-8');
		const { stderr } = await execFileAsync(process.execPath, ['--trace-warnings', '-e', `require(${JSON.stringify(rootPath)})`]);

		t.false(rootEntry.includes('node:fs'));
		t.is(stderr, '');
	} finally {
		await fs.rm(outputDir, { recursive: true, force: true });
	}
});
