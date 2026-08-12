import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Document } from '@openfairygui/core';
import type { RootProjectSettings } from '../src/index.js';
import { publishNode } from '../src/node.js';

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

async function writePlugin(
	projectDir: string,
	pluginName: string,
	source: string,
	manifest: Record<string, unknown> = {},
): Promise<void> {
	const pluginDir = path.join(projectDir, 'plugins', pluginName);
	await fs.mkdir(pluginDir, { recursive: true });
	await fs.writeFile(
		path.join(pluginDir, 'package.json'),
		JSON.stringify({
			name: pluginName,
			main: 'index.mjs',
			...manifest,
		}),
		'utf-8',
	);
	await fs.writeFile(path.join(pluginDir, 'index.mjs'), source, 'utf-8');
}

test('publishNode: code generation plugin supports default object export', async (t) => {
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

		await publishNode({
			document: doc,
			output: path.join(tmpDir, 'release'),
		});

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

test('publishNode: code generation plugin supports named genCode export', async (t) => {
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

		await publishNode({
			document: doc,
			output: path.join(tmpDir, 'release'),
			assetsPath: path.join(tmpDir, 'assets'),
		});

		t.is(await fs.readFile(path.join(tmpDir, 'plugin-named.txt'), 'utf-8'), `generated:${tmpDir}:1`);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publishNode: plugin publish hooks run around publish and built-in codegen', async (t) => {
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

		await publishNode({
			document: doc,
			output: path.join(tmpDir, 'release'),
			assetsPath: path.join(tmpDir, 'assets'),
		});

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

test('publishNode: empty plugin does not replace built-in codegen', async (t) => {
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

		await publishNode({
			document: doc,
			output: path.join(tmpDir, 'release'),
			assetsPath: path.join(tmpDir, 'assets'),
		});

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

test('publishNode: derives plugin directory from assets_branch without string replacement', async (t) => {
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

		await publishNode({
			document: doc,
			output: path.join(tmpDir, 'release'),
			assetsPath: path.join(tmpDir, 'assets_branch'),
		});

		t.is(await fs.readFile(path.join(tmpDir, 'plugin-branch.txt'), 'utf-8'), 'generated');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publishNode: non OpenFairyGUI plugins can share the plugins directory without blocking publish', async (t) => {
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

		await publishNode({
			document: doc,
			output: path.join(tmpDir, 'release'),
			assetsPath: path.join(tmpDir, 'assets'),
		});

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

test('publishNode: broken plugin load aborts publish by default', async (t) => {
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

		await t.throwsAsync(
			publishNode({
				document: doc,
				output: path.join(tmpDir, 'release'),
				assetsPath: path.join(tmpDir, 'assets'),
			}),
			{ message: /Failed to load plugin "broken-plugin".*bad plugin/u },
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publishNode: plugin hook failure aborts publish by default', async (t) => {
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

		await t.throwsAsync(
			publishNode({
				document: doc,
				output: path.join(tmpDir, 'release'),
				assetsPath: path.join(tmpDir, 'assets'),
			}),
			{ message: /onPublishStart failed.*start failed/u },
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publishNode: code generation plugin failure aborts publish by default', async (t) => {
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

		await t.throwsAsync(
			publishNode({
				document: doc,
				output: path.join(tmpDir, 'release'),
				assetsPath: path.join(tmpDir, 'assets'),
			}),
			{ message: /Code generation plugin "codegen-failure-plugin" failed.*codegen failed/u },
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('publishNode: failureMode warn explicitly preserves fallback behavior', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-warning-plugin-'));

	try {
		const doc = createCodegenDocument(tmpDir);
		await writePlugin(
			tmpDir,
			'warning-plugin',
			`export function genCode() { throw new Error('optional failure'); }`,
			{ failureMode: 'warn' },
		);

		await publishNode({
			document: doc,
			output: path.join(tmpDir, 'release'),
			assetsPath: path.join(tmpDir, 'assets'),
		});

		t.truthy(await fs.stat(path.join(tmpDir, 'generated', 'DemoPkg', 'UI_Main.cs')));
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});
