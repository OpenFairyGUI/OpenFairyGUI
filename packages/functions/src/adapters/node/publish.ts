import type { Document } from '@openfairygui/core';
import { resolveProjectBasePath } from '../../codegen.js';
import type { LoadedPlugin } from '../../plugins/types.js';
import type { AtlasRasterBackend, PublishFileSystem } from '../../publish/contracts.js';
import { type PublishOptions, publish } from '../../publish.js';
import { loadPlugins } from './plugins.js';

const importNative = new Function('id', 'return import(id)') as <T>(id: string) => Promise<T>;

interface NodePublishFileSystem extends PublishFileSystem {
	readFileRaw(path: string): Promise<Uint8Array>;
}

export interface PublishNodeOptions extends Omit<PublishOptions, 'atlas' | 'basePath' | 'encoder' | 'fs' | 'plugins'> {
	document: Document;
	/**
	 * Assets directory. Defaults to `<document project dir>/assets` when available.
	 */
	assetsPath?: string;
	/**
	 * Override the standard Sharp raster backend.
	 */
	encoder?: AtlasRasterBackend;
	/**
	 * Supply already-loaded hooks. Pass an empty array to skip project plugin discovery.
	 */
	plugins?: LoadedPlugin[];
	atlas?: Omit<NonNullable<PublishOptions['atlas']>, 'readFileRaw'>;
}

async function createNodePublishFileSystem(): Promise<NodePublishFileSystem> {
	const [fs, path] = await Promise.all([
		importNative<typeof import('node:fs/promises')>('node:fs/promises'),
		importNative<typeof import('node:path')>('node:path'),
	]);

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

async function resolveNodeAssetsPath(document: Document, assetsPath: string | undefined): Promise<string | undefined> {
	if (assetsPath) return assetsPath;
	const projectDir = document.getProjectDir?.() ?? '';
	if (!projectDir) return undefined;
	const path = await importNative<typeof import('node:path')>('node:path');
	return path.join(projectDir, 'assets');
}

async function loadSharpBackend(): Promise<AtlasRasterBackend | undefined> {
	try {
		const loaded = await importNative<typeof import('sharp')>('sharp');
		const sharp = loaded as unknown as { default?: AtlasRasterBackend };
		return sharp.default ?? (loaded as unknown as AtlasRasterBackend);
	} catch {
		return undefined;
	}
}

async function loadNodePublishPlugins(document: Document, assetsPath: string | undefined): Promise<LoadedPlugin[]> {
	const projectDir = document.getProjectDir?.() || (assetsPath ? resolveProjectBasePath(assetsPath) : '');
	if (!projectDir) return [];
	const path = await importNative<typeof import('node:path')>('node:path');
	return loadPlugins(document, path.join(projectDir, 'plugins'));
}

/**
 * Publish a FairyGUI project through the standard Node host adapter.
 *
 * The adapter owns Node filesystem, Sharp, and project plugin discovery.
 * For custom environments, use the lower-level `publish()` core with explicit
 * capabilities instead.
 */
export async function publishNode(options: PublishNodeOptions): Promise<void> {
	const {
		document,
		assetsPath: configuredAssetsPath,
		atlas,
		encoder: configuredEncoder,
		plugins: configuredPlugins,
		...publishOptions
	} = options;
	const [fileSystem, assetsPath] = await Promise.all([
		createNodePublishFileSystem(),
		resolveNodeAssetsPath(document, configuredAssetsPath),
	]);
	const [encoder, plugins] = await Promise.all([
		configuredEncoder === undefined ? loadSharpBackend() : Promise.resolve(configuredEncoder),
		configuredPlugins === undefined
			? loadNodePublishPlugins(document, assetsPath)
			: Promise.resolve(configuredPlugins),
	]);

	if (!encoder) {
		throw new Error('publishNode: Sharp is required for a complete publish. Install sharp or provide an encoder.');
	}

	await document.transform(
		publish({
			...publishOptions,
			basePath: assetsPath,
			encoder,
			atlas: {
				...atlas,
				readFileRaw: fileSystem.readFileRaw,
			},
			fs: fileSystem,
			plugins,
		}),
	);
}
