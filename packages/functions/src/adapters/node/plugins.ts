import type { Document } from '@openfairygui/core';
import {
	formatPluginError,
	type LoadedPlugin,
	type Plugin,
	type PluginManifest,
	type PluginModule,
} from '../../plugins/types.js';

interface PluginPackageJson extends Partial<PluginManifest> {}

// Keep Node builtins out of the neutral bundle resolver while still loading plugins in Node.
const importNative = new Function('id', 'return import(id)') as <T>(id: string) => Promise<T>;

export async function loadPlugins(doc: Document, pluginsDir: string): Promise<LoadedPlugin[]> {
	if (!pluginsDir) return [];

	const fs = await importNative<typeof import('node:fs/promises')>('node:fs/promises');
	const path = await importNative<typeof import('node:path')>('node:path');
	let entries: Array<{ name: string; isDirectory(): boolean }>;
	try {
		entries = await fs.readdir(pluginsDir, { withFileTypes: true });
	} catch {
		return [];
	}

	let canonicalPluginsDir: string;
	try {
		canonicalPluginsDir = await fs.realpath(pluginsDir);
	} catch {
		return [];
	}

	const plugins: LoadedPlugin[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const pluginDir = path.join(pluginsDir, entry.name);
		let manifest: PluginManifest | null;
		try {
			manifest = await readPluginManifest(fs, path, pluginDir);
		} catch (error) {
			doc.getLogger().warn(`publish: Plugin "${entry.name}" was skipped: ${formatPluginError(error)}`);
			continue;
		}
		if (!manifest) continue;
		if (!manifest.main) {
			const error = new Error(`Codegen plugin "${manifest.name}" is missing package.json main.`);
			if (manifest.required) throw error;
			doc.getLogger().warn(`publish: Plugin "${manifest.name}" was skipped: ${error.message}`);
			continue;
		}

		try {
			const mainPath = await resolvePluginMain(fs, path, canonicalPluginsDir, pluginDir, manifest);
			const plugin = await loadPlugin(mainPath, manifest.name);
			plugins.push({
				name: manifest.name,
				plugin,
				failureMode: manifest.required ? 'abort' : manifest.failureMode,
			});
		} catch (error) {
			if (!manifest.required && manifest.failureMode === 'warn') {
				doc.getLogger().warn(`publish: Plugin "${manifest.name}" was skipped: ${formatPluginError(error)}`);
				continue;
			}
			throw new Error(`publish: Failed to load plugin "${manifest.name}": ${formatPluginError(error)}`);
		}
	}

	return plugins;
}

async function readPluginManifest(
	fs: typeof import('node:fs/promises'),
	path: typeof import('node:path'),
	pluginDir: string,
): Promise<PluginManifest | null> {
	const manifestPath = path.join(pluginDir, 'package.json');
	const content = await fs.readFile(manifestPath, 'utf-8');
	const manifest = JSON.parse(content) as PluginPackageJson;
	if (!manifest.name) throw new Error(`Codegen plugin at ${pluginDir} is missing package.json name.`);
	return manifest as PluginManifest;
}

function isSubpath(path: typeof import('node:path'), baseDir: string, targetPath: string): boolean {
	const relative = path.relative(baseDir, targetPath);
	return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function resolvePluginMain(
	fs: typeof import('node:fs/promises'),
	path: typeof import('node:path'),
	canonicalPluginsDir: string,
	pluginDir: string,
	manifest: PluginManifest,
): Promise<string> {
	const mainPath = path.resolve(pluginDir, manifest.main);
	if (!isSubpath(path, pluginDir, mainPath)) {
		throw new Error(`Codegen plugin "${manifest.name}" main must resolve inside its plugin directory.`);
	}
	const canonicalPluginDir = await fs.realpath(pluginDir);
	if (!isSubpath(path, canonicalPluginsDir, canonicalPluginDir)) {
		throw new Error(`Codegen plugin "${manifest.name}" directory escapes the plugins root via symbolic link.`);
	}
	const canonicalMainPath = await fs.realpath(mainPath);
	if (!isSubpath(path, canonicalPluginDir, canonicalMainPath)) {
		throw new Error(`Codegen plugin "${manifest.name}" main escapes its plugin directory via symbolic link.`);
	}
	return canonicalMainPath;
}

let cachedJitiPromise: Promise<ReturnType<typeof import('jiti').createJiti>> | undefined;

async function getJiti(): Promise<ReturnType<typeof import('jiti').createJiti>> {
	return (cachedJitiPromise ??= importNative<typeof import('jiti')>('jiti').then(({ createJiti }) =>
		createJiti(import.meta.url),
	));
}

async function loadPlugin(mainPath: string, pluginName: string): Promise<Plugin> {
	const jiti = await getJiti();
	const mod = await jiti.import<PluginModule>(mainPath);
	const defaultExport = mod.default;
	const candidate = isObject(defaultExport) ? defaultExport : mod;
	for (const hookName of ['onPublishStart', 'onPublishEnd', 'genCode'] as const) {
		const hook = candidate[hookName];
		if (hook !== undefined && typeof hook !== 'function') {
			throw new Error(`Codegen plugin "${pluginName}" exports non-function "${hookName}" hook.`);
		}
	}
	return candidate as Plugin;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object';
}
