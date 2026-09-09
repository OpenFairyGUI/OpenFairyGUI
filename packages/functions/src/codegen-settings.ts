import { type Document, type Package, ProjectType } from '@openfairygui/core';
import type { LoadedPlugin } from './plugins/types.js';
import { dirname, expandPathVariables, isAbsolutePathLike, trimTrailingSlashes } from './path-utils.js';
import type { PublishFileSystem } from './publish/contracts.js';
import type { CliCodeGenerationSettings, RootProjectSettings } from './shared-types.js';
import { normalizeTypeName } from './codegen-model.js';

const DEFAULT_CLASS_NAME_PREFIX = 'UI_';
const DEFAULT_MEMBER_NAME_PREFIX = 'm_';

export interface PublishCodeGenerationOptions {
	basePath?: string;
	fs: PublishFileSystem;
	packages: Package[];
	plugins?: LoadedPlugin[];
}

export interface ResolvedPackageCodegenPlan {
	outputDir: string;
	packageFolderName: string;
	packageNamespace: string;
	binderClassName: string;
	settings: Required<CliCodeGenerationSettings>;
}

export function resolveCodeGenerationSettings(doc: Document): Required<CliCodeGenerationSettings> {
	const settings = (doc.getRoot().getSettings?.() ?? {}) as RootProjectSettings;
	const publish = settings.publish ?? {};
	const codeGeneration = publish.codeGeneration as CliCodeGenerationSettings | undefined;

	if (!codeGeneration) {
		return {
			allowGenCode: true,
			classNamePrefix: 'UI_',
			memberNamePrefix: 'm_',
			packageName: '',
			ignoreNoname: false,
			getMemberByName: false,
			codePath: '',
			codeType: '',
		};
	}

	return {
		allowGenCode: codeGeneration.allowGenCode ?? true,
		classNamePrefix: codeGeneration.classNamePrefix ?? DEFAULT_CLASS_NAME_PREFIX,
		memberNamePrefix: codeGeneration.memberNamePrefix ?? DEFAULT_MEMBER_NAME_PREFIX,
		packageName: codeGeneration.packageName ?? '',
		ignoreNoname: codeGeneration.ignoreNoname ?? false,
		getMemberByName: Boolean(codeGeneration.getMemberByName),
		codePath: codeGeneration.codePath ?? '',
		codeType: codeGeneration.codeType?.trim() ?? '',
	};
}

export function resolvePackageCodegenPlan(
	pkg: Package, settings: Required<CliCodeGenerationSettings>, options: PublishCodeGenerationOptions,
	customProperties: Record<string, unknown> = {},
): ResolvedPackageCodegenPlan | null {
	const rawCodePath = expandPathVariables(pkg.getCodePath() || settings.codePath || '', customProperties).trim();
	if (!rawCodePath) return null;

	const packageFolderName = normalizeTypeName(pkg.getName()) || 'Package';
	const outputDir = resolveCodePath(rawCodePath, options.basePath, options.fs);
	const packageNamespace = settings.packageName
		? `${settings.packageName}.${packageFolderName}`
		: packageFolderName;

	return {
		outputDir,
		packageFolderName,
		packageNamespace,
		binderClassName: `${packageFolderName}Binder`,
		settings,
	};
}

export function supportsCodeGenerationLane(doc: Document, codeType: string): boolean {
	const projectType = doc.getRoot().getProjectType();
	if (projectType === ProjectType.Unity) return codeType === '';
	if (projectType === ProjectType.LayaBox || projectType === ProjectType.CocosCreator) return true;
	return false;
}

function resolveCodePath(
	codePath: string,
	basePath: string | undefined,
	fs: Pick<PublishFileSystem, 'join'>,
): string {
	if (isAbsolutePathLike(codePath)) return trimTrailingSlashes(codePath);
	const projectBasePath = resolveProjectBasePath(basePath);
	return projectBasePath ? trimTrailingSlashes(fs.join(projectBasePath, codePath)) : trimTrailingSlashes(codePath);
}

export function resolveProjectBasePath(basePath: string | undefined): string {
	if (!basePath) return '';
	const normalized = trimTrailingSlashes(basePath);
	const assetsMatch = normalized.match(/^(.*)[/\\]assets(?:_[^/\\]+)?$/i);
	if (assetsMatch?.[1]) return assetsMatch[1];
	return dirname(normalized);
}

