import type { ProjectSettings, PublishSettings } from '@openfairygui/core';

export type { PublishFileSystem } from './publish/contracts.js';

export type ExtrasMap = Record<string, unknown>;

export interface CliCodeGenerationSettings extends NonNullable<PublishSettings['codeGeneration']> {
	allowGenCode?: boolean;
	classNamePrefix?: string;
	codePath?: string;
	codeType?: string;
	getMemberByName?: boolean;
	ignoreNoname?: boolean;
	memberNamePrefix?: string;
	packageName?: string;
}

export interface CliAtlasSettings extends NonNullable<PublishSettings['atlasSetting']> {
	maxSize?: number;
	paging?: boolean;
	sizeOption?: string;
	forceSquare?: boolean;
	fast?: boolean;
	allowRotation?: boolean;
	padding?: number;
	trimImage?: boolean;
	extractAlpha?: boolean;
}

export interface CliPublishSettings extends PublishSettings {
	atlasSetting?: CliAtlasSettings;
	codeGeneration?: CliCodeGenerationSettings;
}

export type RootProjectSettings = ProjectSettings & {
	publish?: CliPublishSettings;
};

export interface PublishDependency {
	id: string;
	name: string;
}

export interface PackagePublishArtifactsExtras extends ExtrasMap {
	publishedResourceIds?: string[];
	exportedResourceIds?: string[];
	publishedIncludeBranches?: boolean;
	publishedEffectiveResourceIds?: Record<string, string>;
}

export interface HasOptionalFont {
	getFont?(): string | string[] | null | undefined;
}

export interface HasOptionalSrc {
	getSrc?(): string | undefined;
}

export interface HasOptionalUrl {
	getUrl?(): string | undefined;
}
