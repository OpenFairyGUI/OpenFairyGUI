import { type Document, ProjectType } from '@openfairygui/core';
import type { AtlasOptions } from '../atlas.js';
import type { LoadedPlugin } from '../plugins/types.js';
import type { CliPublishSettings, RootProjectSettings } from '../shared-types.js';
import type { AtlasRasterBackend, PublishFileSystem } from './contracts.js';

export interface PublishOptions {
	/**
	 * Output directory override for published files (.fui + atlas PNGs).
	 * When omitted, publish uses package-level or project-level publish paths.
	 */
	output?: string;

	/**
	 * Compress the binary data with zlib raw deflate. Default: false.
	 */
	compressed?: boolean;

	/**
	 * File extension for the binary output. Default: 'fui'.
	 * Unity projects typically use 'bytes'.
	 */
	fileExtension?: string;

	/**
	 * Raster backend for atlas image compositing.
	 * Required when a filesystem-backed publish has packable resources.
	 * Without a filesystem, publish remains an explicit layout-only transform.
	 */
	encoder?: AtlasRasterBackend;

	/**
	 * Base path for reading source images (project assets root).
	 * Required when encoder is provided.
	 */
	basePath?: string;

	/**
	 * Atlas packing options.
	 */
	atlas?: Omit<AtlasOptions, 'encoder' | 'basePath' | 'outputPath'>;

	/**
	 * Filter which packages to publish by name. If not set, all packages are published.
	 */
	packages?: string[];

	/**
	 * FileSystem abstraction for writing output files.
	 * Required for actual file output. Calling publish with a resolved output
	 * directory but no filesystem is rejected; omit output entirely for a
	 * layout-only transform.
	 */
	fs?: PublishFileSystem;

	/**
	 * Active branch name used when branchProcessing is "主干合并活跃分支".
	 * Empty or omitted means publishing the main branch.
	 */
	branch?: string;

	/**
	 * Publish hooks supplied by the host adapter.
	 *
	 * Node adapters load project plugins. Browser adapters pass an empty list.
	 */
	plugins?: LoadedPlugin[];

	/**
	 * Run generic code generation after runtime artifacts. Default: true.
	 */
	codeGeneration?: boolean;
}

export interface ResolvedPublishAtlasOptions
	extends Pick<
		AtlasOptions,
		| 'maxSize'
		| 'fast'
		| 'allowRotation'
		| 'padding'
		| 'powerOfTwo'
		| 'square'
		| 'multiPage'
		| 'trimImage'
		| 'extractAlpha'
	> {}

export interface ResolvePublishOptionsOverrides {
	/** Select a target profile between direct overrides and persisted project settings. */
	targetProjectType?: number;
	compressed?: boolean;
	fileExtension?: string;
	packages?: string[];
	atlas?: Partial<ResolvedPublishAtlasOptions>;
}

export interface ResolvedPublishOptions {
	compressed: boolean;
	fileExtension: string;
	packages?: string[];
	atlas: ResolvedPublishAtlasOptions;
}

const UNITY_PROJECT_TYPE = ProjectType.Unity;
const COCOS_CREATOR_PROJECT_TYPE = ProjectType.CocosCreator;

function resolveDefaultPublishFileExtension(projectType: number, publishSettings: CliPublishSettings): string {
	if (projectType === UNITY_PROJECT_TYPE) {
		return 'bytes';
	}
	if (projectType === COCOS_CREATOR_PROJECT_TYPE) {
		return publishSettings.fileExtension || 'bin';
	}
	// publish() is currently a binary forward-publish path. For non-Unity projects,
	// keep the emitted contract driven by the configured extension, falling back to
	// `fui`, which intentionally covers the shared generic binary contract outside
	// Unity and the Creator-specific default-to-bin rule.
	return publishSettings.fileExtension || 'fui';
}

export interface PublishAtlasRuntimeOptions {
	preserveInputOrderOnTie: boolean;
	directSingleImageOutput: boolean;
}

export function resolvePublishAtlasRuntimeOptions(fileExtension: string): PublishAtlasRuntimeOptions {
	return {
		preserveInputOrderOnTie: fileExtension === 'fui',
		directSingleImageOutput: fileExtension === 'bytes',
	};
}

export function resolvePublishFileName(publishName: string, fileExtension: string): string {
	if (fileExtension === 'bytes') {
		return `${publishName}_fui.bytes`;
	}
	return `${publishName}.${fileExtension}`;
}

/**
 * Resolve publish defaults from the document's project settings.
 *
 * This keeps the editor-aligned publish rules reusable across environments,
 * while callers still provide environment-specific concerns such as fs/encoder/basePath.
 */
export function resolvePublishOptions(
	doc: Document,
	overrides: ResolvePublishOptionsOverrides = {},
): ResolvedPublishOptions {
	const root = doc.getRoot();
	const settings = (root.getSettings?.() ?? {}) as RootProjectSettings;
	const publishSettings: CliPublishSettings = settings.publish ?? {};
	const atlasSetting = publishSettings.atlasSetting ?? {};
	const projectType = overrides.targetProjectType ?? root.getProjectType();
	const explicitLayaboxTarget = overrides.targetProjectType === ProjectType.LayaBox;

	const fileExtension =
		overrides.fileExtension ??
		(explicitLayaboxTarget ? 'fui' : resolveDefaultPublishFileExtension(projectType, publishSettings));

	const runtimeRejectsCompression =
		projectType === UNITY_PROJECT_TYPE || projectType === COCOS_CREATOR_PROJECT_TYPE;
	if (runtimeRejectsCompression && overrides.compressed === true) {
		throw new Error('publish: The selected target runtime does not support compressed package data.');
	}
	const compressed = runtimeRejectsCompression
		? false
		: (overrides.compressed ?? publishSettings.compressDesc ?? false);

	const atlasOptions: ResolvedPublishAtlasOptions = {
		maxSize: overrides.atlas?.maxSize ?? atlasSetting.maxSize ?? 2048,
		fast: overrides.atlas?.fast ?? atlasSetting.fast ?? true,
		allowRotation:
			overrides.atlas?.allowRotation ?? (explicitLayaboxTarget ? false : (atlasSetting.allowRotation ?? false)),
		padding: overrides.atlas?.padding ?? atlasSetting.padding ?? 2,
		powerOfTwo: overrides.atlas?.powerOfTwo ?? atlasSetting.sizeOption === 'pot',
		square: overrides.atlas?.square ?? atlasSetting.forceSquare ?? false,
		multiPage: overrides.atlas?.multiPage ?? atlasSetting.paging ?? true,
		trimImage: overrides.atlas?.trimImage ?? atlasSetting.trimImage ?? false,
		extractAlpha: overrides.atlas?.extractAlpha ?? atlasSetting.extractAlpha ?? false,
	};

	return {
		compressed,
		fileExtension,
		packages: overrides.packages,
		atlas: atlasOptions,
	};
}
