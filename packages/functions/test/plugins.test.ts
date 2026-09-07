import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Document } from '@openfairygui/core';
import type { RootProjectSettings } from '../src/index.js';
import { publishNode } from '../src/node.js';
import sharp from 'sharp';

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

test('publishNode returns actual final writes across direct, paged, alpha and generated-code outputs', async (t) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-publish-manifest-'));
	try {
		for (const [index, [count, alpha]] of [[1, false], [2, false], [2, true]].entries()) {
			const projectDir = path.join(root, String(index));
			const doc = createCodegenDocument(projectDir);
			const pkg = doc.getRoot().listPackages()[0]!;
			const source = path.join(projectDir, 'assets', pkg.getName());
			await fs.mkdir(source, { recursive: true });
			for (let image = 0; image < Number(count); image++) {
				const name = `image${image}.png`;
				pkg.addResource(doc.createImageResource(name).setId(`img${image}`).setFileName(name).setPath('/').setWidth(2).setHeight(2).setExported(true));
				await sharp({ create: { width: 2, height: 2, channels: 4, background: '#ff000080' } }).png().toFile(path.join(source, name));
			}
			const output = path.join(projectDir, 'release');
			await fs.mkdir(output); await fs.writeFile(path.join(output, 'untouched.txt'), 'keep');
			const result = await publishNode({ document: doc, output, plugins: [], atlas: { extractAlpha: Boolean(alpha), trimImage: false } });
			t.false(result.files.some((file) => file.path.includes('.publish-') || file.path.endsWith('untouched.txt')));
			t.true(result.files.some((file) => file.path.endsWith('_fui.bytes')));
			t.true(result.files.some((file) => file.path.endsWith('.cs')));
			t.is(result.files.filter((file) => file.path.endsWith('.png')).length, alpha ? 2 : 1);
			for (const file of result.files) t.is((await fs.stat(file.path)).size, file.size);
			t.deepEqual((await fs.readdir(output)).filter((name) => name !== 'untouched.txt').sort(), result.files.filter((file) => path.dirname(file.path) === output).map((file) => path.basename(file.path)).sort());
		}
		const doc = createCodegenDocument(root);
		doc.getRoot().listPackages()[0]!.setPublishPath('configured-release');
		const result = await publishNode({ document: doc, plugins: [], codeGeneration: false });
		t.deepEqual(result.files.map((file) => file.path), [path.join(root, 'configured-release', 'DemoPkg_fui.bytes')]);
	} finally { await fs.rm(root, { recursive: true, force: true }); }
});

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

test('publishNode: onPublishEnd failure preserves the previous explicit output', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-plugin-end-failure-'));
	const output = path.join(tmpDir, 'release');

	try {
		const doc = createCodegenDocument(tmpDir);
		await fs.mkdir(output);
		await fs.writeFile(path.join(output, 'previous.txt'), 'previous', 'utf-8');
		await writePlugin(
			tmpDir,
			'end-failure-plugin',
			`export function onPublishEnd() { throw new Error('end failed'); }`,
		);

		await t.throwsAsync(
			publishNode({
				document: doc,
				output,
				assetsPath: path.join(tmpDir, 'assets'),
				codeGeneration: false,
			}),
			{ message: /onPublishEnd failed.*end failed/u },
		);

		t.is(await fs.readFile(path.join(output, 'previous.txt'), 'utf-8'), 'previous');
		t.false(await fs.stat(path.join(output, 'DemoPkg_fui.bytes')).then(() => true).catch(() => false));
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
