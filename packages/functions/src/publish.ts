import {
	BinaryWriter,
	type BinaryWriterOptions,
	type Document,
	type FileSystem,
	type MovieClipResource,
	type Package,
	type Transform,
} from '@openfairygui/core';
import { atlas } from './atlas.js';
import { prepareMovieClipResource } from './atlas/inputs.js';
import type { PreparedJtaData } from './atlas/jta.js';
import { publishCodeGeneration, resolveProjectBasePath } from './codegen.js';
import { dirname, isAbsolutePathLike, trimTrailingSlashes } from './path-utils.js';
import { formatPluginError, type LoadedPlugin } from './plugins/types.js';
import type { PublishFileSystem } from './publish/contracts.js';
import {
	annotatePackagePublishArtifacts,
	getAnnotatedPublishedResourceIds,
	isMovieClipResource,
} from './publish/package-context.js';
import {
	exportPackageExternalResources,
	exportPackageSounds,
} from './publish/external-resources.js';
import {
	resolvePublishAtlasRuntimeOptions,
	resolvePublishFileName,
	resolvePublishOptions,
	type PublishOptions,
	type ResolvedPublishAtlasOptions,
	type ResolvedPublishOptions,
} from './publish/options.js';
import { collectPackageResourceReferences } from './publish/resource-references.js';
import type { CliPublishSettings, RootProjectSettings } from './shared-types.js';
import { createTransform } from './utils.js';

export * from './publish/options.js';

interface ResolvedProjectPublishConfig extends ResolvedPublishOptions {
	projectType: number;
	includeBranches: boolean;
	activeBranch: string;
	includeHighResolution: number;
	separatedAtlasForBranch: boolean;
	globalOutputPath: string;
	globalBranchOutputPath: string;
}

interface ResolvedPackagePublishPlan {
	pkg: Package;
	outputDir?: string;
	publishName: string;
	fileName: string;
	compressed: boolean;
	fileExtension: string;
	includeBranches: boolean;
	activeBranch: string;
	includeHighResolution: number;
	separatedAtlasForBranch: boolean;
	atlas: ResolvedPublishAtlasOptions;
}

async function runPublishPluginHook(
	plugins: LoadedPlugin[],
	hook: 'onPublishStart' | 'onPublishEnd',
	doc: Document,
	options: PublishOptions,
): Promise<void> {
	const logger = doc.getLogger();
	for (const plugin of plugins) {
		const fn = plugin.plugin[hook];
		if (typeof fn !== 'function') continue;
		try {
			await fn(doc, options);
		} catch (error) {
			logger.warn(`publish: Plugin "${plugin.name}" ${hook} failed: ${formatPluginError(error)}`);
		}
	}
}

function joinPathSegments(left: string, right: string): string {
	const normalizedLeft = trimTrailingSlashes(left);
	const normalizedRight = right.replace(/^[/\\]+/, '');
	if (!normalizedLeft) return normalizedRight;
	if (!normalizedRight) return normalizedLeft;
	const separator = normalizedLeft.includes('\\') ? '\\' : '/';
	return `${normalizedLeft}${separator}${normalizedRight}`;
}

function createUnsupportedFsOperation(name: keyof FileSystem) {
	return async (): Promise<never> => {
		throw new Error(`publish: FileSystem.${name}() is not available in the publish writer adapter.`);
	};
}

function toBinaryWriterFileSystem(fs: PublishFileSystem): FileSystem {
	return {
		readFile: createUnsupportedFsOperation('readFile'),
		readFileRaw: createUnsupportedFsOperation('readFileRaw'),
		writeFile: createUnsupportedFsOperation('writeFile'),
		writeFileRaw: fs.writeFileRaw,
		mkdir: fs.mkdir,
		readdir: createUnsupportedFsOperation('readdir'),
		exists: createUnsupportedFsOperation('exists'),
		join: fs.join,
		dirname,
	};
}

/**
 * Publishes a FairyGUI project.
 *
 * Orchestrates:
 * 1. Atlas packing (MaxRects layout + optional raster compositing)
 * 2. Per-package .fui binary serialization
 * 3. File writing to the output directory
 *
 * This is the capability-injected core. Standard hosts should use
 * `publishNode()` or `publishBrowser()` through their dedicated entries.
 *
 * ```ts
 * import { NodeIO } from '@openfairygui/core/node';
 * import { publishNode } from '@openfairygui/functions/node';
 * const doc = await new NodeIO().readProject('./project.fairy');
 *
 * await publishNode({
 *   document: doc,
 *   output: './release/',
 *   compressed: true,
 *   assetsPath: './assets/',
 *   fileExtension: 'bytes',
 * });
 * ```
 */
export function publish(options: PublishOptions): Transform {
	return createTransform('publish', async (doc: Document): Promise<void> => {
		const resolveConfiguredOutputPath = (value?: string, projectBasePath?: string): string | undefined => {
			const trimmed = value?.trim();
			if (!trimmed) return undefined;
			if (isAbsolutePathLike(trimmed) || !projectBasePath) {
				return trimTrailingSlashes(trimmed);
			}
			return trimTrailingSlashes(
				options.fs ? options.fs.join(projectBasePath, trimmed) : joinPathSegments(projectBasePath, trimmed),
			);
		};

		const resolveProjectPublishConfig = (): ResolvedProjectPublishConfig => {
			const settings = (doc.getRoot().getSettings?.() ?? {}) as RootProjectSettings;
			const publishSettings: CliPublishSettings = settings.publish ?? {};
			const resolved = resolvePublishOptions(doc, {
				compressed: options.compressed,
				fileExtension: options.fileExtension,
				packages: options.packages,
				atlas: options.atlas,
			});
			const branchProcessing = publishSettings.branchProcessing ?? 0;
			const includeBranches = branchProcessing === 0;

			return {
				...resolved,
				projectType: doc.getRoot().getProjectType(),
				includeBranches,
				activeBranch: includeBranches ? '' : (options.branch ?? ''),
				includeHighResolution: publishSettings.includeHighResolution ?? 0,
				separatedAtlasForBranch: includeBranches && publishSettings.seperatedAtlasForBranch === true,
				globalOutputPath: publishSettings.path?.trim() ?? '',
				globalBranchOutputPath: publishSettings.branchPath?.trim() ?? '',
			};
		};

		const resolvePackagePublishPlan = (
			pkg: Package,
			config: ResolvedProjectPublishConfig,
			projectBasePath?: string,
		): ResolvedPackagePublishPlan => {
			let outputDir: string | undefined;

			if (options.output) {
				outputDir = trimTrailingSlashes(options.output);
			} else {
				const candidates: Array<string | undefined> = [];
				if (!config.includeBranches && config.activeBranch) {
					candidates.push(pkg.getPublishBranchPath(), config.globalBranchOutputPath);
				}
				candidates.push(pkg.getPublishPath(), config.globalOutputPath);

				for (const candidate of candidates) {
					const resolved = resolveConfiguredOutputPath(candidate, projectBasePath);
					if (!resolved) continue;
					outputDir = resolved;
					break;
				}
			}
			const publishName = pkg.getPublishName() || pkg.getName();

			return {
				pkg,
				outputDir,
				publishName,
				fileName: resolvePublishFileName(publishName, config.fileExtension),
				compressed: config.compressed,
				fileExtension: config.fileExtension,
				includeBranches: config.includeBranches,
				activeBranch: config.activeBranch,
				includeHighResolution: config.includeHighResolution,
				separatedAtlasForBranch: config.separatedAtlasForBranch,
				atlas: config.atlas,
			};
		};

		const createNoopPublishFs = (): PublishFileSystem => ({
			async writeFileRaw(): Promise<void> {
				// No-op for layout-only publish flows.
			},
			async mkdir(): Promise<void> {
				// No-op for layout-only publish flows.
			},
			join(...paths: string[]): string {
				return paths.join('/');
			},
		});

		const publishPackage = async (
			plan: ResolvedPackagePublishPlan,
			writerFs: FileSystem,
			packageIndex: number,
			preparedMovieClips?: ReadonlyMap<MovieClipResource, PreparedJtaData>,
		) => {
			if (options.fs && !plan.outputDir) {
				throw new Error(
					'publish: no output directory resolved. Provide --output, or configure global publish.path / package publishPath.',
				);
			}

			if (options.fs) {
				await options.fs.mkdir(plan.outputDir!);
				await exportPackageSounds(
					plan.pkg,
					plan.outputDir!,
					options.basePath,
					options.fs,
					options.atlas?.readFileRaw ?? options.fs.readFileRaw,
				);
				await exportPackageExternalResources(
					plan.pkg,
					plan.outputDir!,
					options.basePath,
					options.fs,
					options.atlas?.readFileRaw ?? options.fs.readFileRaw,
				);
			}

			const atlasRuntimeOptions = resolvePublishAtlasRuntimeOptions(plan.fileExtension);
			await atlas({
				...plan.atlas,
				...(options.atlas ?? {}),
				separatedAtlasForBranch: plan.separatedAtlasForBranch,
				encoder: options.encoder,
				basePath: options.basePath,
				outputPath: options.fs ? plan.outputDir : undefined,
				mkdir: options.fs ? options.fs.mkdir : undefined,
				readFileRaw: options.atlas?.readFileRaw ?? options.fs?.readFileRaw,
				strictOutput: options.fs !== undefined,
				preparedMovieClips,
				packages: [plan.pkg.getName()],
				...atlasRuntimeOptions,
			})(doc);

			if (!options.fs) return;

			const filePath = options.fs.join(plan.outputDir!, plan.fileName);
			const bwOptions: BinaryWriterOptions = {
				compressed: plan.compressed,
				packageIndex,
			};

			const bw = new BinaryWriter(writerFs);
			await bw.write(doc, filePath, bwOptions);

			logger.info(`publish: Written ${plan.fileName}`);
		};

		const root = doc.getRoot();
		const logger = doc.getLogger();
		const projectBasePath = resolveProjectBasePath(options.basePath) || doc.getProjectDir?.() || '';
		const plugins = options.plugins ?? [];
		await runPublishPluginHook(plugins, 'onPublishStart', doc, options);

		const resolved = resolveProjectPublishConfig();

		// Step 1: Determine which packages to publish
		let allPackages = root.listPackages();
		if (resolved.packages && resolved.packages.length > 0) {
			const names = new Set(resolved.packages);
			allPackages = allPackages.filter((p) => names.has(p.getName()));
		}

		if (allPackages.length === 0) {
			logger.warn('publish: No packages to publish.');
			await runPublishPluginHook(plugins, 'onPublishEnd', doc, options);
			return;
		}

		const allDocPackages = root.listPackages();
		// Build a pkgId→name map for dependency resolution
		const pkgMap = new Map<string, Package>();
		for (const p of allDocPackages) {
			pkgMap.set(p.getId(), p);
		}

		for (const pkg of allPackages) {
			// Compute dependency list and selected publish artifacts before atlas packing,
			// so merged-branch publishes can pack the overridden resources with main IDs.
			_computeDependencies(doc, pkg, pkgMap);
			await annotatePackagePublishArtifacts(pkg, options.basePath, options.encoder, {
				projectType: resolved.projectType,
				includeBranches: resolved.includeBranches,
				activeBranch: resolved.activeBranch,
				includeHighResolution: resolved.includeHighResolution,
			});
		}

		const plans = allPackages.map((pkg) => resolvePackagePublishPlan(pkg, resolved, projectBasePath));

		if (!options.fs) {
			const outputPlan = plans.find((plan) => !!plan.outputDir);
			if (outputPlan) {
				throw new Error(
					`publish: Output for package "${outputPlan.pkg.getName()}" requires a filesystem. ` +
						'Omit output and publish paths to run a layout-only transform.',
				);
			}
			logger.info(
				`publish: Layout computed for ${allPackages.length} package(s); no output directory was requested.`,
			);
			const noopWriterFs = toBinaryWriterFileSystem(createNoopPublishFs());
			for (const plan of plans) {
				await publishPackage(plan, noopWriterFs, allDocPackages.indexOf(plan.pkg));
			}
			await runPublishPluginHook(plugins, 'onPublishEnd', doc, options);
			return;
		}

		const unresolvedPlan = plans.find((plan) => !plan.outputDir);
		if (unresolvedPlan) {
			throw new Error(
				`publish: no output directory resolved for package "${unresolvedPlan.pkg.getName()}". ` +
					'Provide --output, or configure global publish.path / package publishPath.',
			);
		}

		// publishPackage starts with mkdir and loose-resource writes. Preflight the complete
		// selected MovieClip set first so a failure in a later package leaves zero output.
		const publishedMovieClips = allPackages.flatMap((pkg) => {
			const publishedResourceIds = getAnnotatedPublishedResourceIds(pkg);
			return pkg
				.listResources()
				.filter((resource): resource is MovieClipResource => {
					return publishedResourceIds.has(resource.getId()) && isMovieClipResource(resource);
				})
				.map((resource) => ({ pkg, resource }));
		});
		const preparedMovieClips = new Map<MovieClipResource, PreparedJtaData>();
		if (publishedMovieClips.length > 0) {
			if (!options.encoder) {
				throw new Error('publish: MovieClip output requires an encoder.');
			}
			if (!options.basePath) {
				throw new Error('publish: MovieClip output requires basePath.');
			}
			const readFileRaw = options.atlas?.readFileRaw ?? options.fs.readFileRaw;
			if (!readFileRaw) {
				throw new Error('publish: MovieClip output requires readFileRaw.');
			}

			for (const { pkg, resource } of publishedMovieClips) {
				preparedMovieClips.set(
					resource,
					await prepareMovieClipResource(resource, pkg, options.encoder, options.basePath, readFileRaw),
				);
			}
		}

		const writerFs = toBinaryWriterFileSystem(options.fs);

		for (const plan of plans) {
			const pkgIndex = allDocPackages.indexOf(plan.pkg);
			await publishPackage(plan, writerFs, pkgIndex, preparedMovieClips);
		}

		if (options.codeGeneration !== false) {
			await publishCodeGeneration(doc, {
				basePath: options.basePath,
				fs: options.fs,
				packages: allPackages,
				plugins,
			});
		}

		const publishedTargets = [
			...new Set(plans.map((plan) => plan.outputDir).filter((value): value is string => Boolean(value))),
		];
		logger.info(
			publishedTargets.length > 0
				? `publish: Published ${allPackages.length} package(s) to ${publishedTargets.join(', ')}`
				: `publish: Published ${allPackages.length} package(s)`,
		);
		await runPublishPluginHook(plugins, 'onPublishEnd', doc, options);
	});
}

/**
 * Scan component children for font="ui://..." references to build dependency list.
 * The editor only adds dependencies for packages referenced via bitmap font URLs.
 * @internal
 */
function _computeDependencies(doc: Document, pkg: Package, pkgMap: Map<string, Package>): void {
	const referencedPkgIds = collectPackageResourceReferences(pkg).packageIds;
	const packageOrder = new Map(
		doc
			.getRoot()
			.listPackages()
			.map((entry, index) => [entry.getId(), index] as const),
	);
	for (const dep of pkg.listDependencies()) {
		pkg.removeDependency(dep);
	}

	if (referencedPkgIds.size > 0) {
		const sortedIds = [...referencedPkgIds].sort((a, b) => {
			const orderA = packageOrder.get(a) ?? Number.MAX_SAFE_INTEGER;
			const orderB = packageOrder.get(b) ?? Number.MAX_SAFE_INTEGER;
			if (orderA !== orderB) return orderA - orderB;
			return a.localeCompare(b);
		});
		for (const refId of sortedIds) {
			const depPkg = pkgMap.get(refId);
			if (depPkg) {
				pkg.addDependency(depPkg);
			}
		}
	}
}
