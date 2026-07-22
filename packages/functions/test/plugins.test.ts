import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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

function createCodegenDocument(projectDir: string): Document {
	const doc = new Document();
	doc.setProjectDir(projectDir);
	doc.getRoot().setProjectType(0);
	doc.getRoot().setSettings({
		publish: {
			codeGeneration: {
				allowGenCode: true,
				codePath: 'generated',
				codeType: '',
			},
		},
	} as RootProjectSettings);

	const pkg = doc.createPackage('DemoPkg');
	pkg.setId('pkg00001');
	pkg.setGenCode(true);

	const component = doc.createComponent('Main');
	component.setId('cmp00001');
	component.setExported(true);
	const child = doc.createGTextField('content');
	child.setId('n0');
	component.addChild(child);
	pkg.addResource(component);

	return doc;
}

async function writePlugin(projectDir: string, pluginName: string, source: string): Promise<void> {
	const pluginDir = path.join(projectDir, 'plugins', pluginName);
	await fs.mkdir(pluginDir, { recursive: true });
	await fs.writeFile(
		path.join(pluginDir, 'package.json'),
		JSON.stringify({
			name: pluginName,
			main: 'index.mjs',
		}),
		'utf-8',
	);
	await fs.writeFile(path.join(pluginDir, 'index.mjs'), source, 'utf-8');
}

test('publish: code generation plugin supports default object export', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-codegen-plugin-default-'));

	try {
		const doc = createCodegenDocument(tmpDir);
		await writePlugin(
			tmpDir,
			'default-plugin',
			`
export default {
	async genCode(doc, settings, options) {
		await options.fs.writeFileRaw(options.fs.join(doc.getProjectDir(), 'plugin-default.txt'), new TextEncoder().encode('default:' + settings.codePath + ':' + options.packages.length));
	}
};
`,
		);

		await doc.transform(
			publish({
				output: path.join(tmpDir, 'release'),
				basePath: path.join(tmpDir, 'assets'),
				fs: createFs(),
			}),
		);

		t.is(await fs.readFile(path.join(tmpDir, 'plugin-default.txt'), 'utf-8'), 'default:generated:1');
		t.false(
			await fs
				.stat(path.join(tmpDir, 'generated', 'DemoPkg', 'UI_Main.cs'))
				.then(() => true)
				.catch(() => false),
			'plugin codegen replaces built-in codegen',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: code generation plugin supports named genCode export', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-codegen-plugin-named-'));

	try {
		const doc = createCodegenDocument(tmpDir);
		await writePlugin(
			tmpDir,
			'named-plugin',
			`
export async function genCode(doc, settings, options) {
	await options.fs.writeFileRaw(options.fs.join(doc.getProjectDir(), 'plugin-named.txt'), new TextEncoder().encode(settings.codePath + ':' + doc.getProjectDir() + ':' + options.packages.length));
}
`,
		);

		await doc.transform(
			publish({
				output: path.join(tmpDir, 'release'),
				basePath: path.join(tmpDir, 'assets'),
				fs: createFs(),
			}),
		);

		t.is(await fs.readFile(path.join(tmpDir, 'plugin-named.txt'), 'utf-8'), `generated:${tmpDir}:1`);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: plugin publish hooks run around publish and built-in codegen', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-plugin-hooks-'));

	try {
		const doc = createCodegenDocument(tmpDir);
		await writePlugin(
			tmpDir,
			'hooks-plugin',
			`
async function append(options, value) {
	const filePath = options.fs.join(options.basePath, '..', 'hook-order.txt');
	let current = '';
	try {
		current = new TextDecoder().decode(await options.fs.readFileRaw(filePath));
	} catch {}
	await options.fs.writeFileRaw(filePath, new TextEncoder().encode(current + value));
}

export function onPublishStart(doc, options) {
	return append(options, 'start>');
}

export function onPublishEnd(doc, options) {
	return append(options, 'end');
}
`,
		);

		await doc.transform(
			publish({
				output: path.join(tmpDir, 'release'),
				basePath: path.join(tmpDir, 'assets'),
				fs: createFs(),
			}),
		);

		t.is(await fs.readFile(path.join(tmpDir, 'hook-order.txt'), 'utf-8'), 'start>end');
		t.true(
			await fs
				.stat(path.join(tmpDir, 'generated', 'DemoPkg', 'UI_Main.cs'))
				.then(() => true)
				.catch(() => false),
			'plugins without genCode do not replace built-in codegen',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: empty plugin does not replace built-in codegen', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-empty-plugin-'));

	try {
		const doc = createCodegenDocument(tmpDir);
		await writePlugin(
			tmpDir,
			'empty-plugin',
			`
export default {};
`,
		);

		await doc.transform(
			publish({
				output: path.join(tmpDir, 'release'),
				basePath: path.join(tmpDir, 'assets'),
				fs: createFs(),
			}),
		);

		t.true(
			await fs
				.stat(path.join(tmpDir, 'generated', 'DemoPkg', 'UI_Main.cs'))
				.then(() => true)
				.catch(() => false),
			'empty plugins do not replace built-in codegen',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: derives plugin directory from assets_branch basePath without string replacement', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-assets-branch-plugin-'));

	try {
		const doc = createCodegenDocument('');
		await writePlugin(
			tmpDir,
			'branch-plugin',
			`
export async function genCode(doc, settings, options) {
	await options.fs.writeFileRaw(options.fs.join(options.basePath, '..', 'plugin-branch.txt'), new TextEncoder().encode(settings.codePath));
}
`,
		);

		await doc.transform(
			publish({
				output: path.join(tmpDir, 'release'),
				basePath: path.join(tmpDir, 'assets_branch'),
				fs: createFs(),
			}),
		);

		t.is(await fs.readFile(path.join(tmpDir, 'plugin-branch.txt'), 'utf-8'), 'generated');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: non OpenFairyGUI plugins can share the plugins directory without blocking publish', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-mixed-plugins-'));

	try {
		const doc = createCodegenDocument(tmpDir);
		await fs.mkdir(path.join(tmpDir, 'plugins', 'fairygui-editor-plugin'), { recursive: true });
		await fs.writeFile(
			path.join(tmpDir, 'plugins', 'fairygui-editor-plugin', 'package.json'),
			JSON.stringify({
				name: 'fairygui-editor-plugin',
			}),
			'utf-8',
		);

		await doc.transform(
			publish({
				output: path.join(tmpDir, 'release'),
				basePath: path.join(tmpDir, 'assets'),
				fs: createFs(),
			}),
		);

		t.true(
			await fs
				.stat(path.join(tmpDir, 'generated', 'DemoPkg', 'UI_Main.cs'))
				.then(() => true)
				.catch(() => false),
			'non OpenFairyGUI plugin entries are skipped and built-in codegen still runs',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: broken plugin load does not block publish', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-broken-plugin-'));

	try {
		const doc = createCodegenDocument(tmpDir);
		await writePlugin(
			tmpDir,
			'broken-plugin',
			`
throw new Error('bad plugin');
`,
		);

		await doc.transform(
			publish({
				output: path.join(tmpDir, 'release'),
				basePath: path.join(tmpDir, 'assets'),
				fs: createFs(),
			}),
		);

		t.true(
			await fs
				.stat(path.join(tmpDir, 'generated', 'DemoPkg', 'UI_Main.cs'))
				.then(() => true)
				.catch(() => false),
			'broken plugins are skipped and built-in codegen still runs',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: plugin hook failure does not block publish', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-plugin-hook-failure-'));

	try {
		const doc = createCodegenDocument(tmpDir);
		await writePlugin(
			tmpDir,
			'hook-failure-plugin',
			`
export function onPublishStart() {
	throw new Error('start failed');
}

export function onPublishEnd() {
	throw new Error('end failed');
}
`,
		);

		await doc.transform(
			publish({
				output: path.join(tmpDir, 'release'),
				basePath: path.join(tmpDir, 'assets'),
				fs: createFs(),
			}),
		);

		t.true(
			await fs
				.stat(path.join(tmpDir, 'generated', 'DemoPkg', 'UI_Main.cs'))
				.then(() => true)
				.catch(() => false),
			'failing hooks do not stop built-in codegen',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publish: code generation plugin failure falls back to built-in codegen', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-plugin-codegen-failure-'));

	try {
		const doc = createCodegenDocument(tmpDir);
		await writePlugin(
			tmpDir,
			'codegen-failure-plugin',
			`
export function genCode() {
	throw new Error('codegen failed');
}
`,
		);

		await doc.transform(
			publish({
				output: path.join(tmpDir, 'release'),
				basePath: path.join(tmpDir, 'assets'),
				fs: createFs(),
			}),
		);

		t.true(
			await fs
				.stat(path.join(tmpDir, 'generated', 'DemoPkg', 'UI_Main.cs'))
				.then(() => true)
				.catch(() => false),
			'failing codegen plugins do not suppress built-in codegen',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});
