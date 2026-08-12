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
			const mainPath = resolvePluginMain(path, pluginDir, manifest);
			const plugin = await loadPlugin(mainPath);
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

function resolvePluginMain(path: typeof import('node:path'), pluginDir: string, manifest: PluginManifest): string {
	const mainPath = path.resolve(pluginDir, manifest.main);
	const relative = path.relative(pluginDir, mainPath);
	if (relative.startsWith('..') || path.isAbsolute(relative)) {
		throw new Error(`Codegen plugin "${manifest.name}" main must resolve inside its plugin directory.`);
	}
	return mainPath;
}

async function loadPlugin(mainPath: string): Promise<Plugin> {
	const { createJiti } = await importNative<typeof import('jiti')>('jiti');
	const jiti = createJiti(import.meta.url);
	const mod = await jiti.import<PluginModule>(mainPath);
	const defaultExport = mod.default;
	const plugin = isObject(defaultExport) ? defaultExport : mod;
	return plugin as Plugin;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object';
}
