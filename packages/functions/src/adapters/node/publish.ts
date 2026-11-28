import { type Document, validateSafeSvgSource } from '@openfairygui/core';
import { resolveProjectBasePath } from '../../codegen.js';
import type { LoadedPlugin } from '../../plugins/types.js';
import type {
	AtlasRasterBackend,
	AtlasRasterInput,
	AtlasRasterPipeline,
	PublishFileSystem,
} from '../../publish/contracts.js';
import { type PublishOptions, publish } from '../../publish.js';
import { MAX_IMAGE_PIXELS } from './image-limits.js';
import { loadPlugins } from './plugins.js';

const importNative = new Function('id', 'return import(id)') as <T>(id: string) => Promise<T>;

interface NodePublishFileSystem extends PublishFileSystem {
	readFileRaw(path: string): Promise<Uint8Array>;
}

export interface PublishNodeResult {
	/** Files written through the publish filesystem or atlas writer; final absolute paths and byte sizes. */
	files: Array<{ path: string; size: number }>;
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
	/**
	 * Allow automatic discovery and execution of project plugins under `<projectDir>/plugins`.
	 * Ignored when `plugins` is explicitly supplied. Default: true.
	 */
	allowProjectPlugins?: boolean;
	atlas?: Omit<NonNullable<PublishOptions['atlas']>, 'readFileRaw'>;
}

async function createNodePublishFileSystem(files: Set<string>): Promise<NodePublishFileSystem> {
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
			files.add(path.resolve(filePath));
		},
		async mkdir(dirPath: string): Promise<void> {
			await fs.mkdir(dirPath, { recursive: true });
		},
		async readdir(dirPath: string): Promise<string[]> {
			return fs.readdir(dirPath);
		},
		async deleteFile(filePath: string): Promise<void> {
			await fs.rm(filePath, { force: true });
			files.delete(path.resolve(filePath));
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

function isPotentialSvgBytes(bytes: Uint8Array): boolean {
	let offset = 0;
	if (bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) offset = 3;
	while (
		offset < bytes.byteLength &&
		(bytes[offset] === 0x20 || bytes[offset] === 0x09 || bytes[offset] === 0x0a || bytes[offset] === 0x0d)
	) {
		offset += 1;
	}
	return offset < bytes.byteLength && bytes[offset] === 0x3c;
}

async function retryWindowsRename(fs: typeof import('node:fs/promises'), from: string, to: string): Promise<void> {
	for (let attempt = 0; ; attempt++) {
		try {
			await fs.rename(from, to);
			return;
		} catch (error) {
			const code = (error as NodeJS.ErrnoException | null)?.code;
			const transient = process.platform === 'win32' && ['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '');
			if (attempt >= 7 || !transient) throw error;
			await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** attempt));
		}
	}
}

const SAFE_W3C_SVG_PUBLIC_DOCTYPE =
	/<!DOCTYPE\s+svg\s+PUBLIC\s+"-\/\/W3C\/\/DTD SVG 1\.[01]\/\/EN"\s+"https?:\/\/www\.w3\.org\/Graphics\/SVG\/1\.[01]\/DTD\/svg1[01]\.dtd"\s*>/giu;
const EMPTY_SVG_STYLE_ELEMENT = /<style(?:\s+type\s*=\s*(?:"text\/css"|'text\/css'))?\s*(?:\/>|>\s*<\/style>)/giu;

function sanitizeSvgForNodeRaster(bytes: Uint8Array): Buffer {
	let source: string;
	try {
		source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		validateSafeSvgSource(bytes);
		return Buffer.from(bytes);
	}
	const stripped = source.replace(SAFE_W3C_SVG_PUBLIC_DOCTYPE, '').replace(EMPTY_SVG_STYLE_ELEMENT, '');
	const normalizedBytes = new TextEncoder().encode(stripped);
	validateSafeSvgSource(normalizedBytes);
	return Buffer.from(normalizedBytes);
}

async function loadSharpBackend(): Promise<AtlasRasterBackend | undefined> {
	try {
		const [loaded, fsSync] = await Promise.all([
			importNative<typeof import('sharp')>('sharp'),
			importNative<typeof import('node:fs')>('node:fs'),
		]);
		type RawSharp = (input: AtlasRasterInput, options?: { limitInputPixels?: number }) => AtlasRasterPipeline;
		const sharpModule = loaded as unknown as { default?: RawSharp };
		const rawSharp = sharpModule.default ?? (loaded as unknown as RawSharp);
		if (typeof rawSharp !== 'function') return undefined;
		return (input: AtlasRasterInput): AtlasRasterPipeline => {
			if (input instanceof Uint8Array) {
				const safeInput = isPotentialSvgBytes(input) ? sanitizeSvgForNodeRaster(input) : input;
				return rawSharp(safeInput, { limitInputPixels: MAX_IMAGE_PIXELS });
			}
			if (typeof input === 'string') {
				if (/\.svg$/i.test(input)) {
					const bytes = fsSync.readFileSync(input);
					const safeBytes = sanitizeSvgForNodeRaster(
						new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
					);
					return rawSharp(safeBytes, { limitInputPixels: MAX_IMAGE_PIXELS });
				}
				return rawSharp(input, { limitInputPixels: MAX_IMAGE_PIXELS });
			}
			return rawSharp(input);
		};
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

async function publishToStagedOutput(output: string, run: (staging: string) => Promise<void>): Promise<void> {
	const [fs, path, { randomUUID }] = await Promise.all([
		importNative<typeof import('node:fs/promises')>('node:fs/promises'),
		importNative<typeof import('node:path')>('node:path'),
		importNative<typeof import('node:crypto')>('node:crypto'),
	]);
	const target = path.resolve(output);
	const parent = path.dirname(target);
	const name = path.basename(target);
	if (parent === target || !name) {
		throw new Error(`publishNode: output must be a non-root directory: ${target}`);
	}
	const staging = path.join(parent, `.${name}.publish-${randomUUID()}`);
	const backup = path.join(parent, `.${name}.publish-backup-${randomUUID()}`);
	await fs.mkdir(parent, { recursive: true });
	let existed = false;
	try {
		const stat = await fs.lstat(target);
		if (stat.isSymbolicLink() || !stat.isDirectory())
			throw new Error(`publishNode: output must be a regular directory: ${target}`);
		await assertNoSymlinks(fs, path, target);
		existed = true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
	}
	try {
		if (existed) await fs.cp(target, staging, { recursive: true, errorOnExist: true, force: false });
		else await fs.mkdir(staging);
	} catch (error) {
		await fs.rm(staging, { recursive: true, force: true });
		throw error;
	}

	try {
		await run(staging);
	} catch (error) {
		await fs.rm(staging, { recursive: true, force: true });
		throw error;
	}
	if (!existed) {
		await retryWindowsRename(fs, staging, target);
		return;
	}

	// Two-step rename preserves rollback; use directory exchange if zero reader gap becomes required.
	await retryWindowsRename(fs, target, backup);
	try {
		await retryWindowsRename(fs, staging, target);
	} catch (commitError) {
		await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
		try {
			await retryWindowsRename(fs, backup, target);
		} catch (rollbackError) {
			throw new Error(
				`publishNode: Failed to commit "${target}" (${commitError instanceof Error ? commitError.message : String(commitError)}) and failed to roll back from "${backup}" (${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}). Previous output remains at "${backup}".`,
				{ cause: commitError },
			);
		}
		throw commitError;
	}
	await fs.rm(backup, { recursive: true, force: true }).catch(() => undefined);
}

async function assertNoSymlinks(
	fs: typeof import('node:fs/promises'),
	path: typeof import('node:path'),
	directory: string,
): Promise<void> {
	for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isSymbolicLink())
			throw new Error(`publishNode: symbolic links are not supported in output directories: ${entryPath}`);
		if (entry.isDirectory()) await assertNoSymlinks(fs, path, entryPath);
	}
}

/**
 * Publish a FairyGUI project through the standard Node host adapter.
 *
 * The adapter owns Node filesystem, Sharp, and project plugin discovery.
 * For custom environments, use the lower-level `publish()` core with explicit
 * capabilities instead.
 */
export async function publishNode(options: PublishNodeOptions): Promise<PublishNodeResult> {
	const {
		document,
		assetsPath: configuredAssetsPath,
		atlas,
		encoder: configuredEncoder,
		plugins: configuredPlugins,
		allowProjectPlugins = true,
		...publishOptions
	} = options;
	const files = new Set<string>();
	const [fs, path] = await Promise.all([
		importNative<typeof import('node:fs/promises')>('node:fs/promises'),
		importNative<typeof import('node:path')>('node:path'),
	]);
	const [fileSystem, assetsPath] = await Promise.all([
		createNodePublishFileSystem(files),
		resolveNodeAssetsPath(document, configuredAssetsPath),
	]);
	const [encoder, plugins] = await Promise.all([
		configuredEncoder === undefined ? loadSharpBackend() : Promise.resolve(configuredEncoder),
		configuredPlugins !== undefined
			? Promise.resolve(configuredPlugins)
			: allowProjectPlugins
				? loadNodePublishPlugins(document, assetsPath)
				: Promise.resolve([]),
	]);

	if (!encoder) {
		throw new Error('publishNode: Sharp is required for a complete publish. Install sharp or provide an encoder.');
	}

	const result: PublishNodeResult = { files: [] };
	const run = async (output: string | undefined): Promise<void> => {
		await document.transform(
			publish({
				...publishOptions,
				output,
				basePath: assetsPath,
				encoder,
				atlas: {
					...atlas,
					readFileRaw: fileSystem.readFileRaw,
					onFileWritten(file) {
						files.add(path.resolve(file));
						atlas?.onFileWritten?.(file);
					},
				},
				fs: fileSystem,
				plugins,
			}),
		);
		// Measure before commit so a failed manifest read also preserves the previous explicit output.
		result.files = await Promise.all(
			[...files].sort().map(async (file) => {
				const relative = output ? path.relative(output, file) : null;
				const staged =
					relative !== null &&
					relative !== '..' &&
					!relative.startsWith(`..${path.sep}`) &&
					!path.isAbsolute(relative);
				return {
					path: staged ? path.resolve(publishOptions.output!, relative) : file,
					size: (await fs.stat(file)).size,
				};
			}),
		);
	};
	if (publishOptions.output) {
		await publishToStagedOutput(publishOptions.output, run);
	} else {
		await run(undefined);
	}
	return result;
}
