import test from 'ava';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { Document } from '@openfairygui/core';
import { publish, type RootProjectSettings } from '../src/index.js';

function createFs() {
	return {
		async readFileRaw(filePath: string): Promise<Uint8Array> {
			const data = await fs.readFile(filePath);
			return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
		},
		async writeFileRaw(filePath: string, data: Uint8Array): Promise<void> {
			await fs.mkdir(path.dirname(filePath), { recursive: true });
			await fs.writeFile(filePath, data);
		},
		async mkdir(dirPath: string): Promise<void> {
			await fs.mkdir(dirPath, { recursive: true });
		},
		async readdir(dirPath: string): Promise<string[]> {
			return fs.readdir(dirPath);
		},
		async deleteFile(filePath: string): Promise<void> {
			await fs.rm(filePath, { force: true });
		},
		join(...paths: string[]): string {
			return path.join(...paths);
		},
	};
}

test('publish expands built-in and custom variables in global, package and branch paths', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-path-vars-'));
	t.teardown(() => fs.rm(tmpDir, { recursive: true, force: true }));
	for (const scope of ['global', 'package', 'branch-global', 'branch-package', 'override']) {
		const doc = new Document();
		const branch = scope.startsWith('branch');
		doc.getRoot().setProjectType(7).setSettings({
			customProperties: { channel: 'test-$&', number: 7 },
			publish: { path: '{channel}/{publish_file_name}/{number}', branchPath: 'branch/{channel}/{publish_file_name}', branchProcessing: branch ? 1 : 0 },
		});
		const pkg = doc.createPackage('Main').setId('pathpkg1').setPublishName('Renamed');
		if (scope === 'package') pkg.setPublishPath('package/{channel}/{publish_file_name}');
		if (scope === 'branch-package') pkg.setPublishBranchPath('package-branch/{channel}/{publish_file_name}/{unknown}');
		const output = scope === 'override' ? path.join(tmpDir, scope, '{channel}') : undefined;
		await doc.transform(publish({ fs: createFs(), basePath: path.join(tmpDir, scope, 'assets'), branch: branch ? 'en' : undefined, output }));
		const expected = scope === 'global' ? 'test-$&/Renamed/7' : scope === 'package' ? 'package/test-$&/Renamed'
			: scope === 'branch-global' ? 'branch/test-$&/Renamed' : scope === 'branch-package' ? 'package-branch/test-$&/Renamed/{unknown}' : '{channel}';
		t.truthy(await fs.stat(path.join(tmpDir, scope, expected, 'Renamed.fui')));
	}
});

test('publish: uses global publish.path when output override is omitted', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(7);
	doc.getRoot().setSettings({
		publish: {
			path: 'release',
		},
	} as RootProjectSettings);
	const pkg = doc.createPackage('PkgA');
	pkg.setId('pkga001');

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-global-output-'));
	const basePath = path.join(tmpDir, 'assets');

	try {
		await fs.mkdir(basePath, { recursive: true });
		await doc.transform(publish({
			basePath,
			fs: createFs(),
		}));

		const stat = await fs.stat(path.join(tmpDir, 'release', 'PkgA.fui')).catch(() => null);
		t.truthy(stat, 'publish.path drives the binary output directory when --output is omitted');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: resolves global publish.path from the document project directory without basePath', async (t) => {
	const doc = new Document();
	doc.setProjectDir('');
	doc.getRoot().setProjectType(7);
	doc.getRoot().setSettings({
		publish: {
			path: 'release',
		},
	} as RootProjectSettings);
	const pkg = doc.createPackage('PkgA');
	pkg.setId('pkga001');

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-project-dir-output-'));
	doc.setProjectDir(tmpDir);
	const baseFs = createFs();
	const absoluteFs = {
		...baseFs,
		async mkdir(dirPath: string): Promise<void> {
			if (!path.isAbsolute(dirPath)) throw new Error('publish output must be absolute: ' + dirPath);
			await baseFs.mkdir(dirPath);
		},
		async writeFileRaw(filePath: string, data: Uint8Array): Promise<void> {
			if (!path.isAbsolute(filePath)) throw new Error('publish output must be absolute: ' + filePath);
			await baseFs.writeFileRaw(filePath, data);
		},
	};

	try {
		await doc.transform(publish({
			fs: absoluteFs,
		}));

		t.truthy(
			await fs.stat(path.join(tmpDir, 'release', 'PkgA.fui')).catch(() => null),
			'document project directory anchors a relative global publish.path',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: package publishPath overrides global publish.path', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(7);
	doc.getRoot().setSettings({
		publish: {
			path: 'release',
		},
	} as RootProjectSettings);
	const pkgA = doc.createPackage('PkgA');
	pkgA.setId('pkga001');
	pkgA.setPublishPath('pkg-a-release');
	const pkgB = doc.createPackage('PkgB');
	pkgB.setId('pkgb001');

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-package-output-'));
	const basePath = path.join(tmpDir, 'assets');

	try {
		await fs.mkdir(basePath, { recursive: true });
		await doc.transform(publish({
			basePath,
			fs: createFs(),
		}));

		t.truthy(await fs.stat(path.join(tmpDir, 'pkg-a-release', 'PkgA.fui')).catch(() => null), 'package publishPath wins');
		t.truthy(await fs.stat(path.join(tmpDir, 'release', 'PkgB.fui')).catch(() => null), 'global publish.path remains the fallback');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: package publishBranchPath overrides global branchPath for active branch publishes', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(7);
	doc.getRoot().setSettings({
		publish: {
			path: 'release',
			branchPath: 'branches',
			branchProcessing: 1,
		},
	} as RootProjectSettings);
	const pkg = doc.createPackage('PkgA');
	pkg.setId('pkga001');
	pkg.setPublishBranchPath('pkg-branch-release');

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-branch-output-'));
	const basePath = path.join(tmpDir, 'assets');

	try {
		await fs.mkdir(basePath, { recursive: true });
		await doc.transform(publish({
			basePath,
			branch: 'dev',
			fs: createFs(),
		}));

		t.truthy(
			await fs.stat(path.join(tmpDir, 'pkg-branch-release', 'PkgA.fui')).catch(() => null),
			'package publishBranchPath wins for active branch output',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: output override wins over project and package publish paths', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectType(7);
	doc.getRoot().setSettings({
		publish: {
			path: 'release',
		},
	} as RootProjectSettings);
	const pkgA = doc.createPackage('PkgA');
	pkgA.setId('pkga001');
	pkgA.setPublishPath('pkg-a-release');
	const pkgB = doc.createPackage('PkgB');
	pkgB.setId('pkgb001');

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-pub-output-override-'));
	const basePath = path.join(tmpDir, 'assets');
	const overrideOutput = path.join(tmpDir, 'override-release');

	try {
		await fs.mkdir(basePath, { recursive: true });
		await doc.transform(publish({
			output: overrideOutput,
			basePath,
			fs: createFs(),
		}));

		t.truthy(await fs.stat(path.join(overrideOutput, 'PkgA.fui')).catch(() => null), 'override output is used for package override paths');
		t.truthy(await fs.stat(path.join(overrideOutput, 'PkgB.fui')).catch(() => null), 'override output is used for global paths too');
		t.falsy(await fs.stat(path.join(tmpDir, 'pkg-a-release', 'PkgA.fui')).catch(() => null), 'package publishPath is ignored when override output is set');
		t.falsy(await fs.stat(path.join(tmpDir, 'release', 'PkgB.fui')).catch(() => null), 'global publish.path is ignored when override output is set');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});
